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
import { TEST_TIMEOUTS } from '../constants/test.constants';
import { USER_PLACE_TEST_DATA } from '../constants/user-place-test.constants';
import { MessageCode } from '@/common/constants/message-codes';

// 6개 photo URL (5개 초과 검증용)
const SIX_PHOTOS = [
  'https://example.com/1.jpg',
  'https://example.com/2.jpg',
  'https://example.com/3.jpg',
  'https://example.com/4.jpg',
  'https://example.com/5.jpg',
  'https://example.com/6.jpg',
];

describe('UserPlace (e2e)', () => {
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

  // =====================
  // 가게 등록 (POST /user-places)
  // =====================
  describe('POST /user-places', () => {
    it('should return 201 with created place when required fields are valid', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(USER_PLACE_TEST_DATA.VALID_PLACE.name);
      expect(res.body.status).toBe('PENDING');
    });

    it('should return 400 when required field name is missing', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/user-places').send({
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when menuItems is an empty array', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [],
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when more than 5 photos are provided', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
        photos: SIX_PHOTOS,
      });

      expect(res.status).toBe(400);
    });

    it('should return 401 when request is made without authentication', async () => {
      const res = await api().post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 등록 가능 여부 확인 (POST /user-places/check)
  // =====================
  describe('POST /user-places/check', () => {
    it('should return 200 with canRegister true when the location is new', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/user-places/check').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('canRegister');
      expect(res.body.canRegister).toBe(true);
    });

    it('should return 200 with nearbyPlaces when a place is already registered nearby', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      // Register a place at the VALID_PLACE location first
      await req.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });

      // Check with NEARBY_PLACE coordinates (within 100m)
      // duplicateExists checks exact name+address match; nearbyPlaces uses spatial proximity
      const res = await req.post('/user-places/check').send({
        name: USER_PLACE_TEST_DATA.NEARBY_PLACE.name,
        address: USER_PLACE_TEST_DATA.NEARBY_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.NEARBY_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.NEARBY_PLACE.longitude,
      });

      expect(res.status).toBe(200);
      expect(res.body.nearbyPlaces.length).toBeGreaterThan(0);
    });
  });

  // =====================
  // 가게 목록 조회 (GET /user-places)
  // =====================
  describe('GET /user-places', () => {
    it('should return 200 with paginated list of user places', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      // Create a place first
      await req.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });

      const res = await req.get('/user-places');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThan(0);
    });
  });

  // =====================
  // 가게 상세 조회 (GET /user-places/:id)
  // =====================
  describe('GET /user-places/:id', () => {
    it('should return 200 with place details', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const createRes = await req.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });

      const placeId: number = createRes.body.id;

      const res = await req.get(`/user-places/${placeId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(placeId);
      expect(res.body.name).toBe(USER_PLACE_TEST_DATA.VALID_PLACE.name);
    });

    it('should return 403 or 404 when accessing another user\'s place', async () => {
      const owner: TestUser = await createAuthenticatedUser(app);
      const other: TestUser = await createAuthenticatedUser(app);

      const ownerReq = authenticatedRequest(app, owner.accessToken);
      const createRes = await ownerReq.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });
      const placeId: number = createRes.body.id;

      const otherReq = authenticatedRequest(app, other.accessToken);
      const res = await otherReq.get(`/user-places/${placeId}`);

      expect([403, 404]).toContain(res.status);
    });
  });

  // =====================
  // 가게 수정 (PATCH /user-places/:id)
  // =====================
  describe('PATCH /user-places/:id', () => {
    it('should return 200 with updated place when version is correct', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const createRes = await req.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });

      const placeId: number = createRes.body.id;
      const version: number = createRes.body.version;

      const res = await req.patch(`/user-places/${placeId}`).send({
        name: '수정된 식당 이름',
        version,
      });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('수정된 식당 이름');
    });

    it('should return 403 when attempting to modify another user\'s place', async () => {
      const owner: TestUser = await createAuthenticatedUser(app);
      const other: TestUser = await createAuthenticatedUser(app);

      const ownerReq = authenticatedRequest(app, owner.accessToken);
      const otherReq = authenticatedRequest(app, other.accessToken);

      const createRes = await ownerReq.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });

      const placeId: number = createRes.body.id;
      const version: number = createRes.body.version;

      const res = await otherReq.patch(`/user-places/${placeId}`).send({
        name: '타인이 수정한 이름',
        version,
      });

      expect(res.status).toBe(403);
    });
  });

  // =====================
  // 가게 삭제 (DELETE /user-places/:id)
  // =====================
  describe('DELETE /user-places/:id', () => {
    it('should return 200 with messageCode when deleting own place', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const createRes = await req.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });

      const placeId: number = createRes.body.id;

      const res = await req.delete(`/user-places/${placeId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('messageCode', MessageCode.USER_PLACE_DELETED);
    });

    it('should return 403 when attempting to delete another user\'s place', async () => {
      const owner: TestUser = await createAuthenticatedUser(app);
      const other: TestUser = await createAuthenticatedUser(app);

      const ownerReq = authenticatedRequest(app, owner.accessToken);
      const otherReq = authenticatedRequest(app, other.accessToken);

      const createRes = await ownerReq.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });

      const placeId: number = createRes.body.id;

      const res = await otherReq.delete(`/user-places/${placeId}`);

      expect(res.status).toBe(403);
    });
  });
});
