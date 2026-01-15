import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  AuthUserPayload,
  CurrentUser,
} from '@/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';
import { RolesGuard } from '@/auth/guard/roles.guard';
import { SuperAdminOnly } from '@/auth/decorators/super-admin.decorator';
import { UserService } from '@/user/user.service';
import { AdminSettingsService } from './admin-settings.service';
import { AdminListItemDto } from './dto/admin-list-item.dto';
import { PromoteAdminDto } from './dto/promote-admin.dto';

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AdminSettingsController {
  constructor(
    private readonly adminSettingsService: AdminSettingsService,
    private readonly userService: UserService,
  ) {}

  /**
   * Get list of all admin users
   * Only SUPER_ADMIN can access this endpoint
   */
  @Get('admins')
  @SuperAdminOnly()
  async getAdminList(): Promise<AdminListItemDto[]> {
    return this.adminSettingsService.getAdminList();
  }

  /**
   * Promote a user to admin or super admin
   * Only SUPER_ADMIN can access this endpoint
   */
  @Post('admins')
  @SuperAdminOnly()
  async promoteToAdmin(
    @Body() dto: PromoteAdminDto,
    @CurrentUser() user: AuthUserPayload,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const adminUser = await this.userService.findByEmail(user.email);
    if (!adminUser) {
      throw new NotFoundException('Admin user not found');
    }

    const ipAddress = this.getClientIp(req);
    await this.adminSettingsService.promoteToAdmin(
      dto.userId,
      dto.email,
      dto.role,
      adminUser,
      ipAddress,
    );
    return { message: `User promoted to ${dto.role} successfully` };
  }

  /**
   * Demote an admin back to regular user
   * Only SUPER_ADMIN can access this endpoint
   */
  @Delete('admins/:id')
  @SuperAdminOnly()
  async demoteAdmin(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    const adminUser = await this.userService.findByEmail(user.email);
    if (!adminUser) {
      throw new NotFoundException('Admin user not found');
    }

    const ipAddress = this.getClientIp(req);
    await this.adminSettingsService.demoteAdmin(id, adminUser, ipAddress);
    return { message: 'Admin role removed successfully' };
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
