/**
 * 파일 정보
 */
export interface FileInfo {
  key: string;
  size: number;
  lastModified: Date;
}

/**
 * 스토리지 통계 응답 DTO
 */
export class StorageStatsResponseDto {
  totalSizeBytes: number;
  totalSizeMb: number;
  fileCount: number;
  files: FileInfo[];
}
