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
import { MenuSelection } from './menu-selection.entity';
import { PlaceRecommendation } from './place-recommendation.entity';

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

  @Column({ type: 'text', default: '' })
  reason: string;

  @Column('text')
  prompt: string;

  @Column({ type: 'text', nullable: false })
  requestAddress: string; // 서버에서 사용자 기본 주소를 조회하여 저장 (필수)

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
