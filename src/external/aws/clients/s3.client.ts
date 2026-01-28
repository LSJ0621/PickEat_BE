import {
  S3Client as AwsS3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalApiException } from '../../../common/exceptions/external-api.exception';
import {
  AWS_S3_BUG_REPORT_CONFIG,
  AWS_S3_USER_PLACE_CONFIG,
} from '../aws.constants';

@Injectable()
export class S3Client {
  private readonly logger = new Logger(S3Client.name);
  private readonly s3Client: AwsS3Client;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly isPublicBucket: boolean;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.getOrThrow<string>(
      'AWS_S3_ACCESS_KEY_ID',
    );
    const secretAccessKey = this.configService.getOrThrow<string>(
      'AWS_S3_SECRET_ACCESS_KEY',
    );
    this.bucketName = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
    this.region = this.configService.getOrThrow<string>('AWS_S3_REGION');
    this.isPublicBucket =
      this.configService.getOrThrow<string>('AWS_S3_BUCKET_PUBLIC') === 'true';

    this.s3Client = new AwsS3Client({
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * 이미지를 S3에 업로드하고 URL을 반환 (공통 로직)
   * @param file 업로드할 파일 (Express.Multer.File)
   * @param prefix S3 키 prefix (예: 'bug-reports/', 'user-places/')
   * @param logContext 로그용 컨텍스트 (예: 'Bug report image', 'User place image')
   * @returns 업로드된 파일의 S3 URL (public 버킷이면 일반 URL, private 버킷이면 presigned URL)
   */
  private async uploadImage(
    file: Express.Multer.File,
    prefix: string,
    logContext: string,
  ): Promise<string> {
    try {
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const fileExtension = file.originalname.split('.').pop() || 'jpg';
      const key = `${prefix}${timestamp}-${randomString}.${fileExtension}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || 'image/jpeg',
      });

      await this.s3Client.send(command);

      // URL 생성: public 버킷이면 일반 URL, private 버킷이면 presigned URL
      let url: string;
      if (this.isPublicBucket) {
        // Public 버킷: path-style URL 사용 (버킷 이름에 점(.)이 포함된 경우 TLS CN 오류 방지)
        // 예: https://s3.ap-northeast-2.amazonaws.com/<bucket>/<key>
        url = `https://s3.${this.region}.amazonaws.com/${this.bucketName}/${key}`;
      } else {
        // Private 버킷: presigned URL 생성 (7일 유효)
        const getObjectCommand = new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        });
        url = await getSignedUrl(this.s3Client, getObjectCommand, {
          expiresIn: 7 * 24 * 60 * 60, // 7일
        });
      }

      this.logger.debug(
        `${logContext} uploaded: ${key} (public: ${this.isPublicBucket})`,
      );
      return url;
    } catch (error) {
      this.logger.error(
        `Failed to upload ${logContext.toLowerCase()} to S3: ${error.message}`,
        error.stack,
      );
      throw new ExternalApiException(
        'S3',
        error as Error,
        'Failed to upload image',
      );
    }
  }

  /**
   * 버그 리포트 이미지를 S3에 업로드하고 URL을 반환
   * @param file 업로드할 파일 (Express.Multer.File)
   * @returns 업로드된 파일의 S3 URL (public 버킷이면 일반 URL, private 버킷이면 presigned URL)
   */
  async uploadBugReportImage(file: Express.Multer.File): Promise<string> {
    return this.uploadImage(
      file,
      AWS_S3_BUG_REPORT_CONFIG.BUG_REPORT_IMAGE_PREFIX,
      'Bug report image',
    );
  }

  /**
   * 유저 장소 이미지를 S3에 업로드하고 URL을 반환
   * @param file 업로드할 파일 (Express.Multer.File)
   * @returns 업로드된 파일의 S3 URL (public 버킷이면 일반 URL, private 버킷이면 presigned URL)
   */
  async uploadUserPlaceImage(file: Express.Multer.File): Promise<string> {
    return this.uploadImage(
      file,
      AWS_S3_USER_PLACE_CONFIG.USER_PLACE_IMAGE_PREFIX,
      'User place image',
    );
  }

  /**
   * 버킷의 모든 파일 정보를 조회하여 통계를 반환
   * @returns 버킷 통계 정보 (총 크기, 파일 수, 파일 목록)
   */
  async getBucketStats(): Promise<{
    totalSizeBytes: number;
    fileCount: number;
    files: Array<{ key: string; size: number; lastModified: Date }>;
  }> {
    try {
      const files: Array<{ key: string; size: number; lastModified: Date }> =
        [];
      let continuationToken: string | undefined;
      let totalSizeBytes = 0;

      do {
        const command = new ListObjectsV2Command({
          Bucket: this.bucketName,
          ContinuationToken: continuationToken,
        });

        const response = await this.s3Client.send(command);

        if (response.Contents) {
          for (const object of response.Contents) {
            if (object.Key && object.Size !== undefined) {
              totalSizeBytes += object.Size;
              files.push({
                key: object.Key,
                size: object.Size,
                lastModified: object.LastModified ?? new Date(),
              });
            }
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      this.logger.debug(
        `Bucket stats retrieved: fileCount=${files.length}, totalSizeBytes=${totalSizeBytes}`,
      );

      return {
        totalSizeBytes,
        fileCount: files.length,
        files,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get bucket stats from S3: ${error.message}`,
        error.stack,
      );
      throw new ExternalApiException(
        'S3',
        error as Error,
        'Failed to get bucket stats',
      );
    }
  }
}
