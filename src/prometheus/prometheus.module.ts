import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrometheusController } from './prometheus.controller';
import { PrometheusService } from './prometheus.service';

/**
 * Prometheus 메트릭 수집 모듈
 * 전역 모듈로 등록하여 어디서든 PrometheusService를 주입받을 수 있도록 함
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrometheusService],
  controllers: [PrometheusController],
  exports: [PrometheusService],
})
export class PrometheusModule {}
