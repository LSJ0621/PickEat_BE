import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    const tags = user.preferences?.tags ?? [];
    const recommendations =
      await this.openAiMenuService.generateMenuRecommendations(prompt, tags);
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
