import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdateWebhookThresholdsDto {
  @IsOptional()
  @IsBoolean()
  newBugReportEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  criticalBugAlertEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  dailySummaryEnabled?: boolean;
}

export class UpdateWebhookSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @IsUrl()
  webhookUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateWebhookThresholdsDto)
  thresholds?: UpdateWebhookThresholdsDto;
}
