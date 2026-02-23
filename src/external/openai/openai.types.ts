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

/**
 * OpenAI Responses API 요청 파라미터
 */
export interface ResponsesApiOptions {
  model: string;
  input: string;
  tools?: ResponsesApiTool[];
  /** 도구 호출 최대 횟수 (웹 검색 횟수 제한) */
  max_tool_calls?: number;
}

/**
 * OpenAI Responses API 웹 검색 도구
 */
export interface ResponsesApiTool {
  type: 'web_search';
  search_context_size?: 'low' | 'medium' | 'high';
}

/**
 * OpenAI Responses API 응답
 */
export interface ResponsesApiResponse {
  id: string;
  output_text: string;
  output: ResponsesApiOutputItem[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI Responses API 출력 항목
 */
export interface ResponsesApiOutputItem {
  type: 'message' | 'web_search_call';
  status?: string;
  content?: string;
}

/**
 * URL Citation 어노테이션
 * @property type - 어노테이션 타입 (항상 'url_citation')
 * @property start_index - 시작 인덱스 (0-based, inclusive)
 * @property end_index - 종료 인덱스 (0-based, exclusive)
 * @property url - 참조 URL
 * @property title - 참조 제목
 */
export interface UrlCitationAnnotation {
  type: 'url_citation';
  start_index: number;
  end_index: number;
  url: string;
  title: string;
}

/**
 * Output Text 콘텐츠 (annotations 포함)
 */
export interface OutputTextContent {
  type: 'output_text';
  text: string;
  annotations: UrlCitationAnnotation[];
}

/**
 * Responses API 출력 항목 (확장)
 */
export interface ResponsesApiOutputItemExtended {
  type: 'message' | 'web_search_call';
  status?: string;
  content?: OutputTextContent[];
}

/**
 * OpenAI 클라이언트 확장 인터페이스 - Responses API 지원
 * SDK가 공식적으로 Responses API를 지원하기 전까지 사용
 *
 * Note: OpenAI SDK의 공식 타입 정의에 없는 Responses API를 사용하기 위한 인터페이스
 * 런타임에서는 OpenAI 인스턴스를 타입 단언하여 사용
 */
export interface OpenAIWithResponsesAPI {
  responses: {
    create(options: ResponsesApiOptions): Promise<ResponsesApiResponse>;
  };
}
