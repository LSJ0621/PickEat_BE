import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { DATABASE_POOL } from '../constants/business.constants';
export const databaseConfig: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    host: config.getOrThrow<string>('POSTGRES_HOST'),
    port: config.getOrThrow<number>('POSTGRES_PORT'),
    username: config.getOrThrow<string>('POSTGRES_USER'),
    password: config.getOrThrow<string>('POSTGRES_PASSWORD'),
    database: config.getOrThrow<string>('POSTGRES_DB'),
    autoLoadEntities: true,
    synchronize: config.get<string>('POSTGRES_SYNCHRONIZE') === 'true',
    dropSchema: config.get<string>('NODE_ENV') === 'test',
    ssl:
      config.get<string>('NODE_ENV') === 'production'
        ? { rejectUnauthorized: false }
        : false,
    extra: {
      max: DATABASE_POOL.MAX,
      connectionTimeoutMillis: DATABASE_POOL.CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: DATABASE_POOL.IDLE_TIMEOUT_MS,
    },
    retryAttempts: DATABASE_POOL.RETRY_ATTEMPTS,
    retryDelay: DATABASE_POOL.RETRY_DELAY_MS,
  }),
};
