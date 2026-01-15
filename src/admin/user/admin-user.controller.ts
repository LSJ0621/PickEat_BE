import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';
import { RolesGuard } from '@/auth/guard/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '@/common/constants/roles.constants';
import { AdminUserService } from './admin-user.service';
import { AdminUserListQueryDto, AdminUserDetailDto } from './dto';
import { PaginatedResponse } from '@/common/interfaces/pagination.interface';
import { AdminUserListItemDto } from './dto/admin-user-list-item.dto';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Get()
  async findAll(
    @Query() query: AdminUserListQueryDto,
  ): Promise<PaginatedResponse<AdminUserListItemDto>> {
    return this.adminUserService.findAll(query);
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
  ): Promise<{ success: boolean; message: string }> {
    await this.adminUserService.deactivate(id);
    return { success: true, message: '계정이 비활성화되었습니다.' };
  }

  @Patch(':id/activate')
  async activate(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ success: boolean; message: string }> {
    await this.adminUserService.activate(id);
    return { success: true, message: '계정이 활성화되었습니다.' };
  }
}
