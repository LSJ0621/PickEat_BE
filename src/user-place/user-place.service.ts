import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, IsNull, Like, Repository } from 'typeorm';
import { Point } from 'geojson';
import { ErrorCode } from '@/common/constants/error-codes';
import { USER_PLACE } from '@/common/constants/business.constants';
import { User } from '@/user/entities/user.entity';
import { AdminAuditLog } from '@/admin/settings/entities/admin-audit-log.entity';
import { AUDIT_ACTIONS } from '@/admin/settings/constants/audit-action.constants';
import { S3Client } from '@/external/aws/clients/s3.client';
import { CreateUserPlaceDto } from './dto/create-user-place.dto';
import { UpdateUserPlaceDto } from './dto/update-user-place.dto';
import { UpdateUserPlaceByAdminDto } from './dto/update-user-place-by-admin.dto';
import { UserPlaceListQueryDto } from './dto/user-place-list-query.dto';
import { AdminUserPlaceListQueryDto } from './dto/admin-user-place-list-query.dto';
import { CheckRegistrationDto } from './dto/check-registration.dto';
import {
  CheckRegistrationResponseDto,
  NearbyPlaceDto,
} from './dto/check-registration-response.dto';
import { RejectUserPlaceDto } from './dto/reject-user-place.dto';
import { UserPlace } from './entities/user-place.entity';
import { UserPlaceRejectionHistory } from './entities/user-place-rejection-history.entity';
import { UserPlaceStatus } from './enum/user-place-status.enum';

@Injectable()
export class UserPlaceService {
  private readonly logger = new Logger(UserPlaceService.name);

