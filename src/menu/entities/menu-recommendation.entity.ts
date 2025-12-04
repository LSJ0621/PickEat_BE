import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SocialLogin } from '../../user/entities/social-login.entity';
import { User } from '../../user/entities/user.entity';
import { PlaceRecommendation } from './place-recommendation.entity';
import { MenuSelection } from './menu-selection.entity';

@Entity()
export class MenuRecommendation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.recommendations, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  user: User | null;

  @ManyToOne(() => SocialLogin, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  socialLogin: SocialLogin | null;

  @Column('text', { array: true })
  recommendations: string[];

  @Column('text')
  prompt: string;

  @Column({ type: 'text', nullable: true })
  requestAddress: string | null;

  @Column({ type: 'double precision', nullable: true })
  requestLocationLat: number | null;

  @Column({ type: 'double precision', nullable: true })
  requestLocationLng: number | null;

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
}
