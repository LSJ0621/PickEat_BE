export interface WebhookThresholds {
  newBugReportEnabled: boolean;
  criticalBugAlertEnabled: boolean;
  dailySummaryEnabled: boolean;
}

export class WebhookSettingsDto {
  enabled: boolean;
  webhookUrl: string; // Masked URL for display
  thresholds: WebhookThresholds;
}
