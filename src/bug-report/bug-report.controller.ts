import {
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  AuthUserPayload,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guard/jwt.guard';
import { MULTER_OPTIONS } from '../common/config/multer.config';
import { ImageValidationPipe } from '../common/pipes/file-validation.pipe';
import { BugReportService } from './bug-report.service';
import { CreateBugReportDto } from './dto/create-bug-report.dto';

@Controller('bug-reports')
@UseGuards(JwtAuthGuard)
export class BugReportController {
  constructor(private readonly bugReportService: BugReportService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(FilesInterceptor('images', 5, MULTER_OPTIONS))
  async createBugReport(
    @Body() dto: CreateBugReportDto,
    @UploadedFiles(new ImageValidationPipe()) files: Express.Multer.File[],
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
