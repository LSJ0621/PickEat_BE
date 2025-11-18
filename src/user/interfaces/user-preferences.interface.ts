export interface UserPreferences {
  likes: string[]; // 좋아하는 것
  dislikes: string[]; // 싫어하는 것
}

export const defaultUserPreferences = (): UserPreferences => ({
  likes: [],
  dislikes: [],
});
