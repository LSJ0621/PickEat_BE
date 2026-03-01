import { Test, TestingModule } from '@nestjs/testing';
import { UserFactory } from '../../../test/factories/entity.factory';
import { RatingController } from '../rating.controller';
import { RatingService } from '../rating.service';
import { UserService } from '@/user/user.service';
import { SelectPlaceDto } from '../dto/select-place.dto';
import { SubmitRatingDto } from '../dto/submit-rating.dto';
import { SkipRatingDto } from '../dto/skip-rating.dto';
import { DismissRatingDto } from '../dto/dismiss-rating.dto';
import { GetRatingHistoryDto } from '../dto/get-rating-history.dto';
import { AuthUserPayload } from '@/auth/decorators/current-user.decorator';

describe('RatingController', () => {
  let controller: RatingController;
  let ratingService: jest.Mocked<RatingService>;
  let userService: jest.Mocked<UserService>;

  const mockUser = UserFactory.create({ id: 1, email: 'test@example.com' });

  const mockAuthUser: AuthUserPayload = {
    sub: 1,
    email: 'test@example.com',
    role: 'USER',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockRatingService = {
      selectPlace: jest.fn(),
      getPendingRating: jest.fn(),
      submitRating: jest.fn(),
      skipRating: jest.fn(),
      dismissRating: jest.fn(),
      getRatingHistory: jest.fn(),
    };

    const mockUserService = {
      getAuthenticatedEntity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RatingController],
      providers: [
        {
          provide: RatingService,
          useValue: mockRatingService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    controller = module.get<RatingController>(RatingController);
    ratingService = module.get(RatingService);
    userService = module.get(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create controller instance when service dependencies are injected', () => {
    expect(controller).toBeDefined();
  });

  describe('selectPlace', () => {
    it('should call ratingService.selectPlace and return result when valid dto is provided', async () => {
      const dto: SelectPlaceDto = {
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        placeName: '맛있는 식당',
        placeRecommendationId: 10,
      };
      const expectedResult = { id: 1, placeId: dto.placeId };

      userService.getAuthenticatedEntity.mockResolvedValue(mockUser);
      ratingService.selectPlace.mockResolvedValue(expectedResult as never);

      const result = await controller.selectPlace(dto, mockAuthUser);

      expect(userService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(ratingService.selectPlace).toHaveBeenCalledWith(mockUser, dto);
      expect(result).toEqual(expectedResult);
    });

    it('should call ratingService.selectPlace without placeRecommendationId when optional field is omitted', async () => {
      const dto: SelectPlaceDto = {
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        placeName: '맛있는 식당',
      };

      userService.getAuthenticatedEntity.mockResolvedValue(mockUser);
      ratingService.selectPlace.mockResolvedValue({} as never);

      await controller.selectPlace(dto, mockAuthUser);

      expect(ratingService.selectPlace).toHaveBeenCalledWith(mockUser, dto);
    });
  });

  describe('getPendingRating', () => {
    it('should return pending rating when authenticated user requests it', async () => {
      const expectedResult = {
        placeRatingId: 5,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        placeName: '맛있는 식당',
      };

      userService.getAuthenticatedEntity.mockResolvedValue(mockUser);
      ratingService.getPendingRating.mockResolvedValue(expectedResult as never);

      const result = await controller.getPendingRating(mockAuthUser);

      expect(userService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(ratingService.getPendingRating).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual(expectedResult);
    });

    it('should return null when there is no pending rating for the user', async () => {
      userService.getAuthenticatedEntity.mockResolvedValue(mockUser);
      ratingService.getPendingRating.mockResolvedValue(null as never);

      const result = await controller.getPendingRating(mockAuthUser);

      expect(result).toBeNull();
    });
  });

  describe('submitRating', () => {
    it('should submit rating and return success true when valid rating data is provided', async () => {
      const dto: SubmitRatingDto = {
        placeRatingId: 5,
        rating: 4,
      };

      userService.getAuthenticatedEntity.mockResolvedValue(mockUser);
      ratingService.submitRating.mockResolvedValue(undefined);

      const result = await controller.submitRating(dto, mockAuthUser);

      expect(userService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(ratingService.submitRating).toHaveBeenCalledWith(mockUser, dto);
      expect(result).toEqual({ success: true });
    });
  });

  describe('skipRating', () => {
    it('should skip rating and return success true when valid dto is provided', async () => {
      const dto: SkipRatingDto = { placeRatingId: 5 };

      userService.getAuthenticatedEntity.mockResolvedValue(mockUser);
      ratingService.skipRating.mockResolvedValue(undefined);

      const result = await controller.skipRating(dto, mockAuthUser);

      expect(userService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(ratingService.skipRating).toHaveBeenCalledWith(mockUser, dto);
      expect(result).toEqual({ success: true });
    });
  });

  describe('dismissRating', () => {
    it('should dismiss rating and return success true when valid dto is provided', async () => {
      const dto: DismissRatingDto = { placeRatingId: 5 };

      userService.getAuthenticatedEntity.mockResolvedValue(mockUser);
      ratingService.dismissRating.mockResolvedValue(undefined);

      const result = await controller.dismissRating(dto, mockAuthUser);

      expect(userService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(ratingService.dismissRating).toHaveBeenCalledWith(mockUser, dto);
      expect(result).toEqual({ success: true });
    });
  });

  describe('getRatingHistory', () => {
    it('should return rating history when authenticated user requests it', async () => {
      const dto: GetRatingHistoryDto = { page: 1, limit: 10 };
      const expectedResult = {
        items: [
          {
            id: 1,
            placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
            placeName: '맛있는 식당',
            rating: 4,
          },
        ],
        pageInfo: { page: 1, limit: 10, totalCount: 1, hasNext: false },
      };

      userService.getAuthenticatedEntity.mockResolvedValue(mockUser);
      ratingService.getRatingHistory.mockResolvedValue(expectedResult as never);

      const result = await controller.getRatingHistory(dto, mockAuthUser);

      expect(userService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(ratingService.getRatingHistory).toHaveBeenCalledWith(
        mockUser,
        dto,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should return empty items when user has no rating history', async () => {
      const dto: GetRatingHistoryDto = { page: 1, limit: 10 };
      const expectedResult = {
        items: [],
        pageInfo: { page: 1, limit: 10, totalCount: 0, hasNext: false },
      };

      userService.getAuthenticatedEntity.mockResolvedValue(mockUser);
      ratingService.getRatingHistory.mockResolvedValue(expectedResult as never);

      const result = await controller.getRatingHistory(dto, mockAuthUser);

      expect(result).toEqual(expectedResult);
    });
  });
});
