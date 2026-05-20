import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AuditLog } from "./audit.js";
import { createPrOnlyForPlan, executeAction, planAction } from "./actions.js";
import { loadConfig, type OpsConfig } from "./config.js";
import { notifyActionableJob } from "./email.js";
import {
  createIdempotencyKey,
  getAlertName,
  JobStore,
  type JobStatus,
  type AlertmanagerAlert,
  type OpsJob
} from "./jobs.js";
import { sanitizeJob } from "./sanitize.js";
import { mirrorLiveOpsJob } from "./supabaseOps.js";

type RawBodyRequest = Request & {
  rawBody?: Buffer;
};

const alertSchema = z.object({
  status: z.string().optional(),
  labels: z.record(z.string(), z.string()),
  annotations: z.record(z.string(), z.string()).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  fingerprint: z.string().optional(),
  generatorURL: z.string().optional()
});

const alertmanagerPayloadSchema = z.object({
  receiver: z.string().optional(),
  status: z.string().optional(),
  alerts: z.array(alertSchema).min(1),
  groupLabels: z.record(z.string(), z.string()).optional(),
  commonLabels: z.record(z.string(), z.string()).optional(),
  commonAnnotations: z.record(z.string(), z.string()).optional(),
  externalURL: z.string().optional(),
  version: z.string().optional(),
  groupKey: z.string().optional(),
  truncatedAlerts: z.number().optional()
});

function safeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/secret|token|key/gi, "[redacted-field]");
  }

  return "unknown_error";
}

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function verifyWebhookSignature(req: RawBodyRequest, config: OpsConfig): boolean {
  if (!config.webhookSecret) {
    return true;
  }

  const signature = req.get("x-ops-signature") ?? "";
  const match = signature.match(/^sha256=([a-f0-9]{64})$/i);
  if (!match || !req.rawBody) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", config.webhookSecret)
    .update(req.rawBody)
    .digest("hex");

  return timingSafeEqualString(expected, match[1]);
}

function verifyApprovalToken(req: Request, config: OpsConfig): { ok: true } | { ok: false; code: number; error: string } {
  if (!config.approvalToken) {
    return { ok: false, code: 403, error: "approval_token_not_configured" };
  }

  const provided = req.get("x-ops-approval-token");
  if (!provided || provided !== config.approvalToken) {
    return { ok: false, code: 401, error: "approval_token_required" };
  }

  return { ok: true };
}

function verifyAdminReadToken(req: Request, config: OpsConfig): { ok: true } | { ok: false; code: number; error: string } {
  if (!config.adminReadToken) {
    return { ok: true };
  }

  const provided = req.get("x-ops-admin-token");
  if (!provided || provided !== config.adminReadToken) {
    return { ok: false, code: 401, error: "admin_read_token_required" };
  }

  return { ok: true };
}

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

function serializeJob(job: OpsJob & { duplicate?: boolean }) {
  return sanitizeJob(job);
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function queryString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}

function queryLimit(value: unknown): number {
  const raw = queryString(value);
  const parsed = raw ? Number.parseInt(raw, 10) : 25;
  if (!Number.isFinite(parsed)) {
    return 25;
  }

  return Math.max(1, Math.min(parsed, 100));
}

const jobStatuses: readonly JobStatus[] = [
  "queued",
  "dry_run_completed",
  "waiting_approval",
  "approved",
  "denied",
  "executed",
  "failed"
];

function queryStatus(value: unknown): JobStatus | undefined {
  const raw = queryString(value);
  return raw && jobStatuses.includes(raw as JobStatus) ? (raw as JobStatus) : undefined;
}

