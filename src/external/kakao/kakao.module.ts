import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { KakaoOAuthClient } from './clients/kakao-oauth.client';

@Module({
  imports: [HttpModule.register({ timeout: 10000 })],
  providers: [KakaoOAuthClient],
  exports: [KakaoOAuthClient],
})
export class KakaoModule {}
