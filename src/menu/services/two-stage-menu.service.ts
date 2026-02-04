import { Injectable, Logger } from '@nestjs/common';
import { InvalidMenuRequestException } from '@/common/exceptions/invalid-menu-request.exception';
import type { StructuredAnalysis } from '@/external/openai/prompts';
import { Gpt4oMiniValidationService } from '../gpt/gpt4o-mini-validation.service';
import { Gpt51MenuService } from '../gpt/gpt51-menu.service';
import { GptWebSearchMenuService } from '../gpt/gpt-web-search-menu.service';
import { MenuRecommendationsResponse } from '../interface/menu-recommendation.interface';
import { ValidationContext } from '../interfaces/menu-validation.interface';

/**
 * 2단계 메뉴 추천 오케스트레이터
 * Stage 1: GPT-4o-mini로 요청 검증 및 의도 분류
 * Stage 2: GPT-5.1로 심층 메뉴 추천 (Stage 1 성공 시에만 실행)
 */
@Injectable()
export class TwoStageMenuService {
  private readonly logger = new Logger(TwoStageMenuService.name);

  constructor(
    private readonly validationService: Gpt4oMiniValidationService,
    private readonly menuService: Gpt51MenuService,
    private readonly gptWebSearchMenuService: GptWebSearchMenuService,
  ) {
    this.logger.log('Two-stage menu recommendation service initialized');
  }

  /**
   * 2단계 메뉴 추천 실행
   * @param userAddress - 사용자 주소 (웹 검색용, 선택사항)
   * @param userBirthYear - 사용자 생년 (웹 검색용, 선택사항)
   * @param userGender - 사용자 성별 (웹 검색용, 선택사항)
   * @param compactSummary - 간결한 선호도 요약 (토큰 절감용)
   * @param structuredAnalysis - 구조화된 선호도 분석 (배치 작업 생성)
   */
  async generateMenuRecommendations(
    prompt: string,
    likes: string[],
    dislikes: string[],
    analysis?: string,
    language: 'ko' | 'en' = 'ko',
    userAddress?: string,
    userBirthYear?: number,
    userGender?: 'male' | 'female' | 'other',
    compactSummary?: string,
    structuredAnalysis?: StructuredAnalysis,
  ): Promise<MenuRecommendationsResponse> {
    // Stage 1: 요청 검증 및 의도 분류
    this.logger.log('📋 [Stage 1: 검증 시작] GPT-4o-mini');
    const validationResult = await this.validationService.validateMenuRequest(
      prompt,
      likes,
      dislikes,
      language,
    );

    // Stage 1 검증 실패 (isValid=false)
    if (!validationResult.isValid) {
      this.logger.warn(
        `[Stage 1 validation failed] reason=${validationResult.invalidReason}`,
      );

      throw new InvalidMenuRequestException(
        'Sorry, this request is not related to menu recommendations.\nPlease request something related to food selection or dining.',
      );
    }

    // Stage 1 성공: ValidationContext 구성
    const validationContext: ValidationContext = {
      intent: validationResult.intent,
      constraints: validationResult.constraints || {
        budget: 'medium' as const,
        dietary: [],
        urgency: 'normal' as const,
      },
      suggestedCategories: validationResult.suggestedCategories || [],
    };

    this.logger.log('✅ [Stage 1: 검증 완료]');
    this.logger.log(`   유효성: ${validationResult.isValid}`);
    this.logger.log(`   의도: ${validationContext.intent}`);

    // Stage 2: 심층 메뉴 추천 생성
    this.logger.log('🍽️ [Stage 2: 추천 시작] GPT-5.1 + web_search');
    this.logger.log(`   사용자 주소: ${userAddress || '없음'}`);
    if (userBirthYear || userGender) {
      this.logger.log(`   사용자 프로필: 제공됨`);
    }

    let recommendations: MenuRecommendationsResponse;

    if (userAddress || userBirthYear || userGender) {
      // Use web search for location and demographic-aware recommendations
      recommendations =
        await this.gptWebSearchMenuService.generateMenuRecommendations(
          prompt,
          likes,
          dislikes,
          analysis,
          validationContext,
          userAddress,
          userBirthYear,
          userGender,
          language,
          compactSummary,
          structuredAnalysis,
        );
    } else {
      // Fallback to existing service without web search
      recommendations = await this.menuService.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        analysis,
        validationContext,
        language,
        compactSummary,
        structuredAnalysis,
      );
    }

    this.logger.log('✅ [Stage 2: 추천 완료]');

    return recommendations;
  }
}
