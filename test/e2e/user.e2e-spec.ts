import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { DataSource } from 'typeorm';
import {
  createE2EApp,
  closeE2EApp,
  truncateAllTables,
  createAuthenticatedUser,
  authenticatedRequest,
  type TestUser,
} from './setup';
import { TEST_TIMEOUTS } from '../constants/test.constants';
import { User } from '@/user/entities/user.entity';
import { MessageCode } from '@/common/constants/message-codes';

describe('User (e2e)', () => {
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
  // 프로필 수정 (PATCH /user)
  // =====================
  describe('PATCH /user', () => {
    it('should return 200 with updated fields when name, birthDate, gender are valid', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.patch('/user').send({
        name: '새이름',
        birthDate: '1995-06-15',
        gender: 'female',
      });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('새이름');
      expect(res.body.birthDate).toBe('1995-06-15');
      expect(res.body.gender).toBe('female');
    });

    it('should return 400 when name exceeds 100 characters', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.patch('/user').send({
        name: 'a'.repeat(101),
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when birthDate format is not YYYY-MM-DD', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.patch('/user').send({
        birthDate: '19950615',
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when gender has an invalid value', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.patch('/user').send({
        gender: 'unknown',
      });

      expect(res.status).toBe(400);
    });

    it('should return 401 when request is made without authentication', async () => {
      const res = await api().patch('/user').send({ name: '테스트' });

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 회원 탈퇴 (DELETE /user/me)
  // =====================
  describe('DELETE /user/me', () => {
    it('should return 200 with messageCode and soft-delete the user record', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.delete('/user/me');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('messageCode', MessageCode.USER_WITHDRAWAL_COMPLETED);

      const userRepo = app.get(DataSource).getRepository(User);
      const deletedUser = await userRepo.findOne({
        where: { id: testUser.user.id },
        withDeleted: true,
      });
      expect(deletedUser).not.toBeNull();
      expect(deletedUser?.deletedAt).not.toBeNull();
    });

    it('should return 401 when the deleted user attempts to log in', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      await req.delete('/user/me');

      const loginRes = await api().post('/auth/login').send({
        email: testUser.user.email,
        password: 'TestPassword1!',
      });

      expect(loginRes.status).toBe(401);
    });

    it('should return 401 when using the same token after withdrawal', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      await req.delete('/user/me');

      // 탈퇴 후 동일 accessToken으로 API 호출 시 Guard 레벨에서 차단되어야 함
      const res = await req.patch('/user').send({ name: '탈퇴 후 수정 시도' });
      expect(res.status).toBe(401);
    });

    it('should return 401 when request is made without authentication', async () => {
      const res = await api().delete('/user/me');

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 선호도 관리 (GET /user/preferences, POST /user/preferences)
  // =====================
  describe('GET /user/preferences', () => {
    it('should return 200 with likes and dislikes arrays', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.get('/user/preferences');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('likes');
      expect(res.body).toHaveProperty('dislikes');
      expect(Array.isArray(res.body.likes)).toBe(true);
      expect(Array.isArray(res.body.dislikes)).toBe(true);
    });

    it('should return 401 when request is made without authentication', async () => {
      const res = await api().get('/user/preferences');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /user/preferences', () => {
    it('should return 200 when likes and dislikes are updated', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/user/preferences').send({
        likes: ['한식', '국물류'],
        dislikes: ['인스턴트'],
      });

      expect(res.status).toBe(200);
    });

    it('should return 400 when likes array exceeds 50 items', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const tooManyLikes = Array.from({ length: 51 }, (_, i) => `항목${i}`);

      const res = await req.post('/user/preferences').send({
        likes: tooManyLikes,
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when any item in likes exceeds 50 characters', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/user/preferences').send({
        likes: ['a'.repeat(51)],
      });

      expect(res.status).toBe(400);
    });

    it('should return 401 when request is made without authentication', async () => {
      const res = await api().post('/user/preferences').send({
        likes: ['한식'],
      });

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 언어 설정 (PATCH /user/language)
  // =====================
  describe('PATCH /user/language', () => {
    it('should return 200 with messageCode when language is changed from ko to en', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.patch('/user/language').send({ language: 'en' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('messageCode', MessageCode.USER_LANGUAGE_CHANGED);
    });

    it('should return 400 when an unsupported language value is provided', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.patch('/user/language').send({ language: 'fr' });

      expect(res.status).toBe(400);
    });

    it('should return 401 when request is made without authentication', async () => {
      const res = await api().patch('/user/language').send({ language: 'en' });

      expect(res.status).toBe(401);
    });
  });
});
