import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisCacheService } from '@/common/cache/cache.service';
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
    private readonly cacheService: RedisCacheService,
  ) {}

  async getPreferences(entity: User): Promise<UserPreferences> {
    // 1. 캐시 조회
    const cached = await this.cacheService.getUserPreferences(entity.id);
    if (cached) {
      this.logger.debug(`[선호도 캐시 HIT] userId=${entity.id}`);
      return {
        likes: cached.likes,
        dislikes: cached.dislikes,
        analysis: cached.analysis,
        structuredAnalysis: cached.structuredAnalysis,
        analysisParagraphs: cached.analysisParagraphs,
        lastAnalyzedAt: cached.lastAnalyzedAt,
        analysisVersion: cached.analysisVersion,
      };
    }

    this.logger.debug(`[선호도 캐시 MISS] userId=${entity.id}`);

    // 2. DB 조회
    const preferences = entity.preferences ?? defaultUserPreferences();

    // Load taste analysis from separate table
    const tasteAnalysis = await this.userTasteAnalysisService.getByUserId(
      entity.id,
    );

    const result: UserPreferences = {
      likes: preferences.likes ?? [],
      dislikes: preferences.dislikes ?? [],
      analysis: preferences.analysis ?? undefined,
      structuredAnalysis: preferences.structuredAnalysis ?? undefined,
      analysisParagraphs: tasteAnalysis?.analysisParagraphs ?? undefined,
      lastAnalyzedAt: preferences.lastAnalyzedAt ?? undefined,
      analysisVersion: preferences.analysisVersion ?? undefined,
    };

    // 3. 캐시 저장 (비동기, 에러 무시)
    this.cacheService
      .setUserPreferences(entity.id, {
        likes: result.likes,
        dislikes: result.dislikes,
        analysis: result.analysis,
        structuredAnalysis: result.structuredAnalysis,
        analysisParagraphs: result.analysisParagraphs,
        lastAnalyzedAt: result.lastAnalyzedAt,
        analysisVersion: result.analysisVersion,
      })
      .catch((err) =>
        this.logger.warn(`선호도 캐시 저장 실패: ${err.message}`),
      );

    return result;
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

    // 캐시 무효화 (save 성공 후)
    await this.cacheService
      .invalidateUserPreferences(entity.id)
      .catch((err) => {
        this.logger.warn(`선호도 캐시 무효화 실패: ${err.message}`);
      });

    return entity.preferences;
  }

  /**
   * Updates user preference analysis (text only)
   */
  async updatePreferencesAnalysis(
    entity: User,
    analysis: string,
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

    // 캐시 무효화 (save 성공 후)
    await this.cacheService
      .invalidateUserPreferences(entity.id)
      .catch((err) => {
        this.logger.warn(`선호도 캐시 무효화 실패: ${err.message}`);
      });

    return entity.preferences;
  }

  private normalizeTags(tags: string[] = []): string[] {
    const sanitized = tags
      .map((tag) => tag?.trim())
      .filter((tag): tag is string => Boolean(tag && tag.length));
    return Array.from(new Set(sanitized));
  }
}
