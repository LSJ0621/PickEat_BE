import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { NotificationListQueryDto } from './dto/notification-list-query.dto';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * 공개 공지사항 목록 조회 (고정 우선, 발행일 순)
   * 인증 불필요
   */
  @Get()
  async findAll(@Query() queryDto: NotificationListQueryDto) {
    return this.notificationService.findPublished(queryDto);
  }

  /**
   * 공개 공지사항 상세 조회
   * 인증 불필요, 조회수 증가
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const notification = await this.notificationService.findOnePublished(id);
    await this.notificationService.incrementViewCount(id);
    return notification;
  }
}
