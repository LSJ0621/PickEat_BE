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

    it('모든 필드가 유효하면 201 + messageCode를 반환한다', async () => {
      await setupVerifiedEmail(email);

      const res = await api().post('/auth/register').send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('messageCode');
    });

    it('이메일 누락 시 400 에러를 반환한다', async () => {
      const { email: _e, ...withoutEmail } = validPayload;

      const res = await api().post('/auth/register').send(withoutEmail);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('message');
    });

    it('비밀번호가 8자 미만이면 400 에러를 반환한다', async () => {
      await setupVerifiedEmail(email);

      const res = await api()
        .post('/auth/register')
        .send({ ...validPayload, password: 'Short1!' });

      expect(res.status).toBe(400);
    });

    it('이미 등록된 이메일이면 400 + AUTH_EMAIL_ALREADY_EXISTS를 반환한다', async () => {
      await registerUser(email);

      const res = await api().post('/auth/register').send(validPayload);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe(ErrorCode.AUTH_EMAIL_ALREADY_EXISTS);
    });

    it('이메일 미인증 시 400 + AUTH_EMAIL_NOT_VERIFIED를 반환한다', async () => {
      const res = await api().post('/auth/register').send(validPayload);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe(ErrorCode.AUTH_EMAIL_NOT_VERIFIED);
    });

    it('회원가입 응답에 password가 포함되지 않는다', async () => {
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

    it('유효한 자격증명이면 201 + token을 반환한다', async () => {
      await registerUser(email, password);

      const res = await loginUser(email, password);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(typeof res.body.token).toBe('string');
    });

    it('비밀번호가 틀리면 401 에러를 반환한다', async () => {
      await registerUser(email, password);

      const res = await loginUser(email, 'WrongPassword1!');

      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    });

    it('존재하지 않는 이메일이면 401 에러를 반환한다', async () => {
      const res = await loginUser('nonexistent@test.example.com', password);

      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    });

    it('소프트 삭제된 사용자이면 401 에러를 반환한다', async () => {
      await registerUser(email, password);
      await app.get(DataSource).getRepository(User).softDelete({ email });

      const res = await loginUser(email, password);

      expect(res.status).toBe(401);
    });

    it('비활성화된 계정이면 401 에러를 반환한다', async () => {
      await registerUser(email, password);
      await app
        .get(DataSource)
        .getRepository(User)
        .update({ email }, { isDeactivated: true });

      const res = await loginUser(email, password);

      expect(res.status).toBe(401);
    });

    it('로그인 응답에 password가 포함되지 않는다', async () => {
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
    it('미사용 이메일이면 available: true를 반환한다', async () => {
      const res = await api()
        .get('/auth/check-email')
        .query({ email: 'available@test.example.com' });

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
    });

    it('이미 등록된 이메일이면 available: false를 반환한다', async () => {
      const email = 'taken@test.example.com';
      await registerUser(email);

      const res = await api().get('/auth/check-email').query({ email });

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
    });

    it('유효하지 않은 이메일 형식이면 400 에러를 반환한다', async () => {
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
      it('SIGNUP 목적으로 코드 전송 시 201 + success를 반환한다', async () => {
        const res = await sendEmailCode('sendcode@test.example.com', 'SIGNUP');

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.messageCode).toBe(MessageCode.AUTH_VERIFICATION_CODE_SENT);
      });

      it('RE_REGISTER 목적으로 코드 전송 시 201 + success를 반환한다', async () => {
        const res = await sendEmailCode('reregister@test.example.com', 'RE_REGISTER');

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
      });
    });

    describe('POST /auth/email/verify-code', () => {
      it('올바른 코드이면 201 + messageCode를 반환한다', async () => {
        const email = 'verify@test.example.com';
        await sendEmailCode(email, 'SIGNUP');

        const res = await verifyEmailCode(email, TEST_VERIFICATION.CODE, 'SIGNUP');

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.messageCode).toBe(MessageCode.AUTH_EMAIL_VERIFICATION_COMPLETED);
      });

      it('인증 코드가 틀리면 400 에러를 반환한다', async () => {
        const email = 'wrongcode@test.example.com';
        await sendEmailCode(email, 'SIGNUP');

        const res = await verifyEmailCode(email, '000000', 'SIGNUP');

        expect(res.status).toBe(400);
      });

      it('삭제된 사용자가 없는 상태에서 RE_REGISTER 인증 시 400 + AUTH_NO_REREGISTER_ACCOUNT를 반환한다', async () => {
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
      it('Redis에 유효한 리프레시 토큰이 있으면 새 액세스 토큰을 반환한다 (Token Rotation)', async () => {
        const testUser: TestUser = await createAuthenticatedUser(app);

        const res = await api()
          .post('/auth/refresh')
          .set('Authorization', `Bearer ${testUser.accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(typeof res.body.token).toBe('string');
        expect(res.body.token).not.toBe(testUser.accessToken);
      });

      it('Authorization 헤더 없이 요청하면 401 + AUTH_MISSING_ACCESS_TOKEN을 반환한다', async () => {
        const res = await api().post('/auth/refresh');

        expect(res.status).toBe(401);
        expect(res.body.errorCode).toBe(ErrorCode.AUTH_MISSING_ACCESS_TOKEN);
      });

      it('잘못된 서명의 토큰이면 401 + AUTH_INVALID_REFRESH_TOKEN을 반환한다', async () => {
        const res = await api()
          .post('/auth/refresh')
          .set('Authorization', 'Bearer invalid.jwt.token');

        expect(res.status).toBe(401);
        expect(res.body.errorCode).toBe(ErrorCode.AUTH_INVALID_REFRESH_TOKEN);
      });

      it('Redis에 리프레시 토큰이 없으면 401 + AUTH_INVALID_REFRESH_TOKEN을 반환한다', async () => {
        const testUser: TestUser = await createAuthenticatedUser(app);
        await app.get(RedisCacheService).deleteRefreshToken(testUser.user.id);

        const res = await api()
          .post('/auth/refresh')
          .set('Authorization', `Bearer ${testUser.accessToken}`);

        expect(res.status).toBe(401);
        expect(res.body.errorCode).toBe(ErrorCode.AUTH_INVALID_REFRESH_TOKEN);
      });

      it('저장된 리프레시 토큰이 만료/무효이면 401을 반환하고 Redis 항목을 삭제한다', async () => {
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

      it('소프트 삭제된 사용자이면 401을 반환하고 Redis 항목을 삭제한다', async () => {
        const testUser: TestUser = await createAuthenticatedUser(app);
        await app.get(DataSource).getRepository(User).softDelete({ id: testUser.user.id });

        const res = await api()
          .post('/auth/refresh')
          .set('Authorization', `Bearer ${testUser.accessToken}`);

        expect(res.status).toBe(401);
        expect(res.body.errorCode).toBe(ErrorCode.AUTH_INVALID_REFRESH_TOKEN);
        expect(await app.get(RedisCacheService).getRefreshToken(testUser.user.id)).toBeNull();
      });

      it('비활성화된 사용자이면 403 + AUTH_ACCOUNT_DEACTIVATED를 반환하고 Redis 항목을 삭제한다', async () => {
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
      it('로그아웃 시 200 + messageCode를 반환하고 Redis 리프레시 토큰을 제거한다', async () => {
        const testUser: TestUser = await createAuthenticatedUser(app);

        const res = await api()
          .post('/auth/logout')
          .set('Authorization', `Bearer ${testUser.accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body.messageCode).toBe(MessageCode.AUTH_LOGOUT_COMPLETED);
        expect(await app.get(RedisCacheService).getRefreshToken(testUser.user.id)).toBeNull();
      });

      it('인증 없이 로그아웃 요청하면 401 에러를 반환한다', async () => {
        const res = await api().post('/auth/logout');

        expect(res.status).toBe(401);
      });
    });

    describe('GET /auth/me', () => {
      it('인증된 사용자가 요청하면 password 없는 프로필을 반환한다', async () => {
        const testUser: TestUser = await createAuthenticatedUser(app);

        const res = await api()
          .get('/auth/me')
          .set('Authorization', `Bearer ${testUser.accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('email', testUser.user.email);
        expect(res.body).not.toHaveProperty('password');
      });

      it('인증 없이 요청하면 401 에러를 반환한다', async () => {
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

    it('등록된 이메일로 재설정 코드 전송 시 201을 반환한다', async () => {
      await registerUser(email, password);

      const res = await api()
        .post('/auth/password/reset/send-code')
        .send({ email });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('유효한 비밀번호 재설정 코드 인증 시 201을 반환한다', async () => {
      await registerUser(email, password);
      await api().post('/auth/password/reset/send-code').send({ email });

      const res = await api()
        .post('/auth/password/reset/verify-code')
        .send({ email, code: TEST_VERIFICATION.CODE });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('비밀번호 재설정 완료 후 새 비밀번호로 로그인할 수 있다', async () => {
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

    it('미등록 이메일이면 400 + AUTH_EMAIL_NOT_REGISTERED를 반환한다', async () => {
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
      it('카카오 웹 로그인 인가 코드가 유효하면 201 + token을 반환한다', async () => {
        const res = await api()
          .post('/auth/kakao/doLogin')
          .send({ code: 'test-valid-code' });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('token');
      });

      it('최초 카카오 로그인 시 자동 회원가입 후 token을 반환한다', async () => {
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

      it('소프트 삭제된 카카오 사용자이면 AUTH_RE_REGISTER_REQUIRED 에러를 반환한다', async () => {
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
      it('카카오 앱 로그인 accessToken이 유효하면 201 + token을 반환한다', async () => {
        const res = await api()
          .post('/auth/kakao/appLogin')
          .send({ accessToken: 'test-kakao-valid-token' });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('token');
      });
    });

    describe('POST /auth/google/doLogin', () => {
      it('Google OAuth 로그인 성공 시 201 + token을 반환한다', async () => {
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
      it('탈퇴한 이메일 사용자가 재가입하면 201 + messageCode를 반환한다', async () => {
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
      it('탈퇴한 소셜 사용자가 재가입하면 201 + messageCode를 반환한다', async () => {
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
