// 카카오 프로필 DTO (스프링 KakaoProfileDto 대응)
export class KakaoProfileDto {
  id: number;
  kakao_account: {
    email?: string;
    // 필요하면 필드 추가
  };
  properties: {
    nickname?: string;
    profile_image?: string;
    thumbnail_image?: string;
  };
}
