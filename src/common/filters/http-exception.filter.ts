import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ExternalApiException } from '../exceptions/external-api.exception';
import { PrometheusService } from '../../prometheus/prometheus.service';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
  path: string;
  provider?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  constructor(private readonly prometheusService: PrometheusService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, errorResponse } = this.buildErrorResponse(
      exception,
      request.url,
    );

    // 에러 로깅
    this.logError(exception, request, status);
    this.recordDbErrorIfNeeded(exception);

    response.status(status).json(errorResponse);
  }

  private buildErrorResponse(
    exception: unknown,
    path: string,
  ): { status: number; errorResponse: ErrorResponse } {
    const timestamp = new Date().toISOString();

    // ExternalApiException 처리
    if (exception instanceof ExternalApiException) {
      const exceptionResponse = exception.getResponse() as Record<
        string,
        unknown
      >;
      return {
        status: exception.getStatus(),
        errorResponse: {
          statusCode: exception.getStatus(),
          error: 'External API Error',
          message: exceptionResponse.message as string,
          timestamp,
          path,
          provider: exception.provider,
        },
      };
    }

    // 일반 HttpException 처리
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as Record<string, unknown>).message ||
            exception.message;

      const messageString = Array.isArray(message)
        ? message.join(', ')
        : typeof message === 'string'
          ? message
          : JSON.stringify(message);

      return {
        status,
        errorResponse: {
          statusCode: status,
          error: this.getErrorName(status),
          message: messageString,
          timestamp,
          path,
        },
      };
    }

    // 예상치 못한 에러 (500)
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    return {
      status,
      errorResponse: {
        statusCode: status,
        error: 'Internal Server Error',
        message: '서버 내부 오류가 발생했습니다.',
        timestamp,
        path,
      },
    };
  }

  private logError(exception: unknown, request: Request, status: number): void {
    const logContext = {
      method: request.method,
      url: request.url,
      status,
    };

    if (exception instanceof ExternalApiException) {
      this.logger.error(
        `[${exception.provider}] External API Error: ${exception.message}`,
        exception.originalError?.stack,
        logContext,
      );
    } else if (exception instanceof HttpException) {
      // 4xx 에러는 warn, 5xx는 error
      if (status >= 500) {
        this.logger.error(exception.message, exception.stack, logContext);
      } else {
        this.logger.warn(`${exception.message}`, logContext);
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unexpected Error: ${exception.message}`,
        exception.stack,
        logContext,
      );
    } else {
      this.logger.error(`Unknown Error: ${String(exception)}`, '', logContext);
    }
  }

  private getErrorName(status: number): string {
    const errorNames: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };
    return errorNames[status] || 'Error';
  }

  private recordDbErrorIfNeeded(exception: unknown): void {
    if (exception instanceof QueryFailedError) {
      this.prometheusService.incrementDbQueryError();
    }
  }
}
