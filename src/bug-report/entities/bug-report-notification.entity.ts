import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * 버그 리포트 알림 기록 엔티티
 * - 중복 알림 방지를 위한 알림 이력 추적
 * - 임계값 기반 알림 전송 전략 지원
 */
@Entity('bug_report_notification')
// Composite index for efficient lookup of last notification per threshold level
@Index('idx_bug_report_notification_threshold_sent', ['threshold', 'sentAt'])
export class BugReportNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  unconfirmedCount: number; // 알림 전송 시점의 미확인 개수

  @Column({ type: 'int' })
  threshold: number; // 어떤 임계값에서 알림을 보냈는지 (10, 20, 30, 50, 100)

  @CreateDateColumn()
  sentAt: Date;
}
