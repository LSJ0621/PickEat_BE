import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GEMINI_CONFIG, GEMINI_LOGGING } from '../gemini.constants';
import {
  GeminiGroundingMetadata,
  GeminiSearchResponse,
  GeminiApiResponse,
  GeminiRestaurantResult,
} from '../gemini.types';

@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly genAI: GoogleGenAI;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GOOGLE_GEMINI_API_KEY', '');

    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_GEMINI_API_KEY가 설정되지 않았습니다. Gemini 기능이 비활성화됩니다.',
      );
    }

    this.genAI = new GoogleGenAI({
      apiKey: apiKey || 'dummy-key-for-initialization',
    });
  }

  /**
   * Gemini API 사용 가능 여부 확인
   */
  private isEnabled(): boolean {
    const apiKey = this.config.get<string>('GOOGLE_GEMINI_API_KEY', '');
    return !!apiKey;
  }

  /**
   * 통합 Grounding을 사용한 레스토랑 검색 (1회 API 호출)
   *
   * Search Grounding + Maps Grounding을 동시에 활성화하여
   * 한 번의 API 호출로 맛집 추천과 위치 정보를 함께 조회합니다.
   */
  async searchRestaurantsUnified(
    prompt: string,
    latitude: number,
    longitude: number,
    _language: 'ko' | 'en',
  ): Promise<GeminiSearchResponse> {
    this.logger.log(`🚀 [Unified Search] 시작`);
    this.logger.log(`  📍 좌표: (${latitude}, ${longitude})`);

    // 1️⃣ Gemini API 호출 (Search + Maps Grounding 동시 활성화)
    // maxOutputTokens 미설정: 기본값 65,535 사용 (Grounding 메타데이터 공간 확보)
    const response = (await this.genAI.models.generateContent({
      model: GEMINI_CONFIG.MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: { latitude, longitude },
          },
        },
      },
    })) as GeminiApiResponse;

    // 2️⃣ 토큰 사용량 로깅
    const usageMetadata = response.usageMetadata;
    if (usageMetadata) {
      this.logger.log(`📊 [Unified Search] 토큰 사용량:`);
      this.logger.log(
        `  입력: ${usageMetadata.promptTokenCount}, 출력: ${usageMetadata.candidatesTokenCount}`,
      );
    }

    // 3️⃣ groundingChunks에서 placeId 추출 (Maps chunk만)
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const placeIdMap = new Map<string, string>();

    if (groundingMetadata?.groundingChunks) {
      groundingMetadata.groundingChunks.forEach((chunk) => {
        if (chunk.maps?.placeId && chunk.maps?.title) {
          const placeId = chunk.maps.placeId.startsWith('places/')
            ? chunk.maps.placeId.slice(7)
            : chunk.maps.placeId;
          placeIdMap.set(chunk.maps.title.toLowerCase(), placeId);
        }
      });
    }

    // 4️⃣ Widget Token 추출
    const token = groundingMetadata?.googleMapsWidgetContextToken;

    // 5️⃣ JSON 응답 파싱
    const rawText = response.text;
    const finishReason = response.candidates?.[0]?.finishReason;
    this.logger.log(
      `📦 [Unified Search] Gemini 응답 원본 (finishReason: ${finishReason}):\n${rawText}`,
    );
    const jsonText = this.extractJsonFromText(rawText);

    // 파싱 결과를 위한 명시적 타입 정의
    interface ParsedRestaurantResponse {
      restaurants: Array<{
        name: string;
        localizedName?: string;
        address?: string;
        localizedAddress?: string;
        reason: string;
        latitude?: number;
        longitude?: number;
      }>;
    }

    let parsed: ParsedRestaurantResponse;

    try {
      parsed = JSON.parse(jsonText) as ParsedRestaurantResponse;
      // 유효성 검증: restaurants 필드가 배열인지 확인
      if (!parsed.restaurants || !Array.isArray(parsed.restaurants)) {
        throw new Error(
          'Invalid response structure: restaurants is not an array',
        );
      }
    } catch (parseError) {
      this.logger.error(
        `❌ [Unified Search] JSON 파싱 실패\n` +
          `Error: ${parseError instanceof Error ? parseError.message : String(parseError)}\n` +
          `JSON preview: "${jsonText.substring(0, 300)}..."`,
      );
      return { success: false, restaurants: [] };
    }

    // 5-1️⃣ 파싱된 레스토랑 데이터 로깅 (디버깅용)
    this.logger.log(`📝 [Unified Search] Gemini 응답 데이터:`);
    parsed.restaurants.forEach((r, index) => {
      this.logger.log(`  [${index + 1}] ${r.name}`);
      this.logger.log(`      - localizedName: ${r.localizedName}`);
      this.logger.log(`      - address: ${r.address}`);
      this.logger.log(`      - localizedAddress: ${r.localizedAddress}`);
      this.logger.log(`      - reason: ${r.reason?.substring(0, 50)}...`);
      this.logger.log(`      - 좌표: (${r.latitude}, ${r.longitude})`);
    });

    // 5-2️⃣ Grounding Chunks 로깅 (placeId 매핑 확인용)
    if (groundingMetadata?.groundingChunks) {
      this.logger.log(`📍 [Unified Search] Grounding Chunks (placeId 매핑):`);
      groundingMetadata.groundingChunks.forEach((chunk, index) => {
        if (chunk.maps) {
          this.logger.log(`  [Maps ${index + 1}] ${chunk.maps.title}`);
          this.logger.log(`      - placeId: ${chunk.maps.placeId}`);
        }
        if (chunk.web) {
          this.logger.log(`  [Web ${index + 1}] ${chunk.web.title}`);
          this.logger.log(`      - uri: ${chunk.web.uri}`);
        }
      });
    }

    // 6️⃣ placeId 매칭 (이름 기반 - localizedName 우선)
    const restaurants = parsed.restaurants.map((r) => {
      // localizedName이 있으면 우선 사용, 없으면 name 사용
      // localizedName이 객체인 경우 문자열로 변환하지 않고 undefined 처리
      const localizedNameLower =
        typeof r.localizedName === 'string'
          ? r.localizedName.toLowerCase()
          : '';
      const nameLower = r.name.toLowerCase();
      let placeId: string | null = null;

      // localizedName으로 먼저 매칭 시도
      if (localizedNameLower) {
        for (const [key, value] of placeIdMap.entries()) {
          if (
            localizedNameLower.includes(key) ||
            key.includes(localizedNameLower)
          ) {
            placeId = value;
            break;
          }
        }
      }

      // localizedName으로 매칭 실패 시 name으로 fallback
      if (!placeId) {
        for (const [key, value] of placeIdMap.entries()) {
          if (nameLower.includes(key) || key.includes(nameLower)) {
            placeId = value;
            break;
          }
        }
      }

      return {
        name: r.name,
        localizedName: r.localizedName,
        reason: r.reason,
        placeId,
        address: r.address,
        localizedAddress: r.localizedAddress,
        latitude: r.latitude,
        longitude: r.longitude,
      };
    });

    // 7️⃣ 결과 로깅
    const successCount = restaurants.filter((r) => r.placeId).length;
    this.logger.log(
      `✅ [Unified Search] 결과: ${successCount}/${restaurants.length}개 placeId 획득`,
    );

    return {
      success: true,
      restaurants,
      googleMapsWidgetContextToken: token,
    };
  }

  /**
   * 잘린 JSON에서 완전한 레스토랑 객체만 추출
   */
  private recoverTruncatedJson(text: string): string | null {
    // restaurants 배열 시작 찾기
    const restaurantsMatch = text.match(/"restaurants"\s*:\s*\[/);
    if (!restaurantsMatch) return null;

    const startIdx = text.indexOf('[', restaurantsMatch.index ?? 0);

    /**
     * Extract complete restaurant objects from restaurants array
     * depth = 0: At array level (between restaurant objects)
     * depth = 1+: Inside a restaurant object or nested property
     */
    const completeObjects: Record<string, unknown>[] = [];
    let depth = 0;
    let objectStart = -1;

    for (let i = startIdx + 1; i < text.length; i++) {
      if (text[i] === '{' && depth === 0) {
        objectStart = i;
        depth = 1;
      } else if (text[i] === '{') {
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0 && objectStart !== -1) {
          try {
            const objStr = text.slice(objectStart, i + 1);
            const obj = JSON.parse(objStr) as Record<string, unknown>;
            completeObjects.push(obj);
          } catch (parseError) {
            this.logger.debug(
              `[Gemini JSON 복구] 객체 파싱 실패 at position ${objectStart}: ${
                parseError instanceof Error
                  ? parseError.message
                  : String(parseError)
              }`,
            );
          }
          objectStart = -1;
        }
      }
    }

    if (completeObjects.length > 0) {
      this.logger.warn(
        `⚠️ [Gemini JSON 복구] ${completeObjects.length}개 레스토랑 복구 성공`,
      );
      return JSON.stringify({ restaurants: completeObjects });
    }

    return null;
  }

  /**
   * 텍스트에서 JSON 추출 (마크다운 코드블록 또는 JSON 객체)
   */
  private extractJsonFromText(text: string): string {
    // 1. Try markdown code block first (most reliable)
    // Find all code blocks (there may be multiple)
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/g;
    const allMatches = [...text.matchAll(codeBlockRegex)];

    if (allMatches.length > 0) {
      // Log warning if multiple code blocks detected
      if (allMatches.length > 1) {
        this.logger.warn(
          `⚠️ [Gemini JSON 추출] 여러 개의 코드블록이 감지되었습니다 (count=${allMatches.length}). 유효한 JSON을 찾습니다.`,
        );
      }

      // Try to find a valid JSON block
      for (const match of allMatches) {
        const content = match[1].trim();
        try {
          // Attempt JSON parsing to validate
          JSON.parse(content);
          return content;
        } catch {
          // This block is not valid JSON, try recovery
          const recovered = this.recoverTruncatedJson(content);
          if (recovered) {
            return recovered;
          }
          continue;
        }
      }

      // If no valid JSON found, try recovery on longest block
      const longestMatch = allMatches.reduce((longest, current) =>
        current[1].length > longest[1].length ? current : longest,
      );
      const recovered = this.recoverTruncatedJson(longestMatch[1].trim());
      if (recovered) {
        return recovered;
      }

      this.logger.warn(
        `⚠️ [Gemini JSON 추출] 유효한 JSON 블록을 찾지 못했습니다. 가장 긴 블록을 반환합니다 (length=${longestMatch[1].length}).`,
      );
      return longestMatch[1].trim();
    }

    // 2. Look for JSON object with "restaurants" key specifically
    const restaurantJsonMatch = text.match(
      /\{\s*"restaurants"\s*:\s*\[[\s\S]*?\]\s*\}/,
    );
    if (restaurantJsonMatch) {
      return restaurantJsonMatch[0];
    }

    // 3. Try first occurrence of valid JSON by attempting parse
    const startIdx = text.indexOf('{');
    if (startIdx !== -1) {
      for (
        let endIdx = text.lastIndexOf('}');
        endIdx > startIdx;
        endIdx = text.lastIndexOf('}', endIdx - 1)
      ) {
        const candidate = text.substring(startIdx, endIdx + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          continue;
        }
      }

      // 파싱 실패 시 복구 시도
      const recovered = this.recoverTruncatedJson(text);
      if (recovered) {
        return recovered;
      }
    }

    return text;
  }

  /**
   * Grounding 분석 상세 로깅
   */
  private logGroundingAnalysis(
    response: GeminiApiResponse,
    parsedRestaurants: GeminiRestaurantResult[],
    placeIdMap: Map<string, string>,
    restaurants?: GeminiSearchResponse['restaurants'],
  ): void {
    const verbosity =
      (process.env.GEMINI_LOG_VERBOSITY as
        | 'minimal'
        | 'normal'
        | 'debug'
        | undefined) || GEMINI_LOGGING.DEFAULT_VERBOSITY;

    // minimal 모드는 로깅 생략 (성능 최적화)
    if (verbosity === 'minimal') {
      return;
    }

    // 공통으로 사용할 데이터 한 번만 추출
    const groundingChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    // Maps 또는 retrievedContext 데이터가 있는 chunk만 필터
    // retrievedContext는 하위 호환성을 위해 유지 (deprecated)
    const mapsChunks = groundingChunks.filter(
      (chunk) => chunk.maps || chunk.retrievedContext,
    );
    const searchChunks = groundingChunks.filter((chunk) => chunk.web);

    // debug 모드일 때만 상세 로그
    if (verbosity === 'debug') {
      // 1. Raw Response Preview
      const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      this.logger.debug('[GEMINI:RESPONSE] 📄 Raw response preview', {
        length: rawText.length,
        preview: rawText.substring(
          0,
          GEMINI_LOGGING.RAW_RESPONSE_PREVIEW_LENGTH,
        ),
      });

      // 2. Web Search Queries
      const searchQueries =
        response.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];
      this.logger.debug('[GEMINI:QUERIES] 🔎 Web search queries used', {
        count: searchQueries.length,
        queries: searchQueries,
      });

      // 3. Search Grounding chunks
      this.logger.debug('[GEMINI:SEARCH_GROUNDING] 🌐 Web grounding chunks', {
        count: searchChunks.length,
        chunks: searchChunks.map((c) => ({
          title: c.web?.title,
          uri: c.web?.uri,
        })),
      });

      // 4. Maps Grounding chunks
      this.logger.debug('[GEMINI:MAPS_GROUNDING] 📍 Maps grounding chunks', {
        count: mapsChunks.length,
        chunks: mapsChunks.map((c) => ({
          title: c.maps?.title ?? c.retrievedContext?.title,
          placeId: c.maps?.placeId?.replace(/^places\//, '') ?? null,
          uri: c.maps?.uri ?? c.retrievedContext?.uri,
        })),
      });

      // 5. Grounding Supports
      const supports =
        response.candidates?.[0]?.groundingMetadata?.groundingSupports || [];
      this.logger.debug('[GEMINI:SUPPORTS] 📊 Grounding supports analysis', {
        totalCount: supports.length,
        samples: supports
          .slice(0, GEMINI_LOGGING.MAX_SUPPORTS_TO_LOG)
          .map((s) => ({
            segment: s.segment?.text?.substring(0, 100),
            avgConfidence:
              s.groundingChunkIndices?.length && s.confidenceScores?.length
                ? s.confidenceScores.reduce((a, b) => a + b, 0) /
                  s.confidenceScores.length
                : null,
          })),
      });

      // 6. Parsed Restaurants (Full JSON)
      this.logger.debug(
        '[GEMINI:PARSED_RESTAURANTS] 📥 Parsed restaurants from JSON',
        {
          count: parsedRestaurants.length,
          restaurants: parsedRestaurants,
        },
      );

      // 7. PlaceId Map
      this.logger.debug(
        '[GEMINI:PLACE_ID_MAP] 📍 Maps Grounding placeId mapping',
        {
          chunksCount: mapsChunks.length,
          placeIdMap: Object.fromEntries(placeIdMap),
        },
      );

      // 8. Individual Restaurant Matching
      if (restaurants) {
        restaurants.forEach((r, i) => {
          this.logger.debug(
            `[GEMINI:MATCHING:${i + 1}] 🍽️ Restaurant matching result`,
            {
              name: r.name,
              placeId: r.placeId ?? 'null',
              matched: r.placeId !== null,
            },
          );
        });
      }
    }

    // 6. PlaceId Matching Summary (normal, debug 모드)
    const matched = Array.from(placeIdMap.values()).filter((v) => v).length;
    const unmatched = parsedRestaurants
      .filter((r) => !placeIdMap.get(r.name))
      .map((r) => r.name);

    this.logger.log('[GEMINI:MATCHING] 🔗 PlaceId matching summary', {
      parsedRestaurants: parsedRestaurants.length,
      mapsChunks: mapsChunks.length,
      matched,
      unmatched: unmatched.length,
    });

    if (unmatched.length > 0) {
      this.logger.warn(
        '[GEMINI:MATCHING] ⚠️ Unmatched restaurants (possible hallucinations)',
        {
          names: unmatched,
        },
      );
    }

    // 7. Result Count Analysis
    this.logger.log('[GEMINI:RESULT] 📈 Count analysis', {
      parsedFromJSON: parsedRestaurants.length,
      webChunks: searchChunks.length,
      mapsChunks: mapsChunks.length,
      placeIdsMapped: matched,
    });
  }

  /**
   * groundingMetadata에서 placeId 추출 (통합 Grounding)
   */
  private extractGroundingData(metadata: GeminiGroundingMetadata | undefined): {
    placeIdMap: Map<string, string>;
  } {
    const placeIdMap = new Map<string, string>();

    if (!metadata?.groundingChunks) {
      return { placeIdMap };
    }

    for (const chunk of metadata.groundingChunks) {
      // Maps placeId 추출 (공식 문서: chunk.maps 사용)
      if (chunk.maps?.placeId && chunk.maps?.title) {
        // "places/ChIJ..." 와 "ChIJ..." 모두 처리
        const placeId = chunk.maps.placeId.startsWith('places/')
          ? chunk.maps.placeId.slice(7) // "places/" 제거 (7글자)
          : chunk.maps.placeId;
        // 대소문자 무관 매칭을 위해 소문자로 저장
        placeIdMap.set(chunk.maps.title.toLowerCase(), placeId);
      }
    }

    return { placeIdMap };
  }

  /**
   * Rate Limit 에러 확인
   */
  private isRateLimitError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
      const errorMessage = (error as { message?: string }).message || '';
      return (
        errorMessage.includes('rate limit') ||
        errorMessage.includes('quota exceeded') ||
        errorMessage.includes('429')
      );
    }
    return false;
  }

  /**
   * Service Unavailable 에러 확인
   */
  private isServiceUnavailableError(error: unknown): boolean {
    if (typeof error === 'object' && error !== null) {
      const errorMessage = (error as { message?: string }).message || '';
      return (
        errorMessage.includes('service unavailable') ||
        errorMessage.includes('503') ||
        errorMessage.includes('500')
      );
    }
    return false;
  }

  /**
   * 에러 로깅
   */
  private logError(operation: string, prompt: string, error: unknown): void {
    const message = error instanceof Error ? error.message : 'unknown error';

    this.logger.error(
      `❌ [${operation} 에러] prompt="${prompt.substring(0, 100)}...", error=${message}`,
    );

    if (error instanceof Error && error.stack) {
      this.logger.error(`스택 트레이스: ${error.stack}`);
    }
  }
}
