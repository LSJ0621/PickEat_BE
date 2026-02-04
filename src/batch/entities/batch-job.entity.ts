import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BatchJobStatus, BatchJobType } from '../types/preference-batch.types';

@Entity()
@Index('idx_batch_job_status', ['status'])
@Index('idx_batch_job_type_status', ['type', 'status'])
export class BatchJob {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: BatchJobType })
  type: BatchJobType;

  @Column({
    type: 'enum',
    enum: BatchJobStatus,
    default: BatchJobStatus.PENDING,
  })
  status: BatchJobStatus;

  /** OpenAI batch ID (batch_xxx) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  @Index('idx_batch_job_openai_batch_id')
  openAiBatchId: string | null;

  /** OpenAI input file ID (file_xxx) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  inputFileId: string | null;

  /** OpenAI output file ID (file_xxx) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  outputFileId: string | null;

  /** OpenAI error file ID (file_xxx) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  errorFileId: string | null;

  @Column({ type: 'int', default: 0 })
  totalRequests: number;

  @Column({ type: 'int', default: 0 })
  completedRequests: number;

  @Column({ type: 'int', default: 0 })
  failedRequests: number;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** Error message if failed */
  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
