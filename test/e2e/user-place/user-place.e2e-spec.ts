import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Repository } from 'typeorm';
import {
  createTestingApp,
  closeTestingApp,
} from '../../e2e/setup/testing-app.module';
import { User } from '@/user/entities/user.entity';
import { UserPlace } from '@/user-place/entities/user-place.entity';
import { UserPlaceStatus } from '@/user-place/enum/user-place-status.enum';
import { UserFactory } from '../../factories/entity.factory';
import {
  USER_PLACE_TEST_DATA,
  USER_PLACE_ERROR_CODES,
  USER_PLACE_MESSAGE_CODES,
  USER_PLACE_LIMITS,
  INVALID_USER_PLACE_DATA,
} from '../../constants/user-place-test.constants';
import { TEST_TIMEOUTS } from '../../constants/test.constants';
import * as bcrypt from 'bcrypt';

describe('User Place (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let userPlaceRepository: Repository<UserPlace>;

  // Test users
  let testUser: User;
  let testUser2: User;
  let adminUser: User;
  let testUserToken: string;
  let testUser2Token: string;
  let adminToken: string;

  beforeAll(async () => {
    const testApp = await createTestingApp();
    app = testApp.app;

    // Get repositories
    userRepository = testApp.module.get<Repository<User>>('UserRepository');
    userPlaceRepository = testApp.module.get<Repository<UserPlace>>(
      'UserPlaceRepository',
    );
  }, TEST_TIMEOUTS.E2E_DEFAULT_MS);

  afterAll(async () => {
    await closeTestingApp(app);
  });

  beforeEach(async () => {
    // Clear data before each test - order matters for FK constraints
    await userPlaceRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();

    // Create test users
    const hashedPassword = await bcrypt.hash('Password123!', 10);

    testUser = await userRepository.save({
      email: 'testuser@example.com',
      password: hashedPassword,
      name: 'Test User',
      emailVerified: true,
      role: 'USER',
    });

    testUser2 = await userRepository.save({
      email: 'testuser2@example.com',
      password: hashedPassword,
      name: 'Test User 2',
      emailVerified: true,
      role: 'USER',
    });

    adminUser = await userRepository.save({
      email: 'admin@example.com',
      password: hashedPassword,
      name: 'Admin User',
      emailVerified: true,
      role: 'ADMIN',
    });

    // Get tokens
    const testUserLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testUser.email, password: 'Password123!' });
    testUserToken = testUserLogin.body.token;

    const testUser2Login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testUser2.email, password: 'Password123!' });
    testUser2Token = testUser2Login.body.token;

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminUser.email, password: 'Password123!' });
    adminToken = adminLogin.body.token;
  });

  describe('POST /user-places/check', () => {
    it('should return canRegister: true when user can register', async () => {
      const response = await request(app.getHttpServer())
        .post('/user-places/check')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
          address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
          latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
          longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        })
        .expect(201);

      expect(response.body).toHaveProperty('canRegister', true);
      expect(response.body).toHaveProperty('dailyRemaining');
      expect(response.body.dailyRemaining).toBeLessThanOrEqual(
        USER_PLACE_LIMITS.DAILY_REGISTRATION_LIMIT,
      );
    });

    it('should return canRegister: false when daily limit exceeded', async () => {
      // Create 5 places to hit daily limit
      const today = new Date().toISOString().split('T')[0];
      for (let i = 0; i < USER_PLACE_LIMITS.DAILY_REGISTRATION_LIMIT; i++) {
        await userPlaceRepository.save({
          user: testUser,
          name: `식당 ${i + 1}`,
          address: `주소 ${i + 1}`,
          latitude: 37.5012345 + i * 0.001,
          longitude: 127.0398765 + i * 0.001,
          location: {
            type: 'Point',
            coordinates: [127.0398765 + i * 0.001, 37.5012345 + i * 0.001],
          },
          menuTypes: ['한식'],
          status: UserPlaceStatus.PENDING,
          lastSubmittedAt: new Date(),
        });
      }

      const response = await request(app.getHttpServer())
        .post('/user-places/check')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
          address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
          latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
          longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        })
        .expect(201);

      expect(response.body).toHaveProperty('canRegister', false);
      expect(response.body).toHaveProperty('dailyRemaining', 0);
    });

    it('should return duplicateExists: true when same place already registered', async () => {
      // Create existing place with same name and address
      await userPlaceRepository.save({
        user: testUser,
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        location: {
          type: 'Point',
          coordinates: [
            USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
            USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
          ],
        },
        menuTypes: ['한식'],
        status: UserPlaceStatus.PENDING,
        lastSubmittedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/user-places/check')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
          address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
          latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
          longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        })
        .expect(201);

      expect(response.body).toHaveProperty('duplicateExists', true);
    });

    it('should return nearby places when similar places exist within 100m', async () => {
      // Create a nearby place
      await userPlaceRepository.save({
        user: testUser,
        name: USER_PLACE_TEST_DATA.NEARBY_PLACE.name,
        address: USER_PLACE_TEST_DATA.NEARBY_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.NEARBY_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.NEARBY_PLACE.longitude,
        location: {
          type: 'Point',
          coordinates: [
            USER_PLACE_TEST_DATA.NEARBY_PLACE.longitude,
            USER_PLACE_TEST_DATA.NEARBY_PLACE.latitude,
          ],
        },
        menuTypes: ['한식'],
        status: UserPlaceStatus.APPROVED,
        lastSubmittedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/user-places/check')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
          address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
          latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
          longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        })
        .expect(201);

      expect(response.body).toHaveProperty('nearbyPlaces');
      expect(Array.isArray(response.body.nearbyPlaces)).toBe(true);
      expect(response.body.nearbyPlaces.length).toBeGreaterThan(0);
    });

    it('should fail when not authenticated', async () => {
      await request(app.getHttpServer())
        .post('/user-places/check')
        .send({
          name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
          address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
          latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
          longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        })
        .expect(401);
    });

    it('should fail with invalid coordinates', async () => {
      await request(app.getHttpServer())
        .post('/user-places/check')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
          address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
          latitude: 999, // Invalid
          longitude: 999, // Invalid
        })
        .expect(400);
    });

    it.skip('should enforce rate limit', async () => {
      // NOTE: Skipped because ThrottlerGuard is disabled in E2E test environment
      // to prevent test failures from rapid sequential requests
      // Make requests up to rate limit
      const limit = USER_PLACE_LIMITS.RATE_LIMITS.READ_PER_MINUTE;
      const requests: Promise<request.Response>[] = [];

      for (let i = 0; i < limit + 1; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/user-places/check')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
              name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
              address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
              latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
              longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
            }),
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponse = responses.find((r) => r.status === 429);
      expect(rateLimitedResponse).toBeDefined();
    });
  });

  describe('POST /user-places', () => {
    it('should create user place successfully with required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/user-places')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send(USER_PLACE_TEST_DATA.MINIMAL_PLACE)
        .expect(201);

      expect(response.body).toHaveProperty(
        'messageCode',
        USER_PLACE_MESSAGE_CODES.CREATED,
      );
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty(
        'name',
        USER_PLACE_TEST_DATA.MINIMAL_PLACE.name,
      );
      expect(response.body).toHaveProperty('status', UserPlaceStatus.PENDING);

      // Verify in database
      const place = await userPlaceRepository.findOne({
        where: { id: response.body.id },
        relations: ['user'],
      });
      expect(place).toBeDefined();
      expect(place!.user.id).toBe(testUser.id);
    });

    it('should create user place successfully with all optional fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/user-places')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send(USER_PLACE_TEST_DATA.FULL_PLACE)
        .expect(201);

      expect(response.body).toHaveProperty(
        'messageCode',
        USER_PLACE_MESSAGE_CODES.CREATED,
      );
      expect(response.body).toHaveProperty('phoneNumber');
      expect(response.body).toHaveProperty('category');
      expect(response.body).toHaveProperty('description');
      expect(response.body).toHaveProperty('openingHours');
      expect(response.body).toHaveProperty('photos');
      expect(Array.isArray(response.body.photos)).toBe(true);
    });

    it('should fail when daily limit exceeded', async () => {
      // Create 5 places to hit daily limit
      for (let i = 0; i < USER_PLACE_LIMITS.DAILY_REGISTRATION_LIMIT; i++) {
        await userPlaceRepository.save({
          user: testUser,
          name: `식당 ${i + 1}`,
          address: `주소 ${i + 1}`,
          latitude: 37.5012345 + i * 0.001,
          longitude: 127.0398765 + i * 0.001,
          location: {
            type: 'Point',
            coordinates: [127.0398765 + i * 0.001, 37.5012345 + i * 0.001],
          },
          menuTypes: ['한식'],
          status: UserPlaceStatus.PENDING,
          lastSubmittedAt: new Date(),
        });
      }

      const response = await request(app.getHttpServer())
        .post('/user-places')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send(USER_PLACE_TEST_DATA.VALID_PLACE)
        .expect(400);

      expect(response.body).toHaveProperty(
        'errorCode',
        USER_PLACE_ERROR_CODES.DAILY_LIMIT_EXCEEDED,
      );
    });

    it('should fail when duplicate registration', async () => {
      // Create existing place
      await userPlaceRepository.save({
        user: testUser,
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        location: {
          type: 'Point',
          coordinates: [
            USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
            USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
          ],
        },
        menuTypes: ['한식'],
        status: UserPlaceStatus.PENDING,
        lastSubmittedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/user-places')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send(USER_PLACE_TEST_DATA.VALID_PLACE)
        .expect(400);

      expect(response.body).toHaveProperty(
        'errorCode',
        USER_PLACE_ERROR_CODES.DUPLICATE_REGISTRATION,
      );
    });

    it('should fail when not authenticated', async () => {
      await request(app.getHttpServer())
        .post('/user-places')
        .send(USER_PLACE_TEST_DATA.VALID_PLACE)
        .expect(401);
    });

    it('should fail when required fields missing', async () => {
      await request(app.getHttpServer())
        .post('/user-places')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send(INVALID_USER_PLACE_DATA.MISSING_FIELDS)
        .expect(400);
    });

    it('should fail when menuTypes is empty', async () => {
      await request(app.getHttpServer())
        .post('/user-places')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send(INVALID_USER_PLACE_DATA.EMPTY_MENU_TYPES)
        .expect(400);
    });

    it('should fail when menuTypes exceeds 10 items', async () => {
      await request(app.getHttpServer())
        .post('/user-places')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send(INVALID_USER_PLACE_DATA.TOO_MANY_MENU_TYPES)
        .expect(400);
    });

    it('should fail when photos exceed 5 items', async () => {
      await request(app.getHttpServer())
        .post('/user-places')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send(INVALID_USER_PLACE_DATA.TOO_MANY_PHOTOS)
        .expect(400);
    });

    it.skip('should enforce rate limit for creation', async () => {
      // NOTE: Skipped because ThrottlerGuard is disabled in E2E test environment
      // to prevent test failures from rapid sequential requests
      const limit = USER_PLACE_LIMITS.RATE_LIMITS.CREATE_PER_MINUTE;
      const requests: Promise<request.Response>[] = [];

      for (let i = 0; i < limit + 1; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/user-places')
            .set('Authorization', `Bearer ${testUserToken}`)
            .send({
              ...USER_PLACE_TEST_DATA.VALID_PLACE,
              name: `식당 ${i + 1}`,
            }),
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponse = responses.find((r) => r.status === 429);
      expect(rateLimitedResponse).toBeDefined();
    });
  });

  describe('GET /user-places', () => {
    beforeEach(async () => {
      // Create test places
      await userPlaceRepository.save([
        {
          user: testUser,
          name: 'PENDING 식당 1',
          address: '주소 1',
          latitude: 37.5012345,
          longitude: 127.0398765,
          location: { type: 'Point', coordinates: [127.0398765, 37.5012345] },
          menuTypes: ['한식'],
          status: UserPlaceStatus.PENDING,
          lastSubmittedAt: new Date(),
        },
        {
          user: testUser,
          name: 'APPROVED 식당 1',
          address: '주소 2',
          latitude: 37.5022345,
          longitude: 127.0408765,
          location: { type: 'Point', coordinates: [127.0408765, 37.5022345] },
          menuTypes: ['중식'],
          status: UserPlaceStatus.APPROVED,
          lastSubmittedAt: new Date(),
        },
        {
          user: testUser,
          name: 'REJECTED 식당 1',
          address: '주소 3',
          latitude: 37.5032345,
          longitude: 127.0418765,
          location: { type: 'Point', coordinates: [127.0418765, 37.5032345] },
          menuTypes: ['일식'],
          status: UserPlaceStatus.REJECTED,
          lastSubmittedAt: new Date(),
        },
      ]);
    });

    it('should get user places with default pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/user-places')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.total).toBe(3);
    });

    it('should filter by status PENDING', async () => {
      const response = await request(app.getHttpServer())
        .get('/user-places')
        .query({ status: UserPlaceStatus.PENDING })
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      expect(response.body.items.length).toBe(1);
      expect(response.body.items[0].status).toBe(UserPlaceStatus.PENDING);
    });

    it('should filter by search keyword', async () => {
      const response = await request(app.getHttpServer())
        .get('/user-places')
        .query({ search: 'APPROVED' })
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      expect(response.body.items.length).toBeGreaterThan(0);
      expect(
        response.body.items.some((item: UserPlace) =>
          item.name.includes('APPROVED'),
        ),
      ).toBe(true);
    });

    it('should support custom pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/user-places')
        .query({ page: 1, limit: 2 })
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      expect(response.body.items.length).toBeLessThanOrEqual(2);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(2);
    });

    it('should return empty list when no places exist', async () => {
      // Clear all places
      await userPlaceRepository.createQueryBuilder().delete().execute();

      const response = await request(app.getHttpServer())
        .get('/user-places')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      expect(response.body.items).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('should fail when not authenticated', async () => {
      await request(app.getHttpServer()).get('/user-places').expect(401);
    });

    it('should exclude soft-deleted places from list', async () => {
      // 1. 새로운 place 생성
      const deletedPlace = await userPlaceRepository.save({
        user: testUser,
        name: 'DELETED 식당',
        address: '주소 삭제됨',
        latitude: 37.5042345,
        longitude: 127.0428765,
        location: { type: 'Point', coordinates: [127.0428765, 37.5042345] },
        menuTypes: ['한식'],
        status: UserPlaceStatus.PENDING,
        lastSubmittedAt: new Date(),
      });

      // 2. soft delete 수행
      await userPlaceRepository.softRemove(deletedPlace);

      // 3. 목록 조회 시 삭제된 place가 포함되지 않는지 확인
      const response = await request(app.getHttpServer())
        .get('/user-places')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      // 4. 삭제된 place가 목록에 없어야 함
      expect(
        response.body.items.every((item: any) => item.id !== deletedPlace.id),
      ).toBe(true);
    });
  });

  describe('GET /user-places/:id', () => {
    let testPlace: UserPlace;

    beforeEach(async () => {
      testPlace = await userPlaceRepository.save({
        user: testUser,
        name: USER_PLACE_TEST_DATA.VALID_PLACE.name,
        address: USER_PLACE_TEST_DATA.VALID_PLACE.address,
        latitude: USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
        longitude: USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
        location: {
          type: 'Point',
          coordinates: [
            USER_PLACE_TEST_DATA.VALID_PLACE.longitude,
            USER_PLACE_TEST_DATA.VALID_PLACE.latitude,
          ],
        },
        menuTypes: [...USER_PLACE_TEST_DATA.VALID_PLACE.menuTypes],
        status: UserPlaceStatus.PENDING,
        lastSubmittedAt: new Date(),
      });
    });

    it('should get user place detail successfully', async () => {
      const response = await request(app.getHttpServer())
        .get(`/user-places/${testPlace.id}`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', testPlace.id);
      expect(response.body).toHaveProperty('name', testPlace.name);
      expect(response.body).toHaveProperty('address');
      expect(response.body).toHaveProperty('latitude');
      expect(response.body).toHaveProperty('longitude');
      expect(response.body).toHaveProperty('menuTypes');
      expect(response.body).toHaveProperty('status');
    });

    it('should fail when place does not exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/user-places/99999')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(404);

      expect(response.body).toHaveProperty(
        'errorCode',
        USER_PLACE_ERROR_CODES.NOT_FOUND,
      );
    });

    it('should fail when accessing another user place (security)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/user-places/${testPlace.id}`)
        .set('Authorization', `Bearer ${testUser2Token}`)
        .expect(404);

      expect(response.body).toHaveProperty(
        'errorCode',
        USER_PLACE_ERROR_CODES.NOT_FOUND,
      );
    });

    it('should fail when not authenticated', async () => {
      await request(app.getHttpServer())
        .get(`/user-places/${testPlace.id}`)
        .expect(401);
    });
  });

  describe('PATCH /user-places/:id', () => {
    let pendingPlace: UserPlace;
    let rejectedPlace: UserPlace;
    let approvedPlace: UserPlace;

    beforeEach(async () => {
      pendingPlace = await userPlaceRepository.save({
        user: testUser,
        name: 'PENDING 식당',
        address: '주소 1',
        latitude: 37.5012345,
        longitude: 127.0398765,
        location: { type: 'Point', coordinates: [127.0398765, 37.5012345] },
        menuTypes: ['한식'],
        status: UserPlaceStatus.PENDING,
        version: 1,
        lastSubmittedAt: new Date(),
      });

      rejectedPlace = await userPlaceRepository.save({
        user: testUser,
        name: 'REJECTED 식당',
        address: '주소 2',
        latitude: 37.5022345,
        longitude: 127.0408765,
        location: { type: 'Point', coordinates: [127.0408765, 37.5022345] },
        menuTypes: ['중식'],
        status: UserPlaceStatus.REJECTED,
        version: 1,
        lastSubmittedAt: new Date(),
      });

      approvedPlace = await userPlaceRepository.save({
        user: testUser,
        name: 'APPROVED 식당',
        address: '주소 3',
        latitude: 37.5032345,
        longitude: 127.0418765,
        location: { type: 'Point', coordinates: [127.0418765, 37.5032345] },
        menuTypes: ['일식'],
        status: UserPlaceStatus.APPROVED,
        version: 1,
        lastSubmittedAt: new Date(),
      });
    });

    it('should update PENDING place successfully', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/user-places/${pendingPlace.id}`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          name: '수정된 식당',
          menuTypes: ['한식', '중식'],
          version: pendingPlace.version,
        })
        .expect(200);

      expect(response.body).toHaveProperty(
        'messageCode',
        USER_PLACE_MESSAGE_CODES.UPDATED,
      );
      expect(response.body).toHaveProperty('name', '수정된 식당');
      expect(response.body.menuTypes).toContain('한식');
      expect(response.body.menuTypes).toContain('중식');
    });

    it('should resubmit REJECTED place successfully', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/user-places/${rejectedPlace.id}`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          name: '재제출 식당',
          menuTypes: ['한식'],
          version: rejectedPlace.version,
        })
        .expect(200);

      expect(response.body).toHaveProperty(
        'messageCode',
        USER_PLACE_MESSAGE_CODES.UPDATED,
      );
      expect(response.body).toHaveProperty('status', UserPlaceStatus.PENDING);
    });

    it('should fail when updating APPROVED place', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/user-places/${approvedPlace.id}`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          name: '수정 시도',
          version: approvedPlace.version,
        })
        .expect(403);

      expect(response.body).toHaveProperty(
        'errorCode',
        USER_PLACE_ERROR_CODES.NOT_EDITABLE,
      );
    });

    it('should fail on version conflict (optimistic locking)', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/user-places/${pendingPlace.id}`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          name: '수정 시도',
          version: 999, // Wrong version
        })
        .expect(400);

      expect(response.body).toHaveProperty(
        'errorCode',
        USER_PLACE_ERROR_CODES.OPTIMISTIC_LOCK_FAILED,
      );
    });

    it('should update location when coordinates change', async () => {
      const newLatitude = 37.5112345;
      const newLongitude = 127.0498765;

      const response = await request(app.getHttpServer())
        .patch(`/user-places/${pendingPlace.id}`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          latitude: newLatitude,
          longitude: newLongitude,
          version: pendingPlace.version,
        })
        .expect(200);

      expect(response.body).toHaveProperty('latitude', newLatitude);
      expect(response.body).toHaveProperty('longitude', newLongitude);

      // Verify location field is synchronized
      const updated = await userPlaceRepository.findOne({
        where: { id: pendingPlace.id },
      });
      expect(updated!.location).toBeDefined();
      expect(updated!.location!.coordinates[0]).toBe(newLongitude);
      expect(updated!.location!.coordinates[1]).toBe(newLatitude);
    });

    it('should fail when place does not exist', async () => {
      const response = await request(app.getHttpServer())
        .patch('/user-places/99999')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          name: '수정',
          version: 1,
        })
        .expect(404);

      expect(response.body).toHaveProperty(
        'errorCode',
        USER_PLACE_ERROR_CODES.NOT_FOUND,
      );
    });

    it('should fail when updating another user place', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/user-places/${pendingPlace.id}`)
        .set('Authorization', `Bearer ${testUser2Token}`)
        .send({
          name: '수정 시도',
          version: 1,
        })
        .expect(404);

      expect(response.body).toHaveProperty(
        'errorCode',
        USER_PLACE_ERROR_CODES.NOT_FOUND,
      );
    });

    it('should fail when not authenticated', async () => {
      await request(app.getHttpServer())
        .patch(`/user-places/${pendingPlace.id}`)
        .send({
          name: '수정',
          version: 1,
        })
        .expect(401);
    });

    it('should support partial update (other fields preserved)', async () => {
      const originalName = pendingPlace.name;
      const originalAddress = pendingPlace.address;

      const response = await request(app.getHttpServer())
        .patch(`/user-places/${pendingPlace.id}`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          menuTypes: ['양식', '이탈리안'],
          version: pendingPlace.version,
        })
        .expect(200);

      expect(response.body).toHaveProperty('name', originalName);
      expect(response.body).toHaveProperty('address', originalAddress);
      expect(response.body.menuTypes).toContain('양식');
      expect(response.body.menuTypes).toContain('이탈리안');
    });
  });

  describe('DELETE /user-places/:id', () => {
    let pendingPlace: UserPlace;
    let rejectedPlace: UserPlace;
    let approvedPlace: UserPlace;

    beforeEach(async () => {
      pendingPlace = await userPlaceRepository.save({
        user: testUser,
        name: 'PENDING 식당',
        address: '주소 1',
        latitude: 37.5012345,
        longitude: 127.0398765,
        location: { type: 'Point', coordinates: [127.0398765, 37.5012345] },
        menuTypes: ['한식'],
        status: UserPlaceStatus.PENDING,
        lastSubmittedAt: new Date(),
      });

      rejectedPlace = await userPlaceRepository.save({
        user: testUser,
        name: 'REJECTED 식당',
        address: '주소 2',
        latitude: 37.5022345,
        longitude: 127.0408765,
        location: { type: 'Point', coordinates: [127.0408765, 37.5022345] },
        menuTypes: ['중식'],
        status: UserPlaceStatus.REJECTED,
        lastSubmittedAt: new Date(),
      });

      approvedPlace = await userPlaceRepository.save({
        user: testUser,
        name: 'APPROVED 식당',
        address: '주소 3',
        latitude: 37.5032345,
        longitude: 127.0418765,
        location: { type: 'Point', coordinates: [127.0418765, 37.5032345] },
        menuTypes: ['일식'],
        status: UserPlaceStatus.APPROVED,
        lastSubmittedAt: new Date(),
      });
    });

    it('should delete PENDING place successfully', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/user-places/${pendingPlace.id}`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty(
        'messageCode',
        USER_PLACE_MESSAGE_CODES.DELETED,
      );

      // Verify soft delete
      const deleted = await userPlaceRepository.findOne({
        where: { id: pendingPlace.id },
        withDeleted: true,
      });
      expect(deleted!.deletedAt).not.toBeNull();
    });

    it('should delete REJECTED place successfully', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/user-places/${rejectedPlace.id}`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      expect(response.body).toHaveProperty(
        'messageCode',
        USER_PLACE_MESSAGE_CODES.DELETED,
      );

      // Verify soft delete
      const deleted = await userPlaceRepository.findOne({
        where: { id: rejectedPlace.id },
        withDeleted: true,
      });
      expect(deleted!.deletedAt).not.toBeNull();
    });

    it('should fail when deleting APPROVED place', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/user-places/${approvedPlace.id}`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(403);

      expect(response.body).toHaveProperty(
        'errorCode',
        USER_PLACE_ERROR_CODES.NOT_DELETABLE,
      );
    });

    it('should fail when place does not exist', async () => {
      const response = await request(app.getHttpServer())
        .delete('/user-places/99999')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(404);

      expect(response.body).toHaveProperty(
        'errorCode',
        USER_PLACE_ERROR_CODES.NOT_FOUND,
      );
    });

    it('should fail when deleting another user place', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/user-places/${pendingPlace.id}`)
        .set('Authorization', `Bearer ${testUser2Token}`)
        .expect(404);

      expect(response.body).toHaveProperty(
        'errorCode',
        USER_PLACE_ERROR_CODES.NOT_FOUND,
      );
    });

    it('should fail when not authenticated', async () => {
      await request(app.getHttpServer())
        .delete(`/user-places/${pendingPlace.id}`)
        .expect(401);
    });
  });

  describe('Admin Endpoints - GET /admin/user-places', () => {
    beforeEach(async () => {
      // Create places for different users
      await userPlaceRepository.save([
        {
          user: testUser,
          name: '사용자1 식당1',
          address: '주소1',
          latitude: 37.5012345,
          longitude: 127.0398765,
          location: { type: 'Point', coordinates: [127.0398765, 37.5012345] },
          menuTypes: ['한식'],
          status: UserPlaceStatus.PENDING,
          lastSubmittedAt: new Date(),
        },
        {
          user: testUser2,
          name: '사용자2 식당1',
          address: '주소2',
          latitude: 37.5022345,
          longitude: 127.0408765,
          location: { type: 'Point', coordinates: [127.0408765, 37.5022345] },
          menuTypes: ['중식'],
          status: UserPlaceStatus.APPROVED,
          lastSubmittedAt: new Date(),
        },
      ]);
    });

    it('should get all user places for admin', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/user-places')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.total).toBeGreaterThanOrEqual(2);
    });

    it('should filter by userId', async () => {
      const response = await request(app.getHttpServer())
        .get('/admin/user-places')
        .query({ userId: testUser.id })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.items.length).toBeGreaterThan(0);
      response.body.items.forEach((item: UserPlace & { userId: number }) => {
        expect(item.userId).toBe(testUser.id);
      });
    });

    it('should fail when accessed by non-admin user', async () => {
      await request(app.getHttpServer())
        .get('/admin/user-places')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(403);
    });

    it('should get single place detail for admin', async () => {
      const place = await userPlaceRepository.findOne({
        where: { user: { id: testUser.id } },
      });

      const response = await request(app.getHttpServer())
        .get(`/admin/user-places/${place!.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', place!.id);
      expect(response.body).toHaveProperty('name');
    });

    it('should fail when not authenticated', async () => {
      await request(app.getHttpServer()).get('/admin/user-places').expect(401);
    });
  });
});
