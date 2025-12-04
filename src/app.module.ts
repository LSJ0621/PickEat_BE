import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MapModule } from './map/map.module';
import { MenuModule } from './menu/menu.module';
import { SearchModule } from './search/search.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    // ConfigModule: 환경 변수 로드 (전역 사용)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
    }),
    // TypeORM: ConfigService를 통해 환경 변수에서 설정 로드
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_DATABASE', 'pickeat'),
        autoLoadEntities: true,
        synchronize: config.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
        dropSchema: false,
      }),
    }),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot(),
    AuthModule,
    UserModule,
    MenuModule,
    SearchModule,
    MapModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
