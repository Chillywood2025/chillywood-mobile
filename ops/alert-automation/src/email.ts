import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import type { AuditLog } from "./audit.js";
import type { OpsConfig } from "./config.js";
import { getAlertName, type OpsJob } from "./jobs.js";
import { redactText, safeEmailLabels, sanitizeActionPlan } from "./sanitize.js";

type OpsJobEmail = {
  subject: string;
  text: string;
};

function isActionable(job: OpsJob): boolean {
  return job.plan.valid && job.plan.requiresApproval;
}

function adminPanelLink(jobId: string, config: OpsConfig): string | undefined {
  if (!config.adminPanelBaseUrl) {
    return undefined;
  }

  const separator = config.adminPanelBaseUrl.includes("?") ? "&" : "?";
  return `${config.adminPanelBaseUrl}${separator}job=${encodeURIComponent(jobId)}`;
}

function createTransport(config: OpsConfig) {
  if (config.emailTestMode) {
    return nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: "unix"
    });
  }

  const options: SMTPTransport.Options = {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure
  };

  if (config.smtpUser || config.smtpPass) {
    options.auth = {
      user: config.smtpUser ?? "",
      pass: config.smtpPass ?? ""
    };
  }

  return nodemailer.createTransport(options);
}

function emailConfigProblem(config: OpsConfig): string | undefined {
  if (config.emailProvider !== "smtp") {
    return "unsupported_email_provider";
  }

  if (!config.emailFrom) {
    return "missing_ops_email_from";
  }

  if (!config.adminEmails.length) {
    return "missing_ops_admin_emails";
  }

  if (!config.emailTestMode && !config.smtpHost) {
    return "missing_ops_smtp_host";
  }

  return undefined;
}

export function buildOpsJobEmail(job: OpsJob, config: OpsConfig): OpsJobEmail {
  const labels = safeEmailLabels(job);
  const plan = sanitizeActionPlan(job.plan);
  const link = adminPanelLink(job.id, config);
  const severity = labels.severity ?? "unspecified";
  const labelLines = Object.entries(labels)
    .filter(([key]) => key !== "alertname")
    .map(([key, value]) => `- ${key}: ${value}`);

  const text = [
    "Chi'llywood ops alert automation created an actionable dry-run job.",
    "",
    `Job: ${job.id}`,
    `Alert: ${getAlertName(job.alert)}`,
    `Severity: ${severity}`,
    `Status: ${job.status}`,
    `Action: ${plan.actionType}`,
    `Summary: ${plan.summary}`,
    `Dry-run default: ${config.dryRun ? "true" : "false"}`,
    `Requires approval: ${plan.requiresApproval ? "yes" : "no"}`,
    `Approval deadline: ${job.approvalExpiresAt ?? "not set"}`,
    "",
    labelLines.length ? "Safe labels:" : "Safe labels: none",
    ...labelLines,
    "",
    link ? `Admin panel: ${link}` : "Admin panel: not configured",
    "",
    "This email is notification-only. It cannot approve, deny, or execute an ops action.",
    "LiveKit actions and network shaping still require backend approval plus the explicit safety flags."
  ].join("\n");

  return {
    subject: `[Chi'llywood Ops] ${getAlertName(job.alert)} needs attention`,
    text: redactText(text)
  };
}

export async function notifyActionableJob(job: OpsJob, config: OpsConfig, audit: AuditLog): Promise<void> {
  if (!isActionable(job)) {
    return;
  }

  if (!config.emailEnabled) {
    await audit.write({
      eventType: "email_skipped_disabled",
      jobId: job.id,
      alertname: getAlertName(job.alert),
      actionType: job.plan.actionType,
      dryRun: config.dryRun,
      reason: "OPS_EMAIL_ENABLED=false"
    });
    return;
  }

  await audit.write({
    eventType: "email_queued",
    jobId: job.id,
    alertname: getAlertName(job.alert),
    actionType: job.plan.actionType,
    dryRun: config.dryRun,
    metadata: { recipientCount: config.adminEmails.length }
  });

  const configProblem = emailConfigProblem(config);
  if (configProblem) {
    await audit.write({
      eventType: "email_failed",
      jobId: job.id,
      alertname: getAlertName(job.alert),
      actionType: job.plan.actionType,
      dryRun: config.dryRun,
      reason: configProblem
    });
    return;
  }

  try {
    const email = buildOpsJobEmail(job, config);
    const transport = createTransport(config);
    const result = await transport.sendMail({
      from: config.emailFrom,
      to: config.adminEmails,
      subject: email.subject,
      text: email.text
    });

    await audit.write({
      eventType: "email_sent",
      jobId: job.id,
      alertname: getAlertName(job.alert),
      actionType: job.plan.actionType,
      dryRun: config.dryRun,
      metadata: {
        recipientCount: config.adminEmails.length,
        messageId: result.messageId ? redactText(result.messageId) : undefined,
        testMode: config.emailTestMode
      }
    });
  } catch (error) {
    await audit.write({
      eventType: "email_failed",
      jobId: job.id,
      alertname: getAlertName(job.alert),
      actionType: job.plan.actionType,
      dryRun: config.dryRun,
      reason: error instanceof Error ? redactText(error.message) : "unknown_email_error"
    });
  }
}
