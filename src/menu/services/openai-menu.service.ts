import { Injectable, Logger } from '@nestjs/common';
import type { StructuredAnalysis } from '@/user/interfaces/user-taste-analysis.interface';
import { MenuRecommendationsResponse } from '../interfaces/menu-recommendation.interface';
import { TwoStageMenuService } from './two-stage-menu.service';

/**
 * OpenAI 메뉴 추천 서비스
 * 2단계 추천 시스템 사용 (TwoStageMenuService)
 * Stage 1: GPT-4o-mini 검증, Stage 2: GPT-5.1 심층 추천
 */
@Injectable()
export class OpenAiMenuService {
  private readonly logger = new Logger(OpenAiMenuService.name);

  constructor(private readonly twoStageMenuService: TwoStageMenuService) {
    this.logger.log(
      'Two-stage menu recommendation service active (Stage 1: GPT-4o-mini, Stage 2: GPT-5.1)',
    );
  }

  async generateMenuRecommendations(
    prompt: string,
    likes: string[],
    dislikes: string[],
    analysis?: string,
    language: 'ko' | 'en' = 'ko',
    userAddress?: string,
    userBirthYear?: number,
    userGender?: 'male' | 'female' | 'other' | null,
    compactSummary?: string,
    structuredAnalysis?: StructuredAnalysis,
  ): Promise<MenuRecommendationsResponse> {
    return this.twoStageMenuService.generateMenuRecommendations(
      prompt,
      likes,
      dislikes,
      analysis,
      language,
      userAddress,
      userBirthYear,
      userGender ?? undefined, // null을 undefined로 변환
      compactSummary,
      structuredAnalysis,
    );
  }
}
