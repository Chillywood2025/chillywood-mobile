import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(path, "utf8");
const load = (path) => {
  const module = { exports: {} };
  const js = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  }).outputText;
  new Function("exports", "module", "require", js)(module.exports, module, require);
  return module.exports;
};
const loadStubbed = (path, mocks) => {
  const module = { exports: {} };
  const js = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
  }).outputText;
  new Function("exports", "module", "require", js)(
    module.exports,
    module,
    (id) => Object.hasOwn(mocks, id) ? mocks[id] : {},
  );
  return module.exports;
};

const entitlementAuthority = load("_lib/entitlementAuthority.ts");
const sameAccountSessionAuthority = (left, right) => !!left && !!right
  && left.state === "ACTIVE" && right.state === "ACTIVE"
  && left.userId === right.userId && left.accountId === right.accountId
  && left.sessionGeneration === right.sessionGeneration && left.restoreOnly === right.restoreOnly;
const legalDocuments = ["terms", "privacy", "community_guidelines", "creator_terms", "money_terms"]
  .map((documentKey) => ({ documentKey, path: `/${documentKey}`, title: documentKey, version: "2026-08-14" }));
const legal = loadStubbed("_lib/accountLegalAcceptance.ts", {
  "./accountSessionAuthority": {
    isCurrentAccountSessionAuthority: async () => true,
    readCurrentAccountSessionAuthority: async () => null,
    sameAccountSessionAuthority,
  },
  "./entitlementAuthority": entitlementAuthority,
  "./legalPolicies": {
    ACCOUNT_LEGAL_DOCUMENT_KEYS: ["terms", "privacy", "community_guidelines"],
    LEGAL_DOCUMENTS: legalDocuments,
    LEGAL_DOCUMENT_KEYS: legalDocuments.map(({ documentKey }) => documentKey),
  },
});

const binding = {
  userId: "11111111-1111-4111-8111-111111111111",
  accountId: "11111111-1111-4111-8111-111111111111",
  sessionGeneration: "22222222-2222-4222-8222-222222222222",
  state: "ACTIVE",
  restoreOnly: false,
};
const requirements = (accepted) => legalDocuments.slice(0, 3).map(({ documentKey, version }) => ({
  documentKey,
  version,
  state: accepted ? "CURRENT_ACCEPTED" : "REQUIRED_UNACCEPTED",
  accepted,
  acceptedAt: accepted ? "2026-08-27T12:00:00.000Z" : null,
}));
const response = (accepted, extra = {}) => ({
  ...binding,
  authoritative: true,
  market: "UNITED_STATES",
  capability: "account",
  requirements: requirements(accepted),
  ...extra,
});
const clientReturning = (data) => ({ rpc: () => Promise.resolve({ data, error: null }) });

test("accepted and required legal readbacks reach explicit terminal decisions", async () => {
  const accepted = await legal.resolveAccountLegalRequirements(clientReturning(response(true)), binding, 25);
  const required = await legal.resolveAccountLegalRequirements(clientReturning(response(false)), binding, 25);
  assert.deepEqual(accepted, { status: "accepted", readback: legal.parseLegalRequirementsReadback(response(true)) });
  assert.deepEqual(required, { status: "required", readback: legal.parseLegalRequirementsReadback(response(false)) });
});

test("malformed and wrong-session readbacks fail closed", async () => {
  const malformed = await legal.resolveAccountLegalRequirements(clientReturning({ ...response(true), requirements: [] }), binding, 25);
  const wrongSession = await legal.resolveAccountLegalRequirements(clientReturning(response(true, {
    sessionGeneration: "33333333-3333-4333-8333-333333333333",
  })), binding, 25);
  assert.deepEqual(malformed, { status: "error", readback: null });
  assert.deepEqual(wrongSession, { status: "error", readback: null });
});

