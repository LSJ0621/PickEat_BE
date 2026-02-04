import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { AnalysisParagraphs } from '../interfaces/user-taste-analysis.interface';

@Entity('user_taste_analysis')
@Index('idx_taste_analysis_user_id', ['userId'], { unique: true })
@Index('idx_taste_analysis_last_analyzed_at', ['lastAnalyzedAt'])
export class UserTasteAnalysis {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @OneToOne(() => User, (user) => user.tasteAnalysis)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'jsonb', nullable: true })
  stablePatterns: {
    categories: string[];
    flavors: string[];
    cookingMethods: string[];
    confidence: 'low' | 'medium' | 'high';
  } | null;

  @Column({ type: 'jsonb', nullable: true })
  recentSignals: {
    trending: string[];
    declining: string[];
  } | null;

  @Column({ type: 'jsonb', nullable: true })
  diversityHints: {
    explorationAreas: string[];
    rotationSuggestions: string[];
  } | null;

  /**
   * 메뉴 추천 API용 간결한 요약 (100자 이내)
   * 배치 작업에서 LLM이 생성
   * 예: "한식 선호, 국물류 좋아함, 매운맛 OK, 최근 중식에 관심, 일식 탐색 가능"
   */
  @Column({ type: 'text', nullable: true })
  compactSummary: string | null;

  /**
   * 3문단으로 구조화된 취향 분석
   * - paragraph1: 장기적 취향 패턴 (60-130자)
   * - paragraph2: 최근 변화 및 시간대 특징 (60-130자)
   * - paragraph3: 새로운 시도 추천 (60-130자)
   */
  @Column({ type: 'jsonb', nullable: true })
  analysisParagraphs: AnalysisParagraphs | null;

  @Column({ type: 'int', default: 1 })
  analysisVersion: number;

  @Column({ type: 'timestamptz' })
  lastAnalyzedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
