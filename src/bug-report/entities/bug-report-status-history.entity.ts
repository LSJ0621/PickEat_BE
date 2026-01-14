import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { BugReport } from './bug-report.entity';

@Entity('bug_report_status_history')
export class BugReportStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BugReport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bug_report_id' })
  bugReport: BugReport;

  @Column({ type: 'varchar', length: 20, name: 'previous_status' })
  previousStatus: string;

  @Column({ type: 'varchar', length: 20 })
  status: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'changed_by_id' })
  changedBy: User;

  @CreateDateColumn({ name: 'changed_at' })
  changedAt: Date;
}
