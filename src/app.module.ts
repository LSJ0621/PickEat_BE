import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD } from '@nestjs/core';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BatchModule } from './batch/batch.module';
import { BugReportModule } from './bug-report/bug-report.module';
import { RedisCacheModule } from './common/cache/cache.module';
import { databaseConfig } from './common/config/database.config';
import { validate } from './common/config/env.validation';
import { loggerConfig } from './common/config/logger.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ExternalModule } from './external/external.module';
import { MenuModule } from './menu/menu.module';
import { NotificationModule } from './notification/notification.module';
import { UserModule } from './user/user.module';
import { RatingModule } from './rating/rating.module';
import { UserPlaceModule } from './user-place/user-place.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      validate,
    }),
    TypeOrmModule.forRootAsync(databaseConfig),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        // Test environment: Disable rate limiting to prevent E2E test failures
        // Production/Development: Normal rate limiting (100 req/min)
        ttl: process.env.NODE_ENV === 'test' ? 1000 : 60000,
        limit: process.env.NODE_ENV === 'test' ? 10000 : 100,
      },
    ]),
    LoggerModule.forRoot(loggerConfig),
    RedisCacheModule,
    ExternalModule.forRoot(),
    AdminModule,
    BugReportModule,
    AuthModule,
    UserModule,
    UserPlaceModule,
    MenuModule,
    BatchModule,
    NotificationModule,
    RatingModule,
  ],
  controllers: [],
  providers: [
    HttpExceptionFilter,
    // Only enable ThrottlerGuard in non-test environments
    // In test environment, rate limiting is disabled to prevent E2E test failures
    ...(process.env.NODE_ENV !== 'test'
      ? [
          {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
          },
        ]
      : []),
  ],
})
export class AppModule {}
