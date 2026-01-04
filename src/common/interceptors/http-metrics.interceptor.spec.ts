import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { of, throwError } from 'rxjs';
import { createMockPrometheusService } from '../../../test/mocks/external-clients.mock';
import { PrometheusService } from '../../prometheus/prometheus.service';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

describe('HttpMetricsInterceptor', () => {
  let interceptor: HttpMetricsInterceptor;
  let prometheusService: any;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(async () => {
    prometheusService = createMockPrometheusService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HttpMetricsInterceptor,
        {
          provide: PrometheusService,
          useValue: prometheusService,
        },
      ],
    }).compile();

    interceptor = module.get<HttpMetricsInterceptor>(HttpMetricsInterceptor);

    // Mock Request
    mockRequest = {
      method: 'GET',
      url: '/api/users',
      originalUrl: '/api/users?page=1',
      route: {
        path: '/api/users',
      } as any,
      baseUrl: '',
    };

    // Mock Response
    mockResponse = {
      statusCode: 200,
    };

    // Mock ExecutionContext
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getClass: jest.fn(),
      getHandler: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    };

    // Mock CallHandler
    mockCallHandler = {
      handle: jest.fn(() => of('test response')),
    };
  });

  describe('intercept', () => {
    it('should record successful HTTP request metrics', (done) => {
      // Arrange
      mockResponse.statusCode = 200;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          '/api/users',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should record HTTP error metrics', (done) => {
      // Arrange
      const error = {
        getStatus: jest.fn().mockReturnValue(404),
      };
      mockCallHandler.handle = jest.fn(() => throwError(() => error));

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe({
        error: () => {
          expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
            'GET',
            '/api/users',
            404,
            expect.any(Number),
          );
          done();
        },
      });
    });

    it('should default to 500 for errors without getStatus method', (done) => {
      // Arrange
      const error = new Error('Generic error');
      mockCallHandler.handle = jest.fn(() => throwError(() => error));

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe({
        error: () => {
          expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
            'GET',
            '/api/users',
            500,
            expect.any(Number),
          );
          done();
        },
      });
    });

    it('should exclude /metrics path from recording', (done) => {
      // Arrange
      mockRequest.url = '/metrics';
      mockRequest.originalUrl = '/metrics';

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).not.toHaveBeenCalled();
        done();
      });
    });

    it('should exclude /health path from recording', (done) => {
      // Arrange
      mockRequest.url = '/health';
      mockRequest.originalUrl = '/health';

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).not.toHaveBeenCalled();
        done();
      });
    });

    it('should exclude /ready path from recording', (done) => {
      // Arrange
      mockRequest.url = '/ready';
      mockRequest.originalUrl = '/ready';

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).not.toHaveBeenCalled();
        done();
      });
    });

    it('should exclude /live path from recording', (done) => {
      // Arrange
      mockRequest.url = '/live';
      mockRequest.originalUrl = '/live';

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).not.toHaveBeenCalled();
        done();
      });
    });

    it('should strip query parameters from URL', (done) => {
      // Arrange
      mockRequest.originalUrl = '/api/users?page=1&limit=10';
      mockRequest.url = '/api/users?page=1&limit=10';

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          '/api/users',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should use route path template if available', (done) => {
      // Arrange
      mockRequest.route = {
        path: '/api/users/:id',
      } as any;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          '/api/users/:id',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should use "unknown" route when route is unavailable', (done) => {
      // Arrange
      mockRequest.route = undefined;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          'unknown',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should normalize route by removing trailing slash', (done) => {
      // Arrange
      mockRequest.route = {
        path: '/api/users/',
      } as any;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          '/api/users',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should not remove trailing slash from root path', (done) => {
      // Arrange
      mockRequest.route = {
        path: '/',
      } as any;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          '/',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should handle requests without req or res', (done) => {
      // Arrange
      mockExecutionContext.switchToHttp = jest.fn().mockReturnValue({
        getRequest: () => null,
        getResponse: () => null,
      });

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).not.toHaveBeenCalled();
        done();
      });
    });

    it('should measure request duration accurately', (done) => {
      // Arrange
      mockCallHandler.handle = jest.fn(() => {
        // Simulate some processing time
        return of('delayed response');
      });

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          '/api/users',
          200,
          expect.any(Number),
        );
        const duration = prometheusService.recordHttpMetrics.mock.calls[0][3];
        expect(duration).toBeGreaterThanOrEqual(0);
        done();
      });
    });

    it('should handle baseUrl correctly', (done) => {
      // Arrange
      mockRequest.baseUrl = '/v1';
      mockRequest.route = {
        path: '/users',
      } as any;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          '/v1/users',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should use url when originalUrl is not available', (done) => {
      // Arrange
      mockRequest.originalUrl = undefined;
      mockRequest.url = '/api/users';

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          '/api/users',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should use empty string when both originalUrl and url are not available', (done) => {
      // Arrange
      mockRequest.originalUrl = undefined;
      mockRequest.url = undefined;
      mockRequest.route = {
        path: '/api/users',
      } as any;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          '/api/users',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should use UNKNOWN when method is not available', (done) => {
      // Arrange
      mockRequest.method = undefined;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'UNKNOWN',
          '/api/users',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should use lowercase method as uppercase', (done) => {
      // Arrange
      mockRequest.method = 'post';

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'POST',
          '/api/users',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should use 0 as status code when statusCode is not available', (done) => {
      // Arrange
      mockResponse.statusCode = undefined;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          '/api/users',
          0,
          expect.any(Number),
        );
        done();
      });
    });

    it('should handle null error object and default to 500', (done) => {
      // Arrange
      mockCallHandler.handle = jest.fn(() => throwError(() => null));

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe({
        error: () => {
          expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
            'GET',
            '/api/users',
            500,
            expect.any(Number),
          );
          done();
        },
      });
    });

    it('should handle undefined error object and default to 500', (done) => {
      // Arrange
      mockCallHandler.handle = jest.fn(() => throwError(() => undefined));

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe({
        error: () => {
          expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
            'GET',
            '/api/users',
            500,
            expect.any(Number),
          );
          done();
        },
      });
    });

    it('should handle error with getStatus property that is not a function', (done) => {
      // Arrange
      const error = {
        getStatus: 'not a function',
      };
      mockCallHandler.handle = jest.fn(() => throwError(() => error));

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe({
        error: () => {
          expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
            'GET',
            '/api/users',
            500,
            expect.any(Number),
          );
          done();
        },
      });
    });

    it('should handle error with getStatus null and default to 500', (done) => {
      // Arrange
      const error = {
        getStatus: null,
      };
      mockCallHandler.handle = jest.fn(() => throwError(() => error));

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe({
        error: () => {
          expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
            'GET',
            '/api/users',
            500,
            expect.any(Number),
          );
          done();
        },
      });
    });

    it('should normalize empty route to unknown', (done) => {
      // Arrange
      mockRequest.route = {
        path: '',
      } as any;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          'unknown',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should normalize null route to unknown', (done) => {
      // Arrange
      mockRequest.route = {
        path: null,
      } as any;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          'unknown',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should normalize undefined route path to unknown', (done) => {
      // Arrange
      mockRequest.route = {
        path: undefined,
      } as any;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          'unknown',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should handle route path that is not a string', (done) => {
      // Arrange
      mockRequest.route = {
        path: 123,
      } as any;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          'unknown',
          200,
          expect.any(Number),
        );
        done();
      });
    });

    it('should handle different HTTP status codes', (done) => {
      // Arrange
      mockResponse.statusCode = 201;

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          '/api/users',
          201,
          expect.any(Number),
        );
        done();
      });
    });

    it('should handle 400 error status code', (done) => {
      // Arrange
      const error = {
        getStatus: jest.fn().mockReturnValue(400),
      };
      mockCallHandler.handle = jest.fn(() => throwError(() => error));

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe({
        error: () => {
          expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
            'GET',
            '/api/users',
            400,
            expect.any(Number),
          );
          done();
        },
      });
    });

    it('should handle 401 error status code', (done) => {
      // Arrange
      const error = {
        getStatus: jest.fn().mockReturnValue(401),
      };
      mockCallHandler.handle = jest.fn(() => throwError(() => error));

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe({
        error: () => {
          expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
            'GET',
            '/api/users',
            401,
            expect.any(Number),
          );
          done();
        },
      });
    });

    it('should handle 403 error status code', (done) => {
      // Arrange
      const error = {
        getStatus: jest.fn().mockReturnValue(403),
      };
      mockCallHandler.handle = jest.fn(() => throwError(() => error));

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe({
        error: () => {
          expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
            'GET',
            '/api/users',
            403,
            expect.any(Number),
          );
          done();
        },
      });
    });

    it('should exclude paths with /metrics prefix and query params', (done) => {
      // Arrange
      mockRequest.url = '/metrics?detailed=true';
      mockRequest.originalUrl = '/metrics?detailed=true';

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).not.toHaveBeenCalled();
        done();
      });
    });

    it('should exclude paths with /health prefix and additional path', (done) => {
      // Arrange
      mockRequest.url = '/health/check';
      mockRequest.originalUrl = '/health/check';

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).not.toHaveBeenCalled();
        done();
      });
    });

    it('should handle URL without query string in stripQuery', (done) => {
      // Arrange
      mockRequest.originalUrl = '/api/users';
      mockRequest.url = '/api/users';

      // Act
      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Assert
      result$.subscribe(() => {
        expect(prometheusService.recordHttpMetrics).toHaveBeenCalledWith(
          'GET',
          '/api/users',
          200,
          expect.any(Number),
        );
        done();
      });
    });
  });
});
