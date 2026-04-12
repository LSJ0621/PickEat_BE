import { validateImageMagicBytes } from '../../utils/file-validation.util';

describe('validateImageMagicBytes', () => {
  it('JPEG 파일 시그니처를 인식한다', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(validateImageMagicBytes(jpeg)).toBe(true);
  });

  it('PNG 파일 시그니처를 인식한다', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(validateImageMagicBytes(png)).toBe(true);
  });

  it('GIF87a 시그니처를 인식한다', () => {
    const gif87a = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
    expect(validateImageMagicBytes(gif87a)).toBe(true);
  });

  it('GIF89a 시그니처를 인식한다', () => {
    const gif89a = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(validateImageMagicBytes(gif89a)).toBe(true);
  });

  it('WebP 파일 시그니처를 인식한다 (RIFF + WEBP)', () => {
    // RIFF....WEBP
    const webp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // file size (placeholder)
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(validateImageMagicBytes(webp)).toBe(true);
  });

  it('RIFF 헤더만 있고 WEBP 시그니처가 없으면 거부한다', () => {
    const riffOnly = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0x00, 0x00, 0x00, 0x00,
      0x41, 0x56, 0x49, 0x20, // AVI instead of WEBP
    ]);
    expect(validateImageMagicBytes(riffOnly)).toBe(false);
  });

  it('알 수 없는 파일 형식을 거부한다', () => {
    const unknown = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(validateImageMagicBytes(unknown)).toBe(false);
  });

  it('빈 버퍼를 거부한다', () => {
    expect(validateImageMagicBytes(Buffer.alloc(0))).toBe(false);
  });

  it('너무 짧은 버퍼를 거부한다', () => {
    const short = Buffer.from([0xff]);
    expect(validateImageMagicBytes(short)).toBe(false);
  });
});
