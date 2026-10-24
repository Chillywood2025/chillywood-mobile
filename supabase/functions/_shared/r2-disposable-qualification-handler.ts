import { CLEANUP_APPROVED, RUN_APPROVED, RUN_ID } from "./r2-disposable-qualification-manifest.ts";
import { runQualification } from "./r2-disposable-qualification.ts";
import type { Action, DurableRunStore } from "./r2-disposable-qualification.ts";
import type { Origin } from "./r2-disposable-qualification-origin.ts";
import { timingSafeEqual } from "node:crypto";
const projectUrl = "https://bmkkhihfbmsnnmcqkoly.supabase.co";

// Factory only: no Deno.serve, deployment config, imports with side effects,
// credential alternatives, registration, scheduler, or live store adapter.
export function createQualificationHandler(deps: {
  env: (name: string) => string | undefined; store: (verifiedKey: string) => DurableRunStore;
  origin: () => Origin; now?: () => number;
}) {
  return async (req: Request) => {
    const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), {
      status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
    if (req.method !== "POST") return reply(405, { status: "method_not_allowed" });
    // Exact current worker canonical authority, not the differing injected key.
    // Reusing this implementation does NOT authorize exposing a new endpoint.
    let key: string | undefined;
    try {
      const verifier = deps.env("RETENTION_WORKER_SERVICE_KEY_SHA256") ?? "";
      if (deps.env("SUPABASE_URL") === projectUrl && /^[a-f0-9]{64}$/.test(verifier)) {
        const authorization = req.headers.get("Authorization") ?? "";
        const bearer = authorization.length <= 4103 ? /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization) : null;
        if (bearer) {
          const expected = Uint8Array.from({ length: 32 }, (_, i) => parseInt(verifier.slice(i * 2, i * 2 + 2), 16));
          const actual = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bearer[1])));
          if (timingSafeEqual(actual, expected)) key = bearer[1];
        }
      }
    } catch { /* Verification failure must not construct clients or touch storage. */ }
    if (!key) return reply(403, { status: "not_allowed" });
    try {
      // A small streaming parser rejects arbitrary payloads before construction.
      if (!req.body) return reply(400, { status: "exact_action_required" });
      const reader = req.body.getReader(), buffer = new Uint8Array(256);
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          if (size + value.length > buffer.length) return reply(400, { status: "exact_action_required" });
          buffer.set(value, size); size += value.length;
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size)));
      if (!input || Array.isArray(input) || Object.keys(input).sort().join(",") !== "action,runId" ||
        input.runId !== RUN_ID || !["prepare", "read", "conflict", "cleanup", "reconcile", "status"].includes(input.action)) {
        return reply(400, { status: "exact_action_required" });
      }
      if (!RUN_APPROVED) return reply(409, { status: "offline_proposal_not_commissioned" });
      if (input.action === "cleanup" && !CLEANUP_APPROVED) return reply(403, { status: "cleanup_not_approved" });
      let origin: Origin | undefined;
      const result = await runQualification(input.action as Action, {
        store: deps.store(key), origin: (operation) => (origin ??= deps.origin())(operation),
        now: deps.now ?? Date.now, cleanupApproved: CLEANUP_APPROVED,
      });
      return reply(200, result);
    } catch { return reply(503, { status: "qualification_unconfirmed" }); }
  };
}
