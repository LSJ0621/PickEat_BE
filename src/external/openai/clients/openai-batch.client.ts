import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import {
  BatchRequest,
  BatchResponse,
  BatchStatusResult,
  BatchError,
  OpenAiBatchStatus,
  DownloadResultsResponse,
  BatchResultError,
} from '@/batch/types/preference-batch.types';

/**
 * OpenAI Batch API Client
 *
 * Handles all interactions with OpenAI's Batch API for preference analysis.
 * Uses memory-based JSONL creation for serverless compatibility.
 */
@Injectable()
export class OpenAiBatchClient implements OnModuleInit {
  private readonly logger = new Logger(OpenAiBatchClient.name);
  private openai: OpenAI | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not configured');
      return;
    }
    this.openai = new OpenAI({ apiKey });
    this.logger.log('✅ OpenAI Batch Client initialized');
  }

  /**
   * Create JSONL content from batch requests (memory-based, no file I/O)
   */
  createBatchContent(requests: BatchRequest[]): string {
    return requests.map((req) => JSON.stringify(req)).join('\n');
  }

  /**
   * Upload JSONL content to OpenAI
   * @returns File ID (file_xxx)
   */
  async uploadBatchContent(content: string): Promise<string> {
    this.ensureClient();

    // Convert string to Buffer and use OpenAI SDK's toFile helper
    const buffer = Buffer.from(content, 'utf-8');
    const filename = `batch_${Date.now()}.jsonl`;

    // Use OpenAI's toFile helper for proper Node.js compatibility
    const file = await toFile(buffer, filename);

    const uploadedFile = await this.openai!.files.create({
      file,
      purpose: 'batch',
    });

    this.logger.log(`Uploaded batch file: ${uploadedFile.id}`);
    return uploadedFile.id;
  }

  /**
   * Create a batch job
   * @returns Batch ID (batch_xxx)
   */
  async createBatch(
    inputFileId: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    this.ensureClient();

    const batch = await this.openai!.batches.create({
      input_file_id: inputFileId,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
      metadata: {
        created_at: new Date().toISOString(),
        ...metadata,
      },
    });

    this.logger.log(`Created batch: ${batch.id}`);
    return batch.id;
  }

  /**
   * Get batch status from OpenAI
   */
  async getBatchStatus(batchId: string): Promise<BatchStatusResult> {
    this.ensureClient();

    const batch = await this.openai!.batches.retrieve(batchId);

    return {
      status: batch.status as OpenAiBatchStatus,
      outputFileId: batch.output_file_id ?? undefined,
      errorFileId: batch.error_file_id ?? undefined,
      progress: {
        total: batch.request_counts?.total ?? 0,
        completed: batch.request_counts?.completed ?? 0,
        failed: batch.request_counts?.failed ?? 0,
      },
    };
  }

  /**
   * Download and parse results from output file
   * @returns Results and errors separately for proper error handling
   */
  async downloadResults(
    outputFileId: string,
  ): Promise<DownloadResultsResponse> {
    this.ensureClient();

    const response = await this.openai!.files.content(outputFileId);
    const text = await response.text();

    const results = new Map<string, string>();
    const errors: BatchResultError[] = [];

    for (const line of text.split('\n')) {
      if (!line.trim()) continue;

      try {
        const parsed: BatchResponse = JSON.parse(line) as BatchResponse;

        // Check for API errors first
        if (parsed.error) {
          errors.push({
            customId: parsed.custom_id,
            reason: 'api_error',
            errorCode: parsed.error.code,
            errorMessage: parsed.error.message,
          });
          this.logger.error(
            `API error for ${parsed.custom_id}: ${parsed.error.message}`,
          );
          continue;
        }

        // Check response status code
        if (parsed.response?.status_code !== 200) {
          errors.push({
            customId: parsed.custom_id,
            reason: 'invalid_status_code',
            statusCode: parsed.response?.status_code,
          });
          this.logger.error(
            `Invalid status code for ${parsed.custom_id}: ${parsed.response?.status_code}`,
          );
          continue;
        }

        // Check for null or missing content
        const content = parsed.response?.body?.choices?.[0]?.message?.content;
        if (!content) {
          errors.push({
            customId: parsed.custom_id,
            reason: 'null_content',
          });
          this.logger.error(`Null content for ${parsed.custom_id}`);
          continue;
        }

        // Success case
        results.set(parsed.custom_id, content);
      } catch (error) {
        const truncatedLine = line.substring(0, 100);
        errors.push({
          customId: 'unknown',
          reason: 'parse_error',
          errorMessage: `Failed to parse line: ${truncatedLine}...`,
        });
        this.logger.error(
          `Failed to parse result line: ${truncatedLine}... (${error instanceof Error ? error.message : 'Unknown error'})`,
        );
      }
    }

    this.logger.log(
      `Downloaded ${results.size} results and ${errors.length} errors from ${outputFileId}`,
    );
    return { results, errors };
  }

  /**
   * Download and parse errors from error file
   */
  async downloadErrors(errorFileId: string): Promise<BatchError[]> {
    this.ensureClient();

    const response = await this.openai!.files.content(errorFileId);
    const text = await response.text();

    const errors: BatchError[] = [];

    for (const line of text.split('\n')) {
      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line) as BatchResponse;
        errors.push({
          customId: parsed.custom_id,
          code: parsed.error?.code ?? 'unknown',
          message: parsed.error?.message ?? 'Unknown error',
        });
      } catch {
        // Skip invalid lines
      }
    }

    this.logger.log(`Downloaded ${errors.length} errors from ${errorFileId}`);
    return errors;
  }

  /**
   * Cancel a batch
   */
  async cancelBatch(batchId: string): Promise<void> {
    this.ensureClient();
    await this.openai!.batches.cancel(batchId);
    this.logger.log(`Cancelled batch: ${batchId}`);
  }

  /**
   * Check if client is ready
   */
  isReady(): boolean {
    return this.openai !== null;
  }

  /**
   * Ensure OpenAI client is initialized
   */
  private ensureClient(): void {
    if (!this.openai) {
      throw new Error(
        'OpenAI client is not initialized. Check OPENAI_API_KEY.',
      );
    }
  }
}
