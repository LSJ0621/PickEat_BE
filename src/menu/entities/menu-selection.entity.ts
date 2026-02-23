import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { BatchJob } from '../../batch/entities/batch-job.entity';
import { User } from '../../user/entities/user.entity';
import { MenuSlotPayload } from '../interfaces/menu-selection.interface';
import { MenuRecommendation } from './menu-recommendation.entity';

export enum MenuSelectionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  BATCH_PROCESSING = 'BATCH_PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  PERMANENTLY_FAILED = 'PERMANENTLY_FAILED',
}

@Entity()
@Unique('UQ_menu_selection_user_date', ['user', 'selectedDate'])
@Index('idx_menu_selection_status', ['status'])
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

  /**
   * 배치 재시도 횟수 (최대 3회)
   * PreferencesRetryBatchScheduler에서 FAILED 상태 selection 재시도에 사용
   */
  @Column({ type: 'int', default: 0 })
  retryCount: number;

  /** Batch 작업 참조 (BATCH_PROCESSING 상태일 때 설정됨) */
  @Column({ type: 'int', nullable: true })
  @Index('idx_menu_selection_batch_job_id')
  batchJobId: number | null;

  @ManyToOne(() => BatchJob, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'batchJobId' })
  batchJob: BatchJob | null;

  @ManyToOne(() => User, (user) => user.menuSelections, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  user: User;

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

  @VersionColumn()
  version: number;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
