import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserTasteAnalysisService } from './user-taste-analysis.service';
import {
  defaultUserPreferences,
  UserPreferences,
} from '../interfaces/user-preferences.interface';

@Injectable()
export class UserPreferenceService {
  private readonly logger = new Logger(UserPreferenceService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly userTasteAnalysisService: UserTasteAnalysisService,
  ) {}

  async getPreferences(entity: User): Promise<UserPreferences> {
    const preferences = entity.preferences ?? defaultUserPreferences();

    // Load taste analysis from separate table
    const tasteAnalysis = await this.userTasteAnalysisService.getByUserId(
      entity.id,
    );

    return {
      likes: preferences.likes ?? [],
      dislikes: preferences.dislikes ?? [],
      analysis: preferences.analysis ?? undefined,
      structuredAnalysis: preferences.structuredAnalysis ?? undefined,
      analysisParagraphs: tasteAnalysis?.analysisParagraphs ?? undefined,
      lastAnalyzedAt: preferences.lastAnalyzedAt ?? undefined,
      analysisVersion: preferences.analysisVersion ?? undefined,
    };
  }

  async updatePreferences(
    entity: User,
    likes?: string[],
    dislikes?: string[],
  ): Promise<UserPreferences> {
    const currentPreferences = entity.preferences ?? defaultUserPreferences();

    const normalizedLikes =
      likes !== undefined
        ? this.normalizeTags(likes)
        : currentPreferences.likes;
    const normalizedDislikes =
      dislikes !== undefined
        ? this.normalizeTags(dislikes)
        : currentPreferences.dislikes;

    entity.preferences = {
      likes: normalizedLikes,
      dislikes: normalizedDislikes,
      analysis: currentPreferences.analysis,
      structuredAnalysis: currentPreferences.structuredAnalysis,
      lastAnalyzedAt: currentPreferences.lastAnalyzedAt,
      analysisVersion: currentPreferences.analysisVersion,
    };

    await this.userRepository.save(entity);
    return entity.preferences;
  }

  /**
   * Updates user preference analysis (text only)
   * @deprecated structuredAnalysis parameter - use UserTasteAnalysisService instead
   */
  async updatePreferencesAnalysis(
    entity: User,
    analysis: string,
    /** @deprecated structuredAnalysis is now saved in UserTasteAnalysis table */
    _structuredAnalysis?: {
      stablePatterns?: {
        categories: string[];
        flavors: string[];
        cookingMethods: string[];
        confidence: 'low' | 'medium' | 'high';
      };
      recentSignals?: {
        trending: string[];
        declining: string[];
      };
      diversityHints?: {
        explorationAreas: string[];
        rotationSuggestions: string[];
      };
    },
  ): Promise<UserPreferences> {
    const currentPreferences = entity.preferences ?? defaultUserPreferences();

    // structuredAnalysis는 더 이상 여기서 저장하지 않음
    // UserTasteAnalysisService에서 별도 처리
    entity.preferences = {
      likes: currentPreferences.likes,
      dislikes: currentPreferences.dislikes,
      analysis: analysis.trim(),
      structuredAnalysis: currentPreferences.structuredAnalysis, // 기존 값 유지 (변경 안 함)
      lastAnalyzedAt: new Date().toISOString(),
      analysisVersion: (currentPreferences.analysisVersion || 0) + 1,
    };

    await this.userRepository.save(entity);
    return entity.preferences;
  }

  private normalizeTags(tags: string[] = []): string[] {
    const sanitized = tags
      .map((tag) => tag?.trim())
      .filter((tag): tag is string => Boolean(tag && tag.length));
    return Array.from(new Set(sanitized));
  }
}
