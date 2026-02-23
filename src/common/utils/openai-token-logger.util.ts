import { Logger } from '@nestjs/common';
import { OpenAIUsage } from '@/external/openai/openai.types';

/**
 * OpenAI API 토큰 사용량을 파싱하여 로깅
 *
 * Chat Completions API와 Responses API 양쪽의 토큰 필드명을 모두 처리합니다:
 * - prompt_tokens / input_tokens
 * - completion_tokens / output_tokens
 * - total_tokens
 *
 * @param logger - NestJS Logger 인스턴스
 * @param model - 사용된 OpenAI 모델명
 * @param usage - OpenAI 응답의 usage 객체 (null/undefined 허용)
 */
export function logOpenAiTokenUsage(
  logger: Logger,
  model: string,
  usage: OpenAIUsage | null | undefined,
): void {
  if (!usage) {
    return;
  }

  const promptTokens =
    usage.prompt_tokens ?? usage.input_tokens ?? usage.total_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
  const totalTokensRaw = usage.total_tokens ?? promptTokens + completionTokens;

  logger.log(
    `[OpenAI token usage] model=${model}, prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokensRaw}`,
  );
}
