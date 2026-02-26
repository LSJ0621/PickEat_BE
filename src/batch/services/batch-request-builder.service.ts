import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThan, In, And } from 'typeorm';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { UserService } from '@/user/user.service';
import {
  buildPreferenceUserPrompt,
  getPreferenceSystemPrompt,
  getPreferenceResponseSchema,
  SelectionStatistics,
} from '@/external/openai/prompts/preference-update.prompts';
import { OPENAI_CONFIG } from '@/external/openai/openai.constants';
import { BATCH_CONFIG } from '@/common/constants/business.constants';
import { normalizeMenuPayload } from '@/menu/utils/menu-payload.util';
import {
  BatchRequest,
  PreferenceBatchRequest,
} from '../types/preference-batch.types';
import { UserSelectionGroup } from '../interfaces/preference-batch.interface';

@Injectable()
export class BatchRequestBuilderService {
  private readonly logger = new Logger(BatchRequestBuilderService.name);

  constructor(
    @InjectRepository(MenuSelection)
    private readonly menuSelectionRepository: Repository<MenuSelection>,
    private readonly userService: UserService,
  ) {}

  /**
   * Build batch requests from user selection groups.
   * Bulk-fetches preferences and statistics before the loop to avoid N+1 queries.
   */
  async buildBatchRequests(
    groups: UserSelectionGroup[],
  ): Promise<PreferenceBatchRequest[]> {
    // C-12: Bulk-fetch all preferences upfront (1 pass instead of N DB hits)
    const userIds = groups.map((g) => g.user.id);
    const preferencesMap =
      await this.userService.getEntityPreferencesByUserIds(userIds);

    // C-12: Bulk-fetch statistics for all users
    const statisticsMap = await this.bulkCalculateStatistics(userIds);

    const requests: PreferenceBatchRequest[] = [];

    for (const group of groups) {
      const totalMenus =
        group.slotMenus.breakfast.length +
        group.slotMenus.lunch.length +
        group.slotMenus.dinner.length +
        group.slotMenus.etc.length;

      if (totalMenus === 0) {
        continue;
      }

      // O(1) lookup instead of per-iteration DB hit
      const preferences = preferencesMap.get(group.user.id);
      if (!preferences) {
        this.logger.warn(
          `Preferences not found for user ${group.user.id}, skipping`,
        );
        continue;
      }

      const statistics = statisticsMap.get(group.user.id);
      if (!statistics) {
        this.logger.warn(
          `Statistics not found for user ${group.user.id}, skipping`,
        );
        continue;
      }

      const language = this.mapPreferredLanguage(group.user.preferredLanguage);
      const systemPrompt = getPreferenceSystemPrompt(language);
      const userPrompt = buildPreferenceUserPrompt({
        currentLikes: preferences.likes ?? [],
        currentDislikes: preferences.dislikes ?? [],
        currentAnalysis: preferences.analysis,
        slotMenus: group.slotMenus,
        statistics,
        language,
      });

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
   * Bulk-calculate statistics for a list of user IDs.
   * Returns a Map<userId, SelectionStatistics> for O(1) lookup.
   */
  private async bulkCalculateStatistics(
    userIds: number[],
  ): Promise<Map<number, SelectionStatistics>> {
    const result = new Map<number, SelectionStatistics>();

    await Promise.all(
      userIds.map(async (userId) => {
        const stats = await this.calculateStatistics(userId);
        result.set(userId, stats);
      }),
    );

    return result;
  }

  /**
   * Calculate selection statistics for a single user
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

      const uniqueMenusToday = new Set(allMenus);
      for (const menu of uniqueMenusToday) {
        menuCount.set(menu, (menuCount.get(menu) || 0) + 1);
      }
    }

    return Array.from(menuCount.entries())
      .filter(([_, count]) => count >= 2)
      .map(([menu, count]) => ({ menu, count }))
      .sort((a, b) => b.count - a.count);
  }

  private async findNewTrials(
    recentSelections: MenuSelection[],
    userId: number,
  ): Promise<string[]> {
    if (recentSelections.length === 0) return [];

    const oldestRecentDate =
      recentSelections[recentSelections.length - 1]?.selectedDate;

    const historyLimit = new Date();
    historyLimit.setMonth(
      historyLimit.getMonth() - BATCH_CONFIG.HISTORY_LIMIT_MONTHS,
    );

    const olderSelections = await this.menuSelectionRepository.find({
      where: {
        user: { id: userId },
        selectedDate: And(
          LessThan(oldestRecentDate),
          MoreThanOrEqual(historyLimit.toISOString().split('T')[0]),
        ),
        status: MenuSelectionStatus.SUCCEEDED,
      },
      take: 1000,
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

    return Array.from(recentMenus).filter((m) => !olderMenus.has(m));
  }

  private mapPreferredLanguage(lang?: string): 'ko' | 'en' | undefined {
    if (!lang) return undefined;
    return lang === 'en' ? 'en' : 'ko';
  }
}
