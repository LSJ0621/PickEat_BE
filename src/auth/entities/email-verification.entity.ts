import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EmailVerificationStatus =
  | 'ACTIVE'
  | 'USED'
  | 'INVALIDATED'
  | 'EXPIRED';

@Entity('email_verifications')
export class EmailVerification {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  email: string;

  @Column()
  codeHash: string;

  @Column({ nullable: true })
  purpose?: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @Column({ type: 'timestamp', nullable: true })
  usedAt?: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: EmailVerificationStatus;

  @Column({ type: 'int', default: 0 })
  sendCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastSentAt?: Date;

  @Column({ type: 'int', default: 0 })
  failCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
