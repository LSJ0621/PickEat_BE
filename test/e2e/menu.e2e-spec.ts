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
  return res.body.selection.id as number;
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
    it('기본 주소가 있으면 201 + 추천 결과를 반환한다', async () => {
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

    it('prompt 누락 시 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/menu/recommend')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('prompt가 2000자를 초과하면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/menu/recommend')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ prompt: 'a'.repeat(2001) });

      expect(res.status).toBe(400);
    });

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
      const res = await api()
        .post('/menu/recommend')
        .send({ prompt: '오늘 점심 뭐 먹지?' });

      expect(res.status).toBe(401);
    });

    it('기본 주소가 없으면 400 + MENU_DEFAULT_ADDRESS_REQUIRED를 반환한다', async () => {
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
    it('기본 주소가 있으면 SSE로 result 이벤트를 스트리밍한다', async () => {
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

    it('prompt 누락 시 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/menu/recommend/stream')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
      const res = await api()
        .post('/menu/recommend/stream')
        .send({ prompt: '오늘 저녁 추천해줘' });

      expect(res.status).toBe(401);
    });
  });

  // ─── POST /menu/selections ───────────────────────────────────────────────────

  describe('POST /menu/selections', () => {
    it('유효한 menus 배열이면 201 + 선택 데이터를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/menu/selections')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ menus: [{ slot: 'lunch', name: '김치찌개' }] });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('selection');
      expect(res.body.selection).toHaveProperty('id');
      expect(res.body.selection).toHaveProperty('menuPayload');
    });

    it('menus 배열이 비어있으면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/menu/selections')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ menus: [] });

      expect(res.status).toBe(400);
    });

    it('slot 값이 유효하지 않으면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/menu/selections')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ menus: [{ slot: 'invalid-slot', name: '김치찌개' }] });

      expect(res.status).toBe(400);
    });

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
      const res = await api()
        .post('/menu/selections')
        .send({ menus: [{ slot: 'lunch', name: '김치찌개' }] });

      expect(res.status).toBe(401);
    });
  });

  // ─── PATCH /menu/selections/:id ──────────────────────────────────────────────

  describe('PATCH /menu/selections/:id', () => {
    it('소유자가 자신의 선택을 수정하면 200 + 수정된 데이터를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const selectionId = await createSelection(app, testUser.accessToken);

      const res = await api()
        .patch(`/menu/selections/${selectionId}`)
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ lunch: ['된장찌개'] });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('selection');
      expect(res.body.selection).toHaveProperty('id', selectionId);
    });

    it('존재하지 않는 selection ID이면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .patch('/menu/selections/99999')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ lunch: ['된장찌개'] });

      expect(res.status).toBe(400);
    });

    it('다른 사용자의 선택을 수정하려 하면 400 에러를 반환한다', async () => {
      const owner: TestUser = await createAuthenticatedUser(app);
      const other: TestUser = await createAuthenticatedUser(app);
      const selectionId = await createSelection(app, owner.accessToken);

      const res = await api()
        .patch(`/menu/selections/${selectionId}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send({ lunch: ['된장찌개'] });

      // Service queries by both selectionId AND userId, so other user's selection appears as "not found" → 400
      expect(res.status).toBe(400);
    });
  });

  // ─── GET /menu/selections/history ────────────────────────────────────────────

  describe('GET /menu/selections/history', () => {
    it('인증된 사용자가 요청하면 200 + selections 배열을 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/selections/history')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('selections');
      expect(Array.isArray(res.body.selections)).toBe(true);
    });

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
      const res = await api().get('/menu/selections/history');

      expect(res.status).toBe(401);
    });
  });

  // ─── GET /menu/recommendations/history ───────────────────────────────────────

  describe('GET /menu/recommendations/history', () => {
    it('인증된 사용자가 요청하면 200 + 페이지네이션된 items와 pageInfo를 반환한다', async () => {
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

    it('날짜 필터 적용 시 해당 날짜의 항목만 반환한다', async () => {
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

    it('추천 이력이 없으면 200 + 빈 items 배열을 반환한다', async () => {
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
    it('소유자가 자신의 추천 상세를 요청하면 200 + 상세 정보를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      await setupDefaultAddress(app, testUser.user);
      const recId = await createRecommendation(app, testUser.accessToken);

      const res = await api()
        .get(`/menu/recommendations/${recId}`)
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('history');
      expect(res.body.history).toHaveProperty('id', recId);
      expect(res.body.history).toHaveProperty('recommendations');
    });

    it('존재하지 않는 추천 ID이면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/recommendations/99999')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(400);
    });

    it('다른 사용자의 추천을 요청하면 400 에러를 반환한다', async () => {
      const owner: TestUser = await createAuthenticatedUser(app);
      const other: TestUser = await createAuthenticatedUser(app);
      await setupDefaultAddress(app, owner.user);
      const recId = await createRecommendation(app, owner.accessToken);

      const res = await api()
        .get(`/menu/recommendations/${recId}`)
        .set('Authorization', `Bearer ${other.accessToken}`);

      // Service queries by both id AND userId, so other user's recommendation appears as "not found" → 400
      expect(res.status).toBe(400);
    });
  });

  // ─── GET /menu/recommend/places/v2 ───────────────────────────────────────────

  describe('GET /menu/recommend/places/v2', () => {
    it('필수 파라미터가 모두 있으면 200 + 장소 추천 결과를 반환한다', async () => {
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

    it('필수 쿼리 파라미터 누락 시 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/recommend/places/v2')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({ menuName: '김치찌개' });

      expect(res.status).toBe(400);
    });

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
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
    it('모든 파라미터가 유효하면 200 + 장소 추천 결과를 반환한다', async () => {
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

    it('필수 쿼리 파라미터 누락 시 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/recommend/places/search')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({ latitude: 37.5 }); // missing longitude, menuName, menuRecommendationId

      expect(res.status).toBe(400);
    });

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
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
    it('모든 파라미터가 유효하면 SSE로 result 이벤트를 스트리밍한다', async () => {
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

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
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
    it('인증된 사용자가 요청하면 200 + 커뮤니티 장소 추천을 반환한다', async () => {
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

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
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
    it('인증된 사용자가 유효한 파라미터로 요청하면 SSE로 result 이벤트를 스트리밍한다', async () => {
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

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
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
    it('유효한 placeId이면 200 + 장소 상세 정보를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/places/mock-place-id-1/detail')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
    });

    it('mock 환경에서는 모든 placeId에 대해 200 + 장소 상세를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/places/nonexistent-place-id-xyz/detail')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
    });
  });

  // ─── GET /menu/restaurant/blogs ──────────────────────────────────────────────

  describe('GET /menu/restaurant/blogs', () => {
    it('query와 restaurantName이 제공되면 200 + 블로그 결과를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/restaurant/blogs')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({ query: '서울 강남 김치찌개', restaurantName: '김치찌개집' });

      expect(res.status).toBe(200);
    });

    it('query 파라미터 누락 시 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/menu/restaurant/blogs')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({ restaurantName: '김치찌개집' });

      expect(res.status).toBe(400);
    });
  });
});
