module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/test/jest-setup.ts'],
  testTimeout: 30000,
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/e2e/setup/',
    '/test/utils/',
    '/test/mocks/',
    '/test/constants/',
    '/test/fixtures/',
    '/test/factories/',
    // 전략 문서 §2.1 "테스트하지 않는 것" — 선언적/인프라 파일
    '/external/openai/prompts/', // OpenAI 프롬프트 빌더 (선언적 문자열 조립)
    '/common/filters/http-exception.filter.ts$', // 전역 필터, E2E로 간접 커버
    '/common/validators/s3-url.validator.ts$', // trivial 검증자
    // 전략 §2.1 "단순 CRUD" — Admin 서비스 (복잡 로직 없음, E2E 커버)
    '/admin/user/admin-user.service.ts$',
    '/admin/settings/admin-settings.service.ts$',
    '/admin/dashboard/admin-dashboard.service.ts$',
    '/user-place/services/admin-user-place.service.ts$',
    // 부트스트랩/시더 (프로덕션 로직 아님)
    'test-user-seeder\\.service\\.ts$',
    'admin-initializer\\.service\\.ts$',
    'menu-selection-seeder\\.service\\.ts$',
    // 단순 스케줄 트리거 (도메인 재사용만)
    '/rating/services/rating-scheduler.service.ts$',
    '/notification/services/notification-scheduler.service.ts$',
  ],
};
