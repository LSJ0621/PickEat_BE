import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createE2EApp,
  closeE2EApp,
  truncateAllTables,
  createAuthenticatedUser,
  authenticatedRequest,
  type TestUser,
} from './setup';
import { TEST_TIMEOUTS, TEST_IDS } from '../constants/test.constants';

describe('Rating (e2e)', () => {
  let app: INestApplication;

  const api = () => supertest(app.getHttpServer());

  beforeAll(async () => {
    app = await createE2EApp();
  }, TEST_TIMEOUTS.E2E_DEFAULT_MS);

  afterAll(async () => {
    await closeE2EApp(app);
  });

  beforeEach(async () => {
    await truncateAllTables(app);
  });

  // ========== 헬퍼 ==========

  async function selectPlace(
    accessToken: string,
    placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    placeName = '테스트 식당',
  ) {
    const req = authenticatedRequest(app, accessToken);
    return req.post('/ratings/select').send({ placeId, placeName });
  }

  // =====================
  // 평점 대상 선택 (POST /ratings/select)
  // =====================
  describe('POST /ratings/select', () => {
    it('should return 201 when placeId and placeName are provided', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await selectPlace(testUser.accessToken);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('placeId');
      expect(res.body).toHaveProperty('placeName');
    });

    it('should return 400 when placeId is missing', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/ratings/select').send({
        placeName: '테스트 식당',
      });

      expect(res.status).toBe(400);
    });

    it('should return 401 when request is made without authentication', async () => {
      const res = await api().post('/ratings/select').send({
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        placeName: '테스트 식당',
      });

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 평점 제출 (POST /ratings/submit)
  // =====================
  describe('POST /ratings/submit', () => {
    it('should return 200 when placeRatingId and rating between 1-5 are valid', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const selectRes = await selectPlace(testUser.accessToken);
      const placeRatingId: number = selectRes.body.id;

      const req = authenticatedRequest(app, testUser.accessToken);
      const res = await req.post('/ratings/submit').send({
        placeRatingId,
        rating: 4,
      });

      expect(res.status).toBe(200);
    });

    it('should return 400 when rating is 0 (below minimum)', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const selectRes = await selectPlace(testUser.accessToken);
      const placeRatingId: number = selectRes.body.id;

      const req = authenticatedRequest(app, testUser.accessToken);
      const res = await req.post('/ratings/submit').send({
        placeRatingId,
        rating: 0,
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when rating is 6 (above maximum)', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const selectRes = await selectPlace(testUser.accessToken);
      const placeRatingId: number = selectRes.body.id;

      const req = authenticatedRequest(app, testUser.accessToken);
      const res = await req.post('/ratings/submit').send({
        placeRatingId,
        rating: 6,
      });

      expect(res.status).toBe(400);
    });

    it('should return 404 when placeRatingId does not exist', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/ratings/submit').send({
        placeRatingId: TEST_IDS.NON_EXISTENT,
        rating: 3,
      });

      expect(res.status).toBe(404);
    });

    it('should return 403 when submitting rating for another user\'s placeRatingId', async () => {
      const userA: TestUser = await createAuthenticatedUser(app);
      const userB: TestUser = await createAuthenticatedUser(app);

      const selectRes = await selectPlace(userA.accessToken);
      const placeRatingId: number = selectRes.body.id;

      const reqB = authenticatedRequest(app, userB.accessToken);
      const res = await reqB.post('/ratings/submit').send({ placeRatingId, rating: 3 });

      expect(res.status).toBe(403);
    });
  });

  // =====================
  // 평점 건너뛰기 (POST /ratings/skip)
  // =====================
  describe('POST /ratings/skip', () => {
    it('should return 200 when skipping a pending rating', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const selectRes = await selectPlace(testUser.accessToken);
      const placeRatingId: number = selectRes.body.id;

      const req = authenticatedRequest(app, testUser.accessToken);
      const res = await req.post('/ratings/skip').send({ placeRatingId });

      expect(res.status).toBe(200);
    });

    it('should return 403 when skipping another user\'s placeRatingId', async () => {
      const userA: TestUser = await createAuthenticatedUser(app);
      const userB: TestUser = await createAuthenticatedUser(app);

      const selectRes = await selectPlace(userA.accessToken);
      const placeRatingId: number = selectRes.body.id;

      const reqB = authenticatedRequest(app, userB.accessToken);
      const res = await reqB.post('/ratings/skip').send({ placeRatingId });

      expect(res.status).toBe(403);
    });
  });

  // =====================
  // 평점 무시 (POST /ratings/dismiss)
  // =====================
  describe('POST /ratings/dismiss', () => {
    it('should return 200 when dismissing a pending rating prompt', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const selectRes = await selectPlace(testUser.accessToken);
      const placeRatingId: number = selectRes.body.id;

      const req = authenticatedRequest(app, testUser.accessToken);
      const res = await req.post('/ratings/dismiss').send({ placeRatingId });

      expect(res.status).toBe(200);
    });

    it('should return 403 when dismissing another user\'s placeRatingId', async () => {
      const userA: TestUser = await createAuthenticatedUser(app);
      const userB: TestUser = await createAuthenticatedUser(app);

      const selectRes = await selectPlace(userA.accessToken);
      const placeRatingId: number = selectRes.body.id;

      const reqB = authenticatedRequest(app, userB.accessToken);
      const res = await reqB.post('/ratings/dismiss').send({ placeRatingId });

      expect(res.status).toBe(403);
    });
  });

  // =====================
  // 평점 이력 (GET /ratings/history)
  // =====================
  describe('GET /ratings/history', () => {
    it('should return 200 with paginated rating history', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      // Create and submit a rating
      const selectRes = await selectPlace(testUser.accessToken);
      const placeRatingId: number = selectRes.body.id;
      const req = authenticatedRequest(app, testUser.accessToken);
      await req.post('/ratings/submit').send({ placeRatingId, rating: 5 });

      const res = await req.get('/ratings/history');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('should not include other users\' ratings in history response', async () => {
      const userA: TestUser = await createAuthenticatedUser(app);
      const userB: TestUser = await createAuthenticatedUser(app);

      // A가 평점 제출
      const selectResA = await selectPlace(userA.accessToken, 'place-a', '식당A');
      const reqA = authenticatedRequest(app, userA.accessToken);
      await reqA.post('/ratings/submit').send({ placeRatingId: selectResA.body.id, rating: 5 });

      // B의 history 조회 → A의 평점이 포함되지 않아야 함
      const reqB = authenticatedRequest(app, userB.accessToken);
      const res = await reqB.get('/ratings/history');

      expect(res.status).toBe(200);
      const ids: number[] = res.body.items.map((item: { id: number }) => item.id);
      expect(ids).not.toContain(selectResA.body.id);
    });

    it('should return only ratings on the given date when selectedDate filter is applied', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      // Create and submit a rating
      const selectRes = await selectPlace(testUser.accessToken);
      const placeRatingId: number = selectRes.body.id;
      const req = authenticatedRequest(app, testUser.accessToken);
      await req.post('/ratings/submit').send({ placeRatingId, rating: 3 });

      const today = new Date().toISOString().split('T')[0];
      const res = await req.get(`/ratings/history?selectedDate=${today}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  // =====================
  // 대기 중인 평점 (GET /ratings/pending)
  // =====================
  describe('GET /ratings/pending', () => {
    it('should return 200 with pending place list', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      // Create a rating entry (not yet submitted)
      await selectPlace(testUser.accessToken);

      const req = authenticatedRequest(app, testUser.accessToken);
      const res = await req.get('/ratings/pending');

      expect(res.status).toBe(200);
    });
  });
});
