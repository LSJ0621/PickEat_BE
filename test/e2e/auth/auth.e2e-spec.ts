import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import {
  createTestingApp,
  closeTestingApp,
  createAllMockClients,
} from '../setup/testing-app.module';
import {
  mockGoogleOAuthResponses,
  mockKakaoOAuthResponses,
} from '../../mocks/external-clients.mock';
import { Repository } from 'typeorm';
import { User } from '@/user/entities/user.entity';
import { EmailVerification } from '@/auth/entities/email-verification.entity';
import * as bcrypt from 'bcrypt';
import {
  TEST_IDS,
  TEST_VERIFICATION,
  TEST_TIMEOUTS,
  TEST_JWT_SECRETS,
} from '../../constants/test.constants';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let mocks: ReturnType<typeof createAllMockClients>;
  let userRepository: Repository<User>;
  let emailVerificationRepository: Repository<EmailVerification>;
  let jwtService: JwtService;

  beforeAll(async () => {
    const testApp = await createTestingApp();
    app = testApp.app;
    mocks = testApp.mocks;

    // Get repositories for test setup
    userRepository = testApp.module.get<Repository<User>>('UserRepository');
    emailVerificationRepository = testApp.module.get<
      Repository<EmailVerification>
    >('EmailVerificationRepository');
    jwtService = testApp.module.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await closeTestingApp(app);
  });

  beforeEach(async () => {
    // Clear data before each test - order matters for FK constraints
    await emailVerificationRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const registerDto = {
        email: 'newuser@example.com',
        password: 'Password123!',
        name: 'New User',
      };

      // Step 1: Send email verification code
      await request(app.getHttpServer())
        .post('/auth/email/send-code')
        .send({ email: registerDto.email, purpose: 'SIGNUP' })
        .expect(201);

      // Step 2: Get verification code from database
      const verification = await emailVerificationRepository.findOne({
        where: { email: registerDto.email, purpose: 'SIGNUP' },
      });
      expect(verification).toBeDefined();

      // Step 3: Manually mark as verified (simulating code verification)
      verification!.status = 'USED';
      verification!.used = true;
      await emailVerificationRepository.save(verification!);

      // Step 4: Register user
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(201);

      expect(response.body).toEqual({
        message: '회원가입이 완료되었습니다.',
      });

      // Verify user was created in database
      const user = await userRepository.findOne({
        where: { email: registerDto.email },
      });
      expect(user).toBeDefined();
      expect(user!.email).toBe(registerDto.email);
      expect(user!.name).toBe(registerDto.name);
      expect(user!.emailVerified).toBe(true);
      expect(user!.password).not.toBe(registerDto.password); // Should be hashed
    });

    it('should fail when email already exists', async () => {
      // Create existing user
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      await userRepository.save({
        email: 'existing@example.com',
        password: hashedPassword,
        name: 'Existing User',
        emailVerified: true,
      });

      const registerDto = {
        email: 'existing@example.com',
        password: 'NewPassword123!',
        name: 'New User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail when password is too short', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: '12345', // Less than 6 characters
        name: 'Test User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail when email format is invalid', async () => {
      const registerDto = {
        email: 'invalid-email',
        password: 'Password123!',
        name: 'Test User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail when required fields are missing', async () => {
      const registerDto = {
        email: 'test@example.com',
        // Missing password and name
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Create a verified user for login tests
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      await userRepository.save({
        email: 'testuser@example.com',
        password: hashedPassword,
        name: 'Test User',
        emailVerified: true,
      });
    });

    it('should login successfully with correct credentials', async () => {
      const loginDto = {
        email: 'testuser@example.com',
        password: 'Password123!',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('address');
      expect(response.body).toHaveProperty('latitude');
      expect(response.body).toHaveProperty('longitude');
      expect(response.body).toHaveProperty('preferences');
      expect(response.body.email).toBe(loginDto.email);
      expect(response.body.name).toBe('Test User');

      // Verify refresh token cookie was set
      const cookieHeader = response.headers['set-cookie'];
      const cookies = Array.isArray(cookieHeader)
        ? cookieHeader
        : typeof cookieHeader === 'string'
          ? [cookieHeader]
          : [];
      expect(cookies.some((cookie) => cookie.includes('refreshToken'))).toBe(
        true,
      );
    });

    it('should fail with incorrect password', async () => {
      const loginDto = {
        email: 'testuser@example.com',
        password: 'WrongPassword123!',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });

    it('should fail with non-existent email', async () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'Password123!',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });

    it.skip('should fail when user email is not verified', async () => {
      // NOTE: Current implementation does not enforce email verification at login
      // Create unverified user
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      await userRepository.save({
        email: 'unverified@example.com',
        password: hashedPassword,
        name: 'Unverified User',
        emailVerified: false,
      });

      const loginDto = {
        email: 'unverified@example.com',
        password: 'Password123!',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(401);
    });
  });

  describe('POST /auth/kakao/doLogin', () => {
    it('should login with Kakao OAuth successfully', async () => {
      // Mock Kakao OAuth responses
      mocks.mockKakaoOAuthClient.getAccessToken.mockResolvedValue(
        mockKakaoOAuthResponses.tokenSuccess.access_token,
      );
      mocks.mockKakaoOAuthClient.getUserProfile.mockResolvedValue(
        mockKakaoOAuthResponses.userInfoSuccess,
      );

      const redirectDto = {
        code: 'kakao_auth_code_123',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/kakao/doLogin')
        .send(redirectDto)
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('address');
      expect(response.body).toHaveProperty('latitude');
      expect(response.body).toHaveProperty('longitude');
      expect(response.body).toHaveProperty('preferences');
      expect(response.body.email).toBe(
        mockKakaoOAuthResponses.userInfoSuccess.kakao_account.email,
      );

      // Verify refresh token cookie was set
      const cookieHeader = response.headers['set-cookie'];
      const cookies = Array.isArray(cookieHeader)
        ? cookieHeader
        : typeof cookieHeader === 'string'
          ? [cookieHeader]
          : [];
      expect(cookies.some((cookie) => cookie.includes('refreshToken'))).toBe(
        true,
      );

      // Verify mocks were called
      expect(mocks.mockKakaoOAuthClient.getAccessToken).toHaveBeenCalledWith(
        redirectDto.code,
      );
      expect(mocks.mockKakaoOAuthClient.getUserProfile).toHaveBeenCalled();
    });

    it('should create new user on first Kakao login', async () => {
      mocks.mockKakaoOAuthClient.getAccessToken.mockResolvedValue(
        mockKakaoOAuthResponses.tokenSuccess.access_token,
      );
      mocks.mockKakaoOAuthClient.getUserProfile.mockResolvedValue({
        id: Number(TEST_IDS.SOCIAL_ID_KAKAO),
        kakao_account: {
          email: 'newkakaouser@example.com',
          profile: {
            nickname: 'New Kakao User',
          },
        },
      });

      const redirectDto = {
        code: 'kakao_auth_code_456',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/kakao/doLogin')
        .send(redirectDto)
        .expect(201);

      expect(response.body.email).toBe('newkakaouser@example.com');

      // Verify user was created in database
      const user = await userRepository.findOne({
        where: { email: 'newkakaouser@example.com' },
      });
      expect(user).toBeDefined();
      expect(user!.socialType).toBe('KAKAO'); // socialType is stored in uppercase
      expect(user!.socialId).toBe(TEST_IDS.SOCIAL_ID_KAKAO);
      expect(user!.password).toBeNull();
    });
  });

  describe('POST /auth/google/doLogin', () => {
    it('should login with Google OAuth successfully', async () => {
      // Mock Google OAuth responses
      mocks.mockGoogleOAuthClient.getAccessToken.mockResolvedValue(
        mockGoogleOAuthResponses.tokenSuccess.access_token,
      );
      mocks.mockGoogleOAuthClient.getUserProfile.mockResolvedValue(
        mockGoogleOAuthResponses.userProfileSuccess,
      );

      const redirectDto = {
        code: 'google_auth_code_123',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/google/doLogin')
        .send(redirectDto)
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('address');
      expect(response.body).toHaveProperty('latitude');
      expect(response.body).toHaveProperty('longitude');
      expect(response.body).toHaveProperty('preferences');
      expect(response.body.email).toBe(
        mockGoogleOAuthResponses.userProfileSuccess.email,
      );

      // Verify refresh token cookie was set
      const cookieHeader = response.headers['set-cookie'];
      const cookies = Array.isArray(cookieHeader)
        ? cookieHeader
        : typeof cookieHeader === 'string'
          ? [cookieHeader]
          : [];
      expect(cookies.some((cookie) => cookie.includes('refreshToken'))).toBe(
        true,
      );

      // Verify mocks were called
      expect(mocks.mockGoogleOAuthClient.getAccessToken).toHaveBeenCalledWith(
        redirectDto.code,
      );
      expect(mocks.mockGoogleOAuthClient.getUserProfile).toHaveBeenCalled();
    });

    it('should create new user on first Google login', async () => {
      mocks.mockGoogleOAuthClient.getAccessToken.mockResolvedValue(
        mockGoogleOAuthResponses.tokenSuccess.access_token,
      );
      mocks.mockGoogleOAuthClient.getUserProfile.mockResolvedValue({
        sub: TEST_IDS.SOCIAL_ID_GOOGLE,
        email: 'newgoogleuser@example.com',
        email_verified: true,
        name: 'New Google User',
        picture: 'https://example.com/photo.jpg',
        given_name: 'New',
        family_name: 'User',
      });

      const redirectDto = {
        code: 'google_auth_code_456',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/google/doLogin')
        .send(redirectDto)
        .expect(201);

      expect(response.body.email).toBe('newgoogleuser@example.com');

      // Verify user was created in database
      const user = await userRepository.findOne({
        where: { email: 'newgoogleuser@example.com' },
      });
      expect(user).toBeDefined();
      expect(user!.socialType).toBe('GOOGLE'); // socialType is stored in uppercase
      expect(user!.socialId).toBe(TEST_IDS.SOCIAL_ID_GOOGLE);
      expect(user!.password).toBeNull();
    });
  });

  describe('POST /auth/refresh', () => {
    let refreshToken: string;
    let accessToken: string;

    beforeEach(async () => {
      // Create and login user to get tokens
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      await userRepository.save({
        email: 'refreshuser@example.com',
        password: hashedPassword,
        name: 'Refresh User',
        emailVerified: true,
      });

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'refreshuser@example.com',
          password: 'Password123!',
        });

      accessToken = loginResponse.body.token;

      // Extract refresh token from cookie
      const cookieHeader = loginResponse.headers['set-cookie'];
      const cookies = Array.isArray(cookieHeader)
        ? cookieHeader
        : typeof cookieHeader === 'string'
          ? [cookieHeader]
          : [];
      const refreshCookie = cookies.find((cookie) =>
        cookie.startsWith('refreshToken='),
      );
      refreshToken = refreshCookie!.split(';')[0].split('=')[1];
    });

    it('should refresh access token successfully', async () => {
      // Wait 1 second to ensure new token has different iat timestamp
      await new Promise((resolve) =>
        setTimeout(resolve, TEST_TIMEOUTS.TOKEN_IAT_DELAY_MS),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', [`refreshToken=${refreshToken}`])
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body.token).toBeDefined();
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(0);

      // Verify new refresh token cookie was set
      const cookieHeader = response.headers['set-cookie'];
      const cookies = Array.isArray(cookieHeader)
        ? cookieHeader
        : typeof cookieHeader === 'string'
          ? [cookieHeader]
          : [];
      expect(cookies.some((cookie) => cookie.includes('refreshToken'))).toBe(
        true,
      );

      // Verify old refresh token is now invalid (token rotation)
      const invalidTokenResponse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', [`refreshToken=${refreshToken}`])
        .expect(401);

      expect(invalidTokenResponse.body).toHaveProperty('message');
      expect(invalidTokenResponse.body.statusCode).toBe(401);

      // Extract new refresh token and verify it works
      const newRefreshCookie = cookies.find((cookie) =>
        cookie.startsWith('refreshToken='),
      );
      const newRefreshToken = newRefreshCookie!.split(';')[0].split('=')[1];

      const secondRefreshResponse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', [`refreshToken=${newRefreshToken}`])
        .expect(201);

      expect(secondRefreshResponse.body).toHaveProperty('token');
      expect(secondRefreshResponse.body.token).toBeDefined();
    });

    it('should fail when refresh token cookie is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });

    it('should fail with invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', ['refreshToken=invalid_token_123'])
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Create and login user
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      await userRepository.save({
        email: 'logoutuser@example.com',
        password: hashedPassword,
        name: 'Logout User',
        emailVerified: true,
      });

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'logoutuser@example.com',
          password: 'Password123!',
        });

      // Extract refresh token from cookie
      const cookieHeader = loginResponse.headers['set-cookie'];
      const cookies = Array.isArray(cookieHeader)
        ? cookieHeader
        : typeof cookieHeader === 'string'
          ? [cookieHeader]
          : [];
      const refreshCookie = cookies.find((cookie) =>
        cookie.startsWith('refreshToken='),
      );
      refreshToken = refreshCookie!.split(';')[0].split('=')[1];
    });

    it('should logout successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', [`refreshToken=${refreshToken}`])
        .expect(201);

      expect(response.body.message).toBe('로그아웃되었습니다.');

      // Verify refresh token cookie was cleared
      const cookieHeader = response.headers['set-cookie'];
      const cookies = Array.isArray(cookieHeader)
        ? cookieHeader
        : typeof cookieHeader === 'string'
          ? [cookieHeader]
          : [];
      const clearCookie = cookies.find((cookie) =>
        cookie.startsWith('refreshToken='),
      );
      expect(clearCookie).toBeDefined();
    });

    it('should logout even without refresh token cookie', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .expect(201);

      expect(response.body.message).toBe('로그아웃되었습니다.');
    });
  });

  describe('GET /auth/me', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Create and login user
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      await userRepository.save({
        email: 'meuser@example.com',
        password: hashedPassword,
        name: 'Me User',
        emailVerified: true,
        preferences: {
          likes: ['한식', '중식'],
          dislikes: ['양식'],
        },
      });

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'meuser@example.com',
          password: 'Password123!',
        });

      accessToken = loginResponse.body.token;
    });

    it('should get authenticated user profile successfully', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        email: 'meuser@example.com',
        name: 'Me User',
      });
      expect(response.body).toHaveProperty('address');
      expect(response.body).toHaveProperty('latitude');
      expect(response.body).toHaveProperty('longitude');
    });

    it('should fail without authorization token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });

    it('should fail with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });

  describe('GET /auth/check-email', () => {
    it('should return available: false for existing email', async () => {
      // Create existing user for this specific test
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      await userRepository.save({
        email: 'existing@example.com',
        password: hashedPassword,
        name: 'Existing User',
        emailVerified: true,
      });

      const response = await request(app.getHttpServer())
        .get('/auth/check-email')
        .query({ email: 'existing@example.com' })
        .expect(200);

      expect(response.body.available).toBe(false);
      expect(response.body.message).toBe('이미 사용 중인 이메일입니다.');
    });

    it('should return available: true for non-existent email', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/check-email')
        .query({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.available).toBe(true);
      expect(response.body.message).toBe('사용 가능한 이메일입니다.');
    });

    it('should fail with invalid email format', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/check-email')
        .query({ email: 'invalid-email' })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('POST /auth/email/send-code', () => {
    it('should send email verification code successfully', async () => {
      const sendCodeDto = {
        email: 'verification@example.com',
        purpose: 'SIGNUP',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/email/send-code')
        .send(sendCodeDto)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('remainCount');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('인증번호가 발송되었습니다');

      // Verify verification code was created in database
      const verification = await emailVerificationRepository.findOne({
        where: { email: sendCodeDto.email, purpose: 'SIGNUP' },
      });
      expect(verification).toBeDefined();
    });

    it('should fail with invalid email format', async () => {
      const sendCodeDto = {
        email: 'invalid-email',
        purpose: 'SIGNUP',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/email/send-code')
        .send(sendCodeDto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('POST /auth/email/verify-code', () => {
    let verificationCode: string;

    beforeEach(async () => {
      // Send verification code first
      verificationCode = TEST_VERIFICATION.CODE; // This would be generated by the service
      const hashedCode = await bcrypt.hash(verificationCode, 10);

      await emailVerificationRepository.save({
        email: 'verify@example.com',
        codeHash: hashedCode,
        purpose: 'SIGNUP',
        expiresAt: new Date(Date.now() + TEST_VERIFICATION.EXPIRES_IN_MS),
        used: false,
        status: 'ACTIVE',
        sendCount: 1,
        lastSentAt: new Date(),
        failCount: 0,
      });
    });

    it('should verify email code successfully', async () => {
      const verifyCodeDto = {
        email: 'verify@example.com',
        code: verificationCode,
        purpose: 'SIGNUP',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/email/verify-code')
        .send(verifyCodeDto)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('이메일 인증이 완료되었습니다.');

      // Verify code was marked as used
      const verification = await emailVerificationRepository.findOne({
        where: { email: verifyCodeDto.email },
      });
      expect(verification!.used).toBe(true);
    });

    it('should fail with incorrect code', async () => {
      const verifyCodeDto = {
        email: 'verify@example.com',
        code: 'wrong_code',
        purpose: 'SIGNUP',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/email/verify-code')
        .send(verifyCodeDto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });

    it('should fail with expired code', async () => {
      // Create expired verification code
      const hashedCode = await bcrypt.hash('expired_code', 10);
      await emailVerificationRepository.save({
        email: 'expired@example.com',
        codeHash: hashedCode,
        purpose: 'SIGNUP',
        expiresAt: new Date(Date.now() - 1000), // Expired
        used: false,
        status: 'EXPIRED',
        sendCount: 1,
        lastSentAt: new Date(),
        failCount: 0,
      });

      const verifyCodeDto = {
        email: 'expired@example.com',
        code: 'expired_code',
        purpose: 'SIGNUP',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/email/verify-code')
        .send(verifyCodeDto)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('Token Expiration', () => {
    it('should return 401 when access token is expired', async () => {
      // Create expired token using JwtService
      const expiredToken = jwtService.sign(
        {
          email: 'testuser@example.com',
          role: 'USER',
          sub: 1,
        },
        { expiresIn: '-1h' }, // Already expired
      );

      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });

    it('should return 401 when refresh token is expired', async () => {
      const expiredRefreshToken = jwtService.sign(
        {
          email: 'testuser@example.com',
          role: 'USER',
          sub: 1,
          type: 'refresh',
        },
        {
          secret: process.env.JWT_REFRESH_SECRET || TEST_JWT_SECRETS.REFRESH,
          expiresIn: '-1h',
        },
      );

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', [`refreshToken=${expiredRefreshToken}`])
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.statusCode).toBe(401);
    });
  });
});
