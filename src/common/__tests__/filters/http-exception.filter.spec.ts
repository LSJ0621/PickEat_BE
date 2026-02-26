import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { ExecutionContext } from '@nestjs/common';
import { ExternalApiException } from '../../exceptions/external-api.exception';
import { HttpExceptionFilter } from '../../filters/http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockArgumentsHost: ArgumentsHost;
  let mockResponse: Partial<Response>;
  let mockRequest: Partial<Request>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [HttpExceptionFilter],
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
      getType: jest.fn(() => 'http'),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getClass: jest.fn(),
      getHandler: jest.fn(),
    } as ExecutionContext;

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
          errorCode: 'EXTERNAL_API_ERROR',
          error: 'External API Error',
          message: 'EXTERNAL_API_ERROR',
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
          errorCode: 'VALIDATION_ERROR',
          error: 'Bad Request',
          message: 'VALIDATION_ERROR',
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
          errorCode: 'INTERNAL_SERVER_ERROR',
          error: 'Unprocessable Entity',
          message: 'INTERNAL_SERVER_ERROR',
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
          errorCode: 'VALIDATION_ERROR',
          message: 'VALIDATION_ERROR',
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
          errorCode: 'INTERNAL_SERVER_ERROR',
          error: 'Internal Server Error',
          message: 'Unknown error',
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
          errorCode: 'INTERNAL_SERVER_ERROR',
          error: 'Internal Server Error',
          message: 'String exception',
        }),
      );
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

    it('should use VALIDATION_ERROR errorCode for 400 with custom message object', () => {
      // Arrange - 400 status maps to VALIDATION_ERROR via fallback
      const exception = new HttpException(
        { message: 'Custom validation message' },
        HttpStatus.BAD_REQUEST,
      );

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert - errorCode comes from getErrorCodeFallback, then returned as message
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          errorCode: 'VALIDATION_ERROR',
          message: 'VALIDATION_ERROR',
        }),
      );
    });

    it('should use UNAUTHORIZED errorCode for 401 exceptions', () => {
      // Arrange
      const exception = new HttpException(
        { message: 'Token expired' },
        HttpStatus.UNAUTHORIZED,
      );

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          errorCode: 'UNAUTHORIZED',
          message: 'UNAUTHORIZED',
        }),
      );
    });

    it('should use FORBIDDEN errorCode for 403 exceptions', () => {
      // Arrange
      const exception = new HttpException(
        { message: 'Access denied' },
        HttpStatus.FORBIDDEN,
      );

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          errorCode: 'FORBIDDEN',
          message: 'FORBIDDEN',
        }),
      );
    });

    it('should extract errorCode directly from response object when provided', () => {
      // Arrange - errorCode is directly on the exception response object
      const exception = new HttpException(
        { errorCode: 'CUSTOM_ERROR_CODE', message: 'Custom message' },
        HttpStatus.BAD_REQUEST,
      );

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert - uses the custom errorCode directly, skips fallback
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          errorCode: 'CUSTOM_ERROR_CODE',
          message: 'CUSTOM_ERROR_CODE',
        }),
      );
    });

    it('should use production error message when NODE_ENV is production', () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const exception = new Error('Sensitive internal error');

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal Server Error',
        }),
      );

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });

    it('should expose error message when NODE_ENV is not production', () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const exception = new Error('Detailed error for dev');

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Detailed error for dev',
        }),
      );

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });

    it('should convert non-Error unknown exceptions using String() when not production', () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const exception = { code: 500 };

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '[object Object]',
        }),
      );

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });

    it('should log ExternalApiException with provider info', () => {
      // Arrange
      const originalError = new Error('Upstream error');
      const exception = new ExternalApiException(
        'Google',
        originalError,
        'Google API Error',
      );
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Google]'),
        originalError.stack,
        expect.any(Object),
      );
    });

    it('should log unknown Error instances as unexpected errors', () => {
      // Arrange
      const exception = new Error('Unexpected runtime failure');
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected Error:'),
        exception.stack,
        expect.any(Object),
      );
    });

    it('should log completely unknown non-Error exceptions', () => {
      // Arrange
      const exception = 42;
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();

      // Act
      filter.catch(exception, mockArgumentsHost);

      // Assert
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown Error:'),
        '',
        expect.any(Object),
      );
    });
  });
});
