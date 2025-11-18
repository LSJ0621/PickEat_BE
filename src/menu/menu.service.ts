import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialLogin } from '../user/entities/social-login.entity';
import { User } from '../user/entities/user.entity';
import { MenuRecommendation } from './entities/menu-recommendation.entity';
import { OpenAiMenuService } from './openai-menu.service';

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(MenuRecommendation)
    private readonly recommendationRepository: Repository<MenuRecommendation>,
    private readonly openAiMenuService: OpenAiMenuService,
  ) {}

  async recommendForUser(user: User, prompt: string) {
    // 좋아하는 것과 싫어하는 것을 모두 전달
    const likes = user.preferences?.likes ?? [];
    const dislikes = user.preferences?.dislikes ?? [];
    const recommendations =
      await this.openAiMenuService.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );
    const record = this.recommendationRepository.create({
      user,
      prompt,
      recommendations,
      recommendedAt: new Date(),
    });
    await this.recommendationRepository.save(record);
    return {
      recommendations: record.recommendations,
      recommendedAt: record.recommendedAt,
    };
  }

  async recommendForSocialLogin(
    socialLogin: SocialLogin,
    prompt: string,
  ) {
    // 좋아하는 것과 싫어하는 것을 모두 전달
    const likes = socialLogin.preferences?.likes ?? [];
    const dislikes = socialLogin.preferences?.dislikes ?? [];
    const recommendations =
      await this.openAiMenuService.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );
    const record = this.recommendationRepository.create({
      socialLogin,
      prompt,
      recommendations,
      recommendedAt: new Date(),
    });
    await this.recommendationRepository.save(record);
    return {
      recommendations: record.recommendations,
      recommendedAt: record.recommendedAt,
    };
  }

  async getHistory(user: User, date?: string) {
    const qb = this.recommendationRepository
      .createQueryBuilder('recommendation')
      .where('recommendation.userId = :userId', { userId: user.id })
      .orderBy('recommendation.recommendedAt', 'DESC');

    if (date) {
      const { start, end } = this.calculateDateRange(date);
      qb.andWhere('recommendation.recommendedAt >= :start', { start });
      qb.andWhere('recommendation.recommendedAt < :end', { end });
    }

    const history = await qb.getMany();
    return {
      history: history.map((item) => ({
        id: item.id,
        recommendations: item.recommendations,
        prompt: item.prompt,
        recommendedAt: item.recommendedAt,
      })),
    };
  }

  async getHistoryForSocialLogin(socialLogin: SocialLogin, date?: string) {
    const qb = this.recommendationRepository
      .createQueryBuilder('recommendation')
      .where('recommendation.socialLoginId = :socialLoginId', {
        socialLoginId: socialLogin.id,
      })
      .orderBy('recommendation.recommendedAt', 'DESC');

    if (date) {
      const { start, end } = this.calculateDateRange(date);
      qb.andWhere('recommendation.recommendedAt >= :start', { start });
      qb.andWhere('recommendation.recommendedAt < :end', { end });
    }

    const history = await qb.getMany();
    return {
      history: history.map((item) => ({
        id: item.id,
        recommendations: item.recommendations,
        prompt: item.prompt,
        recommendedAt: item.recommendedAt,
      })),
    };
  }

  private calculateDateRange(date: string) {
    const start = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('Invalid date parameter');
    }
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
}
