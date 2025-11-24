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

  /**
   * 추천 유형
   * - 'MENU'  : 기존 메뉴 추천 이력
   * - 'PLACE' : Google Places + LLM 기반 가게 추천 이력
   */
  @Column({ type: 'varchar', length: 20, default: 'MENU' })
  type: 'MENU' | 'PLACE';

  @Column('text', { array: true })
  recommendations: string[];

  @Column('text')
  prompt: string;

  /**
   * (옵션) 추천 요청 시 기준이 된 주소/위치
   * - 메뉴 추천 이력의 경우에는 사용하지 않을 수 있음
   * - 가게 추천(type = 'PLACE')의 경우 사용자가 검색한 주소/쿼리를 저장해둘 수 있음
   */
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
