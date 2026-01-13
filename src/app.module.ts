import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { BugReportModule } from './bug-report/bug-report.module';
import { databaseConfig } from './common/config/database.config';
import { validate } from './common/config/env.validation';
import { loggerConfig } from './common/config/logger.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ExternalModule } from './external/external.module';
import { MenuModule } from './menu/menu.module';
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
    LoggerModule.forRoot(loggerConfig),
    ExternalModule.forRoot(),
    BugReportModule,
    AuthModule,
    UserModule,
    MenuModule,
    SearchModule,
  ],
  controllers: [],
  providers: [HttpExceptionFilter],
})
export class AppModule {}
