import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import {
  PageInfo,
  PaginatedResponse,
} from '../common/interfaces/pagination.interface';
import { User } from '../user/entities/user.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationListQueryDto } from './dto/notification-list-query.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { Notification } from './entities/notification.entity';
import { NotificationStatus } from './enum/notification-status.enum';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  /**
   * 공지사항 생성
   */
  async create(
    dto: CreateNotificationDto,
    createdBy: User,
  ): Promise<Notification> {
    const notification = this.notificationRepository.create({
      type: dto.type,
      title: dto.title,
      content: dto.content,
      status: dto.status ?? NotificationStatus.DRAFT,
      isPinned: dto.isPinned ?? false,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      publishedAt:
        dto.status === NotificationStatus.PUBLISHED ? new Date() : null,
      createdBy,
    });

    return await this.notificationRepository.save(notification);
  }

  /**
   * 관리자용 공지사항 목록 조회 (Pagination + 필터)
   */
  async findAllAdmin(
    queryDto: NotificationListQueryDto,
  ): Promise<PaginatedResponse<Notification>> {
    const { page = 1, limit = 20, status, type } = queryDto;

    const qb = this.notificationRepository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.createdBy', 'createdBy')
      .orderBy('notification.createdAt', 'DESC');

    if (status !== undefined) {
      qb.andWhere('notification.status = :status', { status });
    }

    if (type !== undefined) {
      qb.andWhere('notification.type = :type', { type });
    }

    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    const [items, totalCount] = await qb.getManyAndCount();

    const hasNext = skip + items.length < totalCount;

    const pageInfo: PageInfo = {
      page,
      limit,
      totalCount,
      hasNext,
    };

    return { items, pageInfo };
  }

  /**
   * 관리자용 공지사항 상세 조회
   */
  async findOneAdmin(id: number): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });

    if (!notification) {
      throw new NotFoundException({
        message: `공지사항을 찾을 수 없습니다. (ID: ${id})`,
        errorCode: ErrorCode.NOTIFICATION_NOT_FOUND,
      });
    }

    return notification;
  }

  /**
   * 공지사항 수정
   */
  async update(id: number, dto: UpdateNotificationDto): Promise<Notification> {
    const notification = await this.findOneAdmin(id);

    if (dto.type !== undefined) {
      notification.type = dto.type;
    }
    if (dto.title !== undefined) {
      notification.title = dto.title;
    }
    if (dto.content !== undefined) {
      notification.content = dto.content;
    }
    if (dto.isPinned !== undefined) {
      notification.isPinned = dto.isPinned;
    }
    if (dto.scheduledAt !== undefined) {
      notification.scheduledAt = dto.scheduledAt
        ? new Date(dto.scheduledAt)
        : null;
    }
    if (dto.status !== undefined) {
      notification.status = dto.status;
      if (
        dto.status === NotificationStatus.PUBLISHED &&
        !notification.publishedAt
      ) {
        notification.publishedAt = new Date();
      }
    }

    return await this.notificationRepository.save(notification);
  }

  /**
   * 공지사항 소프트 삭제
   */
  async softDelete(id: number): Promise<void> {
    const notification = await this.findOneAdmin(id);
    await this.notificationRepository.softRemove(notification);
  }

  /**
   * 예약된 공지사항 발행 처리
   * SCHEDULED 상태이고 scheduledAt이 현재 시간 이하인 공지사항을 PUBLISHED로 변경
   */
  async publishScheduledNotifications(): Promise<number> {
    const now = new Date();

    const scheduledNotifications = await this.notificationRepository.find({
      where: {
        status: NotificationStatus.SCHEDULED,
        scheduledAt: LessThanOrEqual(now),
      },
    });

    if (scheduledNotifications.length === 0) {
      return 0;
    }

    for (const notification of scheduledNotifications) {
      notification.status = NotificationStatus.PUBLISHED;
      notification.publishedAt = now;
    }

    await this.notificationRepository.save(scheduledNotifications);

    this.logger.log(
      `예약된 공지사항 ${scheduledNotifications.length}개 발행 완료`,
    );

    return scheduledNotifications.length;
  }
}
