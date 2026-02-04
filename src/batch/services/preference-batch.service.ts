import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThan, In } from 'typeorm';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { User } from '@/user/entities/user.entity';
import { UserService } from '@/user/user.service';
import { UserTasteAnalysisService } from '@/user/services/user-taste-analysis.service';
import {
  normalizeMenuPayload,
  normalizeMenuName,
} from '@/menu/menu-payload.util';
import {
  buildPreferenceUserPrompt,
  getPreferenceSystemPrompt,
  getPreferenceResponseSchema,
  SelectionStatistics,
} from '@/external/openai/prompts';
import { OPENAI_CONFIG } from '@/external/openai/openai.constants';
import { OpenAiBatchClient } from '@/external/openai/clients/openai-batch.client';
import { BatchJob } from '../entities/batch-job.entity';
import { BatchJobService } from './batch-job.service';
import {
  BatchJobStatus,
  BatchJobType,
  BatchRequest,
  PreferenceBatchRequest,
  BatchError,
} from '../types/preference-batch.types';

interface UserSelectionGroup {
  user: User;
  selections: MenuSelection[];
  slotMenus: {
    breakfast: string[];
    lunch: string[];
    dinner: string[];
    etc: string[];
  };
}

interface PreferenceAnalysisResult {
  analysis: string;
  compactSummary: string;
  analysisParagraphs?: {
    paragraph1: string;
    paragraph2: string;
    paragraph3: string;
  };
  stablePatterns?: {
    categories: string[];
    flavors: string[];
    cookingMethods: string[];
    confidence: 'low' | 'medium' | 'high';
  };
  recentSignals?: {
    trending: string[];
    declining: string[];
  };
  diversityHints?: {
    explorationAreas: string[];
    rotationSuggestions: string[];
  };
}

@Injectable()
export class PreferenceBatchService {
  private readonly logger = new Logger(PreferenceBatchService.name);
  private readonly MAX_BATCH_SIZE = 500; // OpenAI limit is higher, but we batch conservatively

  constructor(
    @InjectRepository(MenuSelection)
    private readonly menuSelectionRepository: Repository<MenuSelection>,
    private readonly userService: UserService,
    private readonly userTasteAnalysisService: UserTasteAnalysisService,
    private readonly batchJobService: BatchJobService,
    private readonly openAiBatchClient: OpenAiBatchClient,
  ) {}

