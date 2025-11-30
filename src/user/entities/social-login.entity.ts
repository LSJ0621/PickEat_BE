import {
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    VersionColumn,
} from 'typeorm';
import { UserPreferences } from '../interfaces/user-preferences.interface';

@Entity('social_login')
export class SocialLogin {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  socialId: string;

  @Column()
  socialType: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  profileImage: string;

  @Column({ default: 'USER' })
  role: string;

  @Column({ type: 'jsonb', nullable: true })
  preferences: UserPreferences | null;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  @Column({ type: 'text', nullable: true })
  refreshToken: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @VersionColumn()
  version: number;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

