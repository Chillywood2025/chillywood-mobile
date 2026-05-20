import { createHash, createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOpsJobEmail } from "../src/email.js";
import { createApp } from "../src/server.js";

let tempDir: string;

type TestEnv = Record<string, string | undefined>;

function env(overrides: TestEnv = {}): NodeJS.ProcessEnv {
  return {
    JOB_STORE_PATH: join(tempDir, "jobs.json"),
    AUDIT_LOG_PATH: join(tempDir, "audit.log"),
    OPS_APPROVAL_TOKEN: "approval-test-token",
    ...overrides
  } as unknown as NodeJS.ProcessEnv;
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

async function postAlert(app: ReturnType<typeof createApp>["app"], body: object | string) {
  return await request(app).post("/webhook/alert").send(body).set("Content-Type", "application/json");
}

async function readAuditEvents(path: string): Promise<string[]> {
  const text = await readFile(path, "utf8");
  return text.trim().split("\n").filter(Boolean);
}

function emailEnv(overrides: TestEnv = {}): NodeJS.ProcessEnv {
  return env({
    OPS_EMAIL_ENABLED: "true",
    OPS_EMAIL_PROVIDER: "smtp",
    OPS_EMAIL_FROM: "ops@example.com",
    OPS_ADMIN_EMAILS: "admin@example.com",
    OPS_ADMIN_PANEL_BASE_URL: "http://localhost:3000/admin/ops-alerts",
    OPS_EMAIL_TEST_MODE: "true",
    ...overrides
  });
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "chillywood-ops-alert-test-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  it("classifies high join failures with token and signaling errors as a Live Ops issue action", async () => {
    const { app } = createApp(env());
    const response = await postAlert(
      app,
      payload("LiveOpsTokenSignalingJoinFailures", {
        affected_route: "live_watch_party",
        join_failures: "42",
        platform: "mobile",
        signaling_errors: "5",
        token_errors: "7"
      })
    );

    expect(response.status).toBe(202);
    expect(response.body.jobs[0].status).toBe("waiting_approval");
    expect(response.body.jobs[0].plan.actionType).toBe("create_github_issue");
    expect(response.body.jobs[0].plan.liveOpsIncident.likelyCause).toContain("Token");
    expect(response.body.jobs[0].plan.liveOpsIncident.affectedRoute).toBe("Live Watch-Party");
  });

  it("classifies Chi'lly Chat call incidents as separate chat-call purposes", async () => {
    const cases: Array<{
      actionType: string;
      alertname: string;
      cause: string;
      labels: Record<string, string>;
      purpose: string;
    }> = [
      {
        alertname: "ChatCallTokenIssueFailed",
        labels: { affected_purpose: "chat-call", call_id: "call-token", call_mode: "video", join_failures: "3", token_errors: "3" },
        actionType: "create_github_issue",
        cause: "token",
        purpose: "chat-video-call"
      },
      {
        alertname: "ChatCallSignalingFailed",
        labels: { affected_purpose: "chat-call", call_id: "call-signal", join_failures: "2", signaling_errors: "2" },
        actionType: "create_github_issue",
        cause: "signaling",
        purpose: "chat-call"
      },
      {
        alertname: "ChatCallCalleeDidNotJoin",
        labels: { affected_purpose: "chat-call", caller_joined: "true", callee_joined: "false", call_id: "call-callee" },
        actionType: "create_github_issue",
        cause: "join",
        purpose: "chat-call"
      },
      {
        alertname: "ChatCallNoRemoteMediaLowRelay",
        labels: { affected_purpose: "chat-call", both_users_joined: "true", blank_screen_count: "2", call_id: "call-turn", call_mode: "video", low_relay_bytes: "true" },
        actionType: "create_github_issue",
        cause: "TURN",
        purpose: "chat-video-call"
      },
      {
        alertname: "ChatCallBlankScreenNormalRelay",
        labels: { affected_purpose: "chat-call", both_users_joined: "true", blank_screen_count: "2", call_id: "call-render", call_mode: "video", relay_bytes_normal: "true" },
        actionType: "create_github_issue",
        cause: "render",
        purpose: "chat-video-call"
      },
      {
        alertname: "ChatCallCameraPublishFailure",
        labels: { affected_purpose: "chat-call", call_id: "call-camera", call_mode: "video", camera_publish_failed: "true" },
        actionType: "create_github_issue",
        cause: "publish",
        purpose: "chat-video-call"
      },
      {
        alertname: "ChatCallAndroidOnlyFailures",
        labels: { affected_purpose: "chat-call", android_only: "true", call_id: "call-android", platform: "android" },
        actionType: "create_github_issue",
        cause: "Android",
        purpose: "chat-call"
      },
      {
        alertname: "ChatCallCellularOnlyFailures",
        labels: { affected_purpose: "chat-call", call_id: "call-cell", cellular_only: "true" },
        actionType: "create_github_issue",
        cause: "cellular",
        purpose: "chat-call"
      },
      {
        alertname: "ChatCallEndedStillJoinable",
        labels: { affected_purpose: "chat-call", call_id: "call-ended", ended_call_joinable: "true" },
        actionType: "clean_stale_chat_call",
        cause: "lifecycle",
        purpose: "chat-call"
      },
      {
        alertname: "ChatCallCleanupFailed",
        labels: { affected_purpose: "chat-call", call_id: "call-cleanup", call_cleanup_failed: "true" },
        actionType: "clean_stale_chat_call",
        cause: "Cleanup",
        purpose: "chat-call"
      }
    ];

    for (const item of cases) {
      const { app } = createApp(env({ JOB_STORE_PATH: join(tempDir, `${item.alertname}.json`) }));
      const response = await postAlert(app, payload(item.alertname, item.labels));

      expect(response.status).toBe(202);
      expect(response.body.jobs[0].status).toBe("waiting_approval");
      expect(response.body.jobs[0].plan.actionType).toBe(item.actionType);
      expect(response.body.jobs[0].plan.liveOpsIncident.affectedRoute).toBe("Chi'lly Chat");
      expect(response.body.jobs[0].plan.liveOpsIncident.affectedPurpose).toBe(item.purpose);
      expect(response.body.jobs[0].plan.liveOpsIncident.likelyCause).toContain(item.cause);
    }
  });

  it("dry-runs stale Chi'lly Chat call cleanup without mutating chat or call rows", async () => {
    const oldIso = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("admin_live_ops_incidents")) {
        return new Response(JSON.stringify([{ id: "incident-chat-call" }]), { status: 200 });
      }
      if (url.includes("admin_live_ops_action_audit")) {
        return new Response(JSON.stringify({ id: "audit-chat-call" }), { status: 201 });
      }
      if (url.includes("chat_threads?active_communication_room_id")) {
        return new Response(JSON.stringify([{ id: "thread-a", active_communication_room_id: "call-stale", active_call_type: "video", updated_at: oldIso }]), { status: 200 });
      }
      if (url.includes("communication_rooms")) {
        return new Response(JSON.stringify([{ room_id: "call-stale", status: "active", last_activity_at: oldIso, updated_at: oldIso, created_at: oldIso }]), { status: 200 });
      }
      if (url.includes("communication_room_memberships")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { app } = createApp(
      env({
        DRY_RUN: "true",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
        SUPABASE_URL: "https://supabase.example.test"
      })
    );
    const created = await postAlert(
      app,
      payload("ChatCallCleanupFailed", {
        affected_purpose: "chat-call",
        call_cleanup_failed: "true",
        call_id: "call-stale"
      })
    );
    const jobId = created.body.jobs[0].id;

    const approved = await request(app)
      .post(`/jobs/${jobId}/approve`)
      .set("X-Ops-Approval-Token", "approval-test-token");

    expect(approved.status).toBe(200);
    expect(approved.body.job.status).toBe("dry_run_completed");
    expect(approved.body.job.executionResult.dryRun).toBe(true);
    expect(approved.body.job.executionResult.safeToClean).toBe(true);
    expect(approved.body.job.executionResult.wouldClearThreadReference).toBe(true);
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("chat_threads") && init?.method === "PATCH")).toBe(false);
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("communication_rooms") && init?.method === "PATCH")).toBe(false);
  });

  it("blocks stale Chi'lly Chat call cleanup when fresh memberships still exist", async () => {
    const oldIso = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const freshIso = new Date().toISOString();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("admin_live_ops_incidents")) {
        return new Response(JSON.stringify([{ id: "incident-chat-call" }]), { status: 200 });
      }
      if (url.includes("admin_live_ops_action_audit")) {
        return new Response(JSON.stringify({ id: "audit-chat-call" }), { status: 201 });
      }
      if (url.includes("chat_threads?active_communication_room_id")) {
        return new Response(JSON.stringify([{ id: "thread-a", active_communication_room_id: "call-active", active_call_type: "video", updated_at: oldIso }]), { status: 200 });
      }
      if (url.includes("communication_rooms")) {
        return new Response(JSON.stringify([{ room_id: "call-active", status: "active", last_activity_at: oldIso, updated_at: oldIso, created_at: oldIso }]), { status: 200 });
      }
      if (url.includes("communication_room_memberships")) {
        return new Response(JSON.stringify([{ room_id: "call-active", user_id: "user-a", last_seen_at: freshIso, membership_state: "active" }]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));
    const { app } = createApp(
      env({
        ALLOW_LIVE_OPS_REGISTRY_ACTIONS: "true",
        DRY_RUN: "false",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
        SUPABASE_URL: "https://supabase.example.test"
      })
    );
    const created = await postAlert(
      app,
      payload("ChatCallCleanupFailed", {
        affected_purpose: "chat-call",
        call_cleanup_failed: "true",
        call_id: "call-active"
      })
    );
    const jobId = created.body.jobs[0].id;

    const approved = await request(app)
      .post(`/jobs/${jobId}/approve`)
      .set("X-Ops-Approval-Token", "approval-test-token");

    expect(approved.status).toBe(409);
    expect(approved.body.job.status).toBe("failed");
    expect(approved.body.error).toContain("fresh_chat_call_membership_not_safe_to_clean");
  });

  it("dry-runs approved Live Ops GitHub actions without creating issues by default", async () => {
    const { app } = createApp(env({ DRY_RUN: "true", ALLOW_GITHUB_ACTIONS: "false" }));
    const created = await postAlert(
      app,
      payload("LiveOpsTokenSignalingJoinFailures", {
        affected_route: "watch_party_live",
        join_failures: "10",
        signaling_errors: "3",
        token_errors: "2"
      })
    );
    const jobId = created.body.jobs[0].id;

    const approved = await request(app)
      .post(`/jobs/${jobId}/approve`)
      .set("X-Ops-Approval-Token", "approval-test-token");

    expect(approved.status).toBe(200);
    expect(approved.body.job.status).toBe("dry_run_completed");
    expect(approved.body.job.executionResult.dryRun).toBe(true);
    expect(approved.body.job.plan.liveOpsIncident.affectedRoute).toBe("Watch-Party Live");
  });

  it("blocks LiveKit registry remediation when real execution is not explicitly enabled", async () => {
    const { app } = createApp(
      env({
        DRY_RUN: "false",
        ALLOW_LIVE_OPS_REGISTRY_ACTIONS: "false"
      })
    );
    const created = await postAlert(
      app,
      payload("LiveKitNodeUnhealthy", {
        affected_route: "live_watch_party",
        bad_node: "true",
        server_id: "chillywood-prod-01"
      })
    );
    const jobId = created.body.jobs[0].id;

    const approved = await request(app)
      .post(`/jobs/${jobId}/approve`)
      .set("X-Ops-Approval-Token", "approval-test-token");

    expect(approved.status).toBe(409);
    expect(approved.body.job.status).toBe("failed");
    expect(approved.body.error).toContain("blocked_by_safety");
  });

  it("supports create PR only as a dry-run when an existing fix branch is supplied", async () => {
    const { app } = createApp(env({ DRY_RUN: "true" }));
    const created = await postAlert(
      app,
      payload("LiveOpsTokenSignalingJoinFailures", {
        affected_route: "live_watch_party",
        fix_branch: "ops/live-token-fix",
        join_failures: "8",
        signaling_errors: "2",
        token_errors: "2"
      })
    );
    const jobId = created.body.jobs[0].id;

    const prOnly = await request(app)
      .post(`/jobs/${jobId}/create-pr-only`)
      .set("X-Ops-Approval-Token", "approval-test-token");

    expect(prOnly.status).toBe(200);
    expect(prOnly.body.result.dryRun).toBe(true);
    expect(prOnly.body.result.target.headBranch).toBe("ops/live-token-fix");
  });

  it("lists recent jobs with sanitized fields and status filtering", async () => {
    const { app } = createApp(env());
    await postAlert(app, payload("ServerCpuMemoryPressure"));
    await postAlert(
      app,
      payload("RoomZombieStuck", {
        room: "room-a",
        token: "raw-token-should-not-return",
        url: "https://storage.example.com/internal/index.m3u8"
      })
    );

    const response = await request(app).get("/jobs?status=waiting_approval&limit=10");

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.jobs[0].status).toBe("waiting_approval");
    expect(response.body.jobs[0].alert).toBeUndefined();
    expect(response.body.jobs[0].labels.room).toBe("room-a");
    expect(response.body.jobs[0].labels.token).toBeUndefined();
    expect(response.body.jobs[0].labels.url).toBeUndefined();
  });

  it("keeps job detail sanitized and supports the optional admin read token", async () => {
    const { app } = createApp(env({ OPS_ADMIN_READ_TOKEN: "read-token" }));
    const created = await postAlert(app, payload("RoomZombieStuck", { room: "room-a" }));
    const jobId = created.body.jobs[0].id;

    const blocked = await request(app).get(`/jobs/${jobId}`);
    const allowed = await request(app).get(`/jobs/${jobId}`).set("X-Ops-Admin-Token", "read-token");

    expect(blocked.status).toBe(401);
    expect(allowed.status).toBe(200);
    expect(allowed.body.job.alert).toBeUndefined();
    expect(allowed.body.job.idempotencyKey).toBeUndefined();
    expect(allowed.body.job.plan.target.room).toBe("room-a");
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

  it("sends one test email for new actionable jobs when email is enabled", async () => {
    const auditPath = join(tempDir, "audit.log");
    const { app } = createApp(emailEnv({ AUDIT_LOG_PATH: auditPath }));

    const response = await postAlert(app, payload("RoomZombieStuck", { room: "room-a" }));

    expect(response.status).toBe(202);
    expect(response.body.jobs[0].status).toBe("waiting_approval");
    const auditEvents = await readAuditEvents(auditPath);
    expect(auditEvents.some((line) => line.includes("email_queued"))).toBe(true);
    expect(auditEvents.some((line) => line.includes("email_sent"))).toBe(true);
  });

  it("does not send email for unknown no-op alerts", async () => {
    const auditPath = join(tempDir, "audit.log");
    const { app } = createApp(emailEnv({ AUDIT_LOG_PATH: auditPath }));

    await postAlert(app, payload("MysteryAlert"));

    const auditEvents = await readAuditEvents(auditPath);
    expect(auditEvents.some((line) => line.includes("email_sent"))).toBe(false);
    expect(auditEvents.some((line) => line.includes("email_queued"))).toBe(false);
  });

  it("does not send duplicate emails for idempotent actionable alerts", async () => {
    const auditPath = join(tempDir, "audit.log");
    const { app } = createApp(emailEnv({ AUDIT_LOG_PATH: auditPath }));
    const body = payload("RoomZombieStuck", { room: "room-a" });

    await postAlert(app, body);
    const duplicate = await postAlert(app, body);

    const auditEvents = await readAuditEvents(auditPath);
    expect(duplicate.body.jobs[0].duplicate).toBe(true);
    expect(auditEvents.filter((line) => line.includes("email_sent"))).toHaveLength(1);
    expect(auditEvents.some((line) => line.includes("email_skipped_duplicate"))).toBe(true);
  });

  it("keeps approval tokens and configured secrets out of email bodies", async () => {
    const { app, store, config } = createApp(
      emailEnv({
        OPS_APPROVAL_TOKEN: "approval-sentinel",
        OPS_SMTP_PASS: "smtp-sentinel",
        LK_API_SECRET: "livekit-sentinel"
      })
    );
    await postAlert(
      app,
      payload("RoomZombieStuck", {
        room: "room-a",
        service_role_key: "role-sentinel",
        token: "raw-token-sentinel"
      })
    );
    const [job] = await store.list();
    const email = buildOpsJobEmail(job, config);

    expect(email.text).not.toContain("approval-sentinel");
    expect(email.text).not.toContain("smtp-sentinel");
    expect(email.text).not.toContain("livekit-sentinel");
    expect(email.text).not.toContain("role-sentinel");
    expect(email.text).not.toContain("raw-token-sentinel");
  });

  it("audits email failure without executing actions", async () => {
    const auditPath = join(tempDir, "audit.log");
    const { app } = createApp(
      emailEnv({
        AUDIT_LOG_PATH: auditPath,
        OPS_EMAIL_TEST_MODE: "false",
        OPS_SMTP_HOST: undefined
      })
    );

    const response = await postAlert(app, payload("RoomZombieStuck", { room: "room-a" }));

    expect(response.status).toBe(202);
    expect(response.body.jobs[0].status).toBe("waiting_approval");
    expect(response.body.jobs[0].executionResult).toBeUndefined();
    const auditEvents = await readAuditEvents(auditPath);
    expect(auditEvents.some((line) => line.includes("email_failed"))).toBe(true);
  });

  it("audits disabled email while still creating actionable jobs", async () => {
    const auditPath = join(tempDir, "audit.log");
    const { app } = createApp(env({ AUDIT_LOG_PATH: auditPath, OPS_EMAIL_ENABLED: "false" }));

    const response = await postAlert(app, payload("RoomZombieStuck", { room: "room-a" }));

    expect(response.status).toBe(202);
    expect(response.body.jobs[0].status).toBe("waiting_approval");
    const auditEvents = await readAuditEvents(auditPath);
    expect(auditEvents.some((line) => line.includes("email_skipped_disabled"))).toBe(true);
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
