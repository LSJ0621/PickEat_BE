import { Module } from '@nestjs/common';
import { S3Client } from './clients/s3.client';

@Module({
  providers: [S3Client],
  exports: [S3Client],
})
export class AwsModule {}
