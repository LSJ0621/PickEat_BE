import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  AuthUserPayload,
  CurrentUser,
} from '@/auth/decorators/current-user.decorator';
import { Roles } from '@/auth/decorators/roles.decorator';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';
import { RolesGuard } from '@/auth/guard/roles.guard';
import { ErrorCode } from '@/common/constants/error-codes';
import { MessageCode } from '@/common/constants/message-codes';
import { ADMIN_ROLES } from '@/common/constants/roles.constants';
import { MULTER_OPTIONS } from '@/common/config/multer.config';
import { ImageValidationPipe } from '@/common/pipes/file-validation.pipe';
import { UserService } from '@/user/user.service';
import { AdminUserPlaceListQueryDto } from '../dto/admin-user-place-list-query.dto';
import { RejectUserPlaceDto } from '../dto/reject-user-place.dto';
import { UpdateUserPlaceByAdminDto } from '../dto/update-user-place-by-admin.dto';
import { AdminUserPlaceService } from '../services/admin-user-place.service';
import { AdminUserPlaceStatsService } from '../services/admin-user-place-stats.service';

@Controller('admin/user-places')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AdminUserPlaceController {
  constructor(
    private readonly adminUserPlaceService: AdminUserPlaceService,
    private readonly adminUserPlaceStatsService: AdminUserPlaceStatsService,
    private readonly userService: UserService,
  ) {}

  /**
   * Get all user places with filters (Admin)
   */
  @Get()
  async findAll(@Query() query: AdminUserPlaceListQueryDto) {
    return this.adminUserPlaceStatsService.findAllForAdmin(query);
  }

  /**
   * Get single user place detail (Admin)
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.adminUserPlaceStatsService.findOneForAdmin(id);
  }

  /**
   * Approve user place (Admin)
   */
  @Patch(':id/approve')
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUserPayload,
    @Req() req: Request,
  ) {
    const adminUser = await this.getAdminUser(user.email);
    const ipAddress = this.getClientIp(req);
    await this.adminUserPlaceService.approvePlace(id, adminUser.id, ipAddress);
    return { messageCode: MessageCode.USER_PLACE_APPROVED };
  }

  /**
   * Reject user place (Admin)
   */
  @Patch(':id/reject')
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectUserPlaceDto,
    @CurrentUser() user: AuthUserPayload,
    @Req() req: Request,
  ) {
    const adminUser = await this.getAdminUser(user.email);
    const ipAddress = this.getClientIp(req);
    await this.adminUserPlaceService.rejectPlace(
      id,
      adminUser.id,
      dto,
      ipAddress,
    );
    return { messageCode: MessageCode.USER_PLACE_REJECTED };
  }

  /**
   * Update place information (Admin)
   */
  @Patch(':id')
  @UseInterceptors(FilesInterceptor('images', 5, MULTER_OPTIONS))
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserPlaceByAdminDto,
    @UploadedFiles(new ImageValidationPipe()) files: Express.Multer.File[],
    @CurrentUser() user: AuthUserPayload,
    @Req() req: Request,
  ) {
    const adminUser = await this.getAdminUser(user.email);
    const ipAddress = this.getClientIp(req);
    return this.adminUserPlaceService.updatePlaceByAdmin(
      id,
      adminUser.id,
      dto,
      ipAddress,
      files ?? [],
    );
  }

  /**
   * Look up admin user by email, throwing if not found
   */
  private async getAdminUser(email: string) {
    const adminUser = await this.userService.findByEmail(email);
    if (!adminUser) {
      throw new NotFoundException(ErrorCode.ADMIN_USER_NOT_FOUND);
    }
    return adminUser;
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
