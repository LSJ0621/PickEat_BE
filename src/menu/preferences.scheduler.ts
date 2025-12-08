import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedEntity } from '../common/interfaces/authenticated-user.interface';
import { PreferenceUpdateAiService } from '../user/preference-update-ai.service';
import { UserService } from '../user/user.service';
import {
  MenuSelection,
  MenuSelectionStatus,
} from './entities/menu-selection.entity';
import { normalizeMenuName, normalizeMenuPayload } from './menu-payload.util';

@Injectable()
export class PreferencesScheduler {
  private readonly logger = new Logger(PreferencesScheduler.name);
  private readonly batchSize = 100;

  constructor(
    @InjectRepository(MenuSelection)
    private readonly menuSelectionRepository: Repository<MenuSelection>,
    private readonly userService: UserService,
    private readonly preferenceUpdateAiService: PreferenceUpdateAiService,
  ) {}

  @Cron('35 13 * * *')
  async processPendingSelections() {
    this.logger.log('🕐 [스케줄러 실행] PENDING 건 처리 시작');
    const pending = await this.menuSelectionRepository.find({
      where: { status: MenuSelectionStatus.PENDING },
      relations: ['user', 'socialLogin'],
      order: { selectedAt: 'ASC' },
      take: this.batchSize,
    });

    if (pending.length === 0) {
      this.logger.log('ℹ️ [스케줄러] 처리할 PENDING 건이 없습니다.');
      return;
    }

    this.logger.log(
      `📋 [스케줄러] ${pending.length}건의 PENDING 건을 처리합니다.`,
    );

    const now = new Date();
    pending.forEach((selection) => {
      selection.status = MenuSelectionStatus.IN_PROGRESS;
      selection.lastTriedAt = now;
    });
    await this.menuSelectionRepository.save(pending);

    const grouped = this.groupByOwner(pending);
    for (const group of grouped) {
      // slot별로 메뉴를 그룹화
      const slotMenus = {
        breakfast: [] as string[],
        lunch: [] as string[],
        dinner: [] as string[],
        etc: [] as string[],
      };

      group.selections.forEach((s) => {
        const payload = normalizeMenuPayload(s.menuPayload as any);
        slotMenus.breakfast.push(
          ...payload.breakfast
            .map((n) => normalizeMenuName(n))
            .filter((n) => n.length > 0),
        );
        slotMenus.lunch.push(
          ...payload.lunch
            .map((n) => normalizeMenuName(n))
            .filter((n) => n.length > 0),
        );
        slotMenus.dinner.push(
          ...payload.dinner
            .map((n) => normalizeMenuName(n))
            .filter((n) => n.length > 0),
        );
        slotMenus.etc.push(
          ...payload.etc
            .map((n) => normalizeMenuName(n))
            .filter((n) => n.length > 0),
        );
      });

      // 중복 제거
      slotMenus.breakfast = Array.from(new Set(slotMenus.breakfast));
      slotMenus.lunch = Array.from(new Set(slotMenus.lunch));
      slotMenus.dinner = Array.from(new Set(slotMenus.dinner));
      slotMenus.etc = Array.from(new Set(slotMenus.etc));

      const totalMenus =
        slotMenus.breakfast.length +
        slotMenus.lunch.length +
        slotMenus.dinner.length +
        slotMenus.etc.length;

      if (totalMenus === 0) {
        await this.markSelections(
          group.selections,
          MenuSelectionStatus.SUCCEEDED,
        );
        continue;
      }
      try {
        await this.applySelectionsToPreferencesAnalysis(group.entity, slotMenus);
        await this.markSelections(
          group.selections,
          MenuSelectionStatus.SUCCEEDED,
        );
      } catch (error) {
        this.logger.error(
          `❌ [취향 분석 실패] entityId=${group.entity.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
        await this.markSelections(
          group.selections,
          MenuSelectionStatus.FAILED,
          true,
        );
      }
    }
  }

  @Cron('18 13 * * *')
  async processFailedSelections() {
    this.logger.log('🕐 [스케줄러 실행] FAILED 건 재시도 시작');
    const failed = await this.menuSelectionRepository.find({
      where: { status: MenuSelectionStatus.FAILED },
      relations: ['user', 'socialLogin'],
      order: { selectedAt: 'ASC' },
      take: this.batchSize,
    });

    if (failed.length === 0) {
      this.logger.log('ℹ️ [스케줄러] 처리할 FAILED 건이 없습니다.');
      return;
    }

    this.logger.log(
      `📋 [스케줄러] ${failed.length}건의 FAILED 건을 재시도합니다.`,
    );

    const now = new Date();
    failed.forEach((selection) => {
      selection.status = MenuSelectionStatus.IN_PROGRESS;
      selection.lastTriedAt = now;
    });
    await this.menuSelectionRepository.save(failed);

    const grouped = this.groupByOwner(failed);
    for (const group of grouped) {
      // slot별로 메뉴를 그룹화
      const slotMenus = {
        breakfast: [] as string[],
        lunch: [] as string[],
        dinner: [] as string[],
        etc: [] as string[],
      };

      group.selections.forEach((s) => {
        const payload = normalizeMenuPayload(s.menuPayload as any);
        slotMenus.breakfast.push(
          ...payload.breakfast
            .map((n) => normalizeMenuName(n))
            .filter((n) => n.length > 0),
        );
        slotMenus.lunch.push(
          ...payload.lunch
            .map((n) => normalizeMenuName(n))
            .filter((n) => n.length > 0),
        );
        slotMenus.dinner.push(
          ...payload.dinner
            .map((n) => normalizeMenuName(n))
            .filter((n) => n.length > 0),
        );
        slotMenus.etc.push(
          ...payload.etc
            .map((n) => normalizeMenuName(n))
            .filter((n) => n.length > 0),
        );
      });

      // 중복 제거
      slotMenus.breakfast = Array.from(new Set(slotMenus.breakfast));
      slotMenus.lunch = Array.from(new Set(slotMenus.lunch));
      slotMenus.dinner = Array.from(new Set(slotMenus.dinner));
      slotMenus.etc = Array.from(new Set(slotMenus.etc));

      const totalMenus =
        slotMenus.breakfast.length +
        slotMenus.lunch.length +
        slotMenus.dinner.length +
        slotMenus.etc.length;

      if (totalMenus === 0) {
        await this.markSelections(
          group.selections,
          MenuSelectionStatus.SUCCEEDED,
        );
        continue;
      }
      try {
        await this.applySelectionsToPreferencesAnalysis(group.entity, slotMenus);
        await this.markSelections(
          group.selections,
          MenuSelectionStatus.SUCCEEDED,
        );
      } catch (error) {
        this.logger.error(
          `❌ [취향 분석 재시도 실패] entityId=${group.entity.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
        await this.markSelections(
          group.selections,
          MenuSelectionStatus.FAILED,
          true,
        );
      }
    }
  }

  private async applySelectionsToPreferencesAnalysis(
    entity: AuthenticatedEntity,
    slotMenus: {
      breakfast: string[];
      lunch: string[];
      dinner: string[];
      etc: string[];
    },
  ) {
    const current = await this.userService.getEntityPreferences(entity);
    const aiResult =
      await this.preferenceUpdateAiService.generatePreferenceAnalysis(
        current,
        slotMenus,
      );

    await this.userService.updateEntityPreferencesAnalysis(
      entity,
      aiResult.analysis,
    );
  }

  private groupByOwner(selections: MenuSelection[]): {
    entity: AuthenticatedEntity;
    selections: MenuSelection[];
  }[] {
    const map = new Map<
      string,
      {
        entity: AuthenticatedEntity;
        selections: MenuSelection[];
      }
    >();
    selections.forEach((selection) => {
      if (selection.user) {
        const key = `user-${selection.user.id}`;
        if (!map.has(key)) {
          map.set(key, {
            entity: selection.user,
            selections: [],
          });
        }
        map.get(key)!.selections.push(selection);
        return;
      }
      if (selection.socialLogin) {
        const key = `social-${selection.socialLogin.id}`;
        if (!map.has(key)) {
          map.set(key, {
            entity: selection.socialLogin,
            selections: [],
          });
        }
        map.get(key)!.selections.push(selection);
      }
    });
    return Array.from(map.values());
  }

  private async markSelections(
    selections: MenuSelection[],
    status: MenuSelectionStatus,
    incrementRetry = false,
  ) {
    const now = new Date();
    const ids = selections.map((s) => s.id);
    if (ids.length === 0) {
      return;
    }

    const partials = selections.map((selection) => ({
      id: selection.id,
      status,
      lastTriedAt: now,
      retryCount: incrementRetry
        ? selection.retryCount + 1
        : selection.retryCount,
    }));

    await this.menuSelectionRepository.save(partials);
  }
}
