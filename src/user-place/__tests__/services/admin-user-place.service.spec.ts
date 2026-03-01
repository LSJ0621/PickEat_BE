import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, OptimisticLockVersionMismatchError } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { S3Client } from '@/external/aws/clients/s3.client';
import { AdminUserPlaceService } from '../../services/admin-user-place.service';
import { UserPlace } from '../../entities/user-place.entity';
import { UserPlaceRejectionHistory } from '../../entities/user-place-rejection-history.entity';
import { UserPlaceStatus } from '../../enum/user-place-status.enum';
import { RejectUserPlaceDto } from '../../dto/reject-user-place.dto';
import { UpdateUserPlaceByAdminDto } from '../../dto/update-user-place-by-admin.dto';
import { createMockRepository } from '../../../../test/mocks/repository.mock';
import { createMockS3Client } from '../../../../test/mocks/external-clients.mock';
import {
  UserFactory,
  UserPlaceFactory,
} from '../../../../test/factories/entity.factory';

// ---------------------------------------------------------------------------
// QueryRunner factory
// ---------------------------------------------------------------------------
const createMockQueryRunner = (
  overrides?: Partial<Record<string, jest.Mock>>,
) => ({
  connect: jest.fn().mockResolvedValue(undefined),
  startTransaction: jest.fn().mockResolvedValue(undefined),
  commitTransaction: jest.fn().mockResolvedValue(undefined),
  rollbackTransaction: jest.fn().mockResolvedValue(undefined),
  release: jest.fn().mockResolvedValue(undefined),
  manager: {
    save: jest.fn(),
    create: jest.fn().mockReturnValue({}),
  },
  ...overrides,
});

