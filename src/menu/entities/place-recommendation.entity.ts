import {
  Column,
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
}
