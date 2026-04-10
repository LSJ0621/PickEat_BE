import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createE2EApp,
  closeE2EApp,
  truncateAllTables,
  createAuthenticatedUser,
  type TestUser,
} from './setup';
import { TEST_TIMEOUTS, TEST_COORDINATES, TEST_IDS } from '../constants/test.constants';
import { ErrorCode } from '@/common/constants/error-codes';
import { USER_LIMITS } from '@/common/constants/business.constants';

describe('Address (e2e)', () => {
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

  const sampleAddress = {
    address: '서울특별시 강남구 테헤란로 123',
    roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
    postalCode: TEST_COORDINATES.GANGNAM.POSTAL_CODE,
    latitude: TEST_COORDINATES.GANGNAM.LATITUDE,
    longitude: TEST_COORDINATES.GANGNAM.LONGITUDE,
  };

  const altAddress = {
    address: '서울특별시 강남구 강남대로 456',
    roadAddress: TEST_COORDINATES.GANGNAM_ALT.ROAD_ADDRESS,
    postalCode: TEST_COORDINATES.GANGNAM_ALT.POSTAL_CODE,
    latitude: TEST_COORDINATES.GANGNAM_ALT.LATITUDE,
    longitude: TEST_COORDINATES.GANGNAM_ALT.LONGITUDE,
  };

  interface AddressData {
    address: string;
    roadAddress: string;
    postalCode: string;
    latitude: string;
    longitude: string;
  }

  async function createAddress(
    token: string,
    addressData: AddressData = sampleAddress,
    extra: Record<string, unknown> = {},
  ) {
    return api()
      .post('/user/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ selectedAddress: addressData, ...extra });
  }

  async function createMaxAddresses(testUser: TestUser): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < USER_LIMITS.MAX_ADDRESSES; i++) {
      const addressData = {
        address: `서울특별시 강남구 주소${i}`,
        roadAddress: `서울특별시 강남구 도로${i}`,
        postalCode: `0623${i}`,
        latitude: `37.500${i}`,
        longitude: `127.039${i}`,
      };
      const res = await createAddress(testUser.accessToken, addressData);
      ids.push(res.body.id);
    }
    return ids;
  }

  // =====================
  // 주소 검색 (GET /user/address/search)
  // =====================
  describe('GET /user/address/search', () => {
    it('should return 200 with address list when query is provided', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/user/address/search')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({ query: '강남역' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('addresses');
      expect(Array.isArray(res.body.addresses)).toBe(true);
    });

    it('should return 200 with empty addresses when no results found', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/user/address/search')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({ query: 'xyzzy_no_match_address_test_unique_string' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('addresses');
      expect(res.body.addresses).toHaveLength(0);
      expect(res.body.meta.total_count).toBe(0);
    });

    it('should return 400 when query is missing', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/user/address/search')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(400);
    });

    it('should return 401 when request has no auth token', async () => {
      const res = await api()
        .get('/user/address/search')
        .query({ query: '강남역' });

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 단일 주소 업데이트 (PATCH /user/address)
  // =====================
  describe('PATCH /user/address', () => {
    it('should return 200 with updated address when selectedAddress is valid', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .patch('/user/address')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ selectedAddress: sampleAddress });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('roadAddress', sampleAddress.roadAddress);
    });

    it('should return 400 when selectedAddress is missing', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .patch('/user/address')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 401 when request has no auth token', async () => {
      const res = await api()
        .patch('/user/address')
        .send({ selectedAddress: sampleAddress });

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 주소 추가 (POST /user/addresses)
  // =====================
  describe('POST /user/addresses', () => {
    it('should return 201 with created address when request is valid', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await createAddress(testUser.accessToken);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('roadAddress', sampleAddress.roadAddress);
    });

    it('should set isDefault and isSearchAddress to true for the first address', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await createAddress(testUser.accessToken);

      expect(res.status).toBe(201);
      expect(res.body.isDefault).toBe(true);
      expect(res.body.isSearchAddress).toBe(true);
    });

    it(`should return 400 with ADDRESS_MAX_LIMIT when addresses exceed ${USER_LIMITS.MAX_ADDRESSES}`, async () => {
      const testUser = await createAuthenticatedUser(app);

      await createMaxAddresses(testUser);

      const res = await createAddress(testUser.accessToken, {
        address: '초과 주소',
        roadAddress: '초과 도로명 주소',
        postalCode: '99999',
        latitude: '37.9999',
        longitude: '127.9999',
      });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_MAX_LIMIT);
    });

    it('should return 401 when request has no auth token', async () => {
      const res = await api()
        .post('/user/addresses')
        .send({ selectedAddress: sampleAddress });

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 주소 수정 (PATCH /user/addresses/:id)
  // =====================
  describe('PATCH /user/addresses/:id', () => {
    it('should return 200 with updated address when request is valid', async () => {
      const testUser = await createAuthenticatedUser(app);
      const created = await createAddress(testUser.accessToken);

      const res = await api()
        .patch(`/user/addresses/${created.body.id}`)
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ roadAddress: '서울특별시 종로구 수정도로 1' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('roadAddress', '서울특별시 종로구 수정도로 1');
    });

    it('should return 404 with ADDRESS_NOT_FOUND when address id does not exist', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .patch(`/user/addresses/${TEST_IDS.NON_EXISTENT}`)
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ roadAddress: '수정 주소' });

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('should return 404 when accessing another user address', async () => {
      const userA = await createAuthenticatedUser(app);
      const userB = await createAuthenticatedUser(app);
      const created = await createAddress(userA.accessToken);

      const res = await api()
        .patch(`/user/addresses/${created.body.id}`)
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .send({ roadAddress: '침범 주소' });

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('should return 401 when request has no auth token', async () => {
      const res = await api()
        .patch(`/user/addresses/${TEST_IDS.NON_EXISTENT}`)
        .send({ roadAddress: '수정 주소' });

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 주소 일괄 삭제 (POST /user/addresses/batch-delete)
  // =====================
  describe('POST /user/addresses/batch-delete', () => {
    it('should return 200 when deleting non-default addresses', async () => {
      const testUser = await createAuthenticatedUser(app);

      // 첫 번째 주소 생성 (기본 주소)
      const first = await createAddress(testUser.accessToken);
      // 두 번째 주소 생성 (non-default)
      const second = await createAddress(testUser.accessToken, altAddress);

      const res = await api()
        .post('/user/addresses/batch-delete')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ ids: [second.body.id] });

      expect(res.status).toBe(200);

      // 삭제 확인
      const listRes = await api()
        .get('/user/addresses')
        .set('Authorization', `Bearer ${testUser.accessToken}`);
      expect(listRes.body.addresses).toHaveLength(1);
      expect(listRes.body.addresses[0].id).toBe(first.body.id);
    });

    it('should return 400 with ADDRESS_CANNOT_DELETE_DEFAULT when trying to delete default address', async () => {
      const testUser = await createAuthenticatedUser(app);
      const created = await createAddress(testUser.accessToken);

      const res = await api()
        .post('/user/addresses/batch-delete')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ ids: [created.body.id] });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_CANNOT_DELETE_DEFAULT);
    });

    it('should return 404 with ADDRESS_NOT_FOUND when id does not exist', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/user/addresses/batch-delete')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ ids: [TEST_IDS.NON_EXISTENT] });

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('should return 404 when trying to delete another user address', async () => {
      const userA = await createAuthenticatedUser(app);
      const userB = await createAuthenticatedUser(app);
      const created = await createAddress(userA.accessToken);

      const res = await api()
        .post('/user/addresses/batch-delete')
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .send({ ids: [created.body.id] });

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('should return 401 when request has no auth token', async () => {
      const res = await api()
        .post('/user/addresses/batch-delete')
        .send({ ids: [TEST_IDS.NON_EXISTENT] });

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 기본 주소 설정 (PATCH /user/addresses/:id/default)
  // =====================
  describe('PATCH /user/addresses/:id/default', () => {
    it('should return 200 and switch default address', async () => {
      const testUser = await createAuthenticatedUser(app);

      const first = await createAddress(testUser.accessToken);
      const second = await createAddress(testUser.accessToken, altAddress);

      const res = await api()
        .patch(`/user/addresses/${second.body.id}/default`)
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isDefault).toBe(true);

      // 이전 기본 주소가 변경되었는지 확인
      const listRes = await api()
        .get('/user/addresses')
        .set('Authorization', `Bearer ${testUser.accessToken}`);
      const firstAddr = listRes.body.addresses.find(
        (a: { id: number }) => a.id === first.body.id,
      );
      expect(firstAddr.isDefault).toBe(false);
    });

    it('should return 404 with ADDRESS_NOT_FOUND when address id does not exist', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .patch(`/user/addresses/${TEST_IDS.NON_EXISTENT}/default`)
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('should return 404 when setting another user address as default', async () => {
      const userA = await createAuthenticatedUser(app);
      const userB = await createAuthenticatedUser(app);
      const created = await createAddress(userA.accessToken);

      const res = await api()
        .patch(`/user/addresses/${created.body.id}/default`)
        .set('Authorization', `Bearer ${userB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('should return 401 when request has no auth token', async () => {
      const res = await api().patch(`/user/addresses/${TEST_IDS.NON_EXISTENT}/default`);

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 검색 주소 설정 (PATCH /user/addresses/:id/search)
  // =====================
  describe('PATCH /user/addresses/:id/search', () => {
    it('should return 200 and switch search address', async () => {
      const testUser = await createAuthenticatedUser(app);

      const first = await createAddress(testUser.accessToken);
      const second = await createAddress(testUser.accessToken, altAddress);

      const res = await api()
        .patch(`/user/addresses/${second.body.id}/search`)
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isSearchAddress).toBe(true);

      // 이전 검색 주소가 변경되었는지 확인
      const listRes = await api()
        .get('/user/addresses')
        .set('Authorization', `Bearer ${testUser.accessToken}`);
      const firstAddr = listRes.body.addresses.find(
        (a: { id: number }) => a.id === first.body.id,
      );
      expect(firstAddr.isSearchAddress).toBe(false);
    });

    it('should return 404 with ADDRESS_NOT_FOUND when address id does not exist', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .patch(`/user/addresses/${TEST_IDS.NON_EXISTENT}/search`)
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('should return 404 when setting another user address as search address', async () => {
      const userA = await createAuthenticatedUser(app);
      const userB = await createAuthenticatedUser(app);
      const created = await createAddress(userA.accessToken);

      const res = await api()
        .patch(`/user/addresses/${created.body.id}/search`)
        .set('Authorization', `Bearer ${userB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('should return 401 when request has no auth token', async () => {
      const res = await api().patch(`/user/addresses/${TEST_IDS.NON_EXISTENT}/search`);

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 주소 목록 조회 (GET /user/addresses)
  // =====================
  describe('GET /user/addresses', () => {
    it('should return 200 with addresses array when authenticated', async () => {
      const testUser = await createAuthenticatedUser(app);
      await createAddress(testUser.accessToken);
      await createAddress(testUser.accessToken, altAddress);

      const res = await api()
        .get('/user/addresses')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('addresses');
      expect(res.body.addresses).toHaveLength(2);
    });

    it('should return 200 with empty addresses array when user has no addresses', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/user/addresses')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.addresses).toHaveLength(0);
    });

    it('should return 401 when request has no auth token', async () => {
      const res = await api().get('/user/addresses');

      expect(res.status).toBe(401);
    });

    it('should not return addresses belonging to other users', async () => {
      const userA = await createAuthenticatedUser(app);
      const userB = await createAuthenticatedUser(app);

      await createAddress(userA.accessToken);

      const res = await api()
        .get('/user/addresses')
        .set('Authorization', `Bearer ${userB.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.addresses).toHaveLength(0);
    });
  });

  // =====================
  // 기본 주소 조회 (GET /user/address/default)
  // =====================
  describe('GET /user/address/default', () => {
    it('should return 200 with default address when it exists', async () => {
      const testUser = await createAuthenticatedUser(app);
      await createAddress(testUser.accessToken);

      const res = await api()
        .get('/user/address/default')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('isDefault', true);
    });

    it('should return 200 with null or empty object when user has no default address', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/user/address/default')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
      // Controller returns null; NestJS may serialize as null or empty object
      const isNullish =
        res.body === null ||
        (typeof res.body === 'object' && Object.keys(res.body).length === 0);
      expect(isNullish).toBe(true);
    });

    it('should return 401 when request has no auth token', async () => {
      const res = await api().get('/user/address/default');

      expect(res.status).toBe(401);
    });

    it('should only return the default address of the requesting user', async () => {
      const userA = await createAuthenticatedUser(app);
      const userB = await createAuthenticatedUser(app);

      // userA의 주소만 생성
      const created = await createAddress(userA.accessToken);

      // userB의 기본 주소 조회 → null/empty이어야 함
      const res = await api()
        .get('/user/address/default')
        .set('Authorization', `Bearer ${userB.accessToken}`);

      expect(res.status).toBe(200);
      const isNullish =
        res.body === null ||
        (typeof res.body === 'object' && Object.keys(res.body).length === 0);
      expect(isNullish).toBe(true);

      // userA의 기본 주소 조회 → 올바른 주소
      const resA = await api()
        .get('/user/address/default')
        .set('Authorization', `Bearer ${userA.accessToken}`);

      expect(resA.status).toBe(200);
      expect(resA.body.id).toBe(created.body.id);
    });
  });
});
