import { Module } from '@nestjs/common';
import { GoogleModule } from './google/google.module';
import { KakaoModule } from './kakao/kakao.module';
import { NaverModule } from './naver/naver.module';
import { OpenAiModule } from './openai/openai.module';

/**
 * 외부 API 클라이언트 통합 모듈
 */
@Module({
  imports: [GoogleModule, KakaoModule, NaverModule, OpenAiModule],
  exports: [GoogleModule, KakaoModule, NaverModule, OpenAiModule],
})
export class ExternalModule {}

