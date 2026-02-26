import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { WEB_SEARCH_CONFIG } from '@/external/openai/openai.constants';
import { OpenAIWithResponsesAPI } from '@/external/openai/openai.types';
import {
  getWebSearchSummarySystemPrompt,
  buildWebSearchSummaryPrompt,
} from '@/external/openai/prompts/web-search-summary.prompts';
import {
  getAgeGroup,
  getAgeGroupEN,
} from '@/external/openai/prompts/menu-recommendation.prompts';
import { RedisCacheService } from '@/common/cache/cache.service';
import type { WebSearchSummary } from '@/menu/interfaces/web-search-summary.interface';

/**
 * 웹 검색 요약 서비스 (Call A)
 * 지역/인구통계 기반 음식 트렌드를 웹 검색으로 수집하고 요약
 *
 * 특징:
 * - gpt-4o-mini 사용 (경량 모델)
 * - web_search 도구로 실시간 트렌드 수집
 * - 7일 TTL 캐시로 반복 검색 방지
 */
@Injectable()
export class WebSearchSummaryService {
  private readonly logger = new Logger(WebSearchSummaryService.name);
  private readonly openai: OpenAIWithResponsesAPI;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: RedisCacheService,
  ) {
    const apiKey = this.configService.getOrThrow<string>('OPENAI_API_KEY');
    this.openai = new OpenAI({ apiKey }) as OpenAIWithResponsesAPI;
  }

  /**
   * 웹 검색 요약 조회 (캐시 우선)
   *
   * @param userAddress - 사용자 주소
   * @param userBirthYear - 사용자 생년
   * @param userGender - 사용자 성별
   * @param language - 응답 언어
   * @returns 웹 검색 요약 또는 null (실패 시)
   */
  async getSummary(
    userAddress?: string,
    userBirthYear?: number,
    userGender?: string,
    language: 'ko' | 'en' = 'ko',
  ): Promise<WebSearchSummary | null> {
    // 주소나 프로필 정보가 없으면 웹 검색 불필요
    if (!userAddress && !userBirthYear && !userGender) {
      this.logger.debug('[Call A 스킵] 주소/프로필 정보 없음');
      return null;
    }

    // 1. 캐시 확인
    try {
      const cached = await this.cacheService.getWebSearchSummary(
        userAddress,
        userBirthYear,
        userGender,
      );

      if (cached) {
        this.logger.log(
          `✅ [Call A 캐시 HIT] confidence: ${cached.confidence}`,
        );
        return {
          localTrends: cached.localTrends,
          demographicFavorites: cached.demographicFavorites,
          seasonalItems: cached.seasonalItems,
          confidence: cached.confidence,
          summary: cached.summary,
        };
      }
    } catch (error) {
      this.logger.warn(
        `⚠️ [캐시 조회 실패] ${error instanceof Error ? error.message : String(error)}`,
      );
      // 캐시 실패 시 계속 진행
    }

    // 2. Call A 실행 (gpt-4o-mini + web_search)
    this.logger.log(`🔍 [Call A 시작] 웹 검색 요약 생성`);
    this.logger.debug(`   주소: ${userAddress || '없음'}`);
    this.logger.debug(`   생년: ${userBirthYear || '없음'}`);
    this.logger.debug(`   성별: ${userGender || '없음'}`);

    const startTime = Date.now();

    try {
      // 연령대 계산
      const ageGroup = userBirthYear
        ? language === 'en'
          ? getAgeGroupEN(userBirthYear)
          : getAgeGroup(userBirthYear)
        : undefined;

      // 성별 변환
      const genderLabel = this.getGenderLabel(userGender, language);

      // 프롬프트 생성
      const systemPrompt = getWebSearchSummarySystemPrompt(language);
      const userPrompt = buildWebSearchSummaryPrompt(
        userAddress,
        ageGroup,
        genderLabel,
        language,
      );

      const response = await this.openai.responses.create({
        model: WEB_SEARCH_CONFIG.SUMMARY_MODEL,
        tools: [
          {
            type: 'web_search',
            search_context_size: WEB_SEARCH_CONFIG.CONTEXT_SIZE,
          },
        ],
        max_tool_calls: WEB_SEARCH_CONFIG.MAX_TOOL_CALLS,
        input: `${systemPrompt}\n\n${userPrompt}`,
      });

      const duration = Date.now() - startTime;
      this.logger.log(`[Call A 완료] 소요 시간: ${duration}ms`);

      // 토큰 사용량 로깅
      if (response.usage) {
        this.logger.log(
          `   토큰: 입력 ${response.usage.input_tokens} / 출력 ${response.usage.output_tokens}`,
        );
      }

      // 원본 응답 로깅
      this.logger.log(`[Call A 원본 응답]`);
      this.logger.log(`   ${response.output_text}`);

      // 3. 응답 파싱
      const summary = this.parseSummary(response.output_text);

      // 파싱 결과 로깅
      this.logger.log(`[Call A 파싱 결과]`);
      this.logger.log(`   confidence: ${summary.confidence}`);
      this.logger.log(
        `   localTrends: ${summary.localTrends.length > 0 ? summary.localTrends.join(', ') : '없음'}`,
      );
      this.logger.log(
        `   demographicFavorites: ${summary.demographicFavorites.length > 0 ? summary.demographicFavorites.join(', ') : '없음'}`,
      );
      this.logger.log(
        `   seasonalItems: ${summary.seasonalItems.length > 0 ? summary.seasonalItems.join(', ') : '없음'}`,
      );
      this.logger.log(`   summary: ${summary.summary || '없음'}`);

      // 4. 캐시 저장
      try {
        await this.cacheService.setWebSearchSummary(
          userAddress,
          userBirthYear,
          userGender,
          {
            ...summary,
            searchedAt: new Date().toISOString(),
          },
        );
        this.logger.debug('[캐시 저장 완료]');
      } catch (cacheError) {
        this.logger.warn(
          `[캐시 저장 실패] ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`,
        );
        // 캐시 저장 실패해도 결과는 반환
      }

      return summary;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`[Call A 실패] 소요 시간: ${duration}ms`);
      this.logger.error(
        `   에러: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Call A 실패 시 null 반환 (Call B만 진행)
      return null;
    }
  }

  /**
   * 성별 라벨 변환
   */
  private getGenderLabel(
    gender?: string,
    language: 'ko' | 'en' = 'ko',
  ): string | undefined {
    if (!gender) return undefined;

    const genderMap: Record<string, Record<string, string>> = {
      ko: {
        male: '남성',
        female: '여성',
        other: '기타',
      },
      en: {
        male: 'Male',
        female: 'Female',
        other: 'Other',
      },
    };

    return genderMap[language][gender] || gender;
  }

  /**
   * API 응답에서 요약 파싱
   */
  private parseSummary(outputText: string): WebSearchSummary {
    try {
      // JSON 추출 시도
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        return {
          localTrends: Array.isArray(parsed.localTrends)
            ? parsed.localTrends.slice(0, 3)
            : [],
          demographicFavorites: Array.isArray(parsed.demographicFavorites)
            ? parsed.demographicFavorites.slice(0, 3)
            : [],
          seasonalItems: Array.isArray(parsed.seasonalItems)
            ? parsed.seasonalItems.slice(0, 2)
            : [],
          confidence: this.validateConfidence(parsed.confidence),
          summary:
            typeof parsed.summary === 'string'
              ? parsed.summary.substring(0, 100)
              : '',
        };
      }

      // JSON 파싱 실패 시 low confidence 반환
      this.logger.warn('[파싱 실패] JSON 형식 아님, low confidence 반환');
      return this.getEmptySummary('low');
    } catch (error) {
      this.logger.warn(
        `[파싱 에러] ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.getEmptySummary('low');
    }
  }

  /**
   * confidence 값 검증
   */
  private validateConfidence(value: unknown): 'high' | 'medium' | 'low' {
    if (value === 'high' || value === 'medium' || value === 'low') {
      return value;
    }
    return 'low';
  }

  /**
   * 빈 요약 반환 (실패/불충분 시)
   */
  private getEmptySummary(
    confidence: 'high' | 'medium' | 'low',
  ): WebSearchSummary {
    return {
      localTrends: [],
      demographicFavorites: [],
      seasonalItems: [],
      confidence,
      summary: '',
    };
  }
}
