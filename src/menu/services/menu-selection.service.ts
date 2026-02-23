import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { User } from '../../user/entities/user.entity';
import { UpdateMenuSelectionDto } from '../dto/update-menu-selection.dto';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '../entities/menu-selection.entity';
import {
  buildMenuPayloadFromSlotInputs,
  mergeMenuPayload,
  normalizeMenuName,
  normalizeMenuPayload,
} from '../utils/menu-payload.util';
import { assertValidTransition } from '../utils/menu-selection-state-machine';
import { MenuRecommendationService } from './menu-recommendation.service';

/**
 * 메뉴 선택 관련 서비스
 * - 메뉴 선택 생성/수정
 * - 선택 이력 조회
 */
@Injectable()
export class MenuSelectionService {
  private readonly logger = new Logger(MenuSelectionService.name);

  constructor(
    @InjectRepository(MenuSelection)
    private readonly menuSelectionRepository: Repository<MenuSelection>,
    private readonly menuRecommendationService: MenuRecommendationService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 메뉴 선택 생성
   */
  async createSelection(
    user: User,
    menus: Array<{ slot: string; name: string }>,
    historyId?: number,
  ): Promise<MenuSelection> {
    this.validateMenus(menus);

    const menuPayload = buildMenuPayloadFromSlotInputs(menus);
    this.validateMenuPayload(menuPayload);

    const now = new Date();
    const selectedDate = this.toDateString(now);

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(MenuSelection, {
        where: { user: { id: user.id }, selectedDate },
        relations: ['user'],
        lock: { mode: 'pessimistic_write' },
      });

      if (existing) {
        return this.mergeExistingSelectionInTransaction(
          manager,
          existing,
          menuPayload,
          now,
          selectedDate,
          historyId,
          user,
        );
      }

      return this.createNewSelectionInTransaction(
        manager,
        menuPayload,
        user,
        now,
        selectedDate,
        historyId,
      );
    });
  }

  /**
   * 메뉴 선택 수정
   */
  async updateSelection(
    user: User,
    selectionId: number,
    dto: UpdateMenuSelectionDto,
  ) {
    const selection = await this.menuSelectionRepository.findOne({
      where: { id: selectionId, user: { id: user.id } },
      relations: ['user'],
    });

    if (!selection) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_SELECTION_NOT_FOUND,
      });
    }

    return this.performUpdate(selection, dto);
  }

  /**
   * 메뉴 선택 이력 조회
   */
  async getSelections(user: User, selectedDate?: string) {
    const where: { user: { id: number }; selectedDate?: string } = {
      user: { id: user.id },
    };

    if (selectedDate) {
      where.selectedDate = selectedDate;
    }

    const selections = await this.menuSelectionRepository.find({
      where,
      order: { selectedAt: 'DESC' },
      relations: ['menuRecommendation'],
    });

    return selections.map((selection) => this.mapSelection(selection));
  }

  // ========== Private Methods ==========
  private validateMenus(menus: Array<{ slot: string; name: string }>) {
    if (!menus || menus.length === 0) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_EMPTY,
      });
    }
  }

  private validateMenuPayload(
    menuPayload: ReturnType<typeof buildMenuPayloadFromSlotInputs>,
  ) {
    const totalMenus =
      menuPayload.breakfast.length +
      menuPayload.lunch.length +
      menuPayload.dinner.length +
      menuPayload.etc.length;

    if (totalMenus === 0) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_EMPTY,
      });
    }
  }

  private async mergeExistingSelectionInTransaction(
    manager: EntityManager,
    existing: MenuSelection,
    menuPayload: ReturnType<typeof buildMenuPayloadFromSlotInputs>,
    now: Date,
    selectedDate: string,
    historyId: number | undefined,
    user: User,
  ): Promise<MenuSelection> {
    const existingPayload = normalizeMenuPayload(existing.menuPayload);
    existing.menuPayload = mergeMenuPayload(existingPayload, menuPayload);
    existing.selectedAt = now;
    existing.selectedDate = selectedDate;
    assertValidTransition(existing.status, MenuSelectionStatus.PENDING);
    existing.status = MenuSelectionStatus.PENDING;
    existing.retryCount = 0;

    if (historyId !== undefined) {
      existing.menuRecommendation =
        await this.menuRecommendationService.findOwnedRecommendation(
          historyId,
          user,
        );
    }

    return manager.save(existing);
  }

  private async createNewSelectionInTransaction(
    manager: EntityManager,
    menuPayload: ReturnType<typeof buildMenuPayloadFromSlotInputs>,
    user: User,
    now: Date,
    selectedDate: string,
    historyId: number | undefined,
  ): Promise<MenuSelection> {
    const selection = manager.create(MenuSelection, {
      menuPayload,
      user,
      selectedAt: now,
      selectedDate,
      status: MenuSelectionStatus.PENDING,
      retryCount: 0,
    });

    if (historyId !== undefined) {
      selection.menuRecommendation =
        await this.menuRecommendationService.findOwnedRecommendation(
          historyId,
          user,
        );
    }

    return manager.save(selection);
  }

  private async performUpdate(
    selection: MenuSelection,
    dto: UpdateMenuSelectionDto,
  ) {
    const now = new Date();
    const selectedDate = this.toDateString(now);

    if (dto.cancel) {
      assertValidTransition(selection.status, MenuSelectionStatus.CANCELLED);
      await this.menuSelectionRepository.update(selection.id, {
        status: MenuSelectionStatus.CANCELLED,
        menuPayload: { breakfast: [], lunch: [], dinner: [], etc: [] },
        selectedAt: now,
        selectedDate,
        retryCount: 0,
      });
    } else {
      const updatedPayload = this.buildUpdatedPayload(selection, dto);
      assertValidTransition(selection.status, MenuSelectionStatus.PENDING);

      await this.menuSelectionRepository.update(selection.id, {
        menuPayload: updatedPayload,
        status: MenuSelectionStatus.PENDING,
        selectedAt: now,
        selectedDate,
        retryCount: 0,
      });
    }

    const updated = await this.menuSelectionRepository.findOne({
      where: { id: selection.id },
    });

    if (!updated) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_SELECTION_NOT_FOUND,
      });
    }

    return updated;
  }

  private buildUpdatedPayload(
    selection: MenuSelection,
    dto: UpdateMenuSelectionDto,
  ) {
    const existingPayload = normalizeMenuPayload(selection.menuPayload);
    const updatedPayload = {
      breakfast: [...existingPayload.breakfast],
      lunch: [...existingPayload.lunch],
      dinner: [...existingPayload.dinner],
      etc: [...existingPayload.etc],
    };

    const hasAnySlotUpdate =
      dto.breakfast !== undefined ||
      dto.lunch !== undefined ||
      dto.dinner !== undefined ||
      dto.etc !== undefined;

    if (!hasAnySlotUpdate) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_EMPTY,
      });
    }

    if (dto.breakfast !== undefined) {
      updatedPayload.breakfast = dto.breakfast
        .map((m) => normalizeMenuName(m))
        .filter((m) => m.length > 0);
    }

    if (dto.lunch !== undefined) {
      updatedPayload.lunch = dto.lunch
        .map((m) => normalizeMenuName(m))
        .filter((m) => m.length > 0);
    }

    if (dto.dinner !== undefined) {
      updatedPayload.dinner = dto.dinner
        .map((m) => normalizeMenuName(m))
        .filter((m) => m.length > 0);
    }

    if (dto.etc !== undefined) {
      updatedPayload.etc = dto.etc
        .map((m) => normalizeMenuName(m))
        .filter((m) => m.length > 0);
    }

    return updatedPayload;
  }

  private mapSelection(selection: MenuSelection) {
    const normalizedPayload = normalizeMenuPayload(selection.menuPayload);
    return {
      id: selection.id,
      menuPayload: normalizedPayload,
      selectedDate: selection.selectedDate,
    };
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
