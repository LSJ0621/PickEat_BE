import { Controller, Get, Header } from '@nestjs/common';
import { PrometheusService } from './prometheus.service';

/**
 * Prometheus 메트릭 엔드포인트 컨트롤러
 * GET /metrics 엔드포인트를 제공하여 Prometheus가 스크랩할 수 있도록 함
 */
@Controller()
export class PrometheusController {
  constructor(private readonly prometheusService: PrometheusService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    const registry = this.prometheusService.getRegistry();
    return registry.metrics();
  }
}
