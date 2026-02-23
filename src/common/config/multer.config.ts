import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { FILE_UPLOAD } from '@/common/constants/business.constants';

/**
 * Multer configuration for file uploads
 *
 * Security limits:
 * - Individual file size: 5MB
 * - Total request size: 30MB (prevents DoS via many files)
 * - Field name size: 100 bytes
 * - Field value size: 1MB
 * - Total fields: 100
 */
export const MULTER_OPTIONS: MulterOptions = {
  limits: {
    fileSize: FILE_UPLOAD.MAX_FILE_SIZE, // 5MB per file
    files: FILE_UPLOAD.MAX_FILES_COUNT, // Max 5 files
    fieldNameSize: 100, // Max field name size in bytes
    fieldSize: 1024 * 1024, // 1MB max field value size
    fields: 100, // Max number of non-file fields
  },
};
