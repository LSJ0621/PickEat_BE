import {
  Column,
  CreateDateColumn,
  Entity,
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
  userPlace: UserPlace;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  admin: User;

  @Column({ type: 'text' })
  reason: string;

  @CreateDateColumn({ name: 'rejected_at' })
  rejectedAt: Date;
}
