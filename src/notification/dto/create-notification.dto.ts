import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NotificationStatus } from '../enum/notification-status.enum';
import { NotificationType } from '../enum/notification-type.enum';

export class CreateNotificationDto {
  @IsEnum(NotificationType, {
    message: 'VALIDATION_INVALID_ENUM:type',
  })
  @IsNotEmpty({ message: 'VALIDATION_REQUIRED:type' })
  type: NotificationType;

  @IsString({ message: 'VALIDATION_STRING:title' })
  @IsNotEmpty({ message: 'VALIDATION_REQUIRED:title' })
  @MaxLength(100, { message: 'VALIDATION_MAX_LENGTH:title:100' })
  title: string;

  @IsString({ message: 'VALIDATION_STRING:content' })
  @IsNotEmpty({ message: 'VALIDATION_REQUIRED:content' })
  @MaxLength(2000, { message: 'VALIDATION_MAX_LENGTH:content:2000' })
  content: string;

  @IsOptional()
  @IsEnum(NotificationStatus, {
    message: 'VALIDATION_INVALID_ENUM:status',
  })
  status?: NotificationStatus;

  @IsOptional()
  @IsBoolean({ message: 'VALIDATION_BOOLEAN:isPinned' })
  isPinned?: boolean;

  @IsOptional()
  @IsDateString({}, { message: 'VALIDATION_DATE_FORMAT:scheduledAt' })
  scheduledAt?: string;
}
