import { SocialLogin } from '../../user/entities/social-login.entity';
import { User } from '../../user/entities/user.entity';
import { UserPreferences } from '../../user/interfaces/user-preferences.interface';

/**
 * User와 SocialLogin의 공통 인터페이스
 * 중복 메서드를 통합하기 위한 추상화
 */
export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
  preferences: UserPreferences | null;
}

/**
 * 인증된 사용자 타입 (User 또는 SocialLogin)
 */
export type AuthenticatedEntity = User | SocialLogin;

/**
 * User인지 SocialLogin인지 구분
 */
export function isUser(entity: AuthenticatedEntity): entity is User {
  return 'password' in entity;
}

export function isSocialLogin(entity: AuthenticatedEntity): entity is SocialLogin {
  return 'socialId' in entity;
}

/**
 * 엔티티 타입 문자열 반환
 */
export function getEntityType(entity: AuthenticatedEntity): 'user' | 'socialLogin' {
  return isUser(entity) ? 'user' : 'socialLogin';
}

