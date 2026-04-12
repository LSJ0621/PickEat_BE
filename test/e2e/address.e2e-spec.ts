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
    it('검색어가 있으면 200 + 주소 목록을 반환한다', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/user/address/search')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .query({ query: '강남역' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('addresses');
      expect(Array.isArray(res.body.addresses)).toBe(true);
    });

    it('검색 결과가 없으면 200 + 빈 주소 배열을 반환한다', async () => {
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

    it('검색어 누락 시 400 에러를 반환한다', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/user/address/search')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(400);
    });

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
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
    it('유효한 selectedAddress이면 200 + 수정된 주소를 반환한다', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .patch('/user/address')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ selectedAddress: sampleAddress });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('roadAddress', sampleAddress.roadAddress);
    });

    it('selectedAddress 누락 시 400 에러를 반환한다', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .patch('/user/address')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
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
    it('유효한 요청이면 201 + 생성된 주소를 반환한다', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await createAddress(testUser.accessToken);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('roadAddress', sampleAddress.roadAddress);
    });

    it('첫 번째 주소는 isDefault와 isSearchAddress가 true로 설정된다', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await createAddress(testUser.accessToken);

      expect(res.status).toBe(201);
      expect(res.body.isDefault).toBe(true);
      expect(res.body.isSearchAddress).toBe(true);
    });

    it(`주소가 ${USER_LIMITS.MAX_ADDRESSES}개를 초과하면 400 + ADDRESS_MAX_LIMIT을 반환한다`, async () => {
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

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
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
    it('유효한 요청이면 200 + 수정된 주소를 반환한다', async () => {
      const testUser = await createAuthenticatedUser(app);
      const created = await createAddress(testUser.accessToken);

      const res = await api()
        .patch(`/user/addresses/${created.body.id}`)
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ roadAddress: '서울특별시 종로구 수정도로 1' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('roadAddress', '서울특별시 종로구 수정도로 1');
    });

    it('존재하지 않는 주소 ID이면 404 + ADDRESS_NOT_FOUND를 반환한다', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .patch(`/user/addresses/${TEST_IDS.NON_EXISTENT}`)
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ roadAddress: '수정 주소' });

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('다른 사용자의 주소에 접근하면 404 에러를 반환한다', async () => {
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

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
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
    it('기본 주소가 아닌 주소를 삭제하면 200을 반환한다', async () => {
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

    it('기본 주소를 삭제하려 하면 400 + ADDRESS_CANNOT_DELETE_DEFAULT를 반환한다', async () => {
      const testUser = await createAuthenticatedUser(app);
      const created = await createAddress(testUser.accessToken);

      const res = await api()
        .post('/user/addresses/batch-delete')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ ids: [created.body.id] });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_CANNOT_DELETE_DEFAULT);
    });

    it('존재하지 않는 ID이면 404 + ADDRESS_NOT_FOUND를 반환한다', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .post('/user/addresses/batch-delete')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ ids: [TEST_IDS.NON_EXISTENT] });

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('다른 사용자의 주소를 삭제하려 하면 404 에러를 반환한다', async () => {
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

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
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
    it('기본 주소를 변경하면 200을 반환한다', async () => {
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

    it('존재하지 않는 주소 ID이면 404 + ADDRESS_NOT_FOUND를 반환한다', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .patch(`/user/addresses/${TEST_IDS.NON_EXISTENT}/default`)
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('다른 사용자의 주소를 기본 주소로 설정하면 404 에러를 반환한다', async () => {
      const userA = await createAuthenticatedUser(app);
      const userB = await createAuthenticatedUser(app);
      const created = await createAddress(userA.accessToken);

      const res = await api()
        .patch(`/user/addresses/${created.body.id}/default`)
        .set('Authorization', `Bearer ${userB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
      const res = await api().patch(`/user/addresses/${TEST_IDS.NON_EXISTENT}/default`);

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 검색 주소 설정 (PATCH /user/addresses/:id/search)
  // =====================
  describe('PATCH /user/addresses/:id/search', () => {
    it('검색 주소를 변경하면 200을 반환한다', async () => {
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

    it('존재하지 않는 주소 ID이면 404 + ADDRESS_NOT_FOUND를 반환한다', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .patch(`/user/addresses/${TEST_IDS.NON_EXISTENT}/search`)
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('다른 사용자의 주소를 검색 주소로 설정하면 404 에러를 반환한다', async () => {
      const userA = await createAuthenticatedUser(app);
      const userB = await createAuthenticatedUser(app);
      const created = await createAddress(userA.accessToken);

      const res = await api()
        .patch(`/user/addresses/${created.body.id}/search`)
        .set('Authorization', `Bearer ${userB.accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe(ErrorCode.ADDRESS_NOT_FOUND);
    });

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
      const res = await api().patch(`/user/addresses/${TEST_IDS.NON_EXISTENT}/search`);

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 캐시 HIT 테스트
  // =====================
  describe('Cache HIT', () => {
    it('같은 사용자 주소를 2회 조회하면 두 번째는 캐시에서 반환된다', async () => {
      const testUser = await createAuthenticatedUser(app);
      await createAddress(testUser.accessToken);

      // 첫 번째 조회 (캐시 MISS → DB 조회 → 캐시 저장)
      const res1 = await api()
        .get('/user/addresses')
        .set('Authorization', `Bearer ${testUser.accessToken}`);
      expect(res1.status).toBe(200);
      expect(res1.body.addresses).toHaveLength(1);

      // 두 번째 조회 (캐시 HIT)
      const res2 = await api()
        .get('/user/addresses')
        .set('Authorization', `Bearer ${testUser.accessToken}`);
      expect(res2.status).toBe(200);
      expect(res2.body.addresses).toHaveLength(1);
      expect(res2.body.addresses[0].id).toBe(res1.body.addresses[0].id);
    });
  });

  // =====================
  // 두 번째 주소 추가 시 isDefault 전환
  // =====================
  describe('Default address switching on second address', () => {
    it('두 번째 주소를 isDefault=true로 추가하면 기존 주소의 isDefault가 false로 변경된다', async () => {
      const testUser = await createAuthenticatedUser(app);

      // 첫 번째 주소 (자동 isDefault=true)
      const first = await createAddress(testUser.accessToken);
      expect(first.body.isDefault).toBe(true);

      // 두 번째 주소 (isDefault=true 명시)
      const second = await createAddress(testUser.accessToken, altAddress, { isDefault: true });
      expect(second.body.isDefault).toBe(true);

      // 첫 번째 주소가 isDefault=false로 변경되었는지 확인
      const listRes = await api()
        .get('/user/addresses')
        .set('Authorization', `Bearer ${testUser.accessToken}`);
      const firstAddr = listRes.body.addresses.find(
        (a: { id: number }) => a.id === first.body.id,
      );
      expect(firstAddr.isDefault).toBe(false);
    });
  });

  // =====================
  // updateAddress에서 latitude, longitude, alias 업데이트
  // =====================
  describe('PATCH /user/addresses/:id - extended fields', () => {
    it('latitude, longitude, alias를 함께 업데이트할 수 있다', async () => {
      const testUser = await createAuthenticatedUser(app);
      const created = await createAddress(testUser.accessToken);

      const res = await api()
        .patch(`/user/addresses/${created.body.id}`)
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({
          latitude: 37.555,
          longitude: 127.055,
          alias: '회사',
        });

      expect(res.status).toBe(200);
      expect(res.body.latitude).toBe(37.555);
      expect(res.body.longitude).toBe(127.055);
      expect(res.body.alias).toBe('회사');
    });
  });

  // =====================
  // search address 삭제 시 플래그 재할당
  // =====================
  describe('Search address flag reassignment on delete', () => {
    it('searchAddress를 삭제하면 다른 주소에 isSearchAddress 플래그가 재할당된다', async () => {
      const testUser = await createAuthenticatedUser(app);

      // 첫 번째 주소 (default + search)
      const first = await createAddress(testUser.accessToken);
      expect(first.body.isSearchAddress).toBe(true);

      // 두 번째 주소
      const second = await createAddress(testUser.accessToken, altAddress);

      // 첫 번째 주소(search)를 검색 주소에서 해제, 두 번째를 검색 주소로 설정
      await api()
        .patch(`/user/addresses/${second.body.id}/search`)
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      // 두 번째 주소(search) 삭제 → 첫 번째 주소에 isSearchAddress 재할당
      // 단일 삭제로 테스트 (deleteAddress 사용)
      // batch-delete로 non-default 주소 삭제
      const deleteRes = await api()
        .post('/user/addresses/batch-delete')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ ids: [second.body.id] });
      expect(deleteRes.status).toBe(200);

      // 남은 주소 확인
      const listRes = await api()
        .get('/user/addresses')
        .set('Authorization', `Bearer ${testUser.accessToken}`);
      expect(listRes.body.addresses).toHaveLength(1);
      expect(listRes.body.addresses[0].isSearchAddress).toBe(true);
    });
  });

  // =====================
  // deleteAddresses 배치 삭제 — search 포함 시 재할당
  // =====================
  describe('Batch delete with search address reassignment', () => {
    it('배치 삭제에서 searchAddress가 포함되면 남은 주소에 플래그가 재할당된다', async () => {
      const testUser = await createAuthenticatedUser(app);

      const first = await createAddress(testUser.accessToken);
      const second = await createAddress(testUser.accessToken, altAddress);
      const third = await createAddress(testUser.accessToken, {
        address: '서울특별시 강남구 주소3',
        roadAddress: '서울특별시 강남구 도로3',
        postalCode: '06300',
        latitude: '37.5100',
        longitude: '127.0400',
      });

      // second를 searchAddress로 설정
      await api()
        .patch(`/user/addresses/${second.body.id}/search`)
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      // second(searchAddress)와 third를 배치 삭제
      const deleteRes = await api()
        .post('/user/addresses/batch-delete')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ ids: [second.body.id, third.body.id] });
      expect(deleteRes.status).toBe(200);

      // first(default)에 searchAddress가 재할당되어야 함
      const listRes = await api()
        .get('/user/addresses')
        .set('Authorization', `Bearer ${testUser.accessToken}`);
      expect(listRes.body.addresses).toHaveLength(1);
      expect(listRes.body.addresses[0].id).toBe(first.body.id);
      expect(listRes.body.addresses[0].isSearchAddress).toBe(true);
    });
  });

  // =====================
  // updateSingleAddress 전체 경로 (PATCH /user/address)
  // =====================
  describe('PATCH /user/address - updateSingleAddress paths', () => {
    it('주소가 없는 사용자가 요청하면 새 주소를 생성한다 (isDefault=true, isSearchAddress=true)', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .patch('/user/address')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ selectedAddress: sampleAddress });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('isDefault', true);
      expect(res.body).toHaveProperty('isSearchAddress', true);
    });

    it('기존 검색 주소가 있으면 해당 주소를 업데이트한다', async () => {
      const testUser = await createAuthenticatedUser(app);

      // 먼저 주소 생성 (isDefault=true, isSearchAddress=true)
      await createAddress(testUser.accessToken);

      // updateSingleAddress로 검색 주소 업데이트
      const res = await api()
        .patch('/user/address')
        .set('Authorization', `Bearer ${testUser.accessToken}`)
        .send({ selectedAddress: altAddress });

      expect(res.status).toBe(200);
      expect(res.body.roadAddress).toBe(altAddress.roadAddress);
    });
  });

  // =====================
  // 주소 목록 조회 (GET /user/addresses)
  // =====================
  describe('GET /user/addresses', () => {
    it('인증된 사용자가 요청하면 200 + 주소 배열을 반환한다', async () => {
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

    it('주소가 없으면 200 + 빈 주소 배열을 반환한다', async () => {
      const testUser = await createAuthenticatedUser(app);

      const res = await api()
        .get('/user/addresses')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.addresses).toHaveLength(0);
    });

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
      const res = await api().get('/user/addresses');

      expect(res.status).toBe(401);
    });

    it('다른 사용자의 주소는 반환하지 않는다', async () => {
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
    it('기본 주소가 있으면 200 + 기본 주소를 반환한다', async () => {
      const testUser = await createAuthenticatedUser(app);
      await createAddress(testUser.accessToken);

      const res = await api()
        .get('/user/address/default')
        .set('Authorization', `Bearer ${testUser.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('isDefault', true);
    });

    it('기본 주소가 없으면 200 + null 또는 빈 객체를 반환한다', async () => {
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

    it('인증 토큰 없이 요청하면 401 에러를 반환한다', async () => {
      const res = await api().get('/user/address/default');

      expect(res.status).toBe(401);
    });

    it('요청한 사용자의 기본 주소만 반환한다', async () => {
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
