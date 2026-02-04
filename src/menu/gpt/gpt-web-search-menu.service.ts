import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ResponsesApiOutputItem,
  OpenAIWithResponsesAPI,
  UrlCitationAnnotation,
  ResponsesApiOutputItemExtended,
} from '@/external/openai/openai.types';
import { WEB_SEARCH_CONFIG } from '@/external/openai/openai.constants';
import {
  getSystemPromptWithWebSearch,
  buildUserPromptWithAddress,
  buildUserProfile,
  type StructuredAnalysis,
} from '@/external/openai/prompts';
import type { ValidationContext } from '@/menu/interfaces/menu-validation.interface';
import { MenuRecommendationsResponse } from '../interface/menu-recommendation.interface';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import {
  normalizeMenuNames,
  removeUrlsFromText,
} from '@/common/utils/ai-response.util';

/**
 * GPT Web Search 기반 메뉴 추천 서비스
 * OpenAI Responses API와 web_search 도구를 사용하여 지역 기반 추천 제공
 */
@Injectable()
export class GptWebSearchMenuService {
  private readonly logger = new Logger(GptWebSearchMenuService.name);
  private readonly openai: OpenAIWithResponsesAPI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('OPENAI_API_KEY');
    this.openai = new OpenAI({ apiKey }) as OpenAIWithResponsesAPI;
  }

  /**
   * 메뉴 추천 생성
   * 사용자 주소가 제공되면 웹 검색을 활용하여 현지 인기 음식 추천
   * 사용자 프로필(생년, 성별)이 제공되면 인구통계 기반 맞춤 추천
   *
   * @param prompt - 사용자 요청
   * @param likes - 선호 음식 목록
   * @param dislikes - 비선호 음식 목록
   * @param analysis - 선호도 분석 결과
   * @param validationContext - Stage 1 검증 컨텍스트
   * @param userAddress - 사용자 주소 (웹 검색용)
   * @param userBirthYear - 사용자 생년 (웹 검색용)
   * @param userGender - 사용자 성별 (웹 검색용)
   * @param language - 응답 언어
   * @param compactSummary - 간결한 선호도 요약 (토큰 절감용)
   * @param structuredAnalysis - 구조화된 선호도 분석 (배치 작업 생성)
   * @returns 메뉴 추천 응답
   */
  async generateMenuRecommendations(
    prompt: string,
    likes: string[],
    dislikes: string[],
    analysis?: string,
    validationContext?: ValidationContext,
    userAddress?: string,
    userBirthYear?: number,
    userGender?: 'male' | 'female' | 'other',
    language: 'ko' | 'en' = 'ko',
    compactSummary?: string,
    structuredAnalysis?: StructuredAnalysis,
  ): Promise<MenuRecommendationsResponse> {
    // 1. Request start log
    this.logger.log(`🚀 [메뉴 추천 시작]`);
    this.logger.log(`   📍 사용자 주소: ${userAddress || '없음'}`);
    this.logger.log(`   🌐 언어: ${language}`);
    this.logger.debug(`   💬 사용자 요청: ${prompt.substring(0, 100)}...`);
    this.logger.debug(`   👍 선호: ${likes.join(', ') || '없음'}`);
    this.logger.debug(`   👎 비선호: ${dislikes.join(', ') || '없음'}`);
    if (userBirthYear || userGender) {
      this.logger.debug(`   👤 사용자 프로필: 제공됨`);
    }

    const systemPrompt = getSystemPromptWithWebSearch(language);

    // Build user profile for demographic-aware recommendations
    const userProfile =
      userBirthYear || userGender
        ? buildUserProfile(userBirthYear, userGender, undefined, language)
        : undefined;

    const userPrompt = buildUserPromptWithAddress(
      prompt,
      likes,
      dislikes,
      analysis,
      validationContext,
      userAddress,
      userProfile,
      language,
      compactSummary,
      structuredAnalysis,
    );

    // 2. Web search usage log
    if (userAddress || userProfile) {
      this.logger.log(
        `🔍 [웹 검색 활성화] ${userAddress ? '주소' : ''}${userAddress && userProfile ? ' + ' : ''}${userProfile ? '프로필' : ''} 기반 맞춤 추천`,
      );
      this.logger.log(`   🔎 검색 컨텍스트: ${WEB_SEARCH_CONFIG.CONTEXT_SIZE}`);
    } else {
      this.logger.log(
        `⚠️ [웹 검색 비활성화] 주소/프로필 없음 - 기존 로직으로 진행`,
      );
    }

    const startTime = Date.now();

    try {
      // 3. API call using Responses API
      const response = await this.openai.responses.create({
        model: WEB_SEARCH_CONFIG.MODEL,
        tools:
          userAddress || userProfile
            ? [
                {
                  type: 'web_search',
                  search_context_size: WEB_SEARCH_CONFIG.CONTEXT_SIZE,
                },
              ]
            : [],
        input: `${systemPrompt}\n\n${userPrompt}`,
      });

      const duration = Date.now() - startTime;

      // 4. Response success log
      this.logger.log(`✅ [API 응답 성공] 소요 시간: ${duration}ms`);

      // 디버깅용 원본 응답 출력 (INFO 레벨)
      this.logger.log(`📝 [OpenAI 원본 응답]`);
      this.logger.log(`   output_text: ${response.output_text}`);

      const annotations = this.extractAnnotations(
        response.output as ResponsesApiOutputItemExtended[],
      );
      this.logger.debug(`   annotations 수: ${annotations.length}`);
      if (annotations.length > 0) {
        this.logger.debug(`   annotations 상세:`);
        annotations.forEach((a, i) => {
          this.logger.debug(
            `     [${i}] type=${a.type}, start=${a.start_index}, end=${a.end_index}, url=${a.url.substring(0, 50)}...`,
          );
        });
      }

      // 5. Web search result log
      if (response.output) {
        const webSearchCalls = response.output.filter(
          (item: ResponsesApiOutputItem) => item.type === 'web_search_call',
        );
        if (webSearchCalls.length > 0) {
          this.logger.log(
            `🌐 [웹 검색 수행됨] 검색 횟수: ${webSearchCalls.length}`,
          );
          webSearchCalls.forEach(
            (call: ResponsesApiOutputItem, index: number) => {
              this.logger.log(
                `   검색 ${index + 1}: ${call.status || 'completed'}`,
              );
            },
          );
        } else {
          this.logger.log(`ℹ️ [웹 검색 미수행] GPT가 검색 불필요로 판단`);
        }
      }

      // 6. Parse recommendations
      const parsed = this.parseRecommendationsFromResponse(
        response.output_text,
        annotations,
      );

      // 🔍 처리 후 결과 로깅
      this.logger.debug(`✅ [Citation 제거 후]`);
      this.logger.debug(`   intro 길이: ${parsed.intro.length}`);
      this.logger.debug(
        `   intro (처음 200자): ${parsed.intro.substring(0, 200)}...`,
      );
      this.logger.debug(`   closing: ${parsed.closing}`);

      // 7. Recommendation result log
      const menuNames = parsed.recommendations.map((item) => item.menu);
      this.logger.log(`🍽️ [추천 결과]`);
      this.logger.log(`   메뉴 수: ${parsed.recommendations.length}`);
      this.logger.log(`   추천 메뉴: ${menuNames.join(', ')}`);
      this.logger.log(`   첫 설명: ${parsed.intro.substring(0, 100)}...`);

      // 8. Token usage log
      if (response.usage) {
        this.logger.log(`🧮 [토큰 사용량]`);
        this.logger.log(`   입력: ${response.usage.input_tokens}`);
        this.logger.log(`   출력: ${response.usage.output_tokens}`);
        this.logger.log(`   총계: ${response.usage.total_tokens}`);
      }

      return parsed;
    } catch (error) {
      const duration = Date.now() - startTime;
      // 9. Error log
      this.logger.error(`❌ [API 호출 실패] 소요 시간: ${duration}ms`);
      this.logger.error(
        `   에러: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.logger.warn(`🔄 [폴백] 기존 Chat Completions API로 재시도 필요`);

      throw new ExternalApiException(
        'OpenAI',
        error instanceof Error ? error : undefined,
        'Failed to generate menu recommendations using web search.',
      );
    }
  }

  /**
   * OpenAI Responses API output에서 annotations 추출
   */
  private extractAnnotations(
    output: ResponsesApiOutputItemExtended[],
  ): UrlCitationAnnotation[] {
    for (const item of output) {
      if (item.type === 'message' && item.content) {
        for (const content of item.content) {
          if (content.type === 'output_text' && content.annotations) {
            return content.annotations;
          }
        }
      }
    }
    return [];
  }

  /**
   * Responses API 응답에서 메뉴 추천 파싱
   * @param outputText - API 응답 텍스트
   * @param _annotations - URL citation 어노테이션 (현재 미사용, 디버깅 목적으로 유지)
   * @returns 파싱된 메뉴 추천
   */
  private parseRecommendationsFromResponse(
    outputText: string,
    _annotations: UrlCitationAnnotation[],
  ): MenuRecommendationsResponse {
    try {
      // Try to find JSON in the response
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Parse structured response format
        const intro = removeUrlsFromText(parsed.intro || '');
        const closing = removeUrlsFromText(parsed.closing || '');
        const recommendationItems = parsed.recommendations || [];

        // Normalize menu names in recommendations
        const normalizedRecommendations = recommendationItems.map(
          (item: { condition: string; menu: string }) => ({
            condition: item.condition,
            menu: normalizeMenuNames([item.menu])[0],
          }),
        );

        return {
          intro,
          recommendations: normalizedRecommendations,
          closing,
        };
      }

      // Fallback: try to parse entire response as JSON
      const parsed = JSON.parse(outputText);

      const intro = removeUrlsFromText(parsed.intro || '');
      const closing = removeUrlsFromText(parsed.closing || '');
      const recommendationItems = parsed.recommendations || [];

      const normalizedRecommendations = recommendationItems.map(
        (item: { condition: string; menu: string }) => ({
          condition: item.condition,
          menu: normalizeMenuNames([item.menu])[0],
        }),
      );

      return {
        intro,
        recommendations: normalizedRecommendations,
        closing,
      };
    } catch (error) {
      this.logger.warn(
        `JSON 파싱 실패, 텍스트에서 추출 시도: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fallback: extract menus from text
      return this.extractMenusFromText(outputText);
    }
  }

  /**
   * 텍스트에서 메뉴 추출 (폴백 로직)
   * @param text - 응답 텍스트
   * @returns 추출된 메뉴 추천
   */
  private extractMenusFromText(text: string): MenuRecommendationsResponse {
    // Simple extraction logic - find food names in text
    const lines = text.split('\n').filter((line) => line.trim());
    const recommendations: { condition: string; menu: string }[] = [];

    for (const line of lines) {
      // Look for numbered items or bullet points
      const match = line.match(/^[\d.\-*]\s*(.+?)(?:\s*[-:]\s*|$)/);
      if (match && match[1]) {
        const menu = match[1].trim();
        if (menu.length > 0 && menu.length < 50) {
          recommendations.push({
            condition: 'General recommendation',
            menu,
          });
        }
      }
    }

    return {
      intro: text.substring(0, 200),
      recommendations: recommendations.slice(0, 5),
      closing: 'Enjoy your meal!',
    };
  }
}
