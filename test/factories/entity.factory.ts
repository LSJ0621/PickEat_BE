import { User } from '@/user/entities/user.entity';
import { UserAddress } from '@/user/entities/user-address.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { PlaceRecommendation } from '@/menu/entities/place-recommendation.entity';
import { EmailVerification } from '@/auth/entities/email-verification.entity';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { BugReportStatus } from '@/bug-report/enum/bug-report-status.enum';
import { UserPreferences } from '@/user/interfaces/user-preferences.interface';
import { UserPlace } from '@/user-place/entities/user-place.entity';
import { UserPlaceStatus } from '@/user-place/enum/user-place-status.enum';

/**
 * Factory function to create User entities for testing
 */
export class UserFactory {
  static create(overrides?: Partial<User>): User {
    const user = new User();
    user.id = overrides?.id ?? 1;
    user.email = overrides?.email ?? 'test@example.com';
    user.password = overrides?.password ?? null;
    user.socialId = overrides?.socialId ?? null;
    user.socialType = overrides?.socialType ?? null;
    user.name = overrides?.name ?? 'Test User';
    user.role = overrides?.role ?? 'USER';
    user.preferredLanguage = overrides?.preferredLanguage ?? 'ko';
    user.preferences = overrides?.preferences ?? null;
    user.refreshToken = overrides?.refreshToken ?? null;
    user.emailVerified = overrides?.emailVerified ?? false;
    user.reRegisterEmailVerified = overrides?.reRegisterEmailVerified ?? false;
    user.lastPasswordChangedAt = overrides?.lastPasswordChangedAt ?? null;
    user.deletedAt = overrides?.deletedAt ?? null;
    user.version = overrides?.version ?? 1;
    user.createdAt = overrides?.createdAt ?? new Date();
    user.updatedAt = overrides?.updatedAt ?? new Date();
    user.recommendations = overrides?.recommendations ?? [];
    user.menuSelections = overrides?.menuSelections ?? [];
    user.addresses = overrides?.addresses ?? [];
    return user;
  }

  static createWithPassword(
    email: string = 'test@example.com',
    password: string = 'hashedPassword123',
  ): User {
    return UserFactory.create({
      email,
      password,
      socialId: null,
      socialType: null,
    });
  }

  static createWithSocial(
    email: string = 'social@example.com',
    socialId: string = 'kakao_123456',
    socialType: string = 'kakao',
  ): User {
    return UserFactory.create({ email, socialId, socialType, password: null });
  }

  static createAdmin(email: string = 'admin@example.com'): User {
    return UserFactory.create({ email, role: 'ADMIN' });
  }
}

/**
 * Factory function to create UserAddress entities for testing
 */
export class UserAddressFactory {
  static create(overrides?: Partial<UserAddress>): UserAddress {
    const address = new UserAddress();
    address.id = overrides?.id ?? 1;
    address.user = overrides?.user ?? UserFactory.create();
    address.roadAddress =
      overrides?.roadAddress ?? '서울특별시 강남구 테헤란로 123';
    address.postalCode = overrides?.postalCode ?? '06234';
    address.latitude = overrides?.latitude ?? 37.5012345;
    address.longitude = overrides?.longitude ?? 127.0398765;
    address.isDefault = overrides?.isDefault ?? false;
    address.isSearchAddress = overrides?.isSearchAddress ?? false;
    address.alias = overrides?.alias ?? null;
    address.createdAt = overrides?.createdAt ?? new Date();
    address.updatedAt = overrides?.updatedAt ?? new Date();
    address.deletedAt = overrides?.deletedAt ?? null;
    return address;
  }

  static createDefault(user?: User): UserAddress {
    return UserAddressFactory.create({ user, isDefault: true });
  }

  static createSearchAddress(user?: User): UserAddress {
    return UserAddressFactory.create({ user, isSearchAddress: true });
  }
}

/**
 * Factory function to create MenuRecommendation entities for testing
 */
