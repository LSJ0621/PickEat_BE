import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * 이메일 발송 로그 엔티티
 * - 이메일 발송 시 성공/실패 정보를 저장
 * - 이메일 주소는 마스킹 처리하여 저장
 */
@Entity('email_log')
@Index('idx_email_log_created_at', ['createdAt'])
@Index('idx_email_log_purpose', ['purpose'])
@Index('idx_email_log_purpose_created_at', ['purpose', 'createdAt'])
export class EmailLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 수신자 이메일 (마스킹 처리됨) */
  @Column({ type: 'varchar', length: 255 })
  recipient: string;

  /** 이메일 발송 목적 (SIGNUP, PASSWORD_RESET, RE_REGISTER) */
  @Column({ type: 'varchar', length: 30 })
  purpose: string;

  /** 발송 성공 여부 */
  @Column({ type: 'boolean' })
  success: boolean;

  /** 에러 메시지 */
  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
