import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SocialLogin } from '../../user/entities/social-login.entity';
import { User } from '../../user/entities/user.entity';

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

  @Column({ type: 'timestamptz' })
  recommendedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