export class MenuRecommendationFactory {
  static create(overrides?: Partial<MenuRecommendation>): MenuRecommendation {
    const recommendation = new MenuRecommendation();
    recommendation.id = overrides?.id ?? 1;
    recommendation.user = overrides?.user ?? UserFactory.create();
    recommendation.recommendations = overrides?.recommendations ?? [
      '김치찌개',
      '된장찌개',
      '순두부찌개',
    ];
    recommendation.reason =
      overrides?.reason ?? '한식을 좋아하시는 것 같아 추천드립니다.';
    recommendation.prompt = overrides?.prompt ?? '오늘 점심 추천해줘';
    recommendation.requestAddress =
      overrides?.requestAddress ?? '서울특별시 강남구 테헤란로 123';
    recommendation.recommendedAt = overrides?.recommendedAt ?? new Date();
    recommendation.placeRecommendations = overrides?.placeRecommendations ?? [];
    recommendation.selections = overrides?.selections ?? [];
    recommendation.createdAt = overrides?.createdAt ?? new Date();
    recommendation.updatedAt = overrides?.updatedAt ?? new Date();
    return recommendation;
  }
}

/**
 * Factory function to create MenuSelection entities for testing
 */
export class MenuSelectionFactory {
  static create(overrides?: Partial<MenuSelection>): MenuSelection {
    const selection = new MenuSelection();
    selection.id = overrides?.id ?? 1;
    selection.menuPayload = overrides?.menuPayload ?? {
      breakfast: ['김치찌개'],
      lunch: ['된장찌개'],
      dinner: ['순두부찌개'],
      etc: [],
    };
    selection.status = overrides?.status ?? MenuSelectionStatus.PENDING;
    selection.selectedAt = overrides?.selectedAt ?? new Date();
    selection.selectedDate =
      overrides?.selectedDate ?? new Date().toISOString().split('T')[0];
    selection.lastTriedAt = overrides?.lastTriedAt ?? null;
    selection.retryCount = overrides?.retryCount ?? 0;
    selection.user = overrides?.user ?? UserFactory.create();
    selection.menuRecommendation = overrides?.menuRecommendation ?? null;
    selection.createdAt = overrides?.createdAt ?? new Date();
    selection.updatedAt = overrides?.updatedAt ?? new Date();
    return selection;
  }

  static createPending(user?: User): MenuSelection {
    return MenuSelectionFactory.create({
      user,
      status: MenuSelectionStatus.PENDING,
    });
  }

  static createSucceeded(user?: User): MenuSelection {
    return MenuSelectionFactory.create({
      user,
      status: MenuSelectionStatus.SUCCEEDED,
    });
  }
}

/**
 * Factory function to create PlaceRecommendation entities for testing
 */
export class PlaceRecommendationFactory {
  static create(overrides?: Partial<PlaceRecommendation>): PlaceRecommendation {
    const place = new PlaceRecommendation();
    place.id = overrides?.id ?? 1;
    place.menuRecommendation =
      overrides?.menuRecommendation ?? MenuRecommendationFactory.create();
    place.placeId = overrides?.placeId ?? 'ChIJN1t_tDeuEmsRUsoyG83frY4';
    place.reason = overrides?.reason ?? '가까운 거리에 있고 평점이 높습니다.';
    place.menuName = overrides?.menuName ?? '김치찌개';
    return place;
  }
}

/**
 * Factory function to create EmailVerification entities for testing
 */
export class EmailVerificationFactory {
  static create(overrides?: Partial<EmailVerification>): EmailVerification {
    const verification = new EmailVerification();
    verification.id = overrides?.id ?? 1;
    verification.email = overrides?.email ?? 'test@example.com';
    verification.codeHash = overrides?.codeHash ?? 'hashedCode123';
    verification.purpose = overrides?.purpose ?? 'SIGNUP';
    verification.expiresAt =
      overrides?.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    verification.used = overrides?.used ?? false;
    verification.usedAt = overrides?.usedAt ?? null;
    verification.status = overrides?.status ?? 'ACTIVE';
    verification.sendCount = overrides?.sendCount ?? 1;
    verification.lastSentAt = overrides?.lastSentAt ?? new Date();
    verification.failCount = overrides?.failCount ?? 0;
    verification.createdAt = overrides?.createdAt ?? new Date();
    verification.updatedAt = overrides?.updatedAt ?? new Date();
    return verification;
  }

  static createExpired(email?: string): EmailVerification {
    return EmailVerificationFactory.create({
      email,
      expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
      status: 'EXPIRED',
    });
  }

  static createUsed(email?: string): EmailVerification {
    return EmailVerificationFactory.create({
      email,
      used: true,
      usedAt: new Date(),
      status: 'USED',
    });
  }
}

/**
 * Factory function to create BugReport entities for testing
 */
