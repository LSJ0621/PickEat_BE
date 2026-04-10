import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtTokenProvider } from '@/auth/provider/jwt-token.provider';
import { RedisCacheService } from '@/common/cache/cache.service';
import { User } from '@/user/entities/user.entity';

const DEFAULT_PASSWORD = 'TestPassword1!';
const BCRYPT_ROUNDS = 10;

export interface TestUser {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/**
 * Creates a user in the database and issues JWT tokens signed with the
 * application's own JwtTokenProvider — guaranteeing that the tokens will pass
 * every auth guard used in the real application.
 *
 * The generated refresh token is also stored in Redis (via RedisCacheService)
 * so that refresh-token flows work correctly in E2E tests.
 *
 * @param app - The initialized NestJS application instance
 * @param overrides - Optional partial User fields to customise the created user
 */
export async function createAuthenticatedUser(
  app: INestApplication,
  overrides?: Partial<User>,
): Promise<TestUser> {
  const dataSource = app.get(DataSource);
  const userRepository = dataSource.getRepository(User);
  const jwtTokenProvider = app.get(JwtTokenProvider);
  const cacheService = app.get(RedisCacheService);

  const rawPassword = overrides?.password ?? DEFAULT_PASSWORD;
  const hashedPassword = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);

  const { password: _ignored, ...restOverrides } = overrides ?? {};

  const userEntity = userRepository.create({
    email: `test-${Date.now()}@e2e.example.com`,
    name: 'E2E Test User',
    role: 'USER',
    emailVerified: true,
    preferredLanguage: 'ko',
    ...restOverrides,
    // Always store the bcrypt-hashed value, regardless of what overrides provides
    password: hashedPassword,
  });

  const savedUser = await userRepository.save(userEntity);

  const accessToken = jwtTokenProvider.createToken(
    savedUser.id,
    savedUser.email,
    savedUser.role,
  );
  const refreshToken = jwtTokenProvider.createRefreshToken(
    savedUser.email,
    savedUser.role,
  );

  await cacheService.setRefreshToken(savedUser.id, refreshToken);

  return { user: savedUser, accessToken, refreshToken };
}

/**
 * Creates an ADMIN user in the database and issues tokens.
 * Convenience wrapper around `createAuthenticatedUser`.
 */
export async function createAuthenticatedAdmin(
  app: INestApplication,
  overrides?: Partial<User>,
): Promise<TestUser> {
  return createAuthenticatedUser(app, {
    email: `admin-${Date.now()}@e2e.example.com`,
    name: 'E2E Admin User',
    ...overrides,
    role: 'ADMIN',
  });
}

/**
 * Returns a supertest request builder pre-configured with the given Bearer
 * token.  Supports all common HTTP methods and automatically sets the
 * `Authorization` header.
 *
 * @example
 * const req = authenticatedRequest(app, testUser.accessToken);
 * const response = await req.get('/users/profile');
 */
export function authenticatedRequest(
  app: INestApplication,
  token: string,
): {
  get: (url: string) => supertest.Test;
  post: (url: string) => supertest.Test;
  put: (url: string) => supertest.Test;
  patch: (url: string) => supertest.Test;
  delete: (url: string) => supertest.Test;
} {
  const agent = supertest(app.getHttpServer());

  return {
    get: (url: string) =>
      agent.get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) =>
      agent.post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) =>
      agent.put(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) =>
      agent.patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) =>
      agent.delete(url).set('Authorization', `Bearer ${token}`),
  };
}
