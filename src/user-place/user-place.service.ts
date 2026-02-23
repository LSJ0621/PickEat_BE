import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  Like,
  OptimisticLockVersionMismatchError,
  Repository,
} from 'typeorm';
import { Point } from 'geojson';
import { ErrorCode } from '@/common/constants/error-codes';
import { USER_PLACE } from '@/common/constants/business.constants';
import { User } from '@/user/entities/user.entity';
import { S3Client } from '@/external/aws/clients/s3.client';
import { CreateUserPlaceDto } from './dto/create-user-place.dto';
import { UpdateUserPlaceDto } from './dto/update-user-place.dto';
import { UserPlaceListQueryDto } from './dto/user-place-list-query.dto';
import { CheckRegistrationDto } from './dto/check-registration.dto';
import {
  CheckRegistrationResponseDto,
  NearbyPlaceDto,
} from './dto/check-registration-response.dto';
import { UserPlace } from './entities/user-place.entity';
import { UserPlaceStatus } from './enum/user-place-status.enum';
import { UserPlaceListResult } from './interfaces/user-place-list-result.interface';

@Injectable()
export class UserPlaceService {
  private readonly logger = new Logger(UserPlaceService.name);

  constructor(
    @InjectRepository(UserPlace)
    private readonly userPlaceRepository: Repository<UserPlace>,
    private readonly s3Client: S3Client,
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

      if (filesToUpload.length > 0) {
        const results = await Promise.allSettled(
          filesToUpload.map((file) => this.s3Client.uploadUserPlaceImage(file)),
        );
        for (const result of results) {
          if (result.status === 'fulfilled') {
            newPhotoUrls.push(result.value);
          }
        }
        const failedCount = results.filter(
          (r) => r.status === 'rejected',
        ).length;
        if (failedCount > 0) {
          this.logger.warn(
            `${failedCount} user place image upload(s) failed during update`,
          );
        }
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
    let imageUrls: string[] | null = null;
    if (files && files.length > 0) {
      const results = await Promise.allSettled(
        files
          .slice(0, 5)
          .map((file) => this.s3Client.uploadUserPlaceImage(file)),
      );
      const successUrls = results
        .filter(
          (r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled',
        )
        .map((r) => r.value);
      const failedCount = results.filter((r) => r.status === 'rejected').length;
      if (failedCount > 0) {
        this.logger.warn(
          `${failedCount} user place image upload(s) failed during creation`,
        );
      }
      imageUrls = successUrls.length > 0 ? successUrls : null;
    }

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
  ): Promise<UserPlaceListResult> {
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
      throw new ConflictException({
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

    try {
      const updated = await this.userPlaceRepository.save(place);
      this.logger.log(`User place updated: ${id} by user ${userId}`);
      return updated;
    } catch (error) {
      if (error instanceof OptimisticLockVersionMismatchError) {
        throw new ConflictException({
          errorCode: ErrorCode.USER_PLACE_OPTIMISTIC_LOCK_FAILED,
        });
      }
      throw error;
    }
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
}
