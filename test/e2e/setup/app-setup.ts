import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@/app.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

/**
 * Creates and initializes a NestJS application for E2E testing.
 *
 * - Loads the full AppModule (including DB, Redis, External services)
 * - NODE_ENV=test causes `dropSchema: true` in database.config — schema is
 *   recreated on each call to app.init()
 * - E2E_MOCK=true causes ExternalModule to load mock implementations
 * - Applies the same global ValidationPipe and HttpExceptionFilter as main.ts
 */
export async function createE2EApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // HttpExceptionFilter has no constructor dependencies (logger is inline),
  // so direct instantiation is safe and avoids DI scope issues in tests.
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();
  return app;
}

/**
 * Closes the NestJS application and releases all resources (DB connections,
 * Redis connections, scheduled tasks, etc.).
 */
export async function closeE2EApp(app: INestApplication): Promise<void> {
  await app.close();
}
