import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import {
  normalizeMenuPayload,
  normalizeMenuName,
} from '@/menu/menu-payload.util';
import { BATCH_CONFIG } from '@/common/constants/business.constants';
import { UserSelectionGroup } from '../interfaces/preference-batch.interface';

@Injectable()
export class SelectionGroupingService {
  private readonly logger = new Logger(SelectionGroupingService.name);
  private readonly MAX_BATCH_SIZE = 500;

  constructor(
    @InjectRepository(MenuSelection)
    private readonly menuSelectionRepository: Repository<MenuSelection>,
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

    return this.groupSelectionsToUserMap(pending);
  }

  /**
   * Collect failed selections for retry batch.
   * Returns selections that failed but have retryCount < maxRetries.
   * Also marks selections that exceed maxRetries as PERMANENTLY_FAILED.
   */
  async collectFailedSelectionsForRetry(
    maxRetries: number = BATCH_CONFIG.MAX_RETRY_COUNT,
  ): Promise<UserSelectionGroup[]> {
    await this.markPermanentlyFailedSelections(maxRetries);

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

    return this.groupSelectionsToUserMap(failed);
  }

  /**
   * Groups an array of MenuSelection entities by user, normalizing menu payloads
   * and deduplicating slot menus. Used by both pending and failed collection flows.
   */
  groupSelectionsToUserMap(selections: MenuSelection[]): UserSelectionGroup[] {
    const userMap = new Map<number, UserSelectionGroup>();

    for (const selection of selections) {
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
   * Mark selections that have exceeded max retry count as PERMANENTLY_FAILED
   */
  private async markPermanentlyFailedSelections(
    maxRetries: number,
  ): Promise<void> {
    const result = await this.menuSelectionRepository
      .createQueryBuilder()
      .update(MenuSelection)
      .set({ status: MenuSelectionStatus.PERMANENTLY_FAILED })
      .where('status = :status', { status: MenuSelectionStatus.FAILED })
      .andWhere('retryCount >= :maxRetries', { maxRetries })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(
        `Marked ${result.affected} selections as PERMANENTLY_FAILED (retryCount >= ${maxRetries})`,
      );
    }
  }
}
