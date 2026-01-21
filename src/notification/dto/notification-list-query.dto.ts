import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { NotificationStatus } from '../enum/notification-status.enum';
import { NotificationType } from '../enum/notification-type.enum';

export class NotificationListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'VALIDATION_INT:page' })
  @Min(1, { message: 'VALIDATION_MIN:page:1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'VALIDATION_INT:limit' })
  @Min(1, { message: 'VALIDATION_MIN:limit:1' })
  @Max(50, { message: 'VALIDATION_MAX:limit:50' })
  limit?: number = 20;

  @IsOptional()
  @IsEnum(NotificationStatus, {
    message: 'VALIDATION_INVALID_ENUM:status',
  })
  status?: NotificationStatus;

  @IsOptional()
  @IsEnum(NotificationType, {
    message: 'VALIDATION_INVALID_ENUM:type',
  })
  type?: NotificationType;
}
