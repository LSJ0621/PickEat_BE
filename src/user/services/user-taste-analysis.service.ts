import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserTasteAnalysis } from '../entities/user-taste-analysis.entity';
import { UserTasteAnalysisData } from '../interfaces/user-taste-analysis.interface';

@Injectable()
export class UserTasteAnalysisService {
  constructor(
    @InjectRepository(UserTasteAnalysis)
    private readonly repository: Repository<UserTasteAnalysis>,
  ) {}

  async getByUserId(userId: number): Promise<UserTasteAnalysis | null> {
    return this.repository.findOne({ where: { userId } });
  }

  async upsert(
    userId: number,
    data: UserTasteAnalysisData,
  ): Promise<UserTasteAnalysis> {
    const existing = await this.getByUserId(userId);

    if (existing) {
      // 데이터 변경 여부 확인
      const hasChanges =
        JSON.stringify(existing.stablePatterns) !==
          JSON.stringify(data.stablePatterns) ||
        JSON.stringify(existing.recentSignals) !==
          JSON.stringify(data.recentSignals) ||
        JSON.stringify(existing.diversityHints) !==
          JSON.stringify(data.diversityHints) ||
        existing.compactSummary !== data.compactSummary ||
        JSON.stringify(existing.analysisParagraphs) !==
          JSON.stringify(data.analysisParagraphs);

      if (!hasChanges) {
        return existing; // 변경 없으면 그대로 반환
      }

      // 변경 있을 때만 버전 증가
      Object.assign(existing, {
        ...data,
        lastAnalyzedAt: data.lastAnalyzedAt ?? new Date(),
        analysisVersion: (existing.analysisVersion ?? 0) + 1,
      });
      return this.repository.save(existing);
    }

    // 새 레코드 생성
    const newAnalysis = this.repository.create({
      userId,
      ...data,
      lastAnalyzedAt: data.lastAnalyzedAt ?? new Date(),
      analysisVersion: 1,
    });
    return this.repository.save(newAnalysis);
  }

  async bulkUpsert(
    items: { userId: number; data: UserTasteAnalysisData }[],
  ): Promise<void> {
    if (items.length === 0) return;

    const values = items.map((item) => ({
      userId: item.userId,
      stablePatterns: item.data.stablePatterns ?? null,
      recentSignals: item.data.recentSignals ?? null,
      diversityHints: item.data.diversityHints ?? null,
      compactSummary: item.data.compactSummary ?? null,
      analysisParagraphs: item.data.analysisParagraphs ?? null,
      lastAnalyzedAt: item.data.lastAnalyzedAt ?? new Date(),
    }));

    // 단일 DB 호출로 배치 처리
    await this.repository.upsert(values, {
      conflictPaths: ['userId'],
      skipUpdateIfNoValuesChanged: true,
    });
  }
}
