/**
 * Menu Recommendation Integration Test
 *
 * IMPORTANT: This integration test requires PostgreSQL due to ENUM type usage in entities.
 * SQLite does not support native ENUM types used in MenuSelection.status.
 *
 * To run these tests:
 * 1. Start PostgreSQL: docker-compose up -d postgres
 * 2. Run: NODE_ENV=test DATABASE_URL="postgresql://user:password@localhost:5432/pickeat_test" pnpm jest --config=test/jest-integration.json
 *
 * Alternative: Use E2E tests (test/e2e/menu/menu.e2e-spec.ts) which provide similar coverage
 * with full AppModule integration.
 */

// IMPORTANT: Import OpenAI mock setup FIRST before any other imports
// This ensures the OpenAI module is properly mocked
import { mockChatCompletionsCreate } from '../../mocks/openai.setup';

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// Services
import { MenuService } from '@/menu/menu.service';
import { MenuRecommendationService } from '@/menu/services/menu-recommendation.service';
import { MenuSelectionService } from '@/menu/services/menu-selection.service';
import { PlaceService } from '@/menu/services/place.service';
import { OpenAiMenuService } from '@/menu/services/openai-menu.service';
import { OpenAiPlacesService } from '@/menu/services/openai-places.service';
import { TwoStageMenuService } from '@/menu/services/two-stage-menu.service';
import { Gpt4oMiniValidationService } from '@/menu/gpt/gpt4o-mini-validation.service';
import { Gpt51MenuService } from '@/menu/gpt/gpt51-menu.service';

// Entities
import { User } from '@/user/entities/user.entity';
import { UserAddress } from '@/user/entities/user-address.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { PlaceRecommendation } from '@/menu/entities/place-recommendation.entity';

// External Clients
import { GooglePlacesClient } from '@/external/google/clients/google-places.client';
import { GoogleSearchClient } from '@/external/google/clients/google-search.client';

// User Module Dependencies
import { UserAddressService } from '@/user/services/user-address.service';

// Prometheus
import { PrometheusService } from '@/prometheus/prometheus.service';

// Mocks
import { createMockPrometheusService } from '../../mocks/external-clients.mock';

// Factories
import {
  UserFactory,
  UserAddressFactory,
  MenuRecommendationFactory,
} from '../../factories/entity.factory';

// Test Database Setup
import { testDatabaseConfig } from '../../e2e/setup/test-database.setup';

// Constants
import { TEST_ENV_CONFIG } from '../../e2e/setup/auth-test.helper';

/**
 * Menu Recommendation Integration Test
 *
 * Tests the complete integration flow of menu recommendation system:
 * 1. Menu Recommendation Flow: User request → Two-stage AI recommendation → Database persistence
 * 2. Place Recommendation Flow: Menu selection → Google Places search → AI ranking → Storage
 * 3. Menu Selection Flow: Recommendation → Selection creation → History retrieval
 * 4. User Preference Integration: Preferences application in recommendations
 */
