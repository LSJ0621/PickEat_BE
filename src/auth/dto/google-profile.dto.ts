// 구글 프로필 DTO
export class GoogleProfileDto {
  sub: string; // openId (구글 사용자 고유 ID)
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

