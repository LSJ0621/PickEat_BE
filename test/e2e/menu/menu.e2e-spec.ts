// IMPORTANT: Import OpenAI mock setup FIRST before any other imports
import {
  mockChatCompletionsCreate,
  resetOpenAIMock,
} from '../../mocks/openai.setup';

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

import {
  createTestingApp,
  closeTestingApp,
  createAllMockClients,
} from '../setup/testing-app.module';
import { AuthTestHelper } from '../setup/auth-test.helper';
import { User } from '@/user/entities/user.entity';
import { UserAddress } from '@/user/entities/user-address.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { PlaceRecommendation } from '@/menu/entities/place-recommendation.entity';
import {
  UserFactory,
  UserAddressFactory,
  MenuRecommendationFactory,
  MenuSelectionFactory,
  PlaceRecommendationFactory,
} from '../../factories/entity.factory';
import {
  mockGooglePlacesResponses,
  mockGoogleCseResponses,
} from '../../mocks/external-clients.mock';
import { mockPlaceRecommendationResponse } from '../../mocks/openai.mock';
import { MenuSlot } from '@/menu/dto/create-menu-selection.dto';

describe('Menu (e2e)', () => {
  let app: INestApplication;
  let mocks: ReturnType<typeof createAllMockClients>;
  let authHelper: AuthTestHelper;
  let userRepository: Repository<User>;
  let userAddressRepository: Repository<UserAddress>;
  let menuRecommendationRepository: Repository<MenuRecommendation>;
  let menuSelectionRepository: Repository<MenuSelection>;
  let placeRecommendationRepository: Repository<PlaceRecommendation>;
  let testUser: User;

  beforeAll(async () => {
    const testApp = await createTestingApp();
    app = testApp.app;
    mocks = testApp.mocks;
    authHelper = new AuthTestHelper(app);

    // Get repositories
    userRepository = app.get(getRepositoryToken(User));
    userAddressRepository = app.get(getRepositoryToken(UserAddress));
    menuRecommendationRepository = app.get(
      getRepositoryToken(MenuRecommendation),
    );
    menuSelectionRepository = app.get(getRepositoryToken(MenuSelection));
    placeRecommendationRepository = app.get(
      getRepositoryToken(PlaceRecommendation),
    );
  });

  beforeEach(async () => {
    // Clear all data before each test
    await placeRecommendationRepository.createQueryBuilder().delete().execute();
    await menuSelectionRepository.createQueryBuilder().delete().execute();
    await menuRecommendationRepository.createQueryBuilder().delete().execute();
    await userAddressRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();

    // Create test user with default email from UserFactory
    // This ensures the AuthTestHelper's getUserAuthHeaders() creates a token for this user
    testUser = await userRepository.save(
      UserFactory.create({
        emailVerified: true,
        preferences: {
          likes: ['한식', '중식'],
          dislikes: ['양식'],
        },
      }),
    );

    // Create default address for test user (required for menu recommendations)
    await userAddressRepository.save(
      UserAddressFactory.createDefault(testUser),
    );

    // Reset OpenAI mock
    resetOpenAIMock();
  });

  afterAll(async () => {
    await closeTestingApp(app);
    jest.restoreAllMocks();
  });

  describe('POST /menu/recommend', () => {
    it('should recommend menus based on user prompt with OpenAI', async () => {
      // Mock is set up in beforeEach via resetOpenAIMock()
      const dto = {
        prompt: '오늘 점심 메뉴 추천해줘',
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/menu/recommend')
        .set(authHelper.getUserAuthHeaders())
        .send(dto);

      expect(response.status).toBe(201);

      // Assert
      expect(response.body).toHaveProperty('recommendations');
      expect(response.body).toHaveProperty('reason');
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('recommendedAt');
      expect(response.body).toHaveProperty('requestAddress');
      expect(Array.isArray(response.body.recommendations)).toBe(true);
      // Note: mockChatCompletionsCreate is not called because TwoStageMenuService
      // is mocked at service level in testing-app.module.ts

      // Verify database record was created
      const savedRecommendation = await menuRecommendationRepository.findOne({
        where: { user: { id: testUser.id } },
      });
      expect(savedRecommendation).toBeDefined();
      expect(savedRecommendation).not.toBeNull();
      expect(savedRecommendation!.prompt).toBe(dto.prompt);
    });

    it('should return 401 when not authenticated', async () => {
      const dto = {
        prompt: '오늘 점심 메뉴 추천해줘',
      };

      const response = await request(app.getHttpServer())
        .post('/menu/recommend')
        .send(dto)
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });

    it('should return 400 when prompt is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/menu/recommend')
        .set(authHelper.getUserAuthHeaders())
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 when prompt is empty string', async () => {
      const response = await request(app.getHttpServer())
        .post('/menu/recommend')
        .set(authHelper.getUserAuthHeaders())
        .send({ prompt: '' })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('POST /menu/selections', () => {
    let recommendation: MenuRecommendation;

    beforeEach(async () => {
      // Create a menu recommendation for the test user
      recommendation = await menuRecommendationRepository.save(
        MenuRecommendationFactory.create({
          user: testUser,
          recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
        }),
      );
    });

    it('should create menu selection successfully', async () => {
      const dto = {
        menus: [
          { slot: MenuSlot.BREAKFAST, name: '김치찌개' },
          { slot: MenuSlot.LUNCH, name: '된장찌개' },
          { slot: MenuSlot.DINNER, name: '순두부찌개' },
        ],
        historyId: recommendation.id,
      };

      const response = await request(app.getHttpServer())
        .post('/menu/selections')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(201);

      expect(response.body).toHaveProperty('selection');
      expect(response.body.selection).toHaveProperty('id');
      expect(response.body.selection).toHaveProperty('menuPayload');
      expect(response.body.selection.menuPayload.breakfast).toEqual([
        '김치찌개',
      ]);
      expect(response.body.selection.menuPayload.lunch).toEqual(['된장찌개']);
      expect(response.body.selection.menuPayload.dinner).toEqual([
        '순두부찌개',
      ]);
      expect(response.body.selection.historyId).toBe(recommendation.id);
    });

    it('should create menu selection without historyId', async () => {
      const dto = {
        menus: [{ slot: MenuSlot.LUNCH, name: '비빔밥' }],
      };

      const response = await request(app.getHttpServer())
        .post('/menu/selections')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(201);

      expect(response.body.selection.menuPayload.lunch).toEqual(['비빔밥']);
      expect(response.body.selection.historyId).toBeNull();
    });

    it('should return 401 when not authenticated', async () => {
      const dto = {
        menus: [{ slot: MenuSlot.LUNCH, name: '비빔밥' }],
      };

      const response = await request(app.getHttpServer())
        .post('/menu/selections')
        .send(dto)
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });

    it('should return 400 when menus array is empty', async () => {
      const dto = {
        menus: [],
      };

      const response = await request(app.getHttpServer())
        .post('/menu/selections')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 when slot is invalid', async () => {
      const dto = {
        menus: [{ slot: 'invalid_slot', name: '김치찌개' }],
      };

      const response = await request(app.getHttpServer())
        .post('/menu/selections')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('GET /menu/selections/history', () => {
    beforeEach(async () => {
      // Create menu selections for different dates
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      await menuSelectionRepository.save([
        MenuSelectionFactory.create({
          user: testUser,
          selectedDate: today,
          menuPayload: {
            breakfast: ['오늘 아침'],
            lunch: ['오늘 점심'],
            dinner: [],
            etc: [],
          },
        }),
        MenuSelectionFactory.create({
          user: testUser,
          selectedDate: yesterday,
          menuPayload: {
            breakfast: ['어제 아침'],
            lunch: [],
            dinner: ['어제 저녁'],
            etc: [],
          },
        }),
      ]);
    });

    it('should return all selections when date is not specified', async () => {
      const response = await request(app.getHttpServer())
        .get('/menu/selections/history')
        .set(authHelper.getUserAuthHeaders())
        .expect(200);

      expect(response.body).toHaveProperty('selections');
      expect(Array.isArray(response.body.selections)).toBe(true);
      expect(response.body.selections.length).toBeGreaterThanOrEqual(2);
    });

    it('should return selections for specific date', async () => {
      const today = new Date().toISOString().split('T')[0];

      const response = await request(app.getHttpServer())
        .get(`/menu/selections/history?date=${today}`)
        .set(authHelper.getUserAuthHeaders())
        .expect(200);

      expect(response.body.selections.length).toBeGreaterThanOrEqual(1);
      expect(response.body.selections[0].selectedDate).toBe(today);
    });

    it('should return empty array when no selections for date', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const response = await request(app.getHttpServer())
        .get(`/menu/selections/history?date=${futureDate}`)
        .set(authHelper.getUserAuthHeaders())
        .expect(200);

      expect(response.body.selections).toEqual([]);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app.getHttpServer())
        .get('/menu/selections/history')
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('GET /menu/recommend/places', () => {
    it('should recommend places with Google Places and OpenAI', async () => {
      // Create a recommendation first (required for place recommendations)
      const recommendation = await menuRecommendationRepository.save(
        MenuRecommendationFactory.create({ user: testUser }),
      );

      // Arrange: Mock Google Places and OpenAI responses
      mocks.mockGooglePlacesClient.searchByText.mockResolvedValue(
        mockGooglePlacesResponses.searchSuccess.places,
      );

      // Override OpenAI mock to return place recommendation response (not validation response)
      mockChatCompletionsCreate.mockReset();
      mockChatCompletionsCreate.mockResolvedValue(
        mockPlaceRecommendationResponse,
      );

      const query = '서울 강남구 김치찌개';
      const menuName = '김치찌개';

      // Act
      const response = await request(app.getHttpServer())
        .get('/menu/recommend/places')
        .query({ query, menuName, historyId: recommendation.id })
        .set(authHelper.getUserAuthHeaders())
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('recommendations');
      expect(Array.isArray(response.body.recommendations)).toBe(true);
      expect(response.body.recommendations.length).toBeGreaterThan(0);
      expect(response.body.recommendations[0]).toHaveProperty('placeId');
      expect(response.body.recommendations[0]).toHaveProperty('name');
      expect(response.body.recommendations[0]).toHaveProperty('reason');
      expect(mocks.mockGooglePlacesClient.searchByText).toHaveBeenCalledWith(
        query,
      );
      // Note: mockChatCompletionsCreate is not called because OpenAiPlacesService
      // is mocked at service level in testing-app.module.ts
    });

    it('should work with historyId parameter', async () => {
      // Create a recommendation first
      const recommendation = await menuRecommendationRepository.save(
        MenuRecommendationFactory.create({ user: testUser }),
      );

      mocks.mockGooglePlacesClient.searchByText.mockResolvedValue(
        mockGooglePlacesResponses.searchSuccess.places,
      );

      // Override OpenAI mock to return place recommendation response
      mockChatCompletionsCreate.mockReset();
      mockChatCompletionsCreate.mockResolvedValue(
        mockPlaceRecommendationResponse,
      );

      const response = await request(app.getHttpServer())
        .get('/menu/recommend/places')
        .query({
          query: '서울 강남구 김치찌개',
          menuName: '김치찌개',
          historyId: recommendation.id,
        })
        .set(authHelper.getUserAuthHeaders())
        .expect(200);

      expect(response.body).toHaveProperty('recommendations');
      expect(Array.isArray(response.body.recommendations)).toBe(true);

      // Verify PlaceRecommendation was saved with historyId
      const savedPlace = await placeRecommendationRepository.findOne({
        where: { menuRecommendation: { id: recommendation.id } },
      });
      expect(savedPlace).toBeDefined();
    });

    it('should return 400 when menuName is missing', async () => {
      const response = await request(app.getHttpServer())
        .get('/menu/recommend/places')
        .query({ query: '서울 강남구' })
        .set(authHelper.getUserAuthHeaders())
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app.getHttpServer())
        .get('/menu/recommend/places')
        .query({ query: '서울 강남구', menuName: '김치찌개' })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('GET /menu/places/:placeId/detail', () => {
    it('should return place details from Google Places', async () => {
      const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

      // Mock Google Places response
      mocks.mockGooglePlacesClient.getDetails.mockResolvedValue(
        mockGooglePlacesResponses.placeDetailsSuccess,
      );

      const response = await request(app.getHttpServer())
        .get(`/menu/places/${placeId}/detail`)
        .set(authHelper.getUserAuthHeaders())
        .expect(200);

      expect(response.body).toHaveProperty('place');
      expect(response.body.place).toHaveProperty('id');
      expect(response.body.place).toHaveProperty('name');
      expect(response.body.place).toHaveProperty('address');
      expect(response.body.place.id).toBe(placeId);
      expect(mocks.mockGooglePlacesClient.getDetails).toHaveBeenCalledWith(
        placeId,
        expect.any(Object),
      );
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app.getHttpServer())
        .get('/menu/places/ChIJN1t_tDeuEmsRUsoyG83frY4/detail')
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('GET /menu/recommendations/history', () => {
    beforeEach(async () => {
      // Create multiple recommendations
      await menuRecommendationRepository.save([
        MenuRecommendationFactory.create({
          user: testUser,
          recommendations: ['메뉴1', '메뉴2'],
          recommendedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        }),
        MenuRecommendationFactory.create({
          user: testUser,
          recommendations: ['메뉴3', '메뉴4'],
          recommendedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        }),
        MenuRecommendationFactory.create({
          user: testUser,
          recommendations: ['메뉴5', '메뉴6'],
          recommendedAt: new Date(),
        }),
      ]);
    });

    it('should return paginated recommendation history', async () => {
      const response = await request(app.getHttpServer())
        .get('/menu/recommendations/history')
        .query({ page: 1, limit: 10 })
        .set(authHelper.getUserAuthHeaders())
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('pageInfo');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.pageInfo).toHaveProperty('totalCount');
      expect(response.body.pageInfo).toHaveProperty('page');
      expect(response.body.pageInfo).toHaveProperty('limit');
      expect(response.body.pageInfo.totalCount).toBeGreaterThanOrEqual(3);
    });

    it('should filter by date when provided', async () => {
      const today = new Date().toISOString().split('T')[0];

      const response = await request(app.getHttpServer())
        .get('/menu/recommendations/history')
        .query({ page: 1, limit: 10, date: today })
        .set(authHelper.getUserAuthHeaders())
        .expect(200);

      expect(Array.isArray(response.body.items)).toBe(true);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app.getHttpServer())
        .get('/menu/recommendations/history')
        .query({ page: 1, limit: 10 })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('GET /menu/recommendations/:id', () => {
    let recommendation: MenuRecommendation;

    beforeEach(async () => {
      recommendation = await menuRecommendationRepository.save(
        MenuRecommendationFactory.create({
          user: testUser,
          recommendations: ['김치찌개', '된장찌개'],
        }),
      );

      await placeRecommendationRepository.save(
        PlaceRecommendationFactory.create({
          menuRecommendation: recommendation,
          menuName: '김치찌개',
        }),
      );
    });

    it('should return recommendation detail with place recommendations', async () => {
      const response = await request(app.getHttpServer())
        .get(`/menu/recommendations/${recommendation.id}`)
        .set(authHelper.getUserAuthHeaders())
        .expect(200);

      expect(response.body).toHaveProperty('history');
      expect(response.body).toHaveProperty('places');
      expect(response.body.history.id).toBe(recommendation.id);
      expect(Array.isArray(response.body.places)).toBe(true);
    });

    it('should return 400 when id is not a number', async () => {
      const response = await request(app.getHttpServer())
        .get('/menu/recommendations/invalid-id')
        .set(authHelper.getUserAuthHeaders())
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 when recommendation not found', async () => {
      const response = await request(app.getHttpServer())
        .get('/menu/recommendations/999999')
        .set(authHelper.getUserAuthHeaders())
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app.getHttpServer())
        .get(`/menu/recommendations/${recommendation.id}`)
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('GET /menu/restaurant/blogs', () => {
    it('should search restaurant blogs using Google Custom Search', async () => {
      // Mock Google Search response
      mocks.mockGoogleSearchClient.searchBlogs.mockResolvedValue(
        mockGoogleCseResponses.searchSuccess.items,
      );

      const response = await request(app.getHttpServer())
        .get('/menu/restaurant/blogs')
        .query({
          query: '부산시 해운대구 마라탕집',
          restaurantName: '마라탕집',
        })
        .set(authHelper.getUserAuthHeaders())
        .expect(200);

      expect(response.body).toHaveProperty('blogs');
      expect(Array.isArray(response.body.blogs)).toBe(true);
      expect(response.body.blogs.length).toBeGreaterThan(0);
      expect(response.body.blogs[0]).toHaveProperty('title');
      expect(response.body.blogs[0]).toHaveProperty('link');
      expect(mocks.mockGoogleSearchClient.searchBlogs).toHaveBeenCalled();
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app.getHttpServer())
        .get('/menu/restaurant/blogs')
        .query({
          query: '부산시 해운대구 마라탕집',
          restaurantName: '마라탕집',
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('PATCH /menu/selections/:id', () => {
    let selection: MenuSelection;

    beforeEach(async () => {
      selection = await menuSelectionRepository.save(
        MenuSelectionFactory.create({
          user: testUser,
          menuPayload: {
            breakfast: ['김치찌개'],
            lunch: ['된장찌개'],
            dinner: [],
            etc: [],
          },
        }),
      );
    });

    it('should update menu selection status', async () => {
      const dto = {
        cancel: true,
      };

      const response = await request(app.getHttpServer())
        .patch(`/menu/selections/${selection.id}`)
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(200);

      expect(response.body.selection.id).toBe(selection.id);
    });

    it('should return 400 when id is not a number', async () => {
      const response = await request(app.getHttpServer())
        .patch('/menu/selections/invalid-id')
        .set(authHelper.getUserAuthHeaders())
        .send({ cancel: true })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/menu/selections/${selection.id}`)
        .send({ cancel: true })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });
});