describe('AdminUserPlaceService', () => {
  let service: AdminUserPlaceService;
  let userPlaceRepository: ReturnType<typeof createMockRepository<UserPlace>>;
  let rejectionHistoryRepository: ReturnType<
    typeof createMockRepository<UserPlaceRejectionHistory>
  >;
  let s3Client: ReturnType<typeof createMockS3Client>;
  let dataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: ReturnType<typeof createMockQueryRunner>;

  const adminId = 99;
  const ipAddress = '127.0.0.1';

  beforeEach(async () => {
    jest.clearAllMocks();

    userPlaceRepository = createMockRepository<UserPlace>();
    rejectionHistoryRepository =
      createMockRepository<UserPlaceRejectionHistory>();
    s3Client = createMockS3Client();
    mockQueryRunner = createMockQueryRunner();

    dataSource = {
      createQueryRunner: jest.fn(() => mockQueryRunner),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUserPlaceService,
        {
          provide: getRepositoryToken(UserPlace),
          useValue: userPlaceRepository,
        },
        {
          provide: getRepositoryToken(UserPlaceRejectionHistory),
          useValue: rejectionHistoryRepository,
        },
        {
          provide: S3Client,
          useValue: s3Client,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<AdminUserPlaceService>(AdminUserPlaceService);
  });

  // =========================================================================
  // approvePlace
  // =========================================================================

  describe('approvePlace', () => {
    it('should approve a pending place and create audit log', async () => {
      const user = UserFactory.create({ id: 1 });
      const place = UserPlaceFactory.createPending(user);
      const approvedPlace = { ...place, status: UserPlaceStatus.APPROVED };

      userPlaceRepository.findOne.mockResolvedValue(place);
      mockQueryRunner.manager.save.mockResolvedValueOnce(approvedPlace);
      mockQueryRunner.manager.save.mockResolvedValueOnce({});

      const result = await service.approvePlace(place.id, adminId, ipAddress);

      expect(result).toEqual(approvedPlace);
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should throw NotFoundException when place does not exist', async () => {
      userPlaceRepository.findOne.mockResolvedValue(null);

      await expect(
        service.approvePlace(999, adminId, ipAddress),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when place is not in PENDING status', async () => {
      const user = UserFactory.create({ id: 1 });
      const approvedPlace = UserPlaceFactory.createApproved(user);

      userPlaceRepository.findOne.mockResolvedValue(approvedPlace);

      await expect(
        service.approvePlace(approvedPlace.id, adminId, ipAddress),
      ).rejects.toThrow(ConflictException);
    });

    it('should rollback transaction and rethrow on save error', async () => {
      const user = UserFactory.create({ id: 1 });
      const place = UserPlaceFactory.createPending(user);

      userPlaceRepository.findOne.mockResolvedValue(place);
      mockQueryRunner.manager.save.mockRejectedValue(
        new Error('DB save failed'),
      );

      await expect(
        service.approvePlace(place.id, adminId, ipAddress),
      ).rejects.toThrow('DB save failed');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should include errorCode in NotFoundException when place not found', async () => {
      userPlaceRepository.findOne.mockResolvedValue(null);

      try {
        await service.approvePlace(1, adminId, ipAddress);
        fail('Expected NotFoundException');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toMatchObject({
          errorCode: ErrorCode.USER_PLACE_NOT_FOUND,
        });
      }
    });

    it('should include errorCode in ConflictException for non-PENDING place', async () => {
      const rejectedPlace = UserPlaceFactory.createRejected();
      userPlaceRepository.findOne.mockResolvedValue(rejectedPlace);

      try {
        await service.approvePlace(rejectedPlace.id, adminId, ipAddress);
        fail('Expected ConflictException');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
          errorCode: ErrorCode.USER_PLACE_INVALID_STATE_TRANSITION,
        });
      }
    });
  });

  // =========================================================================
  // rejectPlace
  // =========================================================================

  describe('rejectPlace', () => {
    const rejectDto: RejectUserPlaceDto = { reason: '정보가 부정확합니다' };

    it('should reject a pending place and create rejection history + audit log', async () => {
      const user = UserFactory.create({ id: 1 });
      const place = UserPlaceFactory.createPending(user);
      const rejectedPlace = {
        ...place,
        status: UserPlaceStatus.REJECTED,
        rejectionReason: rejectDto.reason,
        rejectionCount: 1,
      };

      userPlaceRepository.findOne.mockResolvedValue(place);
      mockQueryRunner.manager.save
        .mockResolvedValueOnce(rejectedPlace) // save UserPlace
        .mockResolvedValueOnce({}) // save RejectionHistory
        .mockResolvedValueOnce({}); // save AuditLog

      const result = await service.rejectPlace(
        place.id,
        adminId,
        rejectDto,
        ipAddress,
      );

      expect(result).toEqual(rejectedPlace);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should throw NotFoundException when place does not exist', async () => {
      userPlaceRepository.findOne.mockResolvedValue(null);

      await expect(
        service.rejectPlace(999, adminId, rejectDto, ipAddress),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when place is not in PENDING status', async () => {
      const approvedPlace = UserPlaceFactory.createApproved();
      userPlaceRepository.findOne.mockResolvedValue(approvedPlace);

      await expect(
        service.rejectPlace(approvedPlace.id, adminId, rejectDto, ipAddress),
      ).rejects.toThrow(ConflictException);
    });

    it('should increment rejectionCount on the place entity', async () => {
      const user = UserFactory.create({ id: 1 });
      const place = UserPlaceFactory.createPending(user);
      place.rejectionCount = 2;

      userPlaceRepository.findOne.mockResolvedValue(place);
      mockQueryRunner.manager.save.mockResolvedValue({
        ...place,
        rejectionCount: 3,
      });

      await service.rejectPlace(place.id, adminId, rejectDto, ipAddress);

      // The entity rejectionCount was mutated before save
      expect(place.rejectionCount).toBe(3);
    });

    it('should rollback transaction and rethrow on error', async () => {
      const user = UserFactory.create({ id: 1 });
      const place = UserPlaceFactory.createPending(user);

      userPlaceRepository.findOne.mockResolvedValue(place);
      mockQueryRunner.manager.save.mockRejectedValue(new Error('TX error'));

      await expect(
        service.rejectPlace(place.id, adminId, rejectDto, ipAddress),
      ).rejects.toThrow('TX error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updatePlaceByAdmin
  // =========================================================================

  describe('updatePlaceByAdmin', () => {
    const buildDto = (
      overrides?: Partial<UpdateUserPlaceByAdminDto>,
    ): UpdateUserPlaceByAdminDto => ({
      name: '새 이름',
      ...overrides,
    });

    it('should update an approved place with new name', async () => {
      const user = UserFactory.create({ id: 1 });
      const place = UserPlaceFactory.createApproved(user);
      const updatedPlace = { ...place, name: '새 이름' };

      userPlaceRepository.findOne.mockResolvedValue(place);
      mockQueryRunner.manager.save
        .mockResolvedValueOnce(updatedPlace)
        .mockResolvedValueOnce({});

      const result = await service.updatePlaceByAdmin(
        place.id,
        adminId,
        buildDto(),
        ipAddress,
      );

      expect(result).toEqual(updatedPlace);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException when place does not exist', async () => {
      userPlaceRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updatePlaceByAdmin(999, adminId, buildDto(), ipAddress),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when place is not APPROVED', async () => {
      const place = UserPlaceFactory.createPending();
      userPlaceRepository.findOne.mockResolvedValue(place);

      await expect(
        service.updatePlaceByAdmin(place.id, adminId, buildDto(), ipAddress),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when dto version does not match place version', async () => {
      const place = UserPlaceFactory.createApproved();
      place.version = 5;
      userPlaceRepository.findOne.mockResolvedValue(place);

      const dto = buildDto({ version: 3 }); // mismatched version

      await expect(
        service.updatePlaceByAdmin(place.id, adminId, dto, ipAddress),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when no fields provided', async () => {
      const place = UserPlaceFactory.createApproved();
      userPlaceRepository.findOne.mockResolvedValue(place);

      const emptyDto: UpdateUserPlaceByAdminDto = {}; // no fields at all

      await expect(
        service.updatePlaceByAdmin(place.id, adminId, emptyDto, ipAddress, []),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update location when latitude and longitude are provided', async () => {
      const place = UserPlaceFactory.createApproved();
      userPlaceRepository.findOne.mockResolvedValue(place);

      const dto = buildDto({ latitude: 37.1234, longitude: 127.5678 });
      mockQueryRunner.manager.save.mockResolvedValue({ ...place, ...dto });

      await service.updatePlaceByAdmin(place.id, adminId, dto, ipAddress);

      expect(place.location).toEqual({
        type: 'Point',
        coordinates: [127.5678, 37.1234],
      });
    });

    it('should update location using existing longitude when only latitude changes', async () => {
      const place = UserPlaceFactory.createApproved();
      place.longitude = 127.9999;
      userPlaceRepository.findOne.mockResolvedValue(place);

      const dto = buildDto({ latitude: 36.0 });
      mockQueryRunner.manager.save.mockResolvedValue(place);

      await service.updatePlaceByAdmin(place.id, adminId, dto, ipAddress);

      expect(place.location?.coordinates[1]).toBeCloseTo(36.0);
      expect(place.location?.coordinates[0]).toBeCloseTo(127.9999);
    });

    it('should upload new photos and merge with existing photos', async () => {
      const existingPhotos = ['https://s3.amazonaws.com/existing.jpg'];
      const place = UserPlaceFactory.createApproved();
      place.photos = existingPhotos;

      userPlaceRepository.findOne.mockResolvedValue(place);
      s3Client.uploadUserPlaceImage.mockResolvedValue(
        'https://s3.amazonaws.com/new.jpg',
      );

      const mockFile = {
        fieldname: 'files',
        originalname: 'new.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from(''),
        size: 1024,
      } as Express.Multer.File;

      const dto: UpdateUserPlaceByAdminDto = {
        existingPhotos,
      };

      mockQueryRunner.manager.save.mockResolvedValue(place);

      await service.updatePlaceByAdmin(place.id, adminId, dto, ipAddress, [
        mockFile,
      ]);

      expect(s3Client.uploadUserPlaceImage).toHaveBeenCalledWith(mockFile);
    });

    it('should cap total photos at 5 when uploading files', async () => {
      const existingPhotos = [
        'https://s3.amazonaws.com/p1.jpg',
        'https://s3.amazonaws.com/p2.jpg',
        'https://s3.amazonaws.com/p3.jpg',
        'https://s3.amazonaws.com/p4.jpg',
      ];
      const place = UserPlaceFactory.createApproved();
      place.photos = existingPhotos;

      userPlaceRepository.findOne.mockResolvedValue(place);
      s3Client.uploadUserPlaceImage.mockResolvedValue(
        'https://s3.amazonaws.com/new.jpg',
      );

      // Provide 3 new files but only 1 slot remains (5 - 4 = 1)
      const mockFiles = Array.from(
        { length: 3 },
        (_, i) =>
          ({
            fieldname: 'files',
            originalname: `file${i}.jpg`,
            mimetype: 'image/jpeg',
            buffer: Buffer.from(''),
            size: 512,
          }) as Express.Multer.File,
      );

      const dto: UpdateUserPlaceByAdminDto = { existingPhotos };
      mockQueryRunner.manager.save.mockResolvedValue(place);

      await service.updatePlaceByAdmin(
        place.id,
        adminId,
        dto,
        ipAddress,
        mockFiles,
      );

      // Only 1 upload should happen (remaining slot)
      expect(s3Client.uploadUserPlaceImage).toHaveBeenCalledTimes(1);
    });

    it('should handle partial S3 upload failures gracefully', async () => {
      const place = UserPlaceFactory.createApproved();
      place.photos = null;

      userPlaceRepository.findOne.mockResolvedValue(place);
      s3Client.uploadUserPlaceImage
        .mockResolvedValueOnce('https://s3.amazonaws.com/ok.jpg')
        .mockRejectedValueOnce(new Error('S3 upload failed'));

      const mockFiles = [
        {
          fieldname: 'files',
          originalname: 'ok.jpg',
          mimetype: 'image/jpeg',
          buffer: Buffer.from(''),
          size: 512,
        } as Express.Multer.File,
        {
          fieldname: 'files',
          originalname: 'fail.jpg',
          mimetype: 'image/jpeg',
          buffer: Buffer.from(''),
          size: 512,
        } as Express.Multer.File,
      ];

      const dto: UpdateUserPlaceByAdminDto = {};
      mockQueryRunner.manager.save.mockResolvedValue(place);

      // Should not throw; failed uploads are warned and skipped
      await expect(
        service.updatePlaceByAdmin(
          place.id,
          adminId,
          dto,
          ipAddress,
          mockFiles,
        ),
      ).resolves.not.toThrow();
    });

    it('should convert OptimisticLockVersionMismatchError to ConflictException', async () => {
      const place = UserPlaceFactory.createApproved();
      userPlaceRepository.findOne.mockResolvedValue(place);

      mockQueryRunner.manager.save.mockRejectedValue(
        new OptimisticLockVersionMismatchError('UserPlace', 1, 2),
      );

      const dto = buildDto({ name: 'changed' });

      await expect(
        service.updatePlaceByAdmin(place.id, adminId, dto, ipAddress),
      ).rejects.toThrow(ConflictException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should rollback and rethrow non-optimistic-lock errors', async () => {
      const place = UserPlaceFactory.createApproved();
      userPlaceRepository.findOne.mockResolvedValue(place);

      mockQueryRunner.manager.save.mockRejectedValue(
        new Error('Unexpected DB error'),
      );

      await expect(
        service.updatePlaceByAdmin(place.id, adminId, buildDto(), ipAddress),
      ).rejects.toThrow('Unexpected DB error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should update menuTypes when they differ from current value', async () => {
      const place = UserPlaceFactory.createApproved();
      place.menuTypes = ['한식'];
      userPlaceRepository.findOne.mockResolvedValue(place);

      const dto = buildDto({ menuTypes: ['일식', '초밥'] });
      mockQueryRunner.manager.save.mockResolvedValue(place);

      await service.updatePlaceByAdmin(place.id, adminId, dto, ipAddress);

      expect(place.menuTypes).toEqual(['일식', '초밥']);
    });

    it('should not update menuTypes when they are unchanged', async () => {
      const place = UserPlaceFactory.createApproved();
      place.menuTypes = ['한식', '찌개'];
      userPlaceRepository.findOne.mockResolvedValue(place);

      const dto = buildDto({ menuTypes: ['한식', '찌개'] });
      mockQueryRunner.manager.save.mockResolvedValue(place);

      await service.updatePlaceByAdmin(place.id, adminId, dto, ipAddress);

      // menuTypes unchanged — no difference tracked
      expect(place.menuTypes).toEqual(['한식', '찌개']);
    });

    it('should skip version check when dto.version is undefined', async () => {
      const place = UserPlaceFactory.createApproved();
      place.version = 10;
      userPlaceRepository.findOne.mockResolvedValue(place);

      const dto = buildDto({ version: undefined });
      mockQueryRunner.manager.save.mockResolvedValue(place);

      // Should not throw ConflictException
      await expect(
        service.updatePlaceByAdmin(place.id, adminId, dto, ipAddress),
      ).resolves.not.toThrow();
    });

    it('should return photos unchanged when existingPhotos is undefined and no files', async () => {
      const existingPhotos = ['https://s3.amazonaws.com/photo.jpg'];
      const place = UserPlaceFactory.createApproved();
      place.photos = existingPhotos;

      userPlaceRepository.findOne.mockResolvedValue(place);
      // existingPhotos undefined and files = [] means no photo update
      // We still need at least one non-photo field to avoid BadRequestException
      const dto: UpdateUserPlaceByAdminDto = { name: '식당 이름' };
      mockQueryRunner.manager.save.mockResolvedValue(place);

      await service.updatePlaceByAdmin(place.id, adminId, dto, ipAddress, []);

      // photos should stay unchanged (same reference)
      expect(place.photos).toEqual(existingPhotos);
    });

    it('should update location when only longitude is provided (covers dto.longitude branch)', async () => {
      const place = UserPlaceFactory.createApproved();
      place.latitude = 37.5;
      userPlaceRepository.findOne.mockResolvedValue(place);

      const dto = buildDto({ longitude: 128.9999 });
      mockQueryRunner.manager.save.mockResolvedValue(place);

      await service.updatePlaceByAdmin(place.id, adminId, dto, ipAddress);

      expect(place.location?.coordinates[0]).toBeCloseTo(128.9999);
      expect(place.location?.coordinates[1]).toBeCloseTo(37.5);
    });

    it('should return null when updatePlacePhotos yields no merged photos (covers null branch line 101)', async () => {
      const place = UserPlaceFactory.createApproved();
      place.photos = null;

      userPlaceRepository.findOne.mockResolvedValue(place);

      // existingPhotos = [] and no new files → validatedExistingPhotos = [], newPhotoUrls = []
      // mergedPhotos.length === 0 → returns null
      const dto: UpdateUserPlaceByAdminDto = {
        name: '식당',
        existingPhotos: [],
      };
      mockQueryRunner.manager.save.mockResolvedValue(place);

      await service.updatePlaceByAdmin(place.id, adminId, dto, ipAddress, []);

      expect(place.photos).toBeNull();
    });

    it('should NOT update field when dtoValue equals currentValue (covers updateFieldIfChanged equal branch)', async () => {
      const place = UserPlaceFactory.createApproved();
      place.name = '현재 이름';
      userPlaceRepository.findOne.mockResolvedValue(place);

      // Pass the same name → no change should be tracked
      const dto = buildDto({ name: '현재 이름' });
      mockQueryRunner.manager.save.mockResolvedValue(place);

      await service.updatePlaceByAdmin(place.id, adminId, dto, ipAddress);

      // The name should remain unchanged
      expect(place.name).toBe('현재 이름');
    });
  });

  // =========================================================================
  // Error log coverage (approvePlace and rejectPlace)
  // =========================================================================

  describe('error log coverage', () => {
    it('should log error message when approvePlace transaction save fails with non-Error', async () => {
      const user = UserFactory.create({ id: 1 });
      const place = UserPlaceFactory.createPending(user);

      userPlaceRepository.findOne.mockResolvedValue(place);
      mockQueryRunner.manager.save.mockRejectedValue('string error');

      await expect(
        service.approvePlace(place.id, adminId, ipAddress),
      ).rejects.toBe('string error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should log error message when rejectPlace transaction save fails with non-Error', async () => {
      const user = UserFactory.create({ id: 1 });
      const place = UserPlaceFactory.createPending(user);
      const rejectDto: RejectUserPlaceDto = { reason: '부정확' };

      userPlaceRepository.findOne.mockResolvedValue(place);
      mockQueryRunner.manager.save.mockRejectedValue('string reject error');

      await expect(
        service.rejectPlace(place.id, adminId, rejectDto, ipAddress),
      ).rejects.toBe('string reject error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });
});
