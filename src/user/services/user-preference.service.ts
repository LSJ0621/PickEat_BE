import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
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
  ) {}

  async getPreferences(entity: User): Promise<UserPreferences> {
    const preferences = entity.preferences ?? defaultUserPreferences();
    return {
      likes: preferences.likes ?? [],
      dislikes: preferences.dislikes ?? [],
      analysis: preferences.analysis ?? undefined,
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
    };

    await this.userRepository.save(entity);
    return entity.preferences;
  }

  async updatePreferencesAnalysis(
    entity: User,
    analysis: string,
  ): Promise<UserPreferences> {
    const currentPreferences = entity.preferences ?? defaultUserPreferences();

    entity.preferences = {
      likes: currentPreferences.likes,
      dislikes: currentPreferences.dislikes,
      analysis: analysis.trim(),
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
