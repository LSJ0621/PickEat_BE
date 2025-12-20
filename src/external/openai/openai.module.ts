import { Module } from '@nestjs/common';

/**
 * OpenAI 관련 공통 설정 모듈
 *
 * 참고: 실제 OpenAI 서비스들은 각 도메인 모듈에 위치
 * - menu/services/openai-menu.service.ts
 * - menu/services/openai-places.service.ts
 * - user/preference-update-ai.service.ts
 *
 * 이 모듈은 향후 공통 OpenAI 클라이언트로 통합 시 사용
 */
@Module({
  imports: [],
  providers: [],
  exports: [],
})
export class OpenAiModule {}
