import { Injectable, Logger } from '@nestjs/common';
import { InvalidMenuRequestException } from '@/common/exceptions/invalid-menu-request.exception';
import { Gpt4oMiniValidationService } from '../gpt/gpt4o-mini-validation.service';
import { Gpt51MenuService } from '../gpt/gpt51-menu.service';
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
  ) {
    this.logger.log('Two-stage menu recommendation service initialized');
  }

  /**
   * 2단계 메뉴 추천 실행
   */
  async generateMenuRecommendations(
    prompt: string,
    likes: string[],
    dislikes: string[],
    analysis?: string,
  ): Promise<MenuRecommendationsResponse> {
    // Stage 1: 요청 검증 및 의도 분류
    this.logger.log('[Stage 1] 요청 검증 시작');
    const validationResult = await this.validationService.validateMenuRequest(
      prompt,
      likes,
      dislikes,
    );

    // Stage 1 검증 실패 (isValid=false)
    if (!validationResult.isValid) {
      this.logger.warn(
        `[Stage 1 validation failed] reason=${validationResult.invalidReason}`,
      );

      throw new InvalidMenuRequestException(
        '죄송합니다. 메뉴 추천과 관련 없는 요청입니다.\n음식 선택이나 식사와 관련된 내용으로 다시 요청해 주세요.',
      );
    }

    // Stage 1 성공: ValidationContext 구성
    const validationContext: ValidationContext = {
      intent: validationResult.intent,
      constraints: validationResult.constraints,
      suggestedCategories: validationResult.suggestedCategories,
    };

    this.logger.log(
      `[Stage 1 success] intent=${validationContext.intent}, categories=${validationContext.suggestedCategories.join(', ')}`,
    );

    // Stage 2: 심층 메뉴 추천 생성
    this.logger.log('[Stage 2] Menu recommendation generation started');
    const recommendations = await this.menuService.generateMenuRecommendations(
      prompt,
      likes,
      dislikes,
      analysis,
      validationContext,
    );

    this.logger.log(
      `[Stage 2 complete] Recommendation count: ${recommendations.recommendations.length}`,
    );

    return recommendations;
  }
}
