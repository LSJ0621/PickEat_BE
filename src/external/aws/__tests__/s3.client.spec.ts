import { BadRequestException } from '@nestjs/common';
import { S3Client } from '../clients/s3.client';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';

describe('S3Client', () => {
  let client: S3Client;

  beforeEach(() => {
    client = Object.create(S3Client.prototype);
  });

  describe('uploadImage (private)', () => {
    const makeFile = (overrides: Partial<Express.Multer.File> = {}) =>
      ({
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('fake-bytes'),
        size: 10,
        ...overrides,
      }) as Express.Multer.File;

    const uploadImage = (
      file: Express.Multer.File,
      prefix = 'bug-reports/',
      logContext = 'Bug report image',
    ) => (client as any).uploadImage(file, prefix, logContext);

    beforeEach(() => {
      (client as any).logger = {
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        log: jest.fn(),
      };
      (client as any).bucketName = 'test-bucket';
      (client as any).region = 'ap-northeast-2';
      (client as any).isPublicBucket = true;
      (client as any).s3Client = { send: jest.fn().mockResolvedValue({}) };
    });

    it('public 버킷 업로드 성공 시 path-style URL을 반환한다', async () => {
      const url = await uploadImage(makeFile());
      expect(url).toMatch(
        /^https:\/\/s3\.ap-northeast-2\.amazonaws\.com\/test-bucket\/bug-reports\//,
      );
      expect((client as any).s3Client.send).toHaveBeenCalledTimes(1);
    });

    it('잘못된 파일명(path traversal)은 ExternalApiException으로 래핑된다', async () => {
      // extractSafeFileExtension이 BadRequestException을 throw → 바깥 catch에서 래핑
      await expect(
        uploadImage(makeFile({ originalname: '../etc/passwd' })),
      ).rejects.toThrow(ExternalApiException);
    });

    it('S3 send 실패 시 ExternalApiException을 던진다', async () => {
      (client as any).s3Client.send = jest
        .fn()
        .mockRejectedValue(new Error('network down'));
      await expect(uploadImage(makeFile())).rejects.toThrow(
        ExternalApiException,
      );
    });
  });

  describe('getBucketStats', () => {
    beforeEach(() => {
      (client as any).logger = {
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        log: jest.fn(),
      };
      (client as any).bucketName = 'test-bucket';
    });

    it('Contents를 순회하여 totalSizeBytes와 fileCount를 집계한다', async () => {
      (client as any).s3Client = {
        send: jest.fn().mockResolvedValue({
          Contents: [
            { Key: 'a.jpg', Size: 100, LastModified: new Date('2024-01-01') },
            { Key: 'b.jpg', Size: 200, LastModified: new Date('2024-01-02') },
          ],
          NextContinuationToken: undefined,
        }),
      };
      const result = await client.getBucketStats();
      expect(result.fileCount).toBe(2);
      expect(result.totalSizeBytes).toBe(300);
      expect(result.files).toHaveLength(2);
    });

    it('S3 send 실패 시 ExternalApiException을 던진다', async () => {
      (client as any).s3Client = {
        send: jest.fn().mockRejectedValue(new Error('boom')),
      };
      await expect(client.getBucketStats()).rejects.toThrow(
        ExternalApiException,
      );
    });
  });

  describe('extractSafeFileExtension', () => {
    const extract = (name: string) =>
      (client as any).extractSafeFileExtension(name);

    it('정상적인 이미지 파일명에서 확장자를 추출한다', () => {
      expect(extract('photo.jpg')).toBe('jpg');
      expect(extract('image.png')).toBe('png');
      expect(extract('animation.gif')).toBe('gif');
      expect(extract('modern.webp')).toBe('webp');
      expect(extract('photo.jpeg')).toBe('jpeg');
      expect(extract('apple.heic')).toBe('heic');
    });

    it('대문자 확장자를 소문자로 변환한다', () => {
      expect(extract('PHOTO.JPG')).toBe('jpg');
      expect(extract('IMAGE.PNG')).toBe('png');
    });

    it('확장자가 없으면 기본값 jpg를 반환한다', () => {
      expect(extract('noextension')).toBe('jpg');
    });

    it('Path Traversal 패턴이 포함되면 예외를 던진다', () => {
      expect(() => extract('../etc/passwd')).toThrow(BadRequestException);
      expect(() => extract('..\\windows\\system32')).toThrow(BadRequestException);
      expect(() => extract('file\0name.jpg')).toThrow(BadRequestException);
      expect(() => extract('path\\file.jpg')).toThrow(BadRequestException);
    });

    it('허용되지 않은 확장자이면 예외를 던진다', () => {
      expect(() => extract('script.js')).toThrow(BadRequestException);
      expect(() => extract('payload.exe')).toThrow(BadRequestException);
      expect(() => extract('document.pdf')).toThrow(BadRequestException);
      expect(() => extract('style.css')).toThrow(BadRequestException);
    });

    it('빈 파일명이나 점만 있으면 예외를 던진다', () => {
      expect(() => extract('.')).toThrow(BadRequestException);
      expect(() => extract('..')).toThrow(BadRequestException);
    });

    it('디렉토리 경로가 포함된 파일명에서 basename만 추출한다', () => {
      expect(extract('uploads/photos/image.png')).toBe('png');
    });

    it('여러 점이 있는 파일명에서 마지막 확장자를 추출한다', () => {
      expect(extract('my.photo.2024.jpg')).toBe('jpg');
    });
  });
});
