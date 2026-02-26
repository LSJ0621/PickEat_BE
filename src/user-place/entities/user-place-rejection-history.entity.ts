import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '@/user/entities/user.entity';
import { UserPlace } from './user-place.entity';

@Entity('user_place_rejection_history')
export class UserPlaceRejectionHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserPlace, { nullable: false, onDelete: 'CASCADE' })
  @Index('idx_user_place_rejection_history_user_place')
  userPlace: UserPlace;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @Index('idx_user_place_rejection_history_admin')
  admin: User;

  @Column({ type: 'text' })
  reason: string;

  @CreateDateColumn({ name: 'rejected_at' })
  rejectedAt: Date;
}
