import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { DataSource } from 'typeorm';
import {
  createE2EApp,
  closeE2EApp,
  truncateAllTables,
  createAuthenticatedUser,
  TestUser,
} from './setup';
import { TEST_TIMEOUTS } from '../constants/test.constants';
import { ErrorCode } from '@/common/constants/error-codes';
import { UserAddress } from '@/user/entities/user-address.entity';
import { User } from '@/user/entities/user.entity';

// ─── SSE Helpers ──────────────────────────────────────────────────────────────

async function collectSse(request: supertest.Test): Promise<{
  status: number;
  contentType: string;
  events: Array<Record<string, unknown>>;
}> {
  const res = await request
    .buffer(true)
    .parse((incoming, callback) => {
      const chunks: string[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
      incoming.on('end', () => callback(null, chunks.join('')));
    })
    .timeout(TEST_TIMEOUTS.E2E_DEFAULT_MS);

  const rawBody: string = typeof res.body === 'string' ? res.body : '';
  const events = rawBody
    .split('\n\n')
    .filter(Boolean)
    .flatMap((block) =>
      block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => {
          try {
            return JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .filter((e): e is Record<string, unknown> => e !== null),
    );

  return {
    status: res.status as number,
    contentType: (res.headers['content-type'] as string) ?? '',
    events,
  };
}

// ─── Setup Helpers ─────────────────────────────────────────────────────────────

async function setupDefaultAddress(
  app: INestApplication,
  user: User,
): Promise<void> {
  const repo = app.get(DataSource).getRepository(UserAddress);
  await repo.save({
    user,
    roadAddress: '서울특별시 강남구 테헤란로 123',
    latitude: 37.5012345,
    longitude: 127.0398765,
    isDefault: true,
    isSearchAddress: false,
    postalCode: null,
    alias: null,
  });
}

async function createRecommendation(
  app: INestApplication,
  token: string,
): Promise<number> {
  const res = await supertest(app.getHttpServer())
    .post('/menu/recommend')
    .set('Authorization', `Bearer ${token}`)
    .send({ prompt: '오늘 점심 뭐 먹지?' });
  if (res.status !== 201) {
    throw new Error(`createRecommendation failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.id as number;
}

async function createSelection(
  app: INestApplication,
  token: string,
): Promise<number> {
  const res = await supertest(app.getHttpServer())
    .post('/menu/selections')
    .set('Authorization', `Bearer ${token}`)
    .send({ menus: [{ slot: 'lunch', name: '김치찌개' }] });
  if (res.status !== 201) {
    throw new Error(`createSelection failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.id as number;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Menu (e2e)', () => {
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

  // ─── POST /menu/recommend ────────────────────────────────────────────────────

  describe('POST /menu/recommend', () => {
    it('should return 201 with recommendation result when user has default address', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      await setupDefaultAddress(app, testUser.user);

      const res = await api()
        .post('/menu/recommend')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ prompt: '오늘 점심 뭐 먹지?' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('recommendations');
      expect(Array.isArray(res.body.recommendations)).toBe(true);
      expect(res.body.recommendations.length).toBeGreaterThan(0);
    });

    it('should return 400 when prompt is missing', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/menu/recommend')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 when prompt exceeds 2000 characters', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/menu/recommend')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ prompt: 'a'.repeat(2001) });

      expect(res.status).toBe(400);
    });

    it('should return 401 when no authentication token is provided', async () => {
      const res = await api()
        .post('/menu/recommend')
        .send({ prompt: '오늘 점심 뭐 먹지?' });

      expect(res.status).toBe(401);
    });

    it('should return 400 with MENU_DEFAULT_ADDRESS_REQUIRED when user has no default address', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/menu/recommend')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ prompt: '오늘 점심 뭐 먹지?' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe(ErrorCode.MENU_DEFAULT_ADDRESS_REQUIRED);
    });
  });

  // ─── POST /menu/recommend/stream ─────────────────────────────────────────────

  describe('POST /menu/recommend/stream', () => {
    it('should stream SSE with a result event when user has default address', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      await setupDefaultAddress(app, testUser.user);

      const { status, contentType, events } = await collectSse(
        api()
          .post('/menu/recommend/stream')
          .set('Authorization', `Bearer ${testUser.accessToken}`)
          .send({ prompt: '오늘 저녁 추천해줘' }),
      );

      expect(status).toBe(200);
      expect(contentType).toContain('text/event-stream');
      const resultEvent = events.find((e) => e.type === 'result');
      expect(resultEvent).toBeDefined();
      expect(
        (resultEvent?.data as Record<string, unknown>)?.recommendations,
      ).toBeDefined();
    });

    it('should return 400 when prompt is missing', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/menu/recommend/stream')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 401 when no authentication token is provided', async () => {
      const res = await api()
        .post('/menu/recommend/stream')
        .send({ prompt: '오늘 저녁 추천해줘' });

      expect(res.status).toBe(401);
    });
  });

  // ─── POST /menu/selections ───────────────────────────────────────────────────

  describe('POST /menu/selections', () => {
    it('should return 201 with selection data when menus array is valid', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/menu/selections')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ menus: [{ slot: 'lunch', name: '김치찌개' }] });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('menuPayload');
    });

    it('should return 400 when menus array is empty', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/menu/selections')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ menus: [] });

      expect(res.status).toBe(400);
    });

    it('should return 400 when slot value is invalid', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/menu/selections')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ menus: [{ slot: 'invalid-slot', name: '김치찌개' }] });

      expect(res.status).toBe(400);
    });

    it('should return 401 when no authentication token is provided', async () => {
      const res = await api()
        .post('/menu/selections')
        .send({ menus: [{ slot: 'lunch', name: '김치찌개' }] });

      expect(res.status).toBe(401);
    });
  });

  // ─── PATCH /menu/selections/:id ──────────────────────────────────────────────

  describe('PATCH /menu/selections/:id', () => {
    it('should return 200 with updated selection when owner updates their selection', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const selectionId = await createSelection(app, testUser.accessToken);

      const res = await api()
        .patch(`/menu/selections/${selectionId}`)
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ lunch: ['된장찌개'] });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', selectionId);
    });

    it('should return 404 when selection id does not exist', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .patch('/menu/selections/99999')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ lunch: ['된장찌개'] });

      expect(res.status).toBe(404);
    });

    it('should return 403 when user tries to update another users selection', async () => {
      const owner: TestUser = await createAuthenticatedUser(app);
      const other: TestUser = await createAuthenticatedUser(app);
      const selectionId = await createSelection(app, owner.accessToken);

      const res = await api()
        .patch(`/menu/selections/${selectionId}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send({ lunch: ['된장찌개'] });

      expect(res.status).toBe(403);
    });
  });

  // ─── GET /menu/selections/history ────────────────────────────────────────────

  describe('GET /menu/selections/history', () => {
    it('should return 200 with selections array when authenticated', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/selections/history')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('selections');
      expect(Array.isArray(res.body.selections)).toBe(true);
    });

    it('should return 401 when no authentication token is provided', async () => {
      const res = await api().get('/menu/selections/history');

      expect(res.status).toBe(401);
    });
  });

  // ─── GET /menu/recommendations/history ───────────────────────────────────────

  describe('GET /menu/recommendations/history', () => {
    it('should return 200 with paginated items and pageInfo when authenticated', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/recommendations/history')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('pageInfo');
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('should return only matching items when date filter is applied', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      await setupDefaultAddress(app, testUser.user);
      await createRecommendation(app, testUser.accessToken);

      const today = new Date().toISOString().split('T')[0];

      const res = await api()
        .get('/menu/recommendations/history')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({ date: today });

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThan(0);
    });

    it('should return 200 with empty items array when user has no recommendations', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/recommendations/history')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(0);
    });
  });

  // ─── GET /menu/recommendations/:id ───────────────────────────────────────────

  describe('GET /menu/recommendations/:id', () => {
    it('should return 200 with recommendation detail when owner requests their recommendation', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      await setupDefaultAddress(app, testUser.user);
      const recId = await createRecommendation(app, testUser.accessToken);

      const res = await api()
        .get(`/menu/recommendations/${recId}`)
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', recId);
      expect(res.body).toHaveProperty('recommendations');
    });

    it('should return 404 when recommendation id does not exist', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/recommendations/99999')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 403 when user requests another users recommendation', async () => {
      const owner: TestUser = await createAuthenticatedUser(app);
      const other: TestUser = await createAuthenticatedUser(app);
      await setupDefaultAddress(app, owner.user);
      const recId = await createRecommendation(app, owner.accessToken);

      const res = await api()
        .get(`/menu/recommendations/${recId}`)
        .set('Authorization', `Bearer ${other.accessToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ─── GET /menu/recommend/places/v2 ───────────────────────────────────────────

  describe('GET /menu/recommend/places/v2', () => {
    it('should return 200 with place recommendations when all required params are provided', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      await setupDefaultAddress(app, testUser.user);
      const recId = await createRecommendation(app, testUser.accessToken);

      const res = await api()
        .get('/menu/recommend/places/v2')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({
          menuName: '김치찌개',
          address: '서울특별시 강남구 테헤란로 123',
          latitude: 37.5012345,
          longitude: 127.0398765,
          menuRecommendationId: recId,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('recommendations');
    });

    it('should return 400 when required query params are missing', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/recommend/places/v2')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({ menuName: '김치찌개' });

      expect(res.status).toBe(400);
    });

    it('should return 401 when no authentication token is provided', async () => {
      const res = await api()
        .get('/menu/recommend/places/v2')
        .query({
          menuName: '김치찌개',
          address: '서울특별시 강남구',
          latitude: 37.5,
          longitude: 127.0,
          menuRecommendationId: 1,
        });

      expect(res.status).toBe(401);
    });
  });

  // ─── GET /menu/recommend/places/search ───────────────────────────────────────

  describe('GET /menu/recommend/places/search', () => {
    it('should return 200 with place recommendations when all params are valid', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      await setupDefaultAddress(app, testUser.user);
      const recId = await createRecommendation(app, testUser.accessToken);

      const res = await api()
        .get('/menu/recommend/places/search')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({
          latitude: 37.5012345,
          longitude: 127.0398765,
          menuName: '김치찌개',
          menuRecommendationId: recId,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('recommendations');
    });

    it('should return 400 when required query params are missing', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/recommend/places/search')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({ latitude: 37.5 }); // missing longitude, menuName, menuRecommendationId

      expect(res.status).toBe(400);
    });

    it('should return 401 when no authentication token is provided', async () => {
      const res = await api()
        .get('/menu/recommend/places/search')
        .query({
          latitude: 37.5,
          longitude: 127.0,
          menuName: '김치찌개',
          menuRecommendationId: 1,
        });

      expect(res.status).toBe(401);
    });
  });

  // ─── GET /menu/recommend/places/search/stream ─────────────────────────────────

  describe('GET /menu/recommend/places/search/stream', () => {
    it('should stream SSE with a result event when all params are valid', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      await setupDefaultAddress(app, testUser.user);
      const recId = await createRecommendation(app, testUser.accessToken);

      const { status, contentType, events } = await collectSse(
        api()
          .get('/menu/recommend/places/search/stream')
          .set('Authorization', `Bearer ${testUser.accessToken}`)
          .query({
            latitude: 37.5012345,
            longitude: 127.0398765,
            menuName: '김치찌개',
            menuRecommendationId: recId,
          }),
      );

      expect(status).toBe(200);
      expect(contentType).toContain('text/event-stream');
      const resultEvent = events.find((e) => e.type === 'result');
      expect(resultEvent).toBeDefined();
    });

    it('should return 401 when no authentication token is provided', async () => {
      const res = await api()
        .get('/menu/recommend/places/search/stream')
        .query({
          latitude: 37.5,
          longitude: 127.0,
          menuName: '김치찌개',
          menuRecommendationId: 1,
        });

      expect(res.status).toBe(401);
    });
  });

  // ─── GET /menu/recommend/places/community ────────────────────────────────────

  describe('GET /menu/recommend/places/community', () => {
    it('should return 200 with community place recommendations when authenticated', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      await setupDefaultAddress(app, testUser.user);
      const recId = await createRecommendation(app, testUser.accessToken);

      const res = await api()
        .get('/menu/recommend/places/community')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({
          latitude: 37.5012345,
          longitude: 127.0398765,
          menuName: '김치찌개',
          menuRecommendationId: recId,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('recommendations');
      expect(Array.isArray(res.body.recommendations)).toBe(true);
    });

    it('should return 401 when no authentication token is provided', async () => {
      const res = await api()
        .get('/menu/recommend/places/community')
        .query({
          latitude: 37.5,
          longitude: 127.0,
          menuName: '김치찌개',
          menuRecommendationId: 1,
        });

      expect(res.status).toBe(401);
    });
  });

  // ─── GET /menu/recommend/places/community/stream ──────────────────────────────

  describe('GET /menu/recommend/places/community/stream', () => {
    it('should stream SSE with a result event when authenticated and params are valid', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      await setupDefaultAddress(app, testUser.user);
      const recId = await createRecommendation(app, testUser.accessToken);

      const { status, contentType, events } = await collectSse(
        api()
          .get('/menu/recommend/places/community/stream')
          .set('Authorization', `Bearer ${testUser.accessToken}`)
          .query({
            latitude: 37.5012345,
            longitude: 127.0398765,
            menuName: '김치찌개',
            menuRecommendationId: recId,
          }),
      );

      expect(status).toBe(200);
      expect(contentType).toContain('text/event-stream');
      const resultEvent = events.find((e) => e.type === 'result');
      expect(resultEvent).toBeDefined();
    });

    it('should return 401 when no authentication token is provided', async () => {
      const res = await api()
        .get('/menu/recommend/places/community/stream')
        .query({
          latitude: 37.5,
          longitude: 127.0,
          menuName: '김치찌개',
          menuRecommendationId: 1,
        });

      expect(res.status).toBe(401);
    });
  });

  // ─── GET /menu/places/:placeId/detail ────────────────────────────────────────

  describe('GET /menu/places/:placeId/detail', () => {
    it('should return 200 with place detail when placeId is valid', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/places/mock-place-id-1/detail')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
    });

    it('should return 200 with place detail for any placeId because mock always returns data', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/places/nonexistent-place-id-xyz/detail')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
    });
  });

  // ─── GET /menu/restaurant/blogs ──────────────────────────────────────────────

  describe('GET /menu/restaurant/blogs', () => {
    it('should return 200 with blog results when query and restaurantName are provided', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/restaurant/blogs')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({ query: '서울 강남 김치찌개', restaurantName: '김치찌개집' });

      expect(res.status).toBe(200);
    });

    it('should return 400 when query param is missing', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/restaurant/blogs')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({ restaurantName: '김치찌개집' });

      expect(res.status).toBe(400);
    });
  });
});
