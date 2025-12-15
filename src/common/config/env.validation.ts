import { plainToInstance } from 'class-transformer';
import { IsEnum, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
}

class EnvironmentVariables {
  // Application
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv;

  PORT: string;
  CORS_ORIGIN: string;

  // Database
  DB_HOST: string;
  DB_PORT: string;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_DATABASE: string;
  DB_SYNCHRONIZE: string;

  // JWT
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;

  // Email
  EMAIL_HOST: string;
  EMAIL_PORT: string;
  EMAIL_SECURE: string;
  EMAIL_ADDRESS: string;
  EMAIL_PASSWORD: string;

  // OpenAI
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  OPENAI_MENU_MODEL: string;
  OPENAI_PREFERENCE_MODEL: string;
  OPENAI_PLACES_MODEL: string;

  // Kakao API
  KAKAO_REST_API_KEY: string;
  OAUTH_KAKAO_CLIENT_ID: string;
  OAUTH_KAKAO_REDIRECT_URI: string;

  // Google API
  GOOGLE_API_KEY: string;
  GOOGLE_CSE_CX: string;
  OAUTH_GOOGLE_CLIENT_ID: string;
  OAUTH_GOOGLE_CLIENT_SECRET: string;
  OAUTH_GOOGLE_REDIRECT_URI: string;

  // Naver API
  NAVER_CLIENT_ID: string;
  NAVER_CLIENT_SECRET: string;
  NAVER_MAP_CLIENT_ID: string;
  NAVER_MAP_CLIENT_SECRET: string;

  // Docker Compose
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_DB: string;
  GRAFANA_ADMIN_USER: string;
  GRAFANA_ADMIN_PASSWORD: string;
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

