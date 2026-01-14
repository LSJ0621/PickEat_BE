import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD } from '@nestjs/core';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BugReportModule } from './bug-report/bug-report.module';
import { databaseConfig } from './common/config/database.config';
import { validate } from './common/config/env.validation';
import { loggerConfig } from './common/config/logger.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ExternalModule } from './external/external.module';
import { MenuModule } from './menu/menu.module';
import { NotificationModule } from './notification/notification.module';
import { SearchModule } from './search/search.module';
import { UserModule } from './user/user.module';

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
        ttl: 60000, // 1분 (밀리초)
        limit: 100, // 분당 100회 요청 제한
      },
    ]),
    LoggerModule.forRoot(loggerConfig),
    ExternalModule.forRoot(),
    AdminModule,
    BugReportModule,
    AuthModule,
    UserModule,
    MenuModule,
    NotificationModule,
    SearchModule,
  ],
  controllers: [],
  providers: [
    HttpExceptionFilter,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
