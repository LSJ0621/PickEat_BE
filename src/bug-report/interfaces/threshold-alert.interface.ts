import { BugReport } from '../entities/bug-report.entity';

/**
 * 임계값 도달 알림을 위한 파라미터
 */
export interface ThresholdAlertParams {
  /** 현재 미확인 버그 개수 */
  currentCount: number;
  /** 이전 임계값 (첫 알림이면 null) */
  lastThreshold: number | null;
  /** 현재 임계값 */
  threshold: number;
  /** 최근 버그 리스트 (최대 5개) */
  recentBugs: BugReport[];
}
