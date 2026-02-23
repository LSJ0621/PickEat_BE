import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  IsNull,
  OptimisticLockVersionMismatchError,
  Repository,
} from 'typeorm';
import { Point } from 'geojson';
import { ErrorCode } from '@/common/constants/error-codes';
import { User } from '@/user/entities/user.entity';
import { AdminAuditLog } from '@/admin/settings/entities/admin-audit-log.entity';
import { AUDIT_ACTIONS } from '@/admin/settings/constants/audit-action.constants';
import { S3Client } from '@/external/aws/clients/s3.client';
import { UpdateUserPlaceByAdminDto } from '../dto/update-user-place-by-admin.dto';
import { RejectUserPlaceDto } from '../dto/reject-user-place.dto';
import { UserPlace } from '../entities/user-place.entity';
import { UserPlaceRejectionHistory } from '../entities/user-place-rejection-history.entity';
import { UserPlaceStatus } from '../enum/user-place-status.enum';

@Injectable()
export class AdminUserPlaceService {
  private readonly logger = new Logger(AdminUserPlaceService.name);

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
   */
  private createLocationPoint(latitude: number, longitude: number): Point {
    return {
      type: 'Point',
      coordinates: [longitude, latitude], // GeoJSON: [lng, lat] 순서
    };
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
    if (existingPhotos === undefined && files.length === 0) {
      return place.photos;
    }

    const validatedExistingPhotos: string[] = [];
    if (existingPhotos !== undefined) {
      if (existingPhotos.length > 0) {
        const currentPhotos = place.photos || [];
        validatedExistingPhotos.push(
          ...existingPhotos.filter((url) => currentPhotos.includes(url)),
        );
      }
    } else {
      validatedExistingPhotos.push(...(place.photos || []));
    }

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
            `${failedCount} user place image upload(s) failed during admin update`,
          );
        }
      }
    }

    const mergedPhotos = [...validatedExistingPhotos, ...newPhotoUrls];
    return mergedPhotos.length > 0 ? mergedPhotos : null;
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
      throw new ConflictException({
        errorCode: ErrorCode.USER_PLACE_INVALID_STATE_TRANSITION,
      });
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
      throw new ConflictException({
        errorCode: ErrorCode.USER_PLACE_INVALID_STATE_TRANSITION,
      });
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
      throw new BadRequestException({
        errorCode: ErrorCode.USER_PLACE_INVALID_STATE_TRANSITION,
      });
    }

    if (dto.version !== undefined && place.version !== dto.version) {
      throw new ConflictException({
        errorCode: ErrorCode.USER_PLACE_OPTIMISTIC_LOCK_FAILED,
      });
    }

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

      this.updateFieldIfChanged(
        'name',
        dto.name,
        place.name,
        previousValue,
        newValue,
        place,
      );
      this.updateFieldIfChanged(
        'address',
        dto.address,
        place.address,
        previousValue,
        newValue,
        place,
      );
      this.updateFieldIfChanged(
        'latitude',
        dto.latitude,
        place.latitude,
        previousValue,
        newValue,
        place,
      );
      this.updateFieldIfChanged(
        'longitude',
        dto.longitude,
        place.longitude,
        previousValue,
        newValue,
        place,
      );

      if (dto.menuTypes !== undefined) {
        const menuTypesChanged =
          JSON.stringify(dto.menuTypes) !== JSON.stringify(place.menuTypes);
        if (menuTypesChanged) {
          previousValue.menuTypes = place.menuTypes;
          newValue.menuTypes = dto.menuTypes;
          place.menuTypes = dto.menuTypes;
        }
      }

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

      this.updateFieldIfChanged(
        'openingHours',
        dto.openingHours,
        place.openingHours,
        previousValue,
        newValue,
        place,
      );
      this.updateFieldIfChanged(
        'phoneNumber',
        dto.phoneNumber,
        place.phoneNumber,
        previousValue,
        newValue,
        place,
      );
      this.updateFieldIfChanged(
        'category',
        dto.category,
        place.category,
        previousValue,
        newValue,
        place,
      );
      this.updateFieldIfChanged(
        'description',
        dto.description,
        place.description,
        previousValue,
        newValue,
        place,
      );

      if (dto.latitude !== undefined || dto.longitude !== undefined) {
        const newLat = dto.latitude ?? place.latitude;
        const newLng = dto.longitude ?? place.longitude;
        place.location = this.createLocationPoint(
          Number(newLat),
          Number(newLng),
        );
      }

      const updated = await queryRunner.manager.save(UserPlace, place);

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
      if (error instanceof OptimisticLockVersionMismatchError) {
        throw new ConflictException({
          errorCode: ErrorCode.USER_PLACE_OPTIMISTIC_LOCK_FAILED,
        });
      }
      this.logger.error(
        `Failed to update user place ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private updateFieldIfChanged<K extends keyof UserPlace>(
    field: K,
    dtoValue: UserPlace[K] | undefined,
    currentValue: UserPlace[K],
    previousValue: Record<string, unknown>,
    newValue: Record<string, unknown>,
    entity: UserPlace,
  ): void {
    if (dtoValue !== undefined && dtoValue !== currentValue) {
      previousValue[field as string] = currentValue;
      newValue[field as string] = dtoValue;
      entity[field] = dtoValue;
    }
  }
}
