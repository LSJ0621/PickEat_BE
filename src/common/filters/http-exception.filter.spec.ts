import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { createMockPrometheusService } from '../../../test/mocks/external-clients.mock';
import { PrometheusService } from '../../prometheus/prometheus.service';
import { ExternalApiException } from '../exceptions/external-api.exception';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let prometheusService: any;
  let mockArgumentsHost: ArgumentsHost;
  let mockResponse: Partial<Response>;
  let mockRequest: Partial<Request>;

  beforeEach(async () => {
    prometheusService = createMockPrometheusService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HttpExceptionFilter,
        {
          provide: PrometheusService,
          useValue: prometheusService,
        },
      ],
    }).compile();

    filter = module.get<HttpExceptionFilter>(HttpExceptionFilter);

    // Mock Response
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Mock Request
    mockRequest = {
      url: '/test',
      method: 'GET',
    };

    // Mock ArgumentsHost
    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
      getArgByIndex: jest.fn(),
      getArgs: jest.fn(),
      getType: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
    };

    // Suppress Logger output during tests
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('catch', () => {
    it('should handle ExternalApiException with provider info', () => {
      // Arrange
      const exception = new ExternalApiException(
        'Kakao',
        new Error('Original error'),
        'Kakao API Error',
      );

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_GATEWAY,
          error: 'External API Error',
          message: 'Kakao API Error',
          provider: 'Kakao',
          path: '/test',
          timestamp: expect.any(String),
        }),
      );
    });

    it('should handle standard HttpException with string message', () => {
      // Arrange
      const exception = new HttpException(
        'Bad Request',
        HttpStatus.BAD_REQUEST,
      );

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Bad Request',
          path: '/test',
          timestamp: expect.any(String),
        }),
      );
    });

    it('should handle HttpException with object response', () => {
      // Arrange
      const exception = new HttpException(
        { message: 'Validation failed' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: 'Validation failed',
        }),
      );
    });

    it('should handle HttpException with array message', () => {
      // Arrange
      const exception = new HttpException(
        { message: ['Error 1', 'Error 2'] },
        HttpStatus.BAD_REQUEST,
      );

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Error 1, Error 2',
        }),
      );
    });

    it('should handle unknown errors with 500 status', () => {
      // Arrange
      const exception = new Error('Unknown error');

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal Server Error',
          message: '서버 내부 오류가 발생했습니다.',
          path: '/test',
          timestamp: expect.any(String),
        }),
      );
    });

    it('should handle non-Error exceptions', () => {
      // Arrange
      const exception = 'String exception';

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal Server Error',
          message: '서버 내부 오류가 발생했습니다.',
        }),
      );
    });

    it('should record database query errors in Prometheus', () => {
      // Arrange
      const exception = new QueryFailedError('SELECT * FROM users', [], {
        message: 'Database error',
        name: 'QueryFailedError',
      } as any);

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(prometheusService.incrementDbQueryError).toHaveBeenCalled();
    });

    it('should log 4xx errors as warnings', () => {
      // Arrange
      const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should log 5xx errors as errors', () => {
      // Arrange
      const exception = new HttpException(
        'Internal error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should correctly map status codes to error names', () => {
      // Arrange
      const testCases = [
        { status: 400, expected: 'Bad Request' },
        { status: 401, expected: 'Unauthorized' },
        { status: 403, expected: 'Forbidden' },
        { status: 404, expected: 'Not Found' },
        { status: 409, expected: 'Conflict' },
        { status: 422, expected: 'Unprocessable Entity' },
        { status: 500, expected: 'Internal Server Error' },
        { status: 502, expected: 'Bad Gateway' },
        { status: 503, expected: 'Service Unavailable' },
      ];

      testCases.forEach(({ status, expected }) => {
        // Arrange
        const exception = new HttpException('Test', status);
        jest.clearAllMocks();

        // Act
        filter.catch(exception, mockArgumentsHost);

        // Assert
        expect(mockResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expected,
          }),
        );
      });
    });

    it('should use "Error" for unknown status codes', () => {
      // Arrange
      const exception = new HttpException('Test', 418); // I'm a teapot

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Error',
        }),
      );
    });
  });
});