  /**
   * Collect PENDING selections and group by user
   */
  async collectPendingSelections(): Promise<UserSelectionGroup[]> {
    const pending = await this.menuSelectionRepository.find({
      where: { status: MenuSelectionStatus.PENDING },
      relations: ['user'],
      order: { selectedAt: 'ASC' },
      take: this.MAX_BATCH_SIZE,
    });

    if (pending.length === 0) {
      return [];
    }

    // Group by user
    const userMap = new Map<number, UserSelectionGroup>();

    for (const selection of pending) {
      if (!selection.user) continue;

      const userId = selection.user.id;

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          user: selection.user,
          selections: [],
          slotMenus: {
            breakfast: [],
            lunch: [],
            dinner: [],
            etc: [],
          },
        });
      }

      const group = userMap.get(userId)!;
      group.selections.push(selection);

      // Extract and normalize menu names
      const payload = normalizeMenuPayload(selection.menuPayload);
      group.slotMenus.breakfast.push(
        ...payload.breakfast.map(normalizeMenuName).filter(Boolean),
      );
      group.slotMenus.lunch.push(
        ...payload.lunch.map(normalizeMenuName).filter(Boolean),
      );
      group.slotMenus.dinner.push(
        ...payload.dinner.map(normalizeMenuName).filter(Boolean),
      );
      group.slotMenus.etc.push(
        ...payload.etc.map(normalizeMenuName).filter(Boolean),
      );
    }

    // Deduplicate menus per user
    for (const group of userMap.values()) {
      group.slotMenus.breakfast = [...new Set(group.slotMenus.breakfast)];
      group.slotMenus.lunch = [...new Set(group.slotMenus.lunch)];
      group.slotMenus.dinner = [...new Set(group.slotMenus.dinner)];
      group.slotMenus.etc = [...new Set(group.slotMenus.etc)];
    }

    return Array.from(userMap.values());
  }

  /**
   * 사용자의 총 선택 일수 계산
   */
  private async countDistinctSelectionDays(userId: number): Promise<number> {
    const result = await this.menuSelectionRepository
      .createQueryBuilder('ms')
      .select('COUNT(DISTINCT ms.selectedDate)', 'count')
      .where('ms.userId = :userId', { userId })
      .andWhere('ms.status = :status', {
        status: MenuSelectionStatus.SUCCEEDED,
      })
      .getRawOne();
    return parseInt(result?.count || '0', 10);
  }

  /**
   * 최근 N일간 선택 내역 조회
   */
  private async getSelectionsInDays(
    userId: number,
    days: number,
  ): Promise<MenuSelection[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromDateStr = fromDate.toISOString().split('T')[0];

    return this.menuSelectionRepository.find({
      where: {
        user: { id: userId },
        selectedDate: MoreThanOrEqual(fromDateStr),
        status: In([
          MenuSelectionStatus.SUCCEEDED,
          MenuSelectionStatus.PENDING,
          MenuSelectionStatus.BATCH_PROCESSING,
        ]),
      },
      order: { selectedDate: 'DESC' },
    });
  }

  /**
   * 선택 내역에서 반복 메뉴 찾기
   */
  private findRepeatedMenus(
    selections: MenuSelection[],
  ): Array<{ menu: string; count: number }> {
    const menuCount = new Map<string, number>();

    for (const selection of selections) {
      const payload = normalizeMenuPayload(selection.menuPayload);
      const allMenus = [
        ...payload.breakfast,
        ...payload.lunch,
        ...payload.dinner,
        ...payload.etc,
      ];

      // 하루에 같은 메뉴가 있어도 1회로 카운트 (날짜 기준)
      const uniqueMenusToday = new Set(allMenus);
      for (const menu of uniqueMenusToday) {
        menuCount.set(menu, (menuCount.get(menu) || 0) + 1);
      }
    }

    // 2회 이상만 반환
    return Array.from(menuCount.entries())
      .filter(([_, count]) => count >= 2)
      .map(([menu, count]) => ({ menu, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 새로운 시도 찾기 (최근 7일에만 있고 이전에 없던 메뉴)
   */
  private async findNewTrials(
    recentSelections: MenuSelection[],
    userId: number,
  ): Promise<string[]> {
    if (recentSelections.length === 0) return [];

    // 최근 7일 이전의 모든 메뉴 조회
    const oldestRecentDate =
      recentSelections[recentSelections.length - 1]?.selectedDate;
    const olderSelections = await this.menuSelectionRepository.find({
      where: {
        user: { id: userId },
        selectedDate: LessThan(oldestRecentDate),
        status: MenuSelectionStatus.SUCCEEDED,
      },
    });

    const olderMenus = new Set<string>();
    for (const sel of olderSelections) {
      const payload = normalizeMenuPayload(sel.menuPayload);
      [
        ...payload.breakfast,
        ...payload.lunch,
        ...payload.dinner,
        ...payload.etc,
      ].forEach((m) => olderMenus.add(m));
    }

    const recentMenus = new Set<string>();
    for (const sel of recentSelections) {
      const payload = normalizeMenuPayload(sel.menuPayload);
      [
        ...payload.breakfast,
        ...payload.lunch,
        ...payload.dinner,
        ...payload.etc,
      ].forEach((m) => recentMenus.add(m));
    }

    // 최근에만 있고 과거에 없는 메뉴
    return Array.from(recentMenus).filter((m) => !olderMenus.has(m));
  }

  /**
   * 사용자의 선택 통계 계산
   */
  private async calculateStatistics(
    userId: number,
  ): Promise<SelectionStatistics> {
    const totalDays = await this.countDistinctSelectionDays(userId);
    const recentSelections = await this.getSelectionsInDays(userId, 7);
    const recentRepeats = this.findRepeatedMenus(recentSelections);
    const newTrials = await this.findNewTrials(recentSelections, userId);

    return {
      totalDays,
      recentRepeats,
      newTrials,
    };
  }

  /**
   * Build batch requests from user selection groups
   */
  async buildBatchRequests(
    groups: UserSelectionGroup[],
  ): Promise<PreferenceBatchRequest[]> {
    const requests: PreferenceBatchRequest[] = [];

    for (const group of groups) {
      const totalMenus =
        group.slotMenus.breakfast.length +
        group.slotMenus.lunch.length +
        group.slotMenus.dinner.length +
        group.slotMenus.etc.length;

      // Skip if no menus
      if (totalMenus === 0) {
        continue;
      }

      // Get user preferences
      const preferences = await this.userService.getEntityPreferences(
        group.user,
      );
      const language = this.mapPreferredLanguage(group.user.preferredLanguage);

      // Calculate statistics
      const statistics = await this.calculateStatistics(group.user.id);

      // Build prompts (reusing existing prompt builders)
      const systemPrompt = getPreferenceSystemPrompt(language);
      const userPrompt = buildPreferenceUserPrompt({
        currentLikes: preferences.likes ?? [],
        currentDislikes: preferences.dislikes ?? [],
        currentAnalysis: preferences.analysis,
        slotMenus: group.slotMenus,
        statistics,
        language,
      });

      // Create custom_id: pref_{userId}_{selectionId1,selectionId2,...}
      const selectionIds = group.selections.map((s) => s.id);
      const customId = `pref_${group.user.id}_${selectionIds.join(',')}`;

      requests.push({
        customId,
        userId: group.user.id,
        selectionIds,
        systemPrompt,
        userPrompt,
      });
    }

    return requests;
  }

  /**
   * Convert PreferenceBatchRequests to OpenAI BatchRequests
   */
  buildOpenAiBatchRequests(
    requests: PreferenceBatchRequest[],
    model: string,
  ): BatchRequest[] {
    return requests.map((req) => ({
      custom_id: req.customId,
      method: 'POST' as const,
      url: '/v1/chat/completions' as const,
      body: {
        model,
        messages: [
          { role: 'system' as const, content: req.systemPrompt },
          { role: 'user' as const, content: req.userPrompt },
        ],
        max_completion_tokens: OPENAI_CONFIG.MAX_TOKENS.PREFERENCE_ANALYSIS,
        response_format: {
          type: 'json_schema' as const,
          json_schema: {
            name: 'preference_analysis',
            strict: true,
            schema: getPreferenceResponseSchema().json_schema.schema as Record<
              string,
              unknown
            >,
          },
        },
      },
    }));
  }

  /**
   * Submit a batch job for preference analysis
   * Returns the BatchJob if successful, null if no pending selections
   */
  async submitBatch(model?: string): Promise<BatchJob | null> {
    if (!this.openAiBatchClient.isReady()) {
      this.logger.error('OpenAI Batch Client is not ready');
      return null;
    }

    // 1. Collect pending selections
    const groups = await this.collectPendingSelections();
    if (groups.length === 0) {
      this.logger.log('No pending selections to process');
      return null;
    }

    // 2. Build batch requests
    const prefRequests = await this.buildBatchRequests(groups);
    if (prefRequests.length === 0) {
      this.logger.log(
        'No valid batch requests (all selections have empty menus)',
      );
      // Mark selections as SUCCEEDED since there's nothing to analyze
      await this.markSelectionsSucceeded(groups.flatMap((g) => g.selections));
      return null;
    }

    // 3. Create BatchJob record
    const batchJob = await this.batchJobService.create(
      BatchJobType.PREFERENCE_ANALYSIS,
      prefRequests.length,
    );

    try {
      // 4. Build OpenAI batch requests
      const openAiModel = model || OPENAI_CONFIG.DEFAULT_MODEL;
      const batchRequests = this.buildOpenAiBatchRequests(
        prefRequests,
        openAiModel,
      );
      const jsonlContent =
        this.openAiBatchClient.createBatchContent(batchRequests);

      // 5. Upload to OpenAI
      const inputFileId =
        await this.openAiBatchClient.uploadBatchContent(jsonlContent);

      // 6. Create batch in OpenAI
      const openAiBatchId = await this.openAiBatchClient.createBatch(
        inputFileId,
        {
          job_type: 'preference_analysis',
          batch_job_id: batchJob.id.toString(),
        },
      );

      // 7. Update BatchJob with OpenAI IDs
      await this.batchJobService.updateStatus(
        batchJob.id,
        BatchJobStatus.SUBMITTED,
        {
          openAiBatchId,
          inputFileId,
          submittedAt: new Date(),
        },
      );

      // 8. Mark selections as BATCH_PROCESSING
      await this.markSelectionsBatchProcessing(
        groups.flatMap((g) => g.selections),
        batchJob.id,
      );

      this.logger.log(
        `Submitted batch job ${batchJob.id} with ${prefRequests.length} requests (OpenAI batch: ${openAiBatchId})`,
      );

      return batchJob;
    } catch (error) {
      // Mark batch as failed
      await this.batchJobService.updateStatus(
        batchJob.id,
        BatchJobStatus.FAILED,
        {
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        },
      );

      // Keep selections in PENDING state for next batch attempt
      this.logger.error(
        `Failed to submit batch job ${batchJob.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      return null;
    }
  }

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

    for (const [customId, content] of results) {
      try {
        // Parse custom_id: pref_{userId}_{selectionId1,selectionId2,...}
        const parsed = this.parseCustomId(customId);
        if (!parsed) {
          this.logger.warn(`Invalid custom_id format: ${customId}`);
          failCount++;
          continue;
        }

        // Parse response
        const response = JSON.parse(content) as PreferenceAnalysisResult;
        if (!response.analysis || typeof response.analysis !== 'string') {
          this.logger.warn(`Invalid response format for ${customId}`);
          failCount++;
          await this.markSelectionsFailedByIds(parsed.selectionIds);
          continue;
        }

        // Update user preferences
        let user;
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

        // Update user preferences with analysis text (for backward compatibility)
        await this.userService.updateEntityPreferencesAnalysis(
          user,
          response.analysis.trim(),
        );

        // Store structured analysis in separate table
        await this.userTasteAnalysisService.upsert(user.id, {
          stablePatterns: response.stablePatterns ?? null,
          recentSignals: response.recentSignals ?? null,
          diversityHints: response.diversityHints ?? null,
          compactSummary: response.compactSummary?.trim() ?? null,
          analysisParagraphs: response.analysisParagraphs ?? null,
        });

        // Mark selections as succeeded
        await this.markSelectionsSucceededByIds(parsed.selectionIds);
        successCount++;
      } catch (error) {
        this.logger.error(
          `Error processing result for ${customId || 'unknown'}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        failCount++;

        // Parse customId to mark selections as failed
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

  /**
   * Collect failed selections for retry batch
   * Returns selections that failed but have retryCount < maxRetries
   */
  async collectFailedSelectionsForRetry(
    maxRetries: number = 3,
  ): Promise<UserSelectionGroup[]> {
    const failed = await this.menuSelectionRepository
      .createQueryBuilder('selection')
      .leftJoinAndSelect('selection.user', 'user')
      .where('selection.status = :status', {
        status: MenuSelectionStatus.FAILED,
      })
      .andWhere('selection.retryCount < :maxRetries', { maxRetries })
      .orderBy('selection.selectedAt', 'ASC')
      .take(this.MAX_BATCH_SIZE)
      .getMany();

    if (failed.length === 0) {
      return [];
    }

    // Group by user (same logic as collectPendingSelections)
    const userMap = new Map<number, UserSelectionGroup>();

    for (const selection of failed) {
      if (!selection.user) continue;

      const userId = selection.user.id;

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          user: selection.user,
          selections: [],
          slotMenus: {
            breakfast: [],
            lunch: [],
            dinner: [],
            etc: [],
          },
        });
      }

      const group = userMap.get(userId)!;
      group.selections.push(selection);

      const payload = normalizeMenuPayload(selection.menuPayload);
      group.slotMenus.breakfast.push(
        ...payload.breakfast.map(normalizeMenuName).filter(Boolean),
      );
      group.slotMenus.lunch.push(
        ...payload.lunch.map(normalizeMenuName).filter(Boolean),
      );
      group.slotMenus.dinner.push(
        ...payload.dinner.map(normalizeMenuName).filter(Boolean),
      );
      group.slotMenus.etc.push(
        ...payload.etc.map(normalizeMenuName).filter(Boolean),
      );
    }

    // Deduplicate
    for (const group of userMap.values()) {
      group.slotMenus.breakfast = [...new Set(group.slotMenus.breakfast)];
      group.slotMenus.lunch = [...new Set(group.slotMenus.lunch)];
      group.slotMenus.dinner = [...new Set(group.slotMenus.dinner)];
      group.slotMenus.etc = [...new Set(group.slotMenus.etc)];
    }

    return Array.from(userMap.values());
  }

  /**
   * Submit a retry batch for failed selections
   */
  async submitRetryBatch(model?: string): Promise<BatchJob | null> {
    if (!this.openAiBatchClient.isReady()) {
      this.logger.error('OpenAI Batch Client is not ready');
      return null;
    }

    const groups = await this.collectFailedSelectionsForRetry();
    if (groups.length === 0) {
      this.logger.log('No failed selections to retry');
      return null;
    }

    // Increment retry count before processing
    const allSelections = groups.flatMap((g) => g.selections);
    await this.incrementRetryCount(allSelections);

    // Build and submit batch (same as submitBatch)
    const prefRequests = await this.buildBatchRequests(groups);
    if (prefRequests.length === 0) {
      await this.markSelectionsSucceeded(allSelections);
      return null;
    }

    const batchJob = await this.batchJobService.create(
      BatchJobType.PREFERENCE_ANALYSIS,
      prefRequests.length,
    );

    try {
      const openAiModel = model || OPENAI_CONFIG.DEFAULT_MODEL;
      const batchRequests = this.buildOpenAiBatchRequests(
        prefRequests,
        openAiModel,
      );
      const jsonlContent =
        this.openAiBatchClient.createBatchContent(batchRequests);
      const inputFileId =
        await this.openAiBatchClient.uploadBatchContent(jsonlContent);
      const openAiBatchId = await this.openAiBatchClient.createBatch(
        inputFileId,
        {
          job_type: 'preference_analysis_retry',
          batch_job_id: batchJob.id.toString(),
        },
      );

      await this.batchJobService.updateStatus(
        batchJob.id,
        BatchJobStatus.SUBMITTED,
        {
          openAiBatchId,
          inputFileId,
          submittedAt: new Date(),
        },
      );

      await this.markSelectionsBatchProcessing(allSelections, batchJob.id);

      this.logger.log(
        `Submitted retry batch job ${batchJob.id} with ${prefRequests.length} requests`,
      );

      return batchJob;
    } catch (error) {
      await this.batchJobService.updateStatus(
        batchJob.id,
        BatchJobStatus.FAILED,
        {
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        },
      );
      // Keep selections in FAILED state for next retry
      this.logger.error(
        `Failed to submit retry batch job ${batchJob.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  // ========== Helper Methods ==========

  private parseCustomId(
    customId: string,
  ): { userId: number; selectionIds: number[] } | null {
    // Format: pref_{userId}_{selectionId1,selectionId2,...}
    const match = customId.match(/^pref_(\d+)_(.+)$/);
    if (!match) return null;

    const userId = parseInt(match[1], 10);
    const selectionIds = match[2].split(',').map((id) => parseInt(id, 10));

    if (isNaN(userId) || selectionIds.some(isNaN)) return null;

    return { userId, selectionIds };
  }

  private mapPreferredLanguage(lang?: string): 'ko' | 'en' | undefined {
    if (!lang) return undefined;
    return lang === 'en' ? 'en' : 'ko';
  }

  private async markSelectionsBatchProcessing(
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

  private async markSelectionsSucceeded(
    selections: MenuSelection[],
  ): Promise<void> {
    if (selections.length === 0) return;

    const ids = selections.map((s) => s.id);
    await this.menuSelectionRepository.update(ids, {
      status: MenuSelectionStatus.SUCCEEDED,
    });
  }

  private async markSelectionsSucceededByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;

    await this.menuSelectionRepository.update(ids, {
      status: MenuSelectionStatus.SUCCEEDED,
    });
  }

  private async markSelectionsFailedByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;

    await this.menuSelectionRepository.update(ids, {
      status: MenuSelectionStatus.FAILED,
    });
  }

  private async incrementRetryCount(
    selections: MenuSelection[],
  ): Promise<void> {
    if (selections.length === 0) return;

    const ids = selections.map((s) => s.id);

    await this.menuSelectionRepository
      .createQueryBuilder()
      .update(MenuSelection)
      .set({ retryCount: () => '"retryCount" + 1' })
      .whereInIds(ids)
      .execute();
  }
}
