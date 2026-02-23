import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { PlaceRating } from './entities/place-rating.entity';
import { SelectPlaceDto } from './dto/select-place.dto';
import { SubmitRatingDto } from './dto/submit-rating.dto';
import { SkipRatingDto } from './dto/skip-rating.dto';
import { DismissRatingDto } from './dto/dismiss-rating.dto';
import { GetRatingHistoryDto } from './dto/get-rating-history.dto';
import { ErrorCode } from '@/common/constants/error-codes';
import type { PendingRatingResponse } from './interfaces/pending-rating.interface';
import type {
  RatingHistoryItem,
  RatingHistoryResponse,
} from './interfaces/rating-history.interface';
import type { User } from '@/user/entities/user.entity';

@Injectable()
export class RatingService {
  private readonly logger = new Logger(RatingService.name);

  constructor(
    @InjectRepository(PlaceRating)
    private readonly placeRatingRepository: Repository<PlaceRating>,
  ) {}

  /**
   * "이 가게로 갈게요" — PlaceRating(PENDING) 생성
   */
  async selectPlace(
    user: User,
    dto: SelectPlaceDto,
  ): Promise<PendingRatingResponse> {
    if (user.isDeactivated) {
      throw new ForbiddenException(ErrorCode.FORBIDDEN);
    }

    const placeRating = this.placeRatingRepository.create({
      user,
      placeId: dto.placeId,
      placeName: dto.placeName,
      placeRecommendation: dto.placeRecommendationId
        ? { id: dto.placeRecommendationId }
        : null,
      rating: null,
      skipped: false,
    });

    const saved = await this.placeRatingRepository.save(placeRating);

    const response: PendingRatingResponse = {
      id: saved.id,
      placeId: saved.placeId,
      placeName: saved.placeName,
      createdAt: saved.createdAt.toISOString(),
    };

    this.logger.log(
      `User ${user.id} selected place: ${dto.placeName} (${dto.placeId})`,
    );

    return response;
  }

  /**
   * 미평가 선택 1개 조회
   */
  async getPendingRating(user: User): Promise<PendingRatingResponse | null> {
    const pending = await this.placeRatingRepository.findOne({
      where: {
        user: { id: user.id },
        rating: IsNull(),
        skipped: false,
        promptDismissed: false,
      },
      order: { createdAt: 'DESC' },
    });

    if (!pending) {
      return null;
    }

    return {
      id: pending.id,
      placeId: pending.placeId,
      placeName: pending.placeName,
      createdAt: pending.createdAt.toISOString(),
    };
  }

  /**
   * 별점 제출 (1-5)
   */
  async submitRating(user: User, dto: SubmitRatingDto): Promise<void> {
    if (user.isDeactivated) {
      throw new ForbiddenException(ErrorCode.FORBIDDEN);
    }

    const placeRating = await this.findRatingByIdAndUser(
      dto.placeRatingId,
      user.id,
    );

    placeRating.rating = dto.rating;
    await this.placeRatingRepository.save(placeRating);

    this.logger.log(
      `User ${user.id} rated place ${placeRating.placeId}: ${dto.rating}/5`,
    );
  }

  /**
   * "안 갔어요" 처리
   */
  async skipRating(user: User, dto: SkipRatingDto): Promise<void> {
    if (user.isDeactivated) {
      throw new ForbiddenException(ErrorCode.FORBIDDEN);
    }

    const placeRating = await this.findRatingByIdAndUser(
      dto.placeRatingId,
      user.id,
    );

    placeRating.skipped = true;
    await this.placeRatingRepository.save(placeRating);

    this.logger.log(`User ${user.id} skipped place ${placeRating.placeId}`);
  }

  /**
   * 프롬프트 닫기 — promptDismissed 설정
   */
  async dismissRating(user: User, dto: DismissRatingDto): Promise<void> {
    if (user.isDeactivated) {
      throw new ForbiddenException(ErrorCode.FORBIDDEN);
    }

    const placeRating = await this.findRatingByIdAndUser(
      dto.placeRatingId,
      user.id,
    );

    placeRating.promptDismissed = true;
    await this.placeRatingRepository.save(placeRating);

    this.logger.log(
      `User ${user.id} dismissed prompt for place ${placeRating.placeId}`,
    );
  }

  /**
   * 평가 이력 조회 (페이지네이션)
   */
  async getRatingHistory(
    user: User,
    dto: GetRatingHistoryDto,
  ): Promise<RatingHistoryResponse> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 10;

    const where: FindOptionsWhere<PlaceRating> = { user: { id: user.id } };
    if (dto.selectedDate) {
      const start = new Date(`${dto.selectedDate}T00:00:00.000Z`);
      const nextDay = new Date(start);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      where.createdAt = Between(start, nextDay);
    }

    const [ratings, total] = await this.placeRatingRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const items: RatingHistoryItem[] = ratings.map((r) => ({
      id: r.id,
      placeId: r.placeId,
      placeName: r.placeName,
      rating: r.rating,
      skipped: r.skipped,
      promptDismissed: r.promptDismissed,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * placeRatingId + userId 조합으로 PlaceRating 조회 및 소유권 검증
   */
  private async findRatingByIdAndUser(
    ratingId: number,
    userId: number,
  ): Promise<PlaceRating> {
    const placeRating = await this.placeRatingRepository.findOne({
      where: { id: ratingId },
      relations: ['user'],
    });

    if (!placeRating) {
      throw new NotFoundException(ErrorCode.PLACE_RATING_NOT_FOUND);
    }

    if (placeRating.user.id !== userId) {
      throw new ForbiddenException(ErrorCode.FORBIDDEN);
    }

    return placeRating;
  }
}
