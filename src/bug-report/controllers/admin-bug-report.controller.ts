import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  AuthUserPayload,
  CurrentUser,
} from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guard/jwt.guard';
import { RolesGuard } from '../../auth/guard/roles.guard';
import { UserService } from '../../user/user.service';
import { BugReportService } from '../bug-report.service';
import { AddNoteDto } from '../dto/add-note.dto';
import { BatchUpdateStatusDto } from '../dto/batch-update-status.dto';
import { BugReportListQueryDto } from '../dto/bug-report-list-query.dto';
import { UpdateBugReportStatusDto } from '../dto/update-bug-report-status.dto';

@Controller('admin/bug-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AdminBugReportController {
  constructor(
    private readonly bugReportService: BugReportService,
    private readonly userService: UserService,
  ) {}

  /**
   * 버그 제보 목록 조회 (Pagination + 필터)
   * 기본값: status=미확인, 최신 생성 순 정렬
   */
  @Get()
  async findAll(@Query() queryDto: BugReportListQueryDto) {
    return this.bugReportService.findAll(queryDto);
  }

  /**
   * 통계 조회 (라우팅 우선순위를 위해 :id보다 먼저 정의)
   */
  @Get('statistics')
  async getStatistics() {
    return this.bugReportService.getStatistics();
  }

  /**
   * 버그 제보 상세 조회 (이력, 메모 포함)
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.bugReportService.findOneWithDetails(id);
  }

  /**
   * 버그 제보 상태 변경 (이력 기록)
   */
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBugReportStatusDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    const adminUser = await this.userService.findByEmail(user.email);
    if (!adminUser) {
      throw new NotFoundException('관리자 사용자를 찾을 수 없습니다.');
    }
    return this.bugReportService.updateStatusWithHistory(
      id,
      dto.status,
      adminUser,
    );
  }

  /**
   * 일괄 상태 변경
   */
  @Patch('batch-status')
  async batchUpdateStatus(
    @Body() dto: BatchUpdateStatusDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    const adminUser = await this.userService.findByEmail(user.email);
    if (!adminUser) {
      throw new NotFoundException('관리자 사용자를 찾을 수 없습니다.');
    }
    return this.bugReportService.batchUpdateStatus(
      dto.ids,
      dto.status,
      adminUser,
    );
  }

  /**
   * 관리자 메모 추가
   */
  @Post(':id/notes')
  async addNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddNoteDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    const adminUser = await this.userService.findByEmail(user.email);
    if (!adminUser) {
      throw new NotFoundException('관리자 사용자를 찾을 수 없습니다.');
    }
    return this.bugReportService.addAdminNote(id, dto.content, adminUser);
  }
}
