import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  // Application
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv;

  @IsString()
  @IsNotEmpty()
  PORT: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN: string;

  @IsString()
  @IsNotEmpty()
  APP_URL: string;

  // Database (Postgres)
  @IsString()
  @IsNotEmpty()
  POSTGRES_HOST: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_PORT: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_USER: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_DB: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_SYNCHRONIZE: string;

  // Redis
  @IsString()
  @IsNotEmpty()
  REDIS_HOST: string;

  @IsString()
  @IsNotEmpty()
  REDIS_PORT: string;

  @IsString()
  REDIS_PASSWORD: string;

  // JWT
  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET: string;

  // Email
  @IsString()
  @IsNotEmpty()
  EMAIL_HOST: string;

  @IsString()
  @IsNotEmpty()
  EMAIL_PORT: string;

  @IsString()
  @IsNotEmpty()
  EMAIL_SECURE: string;

  @IsString()
  @IsNotEmpty()
  EMAIL_ADDRESS: string;

  @IsString()
  @IsNotEmpty()
  EMAIL_PASSWORD: string;

  // OpenAI
  @IsString()
  @IsNotEmpty()
  OPENAI_API_KEY: string;

  @IsString()
  @IsNotEmpty()
  OPENAI_MODEL: string;

  @IsString()
  @IsNotEmpty()
  OPENAI_MENU_MODEL: string;

  @IsString()
  @IsNotEmpty()
  OPENAI_PREFERENCE_MODEL: string;

  @IsString()
  @IsNotEmpty()
  OPENAI_PLACES_MODEL: string;

  @IsString()
  @IsNotEmpty()
  OPENAI_VALIDATION_MODEL: string;

  // Kakao API
  @IsString()
  @IsNotEmpty()
  OAUTH_KAKAO_CLIENT_ID: string;

  @IsString()
  @IsNotEmpty()
  OAUTH_KAKAO_REDIRECT_URI: string;

  // Google API
  @IsString()
  @IsNotEmpty()
  GOOGLE_API_KEY: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_CSE_CX: string;

  @IsString()
  @IsNotEmpty()
  OAUTH_GOOGLE_CLIENT_ID: string;

  @IsString()
  @IsNotEmpty()
  OAUTH_GOOGLE_CLIENT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  OAUTH_GOOGLE_REDIRECT_URI: string;

  // Admin User (optional, for initial seeding)
  @IsString()
  @IsNotEmpty()
  ADMIN_NAME: string;

  @IsString()
  @IsNotEmpty()
  ADMIN_EMAIL: string;

  @IsString()
  @IsNotEmpty()
  ADMIN_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  ADMIN_ROLE: string;

  // AWS S3
  @IsString()
  @IsNotEmpty()
  AWS_S3_ACCESS_KEY_ID: string;

  @IsString()
  @IsNotEmpty()
  AWS_S3_SECRET_ACCESS_KEY: string;

  @IsString()
  @IsNotEmpty()
  AWS_S3_BUCKET: string;

  @IsString()
  @IsNotEmpty()
  AWS_S3_REGION: string;

  @IsString()
  @IsNotEmpty()
  AWS_S3_BUCKET_PUBLIC: string; // 'true' or 'false' - 버킷이 public-read인지 여부

  // Discord Webhook
  @IsString()
  @IsNotEmpty()
  DISCORD_BUG_REPORT_WEBHOOK_URL: string;

  // Gemini API (optional: AI place recommendation feature, fallback to OpenAI if not provided)
  @IsOptional()
  @IsString()
  GOOGLE_GEMINI_API_KEY?: string;

  @IsOptional()
  @IsIn(['minimal', 'normal', 'debug'])
  GEMINI_LOG_VERBOSITY?: string;

  // Address Search Provider (optional, defaults to 'kakao')
  ADDRESS_SEARCH_PROVIDER?: string;

  // Discord Scheduler Webhook (optional, falls back to DISCORD_BUG_REPORT_WEBHOOK_URL)
  @IsOptional()
  @IsString()
  DISCORD_SCHEDULER_WEBHOOK_URL?: string;

  // Scheduler Cron Expressions (optional, defaults are production values)
  @IsOptional()
  @IsString()
  CRON_PREFERENCES_BATCH_SUBMIT?: string;

  @IsOptional()
  @IsString()
  CRON_PREFERENCES_RETRY_BATCH?: string;

  @IsOptional()
  @IsString()
  CRON_PREFERENCES_BATCH_RESULT?: string;

  @IsOptional()
  @IsString()
  CRON_RATING_AGGREGATE?: string;

  @IsOptional()
  @IsString()
  CRON_NOTIFICATION_PUBLISH?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const missingKeys = errors.map((error) => error.property);
    // NestJS ConfigModule의 validate 함수는 Error를 throw해야 앱 시작을 중단시킵니다.
    // InternalServerErrorException 대신 일반 Error를 사용하는 이유:
    // validate()는 NestJS 부트스트랩 전에 실행되어 HttpException이 처리되지 않기 때문입니다.
    throw new Error(
      `필수 환경 변수가 설정되지 않았습니다: ${missingKeys.join(', ')}`,
    );
  }

  return validatedConfig;
}
