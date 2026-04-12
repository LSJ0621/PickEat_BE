import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createE2EApp,
  closeE2EApp,
  truncateAllTables,
  createAuthenticatedUser,
  createAuthenticatedAdmin,
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
    it('필수 필드가 유효하면 201 + 생성된 가게를 반환한다', async () => {
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

    it('필수 필드 name 누락 시 400 에러를 반환한다', async () => {
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

    it('menuItems가 빈 배열이면 400 에러를 반환한다', async () => {
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

    it('사진이 5장을 초과하면 400 에러를 반환한다', async () => {
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

    it('인증 없이 요청하면 401 에러를 반환한다', async () => {
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
    it('새로운 위치이면 200 + canRegister: true를 반환한다', async () => {
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

    it('근처에 등록된 가게가 있으면 200 + nearbyPlaces를 반환한다', async () => {
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
    it('200 + 페이지네이션된 가게 목록을 반환한다', async () => {
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
    it('200 + 가게 상세 정보를 반환한다', async () => {
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

    it('다른 사용자의 가게에 접근하면 403 에러를 반환한다', async () => {
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

      expect(res.status).toBe(403);
    });
  });

  // =====================
  // businessHours 정상 입력 + isOpen247
  // =====================
  describe('POST /user-places - businessHours', () => {
    it('businessHours를 정상 입력하면 201 + businessHours가 저장된다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
        businessHours: {
          isOpen247: false,
          is24Hours: false,
          days: {
            mon: { open: '09:00', close: '22:00' },
            tue: { open: '09:00', close: '22:00' },
          },
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.businessHours).toBeDefined();
      expect(res.body.businessHours.isOpen247).toBe(false);
    });

    it('isOpen247=true이면 영업시간 상세 없이 201을 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/user-places').send({
        name: '24시간 식당',
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
        businessHours: { isOpen247: true, is24Hours: true },
      });

      expect(res.status).toBe(201);
      expect(res.body.businessHours.isOpen247).toBe(true);
    });
  });

  // =====================
  // 같은 이름+주소 중복 등록 → 에러
  // =====================
  describe('POST /user-places - duplicate registration', () => {
    it('같은 이름+주소로 중복 등록하면 400 + DUPLICATE_REGISTRATION을 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      // 첫 번째 등록
      await req.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });

      // 같은 이름+주소로 두 번째 등록
      const res = await req.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '중식', price: 12000 }],
      });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('USER_PLACE_DUPLICATE_REGISTRATION');
    });
  });

  // =====================
  // 일일 등록 한도 초과
  // =====================
  describe('POST /user-places - daily limit', () => {
    it('일일 등록 한도를 초과하면 400 + DAILY_LIMIT_EXCEEDED를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      // 5개 등록 (한도까지)
      for (let i = 0; i < 5; i++) {
        await req.post('/user-places').send({
          name: `한도 테스트 식당 ${i}`,
          address: `서울특별시 강남구 테스트로 ${i}`,
          latitude: 37.5012345 + i * 0.001,
          longitude: 127.0398765 + i * 0.001,
          menuItems: [{ name: '한식', price: 10000 }],
        });
      }

      // 6번째 등록 → 한도 초과
      const res = await req.post('/user-places').send({
        name: '한도 초과 식당',
        address: '서울특별시 강남구 테스트로 99',
        latitude: 37.51,
        longitude: 127.05,
        menuItems: [{ name: '한식', price: 10000 }],
      });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe('USER_PLACE_DAILY_LIMIT_EXCEEDED');
    });
  });

  // =====================
  // 가게 수정 (PATCH /user-places/:id)
  // =====================
  describe('PATCH /user-places/:id', () => {
    it('올바른 version이면 200 + 수정된 가게를 반환한다', async () => {
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

    it('APPROVED 상태 가게를 수정하면 403 + NOT_EDITABLE을 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const admin: TestUser = await createAuthenticatedAdmin(app);
      const req = authenticatedRequest(app, testUser.accessToken);
      const adminReq = authenticatedRequest(app, admin.accessToken);

      const createRes = await req.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });
      const placeId: number = createRes.body.id;
      const version: number = createRes.body.version;

      // 관리자가 승인
      await adminReq.patch(`/admin/user-places/${placeId}/approve`);

      // 사용자가 승인된 가게 수정 시도
      const res = await req.patch(`/user-places/${placeId}`).send({
        name: '수정 시도',
        version,
      });

      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('USER_PLACE_NOT_EDITABLE');
    });

    it('version 불일치 시 409 + OPTIMISTIC_LOCK_FAILED를 반환한다', async () => {
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

      // 잘못된 version으로 수정 시도
      const res = await req.patch(`/user-places/${placeId}`).send({
        name: '버전 불일치 수정',
        version: 9999,
      });

      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('USER_PLACE_OPTIMISTIC_LOCK_FAILED');
    });

    it('사진 부분 업로드 + existingPhotos 검증', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      // 사진 없이 가게 생성
      const createRes = await req.post('/user-places').send({
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        menuItems: [{ name: '한식', price: 10000 }],
      });
      const placeId: number = createRes.body.id;
      const version: number = createRes.body.version;

      // existingPhotos=[] 로 수정 (기존 사진 제거)
      const res = await req.patch(`/user-places/${placeId}`).send({
        existingPhotos: [],
        version,
      });

      expect(res.status).toBe(200);
    });

    it('다른 사용자의 가게를 수정하려 하면 403 에러를 반환한다', async () => {
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
    it('자신의 가게를 삭제하면 200 + messageCode를 반환한다', async () => {
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

    it('다른 사용자의 가게를 삭제하려 하면 403 에러를 반환한다', async () => {
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
