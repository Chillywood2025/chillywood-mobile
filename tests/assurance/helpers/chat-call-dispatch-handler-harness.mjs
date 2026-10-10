import assert from "node:assert/strict";
import { generateKeyPairSync, webcrypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

// Executes the complete production handlers and their repository imports. The
// controlled boundary is the Supabase SDK's returned receipts and provider HTTP;
// it does NOT emulate APNs/FCM delivery, database authorization, or CallKit UI.
const root = path.resolve(import.meta.dirname, "../../..");
const functionsRoot = path.join(root, "supabase/functions");
const pem = (type, options) => generateKeyPairSync(type, options).privateKey
  .export({ type: "pkcs8", format: "pem" }).toString();
// Ephemeral test keys are never sent to a service and are not account credentials.
const apnsKey = pem("ec", { namedCurve: "prime256v1" });
const fcmKey = pem("rsa", { modulusLength: 2048 });
const compiled = new Map();
const clone = (value) => structuredClone(value);
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", ...headers },
});

export const DISPATCH_IDS = Object.freeze({
  invite: "00000000-0000-4000-8000-000000000001",
  thread: "00000000-0000-4000-8000-000000000002",
  caller: "00000000-0000-4000-8000-000000000003",
  callee: "00000000-0000-4000-8000-000000000004",
  session: "00000000-0000-4000-8000-000000000005",
});

