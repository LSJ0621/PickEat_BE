import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository, IsNull } from 'typeorm';
import { RatingService } from '../rating.service';
import { PlaceRating } from '../entities/place-rating.entity';
import { ErrorCode } from '@/common/constants/error-codes';
import { SelectPlaceDto } from '../dto/select-place.dto';
import { SubmitRatingDto } from '../dto/submit-rating.dto';
import { SkipRatingDto } from '../dto/skip-rating.dto';
import { UserFactory } from '../../../test/factories/entity.factory';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import type { User } from '@/user/entities/user.entity';

describe('RatingService', () => {
  let service: RatingService;
  let placeRatingRepository: jest.Mocked<Repository<PlaceRating>>;

  const mockUser: User = {
    ...UserFactory.create({
      id: 1,
      email: 'test@example.com',
    }),
    isDeactivated: false,
    deactivatedAt: null,
    lastActiveAt: null,
    lastLoginAt: null,
  };

  const mockDeactivatedUser: User = {
    ...UserFactory.create({
      id: 2,
      email: 'deactivated@example.com',
    }),
    isDeactivated: true,
    deactivatedAt: new Date('2026-01-01T00:00:00Z'),
    lastActiveAt: null,
    lastLoginAt: null,
  };

  beforeEach(async () => {
    placeRatingRepository = createMockRepository<PlaceRating>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingService,
        {
          provide: getRepositoryToken(PlaceRating),
          useValue: placeRatingRepository,
        },
      ],
    }).compile();

    service = module.get<RatingService>(RatingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('selectPlace', () => {
    const selectPlaceDto: SelectPlaceDto = {
      placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      placeName: '맛있는 식당',
      placeRecommendationId: 100,
    };

    const mockPlaceRating: Partial<PlaceRating> = {
      id: 1,
      placeId: selectPlaceDto.placeId,
      placeName: selectPlaceDto.placeName,
      rating: null,
      skipped: false,
      createdAt: new Date('2026-02-15T10:00:00Z'),
    };

    it('should create place rating when user selects a place', async () => {
      // Arrange
      placeRatingRepository.create.mockReturnValue(
        mockPlaceRating as PlaceRating,
      );
      placeRatingRepository.save.mockResolvedValue(
        mockPlaceRating as PlaceRating,
      );

      // Act
      const result = await service.selectPlace(mockUser, selectPlaceDto);

      // Assert
      expect(result).toEqual({
        id: mockPlaceRating.id,
        placeId: mockPlaceRating.placeId,
        placeName: mockPlaceRating.placeName,
        createdAt: mockPlaceRating.createdAt?.toISOString(),
      });
      expect(placeRatingRepository.create).toHaveBeenCalledWith({
        user: mockUser,
        placeId: selectPlaceDto.placeId,
        placeName: selectPlaceDto.placeName,
        placeRecommendation: { id: selectPlaceDto.placeRecommendationId },
        rating: null,
        skipped: false,
      });
      expect(placeRatingRepository.save).toHaveBeenCalledWith(mockPlaceRating);
    });

    it('should create place rating without placeRecommendationId when not provided', async () => {
      // Arrange
      const dtoWithoutRecommendation: SelectPlaceDto = {
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        placeName: '맛있는 식당',
      };
      placeRatingRepository.create.mockReturnValue(
        mockPlaceRating as PlaceRating,
      );
      placeRatingRepository.save.mockResolvedValue(
        mockPlaceRating as PlaceRating,
      );

      // Act
      await service.selectPlace(mockUser, dtoWithoutRecommendation);

      // Assert
      expect(placeRatingRepository.create).toHaveBeenCalledWith({
        user: mockUser,
        placeId: dtoWithoutRecommendation.placeId,
        placeName: dtoWithoutRecommendation.placeName,
        placeRecommendation: null,
        rating: null,
        skipped: false,
      });
    });

    it('should throw ForbiddenException when user is deactivated', async () => {
      // Act & Assert
      await expect(
        service.selectPlace(mockDeactivatedUser, selectPlaceDto),
      ).rejects.toThrow(new ForbiddenException(ErrorCode.FORBIDDEN));

      expect(placeRatingRepository.create).not.toHaveBeenCalled();
      expect(placeRatingRepository.save).not.toHaveBeenCalled();
    });

    it('should return response with correct ISO date format', async () => {
      // Arrange
      const fixedDate = new Date('2026-02-15T12:30:45.123Z');
      const placeRatingWithDate = {
        ...mockPlaceRating,
        createdAt: fixedDate,
      };
      placeRatingRepository.create.mockReturnValue(
        placeRatingWithDate as PlaceRating,
      );
      placeRatingRepository.save.mockResolvedValue(
        placeRatingWithDate as PlaceRating,
      );

      // Act
      const result = await service.selectPlace(mockUser, selectPlaceDto);

      // Assert
      expect(result.createdAt).toBe(fixedDate.toISOString());
    });
  });

  describe('getPendingRating', () => {
    const mockDbRating: Partial<PlaceRating> = {
      id: 1,
      placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      placeName: '맛있는 식당',
      rating: null,
      skipped: false,
      createdAt: new Date('2026-02-15T10:00:00Z'),
    };

    it('should return null when no pending rating in DB', async () => {
      // Arrange
      placeRatingRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getPendingRating(mockUser);

      // Assert
      expect(result).toBeNull();
      expect(placeRatingRepository.findOne).toHaveBeenCalledWith({
        where: {
          user: { id: mockUser.id },
          rating: IsNull(),
          skipped: false,
          promptDismissed: false,
        },
        order: { createdAt: 'DESC' },
      });
    });

    it('should return pending rating from DB when it exists', async () => {
      // Arrange
      placeRatingRepository.findOne.mockResolvedValue(
        mockDbRating as PlaceRating,
      );

      // Act
      const result = await service.getPendingRating(mockUser);

      // Assert
      expect(result).toEqual({
        id: mockDbRating.id,
        placeId: mockDbRating.placeId,
        placeName: mockDbRating.placeName,
        createdAt: mockDbRating.createdAt?.toISOString(),
      });
      expect(placeRatingRepository.findOne).toHaveBeenCalledWith({
        where: {
          user: { id: mockUser.id },
          rating: IsNull(),
          skipped: false,
          promptDismissed: false,
        },
        order: { createdAt: 'DESC' },
      });
    });

    it('should query with correct conditions for pending ratings', async () => {
      // Arrange
      placeRatingRepository.findOne.mockResolvedValue(null);

      // Act
      await service.getPendingRating(mockUser);

      // Assert
      expect(placeRatingRepository.findOne).toHaveBeenCalledWith({
        where: {
          user: { id: mockUser.id },
          rating: IsNull(),
          skipped: false,
          promptDismissed: false,
        },
        order: { createdAt: 'DESC' },
      });
    });

    it('should return most recent pending rating when multiple exist', async () => {
      // Arrange
      const recentRating: Partial<PlaceRating> = {
        id: 2,
        placeId: 'recent_place',
        placeName: '최근 식당',
        rating: null,
        skipped: false,
        createdAt: new Date('2026-02-15T12:00:00Z'),
      };
      placeRatingRepository.findOne.mockResolvedValue(
        recentRating as PlaceRating,
      );

      // Act
      const result = await service.getPendingRating(mockUser);

      // Assert
      expect(result?.id).toBe(2);
      expect(placeRatingRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });

  describe('submitRating', () => {
    const submitRatingDto: SubmitRatingDto = {
      placeRatingId: 1,
      rating: 5,
    };

    const mockPlaceRating: Partial<PlaceRating> = {
      id: 1,
      placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      placeName: '맛있는 식당',
      user: mockUser,
      rating: null,
      skipped: false,
    };

    it('should submit rating when valid', async () => {
      // Arrange
      placeRatingRepository.findOne.mockResolvedValue(
        mockPlaceRating as PlaceRating,
      );
      const updatedRating = { ...mockPlaceRating, rating: 5 };
      placeRatingRepository.save.mockResolvedValue(
        updatedRating as PlaceRating,
      );

      // Act
      await service.submitRating(mockUser, submitRatingDto);

      // Assert
      expect(placeRatingRepository.findOne).toHaveBeenCalledWith({
        where: { id: submitRatingDto.placeRatingId },
        relations: ['user'],
      });
      expect(placeRatingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          rating: submitRatingDto.rating,
        }),
      );
    });

    it('should throw ForbiddenException when user is deactivated', async () => {
      // Act & Assert
      await expect(
        service.submitRating(mockDeactivatedUser, submitRatingDto),
      ).rejects.toThrow(new ForbiddenException(ErrorCode.FORBIDDEN));

      expect(placeRatingRepository.findOne).not.toHaveBeenCalled();
      expect(placeRatingRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when place rating does not exist', async () => {
      // Arrange
      placeRatingRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.submitRating(mockUser, submitRatingDto),
      ).rejects.toThrow(
        new NotFoundException(ErrorCode.PLACE_RATING_NOT_FOUND),
      );

      expect(placeRatingRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user does not own the rating', async () => {
      // Arrange
      const otherUser = UserFactory.create({
        id: 99,
        email: 'other@example.com',
      });
      const otherUserRating = {
        ...mockPlaceRating,
        user: otherUser,
      };
      placeRatingRepository.findOne.mockResolvedValue(
        otherUserRating as PlaceRating,
      );

      // Act & Assert
      await expect(
        service.submitRating(mockUser, submitRatingDto),
      ).rejects.toThrow(new ForbiddenException(ErrorCode.FORBIDDEN));

      expect(placeRatingRepository.save).not.toHaveBeenCalled();
    });

    it('should update rating value correctly for all valid ratings (1-5)', async () => {
      // Test all valid rating values
      const validRatings = [1, 2, 3, 4, 5];

      for (const ratingValue of validRatings) {
        jest.clearAllMocks();

        // Arrange
        const dto: SubmitRatingDto = {
          placeRatingId: 1,
          rating: ratingValue,
        };
        placeRatingRepository.findOne.mockResolvedValue(
          mockPlaceRating as PlaceRating,
        );
        placeRatingRepository.save.mockResolvedValue({
          ...mockPlaceRating,
          rating: ratingValue,
        } as PlaceRating);

        // Act
        await service.submitRating(mockUser, dto);

        // Assert
        expect(placeRatingRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({
            rating: ratingValue,
          }),
        );
      }
    });

    it('should load user relation when finding place rating', async () => {
      // Arrange
      placeRatingRepository.findOne.mockResolvedValue(
        mockPlaceRating as PlaceRating,
      );
      placeRatingRepository.save.mockResolvedValue(
        mockPlaceRating as PlaceRating,
      );

      // Act
      await service.submitRating(mockUser, submitRatingDto);

      // Assert
      expect(placeRatingRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['user'],
        }),
      );
    });
  });

  describe('skipRating', () => {
    const skipRatingDto: SkipRatingDto = {
      placeRatingId: 1,
    };

    const mockPlaceRating: Partial<PlaceRating> = {
      id: 1,
      placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      placeName: '맛있는 식당',
      user: mockUser,
      rating: null,
      skipped: false,
    };

    it('should skip rating when valid', async () => {
      // Arrange
      placeRatingRepository.findOne.mockResolvedValue(
        mockPlaceRating as PlaceRating,
      );
      const skippedRating = { ...mockPlaceRating, skipped: true };
      placeRatingRepository.save.mockResolvedValue(
        skippedRating as PlaceRating,
      );

      // Act
      await service.skipRating(mockUser, skipRatingDto);

      // Assert
      expect(placeRatingRepository.findOne).toHaveBeenCalledWith({
        where: { id: skipRatingDto.placeRatingId },
        relations: ['user'],
      });
      expect(placeRatingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          skipped: true,
        }),
      );
    });

    it('should throw ForbiddenException when user is deactivated', async () => {
      // Act & Assert
      await expect(
        service.skipRating(mockDeactivatedUser, skipRatingDto),
      ).rejects.toThrow(new ForbiddenException(ErrorCode.FORBIDDEN));

      expect(placeRatingRepository.findOne).not.toHaveBeenCalled();
      expect(placeRatingRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when place rating does not exist', async () => {
      // Arrange
      placeRatingRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.skipRating(mockUser, skipRatingDto)).rejects.toThrow(
        new NotFoundException(ErrorCode.PLACE_RATING_NOT_FOUND),
      );

      expect(placeRatingRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user does not own the rating', async () => {
      // Arrange
      const otherUser = UserFactory.create({
        id: 99,
        email: 'other@example.com',
      });
      const otherUserRating = {
        ...mockPlaceRating,
        user: otherUser,
      };
      placeRatingRepository.findOne.mockResolvedValue(
        otherUserRating as PlaceRating,
      );

      // Act & Assert
      await expect(service.skipRating(mockUser, skipRatingDto)).rejects.toThrow(
        new ForbiddenException(ErrorCode.FORBIDDEN),
      );

      expect(placeRatingRepository.save).not.toHaveBeenCalled();
    });

    it('should set skipped to true without changing rating value', async () => {
      // Arrange
      const ratingWithValue = {
        ...mockPlaceRating,
        rating: 3,
      };
      placeRatingRepository.findOne.mockResolvedValue(
        ratingWithValue as PlaceRating,
      );
      placeRatingRepository.save.mockResolvedValue(
        ratingWithValue as PlaceRating,
      );

      // Act
      await service.skipRating(mockUser, skipRatingDto);

      // Assert
      expect(placeRatingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          skipped: true,
          rating: 3, // Original rating value preserved
        }),
      );
    });

    it('should load user relation when finding place rating', async () => {
      // Arrange
      placeRatingRepository.findOne.mockResolvedValue(
        mockPlaceRating as PlaceRating,
      );
      placeRatingRepository.save.mockResolvedValue(
        mockPlaceRating as PlaceRating,
      );

      // Act
      await service.skipRating(mockUser, skipRatingDto);

      // Assert
      expect(placeRatingRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['user'],
        }),
      );
    });
  });
});
