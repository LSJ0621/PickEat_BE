/**
 * Kakao Local 주소 검색 응답
 */
export interface KakaoLocalAddressResponse {
  meta: KakaoLocalMeta;
  documents: KakaoLocalAddressDocument[];
}

/**
 * Kakao Local 메타 정보
 */
export interface KakaoLocalMeta {
  total_count: number;
  pageable_count: number;
  is_end: boolean;
}

/**
 * Kakao Local 주소 문서
 */
export interface KakaoLocalAddressDocument {
  address_name: string;
  address_type: string;
  x: string;
  y: string;
  address?: {
    address_name: string;
    region_1depth_name: string;
    region_2depth_name: string;
    region_3depth_name: string;
    region_3depth_h_name?: string;
    h_code?: string;
    b_code?: string;
    mountain_yn?: string;
    main_address_no?: string;
    sub_address_no?: string;
  };
  road_address?: {
    address_name: string;
    region_1depth_name: string;
    region_2depth_name: string;
    region_3depth_name: string;
    road_name: string;
    underground_yn?: string;
    main_building_no?: string;
    sub_building_no?: string;
    building_name?: string;
    zone_no: string;
  };
}

/**
 * Kakao OAuth 토큰 응답
 */
export interface KakaoOAuthTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in: number;
  refresh_token_expires_in?: number;
  scope?: string;
}

/**
 * Kakao 사용자 프로필 응답
 */
export interface KakaoUserProfile {
  id: number;
  connected_at?: string;
  properties?: {
    nickname?: string;
    profile_image?: string;
    thumbnail_image?: string;
  };
  kakao_account: {
    profile_nickname_needs_agreement?: boolean;
    profile_image_needs_agreement?: boolean;
    profile?: {
      nickname?: string;
      thumbnail_image_url?: string;
      profile_image_url?: string;
    };
    email_needs_agreement?: boolean;
    is_email_valid?: boolean;
    is_email_verified?: boolean;
    email?: string;
  };
}

