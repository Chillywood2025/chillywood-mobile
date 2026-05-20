import { mkdir, appendFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export type AuditEventType =
  | "received_alert"
  | "planned_action"
  | "dry_run"
  | "approval_requested"
  | "approved"
  | "create_pr_only"
  | "denied"
  | "executed"
  | "blocked_by_safety"
  | "failed"
  | "email_queued"
  | "email_sent"
  | "email_failed"
  | "email_skipped_duplicate"
  | "email_skipped_disabled";

export type AuditEvent = {
  eventType: AuditEventType;
  jobId?: string;
  alertname?: string;
  actionType?: string;
  dryRun?: boolean;
  approvedBy?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export class AuditLog {
  constructor(private readonly filePath: string) {}

  async write(event: AuditEvent): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });

    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...event
    });

    await appendFile(this.filePath, `${line}\n`, "utf8");
  }

  async readText(): Promise<string> {
    try {
      return await readFile(this.filePath, "utf8");
    } catch {
      return "";
    }
  }
}
