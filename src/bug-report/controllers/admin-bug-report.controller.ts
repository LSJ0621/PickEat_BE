import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guard/jwt.guard';
import { RolesGuard } from '../../auth/guard/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { BugReportService } from '../bug-report.service';
import { BugReportListQueryDto } from '../dto/bug-report-list-query.dto';
import { UpdateBugReportStatusDto } from '../dto/update-bug-report-status.dto';

@Controller('admin/bug-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminBugReportController {
  constructor(private readonly bugReportService: BugReportService) {}

  /**
   * 버그 제보 목록 조회 (Pagination + 필터)
   * 기본값: status=미확인, 최신 생성 순 정렬
   */
  @Get()
  async findAll(@Query() queryDto: BugReportListQueryDto) {
    return this.bugReportService.findAll(queryDto);
  }

  /**
   * 버그 제보 상세 조회
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const bugReport = await this.bugReportService.findOne(parseInt(id, 10));
    return bugReport;
  }

  /**
   * 버그 제보 상태 변경
   */
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBugReportStatusDto,
  ) {
    const bugReport = await this.bugReportService.updateStatus(
      parseInt(id, 10),
      dto.status,
    );
    return bugReport;
  }
}


