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

@Entity('bug_report_admin_note')
export class BugReportAdminNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BugReport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bug_report_id' })
  @Index('idx_bug_report_admin_note_bug_report')
  bugReport: BugReport;

  @Column({ type: 'text' })
  content: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  @Index('idx_bug_report_admin_note_created_by')
  createdBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
