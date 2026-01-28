/**
 * Test constants for User Place E2E tests
 */

/**
 * Test place data for various scenarios
 */
export const USER_PLACE_TEST_DATA = {
  /** Valid place within Seoul */
  VALID_PLACE: {
    name: '테스트 식당',
    address: '서울특별시 강남구 테헤란로 123',
    latitude: 37.5012345,
    longitude: 127.0398765,
    menuTypes: ['한식', '찌개류'],
    phoneNumber: '02-1234-5678',
    category: '한식',
    description: '테스트용 맛있는 식당입니다.',
    openingHours: '매일 11:00-22:00',
    photos: [
      'https://example.com/photo1.jpg',
      'https://example.com/photo2.jpg',
    ],
  },

  /** Nearby place (within 100m for duplicate detection) */
  NEARBY_PLACE: {
    name: '근처 식당',
    address: '서울특별시 강남구 테헤란로 124',
    latitude: 37.5013345, // ~100m away
    longitude: 127.0399765,
    menuTypes: ['한식'],
  },

  /** Far place (outside 100m radius) */
  FAR_PLACE: {
    name: '먼 식당',
    address: '서울특별시 강남구 강남대로 456',
    latitude: 37.5112345, // ~1km away
    longitude: 127.0498765,
    menuTypes: ['중식'],
  },

  /** Place with minimal required fields only */
  MINIMAL_PLACE: {
    name: '최소 정보 식당',
    address: '서울특별시 강남구 역삼동 123',
    latitude: 37.5022345,
    longitude: 127.0408765,
    menuTypes: ['분식'],
  },

  /** Place with all optional fields */
  FULL_PLACE: {
    name: '전체 정보 식당',
    address: '서울특별시 강남구 선릉로 789',
    latitude: 37.5032345,
    longitude: 127.0418765,
    menuTypes: ['양식', '이탈리안', '파스타'],
    phoneNumber: '02-9876-5432',
    category: '양식',
    description: '모든 정보가 포함된 테스트 식당입니다.',
    openingHours: '월-금 11:00-23:00, 토-일 12:00-22:00',
    photos: [
      'https://example.com/full1.jpg',
      'https://example.com/full2.jpg',
      'https://example.com/full3.jpg',
    ],
  },

  /** Place for update testing */
  UPDATE_PLACE: {
    name: '수정 테스트 식당',
    address: '서울특별시 강남구 봉은사로 100',
    latitude: 37.5042345,
    longitude: 127.0428765,
    menuTypes: ['일식'],
  },
} as const;

/**
 * Error codes expected in tests
 */
export const USER_PLACE_ERROR_CODES = {
  NOT_FOUND: 'USER_PLACE_NOT_FOUND',
  DAILY_LIMIT_EXCEEDED: 'USER_PLACE_DAILY_LIMIT_EXCEEDED',
  DUPLICATE_REGISTRATION: 'USER_PLACE_DUPLICATE_REGISTRATION',
  NOT_EDITABLE: 'USER_PLACE_NOT_EDITABLE',
  NOT_DELETABLE: 'USER_PLACE_NOT_DELETABLE',
  OPTIMISTIC_LOCK_FAILED: 'USER_PLACE_OPTIMISTIC_LOCK_FAILED',
  INVALID_COORDINATES: 'USER_PLACE_INVALID_COORDINATES',
  UNAUTHORIZED: 'USER_PLACE_UNAUTHORIZED',
} as const;

/**
 * Success message codes expected in tests
 */
export const USER_PLACE_MESSAGE_CODES = {
  CREATED: 'USER_PLACE_CREATED',
  UPDATED: 'USER_PLACE_UPDATED',
  DELETED: 'USER_PLACE_DELETED',
  APPROVED: 'USER_PLACE_APPROVED',
  REJECTED: 'USER_PLACE_REJECTED',
} as const;

/**
 * Business constants (mirrored from business.constants.ts)
 */
export const USER_PLACE_LIMITS = {
  /** Daily registration limit (UTC 0:00 based) */
  DAILY_REGISTRATION_LIMIT: 5,
  /** Nearby search radius in meters */
  NEARBY_SEARCH_RADIUS_METERS: 100,
  /** Menu types constraints */
  MENU_TYPES_MIN: 1,
  MENU_TYPES_MAX: 10,
  /** Photos constraint */
  PHOTOS_MAX: 5,
  /** Rate limits */
  RATE_LIMITS: {
    CREATE_PER_MINUTE: 5,
    UPDATE_DELETE_PER_MINUTE: 10,
    READ_PER_MINUTE: 100,
  },
} as const;

/**
 * Invalid test data for validation tests
 */
export const INVALID_USER_PLACE_DATA = {
  /** Invalid coordinates (out of range) */
  INVALID_COORDINATES: {
    name: '잘못된 좌표 식당',
    address: '서울특별시 강남구 테헤란로 123',
    latitude: 999, // Invalid
    longitude: 999, // Invalid
    menuTypes: ['한식'],
  },

  /** Empty menu types */
  EMPTY_MENU_TYPES: {
    name: '메뉴 없는 식당',
    address: '서울특별시 강남구 테헤란로 123',
    latitude: 37.5012345,
    longitude: 127.0398765,
    menuTypes: [], // Invalid - must have at least 1
  },

  /** Too many menu types */
  TOO_MANY_MENU_TYPES: {
    name: '메뉴 많은 식당',
    address: '서울특별시 강남구 테헤란로 123',
    latitude: 37.5012345,
    longitude: 127.0398765,
    menuTypes: [
      '한식',
      '중식',
      '일식',
      '양식',
      '분식',
      '카페',
      '베이커리',
      '디저트',
      '술집',
      '기타',
      '초과', // 11th item - exceeds limit
    ],
  },

  /** Too many photos */
  TOO_MANY_PHOTOS: {
    name: '사진 많은 식당',
    address: '서울특별시 강남구 테헤란로 123',
    latitude: 37.5012345,
    longitude: 127.0398765,
    menuTypes: ['한식'],
    photos: [
      'https://example.com/1.jpg',
      'https://example.com/2.jpg',
      'https://example.com/3.jpg',
      'https://example.com/4.jpg',
      'https://example.com/5.jpg',
      'https://example.com/6.jpg', // 6th photo - exceeds limit
    ],
  },

  /** Missing required fields */
  MISSING_FIELDS: {
    // Missing name, address, latitude, longitude, menuTypes
  },
} as const;
