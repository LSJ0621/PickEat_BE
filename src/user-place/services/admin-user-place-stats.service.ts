import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { PaginatedResponse } from '@/common/interfaces/pagination.interface';
import { AdminUserPlaceListQueryDto } from '../dto/admin-user-place-list-query.dto';
import { UserPlace } from '../entities/user-place.entity';

@Injectable()
export class AdminUserPlaceStatsService {
  private readonly logger = new Logger(AdminUserPlaceStatsService.name);

  constructor(
    @InjectRepository(UserPlace)
    private readonly userPlaceRepository: Repository<UserPlace>,
  ) {}

  /**
   * Admin: Get all user places with pagination and filters
   */
  async findAllForAdmin(
    query: AdminUserPlaceListQueryDto,
  ): Promise<PaginatedResponse<UserPlace>> {
    const { page = 1, limit = 10, status, userId, search } = query;

    const queryBuilder = this.userPlaceRepository
      .createQueryBuilder('userPlace')
      .leftJoinAndSelect('userPlace.user', 'user')
      .orderBy('userPlace.createdAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('userPlace.status = :status', { status });
    }
    if (userId) {
      queryBuilder.andWhere('userPlace.userId = :userId', { userId });
    }
    if (search) {
      const sanitized = search.replace(/[%_]/g, '\\$&');
      queryBuilder.andWhere(
        '(userPlace.name LIKE :search OR userPlace.address LIKE :search)',
        { search: `%${sanitized}%` },
      );
    }

    const [items, totalCount] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    this.logger.log(
      `Admin queried user places list: page=${page}, limit=${limit}, totalCount=${totalCount}`,
    );

    return {
      items,
      pageInfo: {
        page,
        limit,
        totalCount,
        hasNext: page * limit < totalCount,
      },
    };
  }

  /**
   * Admin: Get single user place detail
   */
  async findOneForAdmin(id: number): Promise<UserPlace> {
    const place = await this.userPlaceRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!place) {
      throw new NotFoundException({
        errorCode: ErrorCode.USER_PLACE_NOT_FOUND,
      });
    }

    return place;
  }
}
