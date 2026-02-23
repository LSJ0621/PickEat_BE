import { GoogleGenAI } from '@google/genai';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  retryWithExponentialBackoff,
  RetryOptions,
} from '@/common/utils/retry.util';
import { GEMINI_CONFIG } from '../gemini.constants';
import {
  GeminiSearchResponse,
  GeminiApiResponse,
  ParsedRestaurantResponse,
} from '../gemini.types';

@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly genAI: GoogleGenAI | null = null;

  private readonly retryOptions: RetryOptions = {
    retryableStatusCodes: [429, 500, 502, 503, 504],
  };

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GOOGLE_GEMINI_API_KEY', '');

    if (!apiKey) {
      this.logger.warn(
        'GOOGLE_GEMINI_API_KEY가 설정되지 않았습니다. Gemini 기능이 비활성화됩니다.',
      );
      return;
    }

    this.genAI = new GoogleGenAI({ apiKey });
  }

  /**
   * Gemini API 사용 가능 여부 확인
   */
  private isEnabled(): boolean {
    return this.genAI !== null;
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
    if (!this.genAI) {
      this.logger.warn('[Unified Search] Gemini 비활성화 상태. 빈 결과 반환.');
      return { success: false, restaurants: [] };
    }

    const genAI = this.genAI;
    this.logger.log(`[Unified Search] 시작`);
    this.logger.log(`  좌표: (${latitude}, ${longitude})`);

    // 1️⃣ Gemini API 호출 (Search + Maps Grounding 동시 활성화)
    // maxOutputTokens 미설정: 기본값 65,535 사용 (Grounding 메타데이터 공간 확보)
    const response = (await retryWithExponentialBackoff(
      () =>
        genAI.models.generateContent({
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
        }),
      this.retryOptions,
      this.logger,
    )) as GeminiApiResponse;

    // 2️⃣ 토큰 사용량 로깅
    const usageMetadata = response.usageMetadata;
    if (usageMetadata) {
      this.logger.log(`[Unified Search] 토큰 사용량:`);
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
    const rawText =
      response.text ?? response.candidates?.[0]?.content?.parts?.[0]?.text;
    const finishReason = response.candidates?.[0]?.finishReason;
    this.logger.debug(
      `[Unified Search] Gemini 응답 원본 (finishReason: ${finishReason}):\n${rawText}`,
    );
    if (!rawText) {
      this.logger.warn('[Unified Search] Gemini 응답 텍스트가 비어있습니다');
      return {
        success: false,
        restaurants: [],
        googleMapsWidgetContextToken: token,
      };
    }
    const jsonText = this.extractJsonFromText(rawText);

    let parsed: ParsedRestaurantResponse;

    try {
      parsed = JSON.parse(jsonText) as ParsedRestaurantResponse;
      // 유효성 검증: restaurants 필드가 배열인지 확인
      if (!parsed.restaurants || !Array.isArray(parsed.restaurants)) {
        throw new InternalServerErrorException(
          'Invalid response structure: restaurants is not an array',
        );
      }
    } catch (parseError) {
      this.logger.error(
        `[Unified Search] JSON 파싱 실패\n` +
          `Error: ${parseError instanceof Error ? parseError.message : String(parseError)}\n` +
          `JSON preview: "${jsonText.substring(0, 300)}..."`,
      );
      return { success: false, restaurants: [] };
    }

    // 5-1️⃣ 파싱된 레스토랑 데이터 로깅 (디버깅용)
    this.logger.log(`[Unified Search] Gemini 응답 데이터:`);
    parsed.restaurants.forEach((r, index) => {
      this.logger.log(`  [${index + 1}] ${r.nameKo} / ${r.nameEn}`);
      this.logger.log(`      - nameLocal: ${r.nameLocal}`);
      this.logger.log(`      - addressKo: ${r.addressKo}`);
      this.logger.log(`      - addressEn: ${r.addressEn}`);
      this.logger.log(`      - addressLocal: ${r.addressLocal}`);
      this.logger.log(`      - reason: ${r.reason?.substring(0, 50)}...`);
      this.logger.log(`      - 좌표: (${r.latitude}, ${r.longitude})`);
    });

    // 5-2️⃣ Grounding Chunks 로깅 (placeId 매핑 확인용)
    if (groundingMetadata?.groundingChunks) {
      this.logger.log(`[Unified Search] Grounding Chunks (placeId 매핑):`);
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

    // 6️⃣ placeId 매칭 (이름 기반 - nameLocal 우선 → nameKo → nameEn)
    const restaurants = parsed.restaurants.map((r) => {
      const nameLocalLower =
        typeof r.nameLocal === 'string' ? r.nameLocal.toLowerCase() : '';
      const nameKoLower = r.nameKo.toLowerCase();
      const nameEnLower = r.nameEn?.toLowerCase() ?? '';
      let placeId: string | null = null;

      // 1. nameLocal로 매칭 (Google Maps 등록명 = 현지 언어)
      if (nameLocalLower) {
        for (const [key, value] of placeIdMap.entries()) {
          if (nameLocalLower.includes(key) || key.includes(nameLocalLower)) {
            placeId = value;
            break;
          }
        }
      }

      // 2. nameKo로 fallback (한국 가게는 nameLocal=null → 여기서 매칭)
      if (!placeId) {
        for (const [key, value] of placeIdMap.entries()) {
          if (nameKoLower.includes(key) || key.includes(nameKoLower)) {
            placeId = value;
            break;
          }
        }
      }

      // 3. nameEn으로 최종 fallback
      if (!placeId && nameEnLower) {
        for (const [key, value] of placeIdMap.entries()) {
          if (nameEnLower.includes(key) || key.includes(nameEnLower)) {
            placeId = value;
            break;
          }
        }
      }

      return {
        nameKo: r.nameKo,
        nameEn: r.nameEn,
        nameLocal: r.nameLocal,
        reason: r.reason,
        reasonTags: Array.isArray(r.reasonTags) ? r.reasonTags : [],
        placeId,
        addressKo: r.addressKo,
        addressEn: r.addressEn,
        addressLocal: r.addressLocal,
        latitude: r.latitude,
        longitude: r.longitude,
      };
    });

    // 6-1️⃣ 단일 배치 내 placeId 중복 제거
    const seenPlaceIds = new Set<string>();
    const deduplicatedRestaurants = restaurants.filter((r) => {
      if (!r.placeId) return true;
      if (seenPlaceIds.has(r.placeId)) {
        this.logger.warn(
          `[Unified Search] 중복 placeId 제거: ${r.placeId} (${r.nameKo})`,
        );
        return false;
      }
      seenPlaceIds.add(r.placeId);
      return true;
    });

    // 7️⃣ 결과 로깅
    const successCount = deduplicatedRestaurants.filter(
      (r) => r.placeId,
    ).length;
    this.logger.log(
      `[Unified Search] 결과: ${successCount}/${deduplicatedRestaurants.length}개 placeId 획득`,
    );

    return {
      success: true,
      restaurants: deduplicatedRestaurants,
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
        `[Gemini JSON 복구] ${completeObjects.length}개 레스토랑 복구 성공`,
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
          `[Gemini JSON 추출] 여러 개의 코드블록이 감지되었습니다 (count=${allMatches.length}). 유효한 JSON을 찾습니다.`,
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
        `[Gemini JSON 추출] 유효한 JSON 블록을 찾지 못했습니다. 가장 긴 블록을 반환합니다 (length=${longestMatch[1].length}).`,
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
}
