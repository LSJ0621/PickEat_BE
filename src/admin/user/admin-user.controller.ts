import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ErrorCode } from '@/common/constants/error-codes';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { MessageCode } from '@/common/constants/message-codes';
import {
  AuthUserPayload,
  CurrentUser,
} from '@/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';
import { RolesGuard } from '@/auth/guard/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { ADMIN_ROLES, Role } from '@/common/constants/roles.constants';
import { UserService } from '@/user/user.service';
import { AdminUserService } from './admin-user.service';
import { AdminUserListQueryDto } from './dto/admin-user-list-query.dto';
import { AdminUserDetailDto } from './dto/admin-user-detail.dto';
import { AdminUserListItemDto } from './dto/admin-user-list-item.dto';
import { PaginatedResponse } from '@/common/interfaces/pagination.interface';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AdminUserController {
  constructor(
    private readonly adminUserService: AdminUserService,
    private readonly userService: UserService,
  ) {}

  @Get()
  async findAll(
    @Query() query: AdminUserListQueryDto,
    @CurrentUser() user: AuthUserPayload,
  ): Promise<PaginatedResponse<AdminUserListItemDto>> {
    const requestUser = await this.userService.findByEmail(user.email);
    if (!requestUser) {
      throw new NotFoundException({
        errorCode: ErrorCode.ADMIN_USER_NOT_FOUND,
      });
    }

    return this.adminUserService.findAll(query, requestUser.role as Role);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AdminUserDetailDto> {
    return this.adminUserService.findOne(id);
  }

  @Patch(':id/deactivate')
  async deactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
    @Req() req: Request,
  ): Promise<{ success: boolean; messageCode: string }> {
    const requestUser = await this.userService.findByEmail(user.email);
    if (!requestUser) {
      throw new NotFoundException({
        errorCode: ErrorCode.ADMIN_USER_NOT_FOUND,
      });
    }

    const ipAddress = this.getClientIp(req);
    await this.adminUserService.deactivate(
      id,
      requestUser.id,
      requestUser.role as Role,
      ipAddress,
    );
    return {
      success: true,
      messageCode: MessageCode.ADMIN_USER_DEACTIVATED,
    };
  }

  @Patch(':id/activate')
  async activate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
    @Req() req: Request,
  ): Promise<{ success: boolean; messageCode: string }> {
    const requestUser = await this.userService.findByEmail(user.email);
    if (!requestUser) {
      throw new NotFoundException({
        errorCode: ErrorCode.ADMIN_USER_NOT_FOUND,
      });
    }

    const ipAddress = this.getClientIp(req);
    await this.adminUserService.activate(
      id,
      requestUser.id,
      requestUser.role as Role,
      ipAddress,
    );
    return {
      success: true,
      messageCode: MessageCode.ADMIN_USER_ACTIVATED,
    };
  }

  /**
   * Extract client IP address from request
   */
  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded)) {
      return forwarded[0];
    }
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
}
