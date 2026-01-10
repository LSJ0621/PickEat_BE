import { Logger } from '@nestjs/common';

const logger = new Logger('TestModeUtil');

/**
 * 현재 환경이 테스트 모드인지 확인
 * 이중 검증으로 프로덕션에서 절대 활성화되지 않도록 함
 */
export function isTestMode(): boolean {
  const nodeEnv = process.env.NODE_ENV;

  // 이중 검증: production 환경에서는 절대 false 반환
  if (nodeEnv === 'production') {
    return false;
  }

  return nodeEnv === 'test';
}

/**
 * 테스트 모드에서 특정 조건을 확인하고 로깅
 * @param condition 확인할 조건
 * @param action 액션 이름 (로깅용)
 */
export function isTestModeCondition(
  condition: boolean,
  action: string,
): boolean {
  if (!isTestMode()) {
    return false;
  }

  if (condition) {
    logger.debug(`[TEST MODE] ${action}`);
  }

  return condition;
}
