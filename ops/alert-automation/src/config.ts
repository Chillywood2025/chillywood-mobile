export type OpsConfig = {
  port: number;
  dryRun: boolean;
  webhookSecret?: string;
  approvalToken?: string;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OpsConfig {
  return {
    port: readNumber(env.PORT, 8080),
    dryRun: readBool(env.DRY_RUN, true),
    webhookSecret: readOptional(env.OPS_WEBHOOK_SECRET),
    approvalToken: readOptional(env.OPS_APPROVAL_TOKEN),
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
    turnConfigPath: readOptional(env.TURN_CONFIG_PATH)
  };
}
