import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { NotificationStatus } from '../enum/notification-status.enum';
import { NotificationType } from '../enum/notification-type.enum';

export class NotificationListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '페이지는 정수여야 합니다.' })
  @Min(1, { message: '페이지는 1 이상이어야 합니다.' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit는 정수여야 합니다.' })
  @Min(1, { message: 'limit는 1 이상이어야 합니다.' })
  @Max(50, { message: 'limit는 최대 50까지 가능합니다.' })
  limit?: number = 20;

  @IsOptional()
  @IsEnum(NotificationStatus, {
    message: '유효한 공지사항 상태여야 합니다.',
  })
  status?: NotificationStatus;

  @IsOptional()
  @IsEnum(NotificationType, {
    message: '유효한 공지사항 타입이어야 합니다.',
  })
  type?: NotificationType;
}
