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
    message: '유효한 공지사항 타입이어야 합니다.',
  })
  @IsNotEmpty({ message: '공지사항 타입은 필수입니다.' })
  type: NotificationType;

  @IsString({ message: '제목은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '제목은 필수입니다.' })
  @MaxLength(100, { message: '제목은 최대 100자까지 입력 가능합니다.' })
  title: string;

  @IsString({ message: '내용은 문자열이어야 합니다.' })
  @IsNotEmpty({ message: '내용은 필수입니다.' })
  content: string;

  @IsOptional()
  @IsEnum(NotificationStatus, {
    message: '유효한 공지사항 상태여야 합니다.',
  })
  status?: NotificationStatus;

  @IsOptional()
  @IsBoolean({ message: '고정 여부는 boolean이어야 합니다.' })
  isPinned?: boolean;

  @IsOptional()
  @IsDateString({}, { message: '예약 시간은 ISO 8601 형식이어야 합니다.' })
  scheduledAt?: string;
}
