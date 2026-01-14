export interface MenuRecommendationSettings {
  maxRecommendationsPerDay: number;
  defaultCuisineTypes: string[];
  aiModelVersion: string;
}

export interface SecuritySettings {
  sessionTimeoutMinutes: number;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
}

export interface DataRetentionSettings {
  userDataRetentionDays: number;
  auditLogRetentionDays: number;
  deletedAccountRetentionDays: number;
}

export class SystemSettingsDto {
  menuRecommendation: MenuRecommendationSettings;
  security: SecuritySettings;
  dataRetention: DataRetentionSettings;
}
