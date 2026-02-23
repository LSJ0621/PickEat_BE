import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BugReportNotification } from '../entities/bug-report-notification.entity';
import { determineThreshold } from '../utils/threshold.util';

/**
 * 버그 리포트 알림 관리 서비스
 * - 중복 알림 방지를 위한 임계값 기반 알림 판단
 * - 알림 전송 이력 추적
 */
@Injectable()
export class BugReportNotificationService {
  private readonly logger = new Logger(BugReportNotificationService.name);

  constructor(
    @InjectRepository(BugReportNotification)
    private readonly notificationRepository: Repository<BugReportNotification>,
  ) {}

  /**
   * 현재 미확인 개수를 기준으로 알림 전송 여부를 판단합니다.
   * - 임계값(10, 20, 30, 50, 100)을 넘었는지 확인
   * - 이전 알림보다 임계값이 상승했는지 확인
   * @param currentCount 현재 미확인 버그 개수
   * @returns {should: 알림 전송 여부, lastThreshold: 이전 임계값 (없으면 null)}
   */
  async shouldSendNotification(currentCount: number): Promise<{
    should: boolean;
    lastThreshold: number | null;
  }> {
    // 1. 현재 개수에 해당하는 임계값 계산
    const currentThreshold = determineThreshold(currentCount);

    // 10개 미만이면 알림 불필요
    if (currentThreshold === null) {
      return { should: false, lastThreshold: null };
    }

    // 2. 마지막 알림 기록 조회
    const lastNotification = await this.getLastNotification();

    // 첫 알림이면 전송
    if (!lastNotification) {
      this.logger.log(
        `첫 알림 전송 조건 충족 (임계값: ${currentThreshold}, 개수: ${currentCount})`,
      );
      return { should: true, lastThreshold: null };
    }

    const lastThreshold = lastNotification.threshold;

    // 3. 임계값이 상승한 경우에만 알림 전송
    const shouldNotify = currentThreshold > lastThreshold;

    if (shouldNotify) {
      this.logger.log(
        `임계값 상승 감지 (${lastThreshold} → ${currentThreshold}, 개수: ${currentCount})`,
      );
    } else {
      this.logger.debug(
        `알림 불필요 (현재 임계값: ${currentThreshold}, 이전 임계값: ${lastThreshold})`,
      );
    }

    return { should: shouldNotify, lastThreshold };
  }

  /**
   * 알림 전송 기록을 저장합니다.
   * @param count 알림 전송 시점의 미확인 개수
   * @param threshold 전송한 임계값
   */
  async recordNotification(count: number, threshold: number): Promise<void> {
    try {
      const notification = this.notificationRepository.create({
        unconfirmedCount: count,
        threshold,
      });

      await this.notificationRepository.save(notification);

      this.logger.log(
        `알림 기록 저장 완료 (임계값: ${threshold}, 개수: ${count})`,
      );
    } catch (error) {
      // 저장 실패 시 로깅만 수행 (다음 주기에 재시도)
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`알림 기록 저장 실패: ${err.message}`, err.stack);
    }
  }

  /**
   * 가장 최근 알림 기록을 조회합니다.
   * @returns 마지막 알림 기록 (없으면 null)
   */
  async getLastNotification(): Promise<BugReportNotification | null> {
    return this.notificationRepository.findOne({
      order: { sentAt: 'DESC' },
    });
  }
}