export class BugReportFactory {
  static create(overrides?: Partial<BugReport>): BugReport {
    const bugReport = new BugReport();
    bugReport.id = overrides?.id ?? 1;
    bugReport.user = overrides?.user ?? UserFactory.create();
    bugReport.category = overrides?.category ?? 'UI/UX';
    bugReport.title = overrides?.title ?? '버튼이 작동하지 않습니다';
    bugReport.description =
      overrides?.description ?? '메뉴 추천 버튼을 눌러도 반응이 없습니다.';
    bugReport.images = overrides?.images ?? null;
    bugReport.status = overrides?.status ?? BugReportStatus.UNCONFIRMED;
    // Only set timestamps if explicitly provided (allows TypeORM to manage them)
    if (overrides?.createdAt !== undefined) {
      bugReport.createdAt = overrides.createdAt;
    }
    if (overrides?.updatedAt !== undefined) {
      bugReport.updatedAt = overrides.updatedAt;
    }
    return bugReport;
  }

  static createWithImages(user?: User, imageUrls?: string[]): BugReport {
    return BugReportFactory.create({
      user,
      images: imageUrls ?? [
        'https://s3.amazonaws.com/bug-reports/image1.png',
        'https://s3.amazonaws.com/bug-reports/image2.png',
      ],
    });
  }
}

/**
 * Factory function to create UserPreferences for testing
 */
export class UserPreferencesFactory {
  static create(overrides?: Partial<UserPreferences>): UserPreferences {
    return {
      likes: overrides?.likes ?? ['한식', '중식', '일식'],
      dislikes: overrides?.dislikes ?? ['양식'],
    };
  }
}

/**
 * Factory function to create UserPlace entities for testing
 */
export class UserPlaceFactory {
  static create(overrides?: Partial<UserPlace>): UserPlace {
    const userPlace = new UserPlace();
    userPlace.id = overrides?.id ?? 1;
    userPlace.user = overrides?.user ?? UserFactory.create();
    userPlace.name = overrides?.name ?? '테스트 식당';
    userPlace.address = overrides?.address ?? '서울특별시 강남구 테헤란로 123';
    userPlace.latitude = overrides?.latitude ?? 37.5012345;
    userPlace.longitude = overrides?.longitude ?? 127.0398765;
    userPlace.location = overrides?.location ?? {
      type: 'Point',
      coordinates: [
        overrides?.longitude ?? 127.0398765,
        overrides?.latitude ?? 37.5012345,
      ],
    };
    userPlace.menuTypes = overrides?.menuTypes ?? ['한식', '찌개류'];
    userPlace.photos = overrides?.photos ?? null;
    userPlace.openingHours = overrides?.openingHours ?? null;
    userPlace.phoneNumber = overrides?.phoneNumber ?? null;
    userPlace.category = overrides?.category ?? null;
    userPlace.description = overrides?.description ?? null;
    userPlace.status = overrides?.status ?? UserPlaceStatus.PENDING;
    userPlace.rejectionReason = overrides?.rejectionReason ?? null;
    userPlace.rejectionCount = overrides?.rejectionCount ?? 0;
    userPlace.lastRejectedAt = overrides?.lastRejectedAt ?? null;
    userPlace.lastSubmittedAt = overrides?.lastSubmittedAt ?? new Date();
    userPlace.version = overrides?.version ?? 1;
    userPlace.createdAt = overrides?.createdAt ?? new Date();
    userPlace.updatedAt = overrides?.updatedAt ?? new Date();
    userPlace.deletedAt = overrides?.deletedAt ?? null;
    return userPlace;
  }

  static createPending(user?: User): UserPlace {
    return UserPlaceFactory.create({
      user,
      status: UserPlaceStatus.PENDING,
    });
  }

  static createApproved(user?: User): UserPlace {
    return UserPlaceFactory.create({
      user,
      status: UserPlaceStatus.APPROVED,
    });
  }

  static createRejected(user?: User, reason?: string): UserPlace {
    return UserPlaceFactory.create({
      user,
      status: UserPlaceStatus.REJECTED,
      rejectionReason: reason ?? '테스트 거부 사유',
      rejectionCount: 1,
      lastRejectedAt: new Date(),
    });
  }

  static createWithPhotos(user?: User, photoUrls?: string[]): UserPlace {
    return UserPlaceFactory.create({
      user,
      photos: photoUrls ?? [
        'https://example.com/photo1.jpg',
        'https://example.com/photo2.jpg',
      ],
    });
  }
}
