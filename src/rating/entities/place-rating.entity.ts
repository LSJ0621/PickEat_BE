import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '@/user/entities/user.entity';
import { PlaceRecommendation } from '@/menu/entities/place-recommendation.entity';

@Entity('place_rating')
@Index('idx_place_rating_user_pending', [
  'user',
  'rating',
  'skipped',
  'promptDismissed',
])
@Index('idx_place_rating_place_id', ['placeId'])
export class PlaceRating {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  placeId: string;

  @Column({ type: 'varchar', length: 200 })
  placeName: string;

  @ManyToOne(() => PlaceRecommendation, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  placeRecommendation: PlaceRecommendation | null;

  @Column({ type: 'int', nullable: true })
  rating: number | null;

  @Column({ type: 'boolean', default: false })
  skipped: boolean;

  @Column({ type: 'boolean', default: false })
  promptDismissed: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
