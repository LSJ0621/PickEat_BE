/**
 * File validation utility for checking magic bytes (file signatures)
 *
 * Magic bytes are the first few bytes of a file that identify the file format.
 * This prevents attackers from uploading malicious files with fake extensions.
 */

interface MagicBytesPattern {
  signature: number[];
  offset?: number; // Offset from start of file (default: 0)
}

/**
 * Known image format magic bytes
 * Reference: https://en.wikipedia.org/wiki/List_of_file_signatures
 */
const IMAGE_MAGIC_BYTES: Record<string, MagicBytesPattern[]> = {
  jpeg: [
    { signature: [0xff, 0xd8, 0xff] }, // JPEG (most common)
  ],
  png: [
    { signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }, // PNG
  ],
  gif: [
    { signature: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
    { signature: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
  ],
  webp: [
    // WebP: RIFF container with WEBP signature
    // Bytes 0-3: "RIFF" (0x52 0x49 0x46 0x46)
    // Bytes 8-11: "WEBP" (0x57 0x45 0x42 0x50)
    { signature: [0x52, 0x49, 0x46, 0x46] }, // RIFF header
    { signature: [0x57, 0x45, 0x42, 0x50], offset: 8 }, // WEBP signature
  ],
};

/**
 * Check if buffer matches a specific magic byte pattern
 */
function matchesPattern(buffer: Buffer, pattern: MagicBytesPattern): boolean {
  const offset = pattern.offset ?? 0;
  if (buffer.length < offset + pattern.signature.length) {
    return false;
  }

  return pattern.signature.every(
    (byte, index) => buffer[offset + index] === byte,
  );
}

/**
 * Validate image file by checking magic bytes
 *
 * @param buffer - File buffer to validate
 * @returns true if file matches known image format magic bytes
 *
 * @example
 * ```typescript
 * const fileBuffer = await fs.promises.readFile('image.jpg');
 * if (!validateImageMagicBytes(fileBuffer)) {
 *   throw new Error('Invalid image file');
 * }
 * ```
 */
export function validateImageMagicBytes(buffer: Buffer): boolean {
  if (!buffer || buffer.length === 0) {
    return false;
  }

  // Check against all known image formats
  for (const [format, patterns] of Object.entries(IMAGE_MAGIC_BYTES)) {
    if (format === 'webp') {
      // WebP requires BOTH patterns to match (RIFF header + WEBP signature)
      const allMatch = patterns.every((pattern) =>
        matchesPattern(buffer, pattern),
      );
      if (allMatch) {
        return true;
      }
    } else {
      // Other formats: ANY pattern matches (e.g., GIF87a OR GIF89a)
      const anyMatch = patterns.some((pattern) =>
        matchesPattern(buffer, pattern),
      );
      if (anyMatch) {
        return true;
      }
    }
  }

  return false;
}
