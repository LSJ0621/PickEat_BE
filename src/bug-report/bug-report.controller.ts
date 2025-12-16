import {
    Body,
    Controller,
    Post,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthUserPayload, CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guard/jwt.guard';
import { BugReportService } from './bug-report.service';
import { CreateBugReportDto } from './dto/create-bug-report.dto';

@Controller('bug-reports')
@UseGuards(JwtAuthGuard)
export class BugReportController {
  constructor(private readonly bugReportService: BugReportService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('images', 5))
  async createBugReport(
    @Body() dto: CreateBugReportDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const bugReport = await this.bugReportService.createBugReport(
      authUser,
      dto,
      files ?? [],
    );
    return { id: bugReport.id };
  }
}


