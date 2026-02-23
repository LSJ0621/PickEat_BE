/**
 * Parsed restaurant response from Gemini JSON output
 */
export interface ParsedRestaurantResponse {
  restaurants: Array<{
    nameKo: string;
    nameEn: string;
    nameLocal?: string | null;
    addressKo?: string;
    addressEn?: string;
    addressLocal?: string | null;
    reason: string;
    reasonTags?: string[];
    latitude?: number;
    longitude?: number;
  }>;
}

/**
 * Gemini 클라이언트 설정
 */
export interface GeminiClientConfig {
  apiKey: string;
  model?: string;
  maxOutputTokens?: number;
}

/**
 * Gemini 레스토랑 추천 결과 (JSON Schema 응답)
 * - GeminiRestaurantSearchResult.restaurants 배열 아이템 타입
 */
export interface GeminiRestaurantResult {
  nameKo: string;
  nameEn: string;
  nameLocal?: string | null;
  reason: string;
  reasonTags?: string[];
  addressKo?: string;
  addressEn?: string;
  addressLocal?: string | null;
  latitude?: number;
  longitude?: number;
}

/**
 * Gemini 레스토랑 검색 응답 (통합 Grounding)
 */
export interface GeminiSearchResponse {
  success: boolean;
  restaurants: Array<{
    nameKo: string;
    nameEn: string;
    nameLocal?: string | null;
    reason: string;
    reasonTags?: string[];
    placeId: string | null; // Maps Grounding에서 제공되지 않으면 null
    addressKo?: string;
    addressEn?: string;
    addressLocal?: string | null;
    latitude?: number;
    longitude?: number;
  }>;
  token?: string;
  googleMapsWidgetContextToken?: string;
}

/**
 * Gemini Grounding Metadata (통합 Grounding 지원)
 */
export interface GeminiGroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
  /**
   * @deprecated Use chunk.maps instead. Kept for backward compatibility.
   */
  retrievedContext?: {
    uri?: string;
    title?: string;
  };
  /**
   * Gemini Maps Grounding data (official field)
   * @see https://ai.google.dev/gemini-api/docs/maps-grounding
   */
  maps?: {
    /** Google Place ID in "places/ChIJ..." format (prefix will be stripped in extraction) */
    placeId?: string;
    /** Google Maps URL for the place */
    uri?: string;
    /** Place name (used for matching with restaurant results) */
    title?: string;
    /** Additional text description */
    text?: string;
  };
}

export interface GeminiGroundingMetadata {
  groundingChunks?: GeminiGroundingChunk[];
  groundingSupports?: Array<{
    segment?: { startIndex?: number; endIndex?: number; text?: string };
    groundingChunkIndices?: number[];
    confidenceScores?: number[];
  }>;
  webSearchQueries?: string[];
  googleMapsWidgetContextToken?: string;
}

/**
 * Gemini API의 파싱된 레스토랑 검색 결과
 * JSON.parse(response.text) 결과 타입
 */
export interface GeminiRestaurantSearchResult {
  restaurants: GeminiRestaurantResult[];
}

/**
 * Gemini API 응답 구조 (@google/genai)
 */
export interface GeminiApiResponse {
  text: string;
  candidates: Array<{
    content: { parts: Array<{ text: string }>; role: string };
    finishReason: string;
    groundingMetadata?: GeminiGroundingMetadata;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}
