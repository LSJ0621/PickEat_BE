import { IsEnum, IsOptional } from 'class-validator';
import {
  API_PROVIDERS,
  ApiProvider,
  MonitoringPeriod,
} from '../monitoring.constants';

export class MonitoringQueryDto {
  @IsOptional()
  @IsEnum(['7d', '30d', '90d'])
  period?: MonitoringPeriod = '7d';

  @IsOptional()
  @IsEnum(Object.values(API_PROVIDERS))
  provider?: ApiProvider;
}
