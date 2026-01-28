import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, validateSync } from 'class-validator';

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
  KAKAO_REST_API_KEY: string;

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

  // Naver API
  @IsString()
  @IsNotEmpty()
  NAVER_CLIENT_ID: string;

  @IsString()
  @IsNotEmpty()
  NAVER_CLIENT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  NAVER_MAP_CLIENT_ID: string;

  @IsString()
  @IsNotEmpty()
  NAVER_MAP_CLIENT_SECRET: string;

  // Docker Compose / Monitoring
  @IsString()
  @IsNotEmpty()
  GRAFANA_ADMIN_USER: string;

  @IsString()
  @IsNotEmpty()
  GRAFANA_ADMIN_PASSWORD: string;

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

  // Address Search Provider (optional, defaults to 'kakao')
  ADDRESS_SEARCH_PROVIDER?: string;
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
    throw new Error(
      `필수 환경 변수가 설정되지 않았습니다: ${missingKeys.join(', ')}`,
    );
  }

  return validatedConfig;
}