export function createCallDispatchHarness(options = {}) {
  const ids = DISPATCH_IDS;
  let now = Date.parse("2026-09-28T12:00:00Z");
  let serial = 10;
  const nextId = () => `00000000-0000-4000-8000-${String(serial++).padStart(12, "0")}`;
  const events = [];
  const unexpected = [];
  const tables = {
    chat_call_invites: [{
      id: ids.invite, thread_id: ids.thread, communication_room_id: null,
      caller_user_id: ids.caller, callee_user_id: ids.callee,
      call_type: options.callType ?? "video", status: options.status ?? "ringing",
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + (options.expiresInMs ?? 90_000)).toISOString(),
    }],
    chat_thread_members: [
      { thread_id: ids.thread, user_id: ids.caller, display_name: "Test caller" },
      { thread_id: ids.thread, user_id: ids.callee, display_name: "Test callee" },
    ],
    channel_audience_blocks: [],
    notification_preferences: [{
      user_id: ids.callee, push_enabled: options.pushEnabled ?? true,
      in_app_enabled: options.inAppEnabled ?? true,
      chilly_chat_calls_enabled: options.callsEnabled ?? true,
    }],
    user_push_tokens: (options.pushTokens ?? []).map((token) => ({
      id: nextId(), user_id: ids.callee, enabled: true, revoked_at: null,
      token_fingerprint: "test-fingerprint", ...token,
    })),
    user_voip_push_tokens: options.voipToken === false ? [] : [{
      id: nextId(), user_id: ids.callee, account_id: ids.callee,
      install_id: "test-install", session_generation: ids.session,
      token: "test-voip-device-token", token_fingerprint: "test-voip-fingerprint",
      apns_environment: "development", enabled: true,
    }],
    notifications: [], notification_event_dedupes: [],
    notification_delivery_attempts: [], voip_push_delivery_attempts: [],
  };
  const fault = (message) => {
    unexpected.push(message);
    throw new Error(message);
  };
  function query(table) {
    if (!Object.hasOwn(tables, table)) return fault(`Unmodeled database table: ${table}`);
    let operation = "select";
    let values;
    let single = false;
    let limit = Infinity;
    const predicates = [];
    let resultPromise;
    const builder = {
      select() { return builder; },
      eq(key, value) { predicates.push((row) => row[key] === value); return builder; },
      is(key, value) { predicates.push((row) => (row[key] ?? null) === value); return builder; },
      in(key, values) { predicates.push((row) => values.includes(row[key])); return builder; },
      not(key, operator, value) {
        assert.equal(operator, "is");
        predicates.push((row) => (row[key] ?? null) !== value); return builder;
      },
      order() { return builder; },
      limit(value) { limit = value; return builder; },
      maybeSingle() { single = true; return builder; },
      insert(value) { operation = "insert"; values = clone(value); return builder; },
      update(value) { operation = "update"; values = clone(value); return builder; },
      delete() { operation = "delete"; return builder; },
      then(resolve, reject) {
        resultPromise ??= Promise.resolve().then(() => {
          events.push({ kind: "database", table, operation, values: clone(values) });
          if (options.databaseFailure === table) return { data: null, error: { message: "controlled read failure" } };
          let rows = tables[table].filter((row) => predicates.every((predicate) => predicate(row))).slice(0, limit);
          if (operation === "insert") {
            const key = table === "notification_event_dedupes" ? "dedupe_key"
              : table === "voip_push_delivery_attempts" ? "dispatch_key" : null;
            if (key && tables[table].some((row) => row[key] === values[key])) {
              return { data: null, error: { code: "23505" } };
            }
            const row = { id: nextId(), created_at: new Date(now).toISOString(), attempt_count: 1, ...values };
            tables[table].push(row); rows = [row];
          } else if (operation === "update") {
            for (const row of rows) Object.assign(row, values);
          } else if (operation === "delete") {
            tables[table] = tables[table].filter((row) => !rows.includes(row));
          }
          return { data: clone(single ? rows[0] ?? null : rows), error: null };
        });
        return resultPromise.then(resolve, reject);
      },
    };
    return builder;
  }
  const rpc = async (name, parameters) => {
    events.push({ kind: "rpc", name, parameters: clone(parameters) });
    if (name === "wave1_session_authority_readback") return {
      data: { authoritative: true, state: "ACTIVE", restoreOnly: false,
        userId: ids.caller, accountId: ids.caller, sessionGeneration: ids.session,
        ...options.sessionAuthority }, error: null,
    };
    if (name === "is_account_access_restricted") return { data: false, error: null };
    if (name === "enforce_abuse_rate_limit") return {
      data: null, error: options.rateLimited ? { message: "rate_limited" } : null,
    };
    if (name === "whole_app_read_deliverable_ios_voip_tokens") return {
      data: clone(tables.user_voip_push_tokens.filter((row) => row.enabled)), error: null,
    };
    if (name === "whole_app_acknowledge_ios_callkit_presentation") return {
      data: options.ackReceipt === true, error: options.ackError ? { message: "controlled RPC failure" } : null,
    };
    return fault(`Unmodeled database RPC: ${name}`);
  };
  const client = { from: query, rpc, auth: { getUser: async () => ({
    data: { user: { id: ids.caller, email: null } }, error: null,
  }) } };
  const env = {
    SUPABASE_URL: "https://dispatch.test.invalid", SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key", IOS_VOIP_PUSH_DISPATCH_ENABLED: "true",
    IOS_ORDINARY_PUSH_ROLLOUT_ENABLED: "true", APPLE_TEAM_ID: "TESTTEAM",
    APNS_KEY_ID: "TESTKEY", APNS_PRIVATE_KEY: apnsKey, IOS_BUNDLE_IDENTIFIER: "test.chillywood",
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      project_id: "test-project", client_email: "dispatch@example.invalid", private_key: fcmKey,
    }), ...options.env,
  };
  let iosHandler;
  const controlledFetch = async (url, init = {}) => {
    const address = String(url);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    events.push({ kind: "http", url: address, body, headers: Object.fromEntries(new Headers(init.headers)) });
    if (address === `${env.SUPABASE_URL}/functions/v1/ios-voip-call-dispatch`) {
      if (options.iosUnavailable) throw new Error("controlled iOS handler transport failure");
      return iosHandler(new Request(address, init));
    }
    if (address.startsWith("https://api.sandbox.push.apple.com/3/device/")) {
      if (options.apnsTransportError) throw new Error("controlled APNs transport failure");
      const status = options.apnsStatus ?? 200;
      if (status === 200 && options.presentationReceipt) {
        const attempt = tables.voip_push_delivery_attempts.find((row) => row.id === body.presentationAttemptId);
        assert.ok(attempt, "presentation receipt must refer to the real handler's attempt");
        attempt.presented_at = new Date(now).toISOString();
      }
      return response(status === 200 ? {} : { reason: options.apnsReason ?? "InternalServerError" }, status, { "apns-id": "test-provider-message" });
    }
    if (address === "https://oauth2.googleapis.com/token") {
      if (options.fcmOAuthTransportError) throw new TypeError("controlled OAuth fetch failure");
      return options.fcmOAuthFailure
        ? response({ error: "temporarily_unavailable" }, 503)
        : response({ access_token: "test-oauth-result", expires_in: 3600 });
    }
    if (address === "https://fcm.googleapis.com/v1/projects/test-project/messages:send") {
      if (options.fcmTransportError) throw new TypeError("controlled FCM fetch failure with private-provider-detail");
      return options.fcmFailure
        ? response({ error: { status: "UNAVAILABLE" } }, 503)
        : response({ name: "projects/test-project/messages/test-message" });
    }
    if (address === "https://exp.host/--/api/v2/push/send") return options.expoFailure
      ? response({ data: { status: "error", message: "test-provider-failure", details: { error: "DeviceNotRegistered" } } })
      : response({ data: { status: "ok", id: "test-expo-ticket" } });
    if (address === "https://exp.host/--/api/v2/push/getReceipts") return response({ data: {} });
    return fault(`Unexpected network request: ${address}`);
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const modules = new Map();
  function load(file, handlerTarget) {
    if (modules.has(file)) return modules.get(file).exports;
    const mutate = options.sourceMutations?.[path.relative(functionsRoot, file)];
    let code = mutate ? undefined : compiled.get(file);
    if (!code) {
      const original = fs.readFileSync(file, "utf8");
      const source = mutate ? mutate(original) : original;
      if (mutate) assert.notEqual(source, original, "mutation must alter the current source");
      code = ts.transpileModule(source, {
        fileName: file.replace(/\.mjs$/u, ".ts"),
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText;
      if (!mutate) compiled.set(file, code);
    }
    const module = { exports: {} };
    modules.set(file, module);
    const context = vm.createContext({
      module, exports: module.exports, console,
      Request, Response, Headers, URL, URLSearchParams, AbortSignal, TextEncoder,
      Uint8Array, crypto: webcrypto, Date: ClockDate, atob, btoa, fetch: controlledFetch,
      setTimeout(callback, milliseconds) { now += milliseconds; queueMicrotask(callback); return 1; },
      Deno: { env: { get: (key) => env[key] }, serve: (handler) => handlerTarget.handler = handler },
      require(specifier) {
        if (specifier === "jsr:@supabase/functions-js/edge-runtime.d.ts") return {};
        if (specifier === "npm:@supabase/supabase-js@2.110.6") return { createClient: () => client };
        if (!specifier.startsWith(".")) return fault(`Unmodeled module: ${specifier}`);
        const resolved = path.resolve(path.dirname(file), specifier);
        assert.ok(resolved.startsWith(`${functionsRoot}/`));
        return load(resolved, {});
      },
    });
    new vm.Script(code, { filename: file }).runInContext(context);
    return module.exports;
  }
  const ios = {};
  load(path.join(functionsRoot, "ios-voip-call-dispatch/index.ts"), ios);
  iosHandler = ios.handler;
  const ordinary = {};
  load(path.join(functionsRoot, "chilly-chat-call-dispatch/index.ts"), ordinary);
  assert.equal(typeof iosHandler, "function");
  assert.equal(typeof ordinary.handler, "function");
  return {
    events, tables, ids,
    async dispatch(body = { action: "incoming", inviteId: ids.invite }, { ios = false } = {}) {
      const result = await (ios ? iosHandler : ordinary.handler)(new Request(`${env.SUPABASE_URL}/test`, {
        method: "POST", headers: { authorization: "Bearer test-caller-session", "content-type": "application/json" },
        body: JSON.stringify(body),
      }));
      assert.deepEqual(unexpected, [], "unknown SDK/module/network boundaries must not silently pass");
      return { status: result.status, body: await result.json() };
    },
  };
}
