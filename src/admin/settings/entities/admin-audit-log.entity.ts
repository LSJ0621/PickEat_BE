import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '@/user/entities/user.entity';

@Entity('admin_audit_logs')
@Index('idx_audit_log_admin_action', ['adminId', 'action'])
@Index('idx_audit_log_created_at', ['createdAt'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'admin_id' })
  admin: User | null;

  @Column({ name: 'admin_id' })
  adminId: number;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  target: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'previous_value' })
  previousValue: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true, name: 'new_value' })
  newValue: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 45, name: 'ip_address' })
  ipAddress: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
