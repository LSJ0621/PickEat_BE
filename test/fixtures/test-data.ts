import { TEST_COORDINATES, TEST_IDS } from '../constants/test.constants';

/**
 * 테스트용 주소 데이터
 */
export const TEST_ADDRESSES = {
  HOME: {
    roadAddress: TEST_COORDINATES.GANGNAM.ROAD_ADDRESS,
    postalCode: TEST_COORDINATES.GANGNAM.POSTAL_CODE,
    latitude: TEST_COORDINATES.GANGNAM.LATITUDE_NUM,
    longitude: TEST_COORDINATES.GANGNAM.LONGITUDE_NUM,
    alias: '집',
    isDefault: true,
    isSearchAddress: false,
  },
  OFFICE: {
    roadAddress: TEST_COORDINATES.GANGNAM_ALT.ROAD_ADDRESS,
    postalCode: TEST_COORDINATES.GANGNAM_ALT.POSTAL_CODE,
    latitude: TEST_COORDINATES.GANGNAM_ALT.LATITUDE_NUM,
    longitude: TEST_COORDINATES.GANGNAM_ALT.LONGITUDE_NUM,
    alias: '회사',
    isDefault: false,
    isSearchAddress: true,
  },
  OTHER: {
    roadAddress: TEST_COORDINATES.OTHER.ROAD_ADDRESS,
    postalCode: TEST_COORDINATES.OTHER.POSTAL_CODE,
    latitude: TEST_COORDINATES.OTHER.LATITUDE_NUM,
    longitude: TEST_COORDINATES.OTHER.LONGITUDE_NUM,
    alias: '기타',
    isDefault: false,
    isSearchAddress: false,
  },
} as const;

/**
 * 테스트용 메뉴 데이터
 */
export const TEST_MENUS = {
  KOREAN: ['김치찌개', '된장찌개', '순두부찌개', '비빔밥', '불고기'],
  CHINESE: ['짜장면', '짬뽕', '탕수육', '마라탕', '양꼬치'],
  JAPANESE: ['라멘', '초밥', '우동', '돈카츠', '카레'],
  WESTERN: ['파스타', '피자', '스테이크', '햄버거', '샐러드'],
} as const;

/**
 * 테스트용 사용자 데이터
 */
export const TEST_USERS = {
  BASIC: {
    email: 'test@example.com',
    password: 'Password123!',
    name: 'Test User',
  },
  ADMIN: {
    email: 'admin@example.com',
    password: 'AdminPassword123!',
    name: 'Admin User',
    role: 'ADMIN',
  },
  SOCIAL_KAKAO: {
    email: 'kakaouser@kakao.com',
    socialId: TEST_IDS.SOCIAL_ID_KAKAO,
    socialType: 'KAKAO',
    name: 'Kakao User',
  },
  SOCIAL_GOOGLE: {
    email: 'googleuser@gmail.com',
    socialId: TEST_IDS.SOCIAL_ID_GOOGLE,
    socialType: 'GOOGLE',
    name: 'Google User',
  },
} as const;

/**
 * 테스트용 사용자 선호도 데이터
 */
export const TEST_PREFERENCES = {
  KOREAN_LOVER: {
    likes: ['한식', '중식'],
    dislikes: ['양식'],
  },
  ADVENTUROUS: {
    likes: ['한식', '일식', '중식', '양식'],
    dislikes: [],
  },
  PICKY: {
    likes: ['한식'],
    dislikes: ['양식', '패스트푸드', '매운음식'],
  },
  EMPTY: {
    likes: [],
    dislikes: [],
  },
} as const;

/**
 * 테스트용 버그 리포트 데이터
 */
export const TEST_BUG_REPORTS = {
  SIMPLE: {
    title: '메뉴 추천이 작동하지 않습니다',
    description: '메뉴 추천 버튼을 눌러도 아무 반응이 없습니다.',
    category: 'FUNCTIONALITY',
  },
  WITH_REPRODUCTION: {
    title: '로그인 후 세션이 유지되지 않습니다',
    description: '로그인 성공 후 페이지를 새로고침하면 로그아웃됩니다.',
    category: 'AUTHENTICATION',
    reproductionSteps: '1. 로그인\n2. 페이지 새로고침\n3. 로그아웃 상태 확인',
  },
} as const;
