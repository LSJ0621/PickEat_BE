/**
 * AWS S3 버그 리포트 이미지 업로드 설정
 */
export const AWS_S3_BUG_REPORT_CONFIG = {
  /** 버그 리포트 이미지 저장 경로 prefix */
  BUG_REPORT_IMAGE_PREFIX: 'bug-reports/',
} as const;

/**
 * AWS S3 유저 장소 이미지 업로드 설정
 */
export const AWS_S3_USER_PLACE_CONFIG = {
  /** 유저 장소 이미지 저장 경로 prefix */
  USER_PLACE_IMAGE_PREFIX: 'user-places/',
} as const;
