import {
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdateMenuRecommendationSettingsDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  maxRecommendationsPerDay?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  defaultCuisineTypes?: string[];

  @IsOptional()
  @IsString()
  aiModelVersion?: string;
}

class UpdateSecuritySettingsDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  sessionTimeoutMinutes?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  maxLoginAttempts?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  lockoutDurationMinutes?: number;
}

class UpdateDataRetentionSettingsDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  userDataRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  auditLogRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  deletedAccountRetentionDays?: number;
}

export class UpdateSystemSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateMenuRecommendationSettingsDto)
  menuRecommendation?: UpdateMenuRecommendationSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSecuritySettingsDto)
  security?: UpdateSecuritySettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateDataRetentionSettingsDto)
  dataRetention?: UpdateDataRetentionSettingsDto;
}
