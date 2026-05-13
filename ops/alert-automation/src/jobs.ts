import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ActionPlan } from "./actions.js";

export type AlertStatus = "firing" | "resolved" | string;

export type AlertmanagerAlert = {
  status?: AlertStatus;
  labels: Record<string, string>;
  annotations?: Record<string, string>;
  startsAt?: string;
  endsAt?: string;
  fingerprint?: string;
  generatorURL?: string;
};

export type JobStatus =
  | "queued"
  | "dry_run_completed"
  | "waiting_approval"
  | "approved"
  | "denied"
  | "executed"
  | "failed";

export type OpsJob = {
  id: string;
  idempotencyKey: string;
  status: JobStatus;
  alert: AlertmanagerAlert;
  plan: ActionPlan;
  createdAt: string;
  updatedAt: string;
  approvalExpiresAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  deniedAt?: string;
  deniedBy?: string;
  executedAt?: string;
  failureReason?: string;
  dryRunResult?: Record<string, unknown>;
  executionResult?: Record<string, unknown>;
};

type StoreFile = {
  jobs: OpsJob[];
};

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function getAlertName(alert: AlertmanagerAlert): string {
  return alert.labels.alertname || "unknown";
}

export function createIdempotencyKey(alert: AlertmanagerAlert): string {
  const fingerprint = alert.fingerprint?.trim();
  if (fingerprint) {
    return `fingerprint:${fingerprint}`;
  }

  const material = stableStringify({
    alertname: getAlertName(alert),
    labels: alert.labels,
    startsAt: alert.startsAt ?? ""
  });

  return `hash:${createHash("sha256").update(material).digest("hex")}`;
}

export class JobStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<OpsJob[]> {
    return (await this.read()).jobs;
  }

  async getById(id: string): Promise<OpsJob | undefined> {
    const store = await this.read();
    return store.jobs.find((job) => job.id === id);
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<OpsJob | undefined> {
    const store = await this.read();
    return store.jobs.find((job) => job.idempotencyKey === idempotencyKey);
  }

  async create(alert: AlertmanagerAlert, plan: ActionPlan): Promise<OpsJob> {
    const store = await this.read();
    const now = new Date().toISOString();
    const job: OpsJob = {
      id: randomUUID(),
      idempotencyKey: createIdempotencyKey(alert),
      status: "queued",
      alert,
      plan,
      createdAt: now,
      updatedAt: now
    };

    store.jobs.push(job);
    await this.write(store);
    return job;
  }

  async update(id: string, patch: Partial<Omit<OpsJob, "id">>): Promise<OpsJob> {
    const store = await this.read();
    const index = store.jobs.findIndex((job) => job.id === id);
    if (index === -1) {
      throw new Error("job_not_found");
    }

    const updated: OpsJob = {
      ...store.jobs[index],
      ...patch,
      updatedAt: new Date().toISOString()
    };

    store.jobs[index] = updated;
    await this.write(store);
    return updated;
  }

  private async read(): Promise<StoreFile> {
    try {
      const text = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(text) as StoreFile;
      return { jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [] };
    } catch {
      return { jobs: [] };
    }
  }

  private async write(store: StoreFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
    await rename(tmp, this.filePath);
  }
}
