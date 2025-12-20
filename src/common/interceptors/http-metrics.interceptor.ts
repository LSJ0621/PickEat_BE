import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { PrometheusService } from '../../prometheus/prometheus.service';

const EXCLUDED_PREFIXES = ['/metrics', '/health', '/ready', '/live'];

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly prometheusService: PrometheusService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<Request>();
    const res = httpCtx.getResponse<Response>();

    if (!req || !res) {
      return next.handle();
    }

    const path = this.stripQuery(req.originalUrl || req.url || '');
    if (this.isExcluded(path)) {
      return next.handle();
    }

    const method = (req.method || 'UNKNOWN').toUpperCase();
    const route = this.getRouteLabel(req);
    const startedAt = process.hrtime.bigint();

    const record = (status: number) => {
      const durationNs = process.hrtime.bigint() - startedAt;
      const durationSeconds = Number(durationNs) / 1e9;
      this.prometheusService.recordHttpMetrics(
        method,
        route,
        status,
        durationSeconds,
      );
    };

    return next.handle().pipe(
      tap(() => {
        record(res.statusCode || 0);
      }),
      catchError((error) => {
        const status =
          typeof error?.getStatus === 'function' ? error.getStatus() : 500;
        record(status);
        return throwError(() => error);
      }),
    );
  }

  private isExcluded(path: string): boolean {
    return EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix));
  }

  private stripQuery(url: string): string {
    const idx = url.indexOf('?');
    return idx === -1 ? url : url.slice(0, idx);
  }

  private getRouteLabel(req: Request): string {
    // Prefer Express route template (already parameterized)
    const routePath = req.route?.path;
    const baseUrl = (req.baseUrl as any) || '';

    if (routePath && typeof routePath === 'string') {
      return this.normalizeRoute(`${baseUrl}${routePath}`);
    }

    // If templated route is unavailable, fall back to unknown (raw URL 금지)
    return 'unknown';
  }

  private normalizeRoute(route: string): string {
    if (!route) return 'unknown';
    // Remove trailing slash except root
    if (route.length > 1 && route.endsWith('/')) {
      return route.slice(0, -1);
    }
    return route;
  }
}