test("a never-settling legal RPC reaches the authority deadline and retry can recover", async () => {
  let attempts = 0;
  const client = {
    rpc: () => {
      attempts += 1;
      return attempts === 1
        ? new Promise(() => {})
        : Promise.resolve({ data: response(true), error: null });
    },
  };
  const startedAt = Date.now();
  assert.deepEqual(await legal.resolveAccountLegalRequirements(client, binding, 5), { status: "error", readback: null });
  assert.ok(Date.now() - startedAt < 250);
  const recovered = await legal.resolveAccountLegalRequirements(client, binding, 25);
  assert.equal(recovered.status, "accepted");
  assert.equal(attempts, 2);
});

test("foreground refresh occurs once per real inactive-to-active transition", () => {
  assert.equal(legal.shouldRefreshAccountLegalRequirements("background", "active"), true);
  assert.equal(legal.shouldRefreshAccountLegalRequirements("inactive", "active"), true);
  assert.equal(legal.shouldRefreshAccountLegalRequirements("active", "active"), false);
  assert.equal(legal.shouldRefreshAccountLegalRequirements("background", "inactive"), false);
});

test("the first foreground render is fail-closed before the request effect runs", () => {
  const verificationKey = legal.accountLegalVerificationKey(binding);
  assert.equal(legal.accountLegalCheckIsPending({
    settledRetry: 4,
    currentRetry: 4,
    settledVerificationKey: verificationKey,
    currentVerificationKey: verificationKey,
  }), false);
  assert.equal(legal.accountLegalCheckIsPending({
    settledRetry: 4,
    currentRetry: 5,
    settledVerificationKey: verificationKey,
    currentVerificationKey: verificationKey,
  }), true);
  assert.equal(legal.accountLegalCheckIsPending({
    settledRetry: 5,
    currentRetry: 5,
    settledVerificationKey: verificationKey,
    currentVerificationKey: legal.accountLegalVerificationKey({
      ...binding,
      sessionGeneration: "55555555-5555-4555-8555-555555555555",
    }),
  }), true);
});

test("same-session route changes do not change legal authority or restart the request key", () => {
  const before = legal.accountLegalVerificationKey(binding);
  const after = legal.accountLegalVerificationKey({ ...binding });
  assert.equal(before, after);
  assert.ok(before);
  assert.equal(legal.accountLegalVerificationKey({ ...binding, restoreOnly: true }), "");
  assert.equal(legal.accountLegalVerificationKey({ ...binding, accountId: "replacement" }), "");
  const layout = read("app/_layout.tsx");
  assert.equal(layout.includes("sessionGeneration}:${pathname}"), false);
});

test("only the newest exact-session request may commit a result", () => {
  const requestVerificationKey = legal.accountLegalVerificationKey(binding);
  const replacementKey = legal.accountLegalVerificationKey({
    ...binding,
    userId: "44444444-4444-4444-8444-444444444444",
    accountId: "44444444-4444-4444-8444-444444444444",
  });
  assert.equal(legal.isCurrentAccountLegalRequest({
    requestGeneration: 2,
    currentGeneration: 2,
    requestVerificationKey,
    currentVerificationKey: requestVerificationKey,
  }), true);
  assert.equal(legal.isCurrentAccountLegalRequest({
    requestGeneration: 1,
    currentGeneration: 2,
    requestVerificationKey,
    currentVerificationKey: requestVerificationKey,
  }), false);
  assert.equal(legal.isCurrentAccountLegalRequest({
    requestGeneration: 2,
    currentGeneration: 2,
    requestVerificationKey,
    currentVerificationKey: replacementKey,
  }), false);
});

test("layout keeps fail-closed status ownership inside the bounded request effect", () => {
  const layout = read("app/_layout.tsx");
  assert.match(layout, /setLegalReadback\(null\); setLegalStatus\("checking"\); setAcceptedLegalVerificationKey\(""\);/u);
  assert.match(layout, /shouldRefreshAccountLegalRequirements\(previousState, state\)[\s\S]{0,120}setLegalRetry/u);
  assert.match(layout, /legalCheckPending \|\| legalStatus === "checking"/u);
  assert.match(layout, /isCurrentAccountLegalRequest/u);
});
