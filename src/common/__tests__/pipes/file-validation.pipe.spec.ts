import { BadRequestException } from '@nestjs/common';
import { Readable } from 'stream';
import { ImageValidationPipe } from '@/common/pipes/file-validation.pipe';

const FIVE_MB = 5 * 1024 * 1024;

/** JPEG magic bytes: FF D8 FF */
function createJpegBuffer(): Buffer {
  const buf = Buffer.alloc(16);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

/** PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A */
function createPngBuffer(): Buffer {
  const buf = Buffer.alloc(16);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  return buf;
}

/** WebP magic bytes: RIFF at 0 + WEBP at offset 8 */
function createWebpBuffer(): Buffer {
  const buf = Buffer.alloc(16);
  buf[0] = 0x52; // R
  buf[1] = 0x49; // I
  buf[2] = 0x46; // F
  buf[3] = 0x46; // F
  buf[8] = 0x57; // W
  buf[9] = 0x45; // E
  buf[10] = 0x42; // B
  buf[11] = 0x50; // P
  return buf;
}

function createMockFile(
  overrides: Partial<Express.Multer.File>,
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'test.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: createJpegBuffer(),
    destination: '',
    filename: 'test.jpg',
    path: '',
    stream: new Readable(),
    ...overrides,
  };
}

describe('ImageValidationPipe', () => {
  let pipe: ImageValidationPipe;

  beforeEach(() => {
    pipe = new ImageValidationPipe();
  });

  it('허용된 이미지 형식(jpg, png, webp)은 통과한다', () => {
    const jpegFile = createMockFile({
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
      buffer: createJpegBuffer(),
      size: 1024,
    });
    const pngFile = createMockFile({
      originalname: 'photo.png',
      mimetype: 'image/png',
      buffer: createPngBuffer(),
      size: 2048,
    });
    const webpFile = createMockFile({
      originalname: 'photo.webp',
      mimetype: 'image/webp',
      buffer: createWebpBuffer(),
      size: 512,
    });

    expect(() => pipe.transform([jpegFile])).not.toThrow();
    expect(() => pipe.transform([pngFile])).not.toThrow();
    expect(() => pipe.transform([webpFile])).not.toThrow();
  });

  it('허용되지 않는 MIME 타입(exe, sh)은 400 BadRequestException을 던진다', () => {
    const exeFile = createMockFile({
      originalname: 'malware.exe',
      mimetype: 'application/octet-stream',
      buffer: Buffer.from([0x4d, 0x5a]), // MZ header (Windows EXE)
      size: 1024,
    });

    expect(() => pipe.transform([exeFile])).toThrow(BadRequestException);
    expect(() => pipe.transform([exeFile])).toThrow(
      'malware.exe has invalid type',
    );
  });

  it('5MB를 초과하는 파일은 400 BadRequestException을 던진다', () => {
    const largeFile = createMockFile({
      originalname: 'large.jpg',
      mimetype: 'image/jpeg',
      buffer: createJpegBuffer(),
      size: FIVE_MB + 1,
    });

    expect(() => pipe.transform([largeFile])).toThrow(BadRequestException);
    expect(() => pipe.transform([largeFile])).toThrow(
      'large.jpg exceeds 5MB limit',
    );
  });

  it('빈 배열이 전달되면 그대로 반환한다', () => {
    const result = pipe.transform([]);
    expect(result).toEqual([]);
  });

  it('undefined 또는 null이 전달되면 그대로 반환한다 (파일 없음)', () => {
    const undefinedResult = pipe.transform(
      undefined as unknown as Express.Multer.File[],
    );
    expect(undefinedResult).toBeUndefined();

    const nullResult = pipe.transform(
      null as unknown as Express.Multer.File[],
    );
    expect(nullResult).toBeNull();
  });
});
