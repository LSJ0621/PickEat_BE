import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '@/user/entities/user.entity';
import { MenuSelection } from './menu-selection.entity';
import { PlaceRecommendation } from './place-recommendation.entity';

@Entity()
@Index('idx_menu_recommendation_user_date', ['user', 'recommendedAt'])
@Index('idx_menu_recommendation_region', ['region'])
@Index('idx_menu_recommendation_created_at', ['createdAt'])
export class MenuRecommendation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.recommendations, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  user: User;

  @Column('text', { array: true })
  recommendations: string[];

  @Column({ type: 'text', default: '' })
  intro: string;

  @Column({ type: 'text', default: '' })
  closing: string;

  @Column({ type: 'jsonb', nullable: true })
  recommendationDetails: { condition: string; menu: string }[] | null;

  @Column('text')
  prompt: string;

  @Column({ type: 'text', nullable: false })
  requestAddress: string; // 서버에서 사용자 기본 주소를 조회하여 저장 (필수)

  /** 시/도명 (지역 분석용, requestAddress에서 추출) */
  @Column({ type: 'varchar', length: 20, nullable: true })
  region: string | null;

  @Column({ type: 'timestamptz' })
  recommendedAt: Date;

  @OneToMany(
    () => PlaceRecommendation,
    (placeRecommendation) => placeRecommendation.menuRecommendation,
  )
  placeRecommendations: PlaceRecommendation[];

  @OneToMany(() => MenuSelection, (selection) => selection.menuRecommendation)
  selections: MenuSelection[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
