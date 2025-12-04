import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MenuRecommendation } from './menu-recommendation.entity';

@Entity()
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
}
