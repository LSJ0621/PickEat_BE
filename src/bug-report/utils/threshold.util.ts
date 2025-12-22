import { BUG_REPORT_NOTIFICATION } from '@/common/constants/business.constants';

/**
 * 주어진 개수에 해당하는 임계값을 계산합니다.
 * @param count 미확인 버그 개수
 * @returns 해당하는 임계값 (10, 20, 30, 50, 100) 또는 null (10개 미만)
 */
export function determineThreshold(count: number): number | null {
  const thresholds = BUG_REPORT_NOTIFICATION.THRESHOLDS;

  // 큰 임계값부터 역순으로 확인
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (count >= thresholds[i]) {
      return thresholds[i];
    }
  }

  return null; // 10개 미만
}