describe('Menu Recommendation Integration', () => {
  let module: TestingModule;
  let menuService: MenuService;
  let menuRecommendationService: MenuRecommendationService;
  let menuSelectionService: MenuSelectionService;
  let placeService: PlaceService;
  // let twoStageMenuService: TwoStageMenuService; // Unused

  // Repositories
  let userRepository: Repository<User>;
  let userAddressRepository: Repository<UserAddress>;
  let menuRecommendationRepository: Repository<MenuRecommendation>;
  let menuSelectionRepository: Repository<MenuSelection>;
  let placeRecommendationRepository: Repository<PlaceRecommendation>;

  // Mocks
  let mockGooglePlacesClient: jest.Mocked<GooglePlacesClient>;
  let mockGoogleSearchClient: jest.Mocked<GoogleSearchClient>;
  let mockPrometheusService: ReturnType<typeof createMockPrometheusService>;

  // Test Data
  let testUser: User;
  // let testAddress: UserAddress; // Unused

  beforeAll(async () => {
    // Create mock clients
    mockGooglePlacesClient = {
      searchByText: jest.fn(),
      getDetails: jest.fn(),
      getPhotoUri: jest.fn(),
      resolvePhotoUris: jest.fn(),
    } as unknown as jest.Mocked<GooglePlacesClient>;

    mockGoogleSearchClient = {
      searchBlogs: jest.fn(),
    } as unknown as jest.Mocked<GoogleSearchClient>;

    mockPrometheusService = createMockPrometheusService();

    // Build test module
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => TEST_ENV_CONFIG],
        }),
        TypeOrmModule.forRoot(testDatabaseConfig),
        TypeOrmModule.forFeature([
          User,
          UserAddress,
          MenuRecommendation,
          MenuSelection,
          PlaceRecommendation,
        ]),
      ],
      providers: [
        MenuService,
        MenuRecommendationService,
        MenuSelectionService,
        PlaceService,
        OpenAiMenuService,
        OpenAiPlacesService,
        TwoStageMenuService,
        Gpt4oMiniValidationService,
        Gpt51MenuService,
        UserAddressService,
        {
          provide: PrometheusService,
          useValue: mockPrometheusService,
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

    // Initialize the module to trigger onModuleInit hooks
    await module.init();

    // Get services
    menuService = module.get<MenuService>(MenuService);
    menuRecommendationService = module.get<MenuRecommendationService>(
      MenuRecommendationService,
    );
    menuSelectionService =
      module.get<MenuSelectionService>(MenuSelectionService);
    placeService = module.get<PlaceService>(PlaceService);
    // twoStageMenuService = module.get<TwoStageMenuService>(TwoStageMenuService); // Unused

    // Get repositories
    userRepository = module.get(getRepositoryToken(User));
    userAddressRepository = module.get(getRepositoryToken(UserAddress));
    menuRecommendationRepository = module.get(
      getRepositoryToken(MenuRecommendation),
    );
    menuSelectionRepository = module.get(getRepositoryToken(MenuSelection));
    placeRecommendationRepository = module.get(
      getRepositoryToken(PlaceRecommendation),
    );
  });

  beforeEach(async () => {
    // Clear all data before each test - use query builder to avoid empty criteria error
    await placeRecommendationRepository.createQueryBuilder().delete().execute();
    await menuSelectionRepository.createQueryBuilder().delete().execute();
    await menuRecommendationRepository.createQueryBuilder().delete().execute();
    await userAddressRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();

    // Create test user with preferences
    testUser = await userRepository.save(
      UserFactory.create({
        email: 'integration-test@example.com',
        name: 'Integration Test User',
        emailVerified: true,
        preferences: {
          likes: ['한식', '중식', '매운 음식'],
          dislikes: ['양식', '느끼한 음식'],
          analysis: '사용자는 한식과 중식을 선호하며, 매운 음식을 좋아합니다.',
        },
      }),
    );

    // Create default address
    await userAddressRepository.save(
      UserAddressFactory.createDefault(testUser),
    );

    // Reset mocks - just reset without setting defaults
    // Tests will set up their own mock responses
    mockChatCompletionsCreate.mockReset();
    mockGooglePlacesClient.searchByText.mockReset();
    mockGooglePlacesClient.getDetails.mockReset();
    mockGooglePlacesClient.getPhotoUri.mockReset();
    mockGooglePlacesClient.resolvePhotoUris.mockReset();
    mockGoogleSearchClient.searchBlogs.mockReset();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
    jest.restoreAllMocks();
  });

  describe('Menu Recommendation Flow', () => {
    it('should complete two-stage menu recommendation flow', async () => {
      // Arrange: Mock OpenAI validation response (Stage 1: GPT-4o-mini)
      const validationResponse = {
        id: 'chatcmpl-validation-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                intent: 'preference',
                constraints: {
                  budget: 'medium',
                  dietary: ['매운 음식'],
                  urgency: 'normal',
                },
                suggestedCategories: ['한식', '중식'],
                invalidReason: '',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80,
        },
      };

      // Mock OpenAI recommendation response (Stage 2: GPT-5.1)
      const recommendationResponse = {
        id: 'chatcmpl-recommendation-456',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개', '마파두부', '떡볶이'],
                reason:
                  '사용자가 한식과 중식, 매운 음식을 선호하시므로 김치찌개, 마파두부, 떡볶이를 추천드립니다.',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      // Mock returns validation first, then recommendation
      mockChatCompletionsCreate
        .mockResolvedValueOnce(validationResponse)
        .mockResolvedValueOnce(recommendationResponse);

      const prompt = '오늘 점심으로 매운 음식 추천해줘';

      // Act: Request menu recommendation
      const result = await menuService.recommend(testUser, prompt);

      // Assert: Verify response structure
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('recommendedAt');
      expect(result.recommendations).toEqual([
        '김치찌개',
        '마파두부',
        '떡볶이',
      ]);
      expect(result.reason).toContain('한식과 중식');

      // Verify OpenAI was called twice (validation + recommendation)
      expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(2);

      // Verify database record was created
      const savedRecommendation = await menuRecommendationRepository.findOne({
        where: { user: { id: testUser.id } },
        relations: ['user'],
      });

      expect(savedRecommendation).toBeDefined();
      expect(savedRecommendation!.prompt).toBe(prompt);
      expect(savedRecommendation!.recommendations).toEqual([
        '김치찌개',
        '마파두부',
        '떡볶이',
      ]);
      expect(savedRecommendation!.requestAddress).toBe(
        '서울특별시 강남구 테헤란로 123',
      );
    });

    it('should reject invalid menu request in Stage 1 validation', async () => {
      // Arrange: Mock OpenAI validation response with invalid request
      const invalidValidationResponse = {
        id: 'chatcmpl-validation-789',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: false,
                intent: 'preference',
                constraints: {
                  budget: 'medium',
                  dietary: [],
                  urgency: 'normal',
                },
                suggestedCategories: [],
                invalidReason: '날씨 정보 요청은 메뉴 추천과 관련이 없습니다.',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 15,
          total_tokens: 35,
        },
      };

      mockChatCompletionsCreate.mockResolvedValueOnce(
        invalidValidationResponse,
      );

      const prompt = '오늘 날씨 어때?';

      // Act & Assert: Should throw InvalidMenuRequestException
      await expect(menuService.recommend(testUser, prompt)).rejects.toThrow(
        '죄송합니다. 메뉴 추천과 관련 없는 요청입니다',
      );

      // Verify Stage 2 was never called
      expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(1);

      // Verify no database record was created
      const count = await menuRecommendationRepository.count({
        where: { user: { id: testUser.id } },
      });
      expect(count).toBe(0);
    });

    it('should apply user preferences in menu recommendation', async () => {
      // Arrange
      const validationResponse = {
        id: 'chatcmpl-validation-pref',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                intent: 'preference',
                constraints: {
                  budget: 'medium',
                  dietary: [],
                  urgency: 'normal',
                },
                suggestedCategories: ['한식'],
                invalidReason: '',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
      };

      const recommendationResponse = {
        id: 'chatcmpl-recommendation-pref',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개', '순두부찌개', '된장찌개'],
                reason:
                  '선호하시는 한식 중에서 국물 요리를 추천드립니다. 느끼한 음식을 피하고 깔끔한 맛을 선택했습니다.',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      mockChatCompletionsCreate
        .mockResolvedValueOnce(validationResponse)
        .mockResolvedValueOnce(recommendationResponse);

      // Act
      const result = await menuService.recommend(
        testUser,
        '오늘 메뉴 추천해줘',
      );

      // Assert: Verify preferences were applied
      expect(result.recommendations).toEqual([
        '김치찌개',
        '순두부찌개',
        '된장찌개',
      ]);
      expect(result.reason).toContain('한식');
      expect(result.reason).toContain('느끼한 음식을 피하고');
    });
  });

  describe('Place Recommendation Flow', () => {
    let menuRecommendation: MenuRecommendation;

    // Helper function to create menu recommendation for place tests
    async function createMenuRecommendationForPlace() {
      menuRecommendation = await menuRecommendationRepository.save(
        MenuRecommendationFactory.create({
          user: testUser,
          recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
        }),
      );
    }

    it('should complete place recommendation flow with Google Places and AI', async () => {
      // Setup: Create menu recommendation
      await createMenuRecommendationForPlace();
      // Arrange: Mock Google Places search response
      const googlePlacesResponse = [
        {
          id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
          displayName: { text: '맛있는 김치찌개', languageCode: 'ko' },
          formattedAddress: '서울특별시 강남구 테헤란로 234',
          rating: 4.5,
          userRatingCount: 150,
          location: { latitude: 37.5012345, longitude: 127.0398765 },
          reviews: [
            {
              rating: 5,
              originalText: {
                text: '김치찌개가 정말 맛있어요!',
                languageCode: 'ko',
              },
              relativePublishTimeDescription: '1주 전',
            },
          ],
        },
        {
          id: 'ChIJABCDEFGHIJKLMNOPQRSTUVW',
          displayName: { text: '할머니 김치찌개', languageCode: 'ko' },
          formattedAddress: '서울특별시 강남구 테헤란로 456',
          rating: 4.3,
          userRatingCount: 80,
          location: { latitude: 37.5023456, longitude: 127.0409876 },
          reviews: [
            {
              rating: 4,
              originalText: { text: '가격 대비 괜찮아요', languageCode: 'ko' },
              relativePublishTimeDescription: '2일 전',
            },
          ],
        },
      ];

      mockGooglePlacesClient.searchByText.mockResolvedValue(
        googlePlacesResponse,
      );

      // Mock OpenAI place recommendation response
      const placeRecommendationResponse = {
        id: 'chatcmpl-place-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [
                  {
                    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
                    reason:
                      '평점이 높고 리뷰가 좋으며 김치찌개가 맛있다는 평이 많습니다.',
                  },
                  {
                    placeId: 'ChIJABCDEFGHIJKLMNOPQRSTUVW',
                    reason: '가격 대비 만족도가 높습니다.',
                  },
                ],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
        },
      };

      mockChatCompletionsCreate.mockResolvedValue(placeRecommendationResponse);

      const textQuery = '서울 강남구 김치찌개';
      const menuName = '김치찌개';

      // Act: Request restaurant recommendations
      const result = await placeService.recommendRestaurants(
        testUser,
        textQuery,
        menuName,
        menuRecommendation.id,
      );

      // Assert: Verify response structure
      expect(result).toHaveProperty('recommendations');
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBe(2);
      expect(result.recommendations[0].placeId).toBe(
        'ChIJN1t_tDeuEmsRUsoyG83frY4',
      );
      expect(result.recommendations[0].reason).toContain('평점이 높고');

      // Verify Google Places was called
      expect(mockGooglePlacesClient.searchByText).toHaveBeenCalledWith(
        textQuery,
      );

      // Verify OpenAI was called
      expect(mockChatCompletionsCreate).toHaveBeenCalled();

      // Verify PlaceRecommendation entities were saved to database
      const savedPlaces = await placeRecommendationRepository.find({
        where: { menuRecommendation: { id: menuRecommendation.id } },
        relations: ['menuRecommendation'],
      });

      expect(savedPlaces.length).toBe(2);
      expect(savedPlaces[0].menuName).toBe(menuName);
      expect(savedPlaces[0].placeId).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
      expect(savedPlaces[1].placeId).toBe('ChIJABCDEFGHIJKLMNOPQRSTUVW');
    });

    it('should prevent duplicate place recommendations for same menu', async () => {
      // Setup: Create menu recommendation
      await createMenuRecommendationForPlace();

      // Arrange: Create existing place recommendation
      await placeRecommendationRepository.save({
        menuRecommendation,
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        reason: '기존 추천',
        menuName: '김치찌개',
      });

      // Act & Assert: Should throw error for duplicate
      await expect(
        placeService.recommendRestaurants(
          testUser,
          '서울 강남구 김치찌개',
          '김치찌개',
          menuRecommendation.id,
        ),
      ).rejects.toThrow('이 메뉴는 이미 AI 가게 추천을 받았습니다');

      // Verify no API calls were made
      expect(mockGooglePlacesClient.searchByText).not.toHaveBeenCalled();
      expect(mockChatCompletionsCreate).not.toHaveBeenCalled();
    });

    it('should handle no Google Places results gracefully', async () => {
      // Setup: Create menu recommendation
      await createMenuRecommendationForPlace();

      // Arrange: Mock empty Google Places response
      mockGooglePlacesClient.searchByText.mockResolvedValue([]);

      // Act & Assert: Should throw error for no results
      await expect(
        placeService.recommendRestaurants(
          testUser,
          '존재하지 않는 음식점',
          '김치찌개',
          menuRecommendation.id,
        ),
      ).rejects.toThrow('검색 결과를 찾을 수 없습니다');

      // Verify OpenAI was not called
      expect(mockChatCompletionsCreate).not.toHaveBeenCalled();
    });
  });

  describe('Menu Selection Flow', () => {
    let menuRecommendation: MenuRecommendation;

    // Helper function to create menu recommendation for selection tests
    async function createMenuRecommendationForSelection() {
      menuRecommendation = await menuRecommendationRepository.save(
        MenuRecommendationFactory.create({
          user: testUser,
          recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
        }),
      );
    }

    it('should create menu selection from recommendation', async () => {
      // Setup: Create menu recommendation
      await createMenuRecommendationForSelection();
      // Arrange
      const menus = [
        { slot: 'BREAKFAST', name: '김치찌개' },
        { slot: 'LUNCH', name: '된장찌개' },
        { slot: 'DINNER', name: '순두부찌개' },
      ];

      // Act: Create menu selection
      const result = await menuSelectionService.createSelection(
        testUser,
        menus,
        menuRecommendation.id,
      );

      // Assert: Verify selection was created
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.menuPayload.breakfast).toEqual(['김치찌개']);
      expect(result.menuPayload.lunch).toEqual(['된장찌개']);
      expect(result.menuPayload.dinner).toEqual(['순두부찌개']);
      expect(result.status).toBe('PENDING');

      // Verify database record
      const savedSelection = await menuSelectionRepository.findOne({
        where: { id: result.id },
        relations: ['user', 'menuRecommendation'],
      });

      expect(savedSelection).toBeDefined();
      expect(savedSelection!.user.id).toBe(testUser.id);
      expect(savedSelection!.menuRecommendation!.id).toBe(
        menuRecommendation.id,
      );
    });

    it('should retrieve menu selection history', async () => {
      // No setup needed - this test creates its own selections
      // Arrange: Create multiple selections
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const selection1 = menuSelectionRepository.create({
        user: testUser,
        selectedDate: today,
        menuPayload: {
          breakfast: ['오늘 아침'],
          lunch: ['오늘 점심'],
          dinner: [],
          etc: [],
        },
        status: MenuSelectionStatus.PENDING,
        selectedAt: new Date(),
        lastTriedAt: null,
        retryCount: 0,
        menuRecommendation: null,
      });

      const selection2 = menuSelectionRepository.create({
        user: testUser,
        selectedDate: yesterday,
        menuPayload: {
          breakfast: ['어제 아침'],
          lunch: [],
          dinner: ['어제 저녁'],
          etc: [],
        },
        status: MenuSelectionStatus.SUCCEEDED,
        selectedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        lastTriedAt: null,
        retryCount: 0,
        menuRecommendation: null,
      });

      await menuSelectionRepository.save([selection1, selection2]);

      // Act: Retrieve all selections
      const allSelections = await menuSelectionService.getSelections(testUser);

      // Assert: Verify all selections returned
      expect(allSelections.length).toBe(2);
      expect(allSelections[0].menuPayload.breakfast).toEqual(['오늘 아침']);

      // Act: Retrieve today's selections
      const todaySelections = await menuSelectionService.getSelections(
        testUser,
        today,
      );

      // Assert: Verify only today's selection returned
      expect(todaySelections.length).toBe(1);
      expect(todaySelections[0].selectedDate).toBe(today);
      expect(todaySelections[0].menuPayload.breakfast).toEqual(['오늘 아침']);
    });
  });

  describe('Complete Recommendation Journey', () => {
    it('should complete full journey: recommendation → selection → place search', async () => {
      // Step 1: Get menu recommendation
      const validationResponse = {
        id: 'chatcmpl-validation-journey',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                intent: 'preference',
                constraints: {
                  budget: 'medium',
                  dietary: [],
                  urgency: 'normal',
                },
                suggestedCategories: ['한식'],
                invalidReason: '',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
      };

      const recommendationResponse = {
        id: 'chatcmpl-recommendation-journey',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: ['김치찌개', '된장찌개', '비빔밥'],
                reason: '한식 정통 메뉴를 추천드립니다.',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      mockChatCompletionsCreate
        .mockResolvedValueOnce(validationResponse)
        .mockResolvedValueOnce(recommendationResponse);

      const menuResult = await menuService.recommend(
        testUser,
        '오늘 점심 추천해줘',
      );

      expect(menuResult.recommendations).toEqual([
        '김치찌개',
        '된장찌개',
        '비빔밥',
      ]);

      // Step 2: Create menu selection
      const selection = await menuSelectionService.createSelection(
        testUser,
        [{ slot: 'LUNCH', name: '김치찌개' }],
        menuResult.id,
      );

      expect(selection.menuPayload.lunch).toEqual(['김치찌개']);

      // Step 3: Get place recommendations
      const googlePlacesResponse = [
        {
          id: 'ChIJ-place-123',
          displayName: { text: '할머니 김치찌개', languageCode: 'ko' },
          formattedAddress: '서울특별시 강남구 테헤란로 123',
          rating: 4.6,
          userRatingCount: 200,
          location: { latitude: 37.5, longitude: 127.0 },
          reviews: [
            {
              rating: 5,
              originalText: { text: '최고예요!', languageCode: 'ko' },
              relativePublishTimeDescription: '1일 전',
            },
          ],
        },
      ];

      mockGooglePlacesClient.searchByText.mockResolvedValue(
        googlePlacesResponse,
      );

      const placeRecommendationResponse = {
        id: 'chatcmpl-place-journey',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: [
                  {
                    placeId: 'ChIJ-place-123',
                    reason: '평점과 리뷰가 우수합니다.',
                  },
                ],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 150, completion_tokens: 50, total_tokens: 200 },
      };

      mockChatCompletionsCreate.mockResolvedValue(placeRecommendationResponse);

      const placeResult = await placeService.recommendRestaurants(
        testUser,
        '서울 강남구 김치찌개',
        '김치찌개',
        menuResult.id,
      );

      expect(placeResult.recommendations.length).toBe(1);
      expect(placeResult.recommendations[0].placeId).toBe('ChIJ-place-123');

      // Step 4: Verify complete data persistence
      const savedRecommendation = await menuRecommendationRepository.findOne({
        where: { id: menuResult.id },
        relations: ['placeRecommendations', 'selections'],
      });

      expect(savedRecommendation).toBeDefined();
      expect(savedRecommendation!.placeRecommendations.length).toBe(1);
      expect(savedRecommendation!.selections.length).toBe(1);
      expect(savedRecommendation!.placeRecommendations[0].menuName).toBe(
        '김치찌개',
      );
    });
  });

  describe('Recommendation History', () => {
    it('should retrieve paginated recommendation history', async () => {
      // Arrange: Mock all OpenAI responses upfront for 3 recommendations
      // Each recommendation needs 2 calls: validation + recommendation
      const validationResponse = {
        id: 'chatcmpl-validation-hist',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                intent: 'preference',
                constraints: {
                  budget: 'medium',
                  dietary: [],
                  urgency: 'normal',
                },
                suggestedCategories: ['한식'],
                invalidReason: '',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
      };

      const createRecommendationResponse = (menus: string[]) => ({
        id: `chatcmpl-recommendation-${Date.now()}`,
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                recommendations: menus,
                reason: '추천 이유',
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      });

      // Setup all 6 mock responses (3 recommendations × 2 calls each)
      mockChatCompletionsCreate
        .mockResolvedValueOnce(validationResponse) // Rec 1: validation
        .mockResolvedValueOnce(
          createRecommendationResponse(['김치찌개', '된장찌개', '순두부찌개']),
        ) // Rec 1: recommendation
        .mockResolvedValueOnce(validationResponse) // Rec 2: validation
        .mockResolvedValueOnce(
          createRecommendationResponse(['비빔밥', '불고기', '제육볶음']),
        ) // Rec 2: recommendation
        .mockResolvedValueOnce(validationResponse) // Rec 3: validation
        .mockResolvedValueOnce(
          createRecommendationResponse(['떡볶이', '순대', '튀김']),
        ); // Rec 3: recommendation

      // Create recommendations
      await menuService.recommend(testUser, '메뉴 추천해줘');
      await menuService.recommend(testUser, '메뉴 추천해줘');
      await menuService.recommend(testUser, '메뉴 추천해줘');

      // Act: Get history with pagination
      const history = await menuRecommendationService.getHistory(
        testUser,
        1,
        10,
      );

      // Assert
      expect(history.items.length).toBe(3);
      expect(history.pageInfo.totalCount).toBe(3);
      expect(history.pageInfo.page).toBe(1);
      expect(history.pageInfo.limit).toBe(10);
      expect(history.pageInfo.hasNext).toBe(false);

      // Verify most recent is first (DESC order)
      expect(history.items[0].recommendations).toEqual([
        '떡볶이',
        '순대',
        '튀김',
      ]);
    });

    it('should filter history by date', async () => {
      // Arrange: Create recommendation
      const today = new Date().toISOString().split('T')[0];

      await menuRecommendationRepository.save(
        MenuRecommendationFactory.create({
          user: testUser,
          recommendations: ['오늘 메뉴'],
          recommendedAt: new Date(),
        }),
      );

      // Create old recommendation
      const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await menuRecommendationRepository.save(
        MenuRecommendationFactory.create({
          user: testUser,
          recommendations: ['1주일 전 메뉴'],
          recommendedAt: oldDate,
        }),
      );

      // Act: Get today's history
      const todayHistory = await menuRecommendationService.getHistory(
        testUser,
        1,
        10,
        today,
      );

      // Assert
      expect(todayHistory.items.length).toBe(1);
      expect(todayHistory.items[0].recommendations).toEqual(['오늘 메뉴']);
    });
  });
});
