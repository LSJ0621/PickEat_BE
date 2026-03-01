import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommunityPlaceService } from '../../services/community-place.service';
import { OpenAiCommunityPlacesService } from '../../services/openai-community-places.service';
import { PlaceRecommendation } from '../../entities/place-recommendation.entity';
import { UserPlace } from '@/user-place/entities/user-place.entity';
import { PlaceRecommendationSource } from '../../enum/place-recommendation-source.enum';
import { UserPlaceStatus } from '@/user-place/enum/user-place-status.enum';
import {
  createMockRepository,
  createMockQueryBuilder,
} from '../../../../test/mocks/repository.mock';
import {
  UserFactory,
  MenuRecommendationFactory,
  UserPlaceFactory,
} from '../../../../test/factories/entity.factory';

describe('CommunityPlaceService', () => {
  let service: CommunityPlaceService;
  let mockPlaceRecommendationRepository: jest.Mocked<
    Repository<PlaceRecommendation>
  >;
  let mockUserPlaceRepository: jest.Mocked<Repository<UserPlace>>;
  let mockOpenAiCommunityPlacesService: jest.Mocked<OpenAiCommunityPlacesService>;

  beforeEach(async () => {
    mockPlaceRecommendationRepository =
      createMockRepository<PlaceRecommendation>();
    mockUserPlaceRepository = createMockRepository<UserPlace>();
    mockOpenAiCommunityPlacesService = {
      recommendFromCommunityPlaces: jest.fn(),
    } as unknown as jest.Mocked<OpenAiCommunityPlacesService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityPlaceService,
        {
          provide: getRepositoryToken(PlaceRecommendation),
          useValue: mockPlaceRecommendationRepository,
        },
        {
          provide: getRepositoryToken(UserPlace),
          useValue: mockUserPlaceRepository,
        },
        {
          provide: OpenAiCommunityPlacesService,
          useValue: mockOpenAiCommunityPlacesService,
        },
      ],
    }).compile();

    service = module.get<CommunityPlaceService>(CommunityPlaceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recommendCommunityPlaces', () => {
    const user = UserFactory.create({ id: 1 });
    const latitude = 37.5012345;
    const longitude = 127.0398765;
    const menuName = '김치찌개';
    const menuRecommendation = MenuRecommendationFactory.create({ id: 1 });

    it('should return empty array when no nearby UserPlaces are found', async () => {
      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [],
        raw: [],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(result).toEqual([]);
      expect(mockUserPlaceRepository.createQueryBuilder).toHaveBeenCalledWith(
        'userPlace',
      );
      expect(mockQueryBuilder.addSelect).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'userPlace.status = :status',
        { status: UserPlaceStatus.APPROVED },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
      expect(mockQueryBuilder.setParameters).toHaveBeenCalledWith({
        latitude,
        longitude,
        radiusMeters: 2000,
      });
      expect(
        mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces,
      ).not.toHaveBeenCalled();
    });

    it('should successfully recommend community places', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({
          id: 1,
          name: '김치찌개 전문점',
          address: '서울시 강남구 테헤란로 123',
          menuTypes: ['한식', '찌개류'],
          category: '음식점',
          description: '전통 김치찌개',
          status: UserPlaceStatus.APPROVED,
        }),
        UserPlaceFactory.create({
          id: 2,
          name: '할머니 손맛',
          address: '서울시 강남구 역삼로 456',
          menuTypes: ['한식', '가정식'],
          category: '음식점',
          description: null,
          status: UserPlaceStatus.APPROVED,
        }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '350.5' }, { distance: '720.8' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const aiResponse = {
        recommendations: [
          {
            userPlaceId: 1,
            name: '김치찌개 전문점',
            address: '서울시 강남구 테헤란로 123',
            matchReason: '김치찌개 전문점으로 메뉴와 정확히 일치합니다.',
            matchReasonTags: [],
            matchScore: 95,
          },
          {
            userPlaceId: 2,
            name: '할머니 손맛',
            address: '서울시 강남구 역삼로 456',
            matchReason: '가정식 한식으로 김치찌개를 제공합니다.',
            matchReasonTags: [],
            matchScore: 85,
          },
        ],
      };

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        aiResponse,
      );

      const savedRecommendations = [
        {
          id: 1,
          menuRecommendation,
          placeId: 'user_place_1',
          reason: '김치찌개 전문점으로 메뉴와 정확히 일치합니다.',
          menuName,
          source: PlaceRecommendationSource.USER,
          userPlace: nearbyUserPlaces[0],
        } as PlaceRecommendation,
        {
          id: 2,
          menuRecommendation,
          placeId: 'user_place_2',
          reason: '가정식 한식으로 김치찌개를 제공합니다.',
          menuName,
          source: PlaceRecommendationSource.USER,
          userPlace: nearbyUserPlaces[1],
        } as PlaceRecommendation,
      ];

      mockPlaceRecommendationRepository.create
        .mockReturnValueOnce(savedRecommendations[0])
        .mockReturnValueOnce(savedRecommendations[1]);
      mockPlaceRecommendationRepository.save.mockResolvedValue(
        savedRecommendations as PlaceRecommendation[] & PlaceRecommendation,
      );

      const result = await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(
        mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces,
      ).toHaveBeenCalledWith(
        menuName,
        [
          {
            id: 1,
            name: '김치찌개 전문점',
            address: '서울시 강남구 테헤란로 123',
            menuTypes: ['한식', '찌개류'],
            category: '음식점',
            description: '전통 김치찌개',
            distance: 351,
          },
          {
            id: 2,
            name: '할머니 손맛',
            address: '서울시 강남구 역삼로 456',
            menuTypes: ['한식', '가정식'],
            category: '음식점',
            description: null,
            distance: 721,
          },
        ],
        'ko',
      );
      expect(mockPlaceRecommendationRepository.create).toHaveBeenCalledTimes(2);
      expect(mockPlaceRecommendationRepository.save).toHaveBeenCalledWith([
        savedRecommendations[0],
        savedRecommendations[1],
      ]);
      expect(result).toEqual(savedRecommendations);
    });

    it('should return empty array when OpenAI returns no recommendations', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({
          id: 1,
          name: '양식당',
          address: '서울시',
          menuTypes: ['양식'],
          category: '음식점',
          status: UserPlaceStatus.APPROVED,
        }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        { recommendations: [] },
      );

      const result = await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(result).toEqual([]);
      expect(mockPlaceRecommendationRepository.save).not.toHaveBeenCalled();
    });

    it('should return empty array when OpenAI returns null recommendations', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({ id: 1, status: UserPlaceStatus.APPROVED }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        {
          recommendations: null as unknown as Array<{
            userPlaceId: number;
            name: string;
            address: string;
            matchReason: string;
            matchReasonTags: string[];
            matchScore: number;
          }>,
        },
      );

      const result = await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(result).toEqual([]);
    });

    it('should filter out recommendations with invalid userPlaceId', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({
          id: 1,
          name: '식당1',
          status: UserPlaceStatus.APPROVED,
        }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const aiResponse = {
        recommendations: [
          {
            userPlaceId: 1,
            name: '식당1',
            address: '서울시',
            matchReason: '유효한 추천',
            matchReasonTags: [],
            matchScore: 90,
          },
          {
            userPlaceId: 999,
            name: '존재하지 않는 식당',
            address: '서울시',
            matchReason: '무효한 추천',
            matchReasonTags: [],
            matchScore: 80,
          },
        ],
      };

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        aiResponse,
      );

      const savedRecommendation = {
        id: 1,
        menuRecommendation,
        placeId: 'user_place_1',
        reason: '유효한 추천',
        menuName,
        source: PlaceRecommendationSource.USER,
        userPlace: nearbyUserPlaces[0],
      } as PlaceRecommendation;

      mockPlaceRecommendationRepository.create.mockReturnValue(
        savedRecommendation,
      );
      mockPlaceRecommendationRepository.save.mockResolvedValue([
        savedRecommendation,
      ] as PlaceRecommendation[] & PlaceRecommendation);

      const result = await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(result).toHaveLength(1);
      expect(result[0].placeId).toBe('user_place_1');
      expect(mockPlaceRecommendationRepository.save).toHaveBeenCalledWith([
        savedRecommendation,
      ]);
    });

    it('should return empty array when all recommendations are filtered out', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({
          id: 1,
          name: '식당1',
          status: UserPlaceStatus.APPROVED,
        }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const aiResponse = {
        recommendations: [
          {
            userPlaceId: 999,
            name: '존재하지 않는 식당',
            address: '서울시',
            matchReason: '무효한 추천',
            matchReasonTags: [],
            matchScore: 80,
          },
        ],
      };

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        aiResponse,
      );

      const result = await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(result).toEqual([]);
      expect(mockPlaceRecommendationRepository.save).not.toHaveBeenCalled();
    });

    it('should handle language parameter correctly', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({ id: 1, status: UserPlaceStatus.APPROVED }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        { recommendations: [] },
      );

      await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
        'en',
      );

      expect(
        mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces,
      ).toHaveBeenCalledWith(menuName, expect.any(Array), 'en');
    });

    it('should use default language when not specified', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({ id: 1, status: UserPlaceStatus.APPROVED }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        { recommendations: [] },
      );

      await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(
        mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces,
      ).toHaveBeenCalledWith(menuName, expect.any(Array), 'ko');
    });

    it('should handle PostGIS query correctly', async () => {
      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [],
        raw: [],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith(
        expect.stringContaining('ST_Distance'),
        'distance',
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ST_DWithin'),
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('distance', 'ASC');
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(20);
    });

    it('should round distance to nearest meter', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({
          id: 1,
          name: '식당',
          status: UserPlaceStatus.APPROVED,
        }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '123.456789' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        { recommendations: [] },
      );

      await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(
        mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces,
      ).toHaveBeenCalledWith(
        menuName,
        [
          expect.objectContaining({
            distance: 123,
          }),
        ],
        'ko',
      );
    });

    it('should handle missing distance in raw results', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({
          id: 1,
          name: '식당',
          status: UserPlaceStatus.APPROVED,
        }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{}],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        { recommendations: [] },
      );

      await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(
        mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces,
      ).toHaveBeenCalledWith(
        menuName,
        [
          expect.objectContaining({
            distance: 0,
          }),
        ],
        'ko',
      );
    });

    it('should handle empty menuTypes array', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({
          id: 1,
          name: '식당',
          menuTypes: [],
          status: UserPlaceStatus.APPROVED,
        }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        { recommendations: [] },
      );

      await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(
        mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces,
      ).toHaveBeenCalledWith(
        menuName,
        [
          expect.objectContaining({
            menuTypes: [],
          }),
        ],
        'ko',
      );
    });

    it('should handle null category', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({
          id: 1,
          name: '식당',
          category: null,
          status: UserPlaceStatus.APPROVED,
        }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        { recommendations: [] },
      );

      await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(
        mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces,
      ).toHaveBeenCalledWith(
        menuName,
        [
          expect.objectContaining({
            category: '',
          }),
        ],
        'ko',
      );
    });

    it('should log appropriate messages during execution', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({ id: 1, status: UserPlaceStatus.APPROVED }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const aiResponse = {
        recommendations: [
          {
            userPlaceId: 1,
            name: '식당',
            address: '서울시',
            matchReason: '추천 이유',
            matchReasonTags: [],
            matchScore: 90,
          },
        ],
      };

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        aiResponse,
      );

      const savedRecommendation = {
        id: 1,
        menuRecommendation,
        placeId: 'user_place_1',
        reason: '추천 이유',
        menuName,
        source: PlaceRecommendationSource.USER,
        userPlace: nearbyUserPlaces[0],
      } as PlaceRecommendation;

      mockPlaceRecommendationRepository.create.mockReturnValue(
        savedRecommendation,
      );
      mockPlaceRecommendationRepository.save.mockResolvedValue([
        savedRecommendation,
      ] as PlaceRecommendation[] & PlaceRecommendation);

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[커뮤니티 장소 추천 시작]'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[주변 장소 발견]'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenAI 추천 완료]'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[커뮤니티 장소 추천 완료]'),
      );
    });

    it('should log when no nearby places are found', async () => {
      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [],
        raw: [],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[커뮤니티 장소 없음]'),
      );
    });

    it('should log when OpenAI returns no recommendations', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({ id: 1, status: UserPlaceStatus.APPROVED }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        { recommendations: [] },
      );

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[OpenAI 추천 없음]'),
      );
    });

    it('should log warning when userPlaceId is not in candidate map', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({
          id: 1,
          name: '식당1',
          status: UserPlaceStatus.APPROVED,
        }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const aiResponse = {
        recommendations: [
          {
            userPlaceId: 999,
            name: '존재하지 않는 식당',
            address: '서울시',
            matchReason: '무효한 추천',
            matchReasonTags: [],
            matchScore: 80,
          },
        ],
      };

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        aiResponse,
      );

      const loggerSpy = jest.spyOn(service['logger'], 'warn');

      await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[사용자 장소 없음]'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('999'));
    });

    it('should throw BadRequestException when save operation fails', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({
          id: 1,
          name: '식당1',
          address: '서울시',
          menuTypes: ['한식'],
          category: '음식점',
          status: UserPlaceStatus.APPROVED,
        }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const aiResponse = {
        recommendations: [
          {
            userPlaceId: 1,
            name: '식당1',
            address: '서울시',
            matchReason: '추천 이유',
            matchReasonTags: [],
            matchScore: 90,
          },
        ],
      };

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        aiResponse,
      );

      const savedRecommendation = {
        id: 1,
        menuRecommendation,
        placeId: 'user_place_1',
        reason: '추천 이유',
        menuName,
        source: PlaceRecommendationSource.USER,
        userPlace: nearbyUserPlaces[0],
      } as PlaceRecommendation;

      mockPlaceRecommendationRepository.create.mockReturnValue(
        savedRecommendation,
      );
      mockPlaceRecommendationRepository.save.mockRejectedValue(
        new Error('DB save failed'),
      );

      const { BadRequestException } = await import('@nestjs/common');
      await expect(
        service.recommendCommunityPlaces(
          user,
          latitude,
          longitude,
          menuName,
          menuRecommendation,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should default reasonTags to empty array when matchReasonTags is not an array (line 99 branch)', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({
          id: 1,
          name: '식당1',
          address: '서울시',
          menuTypes: ['한식'],
          category: '음식점',
          status: UserPlaceStatus.APPROVED,
        }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const aiResponse = {
        recommendations: [
          {
            userPlaceId: 1,
            name: '식당1',
            address: '서울시',
            matchReason: '추천 이유',
            matchReasonTags: null as unknown as string[], // non-array → should default to []
            matchScore: 90,
          },
        ],
      };

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        aiResponse,
      );

      const savedRecommendation = {
        id: 1,
        menuRecommendation,
        placeId: 'user_place_1',
        reason: '추천 이유',
        reasonTags: [],
        menuName,
        source: PlaceRecommendationSource.USER,
        userPlace: nearbyUserPlaces[0],
      } as unknown as PlaceRecommendation;

      mockPlaceRecommendationRepository.create.mockReturnValue(
        savedRecommendation,
      );
      mockPlaceRecommendationRepository.save.mockResolvedValue([
        savedRecommendation,
      ] as PlaceRecommendation[] & PlaceRecommendation);

      await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      // Verify create was called with reasonTags: [] (the non-array fallback)
      expect(mockPlaceRecommendationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reasonTags: [],
        }),
      );
    });

    it('should throw BadRequestException with non-Error save failure (line 186 branch)', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({
          id: 1,
          name: '식당1',
          address: '서울시',
          menuTypes: ['한식'],
          category: '음식점',
          status: UserPlaceStatus.APPROVED,
        }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const aiResponse = {
        recommendations: [
          {
            userPlaceId: 1,
            name: '식당1',
            address: '서울시',
            matchReason: '추천 이유',
            matchReasonTags: [],
            matchScore: 90,
          },
        ],
      };

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        aiResponse,
      );

      const savedRecommendation = {
        id: 1,
        menuRecommendation,
        placeId: 'user_place_1',
        reason: '추천 이유',
        menuName,
        source: PlaceRecommendationSource.USER,
        userPlace: nearbyUserPlaces[0],
      } as PlaceRecommendation;

      mockPlaceRecommendationRepository.create.mockReturnValue(
        savedRecommendation,
      );
      // Reject with a non-Error object to hit the String(error) branch (line 186)
      mockPlaceRecommendationRepository.save.mockRejectedValue({
        code: 'DB_CONSTRAINT_ERROR',
        errno: 1062,
      });

      const { BadRequestException: BadRequestExc } = await import(
        '@nestjs/common'
      );
      await expect(
        service.recommendCommunityPlaces(
          user,
          latitude,
          longitude,
          menuName,
          menuRecommendation,
        ),
      ).rejects.toThrow(BadRequestExc);
    });

    it('should log warning when no valid recommendation entities are created', async () => {
      const nearbyUserPlaces = [
        UserPlaceFactory.create({
          id: 1,
          name: '식당1',
          status: UserPlaceStatus.APPROVED,
        }),
      ];

      const mockQueryBuilder = createMockQueryBuilder<UserPlace>();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: nearbyUserPlaces,
        raw: [{ distance: '500' }],
      });

      mockUserPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const aiResponse = {
        recommendations: [
          {
            userPlaceId: 999,
            name: '존재하지 않는 식당',
            address: '서울시',
            matchReason: '무효한 추천',
            matchReasonTags: [],
            matchScore: 80,
          },
        ],
      };

      mockOpenAiCommunityPlacesService.recommendFromCommunityPlaces.mockResolvedValue(
        aiResponse,
      );

      const loggerSpy = jest.spyOn(service['logger'], 'warn');

      await service.recommendCommunityPlaces(
        user,
        latitude,
        longitude,
        menuName,
        menuRecommendation,
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[추천 엔티티 없음]'),
      );
    });
  });
});
