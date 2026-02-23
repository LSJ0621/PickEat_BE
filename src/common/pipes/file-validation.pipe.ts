import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { validateImageMagicBytes } from '@/common/utils/file-validation.util';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@Injectable()
export class ImageValidationPipe implements PipeTransform {
  private readonly maxSize = MAX_FILE_SIZE_BYTES;
  private readonly allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];

  transform(files: Express.Multer.File[]) {
    if (!files || files.length === 0) return files;

    for (const file of files) {
      // Check file size
      if (file.size > this.maxSize) {
        throw new BadRequestException(
          `File ${file.originalname} exceeds 5MB limit`,
        );
      }

      // Check MIME type
      if (!this.allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          `File ${file.originalname} has invalid type: ${file.mimetype}`,
        );
      }

      // Check magic bytes (file signature)
      if (!validateImageMagicBytes(file.buffer)) {
        throw new BadRequestException(
          `File ${file.originalname} is not a valid image (magic bytes check failed)`,
        );
      }
    }
    return files;
  }
}
