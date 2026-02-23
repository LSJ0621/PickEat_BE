import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { WEB_SEARCH_CONFIG } from '@/external/openai/openai.constants';
import {
  getSystemPrompt,
  buildUserPromptWithAddress,
  buildUserProfile,
  getMenuRecommendationsJsonSchema,
  type StructuredAnalysis,
} from '@/external/openai/prompts';
import type { ValidationContext } from '@/menu/interfaces/menu-validation.interface';
import type { WebSearchSummary } from '@/menu/interfaces/web-search-summary.interface';
import { MenuRecommendationsResponse } from '../interface/menu-recommendation.interface';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { OpenAIResponseException } from '@/common/exceptions/openai-response.exception';
import {
  normalizeMenuNames,
  removeUrlsFromText,
} from '@/common/utils/ai-response.util';
import { retryWithExponentialBackoff } from '@/common/utils/retry.util';
import { WebSearchSummaryService } from './web-search-summary.service';

/**
 * GPT Web Search 기반 메뉴 추천 서비스 (2-Call 아키텍처)
 *
 * 기존 단일 web_search 호출의 토큰 폭증 문제(~13,000 input_tokens)를 해결하기 위해
 * 2-Call 아키텍처로 분리:
 *
 * [Call A] 웹 검색 요약 (gpt-4o-mini + web_search)
 * - 지역/인구통계 기반 트렌드 요약
 * - 7일 캐시로 반복 검색 방지
 * - ~500 토큰
 *
 * [Call B] 메뉴 추천 (gpt-5.1, web_search OFF)
 * - 기존 프롬프트 + Call A 요약
 * - Chat Completions API 사용
 * - ~2,500 토큰
 *
 * 예상 토큰 절감: ~13,000 → ~3,000 (일반) / ~2,500 (캐시 히트)
 */
@Injectable()
export class GptWebSearchMenuService {
  private readonly logger = new Logger(GptWebSearchMenuService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly webSearchSummaryService: WebSearchSummaryService,
  ) {
    const apiKey = this.configService.getOrThrow<string>('OPENAI_API_KEY');
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * 메뉴 추천 생성 (2-Call 아키텍처)
   *
   * Step 1: Call A - 웹 검색으로 지역/인구통계 트렌드 요약 (캐시 활용)
   * Step 2: Call B - 트렌드 요약을 포함하여 메뉴 추천 생성
   *
   * @param prompt - 사용자 요청
   * @param likes - 선호 음식 목록
   * @param dislikes - 비선호 음식 목록
   * @param analysis - 선호도 분석 결과
   * @param validationContext - Stage 1 검증 컨텍스트
   * @param userAddress - 사용자 주소
   * @param userBirthYear - 사용자 생년
   * @param userGender - 사용자 성별
   * @param language - 응답 언어
   * @param compactSummary - 간결한 선호도 요약
   * @param structuredAnalysis - 구조화된 선호도 분석
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
    this.logger.log(`[메뉴 추천 시작] 2-Call 아키텍처`);
    this.logger.log(`   사용자 주소: ${userAddress || '없음'}`);
    this.logger.log(`   언어: ${language}`);
    this.logger.debug(`   사용자 요청: ${prompt.substring(0, 100)}...`);
    this.logger.debug(`   선호: ${likes.join(', ') || '없음'}`);
    this.logger.debug(`   비선호: ${dislikes.join(', ') || '없음'}`);
    if (userBirthYear || userGender) {
      this.logger.debug(`   사용자 프로필: 제공됨`);
    }

    // ============================================================
    // Step 1: Call A - 웹 검색 요약 (실패해도 계속 진행)
    // ============================================================
    let webSearchSummary: WebSearchSummary | null = null;

    if (userAddress || userBirthYear || userGender) {
      try {
        webSearchSummary = await this.webSearchSummaryService.getSummary(
          userAddress,
          userBirthYear,
          userGender,
          language,
        );

        if (webSearchSummary) {
          this.logger.log(
            `[Call A 완료] confidence: ${webSearchSummary.confidence}`,
          );
          if (webSearchSummary.localTrends.length > 0) {
            this.logger.debug(
              `   지역 트렌드: ${webSearchSummary.localTrends.join(', ')}`,
            );
          }
          if (webSearchSummary.demographicFavorites.length > 0) {
            this.logger.debug(
              `   인구통계 인기: ${webSearchSummary.demographicFavorites.join(', ')}`,
            );
          }
        } else {
          this.logger.log(`[Call A 스킵] 웹 검색 조건 불충분`);
        }
      } catch (error) {
        this.logger.warn(
          `[Call A 실패] ${error instanceof Error ? error.message : String(error)} - Call B만 진행`,
        );
        // Call A 실패 시 null로 계속 진행
      }
    } else {
      this.logger.log(`[Call A 스킵] 주소/프로필 정보 없음`);
    }

    // ============================================================
    // Step 2: Call B - 메뉴 추천 (web_search OFF)
    // ============================================================
    this.logger.log(`[Call B 시작] 메뉴 추천 생성`);

    const systemPrompt = getSystemPrompt(language);

    // Build user profile for prompt
    const userProfile =
      userBirthYear || userGender
        ? buildUserProfile(userBirthYear, userGender, undefined, language)
        : undefined;

    // Build user prompt with Call A summary
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
      webSearchSummary, // Call A 결과 전달
    );

