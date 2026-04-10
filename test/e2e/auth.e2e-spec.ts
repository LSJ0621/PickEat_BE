import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { DataSource } from 'typeorm';
import {
  createE2EApp,
  closeE2EApp,
  truncateAllTables,
  createAuthenticatedUser,
  type TestUser,
} from './setup';
import { TEST_TIMEOUTS, TEST_VERIFICATION } from '../constants/test.constants';
import { User } from '@/user/entities/user.entity';
import { ErrorCode } from '@/common/constants/error-codes';
import { MessageCode } from '@/common/constants/message-codes';
import { RedisCacheService } from '@/common/cache/cache.service';

describe('Auth (e2e)', () => {
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

  async function sendEmailCode(email: string, purpose = 'SIGNUP') {
    return api().post('/auth/email/send-code').send({ email, purpose });
  }

  async function verifyEmailCode(
    email: string,
    code: string = TEST_VERIFICATION.CODE,
    purpose = 'SIGNUP',
  ) {
    return api().post('/auth/email/verify-code').send({ email, code, purpose });
  }

  async function setupVerifiedEmail(email: string, purpose = 'SIGNUP') {
    await sendEmailCode(email, purpose);
    await verifyEmailCode(email, TEST_VERIFICATION.CODE, purpose);
  }

  async function registerUser(email: string, password = 'ValidPass1!') {
    await setupVerifiedEmail(email, 'SIGNUP');
    return api().post('/auth/register').send({
      email,
      password,
      name: '테스트유저',
      birthDate: '1990-01-01',
      gender: 'male',
    });
  }

  async function loginUser(email: string, password = 'ValidPass1!') {
    return api().post('/auth/login').send({ email, password });
  }

  // =====================
  // 회원가입 (POST /auth/register)
  // =====================
  describe('POST /auth/register', () => {
    const email = 'register@test.example.com';
    const validPayload = {
      email,
      password: 'ValidPass1!',
      name: '테스트유저',
      birthDate: '1990-01-01',
      gender: 'male' as const,
    };

    it('should return 201 with messageCode when all fields are valid', async () => {
      await setupVerifiedEmail(email);

      const res = await api().post('/auth/register').send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('messageCode');
    });

    it('should return 400 with message when email is missing', async () => {
      const { email: _e, ...withoutEmail } = validPayload;

      const res = await api().post('/auth/register').send(withoutEmail);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 400 when password is shorter than 8 characters', async () => {
      await setupVerifiedEmail(email);

      const res = await api()
        .post('/auth/register')
        .send({ ...validPayload, password: 'Short1!' });

      expect(res.status).toBe(400);
    });

    it('should return 400 with AUTH_EMAIL_ALREADY_EXISTS when email is already registered', async () => {
      await registerUser(email);

      const res = await api().post('/auth/register').send(validPayload);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe(ErrorCode.AUTH_EMAIL_ALREADY_EXISTS);
    });

    it('should return 400 with AUTH_EMAIL_NOT_VERIFIED when email is not verified', async () => {
      const res = await api().post('/auth/register').send(validPayload);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe(ErrorCode.AUTH_EMAIL_NOT_VERIFIED);
    });

    it('should not include password field in registration response', async () => {
      await setupVerifiedEmail(email);

      const res = await api().post('/auth/register').send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body).not.toHaveProperty('password');
    });
  });

  // =====================
  // 로그인 (POST /auth/login)
  // =====================
  describe('POST /auth/login', () => {
    const email = 'login@test.example.com';
    const password = 'ValidPass1!';

    it('should return 201 with token when credentials are valid', async () => {
      await registerUser(email, password);

      const res = await loginUser(email, password);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(typeof res.body.token).toBe('string');
    });

    it('should return 401 when password is incorrect', async () => {
      await registerUser(email, password);

      const res = await loginUser(email, 'WrongPassword1!');

      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    });

    it('should return 401 when email does not exist', async () => {
      const res = await loginUser('nonexistent@test.example.com', password);

      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    });

    it('should return 401 when user is soft-deleted', async () => {
      await registerUser(email, password);
      await app.get(DataSource).getRepository(User).softDelete({ email });

      const res = await loginUser(email, password);

      expect(res.status).toBe(401);
    });

    it('should return 401 when user account is deactivated', async () => {
      await registerUser(email, password);
      await app
        .get(DataSource)
        .getRepository(User)
        .update({ email }, { isDeactivated: true });

      const res = await loginUser(email, password);

      expect(res.status).toBe(401);
    });

    it('should not include password field in login response', async () => {
      await registerUser(email, password);

      const res = await loginUser(email, password);

      expect(res.status).toBe(201);
      expect(res.body).not.toHaveProperty('password');
    });
  });

  // =====================
  // 이메일 중복 확인 (GET /auth/check-email)
  // =====================
  describe('GET /auth/check-email', () => {
    it('should return available: true for an unused email', async () => {
      const res = await api()
        .get('/auth/check-email')
        .query({ email: 'available@test.example.com' });

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
    });

    it('should return available: false for an already registered email', async () => {
      const email = 'taken@test.example.com';
      await registerUser(email);

      const res = await api().get('/auth/check-email').query({ email });

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
    });

    it('should return 400 when the value is not a valid email format', async () => {
      const res = await api()
        .get('/auth/check-email')
        .query({ email: 'not-an-email' });

      expect(res.status).toBe(400);
    });
  });

  // =====================
  // 이메일 인증
  // =====================
  describe('이메일 인증', () => {
    describe('POST /auth/email/send-code', () => {
      it('should return 201 with success when sending code for SIGNUP purpose', async () => {
        const res = await sendEmailCode('sendcode@test.example.com', 'SIGNUP');

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.messageCode).toBe(MessageCode.AUTH_VERIFICATION_CODE_SENT);
      });

      it('should return 201 with success when sending code for RE_REGISTER purpose', async () => {
        const res = await sendEmailCode('reregister@test.example.com', 'RE_REGISTER');

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
      });
    });

    describe('POST /auth/email/verify-code', () => {
      it('should return 201 with messageCode when code is correct', async () => {
        const email = 'verify@test.example.com';
        await sendEmailCode(email, 'SIGNUP');

        const res = await verifyEmailCode(email, TEST_VERIFICATION.CODE, 'SIGNUP');

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.messageCode).toBe(MessageCode.AUTH_EMAIL_VERIFICATION_COMPLETED);
      });

      it('should return 400 when verification code is wrong', async () => {
        const email = 'wrongcode@test.example.com';
        await sendEmailCode(email, 'SIGNUP');

        const res = await verifyEmailCode(email, '000000', 'SIGNUP');

        expect(res.status).toBe(400);
      });

      it('should return 400 with AUTH_NO_REREGISTER_ACCOUNT when verifying RE_REGISTER for non-existent deleted user', async () => {
        const email = 'noreregister@test.example.com';
        await sendEmailCode(email, 'RE_REGISTER');

        const res = await verifyEmailCode(email, TEST_VERIFICATION.CODE, 'RE_REGISTER');

        expect(res.status).toBe(400);
        expect(res.body.errorCode).toBe(ErrorCode.AUTH_NO_REREGISTER_ACCOUNT);
      });
    });
  });

  // =====================
  // 토큰 관리
  // =====================
  describe('토큰 관리', () => {
    describe('POST /auth/refresh', () => {
      it('should return new access token when refresh token is valid in Redis (Token Rotation)', async () => {
        const testUser: TestUser = await createAuthenticatedUser(app);

        const res = await api()
          .post('/auth/refresh')
          .set('Authorization', `Bearer ${testUser.accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(typeof res.body.token).toBe('string');
        expect(res.body.token).not.toBe(testUser.accessToken);
      });

      it('should return 401 with AUTH_MISSING_ACCESS_TOKEN when Authorization header is absent', async () => {
        const res = await api().post('/auth/refresh');

        expect(res.status).toBe(401);
        expect(res.body.errorCode).toBe(ErrorCode.AUTH_MISSING_ACCESS_TOKEN);
      });

      it('should return 401 with AUTH_INVALID_REFRESH_TOKEN when access token has invalid signature', async () => {
        const res = await api()
          .post('/auth/refresh')
          .set('Authorization', 'Bearer invalid.jwt.token');

        expect(res.status).toBe(401);
        expect(res.body.errorCode).toBe(ErrorCode.AUTH_INVALID_REFRESH_TOKEN);
      });

      it('should return 401 with AUTH_INVALID_REFRESH_TOKEN when no refresh token exists in Redis', async () => {
        const testUser: TestUser = await createAuthenticatedUser(app);
        await app.get(RedisCacheService).deleteRefreshToken(testUser.user.id);

        const res = await api()
          .post('/auth/refresh')
          .set('Authorization', `Bearer ${testUser.accessToken}`);

        expect(res.status).toBe(401);
        expect(res.body.errorCode).toBe(ErrorCode.AUTH_INVALID_REFRESH_TOKEN);
      });

      it('should return 401 and delete Redis entry when stored refresh token is expired or invalid', async () => {
        const testUser: TestUser = await createAuthenticatedUser(app);
        const cacheService = app.get(RedisCacheService);
        await cacheService.setRefreshToken(testUser.user.id, 'expired.or.invalid.jwt');

        const res = await api()
          .post('/auth/refresh')
          .set('Authorization', `Bearer ${testUser.accessToken}`);

        expect(res.status).toBe(401);
        expect(res.body.errorCode).toBe(ErrorCode.AUTH_INVALID_REFRESH_TOKEN);
        expect(await cacheService.getRefreshToken(testUser.user.id)).toBeNull();
      });

      it('should return 401 and delete Redis entry when user is soft-deleted', async () => {
        const testUser: TestUser = await createAuthenticatedUser(app);
        await app.get(DataSource).getRepository(User).softDelete({ id: testUser.user.id });

        const res = await api()
          .post('/auth/refresh')
          .set('Authorization', `Bearer ${testUser.accessToken}`);

        expect(res.status).toBe(401);
        expect(res.body.errorCode).toBe(ErrorCode.AUTH_INVALID_REFRESH_TOKEN);
        expect(await app.get(RedisCacheService).getRefreshToken(testUser.user.id)).toBeNull();
      });

      it('should return 403 with AUTH_ACCOUNT_DEACTIVATED and delete Redis entry when user is deactivated', async () => {
        const testUser: TestUser = await createAuthenticatedUser(app);
        await app
          .get(DataSource)
          .getRepository(User)
          .update({ id: testUser.user.id }, { isDeactivated: true });

        const res = await api()
          .post('/auth/refresh')
          .set('Authorization', `Bearer ${testUser.accessToken}`);

        expect(res.status).toBe(403);
        expect(res.body.errorCode).toBe(ErrorCode.AUTH_ACCOUNT_DEACTIVATED);
        expect(await app.get(RedisCacheService).getRefreshToken(testUser.user.id)).toBeNull();
      });
    });

    describe('POST /auth/logout', () => {
      it('should return 200 with messageCode and remove refresh token from Redis', async () => {
        const testUser: TestUser = await createAuthenticatedUser(app);

        const res = await api()
          .post('/auth/logout')
          .set('Authorization', `Bearer ${testUser.accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body.messageCode).toBe(MessageCode.AUTH_LOGOUT_COMPLETED);
        expect(await app.get(RedisCacheService).getRefreshToken(testUser.user.id)).toBeNull();
      });

      it('should return 401 when no Authorization header is provided on logout', async () => {
        const res = await api().post('/auth/logout');

        expect(res.status).toBe(401);
      });
    });

    describe('GET /auth/me', () => {
      it('should return user profile without password when authenticated', async () => {
        const testUser: TestUser = await createAuthenticatedUser(app);

        const res = await api()
          .get('/auth/me')
          .set('Authorization', `Bearer ${testUser.accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('email', testUser.user.email);
        expect(res.body).not.toHaveProperty('password');
      });

      it('should return 401 when no Authorization header is provided', async () => {
        const res = await api().get('/auth/me');

        expect(res.status).toBe(401);
      });
    });
  });

  // =====================
  // 비밀번호 재설정
  // =====================
  describe('비밀번호 재설정', () => {
    const email = 'pwreset@test.example.com';
    const password = 'ValidPass1!';

    it('should return 201 when sending reset code for a registered email', async () => {
      await registerUser(email, password);

      const res = await api()
        .post('/auth/password/reset/send-code')
        .send({ email });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 201 when verifying a valid password reset code', async () => {
      await registerUser(email, password);
      await api().post('/auth/password/reset/send-code').send({ email });

      const res = await api()
        .post('/auth/password/reset/verify-code')
        .send({ email, code: TEST_VERIFICATION.CODE });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 201 and allow login with new password after complete reset flow', async () => {
      await registerUser(email, password);
      await api().post('/auth/password/reset/send-code').send({ email });
      await api()
        .post('/auth/password/reset/verify-code')
        .send({ email, code: TEST_VERIFICATION.CODE });

      const newPassword = 'NewValidPass2!';
      const res = await api()
        .post('/auth/password/reset')
        .send({ email, newPassword });

      expect(res.status).toBe(201);
      expect(res.body.messageCode).toBe(MessageCode.AUTH_PASSWORD_RESET_COMPLETED);
      const loginRes = await loginUser(email, newPassword);
      expect(loginRes.status).toBe(201);
    });

    it('should return 400 with AUTH_EMAIL_NOT_REGISTERED when email does not exist', async () => {
      const res = await api()
        .post('/auth/password/reset/send-code')
        .send({ email: 'notexist@test.example.com' });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe(ErrorCode.AUTH_EMAIL_NOT_REGISTERED);
    });
  });

  // =====================
  // OAuth
  // =====================
  describe('OAuth', () => {
    describe('POST /auth/kakao/doLogin', () => {
      it('should return 201 with token when Kakao web login succeeds with authorization code', async () => {
        const res = await api()
          .post('/auth/kakao/doLogin')
          .send({ code: 'test-valid-code' });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('token');
      });

      it('should auto-register new social user and return token on first Kakao login', async () => {
        const res = await api()
          .post('/auth/kakao/doLogin')
          .send({ code: 'test-valid-code' });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('token');
        const createdUser = await app
          .get(DataSource)
          .getRepository(User)
          .findOne({ where: { socialId: '123456789' } });
        expect(createdUser).not.toBeNull();
      });

      it('should return error with AUTH_RE_REGISTER_REQUIRED when Kakao social user is soft-deleted', async () => {
        const userRepo = app.get(DataSource).getRepository(User);
        const deletedUser = userRepo.create({
          email: 'oauth-kakao@test-oauth.example.com',
          socialId: '123456789',
          socialType: 'kakao',
          password: null,
          name: '탈퇴유저',
          role: 'USER',
          emailVerified: false,
          preferredLanguage: 'ko',
        });
        const saved = await userRepo.save(deletedUser);
        await userRepo.softDelete({ id: saved.id });

        const res = await api()
          .post('/auth/kakao/doLogin')
          .send({ code: 'test-valid-code' });

        expect(res.status).toBe(400);
        expect(res.body.errorCode).toBe(ErrorCode.AUTH_RE_REGISTER_REQUIRED);
      });
    });

    describe('POST /auth/kakao/appLogin', () => {
      it('should return 201 with token when Kakao app login succeeds with accessToken', async () => {
        const res = await api()
          .post('/auth/kakao/appLogin')
          .send({ accessToken: 'test-kakao-valid-token' });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('token');
      });
    });

    describe('POST /auth/google/doLogin', () => {
      it('should return 201 with token when Google OAuth login succeeds', async () => {
        const res = await api()
          .post('/auth/google/doLogin')
          .send({ code: 'test-valid-code' });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('token');
      });
    });
  });

  // =====================
  // 재가입
  // =====================
  describe('재가입', () => {
    describe('POST /auth/re-register', () => {
      it('should return 201 with messageCode when email user re-registers after withdrawal', async () => {
        const email = 'reregister-email@test.example.com';
        const password = 'ValidPass1!';

        await registerUser(email, password);
        await app.get(DataSource).getRepository(User).softDelete({ email });
        await setupVerifiedEmail(email, 'RE_REGISTER');

        const res = await api().post('/auth/re-register').send({
          email,
          password: 'NewValidPass1!',
          name: '재가입유저',
        });

        expect(res.status).toBe(201);
        expect(res.body.messageCode).toBe(MessageCode.AUTH_RE_REGISTRATION_COMPLETED);
      });
    });

    describe('POST /auth/re-register/social', () => {
      it('should return 201 with messageCode when social user re-registers after withdrawal', async () => {
        const email = 'reregister-social@test-oauth.example.com';
        const userRepo = app.get(DataSource).getRepository(User);

        const socialUser = userRepo.create({
          email,
          socialId: 'kakao-reregister-test-999',
          socialType: 'kakao',
          password: null,
          name: '탈퇴소셜유저',
          role: 'USER',
          emailVerified: false,
          preferredLanguage: 'ko',
        });
        const saved = await userRepo.save(socialUser);
        await userRepo.softDelete({ id: saved.id });

        const res = await api()
          .post('/auth/re-register/social')
          .send({ email });

        expect(res.status).toBe(201);
        expect(res.body.messageCode).toBe(MessageCode.AUTH_RE_REGISTRATION_COMPLETED);
      });
    });
  });
});
