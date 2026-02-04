/**
 * OpenAI Batch API Types for Preference Analysis
 */

/**
 * Batch Job Type
 */
export enum BatchJobType {
  PREFERENCE_ANALYSIS = 'PREFERENCE_ANALYSIS',
}

/**
 * Batch Job Status
 */
export enum BatchJobStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

/**
 * OpenAI Batch API Status (from OpenAI)
 */
export type OpenAiBatchStatus =
  | 'validating'
  | 'failed'
  | 'in_progress'
  | 'finalizing'
  | 'completed'
  | 'expired'
  | 'cancelling'
  | 'cancelled';

/**
 * JSONL Request format for Batch API
 */
export interface BatchRequest {
  custom_id: string;
  method: 'POST';
  url: '/v1/chat/completions';
  body: {
    model: string;
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
    max_completion_tokens?: number;
    response_format?: {
      type: 'json_schema';
      json_schema: {
        name: string;
        strict?: boolean;
        schema: Record<string, unknown>;
      };
    };
  };
}

/**
 * JSONL Response format from Batch API
 */
export interface BatchResponse {
  id: string;
  custom_id: string;
  response: {
    status_code: number;
    body: {
      id: string;
      object: 'chat.completion';
      created: number;
      model: string;
      choices: Array<{
        index: number;
        message: {
          role: 'assistant';
          content: string | null;
        };
        finish_reason: 'stop' | 'length' | 'content_filter' | null;
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };
  } | null;
  error: {
    code: string;
    message: string;
  } | null;
}

/**
 * Batch status result from OpenAI
 */
export interface BatchStatusResult {
  status: OpenAiBatchStatus;
  outputFileId?: string;
  errorFileId?: string;
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
}

/**
 * Batch error entry
 */
export interface BatchError {
  customId: string;
  code: string;
  message: string;
}

/**
 * Preference batch request for building JSONL
 */
export interface PreferenceBatchRequest {
  customId: string; // Format: "pref_{userId}_{selectionIds}"
  userId: number;
  selectionIds: number[];
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Batch result error details
 */
export interface BatchResultError {
  customId: string;
  reason: 'invalid_status_code' | 'null_content' | 'parse_error' | 'api_error';
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Download results response with both successful results and errors
 */
export interface DownloadResultsResponse {
  results: Map<string, string>;
  errors: BatchResultError[];
}