    const startTime = Date.now();

    try {
      // Call B: Chat Completions API (web_search 없음) with retry
      const response = await retryWithExponentialBackoff(
        () =>
          this.openai.chat.completions.create({
            model: WEB_SEARCH_CONFIG.MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'menu_recommendations',
                strict: true,
                schema: getMenuRecommendationsJsonSchema(language),
              },
            },
            max_completion_tokens: 800,
          }),
        {
          maxRetries: 1,
          initialDelayMs: 1000,
        },
        this.logger,
      );

      const duration = Date.now() - startTime;

      // Response success log
      this.logger.log(`[Call B 완료] 소요 시간: ${duration}ms`);

      const outputText = response.choices[0]?.message?.content || '';
      this.logger.debug(`[응답 원문] ${outputText.substring(0, 200)}...`);

      // Parse recommendations
      const parsed = this.parseRecommendationsFromResponse(outputText);

      // 필수 필드 검증 (BaseMenuService와 동일 수준)
      if (!parsed.recommendations.length) {
        throw new OpenAIResponseException('No recommendations found.', {
          outputText,
        });
      }
      if (!parsed.intro?.trim()) {
        throw new OpenAIResponseException('Intro text is missing.', parsed);
      }
      if (!parsed.closing?.trim()) {
        throw new OpenAIResponseException('Closing text is missing.', parsed);
      }

      // Recommendation result log
      const menuNames = parsed.recommendations.map((item) => item.menu);
      this.logger.log(`[추천 결과]`);
      this.logger.log(`   메뉴 수: ${parsed.recommendations.length}`);
      this.logger.log(`   추천 메뉴: ${menuNames.join(', ')}`);
      this.logger.log(`   첫 설명: ${parsed.intro.substring(0, 100)}...`);

      // Token usage log
      if (response.usage) {
        this.logger.log(`[Call B 토큰 사용량]`);
        this.logger.log(`   입력: ${response.usage.prompt_tokens}`);
        this.logger.log(`   출력: ${response.usage.completion_tokens}`);
        this.logger.log(`   총계: ${response.usage.total_tokens}`);
      }

      return parsed;
    } catch (error) {
      const duration = Date.now() - startTime;
      // Error log
      this.logger.error(`[Call B 실패] 소요 시간: ${duration}ms`);
      this.logger.error(
        `   에러: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw new ExternalApiException(
        'OpenAI',
        error instanceof Error ? error : undefined,
        'Failed to generate menu recommendations.',
      );
    }
  }

  /**
   * Chat Completions API 응답에서 메뉴 추천 파싱
   * @param outputText - API 응답 텍스트
   * @returns 파싱된 메뉴 추천
   */
  private parseRecommendationsFromResponse(
    outputText: string,
  ): MenuRecommendationsResponse {
    try {
      // Try to find JSON in the response
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : outputText;
      const parsed = JSON.parse(jsonText);
      return this.buildResponseFromParsed(parsed);
    } catch (error) {
      this.logger.warn(
        `JSON 파싱 실패, 텍스트에서 추출 시도: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fallback: extract menus from text
      return this.extractMenusFromText(outputText);
    }
  }

  /**
   * 파싱된 JSON 객체에서 MenuRecommendationsResponse 생성
   */
  private buildResponseFromParsed(parsed: {
    intro?: string;
    closing?: string;
    recommendations?: Array<{ condition: string; menu: string }>;
  }): MenuRecommendationsResponse {
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

    const result = {
      intro: text.substring(0, 200),
      recommendations: recommendations.slice(0, 5),
      closing: 'Enjoy your meal!',
    };

    // 폴백에서도 최소 1개 메뉴 필요
    if (!result.recommendations.length) {
      this.logger.error('폴백 추출 실패: 메뉴를 찾을 수 없음');
      throw new OpenAIResponseException(
        'Failed to extract menus from response.',
        { text },
      );
    }

    return result;
  }
}