async function handleIncomingAlert(
  alert: AlertmanagerAlert,
  store: JobStore,
  audit: AuditLog,
  config: OpsConfig
): Promise<OpsJob & { duplicate?: boolean }> {
  const idempotencyKey = createIdempotencyKey(alert);
  const existing = await store.getByIdempotencyKey(idempotencyKey);
  if (existing) {
    if (existing.plan.valid && existing.plan.requiresApproval) {
      await audit.write({
        eventType: "email_skipped_duplicate",
        jobId: existing.id,
        alertname: getAlertName(existing.alert),
        actionType: existing.plan.actionType,
        dryRun: config.dryRun,
        reason: "idempotent_alert"
      });
    }

    return { ...existing, duplicate: true };
  }

  const plan = planAction(alert, config);
  const job = await store.create(alert, plan);

  await audit.write({
    eventType: "received_alert",
    jobId: job.id,
    alertname: getAlertName(alert),
    actionType: plan.actionType,
    dryRun: config.dryRun
  });
  await audit.write({
    eventType: "planned_action",
    jobId: job.id,
    alertname: getAlertName(alert),
    actionType: plan.actionType,
    dryRun: config.dryRun,
    reason: plan.summary
  });

  if (!plan.valid) {
    await audit.write({
      eventType: "blocked_by_safety",
      jobId: job.id,
      alertname: getAlertName(alert),
      actionType: plan.actionType,
      dryRun: config.dryRun,
      reason: plan.blockedReason
    });

    const failed = await store.update(job.id, {
      status: "failed",
      failureReason: plan.blockedReason ?? "invalid_action_plan"
    });
    await mirrorLiveOpsJob(failed, config, "fail");
    await notifyActionableJob(failed, config, audit);
    return failed;
  }

  await audit.write({
    eventType: "dry_run",
    jobId: job.id,
    alertname: getAlertName(alert),
    actionType: plan.actionType,
    dryRun: true,
    metadata: {
      summary: plan.summary,
      target: plan.target ?? {},
      plannedCommands: plan.plannedCommands ?? []
    }
  });

  if (plan.requiresApproval) {
    const approvalExpiresAt = new Date(Date.now() + config.approvalSeconds * 1000).toISOString();
    await audit.write({
      eventType: "approval_requested",
      jobId: job.id,
      alertname: getAlertName(alert),
      actionType: plan.actionType,
      dryRun: config.dryRun,
      reason: `approval_expires_at:${approvalExpiresAt}`
    });

    const waiting = await store.update(job.id, {
      status: "waiting_approval",
      approvalExpiresAt,
      dryRunResult: {
        summary: plan.summary,
        target: plan.target ?? {},
        plannedCommands: plan.plannedCommands ?? []
      }
    });
    await mirrorLiveOpsJob(waiting, config, "detect");
    await notifyActionableJob(waiting, config, audit);
    return waiting;
  }

  const completed = await store.update(job.id, {
    status: "dry_run_completed",
    dryRunResult: {
      summary: plan.summary,
      target: plan.target ?? {}
    }
  });
  await mirrorLiveOpsJob(completed, config, "dry_run");
  await notifyActionableJob(completed, config, audit);
  return completed;
}

