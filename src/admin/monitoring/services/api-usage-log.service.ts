import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiUsageLog } from '../entities/api-usage-log.entity';
import { ApiProvider } from '../monitoring.constants';

export interface CreateApiUsageLogData {
  provider: ApiProvider;
  endpoint: string;
  success: boolean;
  statusCode?: number | null;
  responseTimeMs: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  model?: string | null;
  errorMessage?: string | null;
}

@Injectable()
export class ApiUsageLogService {
  private readonly logger = new Logger(ApiUsageLogService.name);

  constructor(
    @InjectRepository(ApiUsageLog)
    private readonly apiUsageLogRepository: Repository<ApiUsageLog>,
  ) {}

  /**
   * API 사용 로그를 저장합니다.
   * @param data API 사용 로그 데이터
   * @returns 생성된 API 사용 로그 엔티티
   */
  async log(data: CreateApiUsageLogData): Promise<ApiUsageLog> {
    const log = this.apiUsageLogRepository.create({
      provider: data.provider,
      endpoint: data.endpoint,
      success: data.success,
      statusCode: data.statusCode ?? null,
      responseTimeMs: data.responseTimeMs,
      promptTokens: data.promptTokens ?? null,
      completionTokens: data.completionTokens ?? null,
      totalTokens: data.totalTokens ?? null,
      model: data.model ?? null,
      errorMessage: data.errorMessage ?? null,
    });

    const savedLog = await this.apiUsageLogRepository.save(log);
    this.logger.debug(
      `API usage logged: provider=${data.provider}, endpoint=${data.endpoint}, success=${data.success}, responseTimeMs=${data.responseTimeMs}`,
    );

    return savedLog;
  }

  /**
   * API 호출을 래핑하여 자동으로 로그를 기록합니다.
   * @param provider API 제공자
   * @param endpoint API 엔드포인트
   * @param apiCall API 호출 함수
   * @param options 추가 옵션 (OpenAI 토큰 정보 등)
   * @returns API 호출 결과
   */
  async wrapApiCall<T>(
    provider: ApiProvider,
    endpoint: string,
    apiCall: () => Promise<T>,
    options?: {
      extractTokenInfo?: (result: T) => {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        model?: string;
      };
    },
  ): Promise<T> {
    const startTime = Date.now();
    let success = false;
    let statusCode: number | null = null;
    let errorMessage: string | null = null;
    let tokenInfo: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      model?: string;
    } = {};

    try {
      const result = await apiCall();
      success = true;
      statusCode = 200;

      if (options?.extractTokenInfo) {
        tokenInfo = options.extractTokenInfo(result);
      }

      return result;
    } catch (error) {
      success = false;
      errorMessage = error instanceof Error ? error.message : String(error);

      if (error && typeof error === 'object' && 'status' in error) {
        statusCode = (error as { status: number }).status;
      }

      throw error;
    } finally {
      const responseTimeMs = Date.now() - startTime;

      await this.log({
        provider,
        endpoint,
        success,
        statusCode,
        responseTimeMs,
        promptTokens: tokenInfo.promptTokens ?? null,
        completionTokens: tokenInfo.completionTokens ?? null,
        totalTokens: tokenInfo.totalTokens ?? null,
        model: tokenInfo.model ?? null,
        errorMessage,
      }).catch((logError) => {
        this.logger.error(
          `Failed to log API usage: ${logError.message}`,
          logError.stack,
        );
      });
    }
  }
}
