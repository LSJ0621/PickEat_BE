import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

/**
 * Prometheus 메트릭 서비스
 * 모든 메트릭 인스턴스를 생성하고 관리
 */
@Injectable()
export class PrometheusService {
  private readonly logger = new Logger(PrometheusService.name);
  private readonly registry: Registry;
  private readonly serviceName: string;
  private readonly env: string;

  // AI 메트릭 (필수만)
  private aiRequestsCounter: Counter<string>;
  private aiTokensCounter: Counter<string>;
  private aiRequestDuration: Histogram<string>;
  // HTTP 메트릭
  private httpRequestsCounter: Counter<string>;
  private httpRequestDuration: Histogram<string>;
  // DB 메트릭
  private dbUpGauge: Gauge<string>;
  private dbQueryErrorCounter: Counter<string>;
  // 외부 API 메트릭
  private externalApiRequestsCounter: Counter<string>;
  private externalApiDuration: Histogram<string>;

  constructor(private readonly configService: ConfigService) {
    this.serviceName = 'pick-eat-be';
    this.env = this.configService.get<string>('NODE_ENV', 'development');

    // Registry 생성 및 기본 프로세스 메트릭 수집
    this.registry = new Registry();
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'process_',
    });

    // 공통 라벨 설정
    this.registry.setDefaultLabels({
      service: this.serviceName,
      env: this.env,
    });

    this.initializeMetrics();
  }

  /**
   * 모든 메트릭 인스턴스 초기화 (필수 메트릭만)
   */
  private initializeMetrics() {
    // AI 요청 수 (Counter) - 메뉴추천, 가게추천만
    this.aiRequestsCounter = new Counter({
      name: 'ai_requests_total',
      help: 'Total number of AI API requests',
      labelNames: ['endpoint', 'status'],
      registers: [this.registry],
    });

    // AI 토큰 사용량 (Counter) - 모든 엔드포인트
    this.aiTokensCounter = new Counter({
      name: 'ai_tokens_total',
      help: 'Total number of AI tokens used',
      labelNames: ['endpoint'],
      registers: [this.registry],
    });

    // AI 요청 지연 (Histogram) - 모든 엔드포인트
    this.aiRequestDuration = new Histogram({
      name: 'ai_request_duration_seconds',
      help: 'AI request latency in seconds',
      labelNames: ['endpoint'],
      // 외부 API 포함 요청 특성을 고려해 상한 확장
      buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10, 20],
      registers: [this.registry],
    });

    // HTTP 요청 수 (Counter)
    this.httpRequestsCounter = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    // HTTP 요청 지연 (Histogram) - 상태코드 라벨 제외
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10, 20],
      registers: [this.registry],
    });

    // DB 상태 (Gauge)
    this.dbUpGauge = new Gauge({
      name: 'db_up',
      help: 'Database connectivity status (1=up, 0=down)',
      registers: [this.registry],
    });

    // DB 쿼리 오류 (Counter)
    this.dbQueryErrorCounter = new Counter({
      name: 'db_query_errors_total',
      help: 'Total number of DB query errors',
      registers: [this.registry],
    });

    // 외부 API 요청 수 (Counter)
    this.externalApiRequestsCounter = new Counter({
      name: 'external_api_requests_total',
      help: 'Total number of external API requests',
      labelNames: ['service', 'status_group'],
      registers: [this.registry],
    });

    // 외부 API 요청 지연 (Histogram)
    this.externalApiDuration = new Histogram({
      name: 'external_api_request_duration_seconds',
      help: 'External API request latency in seconds',
      labelNames: ['service', 'status_group'],
      buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10, 20],
      registers: [this.registry],
    });
  }

  /**
   * Registry 반환 (메트릭 엔드포인트에서 사용)
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * AI 요청 카운터 증가 (메뉴추천, 가게추천만)
   */
  incrementAiRequest(endpoint: string, status: 'ok' | 'error'): void {
    this.aiRequestsCounter.inc({
      endpoint,
      status,
    });
  }

  /**
   * AI 토큰 사용량 증가 (모든 엔드포인트)
   */
  incrementAiTokens(endpoint: string, tokens: number): void {
    if (!this.aiTokensCounter) {
      throw new Error('aiTokensCounter is not initialized');
    }
    if (!endpoint || typeof tokens !== 'number' || tokens < 0) {
      throw new Error(
        `Invalid parameters: endpoint=${endpoint}, tokens=${tokens}`,
      );
    }
    // tokens가 0이면 증가하지 않음 (정상적인 경우)
    if (tokens === 0) {
      return;
    }
    this.aiTokensCounter.inc(
      {
        endpoint,
      },
      tokens,
    );
  }

  /**
   * AI 성공 요청 메트릭 기록 (요청 수 + 토큰 사용량)
   * @param endpoint 엔드포인트 이름 (menu, places)
   * @param tokens 사용한 토큰 수
   */
  recordAiSuccess(endpoint: string, tokens: number): void {
    try {
      this.incrementAiRequest(endpoint, 'ok');
      this.incrementAiTokens(endpoint, tokens);
    } catch (error) {
      // 메트릭 수집 실패는 애플리케이션 동작에 영향을 주지 않도록 조용히 처리
    }
  }

  /**
   * AI 에러 요청 메트릭 기록 (요청 수만)
   * @param endpoint 엔드포인트 이름 (menu, places)
   */
  recordAiError(endpoint: string): void {
    try {
      this.incrementAiRequest(endpoint, 'error');
    } catch (error) {
      // 메트릭 수집 실패는 애플리케이션 동작에 영향을 주지 않도록 조용히 처리
    }
  }

  /**
   * AI 토큰 사용량만 기록 (요청 수는 제외)
   * @param endpoint 엔드포인트 이름 (preference)
   * @param tokens 사용한 토큰 수
   */
  recordAiTokensOnly(endpoint: string, tokens: number): void {
    try {
      if (!this.aiTokensCounter) {
        throw new Error('aiTokensCounter is not initialized');
      }
      this.incrementAiTokens(endpoint, tokens);
    } catch (error) {
      // 메트릭 수집 실패는 애플리케이션 동작에 영향을 주지 않도록 조용히 처리
    }
  }

  /**
   * AI 요청 지연 기록 (초 단위)
   * @param endpoint 엔드포인트 이름 (menu, places, preference)
   * @param seconds 소요 시간(초)
   */
  recordAiDuration(endpoint: string, seconds: number): void {
    try {
      this.aiRequestDuration.observe({ endpoint }, seconds);
    } catch (error) {
      // 메트릭 수집 실패는 애플리케이션 동작에 영향을 주지 않도록 조용히 처리
    }
  }

  /**
   * HTTP 요청 메트릭 기록
   * @param method HTTP 메서드 (GET/POST/...)
   * @param route 템플릿 라우트 (예: /menu/recommend) 또는 'unknown'
   * @param status HTTP 상태 코드
   * @param seconds 소요 시간(초)
   */
  recordHttpMetrics(
    method: string,
    route: string,
    status: number,
    seconds: number,
  ): void {
    try {
      this.httpRequestsCounter.inc({
        method,
        route,
        status: String(status),
      });
      this.httpRequestDuration.observe(
        {
          method,
          route,
        },
        seconds,
      );
    } catch (error) {
      // 메트릭 수집 실패는 애플리케이션 동작에 영향을 주지 않도록 조용히 처리
    }
  }

  /**
   * DB 헬스 상태 기록
   */
  setDbUp(isUp: boolean): void {
    try {
      this.dbUpGauge.set(isUp ? 1 : 0);
    } catch (error) {
      // noop
    }
  }

  /**
   * DB 쿼리 오류 카운트 증가
   */
  incrementDbQueryError(): void {
    try {
      this.dbQueryErrorCounter.inc();
    } catch (error) {
      // noop
    }
  }

  /**
   * 외부 API 요청 메트릭 기록
   * @param service openai|places|cse 등
   * @param statusGroup 2xx|4xx|5xx|429|timeout
   * @param seconds 소요 시간(초)
   */
  recordExternalApi(
    service: string,
    statusGroup: '2xx' | '4xx' | '5xx' | '429' | 'timeout',
    seconds: number,
  ): void {
    try {
      this.externalApiRequestsCounter.inc({
        service,
        status_group: statusGroup,
      });
      this.externalApiDuration.observe(
        { service, status_group: statusGroup },
        seconds,
      );
    } catch (error) {
      // noop
    }
  }
}
