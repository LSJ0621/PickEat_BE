/**
 * Stage 1: 메뉴 요청 검증 관련 인터페이스
 */

/**
 * 요청 의도 분류
 */
export type ValidationIntent = 'preference' | 'mood' | 'location' | 'mixed';

/**
 * 예산 수준
 */
export type BudgetLevel = 'low' | 'medium' | 'high';

/**
 * 긴급도
 */
export type UrgencyLevel = 'quick' | 'normal';

/**
 * 요청 제약사항
 * OpenAI strict mode requires all fields
 */
export interface ValidationConstraints {
  budget: BudgetLevel;
  dietary: string[];
  urgency: UrgencyLevel;
}

/**
 * Stage 1 검증 응답
 * OpenAI strict mode requires all fields to be non-optional
 * - invalidReason: isValid=false일 때 거부 사유, isValid=true일 경우 빈 문자열
 */
export interface ValidationResponse {
  isValid: boolean;
  invalidReason: string;
  intent: ValidationIntent;
  constraints: ValidationConstraints;
  suggestedCategories: string[];
}

/**
 * Stage 2에 전달할 검증 컨텍스트
 * (isValid=true일 때만 전달)
 */
export interface ValidationContext {
  intent: ValidationIntent;
  constraints: ValidationConstraints;
  suggestedCategories: string[];
}
