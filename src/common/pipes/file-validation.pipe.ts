import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ImageValidationPipe implements PipeTransform {
  private readonly maxSize = 5 * 1024 * 1024; // 5MB
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
      if (file.size > this.maxSize) {
        throw new BadRequestException(
          `File ${file.originalname} exceeds 5MB limit`,
        );
      }
      if (!this.allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          `File ${file.originalname} has invalid type: ${file.mimetype}`,
        );
      }
    }
    return files;
  }
}
