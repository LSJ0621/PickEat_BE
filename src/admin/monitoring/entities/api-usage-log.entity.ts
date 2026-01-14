import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * API 사용 로그 엔티티
 * - 외부 API 호출 시 사용량 및 응답 정보를 저장
 * - OpenAI, Google Places, Google CSE, Kakao 등 외부 API 통계 분석용
 */
@Entity('api_usage_log')
@Index('idx_api_usage_log_created_at', ['createdAt'])
@Index('idx_api_usage_log_provider', ['provider'])
@Index('idx_api_usage_log_provider_created_at', ['provider', 'createdAt'])
export class ApiUsageLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** API 제공자 (OPENAI, GOOGLE_PLACES, GOOGLE_CSE, KAKAO_LOCAL, KAKAO_OAUTH) */
  @Column({ type: 'varchar', length: 30 })
  provider: string;

  /** API 엔드포인트 */
  @Column({ type: 'varchar', length: 100 })
  endpoint: string;

  /** API 호출 성공 여부 */
  @Column({ type: 'boolean' })
  success: boolean;

  /** HTTP 상태 코드 */
  @Column({ type: 'int', nullable: true })
  statusCode: number | null;

  /** 응답 시간 (ms) */
  @Column({ type: 'int', name: 'response_time_ms' })
  responseTimeMs: number;

  /** OpenAI - 프롬프트 토큰 수 */
  @Column({ type: 'int', name: 'prompt_tokens', nullable: true })
  promptTokens: number | null;

  /** OpenAI - 완료 토큰 수 */
  @Column({ type: 'int', name: 'completion_tokens', nullable: true })
  completionTokens: number | null;

  /** OpenAI - 총 토큰 수 */
  @Column({ type: 'int', name: 'total_tokens', nullable: true })
  totalTokens: number | null;

  /** OpenAI - 사용된 모델 */
  @Column({ type: 'varchar', length: 50, nullable: true })
  model: string | null;

  /** 에러 메시지 */
  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
