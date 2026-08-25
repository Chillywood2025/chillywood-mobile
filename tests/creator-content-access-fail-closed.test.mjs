import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(path, "utf8");
const loadStubbed = (path, mocks) => {
  const module = { exports: {} };
  const javascript = ts.transpileModule(read(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
  }).outputText;
  new Function("exports", "module", "require", javascript)(
    module.exports,
    module,
    (id) => mocks[id] ?? {},
  );
  return module.exports;
};

let rpcImplementation = async () => ({ data: null, error: null });
const withShortAuthorityDeadline = async (operation, fallback) => {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), 5);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
};
const runtime = loadStubbed("_lib/creatorMonetization.ts", {
  "./supabase": {
    supabase: {
      from: () => ({}),
      rpc: (...args) => rpcImplementation(...args),
    },
  },
  "./entitlementAuthority": {
    withAuthorityReadDeadline: withShortAuthorityDeadline,
  },
});

const CREATOR_ID = "11111111-1111-4111-8111-111111111111";
const expectUnknownBlocked = (decision) => assert.deepEqual(decision, {
  allowed: false,
  reason: "resolver_unavailable",
  requiresPurchase: false,
  priceCents: null,
  currency: null,
  creatorId: null,
  resolverStatus: "unavailable",
});

test("creator content resolver accepts only exact authoritative allow decisions", () => {
  for (const reason of ["owner", "free_content", "purchase_grant", "active_grant", "sandbox_grant"]) {
    assert.deepEqual(runtime.normalizeCreatorContentAccessResolution({
      allowed: true,
      reason,
      requiresPurchase: false,
    }), {
      allowed: true,
      reason,
      requiresPurchase: false,
      priceCents: null,
      currency: null,
      creatorId: null,
      resolverStatus: "resolved",
    });
  }

  assert.deepEqual(runtime.normalizeCreatorContentAccessResolution({
    allowed: false,
    reason: "purchase_required",
    requiresPurchase: true,
    priceCents: 499,
    currency: "usd",
    creatorId: CREATOR_ID,
  }), {
    allowed: false,
    reason: "purchase_required",
    requiresPurchase: true,
    priceCents: 499,
    currency: "usd",
    creatorId: CREATOR_ID,
    resolverStatus: "resolved",
  });
});

test("malformed or contradictory resolver payloads are UNKNOWN and blocked", () => {
  const malformed = [
    null,
    [],
    {},
    { allowed: true },
    { allowed: "true", reason: "owner", requiresPurchase: false },
    { allowed: true, reason: "owner" },
    { allowed: true, reason: "owner", requiresPurchase: true },
    { allowed: true, reason: "client_cache", requiresPurchase: false },
    { allowed: false, reason: "purchase_required", requiresPurchase: false },
    { allowed: false, reason: "purchase_required", requiresPurchase: true, priceCents: 0, currency: "usd", creatorId: CREATOR_ID },
    { allowed: false, reason: "purchase_required", requiresPurchase: true, priceCents: "499", currency: "usd", creatorId: CREATOR_ID },
    { allowed: false, reason: "purchase_required", requiresPurchase: true, priceCents: 499, currency: "USD", creatorId: CREATOR_ID },
    { allowed: false, reason: "purchase_required", requiresPurchase: true, priceCents: 499, currency: "", creatorId: CREATOR_ID },
    { allowed: false, reason: "purchase_required", requiresPurchase: true, priceCents: 499, currency: "usd", creatorId: "wrong" },
  ];
  for (const payload of malformed) {
    expectUnknownBlocked(runtime.normalizeCreatorContentAccessResolution(payload));
  }
});

test("RPC errors, timeouts, malformed envelopes, and unavailable data never allow playback", async () => {
  const cases = [
    async () => ({ data: null, error: new Error("provider unavailable") }),
    async () => { throw new Error("network timeout"); },
    () => new Promise(() => {}),
    async () => null,
    async () => ({ data: null, error: null }),
    async () => ({ data: { allowed: true, reason: "owner" }, error: null }),
  ];

  for (const implementation of cases) {
    rpcImplementation = implementation;
    expectUnknownBlocked(await runtime.resolveCreatorContentAccess({
      contentType: "creator_video",
      contentId: "22222222-2222-4222-8222-222222222222",
    }));
  }
});

test("creator video playback requires exact resolved-and-allowed authority", () => {
  const source = read("_lib/creatorVideos.ts");
  assert.match(
    source,
    /paidContentAccess\.resolverStatus !== "resolved" \|\| paidContentAccess\.allowed !== true/u,
  );
  assert.doesNotMatch(
    source,
    /paidContentAccess\.resolverStatus === "resolved" && !paidContentAccess\.allowed/u,
  );
});
