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
    it('placeId와 placeName이 제공되면 201을 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await selectPlace(testUser.accessToken);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('placeId');
      expect(res.body).toHaveProperty('placeName');
    });

    it('placeId 누락 시 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/ratings/select').send({
        placeName: '테스트 식당',
      });

      expect(res.status).toBe(400);
    });

    it('인증 없이 요청하면 401 에러를 반환한다', async () => {
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
    it('유효한 placeRatingId와 1~5 범위의 rating이면 200을 반환한다', async () => {
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

    it('rating이 0(최솟값 미만)이면 400 에러를 반환한다', async () => {
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

    it('rating이 6(최댓값 초과)이면 400 에러를 반환한다', async () => {
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

    it('존재하지 않는 placeRatingId이면 404 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/ratings/submit').send({
        placeRatingId: TEST_IDS.NON_EXISTENT,
        rating: 3,
      });

      expect(res.status).toBe(404);
    });

    it('다른 사용자의 placeRatingId에 평점을 제출하면 403 에러를 반환한다', async () => {
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
    it('대기 중인 평점을 건너뛰면 200을 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const selectRes = await selectPlace(testUser.accessToken);
      const placeRatingId: number = selectRes.body.id;

      const req = authenticatedRequest(app, testUser.accessToken);
      const res = await req.post('/ratings/skip').send({ placeRatingId });

      expect(res.status).toBe(200);
    });

    it('다른 사용자의 placeRatingId를 건너뛰면 403 에러를 반환한다', async () => {
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
    it('대기 중인 평점 프롬프트를 무시하면 200을 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const selectRes = await selectPlace(testUser.accessToken);
      const placeRatingId: number = selectRes.body.id;

      const req = authenticatedRequest(app, testUser.accessToken);
      const res = await req.post('/ratings/dismiss').send({ placeRatingId });

      expect(res.status).toBe(200);
    });

    it('다른 사용자의 placeRatingId를 무시하면 403 에러를 반환한다', async () => {
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
    it('200 + 페이지네이션된 평점 이력을 반환한다', async () => {
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

    it('평점 이력에 다른 사용자의 평점이 포함되지 않는다', async () => {
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

    it('selectedDate 필터 적용 시 해당 날짜의 평점만 반환한다', async () => {
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
    it('200 + 대기 중인 장소 목록을 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      // Create a rating entry (not yet submitted)
      await selectPlace(testUser.accessToken);

      const req = authenticatedRequest(app, testUser.accessToken);
      const res = await req.get('/ratings/pending');

      expect(res.status).toBe(200);
    });
  });
});
