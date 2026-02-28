import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PlaceRating } from './entities/place-rating.entity';
import { UserPlace } from '@/user-place/entities/user-place.entity';
import { parseUserPlaceId } from '@/menu/place-id.util';
import {
  SCHEDULER_LOCKS,
  BATCH_CONFIG,
} from '@/common/constants/business.constants';
import { withAdvisoryLock } from '@/common/utils/advisory-lock.util';

@Injectable()
export class RatingSchedulerService {
  private readonly logger = new Logger(RatingSchedulerService.name);

  constructor(
    @InjectRepository(PlaceRating)
    private readonly placeRatingRepository: Repository<PlaceRating>,
    @InjectRepository(UserPlace)
    private readonly userPlaceRepository: Repository<UserPlace>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 매일 KST 자정 (UTC 15:00) 실행
   * 별점이 있는 PlaceRating에서 UserPlace별 평균/건수 집계 후 비정규화 업데이트
   */
  @Cron('0 15 * * *')
  async updateUserPlaceAggregates(): Promise<void> {
    this.logger.log('Starting user_place aggregate update...');

    const { acquired, timedOut } = await withAdvisoryLock(
      this.dataSource,
      SCHEDULER_LOCKS.RATING_AGGREGATE_UPDATE,
      async () => {
        try {
          await this.dataSource.transaction(async (manager) => {
            // user_place_ prefix가 있는 placeId로 그룹핑하여 집계
            const aggregates = await manager
              .createQueryBuilder(PlaceRating, 'pr')
              .select('pr.placeId', 'placeId')
              .addSelect('AVG(pr.rating)', 'avgRating')
              .addSelect('COUNT(pr.rating)', 'ratingCount')
              .where('pr.rating IS NOT NULL')
              .andWhere('pr.skipped = false')
              .andWhere("pr.placeId LIKE 'user_place_%'")
              .groupBy('pr.placeId')
              .getRawMany<{
                placeId: string;
                avgRating: string;
                ratingCount: string;
              }>();

            if (aggregates.length === 0) {
              this.logger.log('No rated user places found. Skipping.');
              return;
            }

            // Parse and filter valid user place IDs
            const updates: Array<{
              id: number;
              avgRating: number;
              ratingCount: number;
            }> = [];

            for (const agg of aggregates) {
              const userPlaceId = parseUserPlaceId(agg.placeId);
              if (userPlaceId === null) continue;

              const avgRating = Math.round(parseFloat(agg.avgRating) * 10) / 10;
              const ratingCount = parseInt(agg.ratingCount, 10);

              updates.push({
                id: userPlaceId,
                avgRating,
                ratingCount,
              });
            }

            if (updates.length === 0) {
              this.logger.log('No valid user place IDs to update. Skipping.');
              return;
            }

            // Bulk UPDATE using CASE expressions with parameterized queries
            const parameters: (number | string)[] = [];
            let paramIdx = 1;

            const avgRatingCases = updates
              .map((u) => {
                const idParam = `$${paramIdx++}`;
                const valParam = `$${paramIdx++}`;
                parameters.push(u.id, u.avgRating);
                return `WHEN ${idParam} THEN ${valParam}`;
              })
              .join(' ');

            const ratingCountCases = updates
              .map((u) => {
                const idParam = `$${paramIdx++}`;
                const valParam = `$${paramIdx++}`;
                parameters.push(u.id, u.ratingCount);
                return `WHEN ${idParam} THEN ${valParam}`;
              })
              .join(' ');

            const idPlaceholders = updates
              .map((u) => {
                const p = `$${paramIdx++}`;
                parameters.push(u.id);
                return p;
              })
              .join(',');

            await manager.query(
              `
              UPDATE user_place
              SET
                average_rating = CASE id ${avgRatingCases} END,
                rating_count = CASE id ${ratingCountCases} END
              WHERE id IN (${idPlaceholders})
            `,
              parameters,
            );

            this.logger.log(
              `User place aggregate update complete: ${updates.length} places updated`,
            );
          });

          return { success: true };
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(
            `User place aggregate update failed: ${err.message}`,
            err.stack,
          );
          return { success: false };
        }
      },
      { timeoutMs: BATCH_CONFIG.ADVISORY_LOCK_TIMEOUT_MS },
    );

    if (timedOut) {
      this.logger.error('User place aggregate update timed out');
    }

    if (!acquired) {
      this.logger.warn(
        'User place aggregate update: Another instance is already running.',
      );
    }
  }
}
