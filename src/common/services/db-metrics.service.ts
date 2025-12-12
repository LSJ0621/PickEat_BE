import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { PrometheusService } from '../../prometheus/prometheus.service';

@Injectable()
export class DbMetricsService implements OnModuleInit {
  private readonly logger = new Logger(DbMetricsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly prometheusService: PrometheusService,
  ) {}

  onModuleInit(): void {
    // 초기 상태를 한번 설정
    void this.checkDbUp();
  }

  @Interval(30000)
  async checkDbUp(): Promise<void> {
    try {
      await this.dataSource.query('SELECT 1');
      this.prometheusService.setDbUp(true);
    } catch (error) {
      this.prometheusService.setDbUp(false);
      this.logger.warn(
        `DB health check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
