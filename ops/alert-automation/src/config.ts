export type OpsConfig = {
  port: number;
  dryRun: boolean;
  webhookSecret?: string;
  approvalToken?: string;
  adminReadToken?: string;
  approvalSeconds: number;
  livekitApiUrl?: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  allowLiveActions: boolean;
  allowNetShaping: boolean;
  jobStorePath: string;
  auditLogPath: string;
  netThrottleInterface?: string;
  netThrottleRate?: string;
  turnConfigPath?: string;
  emailEnabled: boolean;
  emailProvider: string;
  emailFrom?: string;
  adminEmails: string[];
  smtpHost?: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure: boolean;
  adminPanelBaseUrl?: string;
  emailTestMode: boolean;
};

function readBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function readNumber(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readCsv(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OpsConfig {
  return {
    port: readNumber(env.PORT, 8080),
    dryRun: readBool(env.DRY_RUN, true),
    webhookSecret: readOptional(env.OPS_WEBHOOK_SECRET),
    approvalToken: readOptional(env.OPS_APPROVAL_TOKEN),
    adminReadToken: readOptional(env.OPS_ADMIN_READ_TOKEN),
    approvalSeconds: readNumber(env.APPROVAL_SECONDS, 900),
    livekitApiUrl: readOptional(env.LK_API_URL),
    livekitApiKey: readOptional(env.LK_API_KEY),
    livekitApiSecret: readOptional(env.LK_API_SECRET),
    allowLiveActions: readBool(env.ALLOW_LIVE_ACTIONS, false),
    allowNetShaping: readBool(env.ALLOW_NET_SHAPING, false),
    jobStorePath: readOptional(env.JOB_STORE_PATH) ?? "./data/jobs.json",
    auditLogPath: readOptional(env.AUDIT_LOG_PATH) ?? "./data/audit.log",
    netThrottleInterface: readOptional(env.NET_THROTTLE_INTERFACE),
    netThrottleRate: readOptional(env.NET_THROTTLE_RATE),
    turnConfigPath: readOptional(env.TURN_CONFIG_PATH),
    emailEnabled: readBool(env.OPS_EMAIL_ENABLED, false),
    emailProvider: readOptional(env.OPS_EMAIL_PROVIDER) ?? "smtp",
    emailFrom: readOptional(env.OPS_EMAIL_FROM),
    adminEmails: readCsv(env.OPS_ADMIN_EMAILS),
    smtpHost: readOptional(env.OPS_SMTP_HOST),
    smtpPort: readNumber(env.OPS_SMTP_PORT, 465),
    smtpUser: readOptional(env.OPS_SMTP_USER),
    smtpPass: readOptional(env.OPS_SMTP_PASS),
    smtpSecure: readBool(env.OPS_SMTP_SECURE, true),
    adminPanelBaseUrl: readOptional(env.OPS_ADMIN_PANEL_BASE_URL),
    emailTestMode: readBool(env.OPS_EMAIL_TEST_MODE, false)
  };
}
