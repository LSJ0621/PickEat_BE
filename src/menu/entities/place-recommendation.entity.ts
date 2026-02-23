import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  UpdateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MenuRecommendation } from './menu-recommendation.entity';
import { PlaceRecommendationSource } from '../enum/place-recommendation-source.enum';
import { UserPlace } from '@/user-place/entities/user-place.entity';

@Entity()
@Index('idx_place_recommendation_menu', ['menuRecommendation'])
export class PlaceRecommendation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(
    () => MenuRecommendation,
    (recommendation) => recommendation.placeRecommendations,
    {
      onDelete: 'CASCADE',
    },
  )
  menuRecommendation: MenuRecommendation;

  @Column({ type: 'varchar', length: 255 })
  placeId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'jsonb', default: [] })
  reasonTags: string[];

  @Column({ type: 'text', nullable: true })
  menuName: string | null;

  @Column({
    type: 'enum',
    enum: PlaceRecommendationSource,
    default: PlaceRecommendationSource.GOOGLE,
  })
  @Index('idx_place_recommendation_source')
  source: PlaceRecommendationSource;

  @ManyToOne(() => UserPlace, { nullable: true, onDelete: 'SET NULL' })
  @Index('idx_place_recommendation_user_place')
  userPlace: UserPlace | null;

  // === NEW: 다국어 가게 정보 (Gemini 응답에서 영구 저장) ===

  @Column({ type: 'varchar', length: 500, nullable: true })
  nameKo: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  nameEn: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  nameLocal: string | null;

  @Column({ type: 'text', nullable: true })
  addressKo: string | null;

  @Column({ type: 'text', nullable: true })
  addressEn: string | null;

  @Column({ type: 'text', nullable: true })
  addressLocal: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  placeLatitude: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 7, nullable: true })
  placeLongitude: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
