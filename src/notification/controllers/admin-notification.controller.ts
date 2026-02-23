import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MessageCode } from '@/common/constants/message-codes';
import {
  AuthUserPayload,
  CurrentUser,
} from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guard/jwt.guard';
import { RolesGuard } from '../../auth/guard/roles.guard';
import { UserService } from '../../user/user.service';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { NotificationListQueryDto } from '../dto/notification-list-query.dto';
import { UpdateNotificationDto } from '../dto/update-notification.dto';
import { NotificationService } from '../notification.service';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminNotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly userService: UserService,
  ) {}

  /**
   * 공지사항 생성
   */
  @Post()
  async create(
    @Body() dto: CreateNotificationDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    const adminUser = await this.userService.findByEmail(user.email);
    if (!adminUser) {
      throw new NotFoundException('관리자 사용자를 찾을 수 없습니다.');
    }
    return this.notificationService.create(dto, adminUser);
  }

  /**
   * 공지사항 목록 조회 (Pagination + 필터)
   */
  @Get()
  async findAll(@Query() queryDto: NotificationListQueryDto) {
    return this.notificationService.findAllAdmin(queryDto);
  }

  /**
   * 공지사항 상세 조회
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.notificationService.findOneAdmin(id);
  }

  /**
   * 공지사항 수정
   */
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNotificationDto,
  ) {
    return this.notificationService.update(id, dto);
  }

  /**
   * 공지사항 삭제 (소프트 삭제)
   */
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.notificationService.softDelete(id);
    return {
      messageCode: MessageCode.NOTIFICATION_DELETED,
    };
  }
}
