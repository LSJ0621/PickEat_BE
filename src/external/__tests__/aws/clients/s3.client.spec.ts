import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '../../../aws/clients/s3.client';
import {
  S3Client as AwsS3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createMockConfigService } from '../../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { AWS_S3_BUG_REPORT_CONFIG } from '../../../aws/aws.constants';

// Mock AWS SDK modules
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('S3Client', () => {
  let client: S3Client;
  let configService: ReturnType<typeof createMockConfigService>;
  let mockS3Send: jest.Mock;

  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test-image.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: Buffer.from('test-image-data'),
    size: 1024,
    stream: {} as any,
    destination: '',
    filename: '',
    path: '',
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    configService = createMockConfigService({
      AWS_S3_ACCESS_KEY_ID: 'test-access-key-id',
      AWS_S3_SECRET_ACCESS_KEY: 'test-secret-access-key',
      AWS_S3_BUCKET: 'test-bucket',
      AWS_S3_REGION: 'ap-northeast-2',
      AWS_S3_BUCKET_PUBLIC: 'true',
    });

    // Mock S3Client send method
    mockS3Send = jest.fn();
    (AwsS3Client as jest.Mock).mockImplementation(() => ({
      send: mockS3Send,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Client,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    client = module.get<S3Client>(S3Client);
  });

  describe('constructor', () => {
    it('should initialize with required config values', () => {
      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'AWS_S3_ACCESS_KEY_ID',
      );
      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'AWS_S3_SECRET_ACCESS_KEY',
      );
      expect(configService.getOrThrow).toHaveBeenCalledWith('AWS_S3_BUCKET');
      expect(configService.getOrThrow).toHaveBeenCalledWith('AWS_S3_REGION');
      expect(configService.getOrThrow).toHaveBeenCalledWith(
        'AWS_S3_BUCKET_PUBLIC',
      );
    });

    it('should create AWS S3Client with credentials', () => {
      expect(AwsS3Client).toHaveBeenCalledWith({
        region: 'ap-northeast-2',
        credentials: {
          accessKeyId: 'test-access-key-id',
          secretAccessKey: 'test-secret-access-key',
        },
      });
    });

    it('should throw error when access key is missing', async () => {
      const emptyConfigService = createMockConfigService({
        AWS_S3_SECRET_ACCESS_KEY: 'test-secret',
        AWS_S3_BUCKET: 'test-bucket',
        AWS_S3_REGION: 'ap-northeast-2',
        AWS_S3_BUCKET_PUBLIC: 'true',
      });

      await expect(
        Test.createTestingModule({
          providers: [
            S3Client,
            { provide: ConfigService, useValue: emptyConfigService },
          ],
        }).compile(),
      ).rejects.toThrow();
    });

    it('should throw error when secret key is missing', async () => {
      const emptyConfigService = createMockConfigService({
        AWS_S3_ACCESS_KEY_ID: 'test-key',
        AWS_S3_BUCKET: 'test-bucket',
        AWS_S3_REGION: 'ap-northeast-2',
        AWS_S3_BUCKET_PUBLIC: 'true',
      });

      await expect(
        Test.createTestingModule({
          providers: [
            S3Client,
            { provide: ConfigService, useValue: emptyConfigService },
          ],
        }).compile(),
      ).rejects.toThrow();
    });
  });

  describe('uploadBugReportImage', () => {
    describe('public bucket', () => {
      it('should successfully upload image and return public URL', async () => {
        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const result = await client.uploadBugReportImage(mockFile);

        expect(mockS3Send).toHaveBeenCalledTimes(1);
        expect(mockS3Send).toHaveBeenCalledWith(expect.any(PutObjectCommand));

        expect(result).toMatch(
          /^https:\/\/s3\.ap-northeast-2\.amazonaws\.com\/test-bucket\/bug-reports\/.+\.jpg$/,
        );
        expect(getSignedUrl).not.toHaveBeenCalled();
      });

      it('should use correct file extension from original filename', async () => {
        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const pngFile = {
          ...mockFile,
          originalname: 'test.png',
          mimetype: 'image/png',
        };
        const result = await client.uploadBugReportImage(pngFile);

        expect(mockS3Send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
        expect(result).toMatch(/\.png$/);
      });

      it('should use filename as extension when file has no extension', async () => {
        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const noExtFile = { ...mockFile, originalname: 'testfile' };
        const result = await client.uploadBugReportImage(noExtFile);

        expect(mockS3Send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
        expect(result).toMatch(/\.testfile$/);
      });

      it('should generate unique key with timestamp and random string', async () => {
        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const result1 = await client.uploadBugReportImage(mockFile);
        const result2 = await client.uploadBugReportImage(mockFile);

        expect(mockS3Send).toHaveBeenCalledTimes(2);
        expect(result1).not.toBe(result2);
        expect(result1).toContain(
          AWS_S3_BUG_REPORT_CONFIG.BUG_REPORT_IMAGE_PREFIX,
        );
        expect(result2).toContain(
          AWS_S3_BUG_REPORT_CONFIG.BUG_REPORT_IMAGE_PREFIX,
        );
      });

      it('should handle file without mimetype', async () => {
        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const noMimeFile = {
          ...mockFile,
          mimetype: undefined as unknown as string,
        };
        const result = await client.uploadBugReportImage(noMimeFile);

        expect(mockS3Send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
        expect(result).toBeDefined();
      });
    });

    describe('private bucket', () => {
      // Helper function to create S3Client for private bucket tests
      async function createPrivateBucketClient() {
        const privateConfigService = createMockConfigService({
          AWS_S3_ACCESS_KEY_ID: 'test-access-key-id',
          AWS_S3_SECRET_ACCESS_KEY: 'test-secret-access-key',
          AWS_S3_BUCKET: 'test-bucket',
          AWS_S3_REGION: 'ap-northeast-2',
          AWS_S3_BUCKET_PUBLIC: 'false',
        });

        mockS3Send = jest.fn();
        (AwsS3Client as jest.Mock).mockImplementation(() => ({
          send: mockS3Send,
        }));

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            S3Client,
            { provide: ConfigService, useValue: privateConfigService },
          ],
        }).compile();

        client = module.get<S3Client>(S3Client);
        jest.clearAllMocks();
      }

      it('should successfully upload image and return presigned URL', async () => {
        // Setup: Create private bucket client
        await createPrivateBucketClient();
        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const presignedUrl =
          'https://test-bucket.s3.amazonaws.com/bug-reports/file.jpg?signature=xyz';
        (getSignedUrl as jest.Mock).mockResolvedValue(presignedUrl);

        const result = await client.uploadBugReportImage(mockFile);

        expect(mockS3Send).toHaveBeenCalledTimes(1);
        expect(mockS3Send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
        expect(getSignedUrl).toHaveBeenCalledTimes(1);
        expect(getSignedUrl).toHaveBeenCalledWith(
          expect.anything(),
          expect.any(GetObjectCommand),
          { expiresIn: 7 * 24 * 60 * 60 },
        );

        expect(result).toBe(presignedUrl);
      });

      it('should set presigned URL expiration to 7 days', async () => {
        // Setup: Create private bucket client
        await createPrivateBucketClient();

        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });
        (getSignedUrl as jest.Mock).mockResolvedValue(
          'https://presigned-url.com',
        );

        await client.uploadBugReportImage(mockFile);

        expect(getSignedUrl).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          { expiresIn: 7 * 24 * 60 * 60 }, // 7 days in seconds
        );
      });
    });

    describe('error handling', () => {
      it('should throw ExternalApiException on S3 upload failure', async () => {
        const s3Error = new Error('S3 upload failed');
        mockS3Send.mockRejectedValue(s3Error);

        await expect(client.uploadBugReportImage(mockFile)).rejects.toThrow(
          ExternalApiException,
        );
      });

      it('should include provider info in exception', async () => {
        const s3Error = new Error('S3 upload failed');
        mockS3Send.mockRejectedValue(s3Error);

        try {
          await client.uploadBugReportImage(mockFile);
          fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(ExternalApiException);
          expect((e as ExternalApiException).provider).toBe('S3');
          expect((e as ExternalApiException).originalError).toBe(s3Error);
        }
      });

      it('should throw ExternalApiException with custom message', async () => {
        const s3Error = new Error('Network timeout');
        mockS3Send.mockRejectedValue(s3Error);

        try {
          await client.uploadBugReportImage(mockFile);
          fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(ExternalApiException);
          const response = e.getResponse();
          expect(response.message).toBe('Failed to upload image');
        }
      });

      it('should throw ExternalApiException on 403 access denied', async () => {
        const accessDeniedError = new Error('Access Denied') as Error & {
          name: string;
        };
        accessDeniedError.name = 'AccessDenied';
        mockS3Send.mockRejectedValue(accessDeniedError);

        await expect(client.uploadBugReportImage(mockFile)).rejects.toThrow(
          ExternalApiException,
        );
      });

      it('should throw ExternalApiException on 404 bucket not found', async () => {
        const notFoundError = new Error('NoSuchBucket') as Error & {
          name: string;
        };
        notFoundError.name = 'NoSuchBucket';
        mockS3Send.mockRejectedValue(notFoundError);

        await expect(client.uploadBugReportImage(mockFile)).rejects.toThrow(
          ExternalApiException,
        );
      });

      it('should throw ExternalApiException on 500 internal error', async () => {
        const internalError = new Error('InternalError') as Error & {
          name: string;
        };
        internalError.name = 'InternalError';
        mockS3Send.mockRejectedValue(internalError);

        await expect(client.uploadBugReportImage(mockFile)).rejects.toThrow(
          ExternalApiException,
        );
      });

      it('should throw ExternalApiException on network error', async () => {
        const networkError = new Error('Network error') as Error & {
          code: string;
        };
        networkError.code = 'ENOTFOUND';
        mockS3Send.mockRejectedValue(networkError);

        await expect(client.uploadBugReportImage(mockFile)).rejects.toThrow(
          ExternalApiException,
        );
      });

      it('should throw ExternalApiException on timeout', async () => {
        const timeoutError = new Error('Request timeout') as Error & {
          code: string;
        };
        timeoutError.code = 'ETIMEDOUT';
        mockS3Send.mockRejectedValue(timeoutError);

        await expect(client.uploadBugReportImage(mockFile)).rejects.toThrow(
          ExternalApiException,
        );
      });

      it('should throw ExternalApiException on presigned URL generation failure', async () => {
        // Setup private bucket
        configService = createMockConfigService({
          AWS_S3_ACCESS_KEY_ID: 'test-access-key-id',
          AWS_S3_SECRET_ACCESS_KEY: 'test-secret-access-key',
          AWS_S3_BUCKET: 'test-bucket',
          AWS_S3_REGION: 'ap-northeast-2',
          AWS_S3_BUCKET_PUBLIC: 'false',
        });

        mockS3Send = jest.fn();
        (AwsS3Client as jest.Mock).mockImplementation(() => ({
          send: mockS3Send,
        }));

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            S3Client,
            { provide: ConfigService, useValue: configService },
          ],
        }).compile();

        client = module.get<S3Client>(S3Client);

        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const presignError = new Error('Failed to generate presigned URL');
        (getSignedUrl as jest.Mock).mockRejectedValue(presignError);

        await expect(client.uploadBugReportImage(mockFile)).rejects.toThrow(
          ExternalApiException,
        );
      });

      it('should throw ExternalApiException on invalid credentials', async () => {
        const credentialsError = new Error('InvalidAccessKeyId') as Error & {
          name: string;
        };
        credentialsError.name = 'InvalidAccessKeyId';
        mockS3Send.mockRejectedValue(credentialsError);

        await expect(client.uploadBugReportImage(mockFile)).rejects.toThrow(
          ExternalApiException,
        );
      });

      it('should throw ExternalApiException on signature mismatch', async () => {
        const signatureError = new Error('SignatureDoesNotMatch') as Error & {
          name: string;
        };
        signatureError.name = 'SignatureDoesNotMatch';
        mockS3Send.mockRejectedValue(signatureError);

        await expect(client.uploadBugReportImage(mockFile)).rejects.toThrow(
          ExternalApiException,
        );
      });
    });
  });
});
