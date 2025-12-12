import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { databaseConfig } from './common/config/database.config';
import { DbMetricsService } from './common/services/db-metrics.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { loggerConfig } from './common/config/logger.config';
import { ExternalModule } from './external/external.module';
import { MapModule } from './map/map.module';
import { MenuModule } from './menu/menu.module';
import { PrometheusModule } from './prometheus/prometheus.module';
import { SearchModule } from './search/search.module';
import { UserModule } from './user/user.module';
import { HttpMetricsInterceptor } from './common/interceptors/http-metrics.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
    }),
    TypeOrmModule.forRootAsync(databaseConfig),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot(loggerConfig),
    PrometheusModule,
    ExternalModule,
    AuthModule,
    UserModule,
    MenuModule,
    SearchModule,
    MapModule,
  ],
  controllers: [AppController],
  providers: [AppService, HttpMetricsInterceptor, DbMetricsService, HttpExceptionFilter],
})
export class AppModule {}
