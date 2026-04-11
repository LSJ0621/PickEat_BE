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
    it('name, birthDate, gender가 유효하면 200 + 수정된 필드를 반환한다', async () => {
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

    it('name이 100자를 초과하면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.patch('/user').send({
        name: 'a'.repeat(101),
      });

      expect(res.status).toBe(400);
    });

    it('birthDate 형식이 YYYY-MM-DD가 아니면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.patch('/user').send({
        birthDate: '19950615',
      });

      expect(res.status).toBe(400);
    });

    it('gender 값이 유효하지 않으면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.patch('/user').send({
        gender: 'unknown',
      });

      expect(res.status).toBe(400);
    });

    it('인증 없이 요청하면 401 에러를 반환한다', async () => {
      const res = await api().patch('/user').send({ name: '테스트' });

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 회원 탈퇴 (DELETE /user/me)
  // =====================
  describe('DELETE /user/me', () => {
    it('200 + messageCode를 반환하고 사용자를 소프트 삭제한다', async () => {
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

    it('삭제된 사용자가 로그인을 시도하면 401 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      await req.delete('/user/me');

      const loginRes = await api().post('/auth/login').send({
        email: testUser.user.email,
        password: 'TestPassword1!',
      });

      expect(loginRes.status).toBe(401);
    });

    it('탈퇴 후 동일 토큰으로 요청하면 401 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      await req.delete('/user/me');

      // 탈퇴 후 동일 accessToken으로 API 호출 시 차단되어야 함 (401 또는 404)
      const res = await req.patch('/user').send({ name: '탈퇴 후 수정 시도' });
      expect([401, 404]).toContain(res.status);
    });

    it('인증 없이 요청하면 401 에러를 반환한다', async () => {
      const res = await api().delete('/user/me');

      expect(res.status).toBe(401);
    });
  });

  // =====================
  // 선호도 관리 (GET /user/preferences, POST /user/preferences)
  // =====================
  describe('GET /user/preferences', () => {
    it('200 + likes와 dislikes 배열을 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.get('/user/preferences');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('preferences');
      expect(res.body.preferences).toHaveProperty('likes');
      expect(res.body.preferences).toHaveProperty('dislikes');
      expect(Array.isArray(res.body.preferences.likes)).toBe(true);
      expect(Array.isArray(res.body.preferences.dislikes)).toBe(true);
    });

    it('인증 없이 요청하면 401 에러를 반환한다', async () => {
      const res = await api().get('/user/preferences');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /user/preferences', () => {
    it('likes와 dislikes를 수정하면 200을 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/user/preferences').send({
        likes: ['한식', '국물류'],
        dislikes: ['인스턴트'],
      });

      expect(res.status).toBe(200);
    });

    it('likes 배열이 50개를 초과하면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const tooManyLikes = Array.from({ length: 51 }, (_, i) => `항목${i}`);

      const res = await req.post('/user/preferences').send({
        likes: tooManyLikes,
      });

      expect(res.status).toBe(400);
    });

    it('likes 항목이 50자를 초과하면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.post('/user/preferences').send({
        likes: ['a'.repeat(51)],
      });

      expect(res.status).toBe(400);
    });

    it('인증 없이 요청하면 401 에러를 반환한다', async () => {
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
    it('ko에서 en으로 언어 변경 시 200 + messageCode를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.patch('/user/language').send({ language: 'en' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('messageCode', MessageCode.USER_LANGUAGE_CHANGED);
    });

    it('지원하지 않는 언어 값이면 400 에러를 반환한다', async () => {
      const testUser: TestUser = await createAuthenticatedUser(app);
      const req = authenticatedRequest(app, testUser.accessToken);

      const res = await req.patch('/user/language').send({ language: 'fr' });

      expect(res.status).toBe(400);
    });

    it('인증 없이 요청하면 401 에러를 반환한다', async () => {
      const res = await api().patch('/user/language').send({ language: 'en' });

      expect(res.status).toBe(401);
    });
  });
});
