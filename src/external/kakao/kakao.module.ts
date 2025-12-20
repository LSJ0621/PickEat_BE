import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { KakaoLocalClient } from './clients/kakao-local.client';
import { KakaoOAuthClient } from './clients/kakao-oauth.client';

@Module({
  imports: [HttpModule],
  providers: [KakaoLocalClient, KakaoOAuthClient],
  exports: [KakaoLocalClient, KakaoOAuthClient],
})
export class KakaoModule {}
