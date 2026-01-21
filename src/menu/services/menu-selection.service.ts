import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { User } from '../../user/entities/user.entity';
import { UpdateMenuSelectionDto } from '../dto/update-menu-selection.dto';
import { MenuRecommendation } from '../entities/menu-recommendation.entity';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '../entities/menu-selection.entity';
import {
  buildMenuPayloadFromSlotInputs,
  mergeMenuPayload,
  normalizeMenuName,
  normalizeMenuPayload,
} from '../menu-payload.util';
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

    const existing = await this.menuSelectionRepository.findOne({
      where: { user: { id: user.id }, selectedDate },
      relations: ['user'],
    });

    if (existing) {
      return this.mergeExistingSelection(
        existing,
        menuPayload,
        now,
        selectedDate,
        historyId,
        () =>
          this.menuRecommendationService.findOwnedRecommendation(
            historyId!,
            user,
          ),
      );
    }

    return this.createNewSelection(
      menuPayload,
      user,
      now,
      selectedDate,
      historyId,
      () =>
        this.menuRecommendationService.findOwnedRecommendation(
          historyId!,
          user,
        ),
    );
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

  private async mergeExistingSelection(
    existing: MenuSelection,
    menuPayload: ReturnType<typeof buildMenuPayloadFromSlotInputs>,
    now: Date,
    selectedDate: string,
    historyId: number | undefined,
    findRecommendation: () => Promise<MenuRecommendation>,
  ): Promise<MenuSelection> {
    const existingPayload = normalizeMenuPayload(existing.menuPayload);
    existing.menuPayload = mergeMenuPayload(existingPayload, menuPayload);
    existing.selectedAt = now;
    existing.selectedDate = selectedDate;
    existing.status = MenuSelectionStatus.PENDING;
    existing.lastTriedAt = null;
    existing.retryCount = 0;

    if (historyId !== undefined) {
      existing.menuRecommendation = await findRecommendation();
    }

    return this.menuSelectionRepository.save(existing);
  }

  private async createNewSelection(
    menuPayload: ReturnType<typeof buildMenuPayloadFromSlotInputs>,
    user: User,
    now: Date,
    selectedDate: string,
    historyId: number | undefined,
    findRecommendation: () => Promise<MenuRecommendation>,
  ): Promise<MenuSelection> {
    const selection = this.menuSelectionRepository.create({
      menuPayload,
      user,
      selectedAt: now,
      selectedDate,
      status: MenuSelectionStatus.PENDING,
      lastTriedAt: null,
      retryCount: 0,
    });

    if (historyId !== undefined) {
      selection.menuRecommendation = await findRecommendation();
    }

    return this.menuSelectionRepository.save(selection);
  }

  private async performUpdate(
    selection: MenuSelection,
    dto: UpdateMenuSelectionDto,
  ) {
    const now = new Date();
    const selectedDate = this.toDateString(now);

    if (dto.cancel) {
      await this.menuSelectionRepository.update(selection.id, {
        status: MenuSelectionStatus.CANCELLED,
        menuPayload: { breakfast: [], lunch: [], dinner: [], etc: [] },
        selectedAt: now,
        selectedDate,
        lastTriedAt: null,
        retryCount: 0,
      });
    } else {
      const updatedPayload = this.buildUpdatedPayload(selection, dto);

      await this.menuSelectionRepository.update(selection.id, {
        menuPayload: updatedPayload,
        status: MenuSelectionStatus.PENDING,
        selectedAt: now,
        selectedDate,
        lastTriedAt: null,
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
