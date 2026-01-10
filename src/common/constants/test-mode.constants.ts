/**
 * 테스트 모드 관련 상수
 * NODE_ENV=test 환경에서만 사용됨
 */
export const TEST_MODE = {
  /** 이메일 인증에서 항상 통과하는 테스트 코드 */
  EMAIL_VERIFICATION_CODE: '123456',

  /** OAuth 테스트 코드 */
  OAUTH_CODES: {
    /** 정상 로그인 (신규 또는 기존 사용자) */
    VALID: 'test-valid-code',
    /** 이름 없는 사용자 (카카오 이름 미동의) */
    NO_NAME: 'test-no-name-code',
    /** 탈퇴한 사용자 (RE_REGISTER_REQUIRED) */
    DELETED_USER: 'test-deleted-user-code',
    /** 유효하지 않은 코드 (401 에러) */
    INVALID: 'invalid-code',
  },

  /** 테스트 사용자 정보 */
  USERS: {
    REGULAR: {
      email: 'test@example.com',
      password: 'password123',
      role: 'USER',
      name: '테스트유저',
    },
    ADMIN: {
      email: 'admin@example.com',
      password: 'adminpassword',
      role: 'ADMIN',
      name: '관리자',
    },
    DELETED: {
      email: 'deleted@example.com',
      password: 'deletedpassword',
      role: 'USER',
      name: '탈퇴유저',
    },
  },

  /** OAuth 테스트용 소셜 ID */
  SOCIAL_IDS: {
    KAKAO: {
      VALID: 123456789,
      NO_NAME: 123456790,
      DELETED: 123456791,
    },
    GOOGLE: {
      VALID: 'google-test-valid-id',
      NO_NAME: 'google-test-no-name-id',
      DELETED: 'google-test-deleted-id',
    },
  },
} as const;
