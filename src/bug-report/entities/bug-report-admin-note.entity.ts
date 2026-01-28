import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { BugReport } from './bug-report.entity';

@Entity('bug_report_admin_note')
export class BugReportAdminNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BugReport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bug_report_id' })
  bugReport: BugReport;

  @Column({ type: 'text' })
  content: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
