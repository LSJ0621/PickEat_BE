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
import { ADMIN_ROLES } from '@/common/constants/roles.constants';
import { ImageValidationPipe } from '@/common/pipes/file-validation.pipe';
import { UserService } from '@/user/user.service';
import { AdminUserPlaceListQueryDto } from '../dto/admin-user-place-list-query.dto';
import { RejectUserPlaceDto } from '../dto/reject-user-place.dto';
import { UpdateUserPlaceByAdminDto } from '../dto/update-user-place-by-admin.dto';
import { UserPlaceService } from '../user-place.service';

@Controller('admin/user-places')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AdminUserPlaceController {
  constructor(
    private readonly userPlaceService: UserPlaceService,
    private readonly userService: UserService,
  ) {}

  /**
   * Get all user places with filters (Admin)
   */
  @Get()
  async findAll(@Query() query: AdminUserPlaceListQueryDto) {
    return this.userPlaceService.findAllForAdmin(query);
  }

  /**
   * Get single user place detail (Admin)
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userPlaceService.findOneForAdmin(id);
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
    const adminUser = await this.userService.findByEmail(user.email);
    if (!adminUser) {
      throw new NotFoundException('Admin user not found');
    }

    const ipAddress = this.getClientIp(req);
    return this.userPlaceService.approvePlace(id, adminUser.id, ipAddress);
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
    const adminUser = await this.userService.findByEmail(user.email);
    if (!adminUser) {
      throw new NotFoundException('Admin user not found');
    }

    const ipAddress = this.getClientIp(req);
    return this.userPlaceService.rejectPlace(id, adminUser.id, dto, ipAddress);
  }

  /**
   * Update place information (Admin)
   */
  @Patch(':id')
  @UseInterceptors(FilesInterceptor('images', 5))
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserPlaceByAdminDto,
    @UploadedFiles(new ImageValidationPipe()) files: Express.Multer.File[],
    @CurrentUser() user: AuthUserPayload,
    @Req() req: Request,
  ) {
    const adminUser = await this.userService.findByEmail(user.email);
    if (!adminUser) {
      throw new NotFoundException('Admin user not found');
    }

    const ipAddress = this.getClientIp(req);
    return this.userPlaceService.updatePlaceByAdmin(
      id,
      adminUser.id,
      dto,
      ipAddress,
      files ?? [],
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
