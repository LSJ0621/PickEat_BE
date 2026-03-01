import { BadRequestException } from '@nestjs/common';
import { ImageValidationPipe } from '../../pipes/file-validation.pipe';
import * as fileValidationUtil from '../../utils/file-validation.util';

jest.mock('../../utils/file-validation.util');

const mockValidateImageMagicBytes =
  fileValidationUtil.validateImageMagicBytes as jest.MockedFunction<
    typeof fileValidationUtil.validateImageMagicBytes
  >;

function createMockFile(
  overrides?: Partial<Express.Multer.File>,
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'test-image.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024 * 1024, // 1MB
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), // JPEG magic bytes
    destination: '',
    filename: '',
    path: '',
    stream: null as never,
    ...overrides,
  };
}

describe('ImageValidationPipe', () => {
  let pipe: ImageValidationPipe;

  beforeEach(() => {
    jest.clearAllMocks();
    pipe = new ImageValidationPipe();
    mockValidateImageMagicBytes.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('transform', () => {
    it('should return files unchanged when all files pass validation', () => {
      const files = [createMockFile()];

      const result = pipe.transform(files);

      expect(result).toBe(files);
    });

    it('should return files unchanged when files array is empty', () => {
      const result = pipe.transform([]);

      expect(result).toEqual([]);
      expect(mockValidateImageMagicBytes).not.toHaveBeenCalled();
    });

    it('should return files unchanged when files is null', () => {
      const result = pipe.transform(null as never);

      expect(result).toBeNull();
    });

    it('should return files unchanged when files is undefined', () => {
      const result = pipe.transform(undefined as never);

      expect(result).toBeUndefined();
    });

    it('should throw BadRequestException when file exceeds 5MB size limit', () => {
      const oversizedFile = createMockFile({
        originalname: 'large-image.jpg',
        size: 6 * 1024 * 1024, // 6MB
      });

      expect(() => pipe.transform([oversizedFile])).toThrow(
        BadRequestException,
      );
      expect(() => pipe.transform([oversizedFile])).toThrow(
        'large-image.jpg exceeds 5MB limit',
      );
    });

    it('should throw BadRequestException when file has invalid MIME type', () => {
      const invalidTypeFile = createMockFile({
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
        size: 1024,
      });

      expect(() => pipe.transform([invalidTypeFile])).toThrow(
        BadRequestException,
      );
      expect(() => pipe.transform([invalidTypeFile])).toThrow(
        'invalid type: application/pdf',
      );
    });

    it('should throw BadRequestException when file fails magic bytes validation', () => {
      mockValidateImageMagicBytes.mockReturnValue(false);

      const invalidFile = createMockFile({
        originalname: 'fake-image.jpg',
      });

      expect(() => pipe.transform([invalidFile])).toThrow(BadRequestException);
      expect(() => pipe.transform([invalidFile])).toThrow(
        'magic bytes check failed',
      );
    });

    it('should validate each file in the array and throw on first invalid file', () => {
      const validFile = createMockFile({ originalname: 'valid.jpg' });
      const oversizedFile = createMockFile({
        originalname: 'large.jpg',
        size: 10 * 1024 * 1024, // 10MB
      });

      expect(() => pipe.transform([validFile, oversizedFile])).toThrow(
        BadRequestException,
      );
    });

    it('should accept all allowed MIME types without throwing', () => {
      const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
      ];

      for (const mimetype of allowedMimeTypes) {
        const file = createMockFile({
          mimetype,
          originalname: `image.${mimetype.split('/')[1]}`,
        });
        expect(() => pipe.transform([file])).not.toThrow();
      }
    });
  });
});
