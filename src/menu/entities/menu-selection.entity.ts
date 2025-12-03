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
import { MenuSlotPayload } from '../types/menu-selection.types';
import { MenuRecommendation } from './menu-recommendation.entity';

export enum MenuSelectionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Entity()
export class MenuSelection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'jsonb' })
  menuPayload: MenuSlotPayload;

  @Column({
    type: 'enum',
    enum: MenuSelectionStatus,
    default: MenuSelectionStatus.PENDING,
  })
  status: MenuSelectionStatus;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  selectedAt: Date;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  selectedDate: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastTriedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @ManyToOne(() => User, (user) => user.menuSelections, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  user: User | null;

  @ManyToOne(() => SocialLogin, (socialLogin) => socialLogin.menuSelections, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  socialLogin: SocialLogin | null;

  @ManyToOne(
    () => MenuRecommendation,
    (recommendation) => recommendation.selections,
    { nullable: true, onDelete: 'SET NULL' },
  )
  menuRecommendation: MenuRecommendation | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
