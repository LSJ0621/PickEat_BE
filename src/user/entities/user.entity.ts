import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { UserPreferences } from '../interfaces/user-preferences.interface';
import { UserAddress } from './user-address.entity';
import { UserTasteAnalysis } from './user-taste-analysis.entity';

@Entity()
@Index('idx_user_role', ['role'])
@Index('idx_user_social_type', ['socialType'])
@Index('idx_user_deactivated', ['isDeactivated'])
@Index('idx_user_deleted_deactivated', ['deletedAt', 'isDeactivated'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  password: string | null;

  @Column({ type: 'varchar', nullable: true })
  socialId: string | null;

  @Column({ type: 'varchar', nullable: true })
  socialType: string | null;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  birthDate: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  gender: 'male' | 'female' | 'other' | null;

  @Column({ default: 'USER' })
  role: string;

  @Column({ type: 'jsonb', nullable: true })
  preferences: UserPreferences | null;

  @Column({ type: 'varchar', default: 'ko' })
  preferredLanguage: 'ko' | 'en';

  @Column({ type: 'text', nullable: true })
  refreshToken: string | null;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ default: false })
  reRegisterEmailVerified: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastPasswordChangedAt: Date | null;

  @Column({ default: false, name: 'is_deactivated' })
  isDeactivated: boolean;

  @Column({ type: 'timestamp', nullable: true, name: 'deactivated_at' })
  deactivatedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'last_active_at' })
  lastActiveAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'last_login_at' })
  lastLoginAt: Date | null;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => MenuRecommendation, (recommendation) => recommendation.user)
  recommendations: MenuRecommendation[];

  @OneToMany(() => MenuSelection, (selection) => selection.user)
  menuSelections: MenuSelection[];

  @OneToMany(() => UserAddress, (address) => address.user, {
    cascade: true,
  })
  addresses: UserAddress[];

  @OneToOne(() => UserTasteAnalysis, (analysis) => analysis.user)
  tasteAnalysis: UserTasteAnalysis | null;
}
