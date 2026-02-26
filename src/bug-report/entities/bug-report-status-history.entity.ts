import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '@/user/entities/user.entity';
import { BugReport } from './bug-report.entity';

@Entity('bug_report_status_history')
export class BugReportStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BugReport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bug_report_id' })
  @Index('idx_bug_report_status_history_bug_report')
  bugReport: BugReport;

  @Column({ type: 'varchar', length: 20, name: 'previous_status' })
  previousStatus: string;

  @Column({ type: 'varchar', length: 20 })
  status: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'changed_by_id' })
  @Index('idx_bug_report_status_history_changed_by')
  changedBy: User | null;

  @CreateDateColumn({ name: 'changed_at' })
  changedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
