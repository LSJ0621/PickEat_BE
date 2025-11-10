import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { MenuRecommendation } from '../../menu/entities/menu-recommendation.entity';
import { UserPreferences } from '../interfaces/user-preferences.interface';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  profileImage: string;

  @Column()
  socialId: string;

  @Column()
  socialType: string;

  @Column({ default: 'USER' })
  role: string;

  @Column({ type: 'jsonb', nullable: true })
  preferences: UserPreferences | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @VersionColumn()
  version: number;

  @OneToMany(() => MenuRecommendation, (recommendation) => recommendation.user)
  recommendations: MenuRecommendation[];
}
