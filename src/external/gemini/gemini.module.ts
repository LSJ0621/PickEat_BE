import { Global, Module } from '@nestjs/common';
import { GeminiClient } from './clients/gemini.client';

@Global()
@Module({
  providers: [GeminiClient],
  exports: [GeminiClient],
})
export class GeminiModule {}
