import { Injectable, Logger } from '@nestjs/common';
import { mockS3Responses } from './fixtures';

/**
 * AWS S3 Mock 클라이언트
 * E2E 테스트 시 실제 S3 업로드 대신 사용
 */
@Injectable()
export class MockS3Client {
  private readonly logger = new Logger(MockS3Client.name);

  async uploadBugReportImage(file: Express.Multer.File): Promise<string> {
    this.logger.log(
      `[MOCK] S3 uploadBugReportImage: filename="${file.originalname}", size=${file.size}`,
    );
    // 고유한 mock URL 생성
    const timestamp = Date.now();
    const mockUrl = `https://mock-s3.example.com/bug-reports/${timestamp}-${file.originalname}`;
    return mockUrl;
  }
}
