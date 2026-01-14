import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { TEST_MODE } from '../../common/constants/test-mode.constants';
import { isTestMode } from '../../common/utils/test-mode.util';
import { User } from '../entities/user.entity';
import { UserAddress } from '../entities/user-address.entity';
import { SocialType } from '../enum/social-type.enum';

@Injectable()
export class TestUserSeederService implements OnModuleInit {
  private readonly logger = new Logger(TestUserSeederService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserAddress)
    private readonly userAddressRepository: Repository<UserAddress>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('=== TestUserSeederService.onModuleInit() START ===');
    this.logger.log(`NODE_ENV: ${process.env.NODE_ENV}`);
    this.logger.log(`isTestMode(): ${isTestMode()}`);

    if (!isTestMode()) {
      this.logger.log('Not in test mode, skipping...');
      return;
    }

    try {
      this.logger.log('[TEST MODE] Initializing test users...');
      await this.seedTestUsers();
      this.logger.log('[TEST MODE] Test users seeding completed successfully');
    } catch (error) {
      this.logger.error('[TEST MODE] Failed to seed test users:', error);
      throw error;
    }
  }

  private async seedTestUsers(): Promise<void> {
    await this.seedRegularUser();
    await this.seedAdminUser();
    await this.seedDeletedUser();
    await this.seedDeletedOAuthUsers();
  }

  private async seedRegularUser(): Promise<void> {
    const { REGULAR } = TEST_MODE.USERS;
    const existing = await this.userRepository.findOne({
      where: { email: REGULAR.email },
    });
    if (existing) {
      this.logger.log(
        `[TEST MODE] Regular test user already exists: ${REGULAR.email}`,
      );
      // 주소가 없으면 추가
      await this.ensureUserHasAddress(existing);
      return;
    }
    const hashedPassword = await bcrypt.hash(REGULAR.password, 10);
    const user = this.userRepository.create({
      email: REGULAR.email,
      password: hashedPassword,
      role: REGULAR.role,
      name: REGULAR.name,
      emailVerified: true,
    });
    const savedUser = await this.userRepository.save(user);
    this.logger.log(`[TEST MODE] Regular test user created: ${REGULAR.email}`);

    // 테스트 유저 주소 추가
    await this.seedUserAddress(savedUser);
  }

  private async ensureUserHasAddress(user: User): Promise<void> {
    const existingAddress = await this.userAddressRepository.findOne({
      where: { user: { id: user.id } },
    });
    if (existingAddress) {
      this.logger.log(
        `[TEST MODE] Test user already has address: ${user.email}`,
      );
      return;
    }
    await this.seedUserAddress(user);
  }

  private async seedUserAddress(user: User): Promise<void> {
    const address = this.userAddressRepository.create({
      user,
      roadAddress: '서울특별시 강남구 테헤란로 123',
      postalCode: '06234',
      latitude: 37.4979,
      longitude: 127.0276,
      isDefault: true,
      isSearchAddress: true,
      alias: '테스트 주소',
    });
    await this.userAddressRepository.save(address);
    this.logger.log(`[TEST MODE] Test user address created for: ${user.email}`);
  }

  private async seedAdminUser(): Promise<void> {
    const { ADMIN } = TEST_MODE.USERS;
    const existing = await this.userRepository.findOne({
      where: { email: ADMIN.email },
    });
    if (existing) {
      this.logger.log(
        `[TEST MODE] Admin test user already exists: ${ADMIN.email}`,
      );
      return;
    }
    const hashedPassword = await bcrypt.hash(ADMIN.password, 10);
    const user = this.userRepository.create({
      email: ADMIN.email,
      password: hashedPassword,
      role: ADMIN.role,
      name: ADMIN.name,
      emailVerified: true,
    });
    await this.userRepository.save(user);
    this.logger.log(`[TEST MODE] Admin test user created: ${ADMIN.email}`);
  }

  private async seedDeletedUser(): Promise<void> {
    const { DELETED } = TEST_MODE.USERS;
    const existing = await this.userRepository.findOne({
      where: { email: DELETED.email },
      withDeleted: true,
    });
    if (existing) {
      this.logger.log(
        `[TEST MODE] Deleted test user already exists: ${DELETED.email}`,
      );
      return;
    }
    const hashedPassword = await bcrypt.hash(DELETED.password, 10);
    const user = this.userRepository.create({
      email: DELETED.email,
      password: hashedPassword,
      role: DELETED.role,
      name: DELETED.name,
      emailVerified: true,
    });
    const savedUser = await this.userRepository.save(user);
    await this.userRepository.softRemove(savedUser);
    this.logger.log(
      `[TEST MODE] Deleted test user created (soft-deleted): ${DELETED.email}`,
    );
  }

  private async seedDeletedOAuthUsers(): Promise<void> {
    await this.seedDeletedOAuthUser(
      'kakao-deleted@example.com',
      String(TEST_MODE.SOCIAL_IDS.KAKAO.DELETED),
      SocialType.KAKAO,
    );
    await this.seedDeletedOAuthUser(
      'google-deleted@example.com',
      TEST_MODE.SOCIAL_IDS.GOOGLE.DELETED,
      SocialType.GOOGLE,
    );
  }

  private async seedDeletedOAuthUser(
    email: string,
    socialId: string,
    socialType: SocialType,
  ): Promise<void> {
    const existing = await this.userRepository.findOne({
      where: { socialId },
      withDeleted: true,
    });
    if (existing) {
      this.logger.log(
        `[TEST MODE] Deleted OAuth user already exists: ${email}`,
      );
      return;
    }
    const user = this.userRepository.create({
      email,
      socialId,
      socialType,
      role: 'USER',
      name: '탈퇴한소셜유저',
      password: null,
    });
    const savedUser = await this.userRepository.save(user);
    await this.userRepository.softRemove(savedUser);
    this.logger.log(
      `[TEST MODE] Deleted OAuth user created (${socialType}): ${email}`,
    );
  }
}