  constructor(
    @InjectRepository(UserPlace)
    private readonly userPlaceRepository: Repository<UserPlace>,
    @InjectRepository(UserPlaceRejectionHistory)
    private readonly rejectionHistoryRepository: Repository<UserPlaceRejectionHistory>,
    private readonly s3Client: S3Client,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create a GeoJSON Point from latitude and longitude
   * @param latitude - Latitude
   * @param longitude - Longitude
   * @returns GeoJSON Point (coordinates: [lng, lat] order)
   */
  private createLocationPoint(latitude: number, longitude: number): Point {
    return {
      type: 'Point',
      coordinates: [longitude, latitude], // GeoJSON: [lng, lat] 순서
    };
  }

  /**
   * Get UTC date range for today (00:00 ~ 23:59)
   */
  private getTodayUTCRange(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    const end = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
    return { start, end };
  }

  /**
   * Update place photos
   * Merges existing photos with new uploads, enforcing max 5 photos total
   */
  private async updatePlacePhotos(
    place: UserPlace,
    existingPhotos: string[] | undefined,
    files: Express.Multer.File[] = [],
  ): Promise<string[] | null> {
    // If existingPhotos is not provided and no new files, keep existing photos
    if (existingPhotos === undefined && files.length === 0) {
      return place.photos;
    }

    // Validate existing photo URLs (security: only allow URLs from place.photos)
    // If existingPhotos is undefined, preserve place.photos (defensive measure)
    const validatedExistingPhotos: string[] = [];
    if (existingPhotos !== undefined) {
      // existingPhotos is provided (can be empty array or array with URLs)
      if (existingPhotos.length > 0) {
        const currentPhotos = place.photos || [];
        validatedExistingPhotos.push(
          ...existingPhotos.filter((url) => currentPhotos.includes(url)),
        );
      }
      // else: existingPhotos = [] means user wants to remove all existing photos
    } else {
      // existingPhotos is undefined - preserve current photos (defensive)
      validatedExistingPhotos.push(...(place.photos || []));
    }

    // Upload new files to S3
    const newPhotoUrls: string[] = [];
    if (files && files.length > 0) {
      const remainingSlots = 5 - validatedExistingPhotos.length;
      const filesToUpload = files.slice(0, remainingSlots);

      for (const file of filesToUpload) {
        const url = await this.s3Client.uploadUserPlaceImage(file);
        newPhotoUrls.push(url);
      }
    }

    // Merge existing + new photos (max 5 total)
    const mergedPhotos = [...validatedExistingPhotos, ...newPhotoUrls];

    // Return null if empty (to set photos = null in DB), otherwise return array
    return mergedPhotos.length > 0 ? mergedPhotos : null;
  }

  /**
   * Check daily registration count
   */
  private async checkDailyLimit(userId: number): Promise<number> {
    const { start, end } = this.getTodayUTCRange();
    const count = await this.userPlaceRepository.count({
      where: {
        user: { id: userId },
        createdAt: Between(start, end),
      },
    });
    return USER_PLACE.DAILY_REGISTRATION_LIMIT - count;
  }

  /**
   * Check for duplicate registration (exact name + address match)
   */
  private async checkDuplicate(
    userId: number,
    name: string,
    address: string,
  ): Promise<boolean> {
    const existing = await this.userPlaceRepository.findOne({
      where: {
        user: { id: userId },
        name,
        address,
      },
    });
    return !!existing;
  }

  /**
   * Find nearby places within specified radius
   */
  private async findNearbyPlaces(
    userId: number,
    latitude: number,
    longitude: number,
    radiusMeters: number = USER_PLACE.NEARBY_SEARCH_RADIUS_METERS,
  ): Promise<NearbyPlaceDto[]> {
    const result = await this.userPlaceRepository
      .createQueryBuilder('userPlace')
      .addSelect(
        `ST_Distance(
        userPlace.location,
        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography
      )`,
        'distance',
      )
      .where('userPlace.userId = :userId', { userId })
      .andWhere(
        `ST_DWithin(
        userPlace.location,
        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
        :radiusMeters
      )`,
      )
      .setParameters({ latitude, longitude, radiusMeters })
      .orderBy('distance', 'ASC')
      .getRawAndEntities();

    return result.entities.map((entity, index) => {
      const rawDistance = result.raw[index]?.distance;
      const distanceInMeters = rawDistance
        ? Math.round(parseFloat(String(rawDistance)))
        : 0;

      return {
        id: entity.id,
        name: entity.name,
        address: entity.address,
        distance: distanceInMeters,
      };
    });
  }

  /**
   * Check if user can register a new place
   */
  async checkRegistration(
    userId: number,
    dto: CheckRegistrationDto,
  ): Promise<CheckRegistrationResponseDto> {
    const dailyRemaining = await this.checkDailyLimit(userId);
    const duplicateExists = await this.checkDuplicate(
      userId,
      dto.name,
      dto.address,
    );
    const nearbyPlaces = await this.findNearbyPlaces(
      userId,
      dto.latitude,
      dto.longitude,
    );

    const canRegister = dailyRemaining > 0 && !duplicateExists;

    return {
      canRegister,
      dailyRemaining,
      duplicateExists,
      nearbyPlaces,
    };
  }

  /**
   * Create a new user place
   */
  async create(
    userId: number,
    dto: CreateUserPlaceDto,
    files: Express.Multer.File[] = [],
  ): Promise<UserPlace> {
    // Check daily limit
    const dailyRemaining = await this.checkDailyLimit(userId);
    if (dailyRemaining <= 0) {
      throw new BadRequestException({
        errorCode: ErrorCode.USER_PLACE_DAILY_LIMIT_EXCEEDED,
      });
    }

    // Check duplicate
    const duplicateExists = await this.checkDuplicate(
      userId,
      dto.name,
      dto.address,
    );
    if (duplicateExists) {
      throw new BadRequestException({
        errorCode: ErrorCode.USER_PLACE_DUPLICATE_REGISTRATION,
      });
    }

    // 이미지 업로드 (최대 5장) - S3 URL만 저장
    const imageUrls: string[] | null =
      files && files.length > 0
        ? await Promise.all(
            files.slice(0, 5).map(async (file) => {
              const url = await this.s3Client.uploadUserPlaceImage(file);
              return url;
            }),
          )
        : null;

    const userPlace = this.userPlaceRepository.create({
      user: { id: userId } as User,
      name: dto.name,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      location: this.createLocationPoint(dto.latitude, dto.longitude),
      menuTypes: dto.menuTypes,
      photos: imageUrls,
      openingHours: dto.openingHours || null,
      phoneNumber: dto.phoneNumber || null,
      category: dto.category || null,
      description: dto.description || null,
      status: UserPlaceStatus.PENDING,
      lastSubmittedAt: new Date(),
    });

    const saved = await this.userPlaceRepository.save(userPlace);
    this.logger.log(`User place created: ${saved.id} by user ${userId}`);
    return saved;
  }

  /**
   * Get user's place list with pagination
   */
  async findAll(
    userId: number,
    query: UserPlaceListQueryDto,
  ): Promise<{
    items: UserPlace[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 10, status, search } = query;

    const whereCondition: Record<string, unknown> = { user: { id: userId } };
    if (status) {
      whereCondition.status = status;
    }
    if (search) {
      const sanitized = search.replace(/[%_]/g, '\\$&');
      whereCondition.name = Like(`%${sanitized}%`);
    }

    const [data, total] = await this.userPlaceRepository.findAndCount({
      where: whereCondition,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get single user place detail
   */
  async findOne(userId: number, id: number): Promise<UserPlace> {
    const place = await this.userPlaceRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!place) {
      throw new NotFoundException({
        errorCode: ErrorCode.USER_PLACE_NOT_FOUND,
      });
    }

    return place;
  }

  /**
   * Update user place (only PENDING or REJECTED status)
   */
  async update(
    userId: number,
    id: number,
    dto: UpdateUserPlaceDto,
    files: Express.Multer.File[] = [],
  ): Promise<UserPlace> {
    const place = await this.findOne(userId, id);

    // Only PENDING or REJECTED can be edited
    if (
      place.status !== UserPlaceStatus.PENDING &&
      place.status !== UserPlaceStatus.REJECTED
    ) {
      throw new ForbiddenException({
        errorCode: ErrorCode.USER_PLACE_NOT_EDITABLE,
      });
    }

    // Optimistic locking check
    if (place.version !== dto.version) {
      throw new BadRequestException({
        errorCode: ErrorCode.USER_PLACE_OPTIMISTIC_LOCK_FAILED,
      });
    }

    // Update fields
    if (dto.name !== undefined) place.name = dto.name;
    if (dto.address !== undefined) place.address = dto.address;
    if (dto.latitude !== undefined) place.latitude = dto.latitude;
    if (dto.longitude !== undefined) place.longitude = dto.longitude;
    if (dto.menuTypes !== undefined) place.menuTypes = dto.menuTypes;
    if (dto.openingHours !== undefined) place.openingHours = dto.openingHours;
    if (dto.phoneNumber !== undefined) place.phoneNumber = dto.phoneNumber;
    if (dto.category !== undefined) place.category = dto.category;
    if (dto.description !== undefined) place.description = dto.description;

    // Handle photo updates
    const updatedPhotos = await this.updatePlacePhotos(
      place,
      dto.existingPhotos,
      files,
    );
    place.photos = updatedPhotos;

    // Update location if coordinates changed
    if (dto.latitude !== undefined || dto.longitude !== undefined) {
      const newLat = dto.latitude ?? place.latitude;
      const newLng = dto.longitude ?? place.longitude;
      place.location = this.createLocationPoint(Number(newLat), Number(newLng));
    }

    // Reset to PENDING if it was REJECTED
    if (place.status === UserPlaceStatus.REJECTED) {
      place.status = UserPlaceStatus.PENDING;
      place.rejectionReason = null;
      place.lastSubmittedAt = new Date();
    }

    const updated = await this.userPlaceRepository.save(place);
    this.logger.log(`User place updated: ${id} by user ${userId}`);
    return updated;
  }

  /**
   * Delete user place (only PENDING or REJECTED status)
   */
  async remove(userId: number, id: number): Promise<void> {
    const place = await this.findOne(userId, id);

    // Only PENDING or REJECTED can be deleted
    if (
      place.status !== UserPlaceStatus.PENDING &&
      place.status !== UserPlaceStatus.REJECTED
    ) {
      throw new ForbiddenException({
        errorCode: ErrorCode.USER_PLACE_NOT_DELETABLE,
      });
    }

    await this.userPlaceRepository.softRemove(place);
    this.logger.log(`User place soft deleted: ${id} by user ${userId}`);
  }

  /**
   * Admin: Get all user places with pagination and filters
   */
  async findAllForAdmin(query: AdminUserPlaceListQueryDto): Promise<{
    items: UserPlace[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
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

    const [items, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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

  /**
   * Admin: Approve a user place
   */
  async approvePlace(
    id: number,
    adminId: number,
    ipAddress: string,
  ): Promise<UserPlace> {
    const place = await this.userPlaceRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['user'],
    });

    if (!place) {
      throw new NotFoundException({
        errorCode: ErrorCode.USER_PLACE_NOT_FOUND,
      });
    }

    if (place.status !== UserPlaceStatus.PENDING) {
      throw new ConflictException(
        `Cannot approve place with status ${place.status}. Only PENDING places can be approved.`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const previousStatus = place.status;
      place.status = UserPlaceStatus.APPROVED;

      const updated = await queryRunner.manager.save(UserPlace, place);

      const auditLog = queryRunner.manager.create(AdminAuditLog, {
        adminId,
        action: AUDIT_ACTIONS.PLACE_APPROVED,
        target: `user-place:${id}`,
        previousValue: { status: previousStatus },
        newValue: { status: UserPlaceStatus.APPROVED },
        ipAddress,
      });
      await queryRunner.manager.save(AdminAuditLog, auditLog);

      await queryRunner.commitTransaction();

      this.logger.log(`Admin ${adminId} approved user place ${id}`);
      return updated;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to approve user place ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Admin: Reject a user place with reason
   */
  async rejectPlace(
    id: number,
    adminId: number,
    dto: RejectUserPlaceDto,
    ipAddress: string,
  ): Promise<UserPlace> {
    const place = await this.userPlaceRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['user'],
    });

    if (!place) {
      throw new NotFoundException({
        errorCode: ErrorCode.USER_PLACE_NOT_FOUND,
      });
    }

    if (place.status !== UserPlaceStatus.PENDING) {
      throw new ConflictException(
        `Cannot reject place with status ${place.status}. Only PENDING places can be rejected.`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const previousStatus = place.status;
      const previousRejectionCount = place.rejectionCount;

      place.status = UserPlaceStatus.REJECTED;
      place.rejectionReason = dto.reason;
      place.rejectionCount += 1;
      place.lastRejectedAt = new Date();

      const updated = await queryRunner.manager.save(UserPlace, place);

      const rejectionHistory = queryRunner.manager.create(
        UserPlaceRejectionHistory,
        {
          userPlace: { id: place.id } as UserPlace,
          admin: { id: adminId } as User,
          reason: dto.reason,
        },
      );
      await queryRunner.manager.save(
        UserPlaceRejectionHistory,
        rejectionHistory,
      );

      const auditLog = queryRunner.manager.create(AdminAuditLog, {
        adminId,
        action: AUDIT_ACTIONS.PLACE_REJECTED,
        target: `user-place:${id}`,
        previousValue: {
          status: previousStatus,
          rejectionCount: previousRejectionCount,
        },
        newValue: {
          status: UserPlaceStatus.REJECTED,
          rejectionCount: place.rejectionCount,
          rejectionReason: dto.reason,
        },
        ipAddress,
      });
      await queryRunner.manager.save(AdminAuditLog, auditLog);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Admin ${adminId} rejected user place ${id} (count: ${place.rejectionCount})`,
      );
      return updated;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to reject user place ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Admin: Update place information (only APPROVED places can be edited)
   */
  async updatePlaceByAdmin(
    id: number,
    adminId: number,
    dto: UpdateUserPlaceByAdminDto,
    ipAddress: string,
    files: Express.Multer.File[] = [],
  ): Promise<UserPlace> {
    const place = await this.userPlaceRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['user'],
    });

    if (!place) {
      throw new NotFoundException({
        errorCode: ErrorCode.USER_PLACE_NOT_FOUND,
      });
    }

    if (place.status !== UserPlaceStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot edit place with status ${place.status}. Only APPROVED places can be edited by admin.`,
      );
    }

    // Check optimistic locking if version is provided
    if (dto.version !== undefined && place.version !== dto.version) {
      throw new BadRequestException({
        errorCode: ErrorCode.USER_PLACE_OPTIMISTIC_LOCK_FAILED,
      });
    }

    // Check if DTO has any fields to update
    const hasAnyField =
      dto.name !== undefined ||
      dto.address !== undefined ||
      dto.latitude !== undefined ||
      dto.longitude !== undefined ||
      dto.menuTypes !== undefined ||
      dto.existingPhotos !== undefined ||
      dto.openingHours !== undefined ||
      dto.phoneNumber !== undefined ||
      dto.category !== undefined ||
      dto.description !== undefined ||
      files.length > 0;

    if (!hasAnyField) {
      throw new BadRequestException('No fields provided for update');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const previousValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};

      // Update fields and track changes
      if (dto.name !== undefined && dto.name !== place.name) {
        previousValue.name = place.name;
        newValue.name = dto.name;
        place.name = dto.name;
      }
      if (dto.address !== undefined && dto.address !== place.address) {
        previousValue.address = place.address;
        newValue.address = dto.address;
        place.address = dto.address;
      }
      if (dto.latitude !== undefined && dto.latitude !== place.latitude) {
        previousValue.latitude = place.latitude;
        newValue.latitude = dto.latitude;
        place.latitude = dto.latitude;
      }
      if (dto.longitude !== undefined && dto.longitude !== place.longitude) {
        previousValue.longitude = place.longitude;
        newValue.longitude = dto.longitude;
        place.longitude = dto.longitude;
      }
      if (dto.menuTypes !== undefined) {
        const menuTypesChanged =
          JSON.stringify(dto.menuTypes) !== JSON.stringify(place.menuTypes);
        if (menuTypesChanged) {
          previousValue.menuTypes = place.menuTypes;
          newValue.menuTypes = dto.menuTypes;
          place.menuTypes = dto.menuTypes;
        }
      }

      // Handle photo updates
      const updatedPhotos = await this.updatePlacePhotos(
        place,
        dto.existingPhotos,
        files,
      );
      const photosChanged =
        JSON.stringify(updatedPhotos) !== JSON.stringify(place.photos);
      if (photosChanged) {
        previousValue.photos = place.photos;
        newValue.photos = updatedPhotos;
        place.photos = updatedPhotos;
      }

      if (dto.openingHours !== undefined) {
        previousValue.openingHours = place.openingHours;
        newValue.openingHours = dto.openingHours;
        place.openingHours = dto.openingHours;
      }
      if (dto.phoneNumber !== undefined) {
        previousValue.phoneNumber = place.phoneNumber;
        newValue.phoneNumber = dto.phoneNumber;
        place.phoneNumber = dto.phoneNumber;
      }
      if (dto.category !== undefined) {
        previousValue.category = place.category;
        newValue.category = dto.category;
        place.category = dto.category;
      }
      if (dto.description !== undefined) {
        previousValue.description = place.description;
        newValue.description = dto.description;
        place.description = dto.description;
      }

      // Update location if coordinates changed
      if (dto.latitude !== undefined || dto.longitude !== undefined) {
        const newLat = dto.latitude ?? place.latitude;
        const newLng = dto.longitude ?? place.longitude;
        place.location = this.createLocationPoint(
          Number(newLat),
          Number(newLng),
        );
      }

      const updated = await queryRunner.manager.save(UserPlace, place);

      // Record audit log
      const auditLog = queryRunner.manager.create(AdminAuditLog, {
        adminId,
        action: AUDIT_ACTIONS.PLACE_UPDATED,
        target: `user-place:${id}`,
        previousValue,
        newValue,
        ipAddress,
      });
      await queryRunner.manager.save(AdminAuditLog, auditLog);

      await queryRunner.commitTransaction();

      this.logger.log(`Admin ${adminId} updated user place ${id}`);
      return updated;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to update user place ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
