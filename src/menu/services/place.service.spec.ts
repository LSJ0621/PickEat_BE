import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PlaceService } from './place.service';
import { MenuRecommendationService } from './menu-recommendation.service';
import { OpenAiPlacesService } from './openai-places.service';
import { GooglePlacesClient } from '@/external/google/clients/google-places.client';
import { GoogleSearchClient } from '@/external/google/clients/google-search.client';
import { PlaceRecommendation } from '../entities/place-recommendation.entity';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import {
  UserFactory,
  MenuRecommendationFactory,
  PlaceRecommendationFactory,
} from '../../../test/factories/entity.factory';

describe('PlaceService', () => {
  let service: PlaceService;
  let mockPlaceRecommendationRepository: jest.Mocked<any>;
  let mockMenuRecommendationService: jest.Mocked<MenuRecommendationService>;
  let mockOpenAiPlacesService: jest.Mocked<OpenAiPlacesService>;
  let mockGooglePlacesClient: jest.Mocked<GooglePlacesClient>;
  let mockGoogleSearchClient: jest.Mocked<GoogleSearchClient>;

  beforeEach(async () => {
    mockPlaceRecommendationRepository =
      createMockRepository<PlaceRecommendation>() as any;
    mockMenuRecommendationService = {
      findById: jest.fn(),
    } as any;
    mockOpenAiPlacesService = {
      recommendFromGooglePlaces: jest.fn(),
    } as any;
    mockGooglePlacesClient = {
      searchByText: jest.fn(),
      getDetails: jest.fn(),
      resolvePhotoUris: jest.fn(),
    } as any;
    mockGoogleSearchClient = {
      searchBlogs: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaceService,
        {
          provide: getRepositoryToken(PlaceRecommendation),
          useValue: mockPlaceRecommendationRepository,
        },
        {
          provide: MenuRecommendationService,
          useValue: mockMenuRecommendationService,
        },
        {
          provide: OpenAiPlacesService,
          useValue: mockOpenAiPlacesService,
        },
        {
          provide: GooglePlacesClient,
          useValue: mockGooglePlacesClient,
        },
        {
          provide: GoogleSearchClient,
          useValue: mockGoogleSearchClient,
        },
      ],
    }).compile();

    service = module.get<PlaceService>(PlaceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchRestaurantsWithGooglePlaces', () => {
    it('should return formatted places from Google Places API', async () => {
      const textQuery = '강남역 맛집';
      const googlePlaces = [
        {
          id: 'place-1',
          displayName: { text: '맛있는 식당' },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: 'PRICE_LEVEL_MODERATE',
          reviews: [
            {
              rating: 5,
              originalText: { text: '맛있어요!' },
              text: { text: '맛있어요!' },
              relativePublishTimeDescription: '1주일 전',
            },
          ],
        },
      ];

      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);

      const result = await service.searchRestaurantsWithGooglePlaces(textQuery);

      expect(mockGooglePlacesClient.searchByText).toHaveBeenCalledWith(
        textQuery,
      );
      expect(result.places).toHaveLength(1);
      expect(result.places[0]).toEqual({
        id: 'place-1',
        name: '맛있는 식당',
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        reviews: [
          {
            rating: 5,
            originalText: '맛있어요!',
            relativePublishTimeDescription: '1주일 전',
          },
        ],
      });
    });

    it('should handle places with missing optional fields', async () => {
      const googlePlaces = [
        {
          id: 'place-1',
          displayName: undefined,
          rating: undefined,
          userRatingCount: undefined,
          priceLevel: undefined,
          reviews: undefined,
        },
      ];

      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);

      const result = await service.searchRestaurantsWithGooglePlaces('query');

      expect(result.places[0]).toEqual({
        id: 'place-1',
        name: null,
        rating: null,
        userRatingCount: null,
        priceLevel: null,
        reviews: null,
      });
    });

    it('should limit reviews to top 3', async () => {
      const googlePlaces = [
        {
          id: 'place-1',
          displayName: { text: '식당' },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: undefined,
          reviews: [
            {
              rating: 5,
              originalText: { text: '리뷰1' },
              relativePublishTimeDescription: '1일',
            },
            {
              rating: 4,
              originalText: { text: '리뷰2' },
              relativePublishTimeDescription: '2일',
            },
            {
              rating: 5,
              originalText: { text: '리뷰3' },
              relativePublishTimeDescription: '3일',
            },
            {
              rating: 3,
              originalText: { text: '리뷰4' },
              relativePublishTimeDescription: '4일',
            },
          ],
        },
      ];

      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);

      const result = await service.searchRestaurantsWithGooglePlaces('query');

      expect(result.places[0].reviews).toHaveLength(3);
    });
  });

  describe('getPlaceDetail', () => {
    it('should return detailed place information with photos', async () => {
      const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
      const placeDetails = {
        id: placeId,
        displayName: { text: '맛있는 식당' },
        formattedAddress: '서울특별시 강남구 테헤란로 123',
        location: { latitude: 37.5, longitude: 127.0 },
        rating: 4.5,
        userRatingCount: 200,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
        currentOpeningHours: { openNow: true },
        photos: [{ name: 'photo1' }, { name: 'photo2' }],
        reviews: [
          {
            rating: 5,
            originalText: { text: '좋아요' },
            authorAttribution: { displayName: '홍길동' },
            publishTime: '2024-01-01T00:00:00Z',
          },
        ],
      };

      const photoUris = [
        'https://example.com/photo1.jpg',
        'https://example.com/photo2.jpg',
      ];

      mockGooglePlacesClient.getDetails.mockResolvedValue(placeDetails);
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue(photoUris);

      const result = await service.getPlaceDetail(placeId);

      expect(mockGooglePlacesClient.getDetails).toHaveBeenCalledWith(placeId, {
        includeBusinessStatus: true,
      });
      expect(mockGooglePlacesClient.resolvePhotoUris).toHaveBeenCalledWith(
        placeDetails.photos,
      );
      expect(result.place).toEqual({
        id: placeId,
        name: '맛있는 식당',
        address: '서울특별시 강남구 테헤란로 123',
        location: { latitude: 37.5, longitude: 127.0 },
        rating: 4.5,
        userRatingCount: 200,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
        openNow: true,
        photos: photoUris,
        reviews: [
          {
            rating: 5,
            text: '좋아요',
            authorName: '홍길동',
            publishTime: '2024-01-01T00:00:00Z',
          },
        ],
      });
    });

    it('should return null when place not found', async () => {
      mockGooglePlacesClient.getDetails.mockResolvedValue(null);

      const result = await service.getPlaceDetail('non-existent-place-id');

      expect(result.place).toBeNull();
    });
  });

  describe('searchRestaurantBlogs', () => {
    it('should return blog search results', async () => {
      const query = '강남역 맛집';
      const restaurantName = '맛있는 식당';
      const blogs = [
        {
          title: '맛집 리뷰',
          url: 'https://blog.example.com/post1',
          snippet: '정말 맛있는 식당이에요',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          source: 'Example Blog',
        },
      ];

      mockGoogleSearchClient.searchBlogs.mockResolvedValue(blogs);

      const result = await service.searchRestaurantBlogs(query, restaurantName);

      expect(mockGoogleSearchClient.searchBlogs).toHaveBeenCalledWith(
        query,
        restaurantName,
      );
      expect(result.blogs).toEqual(blogs);
    });
  });

  describe('recommendRestaurants', () => {
    it('should execute full recommendation pipeline and save results', async () => {
      const user = UserFactory.create({ id: 1 });
      const textQuery = '강남역 김치찌개';
      const menuName = '김치찌개';
      const menuRecommendationId = 1;

      const menuRecord = MenuRecommendationFactory.create({
        id: menuRecommendationId,
        user,
        placeRecommendations: [],
      });

      const googlePlaces = [
        {
          id: 'place-1',
          displayName: { text: '김치찌개 전문점' },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: 'PRICE_LEVEL_MODERATE',
          reviews: [
            {
              rating: 5,
              originalText: { text: '맛있어요' },
              relativePublishTimeDescription: '1주일 전',
            },
          ],
        },
      ];

      const aiRecommendations = {
        recommendations: [
          {
            placeId: 'place-1',
            name: '김치찌개 전문점',
            reason: '평점이 높고 리뷰가 좋습니다.',
          },
        ],
      };

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);
      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);
      mockOpenAiPlacesService.recommendFromGooglePlaces.mockResolvedValue(
        aiRecommendations,
      );

      const savedPlaceRecommendations = [
        PlaceRecommendationFactory.create({
          id: 1,
          placeId: 'place-1',
          reason: '평점이 높고 리뷰가 좋습니다.',
          menuName: '김치찌개',
        }),
      ];

      mockPlaceRecommendationRepository.create.mockImplementation(
        (data) => data,
      );
      mockPlaceRecommendationRepository.save.mockResolvedValue(
        savedPlaceRecommendations,
      );

      const result = await service.recommendRestaurants(
        user,
        textQuery,
        menuName,
        menuRecommendationId,
      );

      expect(mockMenuRecommendationService.findById).toHaveBeenCalledWith(
        menuRecommendationId,
        user,
      );
      expect(mockGooglePlacesClient.searchByText).toHaveBeenCalledWith(
        textQuery,
      );
      expect(
        mockOpenAiPlacesService.recommendFromGooglePlaces,
      ).toHaveBeenCalledWith(textQuery, [
        {
          id: 'place-1',
          name: '김치찌개 전문점',
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: 'PRICE_LEVEL_MODERATE',
          reviews: [
            {
              rating: 5,
              originalText: '맛있어요',
              relativePublishTimeDescription: '1주일 전',
            },
          ],
        },
      ]);
      expect(mockPlaceRecommendationRepository.save).toHaveBeenCalled();
      expect(result).toEqual(aiRecommendations);
    });

    it('should throw BadRequestException when menuName is missing', async () => {
      const user = UserFactory.create({ id: 1 });

      await expect(
        service.recommendRestaurants(user, 'query', '', 1),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.recommendRestaurants(user, 'query', '', 1),
      ).rejects.toThrow('menuName이 필요합니다.');
    });

    it('should throw BadRequestException when menuRecommendationId is missing', async () => {
      const user = UserFactory.create({ id: 1 });

      await expect(
        service.recommendRestaurants(
          user,
          'query',
          '김치찌개',
          undefined as any,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.recommendRestaurants(
          user,
          'query',
          '김치찌개',
          undefined as any,
        ),
      ).rejects.toThrow('menuRecommendationId가 필요합니다');
    });

    it('should throw BadRequestException when place recommendations already exist for the menu', async () => {
      const user = UserFactory.create({ id: 1 });
      const menuRecord = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations: [
          PlaceRecommendationFactory.create({ menuName: '김치찌개' }),
        ],
      });

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);

      await expect(
        service.recommendRestaurants(user, 'query', '김치찌개', 1),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.recommendRestaurants(user, 'query', '김치찌개', 1),
      ).rejects.toThrow('이 메뉴는 이미 AI 가게 추천을 받았습니다');
    });

    it('should throw BadRequestException when Google Places returns no results', async () => {
      const user = UserFactory.create({ id: 1 });
      const menuRecord = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations: [],
      });

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);
      mockGooglePlacesClient.searchByText.mockResolvedValue([]);

      await expect(
        service.recommendRestaurants(user, 'query', '김치찌개', 1),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.recommendRestaurants(user, 'query', '김치찌개', 1),
      ).rejects.toThrow('검색 결과를 찾을 수 없습니다');
    });

    it('should throw BadRequestException when AI returns no recommendations', async () => {
      const user = UserFactory.create({ id: 1 });
      const menuRecord = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations: [],
      });

      const googlePlaces = [
        {
          id: 'place-1',
          displayName: { text: '식당' },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: undefined,
          reviews: undefined,
        },
      ];

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);
      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);
      mockOpenAiPlacesService.recommendFromGooglePlaces.mockResolvedValue({
        recommendations: [],
      });

      await expect(
        service.recommendRestaurants(user, 'query', '김치찌개', 1),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.recommendRestaurants(user, 'query', '김치찌개', 1),
      ).rejects.toThrow('AI 추천 결과를 생성하지 못했습니다');
    });
  });

  describe('buildRecommendationDetailResponse', () => {
    it('should build detail response with place recommendations and details', async () => {
      const user = UserFactory.create({ id: 1 });
      const placeRecommendations = [
        PlaceRecommendationFactory.create({
          id: 1,
          placeId: 'place-1',
          reason: '평점이 높습니다',
          menuName: '김치찌개',
        }),
      ];

      const recommendation = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations,
      });

      const placeDetails = {
        id: 'place-1',
        displayName: { text: '맛있는 식당' },
        formattedAddress: '서울시 강남구',
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
        currentOpeningHours: { openNow: true },
        photos: [{ name: 'photo1' }],
        reviews: [
          {
            rating: 5,
            originalText: { text: '좋아요' },
            authorAttribution: { displayName: '홍길동' },
            publishTime: '2024-01-01',
          },
        ],
      };

      mockGooglePlacesClient.getDetails.mockResolvedValue(placeDetails);
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([
        'https://example.com/photo1.jpg',
      ]);

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(result.history.id).toBe(1);
      expect(result.history.hasPlaceRecommendations).toBe(true);
      expect(result.places).toHaveLength(1);
      expect(result.places[0]).toEqual({
        placeId: 'place-1',
        reason: '평점이 높습니다',
        menuName: '김치찌개',
        name: '맛있는 식당',
        address: '서울시 강남구',
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
        openNow: true,
        photos: ['https://example.com/photo1.jpg'],
        reviews: [
          {
            rating: 5,
            text: '좋아요',
            authorName: '홍길동',
            publishTime: '2024-01-01',
          },
        ],
      });
    });

    it('should return empty places when no place recommendations exist', async () => {
      const recommendation = MenuRecommendationFactory.create({
        id: 1,
        placeRecommendations: [],
      });

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(result.history.hasPlaceRecommendations).toBe(false);
      expect(result.places).toEqual([]);
    });

    it('should handle place details fetch failure gracefully', async () => {
      const placeRecommendations = [
        PlaceRecommendationFactory.create({
          placeId: 'place-1',
          reason: '추천',
          menuName: '김치찌개',
        }),
      ];

      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations,
      });

      mockGooglePlacesClient.getDetails.mockRejectedValue(
        new Error('API failed'),
      );

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(result.places[0]).toEqual({
        placeId: 'place-1',
        reason: '추천',
        menuName: '김치찌개',
        name: null,
        address: null,
        rating: null,
        userRatingCount: null,
        priceLevel: null,
        businessStatus: null,
        openNow: null,
        photos: [],
        reviews: null,
      });
    });
  });

  describe('searchRestaurantsWithGooglePlaces - review text fallback branch', () => {
    it('should use text.text when originalText is not available', async () => {
      const googlePlaces = [
        {
          id: 'place-1',
          displayName: { text: '식당' },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: undefined,
          reviews: [
            {
              rating: 5,
              originalText: undefined,
              text: { text: 'fallback text' },
              relativePublishTimeDescription: '1일 전',
            },
          ],
        },
      ];

      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);

      const result = await service.searchRestaurantsWithGooglePlaces('query');

      expect(result.places[0].reviews).toEqual([
        {
          rating: 5,
          originalText: 'fallback text',
          relativePublishTimeDescription: '1일 전',
        },
      ]);
    });

    it('should return null when both originalText and text are unavailable', async () => {
      const googlePlaces = [
        {
          id: 'place-1',
          displayName: { text: '식당' },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: undefined,
          reviews: [
            {
              rating: 5,
              originalText: undefined,
              text: undefined,
              relativePublishTimeDescription: '1일 전',
            },
          ],
        },
      ];

      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);

      const result = await service.searchRestaurantsWithGooglePlaces('query');

      expect(result.places[0].reviews).toEqual([
        {
          rating: 5,
          originalText: null,
          relativePublishTimeDescription: '1일 전',
        },
      ]);
    });

    it('should handle null rating in reviews', async () => {
      const googlePlaces = [
        {
          id: 'place-1',
          displayName: { text: '식당' },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: undefined,
          reviews: [
            {
              rating: undefined,
              originalText: { text: '좋아요' },
              relativePublishTimeDescription: '1일 전',
            },
          ],
        },
      ];

      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);

      const result = await service.searchRestaurantsWithGooglePlaces('query');

      expect(result.places[0].reviews).toEqual([
        {
          rating: null,
          originalText: '좋아요',
          relativePublishTimeDescription: '1일 전',
        },
      ]);
    });

    it('should handle null relativePublishTimeDescription in reviews', async () => {
      const googlePlaces = [
        {
          id: 'place-1',
          displayName: { text: '식당' },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: undefined,
          reviews: [
            {
              rating: 5,
              originalText: { text: '좋아요' },
              relativePublishTimeDescription: undefined,
            },
          ],
        },
      ];

      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);

      const result = await service.searchRestaurantsWithGooglePlaces('query');

      expect(result.places[0].reviews).toEqual([
        {
          rating: 5,
          originalText: '좋아요',
          relativePublishTimeDescription: null,
        },
      ]);
    });
  });

  describe('getPlaceDetail - all conditional branches', () => {
    it('should use text.text when originalText is not available in reviews', async () => {
      const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
      const placeDetails = {
        id: placeId,
        displayName: { text: '식당' },
        formattedAddress: '서울시',
        location: { latitude: 37.5, longitude: 127.0 },
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
        currentOpeningHours: { openNow: true },
        photos: [],
        reviews: [
          {
            rating: 5,
            originalText: undefined,
            text: { text: 'text fallback' },
            authorAttribution: { displayName: '작성자' },
            publishTime: '2024-01-01',
          },
        ],
      };

      mockGooglePlacesClient.getDetails.mockResolvedValue(placeDetails);
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([]);

      const result = await service.getPlaceDetail(placeId);

      expect(result.place?.reviews).toEqual([
        {
          rating: 5,
          text: 'text fallback',
          authorName: '작성자',
          publishTime: '2024-01-01',
        },
      ]);
    });

    it('should handle null rating in place detail reviews', async () => {
      const placeDetails = {
        id: 'place-1',
        displayName: { text: '식당' },
        formattedAddress: '서울시',
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: undefined,
        businessStatus: undefined,
        currentOpeningHours: undefined,
        photos: undefined,
        reviews: [
          {
            rating: undefined,
            originalText: { text: '리뷰' },
            authorAttribution: { displayName: '작성자' },
            publishTime: '2024-01-01',
          },
        ],
      };

      mockGooglePlacesClient.getDetails.mockResolvedValue(placeDetails);
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([]);

      const result = await service.getPlaceDetail('place-1');

      expect(result.place?.reviews).toEqual([
        {
          rating: null,
          text: '리뷰',
          authorName: '작성자',
          publishTime: '2024-01-01',
        },
      ]);
    });

    it('should handle null authorName in place detail reviews', async () => {
      const placeDetails = {
        id: 'place-1',
        displayName: { text: '식당' },
        formattedAddress: '서울시',
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: undefined,
        businessStatus: undefined,
        currentOpeningHours: undefined,
        photos: undefined,
        reviews: [
          {
            rating: 5,
            originalText: { text: '리뷰' },
            authorAttribution: undefined,
            publishTime: '2024-01-01',
          },
        ],
      };

      mockGooglePlacesClient.getDetails.mockResolvedValue(placeDetails);
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([]);

      const result = await service.getPlaceDetail('place-1');

      expect(result.place?.reviews).toEqual([
        {
          rating: 5,
          text: '리뷰',
          authorName: null,
          publishTime: '2024-01-01',
        },
      ]);
    });

    it('should handle null publishTime in place detail reviews', async () => {
      const placeDetails = {
        id: 'place-1',
        displayName: { text: '식당' },
        formattedAddress: '서울시',
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: undefined,
        businessStatus: undefined,
        currentOpeningHours: undefined,
        photos: undefined,
        reviews: [
          {
            rating: 5,
            originalText: { text: '리뷰' },
            authorAttribution: { displayName: '작성자' },
            publishTime: undefined,
          },
        ],
      };

      mockGooglePlacesClient.getDetails.mockResolvedValue(placeDetails);
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([]);

      const result = await service.getPlaceDetail('place-1');

      expect(result.place?.reviews).toEqual([
        {
          rating: 5,
          text: '리뷰',
          authorName: '작성자',
          publishTime: null,
        },
      ]);
    });

    it('should handle all null/undefined optional fields in place details', async () => {
      const placeId = 'place-id';
      const placeDetails = {
        id: undefined,
        displayName: undefined,
        formattedAddress: undefined,
        location: undefined,
        rating: undefined,
        userRatingCount: undefined,
        priceLevel: undefined,
        businessStatus: undefined,
        currentOpeningHours: undefined,
        photos: undefined,
        reviews: undefined,
      };

      mockGooglePlacesClient.getDetails.mockResolvedValue(placeDetails);
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([]);

      const result = await service.getPlaceDetail(placeId);

      expect(result.place).toEqual({
        id: null,
        name: null,
        address: null,
        location: null,
        rating: null,
        userRatingCount: null,
        priceLevel: null,
        businessStatus: null,
        openNow: null,
        photos: [],
        reviews: null,
      });
    });
  });

  describe('buildRecommendationDetailResponse - all conditional branches', () => {
    it('should use text.text when originalText is unavailable in detail reviews', async () => {
      const placeRecommendations = [
        PlaceRecommendationFactory.create({
          placeId: 'place-1',
          reason: '추천',
          menuName: '김치찌개',
        }),
      ];

      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations,
      });

      const placeDetails = {
        id: 'place-1',
        displayName: { text: '식당' },
        formattedAddress: '서울시',
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
        currentOpeningHours: { openNow: true },
        photos: [],
        reviews: [
          {
            rating: 5,
            originalText: undefined,
            text: { text: 'fallback review text' },
            authorAttribution: { displayName: '리뷰어' },
            publishTime: '2024-01-01',
          },
        ],
      };

      mockGooglePlacesClient.getDetails.mockResolvedValue(placeDetails);
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([]);

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(result.places[0].reviews).toEqual([
        {
          rating: 5,
          text: 'fallback review text',
          authorName: '리뷰어',
          publishTime: '2024-01-01',
        },
      ]);
    });

    it('should handle null rating in recommendation detail reviews', async () => {
      const placeRecommendations = [
        PlaceRecommendationFactory.create({
          placeId: 'place-1',
          reason: '추천',
          menuName: '김치찌개',
        }),
      ];

      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations,
      });

      const placeDetails = {
        id: 'place-1',
        displayName: { text: '식당' },
        formattedAddress: '서울시',
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
        currentOpeningHours: { openNow: true },
        photos: [],
        reviews: [
          {
            rating: undefined,
            originalText: { text: '리뷰' },
            authorAttribution: { displayName: '리뷰어' },
            publishTime: '2024-01-01',
          },
        ],
      };

      mockGooglePlacesClient.getDetails.mockResolvedValue(placeDetails);
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([]);

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(result.places[0].reviews).toEqual([
        {
          rating: null,
          text: '리뷰',
          authorName: '리뷰어',
          publishTime: '2024-01-01',
        },
      ]);
    });

    it('should handle null authorName in recommendation detail reviews', async () => {
      const placeRecommendations = [
        PlaceRecommendationFactory.create({
          placeId: 'place-1',
          reason: '추천',
          menuName: '김치찌개',
        }),
      ];

      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations,
      });

      const placeDetails = {
        id: 'place-1',
        displayName: { text: '식당' },
        formattedAddress: '서울시',
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
        currentOpeningHours: { openNow: true },
        photos: [],
        reviews: [
          {
            rating: 5,
            originalText: { text: '리뷰' },
            authorAttribution: undefined,
            publishTime: '2024-01-01',
          },
        ],
      };

      mockGooglePlacesClient.getDetails.mockResolvedValue(placeDetails);
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([]);

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(result.places[0].reviews).toEqual([
        {
          rating: 5,
          text: '리뷰',
          authorName: null,
          publishTime: '2024-01-01',
        },
      ]);
    });

    it('should handle null publishTime in recommendation detail reviews', async () => {
      const placeRecommendations = [
        PlaceRecommendationFactory.create({
          placeId: 'place-1',
          reason: '추천',
          menuName: '김치찌개',
        }),
      ];

      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations,
      });

      const placeDetails = {
        id: 'place-1',
        displayName: { text: '식당' },
        formattedAddress: '서울시',
        rating: 4.5,
        userRatingCount: 100,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        businessStatus: 'OPERATIONAL',
        currentOpeningHours: { openNow: true },
        photos: [],
        reviews: [
          {
            rating: 5,
            originalText: { text: '리뷰' },
            authorAttribution: { displayName: '리뷰어' },
            publishTime: undefined,
          },
        ],
      };

      mockGooglePlacesClient.getDetails.mockResolvedValue(placeDetails);
      mockGooglePlacesClient.resolvePhotoUris.mockResolvedValue([]);

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(result.places[0].reviews).toEqual([
        {
          rating: 5,
          text: '리뷰',
          authorName: '리뷰어',
          publishTime: null,
        },
      ]);
    });

    it('should return null when place details is null', async () => {
      const placeRecommendations = [
        PlaceRecommendationFactory.create({
          placeId: 'place-1',
          reason: '추천',
          menuName: '김치찌개',
        }),
      ];

      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations,
      });

      mockGooglePlacesClient.getDetails.mockResolvedValue(null);

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(result.places[0]).toEqual({
        placeId: 'place-1',
        reason: '추천',
        menuName: '김치찌개',
        name: null,
        address: null,
        rating: null,
        userRatingCount: null,
        priceLevel: null,
        businessStatus: null,
        openNow: null,
        photos: [],
        reviews: null,
      });
    });

    it('should handle undefined placeRecommendations array', async () => {
      const recommendation = MenuRecommendationFactory.create({
        placeRecommendations: undefined,
      });

      const result =
        await service.buildRecommendationDetailResponse(recommendation);

      expect(result.history.hasPlaceRecommendations).toBe(false);
      expect(result.places).toEqual([]);
    });
  });

  describe('recommendRestaurants - pipeline error handling', () => {
    it('should throw error when AI returns null recommendations object', async () => {
      const user = UserFactory.create({ id: 1 });
      const menuRecord = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations: [],
      });

      const googlePlaces = [
        {
          id: 'place-1',
          displayName: { text: '식당' },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: undefined,
          reviews: undefined,
        },
      ];

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);
      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);
      mockOpenAiPlacesService.recommendFromGooglePlaces.mockResolvedValue({
        recommendations: null,
      } as any);

      await expect(
        service.recommendRestaurants(user, 'query', '김치찌개', 1),
      ).rejects.toThrow('AI 추천 결과를 생성하지 못했습니다');
    });

    it('should throw error when AI returns undefined recommendations', async () => {
      const user = UserFactory.create({ id: 1 });
      const menuRecord = MenuRecommendationFactory.create({
        id: 1,
        user,
        placeRecommendations: [],
      });

      const googlePlaces = [
        {
          id: 'place-1',
          displayName: { text: '식당' },
          rating: 4.5,
          userRatingCount: 100,
          priceLevel: undefined,
          reviews: undefined,
        },
      ];

      mockMenuRecommendationService.findById.mockResolvedValue(menuRecord);
      mockGooglePlacesClient.searchByText.mockResolvedValue(googlePlaces);
      mockOpenAiPlacesService.recommendFromGooglePlaces.mockResolvedValue({
        recommendations: undefined,
      } as any);

      await expect(
        service.recommendRestaurants(user, 'query', '김치찌개', 1),
      ).rejects.toThrow('AI 추천 결과를 생성하지 못했습니다');
    });
  });
});
