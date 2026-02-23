import { UserPreferences } from '../../user/interfaces/user-preferences.interface';
import { User } from '../../user/entities/user.entity';

/**
 * 로그인/인증 결과 인터페이스
 */
export interface AuthResult {
  token: string;
  refreshToken: string;
  email: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  name: string | null;
  preferences: UserPreferences | null;
  birthDate: string | null;
  gender: 'male' | 'female' | 'other' | null;
  preferredLanguage: 'ko' | 'en';
}

/**
 * 사용자 프로필 인터페이스
 */
export interface AuthProfile {
  email: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  birthDate: string | null;
  gender: 'male' | 'female' | 'other' | null;
  preferredLanguage: 'ko' | 'en';
}

/**
 * 인증 엔티티 타입
 */
export type AuthEntity = User;
