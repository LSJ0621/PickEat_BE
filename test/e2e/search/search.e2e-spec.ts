import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

import { createTestingApp, closeTestingApp } from '../setup/testing-app.module';
import { AuthTestHelper } from '../setup/auth-test.helper';
import {
  mockNaverSearchResponses,
  mockNaverMapResponses,
} from '../../mocks/external-clients.mock';
import { TEST_COORDINATES } from '../../constants/test.constants';

describe('Search (e2e)', () => {
  let app: INestApplication;
  let mocks: any;
  let authHelper: AuthTestHelper;

  beforeAll(async () => {
    const testApp = await createTestingApp();
    app = testApp.app;
    mocks = testApp.mocks;
    authHelper = new AuthTestHelper(app);
  });

  afterAll(async () => {
    await closeTestingApp(app);
  });

  beforeEach(() => {
    // Reset mock call counts but preserve implementations
    jest.clearAllMocks();

    // Re-setup Naver Search and Map mocks after clearing
    mocks.mockNaverSearchClient.searchLocal.mockResolvedValue(
      mockNaverSearchResponses.localSearchSuccess.items,
    );
    mocks.mockNaverMapClient.reverseGeocode.mockResolvedValue(
      mockNaverMapResponses.reverseGeocodeSuccess.results,
    );
  });

  describe('POST /search/restaurants', () => {
    it('should search restaurants using Naver Search API', async () => {
      // Arrange: Mock Naver Search response (already set in beforeEach)
      // No need to re-mock here

      const dto = {
        menuName: '김치찌개',
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(201);

      // Assert
      expect(response.body).toHaveProperty('restaurants');
      expect(Array.isArray(response.body.restaurants)).toBe(true);
      expect(response.body.restaurants.length).toBeGreaterThan(0);
      expect(response.body.restaurants[0]).toHaveProperty('name');
      expect(response.body.restaurants[0]).toHaveProperty('address');
      expect(response.body.restaurants[0]).toHaveProperty('mapx');
      expect(response.body.restaurants[0]).toHaveProperty('mapy');

      // Verify Naver Search was called
      expect(mocks.mockNaverSearchClient.searchLocal).toHaveBeenCalled();
    });

    it('should search with includeRoadAddress option', async () => {
      // Mock is already set in beforeEach

      const dto = {
        menuName: '된장찌개',
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
        includeRoadAddress: true,
      };

      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(201);

      expect(response.body.restaurants).toBeDefined();
      expect(mocks.mockNaverSearchClient.searchLocal).toHaveBeenCalled();
    });

    it('should return 401 when not authenticated', async () => {
      const dto = {
        menuName: '김치찌개',
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
      };

      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .send(dto)
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });

    it('should return 400 when menuName is missing', async () => {
      const dto = {
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
      };

      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 when menuName is empty', async () => {
      const dto = {
        menuName: '',
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
      };

      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 when latitude is missing', async () => {
      const dto = {
        menuName: '김치찌개',
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
      };

      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 when longitude is missing', async () => {
      const dto = {
        menuName: '김치찌개',
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
      };

      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 when latitude is out of range (> 90)', async () => {
      const dto = {
        menuName: '김치찌개',
        latitude: 91.0,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
      };

      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 when latitude is out of range (< -90)', async () => {
      const dto = {
        menuName: '김치찌개',
        latitude: -91.0,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
      };

      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 when longitude is out of range (> 180)', async () => {
      const dto = {
        menuName: '김치찌개',
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
        longitude: 181.0,
      };

      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 when longitude is out of range (< -180)', async () => {
      const dto = {
        menuName: '김치찌개',
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
        longitude: -181.0,
      };

      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should accept valid boundary latitude values', async () => {
      // Mock is already set in beforeEach

      const dtoMin = {
        menuName: '김치찌개',
        latitude: -90.0,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
      };

      await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dtoMin)
        .expect(201);

      const dtoMax = {
        menuName: '김치찌개',
        latitude: 90.0,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
      };

      await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dtoMax)
        .expect(201);
    });

    it('should accept valid boundary longitude values', async () => {
      // Mock is already set in beforeEach

      const dtoMin = {
        menuName: '김치찌개',
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
        longitude: -180.0,
      };

      await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dtoMin)
        .expect(201);

      const dtoMax = {
        menuName: '김치찌개',
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
        longitude: 180.0,
      };

      await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dtoMax)
        .expect(201);
    });

    it('should handle Naver API returning empty results', async () => {
      // Mock empty response
      mocks.mockNaverSearchClient.searchLocal.mockResolvedValue([]);

      const dto = {
        menuName: '존재하지않는메뉴명',
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
      };

      // The service throws BadRequestException when no results
      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send(dto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should search restaurants with Korean menu names', async () => {
      // Mock is already set in beforeEach

      const koreanMenus = ['김치찌개', '된장찌개', '비빔밥', '냉면', '삼겹살'];

      for (const menuName of koreanMenus) {
        const dto = {
          menuName,
          latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
          longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
        };

        const response = await request(app.getHttpServer())
          .post('/search/restaurants')
          .set(authHelper.getUserAuthHeaders())
          .send(dto)
          .expect(201);

        expect(response.body.restaurants).toBeDefined();
      }
    });

    it('should transform latitude and longitude from string to number', async () => {
      // Mock is already set in beforeEach

      // Send as strings - should be transformed by class-transformer
      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send({
          menuName: '김치찌개',
          latitude: String(TEST_COORDINATES.GANGNAM.LATITUDE),
          longitude: String(TEST_COORDINATES.GANGNAM.LONGITUDE),
        })
        .expect(201);

      expect(response.body.restaurants).toBeDefined();
      expect(mocks.mockNaverSearchClient.searchLocal).toHaveBeenCalled();
    });

    it('should return 400 when latitude is not a valid number', async () => {
      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send({
          menuName: '김치찌개',
          latitude: 'invalid',
          longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should return 400 when longitude is not a valid number', async () => {
      const response = await request(app.getHttpServer())
        .post('/search/restaurants')
        .set(authHelper.getUserAuthHeaders())
        .send({
          menuName: '김치찌개',
          latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
          longitude: 'invalid',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });
  });
});
