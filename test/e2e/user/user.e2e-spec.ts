import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestingApp,
  closeTestingApp,
  createAllMockClients,
} from '../setup/testing-app.module';
import { Repository } from 'typeorm';
import { User } from '@/user/entities/user.entity';
import { UserAddress } from '@/user/entities/user-address.entity';
import * as bcrypt from 'bcrypt';
import { TEST_COORDINATES, TEST_IDS } from '../../constants/test.constants';

describe('User (e2e)', () => {
  let app: INestApplication;
  let mocks: ReturnType<typeof createAllMockClients>;
  let userRepository: Repository<User>;
  let userAddressRepository: Repository<UserAddress>;
  let accessToken: string;
  let testUser: User;

  beforeAll(async () => {
    const testApp = await createTestingApp();
    app = testApp.app;
    mocks = testApp.mocks;

    // Get repositories for test setup
    userRepository = testApp.module.get('UserRepository');
    userAddressRepository = testApp.module.get('UserAddressRepository');
  });

  afterAll(async () => {
    await closeTestingApp(app);
  });

  beforeEach(async () => {
    // Clear data before each test
    await userAddressRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();

    // Reset all mocks
    jest.clearAllMocks();

    // Create and login test user for authenticated requests
    const hashedPassword = await bcrypt.hash('Password123!', 10);
    testUser = await userRepository.save({
      email: 'testuser@example.com',
      password: hashedPassword,
      name: 'Test User',
      emailVerified: true,
      preferences: null,
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'testuser@example.com',
        password: 'Password123!',
      });

    accessToken = loginResponse.body.token;
  });

  describe('GET /user/preferences', () => {
    it('should get user preferences successfully', async () => {
      // Update user with preferences
      await userRepository.update(testUser.id, {
        preferences: {
          likes: ['한식', '중식'],
          dislikes: ['양식'],
        },
      });

      const response = await request(app.getHttpServer())
        .get('/user/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.preferences).toEqual({
        likes: ['한식', '중식'],
        dislikes: ['양식'],
      });
    });

    it('should return empty preferences for new user', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Service returns empty arrays when preferences is null
      expect(response.body.preferences).toEqual({
        likes: [],
        dislikes: [],
      });
    });

    it('should fail without authorization token', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/preferences')
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('POST /user/preferences', () => {
    it('should update user preferences successfully', async () => {
      const preferencesDto = {
        likes: ['한식', '일식', '중식'],
        dislikes: ['양식', '패스트푸드'],
      };

      const response = await request(app.getHttpServer())
        .post('/user/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(preferencesDto)
        .expect(201);

      expect(response.body.preferences).toEqual(preferencesDto);

      // Verify preferences were saved in database
      const user = await userRepository.findOne({ where: { id: testUser.id } });
      expect(user).not.toBeNull();
      expect(user!.preferences).toEqual(preferencesDto);
    });

    it('should update preferences with only likes', async () => {
      const preferencesDto = {
        likes: ['한식'],
      };

      const response = await request(app.getHttpServer())
        .post('/user/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(preferencesDto)
        .expect(201);

      expect(response.body.preferences.likes).toEqual(['한식']);
    });

    it('should update preferences with only dislikes', async () => {
      const preferencesDto = {
        dislikes: ['양식'],
      };

      const response = await request(app.getHttpServer())
        .post('/user/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(preferencesDto)
        .expect(201);

      expect(response.body.preferences.dislikes).toEqual(['양식']);
    });

    it('should fail with invalid data type', async () => {
      const preferencesDto = {
        likes: 'not-an-array', // Should be array
        dislikes: ['양식'],
      };

      const response = await request(app.getHttpServer())
        .post('/user/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(preferencesDto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail without authorization token', async () => {
      const preferencesDto = {
        likes: ['한식'],
        dislikes: ['양식'],
      };

      const response = await request(app.getHttpServer())
        .post('/user/preferences')
        .send(preferencesDto)
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('GET /user/addresses', () => {
    beforeEach(async () => {
      // Create test addresses
      await userAddressRepository.save([
        {
          user: testUser,
          roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
          postalCode: TEST_COORDINATES.GANGNAM.POSTAL_CODE,
          latitude: TEST_COORDINATES.GANGNAM.LATITUDE_NUM,
          longitude: TEST_COORDINATES.GANGNAM.LONGITUDE_NUM,
          isDefault: true,
          isSearchAddress: false,
          alias: '집',
        },
        {
          user: testUser,
          roadAddress: TEST_COORDINATES.GANGNAM_ALT.ROAD_ADDRESS,
          postalCode: TEST_COORDINATES.GANGNAM_ALT.POSTAL_CODE,
          latitude: TEST_COORDINATES.GANGNAM_ALT.LATITUDE_NUM,
          longitude: TEST_COORDINATES.GANGNAM_ALT.LONGITUDE_NUM,
          isDefault: false,
          isSearchAddress: true,
          alias: '회사',
        },
      ]);
    });

    it('should get all user addresses successfully', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({
        roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.GANGNAM.POSTAL_CODE,
        isDefault: true,
        alias: '집',
      });
      expect(response.body[1]).toMatchObject({
        roadAddress: TEST_COORDINATES.GANGNAM_ALT.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.GANGNAM_ALT.POSTAL_CODE,
        isSearchAddress: true,
        alias: '회사',
      });
    });

    it('should return empty array for user with no addresses', async () => {
      // Delete all addresses
      await userAddressRepository.delete({ user: { id: testUser.id } });

      const response = await request(app.getHttpServer())
        .get('/user/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(0);
    });

    it('should fail without authorization token', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/addresses')
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('POST /user/addresses', () => {
    it('should create new address successfully', async () => {
      const createAddressDto = {
        selectedAddress: {
          address: '서울특별시 강남구 역삼동',
          roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
          postalCode: TEST_COORDINATES.GANGNAM.POSTAL_CODE,
          latitude: String(TEST_COORDINATES.GANGNAM.LATITUDE),
          longitude: String(TEST_COORDINATES.GANGNAM.LONGITUDE),
        },
        alias: '새 주소',
        isDefault: false,
        isSearchAddress: false,
      };

      const response = await request(app.getHttpServer())
        .post('/user/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createAddressDto)
        .expect(201);

      expect(response.body).toMatchObject({
        roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.GANGNAM.POSTAL_CODE,
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE_NUM,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE_NUM,
        alias: '새 주소',
        // First address is automatically set as default and search address
        isDefault: true,
        isSearchAddress: true,
      });

      // Verify address was created in database
      const address = await userAddressRepository.findOne({
        where: { user: { id: testUser.id }, alias: '새 주소' },
      });
      expect(address).toBeDefined();
      expect(address!.isDefault).toBe(true);
      expect(address!.isSearchAddress).toBe(true);
    });

    it('should create address as default when isDefault is true', async () => {
      const createAddressDto = {
        selectedAddress: {
          address: '서울특별시 강남구 역삼동',
          roadAddress: '서울특별시 강남구 테헤란로 789',
          postalCode: '06236',
          latitude: '37.5212345',
          longitude: '127.0598765',
        },
        alias: '기본 주소',
        isDefault: true,
        isSearchAddress: false,
      };

      const response = await request(app.getHttpServer())
        .post('/user/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createAddressDto)
        .expect(201);

      expect(response.body.isDefault).toBe(true);
    });

    it('should fail with missing required fields', async () => {
      const createAddressDto = {
        // Missing selectedAddress
        alias: '새 주소',
      };

      const response = await request(app.getHttpServer())
        .post('/user/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(createAddressDto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail without authorization token', async () => {
      const createAddressDto = {
        selectedAddress: {
          address: '서울특별시 강남구 역삼동',
          roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
          postalCode: TEST_COORDINATES.GANGNAM.POSTAL_CODE,
          latitude: String(TEST_COORDINATES.GANGNAM.LATITUDE),
          longitude: String(TEST_COORDINATES.GANGNAM.LONGITUDE),
        },
      };

      const response = await request(app.getHttpServer())
        .post('/user/addresses')
        .send(createAddressDto)
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('GET /user/address/default', () => {
    it('should get default address successfully', async () => {
      await userAddressRepository.save({
        user: testUser,
        roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.GANGNAM.POSTAL_CODE,
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE_NUM,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE_NUM,
        isDefault: true,
        isSearchAddress: false,
        alias: '기본 주소',
      });

      const response = await request(app.getHttpServer())
        .get('/user/address/default')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
        isDefault: true,
        alias: '기본 주소',
      });
    });

    it('should return null when no default address exists', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/address/default')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // The controller returns null, but supertest wraps it as {}
      // Check that the response is either null or an empty object
      expect(
        response.body === null || Object.keys(response.body).length === 0,
      ).toBe(true);
    });
  });

  describe('PATCH /user/addresses/:id', () => {
    let testAddress: UserAddress;

    beforeEach(async () => {
      testAddress = await userAddressRepository.save({
        user: testUser,
        roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.GANGNAM.POSTAL_CODE,
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE_NUM,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE_NUM,
        isDefault: false,
        isSearchAddress: false,
        alias: '원래 별칭',
      });
    });

    it('should update address successfully', async () => {
      const updateDto = {
        alias: '수정된 별칭',
        isDefault: true,
      };

      const response = await request(app.getHttpServer())
        .patch(`/user/addresses/${testAddress.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.alias).toBe('수정된 별칭');
      expect(response.body.isDefault).toBe(true);

      // Verify update in database
      const updated = await userAddressRepository.findOne({
        where: { id: testAddress.id },
      });
      expect(updated).not.toBeNull();
      expect(updated!.alias).toBe('수정된 별칭');
      expect(updated!.isDefault).toBe(true);
    });

    it('should fail when address does not belong to user', async () => {
      // Create another user
      const otherUser = await userRepository.save({
        email: 'other@example.com',
        password: await bcrypt.hash('Password123!', 10),
        name: 'Other User',
        emailVerified: true,
      });

      // Create address for other user
      const otherAddress = await userAddressRepository.save({
        user: otherUser,
        roadAddress: TEST_COORDINATES.OTHER.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.OTHER.POSTAL_CODE,
        latitude: TEST_COORDINATES.OTHER.LATITUDE_NUM,
        longitude: TEST_COORDINATES.OTHER.LONGITUDE_NUM,
        isDefault: false,
        isSearchAddress: false,
      });

      const updateDto = {
        alias: '해킹 시도',
      };

      const response = await request(app.getHttpServer())
        .patch(`/user/addresses/${otherAddress.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateDto)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(404);
    });

    it('should fail with non-existent address ID', async () => {
      const updateDto = {
        alias: '수정',
      };

      const response = await request(app.getHttpServer())
        .patch(`/user/addresses/${TEST_IDS.NON_EXISTENT}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateDto)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(404);
    });
  });

  describe('PATCH /user/addresses/:id/default', () => {
    let testAddress: UserAddress;

    beforeEach(async () => {
      testAddress = await userAddressRepository.save({
        user: testUser,
        roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.GANGNAM.POSTAL_CODE,
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE_NUM,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE_NUM,
        isDefault: false,
        isSearchAddress: false,
      });
    });

    it('should set address as default successfully', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/user/addresses/${testAddress.id}/default`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.isDefault).toBe(true);

      // Verify in database
      const updated = await userAddressRepository.findOne({
        where: { id: testAddress.id },
      });
      expect(updated).not.toBeNull();
      expect(updated!.isDefault).toBe(true);
    });

    it('should unset previous default address when setting new one', async () => {
      // Create existing default address
      const oldDefault = await userAddressRepository.save({
        user: testUser,
        roadAddress: TEST_COORDINATES.GANGNAM_ALT.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.GANGNAM_ALT.POSTAL_CODE,
        latitude: TEST_COORDINATES.GANGNAM_ALT.LATITUDE_NUM,
        longitude: TEST_COORDINATES.GANGNAM_ALT.LONGITUDE_NUM,
        isDefault: true,
        isSearchAddress: false,
      });

      await request(app.getHttpServer())
        .patch(`/user/addresses/${testAddress.id}/default`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verify old default is now false
      const oldDefaultUpdated = await userAddressRepository.findOne({
        where: { id: oldDefault.id },
      });
      expect(oldDefaultUpdated).not.toBeNull();
      expect(oldDefaultUpdated!.isDefault).toBe(false);

      // Verify new address is default
      const newDefault = await userAddressRepository.findOne({
        where: { id: testAddress.id },
      });
      expect(newDefault).not.toBeNull();
      expect(newDefault!.isDefault).toBe(true);
    });
  });

  describe('PATCH /user/addresses/:id/search', () => {
    let testAddress: UserAddress;

    beforeEach(async () => {
      testAddress = await userAddressRepository.save({
        user: testUser,
        roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.GANGNAM.POSTAL_CODE,
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE_NUM,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE_NUM,
        isDefault: false,
        isSearchAddress: false,
      });
    });

    it('should set address as search address successfully', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/user/addresses/${testAddress.id}/search`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.isSearchAddress).toBe(true);

      // Verify in database
      const updated = await userAddressRepository.findOne({
        where: { id: testAddress.id },
      });
      expect(updated).not.toBeNull();
      expect(updated!.isSearchAddress).toBe(true);
    });

    it('should unset previous search address when setting new one', async () => {
      // Create existing search address
      const oldSearch = await userAddressRepository.save({
        user: testUser,
        roadAddress: TEST_COORDINATES.GANGNAM_ALT.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.GANGNAM_ALT.POSTAL_CODE,
        latitude: TEST_COORDINATES.GANGNAM_ALT.LATITUDE_NUM,
        longitude: TEST_COORDINATES.GANGNAM_ALT.LONGITUDE_NUM,
        isDefault: false,
        isSearchAddress: true,
      });

      await request(app.getHttpServer())
        .patch(`/user/addresses/${testAddress.id}/search`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verify old search address is now false
      const oldSearchUpdated = await userAddressRepository.findOne({
        where: { id: oldSearch.id },
      });
      expect(oldSearchUpdated).not.toBeNull();
      expect(oldSearchUpdated!.isSearchAddress).toBe(false);

      // Verify new address is search address
      const newSearch = await userAddressRepository.findOne({
        where: { id: testAddress.id },
      });
      expect(newSearch).not.toBeNull();
      expect(newSearch!.isSearchAddress).toBe(true);
    });
  });

  describe('DELETE /user/addresses', () => {
    let address1: UserAddress;
    let address2: UserAddress;

    beforeEach(async () => {
      address1 = await userAddressRepository.save({
        user: testUser,
        roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.GANGNAM.POSTAL_CODE,
        latitude: TEST_COORDINATES.GANGNAM.LATITUDE_NUM,
        longitude: TEST_COORDINATES.GANGNAM.LONGITUDE_NUM,
        isDefault: false,
        isSearchAddress: false,
      });

      address2 = await userAddressRepository.save({
        user: testUser,
        roadAddress: TEST_COORDINATES.GANGNAM_ALT.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.GANGNAM_ALT.POSTAL_CODE,
        latitude: TEST_COORDINATES.GANGNAM_ALT.LATITUDE_NUM,
        longitude: TEST_COORDINATES.GANGNAM_ALT.LONGITUDE_NUM,
        isDefault: false,
        isSearchAddress: false,
      });
    });

    it('should delete multiple addresses successfully', async () => {
      const deleteDto = {
        ids: [address1.id, address2.id],
      };

      const response = await request(app.getHttpServer())
        .delete('/user/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(deleteDto)
        .expect(200);

      expect(response.body.messageCode).toBe('USER_ADDRESS_DELETED');

      // Verify addresses were soft deleted
      const deletedAddresses = await userAddressRepository.find({
        where: { user: { id: testUser.id } },
        withDeleted: true,
      });

      const deleted1 = deletedAddresses.find((a) => a.id === address1.id);
      const deleted2 = deletedAddresses.find((a) => a.id === address2.id);

      expect(deleted1).toBeDefined();
      expect(deleted2).toBeDefined();
      expect(deleted1!.deletedAt).not.toBeNull();
      expect(deleted2!.deletedAt).not.toBeNull();
    });

    it('should delete single address successfully', async () => {
      const deleteDto = {
        ids: [address1.id],
      };

      await request(app.getHttpServer())
        .delete('/user/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(deleteDto)
        .expect(200);

      // Verify only one address was deleted
      const remaining = await userAddressRepository.find({
        where: { user: { id: testUser.id } },
      });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(address2.id);
    });

    it('should fail when trying to delete addresses of other users', async () => {
      // Create another user
      const otherUser = await userRepository.save({
        email: 'other@example.com',
        password: await bcrypt.hash('Password123!', 10),
        name: 'Other User',
        emailVerified: true,
      });

      // Create address for other user
      const otherAddress = await userAddressRepository.save({
        user: otherUser,
        roadAddress: TEST_COORDINATES.OTHER.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.OTHER.POSTAL_CODE,
        latitude: TEST_COORDINATES.OTHER.LATITUDE_NUM,
        longitude: TEST_COORDINATES.OTHER.LONGITUDE_NUM,
        isDefault: false,
        isSearchAddress: false,
      });

      const deleteDto = {
        ids: [otherAddress.id],
      };

      const response = await request(app.getHttpServer())
        .delete('/user/addresses')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(deleteDto)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(404);
    });
  });

  describe('GET /user/address/search', () => {
    it('should search address using Kakao Local API', async () => {
      // Mock Kakao Local API response - KakaoLocalClient returns this format
      const mockResponse = {
        meta: {
          total_count: 1,
          pageable_count: 1,
          is_end: true,
        },
        addresses: [
          {
            address: '서울특별시 강남구 역삼동',
            roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
            postalCode: TEST_COORDINATES.GANGNAM.POSTAL_CODE,
            latitude: String(TEST_COORDINATES.GANGNAM.LATITUDE),
            longitude: String(TEST_COORDINATES.GANGNAM.LONGITUDE),
          },
        ],
      };

      mocks.mockKakaoLocalClient.searchAddress.mockResolvedValue(mockResponse);

      const response = await request(app.getHttpServer())
        .get('/user/address/search')
        .query({ query: '서울특별시 강남구 역삼동' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('meta');
      expect(response.body).toHaveProperty('addresses');
      expect(response.body.addresses).toHaveLength(1);
      expect(response.body.addresses[0]).toMatchObject({
        address: '서울특별시 강남구 역삼동',
        roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
      });

      // Verify mock was called
      expect(mocks.mockKakaoLocalClient.searchAddress).toHaveBeenCalledWith(
        '서울특별시 강남구 역삼동',
      );
    });

    it('should fail with missing query parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/address/search')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail without authorization token', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/address/search')
        .query({ query: '서울' })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('PATCH /user/address', () => {
    it('should update single address successfully', async () => {
      const updateDto = {
        selectedAddress: {
          address: '서울특별시 강남구 역삼동',
          roadAddress: TEST_COORDINATES.OTHER.ROAD_ADDRESS,
          postalCode: TEST_COORDINATES.OTHER.POSTAL_CODE,
          latitude: String(TEST_COORDINATES.OTHER.LATITUDE),
          longitude: String(TEST_COORDINATES.OTHER.LONGITUDE),
        },
      };

      const response = await request(app.getHttpServer())
        .patch('/user/address')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body).toMatchObject({
        roadAddress: TEST_COORDINATES.OTHER.ROAD_ADDRESS,
        postalCode: TEST_COORDINATES.OTHER.POSTAL_CODE,
        latitude: TEST_COORDINATES.OTHER.LATITUDE_NUM,
        longitude: TEST_COORDINATES.OTHER.LONGITUDE_NUM,
        isSearchAddress: true, // Default behavior
      });
    });

    it('should fail with missing required fields', async () => {
      const response = await request(app.getHttpServer())
        .patch('/user/address')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('PATCH /user', () => {
    it('should update user name successfully', async () => {
      const updateDto = {
        name: 'Updated Name',
      };

      const response = await request(app.getHttpServer())
        .patch('/user')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.name).toBe('Updated Name');

      // Verify in database
      const updated = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated Name');
    });

    it('should fail with empty name', async () => {
      const updateDto = {
        name: '',
      };

      const response = await request(app.getHttpServer())
        .patch('/user')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateDto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail without authorization token', async () => {
      const updateDto = {
        name: 'New Name',
      };

      const response = await request(app.getHttpServer())
        .patch('/user')
        .send(updateDto)
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('DELETE /user/me', () => {
    it('should delete user account successfully (soft delete)', async () => {
      const response = await request(app.getHttpServer())
        .delete('/user/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.messageCode).toBe('USER_WITHDRAWAL_COMPLETED');

      // Verify user was soft deleted
      const deletedUser = await userRepository.findOne({
        where: { id: testUser.id },
        withDeleted: true,
      });
      expect(deletedUser).not.toBeNull();
      expect(deletedUser!.deletedAt).not.toBeNull();

      // Verify user cannot login after deletion
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'Password123!',
        })
        .expect(401);
    });

    it('should fail without authorization token', async () => {
      const response = await request(app.getHttpServer())
        .delete('/user/me')
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('Concurrent Operations (Optimistic Locking)', () => {
    it('should handle concurrent preference updates', async () => {
      // First, ensure the user has been created and authenticated
      // The test uses existing accessToken and testUser from the parent scope

      // Perform two concurrent preference updates
      const update1 = request(app.getHttpServer())
        .post('/user/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ likes: ['한식'], dislikes: ['양식'] });

      const update2 = request(app.getHttpServer())
        .post('/user/preferences')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ likes: ['중식'], dislikes: ['일식'] });

      const results = await Promise.allSettled([update1, update2]);

      // At least one should succeed
      const successCount = results.filter(
        (r) =>
          r.status === 'fulfilled' &&
          (r.value.status === 200 || r.value.status === 201),
      ).length;

      expect(successCount).toBeGreaterThanOrEqual(1);
    });

    it('should handle concurrent address creation', async () => {
      const addressData1 = {
        selectedAddress: {
          address: '서울특별시 강남구 역삼동',
          roadAddress: '서울특별시 강남구 테헤란로 100',
          postalCode: '06100',
          latitude: '37.5001',
          longitude: '127.0301',
        },
        alias: '동시성테스트1',
      };

      const addressData2 = {
        selectedAddress: {
          address: '서울특별시 강남구 역삼동',
          roadAddress: '서울특별시 강남구 테헤란로 200',
          postalCode: '06200',
          latitude: '37.5002',
          longitude: '127.0302',
        },
        alias: '동시성테스트2',
      };

      const [result1, result2] = await Promise.all([
        request(app.getHttpServer())
          .post('/user/addresses')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(addressData1),
        request(app.getHttpServer())
          .post('/user/addresses')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(addressData2),
      ]);

      // Both should succeed (no conflict for different addresses)
      expect(result1.status).toBe(201);
      expect(result2.status).toBe(201);
    });
  });
});
