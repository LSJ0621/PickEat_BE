import { TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { MailerService } from '@nestjs-modules/mailer';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

// Modules
import { AuthModule } from '@/auth/auth.module';
import { UserModule } from '@/user/user.module';

// Services
import { AuthService } from '@/auth/auth.service';
import { UserService } from '@/user/user.service';
import { EmailVerificationService } from '@/auth/services/email-verification.service';
import { AuthTokenService } from '@/auth/services/auth-token.service';

// Entities
import { User } from '@/user/entities/user.entity';
import { EmailVerification } from '@/auth/entities/email-verification.entity';

// Enums
import { SocialType } from '@/user/enum/social-type.enum';

// DTOs
import { EmailPurpose } from '@/auth/dto/send-email-code.dto';

// Test setup
import { createIntegrationTestingModule } from '../../e2e/setup/testing-app.module';
import {
  mockGoogleOAuthResponses,
  mockKakaoOAuthResponses,
} from '../../mocks/external-clients.mock';

// External clients
import { GoogleOAuthClient } from '@/external/google/clients/google-oauth.client';
import { KakaoOAuthClient } from '@/external/kakao/clients/kakao-oauth.client';

/**
 * Auth Flow Integration Tests
 *
 * Tests the complete authentication flows with real service integration:
 * - Registration flow with email verification
 * - Login flow with token issuance
 * - Token refresh flow
 * - Social login flows (Kakao, Google)
 * - Password reset flow
 *
 * External APIs are mocked, but all internal services communicate normally.
 */
describe('Auth Flow Integration', () => {
  let module: TestingModule;
  let authService: AuthService;
  let userService: UserService;
  let emailVerificationService: EmailVerificationService;
  let authTokenService: AuthTokenService;
  let jwtService: JwtService;
  let userRepository: Repository<User>;
  let emailVerificationRepository: Repository<EmailVerification>;

  // Mocks
  let mockMailerService: jest.Mocked<MailerService>;
  let mockGoogleOAuthClient: jest.Mocked<GoogleOAuthClient>;
  let mockKakaoOAuthClient: jest.Mocked<KakaoOAuthClient>;

  beforeAll(async () => {
    // Create testing module using the helper
    module = await createIntegrationTestingModule([AuthModule, UserModule]);

    // Get service instances
    authService = module.get<AuthService>(AuthService);
    userService = module.get<UserService>(UserService);
    emailVerificationService = module.get<EmailVerificationService>(
      EmailVerificationService,
    );
    authTokenService = module.get<AuthTokenService>(AuthTokenService);
    jwtService = module.get<JwtService>(JwtService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    emailVerificationRepository = module.get<Repository<EmailVerification>>(
      getRepositoryToken(EmailVerification),
    );

    // Get mocked clients
    mockGoogleOAuthClient =
      module.get<jest.Mocked<GoogleOAuthClient>>(GoogleOAuthClient);
    mockKakaoOAuthClient =
      module.get<jest.Mocked<KakaoOAuthClient>>(KakaoOAuthClient);

    // Override MailerService
    mockMailerService = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Replace MailerService in the module
    const emailVerificationServicePrivate = emailVerificationService as any;
    emailVerificationServicePrivate.mailerService = mockMailerService;
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  beforeEach(async () => {
    // Clean up database before each test - FK dependency order (child tables first)
    await userRepository.manager.query('DELETE FROM "user_address"');
    await userRepository.manager.query('DELETE FROM "bug_report"');
    await userRepository.manager.query('DELETE FROM "email_verifications"');
    await userRepository.manager.query('DELETE FROM "user"');
    jest.clearAllMocks();
  });

  /**
   * Helper function to hash tokens using SHA-256 (same as AuthTokenService)
   * This is required because the service uses SHA-256 pre-hashing before bcrypt
   */
  function hashTokenForStorage(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  describe('Registration Flow', () => {
    const testEmail = 'newuser@example.com';
    const testPassword = 'TestPassword123!';
    const testName = 'New User';

    it('should complete full registration flow with email verification', async () => {
      // Step 1: Send verification code
      const sendResult = await emailVerificationService.sendCode(
        testEmail,
        EmailPurpose.SIGNUP,
      );

      expect(sendResult).toMatchObject({
        remainCount: expect.any(Number),
        message: expect.stringContaining('인증번호가 발송되었습니다'),
      });
      expect(mockMailerService.sendMail).toHaveBeenCalledTimes(1);
      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: testEmail,
          subject: '[PickEat] 이메일 인증 코드',
          template: 'email-verification',
        }),
      );

      // Extract the verification code from the email context
      const emailContext = mockMailerService.sendMail.mock.calls[0][0].context;
      expect(emailContext).toBeDefined();
      const verificationCode = emailContext!.verificationCode;
      expect(verificationCode).toMatch(/^\d{6}$/);

      // Step 2: Verify the code
      const verifyResult = await emailVerificationService.verifyCode(
        testEmail,
        verificationCode,
        EmailPurpose.SIGNUP,
      );

      expect(verifyResult).toBe(true);

      // Verify email verification record is marked as USED
      const verification = await emailVerificationRepository.findOne({
        where: { email: testEmail, purpose: EmailPurpose.SIGNUP },
      });
      expect(verification?.status).toBe('USED');
      expect(verification?.used).toBe(true);

      // Step 3: Register user
      const registerResult = await authService.register({
        email: testEmail,
        password: testPassword,
        name: testName,
      });

      expect(registerResult).toEqual({
        message: '회원가입이 완료되었습니다.',
      });

      // Step 4: Verify user exists in database
      const user = await userRepository.findOne({
        where: { email: testEmail },
      });

      expect(user).toBeDefined();
      expect(user?.email).toBe(testEmail);
      expect(user?.name).toBe(testName);
      expect(user?.role).toBe('USER');
      expect(user?.emailVerified).toBe(true);
      expect(user?.password).toBeDefined();

      // Verify password is hashed
      const isPasswordValid = await bcrypt.compare(
        testPassword,
        user!.password!,
      );
      expect(isPasswordValid).toBe(true);
    });

    it('should reject registration without email verification', async () => {
      await expect(
        authService.register({
          email: testEmail,
          password: testPassword,
          name: testName,
        }),
      ).rejects.toThrow();
    });

    it('should reject duplicate email registration', async () => {
      // Create existing user
      await userService.createUser({
        email: testEmail,
        password: await bcrypt.hash(testPassword, 10),
        role: 'USER',
        name: testName,
      });

      // Attempt to check email availability
      await expect(authService.checkEmail(testEmail)).resolves.toEqual({
        available: false,
        message: '이미 사용 중인 이메일입니다.',
      });
    });

    it('should handle verification code expiration', async () => {
      // Send verification code
      await emailVerificationService.sendCode(testEmail, EmailPurpose.SIGNUP);

      // Manually expire the verification record
      const verification = await emailVerificationRepository.findOne({
        where: { email: testEmail, purpose: EmailPurpose.SIGNUP },
      });
      verification!.expiresAt = new Date(Date.now() - 1000); // Expired 1 second ago
      await emailVerificationRepository.save(verification!);

      // Extract code from email
      const emailContext = mockMailerService.sendMail.mock.calls[0][0].context;
      expect(emailContext).toBeDefined();
      const verificationCode = emailContext!.verificationCode;

      // Attempt to verify expired code
      await expect(
        emailVerificationService.verifyCode(
          testEmail,
          verificationCode,
          EmailPurpose.SIGNUP,
        ),
      ).rejects.toThrow('코드가 만료되었습니다');
    });

    it('should reject invalid verification code', async () => {
      // Send verification code
      await emailVerificationService.sendCode(testEmail, EmailPurpose.SIGNUP);

      // Attempt to verify with wrong code
      await expect(
        emailVerificationService.verifyCode(
          testEmail,
          '000000',
          EmailPurpose.SIGNUP,
        ),
      ).rejects.toThrow('코드가 유효하지 않습니다');
    });
  });

  describe('Login Flow', () => {
    const testEmail = 'loginuser@example.com';
    const testPassword = 'LoginPassword123!';
    let hashedPassword: string;

    // Helper function to create test user for login flow
    async function createLoginUser() {
      hashedPassword = await bcrypt.hash(testPassword, 10);
      await userService.createUser({
        email: testEmail,
        password: hashedPassword,
        role: 'USER',
        name: 'Login User',
      });
      await userService.markEmailVerified(testEmail);
    }

    it('should complete login flow and issue tokens', async () => {
      // Setup: Create test user
      await createLoginUser();
      // Step 1: Login
      const loginResult = await authService.login({
        email: testEmail,
        password: testPassword,
      });

      expect(loginResult).toMatchObject({
        email: testEmail,
        token: expect.any(String),
        refreshToken: expect.any(String),
        name: 'Login User',
      });

      // Step 2: Verify JWT token
      const decodedToken = jwtService.decode(loginResult.token);
      expect(decodedToken).toMatchObject({
        email: testEmail,
        role: 'USER',
      });

      // Step 3: Verify refresh token is stored in database
      const user = await userRepository
        .createQueryBuilder('user')
        .where('user.email = :email', { email: testEmail })
        .getOne();
      expect(user?.refreshToken).toBeDefined();

      // Verify refresh token is hashed (with SHA-256 pre-hashing)
      const isRefreshTokenValid = await bcrypt.compare(
        hashTokenForStorage(loginResult.refreshToken),
        user!.refreshToken!,
      );
      expect(isRefreshTokenValid).toBe(true);
    });

    it('should reject login with invalid credentials', async () => {
      // Setup: Create test user
      await createLoginUser();

      await expect(
        authService.login({
          email: testEmail,
          password: 'WrongPassword123!',
        }),
      ).rejects.toThrow('이메일 또는 비밀번호가 올바르지 않습니다.');
    });

    it('should reject login for non-existent user', async () => {
      // No setup needed - testing non-existent user
      await expect(
        authService.login({
          email: 'nonexistent@example.com',
          password: testPassword,
        }),
      ).rejects.toThrow('이메일 또는 비밀번호가 올바르지 않습니다.');
    });

    it('should refresh access token successfully', async () => {
      // Setup: Create test user
      await createLoginUser();

      // Login to get initial tokens
      const loginResult = await authService.login({
        email: testEmail,
        password: testPassword,
      });

      // Wait 1 second to ensure new token has different iat timestamp
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Step 1: Refresh access token
      const refreshResult = await authTokenService.refreshAccessToken(
        loginResult.refreshToken,
      );

      expect(refreshResult).toMatchObject({
        token: expect.any(String),
        refreshToken: expect.any(String),
      });

      // Step 2: Verify new tokens are different
      expect(refreshResult.token).not.toBe(loginResult.token);
      expect(refreshResult.refreshToken).not.toBe(loginResult.refreshToken);

      // Step 3: Verify new token is valid
      const decodedNewToken = jwtService.decode(refreshResult.token);
      expect(decodedNewToken).toMatchObject({
        email: testEmail,
        role: 'USER',
      });

      // Step 4: Verify old refresh token is now invalid (token rotation)
      // Wait a moment to ensure DB commit is fully processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(
        authTokenService.refreshAccessToken(loginResult.refreshToken),
      ).rejects.toThrow('유효하지 않은 refresh token입니다.');

      // Step 5: Verify new refresh token works
      const secondRefreshResult = await authTokenService.refreshAccessToken(
        refreshResult.refreshToken,
      );
      expect(secondRefreshResult).toMatchObject({
        token: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('should reject invalid refresh token', async () => {
      // No setup needed - testing invalid token
      await expect(
        authTokenService.refreshAccessToken('invalid-token'),
      ).rejects.toThrow('유효하지 않은 refresh token입니다.');
    });

    it('should logout and invalidate refresh token', async () => {
      // Setup: Create test user
      await createLoginUser();

      // Login
      const loginResult = await authService.login({
        email: testEmail,
        password: testPassword,
      });

      // Logout
      await authService.logout(loginResult.refreshToken);

      // Verify refresh token is removed from database
      const user = await userRepository
        .createQueryBuilder('user')
        .where('user.email = :email', { email: testEmail })
        .getOne();
      expect(user?.refreshToken).toBeNull();

      // Attempt to refresh with old token should fail
      await expect(
        authTokenService.refreshAccessToken(loginResult.refreshToken),
      ).rejects.toThrow('유효하지 않은 refresh token입니다.');
    });
  });

  describe('Social Login Flow - Google', () => {
    const googleCode = 'test-google-auth-code';
    const googleEmail = 'test@gmail.com';
    const googleSocialId = mockGoogleOAuthResponses.userProfileSuccess.sub;

    // Helper function to setup Google OAuth mocks
    function setupGoogleOAuthMocks() {
      mockGoogleOAuthClient.getAccessToken.mockResolvedValue(
        mockGoogleOAuthResponses.tokenSuccess,
      );
      mockGoogleOAuthClient.getUserProfile.mockResolvedValue(
        mockGoogleOAuthResponses.userProfileSuccess,
      );
    }

    it('should complete Google login flow for new user', async () => {
      // Setup: Mock Google OAuth responses
      setupGoogleOAuthMocks();
      // Step 1: Google login
      const loginResult = await authService.googleLogin(googleCode);

      expect(loginResult).toMatchObject({
        email: googleEmail,
        token: expect.any(String),
        refreshToken: expect.any(String),
      });

      // Step 2: Verify user was created with social credentials
      const user = await userRepository.findOne({
        where: { email: googleEmail },
      });

      expect(user).toBeDefined();
      expect(user?.socialId).toBe(googleSocialId);
      expect(user?.socialType).toBe('GOOGLE');
      expect(user?.password).toBeNull();

      // Step 3: Verify token contains correct user info
      const decodedToken = jwtService.decode(loginResult.token);
      expect(decodedToken).toMatchObject({
        email: googleEmail,
        role: 'USER',
      });
    });

    it('should login existing Google user', async () => {
      // Setup: Mock Google OAuth responses
      setupGoogleOAuthMocks();

      // Create existing Google user
      await userService.createOauth(
        googleSocialId,
        googleEmail,
        SocialType.GOOGLE,
        'Test User',
      );

      // Login with Google
      const loginResult = await authService.googleLogin(googleCode);

      expect(loginResult).toMatchObject({
        email: googleEmail,
        token: expect.any(String),
        refreshToken: expect.any(String),
      });

      // Verify only one user exists
      const users = await userRepository
        .createQueryBuilder('user')
        .where('user.email = :email', { email: googleEmail })
        .getMany();
      expect(users).toHaveLength(1);
    });

    it('should reject Google login when email conflicts with regular account', async () => {
      // Setup: Mock Google OAuth responses
      setupGoogleOAuthMocks();

      // Create regular account with same email
      await userService.createUser({
        email: googleEmail,
        password: await bcrypt.hash('password123', 10),
        role: 'USER',
        name: 'Regular User',
      });

      // Attempt Google login
      await expect(authService.googleLogin(googleCode)).rejects.toThrow(
        '이미 일반 회원가입으로 가입한 이메일입니다.',
      );
    });
  });

  describe('Social Login Flow - Kakao', () => {
    const kakaoCode = 'test-kakao-auth-code';
    const kakaoEmail = 'test@kakao.com';
    const kakaoSocialId = String(mockKakaoOAuthResponses.userInfoSuccess.id);

    // Helper function to setup Kakao OAuth mocks
    function setupKakaoOAuthMocks() {
      mockKakaoOAuthClient.getAccessToken.mockResolvedValue(
        mockKakaoOAuthResponses.tokenSuccess,
      );
      mockKakaoOAuthClient.getUserProfile.mockResolvedValue(
        mockKakaoOAuthResponses.userInfoSuccess,
      );
    }

    it('should complete Kakao login flow for new user', async () => {
      // Setup: Mock Kakao OAuth responses
      setupKakaoOAuthMocks();
      // Step 1: Kakao login
      const loginResult = await authService.kakaoLogin(kakaoCode);

      expect(loginResult).toMatchObject({
        email: kakaoEmail,
        token: expect.any(String),
        refreshToken: expect.any(String),
      });

      // Step 2: Verify user was created with Kakao credentials
      const user = await userRepository.findOne({
        where: { email: kakaoEmail },
      });

      expect(user).toBeDefined();
      expect(user?.socialId).toBe(kakaoSocialId);
      expect(user?.socialType).toBe('KAKAO');
      expect(user?.password).toBeNull();
    });

    it('should login existing Kakao user', async () => {
      // Setup: Mock Kakao OAuth responses
      setupKakaoOAuthMocks();

      // Create existing Kakao user
      await userService.createOauth(
        kakaoSocialId,
        kakaoEmail,
        SocialType.KAKAO,
      );

      // Login with Kakao
      const loginResult = await authService.kakaoLogin(kakaoCode);

      expect(loginResult).toMatchObject({
        email: kakaoEmail,
        token: expect.any(String),
        refreshToken: expect.any(String),
      });

      // Verify only one user exists
      const users = await userRepository
        .createQueryBuilder('user')
        .where('user.email = :email', { email: kakaoEmail })
        .getMany();
      expect(users).toHaveLength(1);
    });

    it('should reject Kakao login when email conflicts with regular account', async () => {
      // Setup: Mock Kakao OAuth responses
      setupKakaoOAuthMocks();

      // Create regular account with same email
      await userService.createUser({
        email: kakaoEmail,
        password: await bcrypt.hash('password123', 10),
        role: 'USER',
        name: 'Regular User',
      });

      // Attempt Kakao login
      await expect(authService.kakaoLogin(kakaoCode)).rejects.toThrow(
        '이미 일반 회원가입으로 가입한 이메일입니다.',
      );
    });
  });

  describe('Password Reset Flow', () => {
    const testEmail = 'resetuser@example.com';
    const oldPassword = 'OldPassword123!';
    const newPassword = 'NewPassword456!';

    // Helper function to create user for password reset tests
    async function createResetUser() {
      await userService.createUser({
        email: testEmail,
        password: await bcrypt.hash(oldPassword, 10),
        role: 'USER',
        name: 'Reset User',
      });
      await userService.markEmailVerified(testEmail);
    }

    it('should complete password reset flow', async () => {
      // Setup: Create test user
      await createResetUser();
      // Step 1: Send reset password code
      const sendResult = await authService.sendResetPasswordCode(testEmail);

      expect(sendResult).toMatchObject({
        remainCount: expect.any(Number),
        message: expect.stringContaining('인증번호가 발송되었습니다'),
      });
      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: testEmail,
          subject: '[PickEat] 비밀번호 재설정 인증 코드',
        }),
      );

      // Extract verification code
      const emailContext = mockMailerService.sendMail.mock.calls[0][0].context;
      expect(emailContext).toBeDefined();
      const verificationCode = emailContext!.verificationCode;

      // Step 2: Verify reset password code
      await authService.verifyResetPasswordCode(testEmail, verificationCode);

      // Verify email verification status
      const isVerified = await emailVerificationService.isEmailVerified(
        testEmail,
        EmailPurpose.RESET_PASSWORD,
      );
      expect(isVerified).toBe(true);

      // Step 3: Reset password
      await authService.resetPassword({
        email: testEmail,
        newPassword: newPassword,
      });

      // Step 4: Verify password was changed
      const user = await userRepository.findOne({
        where: { email: testEmail },
      });

      const isNewPasswordValid = await bcrypt.compare(
        newPassword,
        user!.password!,
      );
      expect(isNewPasswordValid).toBe(true);

      // Step 5: Verify old password no longer works
      const isOldPasswordValid = await bcrypt.compare(
        oldPassword,
        user!.password!,
      );
      expect(isOldPasswordValid).toBe(false);

      // Step 6: Login with new password should work
      const loginResult = await authService.login({
        email: testEmail,
        password: newPassword,
      });

      expect(loginResult).toMatchObject({
        email: testEmail,
        token: expect.any(String),
      });
    });

    it('should reject password reset for social login account', async () => {
      // Setup: Create social login user
      const socialEmail = 'social@example.com';
      await userService.createOauth('kakao_123', socialEmail, SocialType.KAKAO);

      await expect(
        authService.sendResetPasswordCode(socialEmail),
      ).rejects.toThrow('소셜 로그인으로 가입한 계정입니다.');
    });

    it('should reject password reset without verification', async () => {
      // Setup: Create test user
      await createResetUser();
      await expect(
        authService.resetPassword({
          email: testEmail,
          newPassword: newPassword,
        }),
      ).rejects.toThrow('이메일 인증이 완료되지 않았습니다.');
    });

    it('should reject password reset for non-existent user', async () => {
      // No setup needed - testing non-existent user
      await expect(
        authService.sendResetPasswordCode('nonexistent@example.com'),
      ).rejects.toThrow('등록되지 않은 이메일입니다.');
    });
  });

  describe('User Profile Retrieval', () => {
    const testEmail = 'profileuser@example.com';

    // Helper function to create user for profile tests
    async function createProfileUser() {
      await userService.createUser({
        email: testEmail,
        password: await bcrypt.hash('password123', 10),
        role: 'USER',
        name: 'Profile User',
      });
    }

    it('should retrieve user profile successfully', async () => {
      // Setup: Create test user
      await createProfileUser();
      const profile = await authService.getUserProfile(testEmail);

      expect(profile).toMatchObject({
        email: testEmail,
        name: 'Profile User',
        address: null,
        latitude: null,
        longitude: null,
      });
    });

    it('should throw error for non-existent user profile', async () => {
      // No setup needed - testing non-existent user
      await expect(
        authService.getUserProfile('nonexistent@example.com'),
      ).rejects.toThrow();
    });
  });
});
