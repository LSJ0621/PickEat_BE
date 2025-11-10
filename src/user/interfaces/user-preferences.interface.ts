export interface UserPreferences {
  tags: string[];
}

export const defaultUserPreferences = (): UserPreferences => ({
  tags: [],
});
