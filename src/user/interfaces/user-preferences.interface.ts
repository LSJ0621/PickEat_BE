export interface UserPreferences {
  likes: string[]; // 좋아하는 것
  dislikes: string[]; // 싫어하는 것
  analysis?: string; // 취향 분석 텍스트 (200자 이내, 스케줄러가 자동 생성)
}

export const defaultUserPreferences = (): UserPreferences => ({
  likes: [],
  dislikes: [],
  analysis: undefined,
});
