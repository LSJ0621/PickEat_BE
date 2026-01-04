/**
 * OpenAI API 타입 정의
 * OpenAI SDK 응답 및 요청 파라미터 타입
 */

/**
 * OpenAI API 토큰 사용량
 */
export interface OpenAIUsage {
  /** 프롬프트 토큰 수 */
  prompt_tokens?: number;
  /** 입력 토큰 수 (일부 모델) */
  input_tokens?: number;
  /** 완료 토큰 수 */
  completion_tokens?: number;
  /** 출력 토큰 수 (일부 모델) */
  output_tokens?: number;
  /** 총 토큰 수 */
  total_tokens?: number;
}

/**
 * OpenAI Chat Completion 응답 (토큰 사용량 포함)
 */
export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string;
  }>;
  usage?: OpenAIUsage;
}

/**
 * OpenAI Chat Completion 요청 파라미터 (메뉴 추천용)
 */
export interface OpenAIChatCompletionParams {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  response_format?: {
    type: 'json_schema';
    json_schema: {
      name: string;
      schema: Record<string, unknown>;
      strict: boolean;
    };
  };
  max_tokens?: number;
  temperature?: number;
}
