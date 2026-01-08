import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@/user/entities/user.entity';
import { UserFactory } from '../../factories/entity.factory';
import { TEST_JWT_SECRETS } from '../../constants/test.constants';

/**
 * JWT secret for test environment
 * This matches the value in .env.test
 */
export const TEST_JWT_SECRET = TEST_JWT_SECRETS.ACCESS;
export const TEST_JWT_REFRESH_SECRET = TEST_JWT_SECRETS.REFRESH;

/**
 * Test user credentials
 */
export const TEST_USER = {
  email: 'test@example.com',
  password: 'TestPassword123!',
  name: 'Test User',
  role: 'USER' as const,
};

export const TEST_ADMIN = {
  email: 'admin@example.com',
  password: 'AdminPassword123!',
  name: 'Admin User',
  role: 'ADMIN' as const,
};

/**
 * Generates a JWT access token for testing
 */
export function generateTestAccessToken(
  user: Partial<User>,
  jwtService: JwtService,
): string {
  const payload = {
    email: user.email || TEST_USER.email,
    role: user.role || TEST_USER.role,
  };
  return jwtService.sign(payload);
}

/**
 * Generates a JWT refresh token for testing
 */
export function generateTestRefreshToken(
  user: Partial<User>,
  secret: string = TEST_JWT_REFRESH_SECRET,
): string {
  const jwt = require('jsonwebtoken');
  const payload = {
    email: user.email || TEST_USER.email,
    role: user.role || TEST_USER.role,
    type: 'refresh',
  };
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

/**
 * Gets Authorization header value for authenticated requests
 */
export function getAuthHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/**
 * AuthTestHelper class for managing test authentication
 */
export class AuthTestHelper {
  private jwtService: JwtService;

  constructor(private readonly app: INestApplication) {
    this.jwtService = this.app.get<JwtService>(JwtService);
  }

  /**
   * Creates an access token for a test user
   */
  createAccessToken(user: Partial<User> = {}): string {
    return generateTestAccessToken(user, this.jwtService);
  }

  /**
   * Creates an access token for a regular user
   */
  createUserToken(): string {
    return this.createAccessToken(UserFactory.create());
  }

  /**
   * Creates an access token for an admin user
   */
  createAdminToken(): string {
    return this.createAccessToken(UserFactory.createAdmin());
  }

  /**
   * Gets auth headers for a regular user
   */
  getUserAuthHeaders(): { Authorization: string } {
    return getAuthHeader(this.createUserToken());
  }

  /**
   * Gets auth headers for an admin user
   */
  getAdminAuthHeaders(): { Authorization: string } {
    return getAuthHeader(this.createAdminToken());
  }

  /**
   * Creates a refresh token for a test user
   */
  createRefreshToken(user: Partial<User> = {}): string {
    return generateTestRefreshToken(user);
  }
}

/**
 * Creates an AuthTestHelper instance from an INestApplication
 */
export function createAuthTestHelper(app: INestApplication): AuthTestHelper {
  return new AuthTestHelper(app);
}

/**
 * Test environment configuration
 * Use these values in .env.test
 */
export const TEST_ENV_CONFIG = {
  // Application
  NODE_ENV: 'development',
  PORT: '3000',
  CORS_ORIGIN: 'http://localhost:3001',
  APP_URL: 'http://localhost:3000',

  // Database (Postgres - will be overridden by TypeORM config in tests)
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5432',
  POSTGRES_USER: 'test',
  POSTGRES_PASSWORD: 'test',
  POSTGRES_DB: 'test',
  POSTGRES_SYNCHRONIZE: 'true',

  // JWT
  JWT_SECRET: TEST_JWT_SECRET,
  JWT_REFRESH_SECRET: TEST_JWT_REFRESH_SECRET,

  // Email
  EMAIL_HOST: 'smtp.test.com',
  EMAIL_PORT: '587',
  EMAIL_SECURE: 'false',
  EMAIL_ADDRESS: 'test@test.com',
  EMAIL_PASSWORD: 'test-password',

  // OpenAI
  OPENAI_API_KEY: 'test-openai-api-key',
  OPENAI_MODEL: 'gpt-4',
  OPENAI_MENU_MODEL: 'gpt-4o-mini',
  OPENAI_PREFERENCE_MODEL: 'gpt-4o-mini',
  OPENAI_PLACES_MODEL: 'gpt-4o-mini',
  OPENAI_VALIDATION_MODEL: 'gpt-4o-mini',

  // Kakao API
  KAKAO_REST_API_KEY: 'test-kakao-rest-api-key',
  OAUTH_KAKAO_CLIENT_ID: 'test-kakao-client-id',
  OAUTH_KAKAO_REDIRECT_URI: 'http://localhost:3000/auth/kakao/callback',

  // Google API
  GOOGLE_API_KEY: 'test-google-api-key',
  GOOGLE_CSE_CX: 'test-google-cse-cx',
  OAUTH_GOOGLE_CLIENT_ID: 'test-google-client-id',
  OAUTH_GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  OAUTH_GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',

  // Naver API
  NAVER_CLIENT_ID: 'test-naver-client-id',
  NAVER_CLIENT_SECRET: 'test-naver-client-secret',
  NAVER_MAP_CLIENT_ID: 'test-naver-map-client-id',
  NAVER_MAP_CLIENT_SECRET: 'test-naver-map-client-secret',

  // Monitoring
  GRAFANA_ADMIN_USER: 'admin',
  GRAFANA_ADMIN_PASSWORD: 'admin',

  // Admin User
  ADMIN_NAME: 'Admin',
  ADMIN_EMAIL: 'admin@test.com',
  ADMIN_PASSWORD: 'admin123',
  ADMIN_ROLE: 'ADMIN',

  // AWS S3
  AWS_S3_ACCESS_KEY_ID: 'test-aws-access-key',
  AWS_S3_SECRET_ACCESS_KEY: 'test-aws-secret-key',
  AWS_S3_BUCKET: 'test-bucket',
  AWS_S3_REGION: 'ap-northeast-2',
  AWS_S3_BUCKET_PUBLIC: 'false',

  // Discord Webhook
  DISCORD_BUG_REPORT_WEBHOOK_URL: 'https://discord.com/api/webhooks/test',
};
