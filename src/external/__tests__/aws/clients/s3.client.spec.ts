import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '../../../aws/clients/s3.client';
import {
  S3Client as AwsS3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createMockConfigService } from '../../../../../test/mocks/external-clients.mock';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import {
  AWS_S3_BUG_REPORT_CONFIG,
  AWS_S3_USER_PLACE_CONFIG,
} from '../../../aws/aws.constants';

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
        expect(result).toMatch(/\.jpg$/);
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

  describe('uploadUserPlaceImage', () => {
    describe('public bucket', () => {
      it('should successfully upload image and return public URL', async () => {
        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const result = await client.uploadUserPlaceImage(mockFile);

        expect(mockS3Send).toHaveBeenCalledTimes(1);
        expect(mockS3Send).toHaveBeenCalledWith(expect.any(PutObjectCommand));

        expect(result).toMatch(
          /^https:\/\/s3\.ap-northeast-2\.amazonaws\.com\/test-bucket\/user-places\/.+\.jpg$/,
        );
        expect(getSignedUrl).not.toHaveBeenCalled();
      });

      it('should use correct S3 prefix for user place images', async () => {
        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const result = await client.uploadUserPlaceImage(mockFile);

        expect(result).toContain(
          AWS_S3_USER_PLACE_CONFIG.USER_PLACE_IMAGE_PREFIX,
        );
        expect(result).toMatch(/user-places\//);
      });

      it('should handle different file extensions correctly', async () => {
        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const pngFile = {
          ...mockFile,
          originalname: 'restaurant.png',
          mimetype: 'image/png',
        };
        const resultPng = await client.uploadUserPlaceImage(pngFile);

        const webpFile = {
          ...mockFile,
          originalname: 'menu.webp',
          mimetype: 'image/webp',
        };
        const resultWebp = await client.uploadUserPlaceImage(webpFile);

        const heicFile = {
          ...mockFile,
          originalname: 'photo.heic',
          mimetype: 'image/heic',
        };
        const resultHeic = await client.uploadUserPlaceImage(heicFile);

        expect(resultPng).toMatch(/\.png$/);
        expect(resultWebp).toMatch(/\.webp$/);
        expect(resultHeic).toMatch(/\.heic$/);
        expect(mockS3Send).toHaveBeenCalledTimes(3);
      });

      it('should generate unique keys for multiple uploads', async () => {
        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const result1 = await client.uploadUserPlaceImage(mockFile);
        const result2 = await client.uploadUserPlaceImage(mockFile);
        const result3 = await client.uploadUserPlaceImage(mockFile);

        expect(mockS3Send).toHaveBeenCalledTimes(3);
        expect(result1).not.toBe(result2);
        expect(result2).not.toBe(result3);
        expect(result1).not.toBe(result3);
      });

      it('should use default extension when file has no extension', async () => {
        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const noExtFile = { ...mockFile, originalname: 'image_file' };
        const result = await client.uploadUserPlaceImage(noExtFile);

        expect(result).toMatch(/\.jpg$/);
      });

      it('should handle file without mimetype gracefully', async () => {
        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const noMimeFile = {
          ...mockFile,
          mimetype: undefined as unknown as string,
        };
        const result = await client.uploadUserPlaceImage(noMimeFile);

        expect(mockS3Send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
        expect(result).toBeDefined();
      });
    });

    describe('private bucket', () => {
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
        await createPrivateBucketClient();
        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });

        const presignedUrl =
          'https://test-bucket.s3.amazonaws.com/user-places/file.jpg?signature=xyz';
        (getSignedUrl as jest.Mock).mockResolvedValue(presignedUrl);

        const result = await client.uploadUserPlaceImage(mockFile);

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
        await createPrivateBucketClient();

        mockS3Send.mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
        });
        (getSignedUrl as jest.Mock).mockResolvedValue(
          'https://presigned-url.com',
        );

        await client.uploadUserPlaceImage(mockFile);

        expect(getSignedUrl).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          { expiresIn: 7 * 24 * 60 * 60 },
        );
      });
    });

    describe('error handling', () => {
      it('should throw ExternalApiException on S3 upload failure', async () => {
        const s3Error = new Error('S3 upload failed');
        mockS3Send.mockRejectedValue(s3Error);

        await expect(client.uploadUserPlaceImage(mockFile)).rejects.toThrow(
          ExternalApiException,
        );
      });

      it('should include provider info in exception', async () => {
        const s3Error = new Error('S3 upload failed');
        mockS3Send.mockRejectedValue(s3Error);

        try {
          await client.uploadUserPlaceImage(mockFile);
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
          await client.uploadUserPlaceImage(mockFile);
          fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(ExternalApiException);
          const response = e.getResponse();
          expect(response.message).toBe('Failed to upload image');
        }
      });

      it('should throw ExternalApiException on access denied', async () => {
        const accessDeniedError = new Error('Access Denied') as Error & {
          name: string;
        };
        accessDeniedError.name = 'AccessDenied';
        mockS3Send.mockRejectedValue(accessDeniedError);

        await expect(client.uploadUserPlaceImage(mockFile)).rejects.toThrow(
          ExternalApiException,
        );
      });

      it('should throw ExternalApiException on bucket not found', async () => {
        const notFoundError = new Error('NoSuchBucket') as Error & {
          name: string;
        };
        notFoundError.name = 'NoSuchBucket';
        mockS3Send.mockRejectedValue(notFoundError);

        await expect(client.uploadUserPlaceImage(mockFile)).rejects.toThrow(
          ExternalApiException,
        );
      });

      it('should throw ExternalApiException on invalid credentials', async () => {
        const credentialsError = new Error('InvalidAccessKeyId') as Error & {
          name: string;
        };
        credentialsError.name = 'InvalidAccessKeyId';
        mockS3Send.mockRejectedValue(credentialsError);

        await expect(client.uploadUserPlaceImage(mockFile)).rejects.toThrow(
          ExternalApiException,
        );
      });
    });
  });

  describe('extractSafeFileExtension (path traversal validation)', () => {
    it('should throw ExternalApiException wrapping path traversal error for ../', async () => {
      const maliciousFile = { ...mockFile, originalname: '../etc/passwd' };
      mockS3Send.mockResolvedValue({ $metadata: { httpStatusCode: 200 } });

      await expect(client.uploadBugReportImage(maliciousFile)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException wrapping path traversal error for ..\\', async () => {
      const maliciousFile = {
        ...mockFile,
        originalname: '..\\windows\\system32',
      };
      mockS3Send.mockResolvedValue({ $metadata: { httpStatusCode: 200 } });

      await expect(client.uploadBugReportImage(maliciousFile)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException for null byte injection', async () => {
      const maliciousFile = { ...mockFile, originalname: 'file\0.jpg' };
      mockS3Send.mockResolvedValue({ $metadata: { httpStatusCode: 200 } });

      await expect(client.uploadBugReportImage(maliciousFile)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException for backslash in filename', async () => {
      const maliciousFile = {
        ...mockFile,
        originalname: 'folder\\file.jpg',
      };
      mockS3Send.mockResolvedValue({ $metadata: { httpStatusCode: 200 } });

      await expect(client.uploadBugReportImage(maliciousFile)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException for invalid extension (svg)', async () => {
      const svgFile = { ...mockFile, originalname: 'image.svg' };
      mockS3Send.mockResolvedValue({ $metadata: { httpStatusCode: 200 } });

      await expect(client.uploadBugReportImage(svgFile)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException for invalid extension (pdf)', async () => {
      const pdfFile = { ...mockFile, originalname: 'document.pdf' };
      mockS3Send.mockResolvedValue({ $metadata: { httpStatusCode: 200 } });

      await expect(client.uploadBugReportImage(pdfFile)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException for filename that is just dots', async () => {
      const dotsFile = { ...mockFile, originalname: '.' };
      mockS3Send.mockResolvedValue({ $metadata: { httpStatusCode: 200 } });

      await expect(client.uploadBugReportImage(dotsFile)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should accept all allowed image extensions', async () => {
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'];
      mockS3Send.mockResolvedValue({ $metadata: { httpStatusCode: 200 } });

      for (const ext of allowedExtensions) {
        jest.clearAllMocks();
        mockS3Send.mockResolvedValue({ $metadata: { httpStatusCode: 200 } });
        const file = { ...mockFile, originalname: `image.${ext}` };
        const result = await client.uploadBugReportImage(file);
        expect(result).toMatch(new RegExp(`\\.${ext}$`));
      }
    });
  });

  describe('getBucketStats', () => {
    it('should return correct stats for a non-empty bucket', async () => {
      const mockListResponse = {
        Contents: [
          {
            Key: 'bug-reports/file1.jpg',
            Size: 1024,
            LastModified: new Date('2024-01-01T00:00:00Z'),
          },
          {
            Key: 'user-places/file2.png',
            Size: 2048,
            LastModified: new Date('2024-01-02T00:00:00Z'),
          },
        ],
        NextContinuationToken: undefined,
      };

      mockS3Send.mockResolvedValueOnce(mockListResponse);

      const result = await client.getBucketStats();

      expect(mockS3Send).toHaveBeenCalledWith(
        expect.any(ListObjectsV2Command),
      );
      expect(result.fileCount).toBe(2);
      expect(result.totalSizeBytes).toBe(3072);
      expect(result.files).toHaveLength(2);
      expect(result.files[0]).toMatchObject({
        key: 'bug-reports/file1.jpg',
        size: 1024,
      });
      expect(result.files[1]).toMatchObject({
        key: 'user-places/file2.png',
        size: 2048,
      });
    });

    it('should return empty stats for an empty bucket', async () => {
      mockS3Send.mockResolvedValueOnce({
        Contents: undefined,
        NextContinuationToken: undefined,
      });

      const result = await client.getBucketStats();

      expect(result.fileCount).toBe(0);
      expect(result.totalSizeBytes).toBe(0);
      expect(result.files).toHaveLength(0);
    });

    it('should paginate when NextContinuationToken is present', async () => {
      const firstPage = {
        Contents: [
          {
            Key: 'file1.jpg',
            Size: 100,
            LastModified: new Date(),
          },
        ],
        NextContinuationToken: 'continuation-token-1',
      };
      const secondPage = {
        Contents: [
          {
            Key: 'file2.jpg',
            Size: 200,
            LastModified: new Date(),
          },
        ],
        NextContinuationToken: undefined,
      };

      mockS3Send
        .mockResolvedValueOnce(firstPage)
        .mockResolvedValueOnce(secondPage);

      const result = await client.getBucketStats();

      expect(mockS3Send).toHaveBeenCalledTimes(2);
      expect(result.fileCount).toBe(2);
      expect(result.totalSizeBytes).toBe(300);
    });

    it('should use default lastModified date when LastModified is missing', async () => {
      mockS3Send.mockResolvedValueOnce({
        Contents: [
          {
            Key: 'file1.jpg',
            Size: 500,
            LastModified: undefined,
          },
        ],
        NextContinuationToken: undefined,
      });

      const result = await client.getBucketStats();

      expect(result.files[0].lastModified).toBeInstanceOf(Date);
    });

    it('should skip objects without Key or Size', async () => {
      mockS3Send.mockResolvedValueOnce({
        Contents: [
          { Key: 'valid-file.jpg', Size: 1024, LastModified: new Date() },
          { Key: undefined, Size: 512, LastModified: new Date() },
          { Key: 'no-size.jpg', Size: undefined, LastModified: new Date() },
        ],
        NextContinuationToken: undefined,
      });

      const result = await client.getBucketStats();

      expect(result.fileCount).toBe(1);
      expect(result.totalSizeBytes).toBe(1024);
    });

    it('should throw ExternalApiException on S3 list error', async () => {
      const s3Error = new Error('ListObjects failed');
      mockS3Send.mockRejectedValueOnce(s3Error);

      await expect(client.getBucketStats()).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should throw ExternalApiException with S3 provider on list error', async () => {
      const s3Error = new Error('Access Denied');
      mockS3Send.mockRejectedValueOnce(s3Error);

      try {
        await client.getBucketStats();
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExternalApiException);
        expect((e as ExternalApiException).provider).toBe('S3');
      }
    });
  });

  describe('uploadUserPlaceImage - private bucket presigned URL failure with cleanup (lines 152-174)', () => {
    it('should delete uploaded file and throw ExternalApiException when presigned URL fails for user place image', async () => {
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

      const privateClient = module.get<S3Client>(S3Client);

      // Upload succeeds, presign fails, delete succeeds
      mockS3Send
        .mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } }) // PutObject
        .mockResolvedValueOnce({ $metadata: { httpStatusCode: 204 } }); // DeleteObject

      const presignError = new Error('Presigned URL failed for user place');
      (getSignedUrl as jest.Mock).mockRejectedValue(presignError);

      await expect(
        privateClient.uploadUserPlaceImage(mockFile),
      ).rejects.toThrow(ExternalApiException);

      // Verify cleanup happened
      expect(mockS3Send).toHaveBeenCalledTimes(2);
      expect(mockS3Send).toHaveBeenNthCalledWith(
        1,
        expect.any(PutObjectCommand),
      );
      expect(mockS3Send).toHaveBeenNthCalledWith(
        2,
        expect.any(DeleteObjectCommand),
      );
    });

    it('should log error and throw ExternalApiException when delete also fails during cleanup for user place image (line 152)', async () => {
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

      const privateClient = module.get<S3Client>(S3Client);

      // Upload succeeds, presign fails, delete also fails
      mockS3Send
        .mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } }) // PutObject
        .mockRejectedValueOnce(new Error('Delete failed too')); // DeleteObject

      const presignError = new Error('Presigned URL failed');
      (getSignedUrl as jest.Mock).mockRejectedValue(presignError);

      await expect(
        privateClient.uploadUserPlaceImage(mockFile),
      ).rejects.toThrow(ExternalApiException);

      // Both upload and delete were attempted
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });

    it('should throw ExternalApiException wrapping non-Error upload failure for uploadUserPlaceImage (lines 167-174)', async () => {
      // Cause a non-Error to be thrown (string) to cover the non-Error branch in catch
      mockS3Send.mockRejectedValue('string upload error');

      await expect(client.uploadUserPlaceImage(mockFile)).rejects.toThrow(
        ExternalApiException,
      );
    });
  });

  describe('getBucketStats - non-Error throw branch (lines 257-262)', () => {
    it('should throw ExternalApiException wrapping a non-Error when S3 list throws a non-Error value', async () => {
      // Throw a plain string (non-Error) to cover the non-Error branch at lines 257-262
      mockS3Send.mockRejectedValueOnce('string s3 error');

      await expect(client.getBucketStats()).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException wrapping a non-Error object when S3 list throws an object', async () => {
      mockS3Send.mockRejectedValueOnce({ code: 'S3Error', message: 'bad' });

      await expect(client.getBucketStats()).rejects.toThrow(ExternalApiException);
    });
  });

  describe('presigned URL failure with cleanup', () => {
    it('should delete uploaded file and throw when presigned URL generation fails', async () => {
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

      const privateClient = module.get<S3Client>(S3Client);

      // Upload succeeds but presigned URL fails, then delete succeeds
      mockS3Send
        .mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } }) // PutObject
        .mockResolvedValueOnce({ $metadata: { httpStatusCode: 204 } }); // DeleteObject

      const presignError = new Error('Presigned URL generation failed');
      (getSignedUrl as jest.Mock).mockRejectedValue(presignError);

      await expect(privateClient.uploadBugReportImage(mockFile)).rejects.toThrow(
        ExternalApiException,
      );

      // Verify cleanup: DeleteObjectCommand was sent after presign failure
      expect(mockS3Send).toHaveBeenCalledTimes(2);
      expect(mockS3Send).toHaveBeenNthCalledWith(
        1,
        expect.any(PutObjectCommand),
      );
      expect(mockS3Send).toHaveBeenNthCalledWith(
        2,
        expect.any(DeleteObjectCommand),
      );
    });

    it('should still throw ExternalApiException even when cleanup delete also fails', async () => {
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

      const privateClient = module.get<S3Client>(S3Client);

      mockS3Send
        .mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } }) // PutObject
        .mockRejectedValueOnce(new Error('Delete also failed')); // DeleteObject

      const presignError = new Error('Presigned URL generation failed');
      (getSignedUrl as jest.Mock).mockRejectedValue(presignError);

      await expect(privateClient.uploadBugReportImage(mockFile)).rejects.toThrow(
        ExternalApiException,
      );
    });
  });
});
