import { createHash, createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server.js";

let tempDir: string;

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    JOB_STORE_PATH: join(tempDir, "jobs.json"),
    AUDIT_LOG_PATH: join(tempDir, "audit.log"),
    OPS_APPROVAL_TOKEN: "approval-test-token",
    ...overrides
  };
}

function payload(alertname: string, labels: Record<string, string> = {}) {
  return {
    receiver: "test",
    status: "firing",
    alerts: [
      {
        status: "firing",
        labels: { alertname, ...labels },
        startsAt: "2026-05-12T00:00:00Z",
        fingerprint: createHash("sha256")
          .update(JSON.stringify({ alertname, labels }))
          .digest("hex")
      }
    ]
  };
}

async function postAlert(app: ReturnType<typeof createApp>["app"], body: unknown) {
  return await request(app).post("/webhook/alert").send(body).set("Content-Type", "application/json");
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "chillywood-ops-alert-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("ops alert automation", () => {
  it("accepts a valid Alertmanager payload", async () => {
    const { app } = createApp(env());
    const response = await postAlert(app, payload("ServerCpuMemoryPressure"));

    expect(response.status).toBe(202);
    expect(response.body.accepted).toBe(true);
    expect(response.body.jobs[0].status).toBe("dry_run_completed");
  });

  it("rejects invalid payloads", async () => {
    const { app } = createApp(env());
    const response = await postAlert(app, { alerts: [] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_alertmanager_payload");
  });

  it("uses dry-run by default", async () => {
    const { app } = createApp(env({ DRY_RUN: undefined }));
    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body.dryRun).toBe(true);
  });

  it("records unknown alerts as no-op", async () => {
    const { app } = createApp(env());
    const response = await postAlert(app, payload("MysteryAlert"));

    expect(response.status).toBe(202);
    expect(response.body.jobs[0].plan.actionType).toBe("noop");
    expect(response.body.jobs[0].status).toBe("dry_run_completed");
  });

  it("does not delete a room from webhook receipt", async () => {
    const { app } = createApp(env());
    const response = await postAlert(app, payload("RoomZombieStuck", { room: "room-a" }));

    expect(response.status).toBe(202);
    expect(response.body.jobs[0].status).toBe("waiting_approval");
    expect(response.body.jobs[0].executionResult).toBeUndefined();
  });

  it("does not remove a participant from webhook receipt", async () => {
    const { app } = createApp(env());
    const response = await postAlert(
      app,
      payload("PublisherFlood", { room: "room-a", identity: "participant-a" })
    );

    expect(response.status).toBe(202);
    expect(response.body.jobs[0].status).toBe("waiting_approval");
    expect(response.body.jobs[0].executionResult).toBeUndefined();
  });

  it("blocks approved LiveKit actions when ALLOW_LIVE_ACTIONS=false", async () => {
    const { app } = createApp(env({ DRY_RUN: "false", ALLOW_LIVE_ACTIONS: "false" }));
    const created = await postAlert(app, payload("RoomZombieStuck", { room: "room-a" }));
    const jobId = created.body.jobs[0].id;

    const approved = await request(app)
      .post(`/jobs/${jobId}/approve`)
      .set("X-Ops-Approval-Token", "approval-test-token");

    expect(approved.status).toBe(409);
    expect(approved.body.job.status).toBe("failed");
    expect(approved.body.error).toContain("blocked_by_safety");
  });

  it("blocks approved network actions when ALLOW_NET_SHAPING=false", async () => {
    const { app } = createApp(
      env({
        DRY_RUN: "false",
        ALLOW_NET_SHAPING: "false",
        NET_THROTTLE_INTERFACE: "eth0",
        NET_THROTTLE_RATE: "50mbit"
      })
    );
    const created = await postAlert(app, payload("LiveKitHighEgress"));
    const jobId = created.body.jobs[0].id;

    const approved = await request(app)
      .post(`/jobs/${jobId}/approve`)
      .set("X-Ops-Approval-Token", "approval-test-token");

    expect(approved.status).toBe(409);
    expect(approved.body.job.status).toBe("failed");
    expect(approved.body.error).toContain("blocked_by_safety");
  });

  it("deduplicates duplicate alerts", async () => {
    const { app } = createApp(env());
    const body = payload("RoomZombieStuck", { room: "room-a" });
    const first = await postAlert(app, body);
    const second = await postAlert(app, body);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body.jobs[0].id).toBe(first.body.jobs[0].id);
    expect(second.body.jobs[0].duplicate).toBe(true);
  });

  it("requires an approval token", async () => {
    const { app } = createApp(env());
    const created = await postAlert(app, payload("RoomZombieStuck", { room: "room-a" }));
    const jobId = created.body.jobs[0].id;

    const approved = await request(app).post(`/jobs/${jobId}/approve`);

    expect(approved.status).toBe(401);
    expect(approved.body.error).toBe("approval_token_required");
  });

  it("writes audit events", async () => {
    const auditPath = join(tempDir, "audit.log");
    const { app } = createApp(env({ AUDIT_LOG_PATH: auditPath }));
    await postAlert(app, payload("ServerCpuMemoryPressure"));

    const text = await readFile(auditPath, "utf8");
    expect(text).toContain("received_alert");
    expect(text).toContain("planned_action");
    expect(text).toContain("dry_run");
  });

  it("does not log configured secrets", async () => {
    const auditPath = join(tempDir, "audit.log");
    const webhookSecret = "do-not-log-webhook-secret";
    const livekitSecret = "do-not-log-livekit-secret";
    const body = JSON.stringify(payload("RoomZombieStuck", { room: "room-a" }));
    const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");
    const { app } = createApp(
      env({
        AUDIT_LOG_PATH: auditPath,
        OPS_WEBHOOK_SECRET: webhookSecret,
        LK_API_SECRET: livekitSecret
      })
    );

    const response = await request(app)
      .post("/webhook/alert")
      .set("Content-Type", "application/json")
      .set("X-Ops-Signature", `sha256=${signature}`)
      .send(body);

    expect(response.status).toBe(202);
    const auditText = await readFile(auditPath, "utf8");
    expect(auditText).not.toContain(webhookSecret);
    expect(auditText).not.toContain(livekitSecret);
    expect(JSON.stringify(response.body)).not.toContain(webhookSecret);
    expect(JSON.stringify(response.body)).not.toContain(livekitSecret);
  });
});
