import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { User } from '@/user/entities/user.entity';
import { UserTasteAnalysis } from '@/user/entities/user-taste-analysis.entity';
import { UserService } from '@/user/user.service';
import {
  defaultUserPreferences,
  UserPreferences,
} from '@/user/interfaces/user-preferences.interface';
import { BATCH_CONFIG } from '@/common/constants/business.constants';
import { BatchJob } from '../entities/batch-job.entity';
import { BatchError } from '../types/preference-batch.types';
import { PreferenceAnalysisResult } from '../interfaces/preference-batch.interface';

@Injectable()
export class PreferenceBatchResultProcessorService {
  private readonly logger = new Logger(
    PreferenceBatchResultProcessorService.name,
  );

  constructor(
    @InjectRepository(MenuSelection)
    private readonly menuSelectionRepository: Repository<MenuSelection>,
    private readonly dataSource: DataSource,
    private readonly userService: UserService,
  ) {}

  /**
   * Process results from a completed batch
   */
  async processResults(
    results: Map<string, string>,
    batchJob: BatchJob,
  ): Promise<void> {
    this.logger.log(
      `Processing ${results.size} results for batch job ${batchJob.id}`,
    );

    let successCount = 0;
    let failCount = 0;

    const entries = Array.from(results.entries());
    const chunkSize = BATCH_CONFIG.RESULT_CHUNK_SIZE;

    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      this.logger.log(
        `Processing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(entries.length / chunkSize)} (${chunk.length} items)`,
      );

      for (const [customId, content] of chunk) {
        try {
          const parsed = this.parseCustomId(customId);
          if (!parsed) {
            this.logger.warn(`Invalid custom_id format: ${customId}`);
            failCount++;
            continue;
          }

          const response = JSON.parse(content) as PreferenceAnalysisResult;
          if (!response.analysis || typeof response.analysis !== 'string') {
            this.logger.warn(`Invalid response format for ${customId}`);
            failCount++;
            await this.markSelectionsFailedByIds(parsed.selectionIds);
            continue;
          }

          let user: User | null;
          try {
            user = await this.userService.findOne(parsed.userId);
          } catch {
            this.logger.warn(
              `User ${parsed.userId} not found for ${customId} - marking selections as failed`,
            );
            failCount++;
            await this.markSelectionsFailedByIds(parsed.selectionIds);
            continue;
          }

          const queryRunner = this.dataSource.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.startTransaction();

          try {
            const manager = queryRunner.manager;

            const currentPreferences: UserPreferences =
              user.preferences ?? defaultUserPreferences();
            const updatedPreferences: UserPreferences = {
              likes: currentPreferences.likes,
              dislikes: currentPreferences.dislikes,
              analysis: response.analysis.trim(),
              structuredAnalysis: currentPreferences.structuredAnalysis,
              lastAnalyzedAt: new Date().toISOString(),
              analysisVersion: (currentPreferences.analysisVersion || 0) + 1,
            };
            await manager.update(
              User,
              { id: parsed.userId },
              { preferences: updatedPreferences },
            );

            const existingAnalysis = await manager.findOne(UserTasteAnalysis, {
              where: { userId: parsed.userId },
            });
            if (existingAnalysis) {
              await manager.update(
                UserTasteAnalysis,
                { id: existingAnalysis.id },
                {
                  stablePatterns: response.stablePatterns ?? null,
                  recentSignals: response.recentSignals ?? null,
                  diversityHints: response.diversityHints ?? null,
                  compactSummary: response.compactSummary?.trim() ?? null,
                  analysisParagraphs: response.analysisParagraphs ?? null,
                  lastAnalyzedAt: new Date(),
                  analysisVersion: (existingAnalysis.analysisVersion ?? 0) + 1,
                },
              );
            } else {
              await manager.save(
                UserTasteAnalysis,
                manager.create(UserTasteAnalysis, {
                  userId: parsed.userId,
                  stablePatterns: response.stablePatterns ?? null,
                  recentSignals: response.recentSignals ?? null,
                  diversityHints: response.diversityHints ?? null,
                  compactSummary: response.compactSummary?.trim() ?? null,
                  analysisParagraphs: response.analysisParagraphs ?? null,
                  lastAnalyzedAt: new Date(),
                  analysisVersion: 1,
                }),
              );
            }

            await manager.update(
              MenuSelection,
              { id: In(parsed.selectionIds) },
              { status: MenuSelectionStatus.SUCCEEDED },
            );

            await queryRunner.commitTransaction();
            successCount++;
          } catch (txError) {
            await queryRunner.rollbackTransaction();
            this.logger.error(
              `Transaction failed for ${customId}: ${txError instanceof Error ? txError.message : 'Unknown error'}`,
            );
            failCount++;

            try {
              await this.markSelectionsFailedByIds(parsed.selectionIds);
            } catch (failMarkError) {
              this.logger.error(
                `Failed to mark selections as failed after rollback for ${customId}: ${failMarkError instanceof Error ? failMarkError.message : 'Unknown error'}`,
              );
            }
          } finally {
            await queryRunner.release();
          }
        } catch (error) {
          this.logger.error(
            `Error processing result for ${customId || 'unknown'}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          failCount++;

          if (customId) {
            const parsed = this.parseCustomId(customId);
            if (parsed) {
              await this.markSelectionsFailedByIds(parsed.selectionIds);
            } else {
              this.logger.error(
                `Failed to parse customId ${customId} - cannot mark selections as failed`,
              );
            }
          } else {
            this.logger.error(
              'customId is missing in catch block - cannot mark selections as failed',
            );
          }
        }
      }
    }

    this.logger.log(
      `Batch ${batchJob.id} results processed: ${successCount} success, ${failCount} failed`,
    );
  }

  /**
   * Process errors from a batch
   */
  async processErrors(errors: BatchError[], batchJob: BatchJob): Promise<void> {
    this.logger.log(
      `Processing ${errors.length} errors for batch job ${batchJob.id}`,
    );

    for (const error of errors) {
      const parsed = this.parseCustomId(error.customId);
      if (!parsed) continue;

      await this.markSelectionsFailedByIds(parsed.selectionIds);
      this.logger.warn(
        `Batch error for user ${parsed.userId}: ${error.code} - ${error.message}`,
      );
    }
  }

  async markSelectionsBatchProcessing(
    selections: MenuSelection[],
    batchJobId: number,
  ): Promise<void> {
    if (selections.length === 0) return;

    const ids = selections.map((s) => s.id);
    await this.menuSelectionRepository.update(ids, {
      status: MenuSelectionStatus.BATCH_PROCESSING,
      batchJobId,
    });
  }

  async markSelectionsSucceeded(selections: MenuSelection[]): Promise<void> {
    if (selections.length === 0) return;

    const ids = selections.map((s) => s.id);
    await this.menuSelectionRepository.update(ids, {
      status: MenuSelectionStatus.SUCCEEDED,
    });
  }

  async incrementRetryCount(selections: MenuSelection[]): Promise<void> {
    if (selections.length === 0) return;

    const ids = selections.map((s) => s.id);

    await this.menuSelectionRepository
      .createQueryBuilder()
      .update(MenuSelection)
      .set({ retryCount: () => '"retryCount" + 1' })
      .whereInIds(ids)
      .execute();
  }

  private async markSelectionsFailedByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;

    await this.menuSelectionRepository.update(ids, {
      status: MenuSelectionStatus.FAILED,
    });
  }

  parseCustomId(
    customId: string,
  ): { userId: number; selectionIds: number[] } | null {
    const match = customId.match(/^pref_(\d+)_(.+)$/);
    if (!match) return null;

    const userId = parseInt(match[1], 10);
    const selectionIds = match[2].split(',').map((id) => parseInt(id, 10));

    if (isNaN(userId) || selectionIds.some(isNaN)) return null;

    return { userId, selectionIds };
  }
}