export function createApp(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env);
  const store = new JobStore(config.jobStorePath);
  const audit = new AuditLog(config.auditLogPath);
  const app = express();

  app.use(
    express.json({
      limit: "256kb",
      verify: (req, _res, buf) => {
        (req as RawBodyRequest).rawBody = Buffer.from(buf);
      }
    })
  );

  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      dryRun: config.dryRun,
      allowLiveActions: config.allowLiveActions,
      allowNetShaping: config.allowNetShaping,
      allowGithubActions: config.allowGithubActions,
      allowInfraActions: config.allowInfraActions,
      allowLiveOpsRegistryActions: config.allowLiveOpsRegistryActions
    });
  });

  app.get(
    "/jobs",
    asyncRoute(async (req, res) => {
      const token = verifyAdminReadToken(req, config);
      if (!token.ok) {
        res.status(token.code).json({ error: token.error });
        return;
      }

      const status = queryStatus(req.query.status);
      const limit = queryLimit(req.query.limit);
      const allJobs = await store.list();
      const jobs = allJobs
        .filter((job) => !status || job.status === status)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, limit);

      res.json({
        jobs: jobs.map(serializeJob),
        count: jobs.length,
        filters: {
          status: status ?? null,
          limit
        }
      });
    })
  );

  app.post(
    "/webhook/alert",
    asyncRoute(async (req: RawBodyRequest, res) => {
      if (!verifyWebhookSignature(req, config)) {
        res.status(401).json({ error: "invalid_webhook_signature" });
        return;
      }

      const parsed = alertmanagerPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_alertmanager_payload" });
        return;
      }

      const jobs = [];
      for (const alert of parsed.data.alerts) {
        jobs.push(await handleIncomingAlert(alert, store, audit, config));
      }

      res.status(202).json({
        accepted: true,
        jobs: jobs.map(serializeJob)
      });
    })
  );

  app.get(
    "/jobs/:id",
    asyncRoute(async (req, res) => {
      const token = verifyAdminReadToken(req, config);
      if (!token.ok) {
        res.status(token.code).json({ error: token.error });
        return;
      }

      const job = await store.getById(routeParam(req.params.id));
      if (!job) {
        res.status(404).json({ error: "job_not_found" });
        return;
      }

      res.json({ job: serializeJob(job) });
    })
  );

  app.post(
    "/jobs/:id/approve",
    asyncRoute(async (req, res) => {
      const token = verifyApprovalToken(req, config);
      if (!token.ok) {
        res.status(token.code).json({ error: token.error });
        return;
      }

      const job = await store.getById(routeParam(req.params.id));
      if (!job) {
        res.status(404).json({ error: "job_not_found" });
        return;
      }

      if (job.status === "executed") {
        res.status(409).json({ error: "job_already_executed", job: serializeJob(job) });
        return;
      }

      if (job.status === "denied") {
        res.status(409).json({ error: "job_already_denied", job: serializeJob(job) });
        return;
      }

      if (job.approvalExpiresAt && Date.now() > Date.parse(job.approvalExpiresAt)) {
        const expired = await store.update(job.id, {
          status: "failed",
          failureReason: "approval_expired"
        });
        await audit.write({
          eventType: "failed",
          jobId: job.id,
          alertname: getAlertName(job.alert),
          actionType: job.plan.actionType,
          dryRun: config.dryRun,
          reason: "approval_expired"
        });
        res.status(409).json({ error: "approval_expired", job: serializeJob(expired) });
        return;
      }

      const approvedBy = req.get("x-ops-approved-by") ?? "operator";
      const approved = await store.update(job.id, {
        status: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy
      });
      await mirrorLiveOpsJob(approved, config, "approve", {
        email: approvedBy,
        role: req.body?.actorRole
      });

      await audit.write({
        eventType: "approved",
        jobId: approved.id,
        alertname: getAlertName(approved.alert),
        actionType: approved.plan.actionType,
        dryRun: config.dryRun,
        approvedBy
      });

      try {
        const result = await executeAction(approved.plan, config);
        const status = result.dryRun ? "dry_run_completed" : "executed";
        const done = await store.update(approved.id, {
          status,
          executedAt: status === "executed" ? new Date().toISOString() : undefined,
          executionResult: result
        });
        await mirrorLiveOpsJob(done, config, status === "executed" ? "execute" : "dry_run", {
          email: approvedBy,
          role: req.body?.actorRole
        });

        await audit.write({
          eventType: status === "executed" ? "executed" : "dry_run",
          jobId: done.id,
          alertname: getAlertName(done.alert),
          actionType: done.plan.actionType,
          dryRun: Boolean(result.dryRun),
          approvedBy
        });

        res.json({ job: serializeJob(done) });
      } catch (error) {
        const reason = safeError(error);
        const failed = await store.update(approved.id, {
          status: "failed",
          failureReason: reason
        });
        await mirrorLiveOpsJob(failed, config, "fail", {
          email: approvedBy,
          role: req.body?.actorRole
        });
        await audit.write({
          eventType: reason.includes("blocked_by_safety") ? "blocked_by_safety" : "failed",
          jobId: failed.id,
          alertname: getAlertName(failed.alert),
          actionType: failed.plan.actionType,
          dryRun: config.dryRun,
          approvedBy,
          reason
        });
        res.status(409).json({ error: reason, job: serializeJob(failed) });
      }
    })
  );

  app.post(
    "/jobs/:id/create-pr-only",
    asyncRoute(async (req, res) => {
      const token = verifyApprovalToken(req, config);
      if (!token.ok) {
        res.status(token.code).json({ error: token.error });
        return;
      }

      const job = await store.getById(routeParam(req.params.id));
      if (!job) {
        res.status(404).json({ error: "job_not_found" });
        return;
      }

      if (!job.plan.liveOpsIncident) {
        res.status(409).json({ error: "not_a_live_ops_job", job: serializeJob(job) });
        return;
      }

      if (job.status === "denied") {
        res.status(409).json({ error: "job_already_denied", job: serializeJob(job) });
        return;
      }

      const approvedBy = req.get("x-ops-approved-by") ?? "operator";
      try {
        const result = await createPrOnlyForPlan(job.plan, config);
        const updated = await store.update(job.id, {
          executionResult: {
            ...(job.executionResult ?? {}),
            createPrOnly: result
          }
        });
        await audit.write({
          eventType: "create_pr_only",
          jobId: updated.id,
          alertname: getAlertName(updated.alert),
          actionType: "create_github_pr",
          dryRun: Boolean(result.dryRun),
          approvedBy
        });
        await mirrorLiveOpsJob(updated, config, "create_pr_only", {
          email: approvedBy,
          role: req.body?.actorRole
        });
        res.json({ job: serializeJob(updated), result });
      } catch (error) {
        const reason = safeError(error);
        const failed = await store.update(job.id, {
          status: "failed",
          failureReason: reason
        });
        await audit.write({
          eventType: reason.includes("blocked_by_safety") ? "blocked_by_safety" : "failed",
          jobId: failed.id,
          alertname: getAlertName(failed.alert),
          actionType: "create_github_pr",
          dryRun: config.dryRun,
          approvedBy,
          reason
        });
        await mirrorLiveOpsJob(failed, config, "fail", {
          email: approvedBy,
          role: req.body?.actorRole
        });
        res.status(409).json({ error: reason, job: serializeJob(failed) });
      }
    })
  );

  app.post(
    "/jobs/:id/deny",
    asyncRoute(async (req, res) => {
      const token = verifyApprovalToken(req, config);
      if (!token.ok) {
        res.status(token.code).json({ error: token.error });
        return;
      }

      const job = await store.getById(routeParam(req.params.id));
      if (!job) {
        res.status(404).json({ error: "job_not_found" });
        return;
      }

      const deniedBy = req.get("x-ops-approved-by") ?? "operator";
      const denied = await store.update(job.id, {
        status: "denied",
        deniedAt: new Date().toISOString(),
        deniedBy
      });
      await mirrorLiveOpsJob(denied, config, "reject", {
        email: deniedBy,
        role: req.body?.actorRole
      });
      await audit.write({
        eventType: "denied",
        jobId: denied.id,
        alertname: getAlertName(denied.alert),
        actionType: denied.plan.actionType,
        dryRun: config.dryRun,
        approvedBy: deniedBy
      });

      res.json({ job: serializeJob(denied) });
    })
  );

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: safeError(error) });
  });

  return { app, config, store, audit };
}

export function startServer(env: NodeJS.ProcessEnv = process.env) {
  const { app, config } = createApp(env);
  const server = app.listen(config.port, () => {
    console.log(
      JSON.stringify({
        event: "ops_alert_automation_started",
        port: config.port,
        dryRun: config.dryRun,
        allowLiveActions: config.allowLiveActions,
        allowNetShaping: config.allowNetShaping
      })
    );
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
