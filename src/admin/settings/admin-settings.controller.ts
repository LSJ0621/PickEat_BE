import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';
import { RolesGuard } from '@/auth/guard/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { SuperAdminOnly } from '@/auth/decorators/super-admin.decorator';
import { User } from '@/user/entities/user.entity';
import { ROLES } from '@/common/constants/roles.constants';
import { AdminSettingsService } from './admin-settings.service';
import { AdminListItemDto } from './dto/admin-list-item.dto';
import { PromoteAdminDto } from './dto/promote-admin.dto';
import { WebhookSettingsDto } from './dto/webhook-settings.dto';
import { UpdateWebhookSettingsDto } from './dto/update-webhook-settings.dto';
import { SystemSettingsDto } from './dto/system-settings.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

interface RequestWithUser extends Request {
  user: User;
}

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AdminSettingsController {
  constructor(private readonly adminSettingsService: AdminSettingsService) {}

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
    @Req() req: RequestWithUser,
  ): Promise<{ message: string }> {
    const ipAddress = this.getClientIp(req);
    await this.adminSettingsService.promoteToAdmin(
      dto.userId,
      dto.role,
      req.user,
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
    @Req() req: RequestWithUser,
  ): Promise<{ message: string }> {
    const ipAddress = this.getClientIp(req);
    await this.adminSettingsService.demoteAdmin(id, req.user, ipAddress);
    return { message: 'Admin role removed successfully' };
  }

  /**
   * Get webhook settings
   * Both ADMIN and SUPER_ADMIN can access
   */
  @Get('webhook')
  @Roles(ROLES.ADMIN, ROLES.SUPER_ADMIN)
  async getWebhookSettings(): Promise<WebhookSettingsDto> {
    return this.adminSettingsService.getWebhookSettings();
  }

  /**
   * Update webhook settings
   * Both ADMIN and SUPER_ADMIN can access
   */
  @Patch('webhook')
  @Roles(ROLES.ADMIN, ROLES.SUPER_ADMIN)
  async updateWebhookSettings(
    @Body() dto: UpdateWebhookSettingsDto,
    @Req() req: RequestWithUser,
  ): Promise<WebhookSettingsDto> {
    const ipAddress = this.getClientIp(req);
    return this.adminSettingsService.updateWebhookSettings(
      dto,
      req.user,
      ipAddress,
    );
  }

  /**
   * Test webhook by sending a test message
   * Both ADMIN and SUPER_ADMIN can access
   */
  @Post('webhook/test')
  @Roles(ROLES.ADMIN, ROLES.SUPER_ADMIN)
  async testWebhook(): Promise<{ success: boolean; message: string }> {
    return this.adminSettingsService.testWebhook();
  }

  /**
   * Get system settings
   * Both ADMIN and SUPER_ADMIN can access
   */
  @Get('system')
  @Roles(ROLES.ADMIN, ROLES.SUPER_ADMIN)
  async getSystemSettings(): Promise<SystemSettingsDto> {
    return this.adminSettingsService.getSystemSettings();
  }

  /**
   * Update system settings
   * Both ADMIN and SUPER_ADMIN can access
   */
  @Patch('system')
  @Roles(ROLES.ADMIN, ROLES.SUPER_ADMIN)
  async updateSystemSettings(
    @Body() dto: UpdateSystemSettingsDto,
    @Req() req: RequestWithUser,
  ): Promise<SystemSettingsDto> {
    const ipAddress = this.getClientIp(req);
    return this.adminSettingsService.updateSystemSettings(
      dto,
      req.user,
      ipAddress,
    );
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
