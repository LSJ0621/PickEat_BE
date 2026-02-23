import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TEST_MODE } from '@/common/constants/test-mode.constants';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { MenuSlotPayload } from '@/menu/interfaces/menu-selection.interface';
import { User } from '@/user/entities/user.entity';

/**
 * 테스트 모드에서 어드민 계정에 7일치 메뉴 선택 샘플 데이터를 시딩하는 서비스
 */
@Injectable()
export class MenuSelectionSeederService implements OnModuleInit {
  private readonly logger = new Logger(MenuSelectionSeederService.name);
  private readonly SEEDING_DAYS = 7;

  private readonly SAMPLE_MENUS = {
    korean: [
      '김치찌개',
      '된장찌개',
      '불고기',
      '삼겹살',
      '비빔밥',
      '잡채',
      '갈비탕',
      '순두부찌개',
      '제육볶음',
      '떡볶이',
    ],
    chinese: [
      '짜장면',
      '짬뽕',
      '탕수육',
      '볶음밥',
      '마파두부',
      '깐풍기',
      '양장피',
      '유린기',
      '라조기',
      '고추잡채',
    ],
    japanese: [
      '초밥',
      '라멘',
      '돈까스',
      '우동',
      '규동',
      '가츠동',
      '오코노미야키',
      '타코야키',
      '연어회',
      '장어덮밥',
    ],
    western: [
      '파스타',
      '피자',
      '스테이크',
      '햄버거',
      '리조또',
      '샐러드',
      '오믈렛',
      '그라탱',
      '수프',
      '샌드위치',
    ],
    etc: [
      '샐러드',
      '김밥',
      '죽',
      '토스트',
      '시리얼',
      '과일',
      '요거트',
      '스무디',
    ],
  };

  constructor(
    @InjectRepository(MenuSelection)
    private readonly menuSelectionRepository: Repository<MenuSelection>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('=== MenuSelectionSeederService.onModuleInit() START ===');
    this.logger.log(`NODE_ENV: ${process.env.NODE_ENV}`);

    const isDevelopmentOrTest =
      process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

    if (!isDevelopmentOrTest) {
      this.logger.log('Not in development/test mode, skipping...');
      return;
    }

    try {
      this.logger.log('[DEV/TEST MODE] Initializing menu selection seeding...');
      await this.seedMenuSelections();
      this.logger.log(
        '[DEV/TEST MODE] Menu selection seeding completed successfully',
      );
    } catch (error) {
      this.logger.error(
        '[DEV/TEST MODE] Failed to seed menu selections:',
        error,
      );
      throw error;
    }
  }

  private async seedMenuSelections(): Promise<void> {
    // 어드민 계정 찾기
    const admin = await this.userRepository.findOne({
      where: { email: TEST_MODE.USERS.ADMIN.email },
    });

    if (!admin) {
      this.logger.warn(
        `[DEV/TEST MODE] Admin user not found: ${TEST_MODE.USERS.ADMIN.email}`,
      );
      return;
    }

    // 이미 메뉴 선택 데이터가 있는지 확인 (모든 상태 체크)
    const existingCount = await this.menuSelectionRepository.count({
      where: {
        user: { id: admin.id },
      },
    });

    if (existingCount > 0) {
      this.logger.log(
        `[DEV/TEST MODE] Admin user already has ${existingCount} menu selections, skipping...`,
      );
      return;
    }

    // 최근 7일치 데이터 생성
    const selections: Partial<MenuSelection>[] = [];
    const today = new Date();

    for (let i = 0; i < this.SEEDING_DAYS; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - i);
      const selectedDate = targetDate.toISOString().split('T')[0];

      const menuPayload = this.generateRandomMenuPayload();

      selections.push({
        user: admin,
        menuPayload,
        status: MenuSelectionStatus.PENDING,
        selectedDate,
        selectedAt: targetDate,
        retryCount: 0,
        batchJobId: null,
      });
    }

    // 트랜잭션으로 데이터 저장 (부분 실패 방지)
    await this.menuSelectionRepository.manager.transaction(async (manager) => {
      await manager.save(MenuSelection, selections);
    });

    this.logger.log(
      `[DEV/TEST MODE] Created ${selections.length} PENDING menu selections for admin user`,
    );
  }

  /**
   * 다양한 메뉴를 랜덤하게 생성
   */
  private generateRandomMenuPayload(): MenuSlotPayload {
    const categories = ['korean', 'chinese', 'japanese', 'western'] as const;
    const randomCategory =
      categories[Math.floor(Math.random() * categories.length)];

    const breakfast = this.getRandomMenus(this.SAMPLE_MENUS.etc, 1, 2);
    const lunch = this.getRandomMenus(this.SAMPLE_MENUS[randomCategory], 2, 3);
    const dinner = this.getRandomMenus(
      this.SAMPLE_MENUS[
        categories[Math.floor(Math.random() * categories.length)]
      ],
      2,
      3,
    );
    const etc = this.getRandomMenus(this.SAMPLE_MENUS.etc, 0, 2);

    return {
      breakfast,
      lunch,
      dinner,
      etc,
    };
  }

  /**
   * 배열에서 랜덤하게 min ~ max 개수만큼 선택
   */
  private getRandomMenus(
    menus: readonly string[],
    min: number,
    max: number,
  ): string[] {
    const count = Math.floor(Math.random() * (max - min + 1)) + min;
    const shuffled = [...menus].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
}
