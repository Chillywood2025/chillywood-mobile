import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import * as payloadPolicy from "../../supabase/functions/_shared/notification-payload.mjs";
import * as receiptPolicy from "../../supabase/functions/_shared/expo-push-receipt-policy.mjs";
import * as storePolicy from "../../supabase/functions/revenuecat-webhook/store-policy.mjs";

// Actual production declarations run unchanged. Only DB/RPC receipts, HTTP,
// environment and the clock are modeled. This does not prove a payment, SQL
// transaction, webhook authentication, device delivery or physical notification.
const root = path.resolve(import.meta.dirname, "../..");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function declarations(file, names) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const nodes = ast.statements.filter((node) => {
    if (ts.isImportDeclaration(node) || ts.isExpressionStatement(node)) return false;
    if (!names) return true;
    const name = node.name?.getText(ast);
    return names.includes(name) || (ts.isVariableStatement(node)
      && node.declarationList.declarations.some((d) => names.includes(d.name.getText(ast))));
  });
  if (names) assert.equal(nodes.length, names.length, `actual declarations: ${file}`);
  return nodes.map((node) => node.getText(ast)).join("\n");
}
const source = declarations("supabase/functions/revenuecat-webhook/index.ts");
const readiness = declarations("supabase/functions/_shared/provider-readiness.ts",
  ["encoder", "toText", "sanitizeErrorMessage", "hashText"]);
const receipts = declarations("supabase/functions/_shared/expo-push-receipts.ts");
const compiled = compile(`${source}\n`
  + "globalThis.production = { writeGooglePlayCreatorMoneyFromRevenueCatEvent, writeIosConsumableFromRevenueCatEvent, writeLiveWatchPartyMoneyFromRevenueCatEvent };\n");
const copy = (value) => structuredClone(value);
const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
export const ids = Object.freeze({
  buyer: "00000000-0000-4000-8000-000000000001",
  creator: "00000000-0000-4000-8000-000000000002",
  source: "00000000-0000-4000-8000-000000000003",
  party: "00000000-0000-4000-8000-000000000004",
  intent: "00000000-0000-4000-8000-000000000005",
  ledger: "00000000-0000-4000-8000-000000000006",
  provider: "00000000-0000-4000-8000-000000000007",
});
export function createRevenueCatNotificationHarness(options = {}) {
  const platform = options.platform ?? "android";
  const productType = options.productType ?? "creator_tip";
  let now = Date.parse("2026-10-10T12:00:00Z");
  let serial = 100;
  const nextId = () => `00000000-0000-4000-8000-${String(serial++).padStart(12, "0")}`;
  const events = [];
  const boundaryListeners = new Set();
  let activeRuns = 0;
  const notifyBoundaries = () => { for (const listener of [...boundaryListeners]) listener(); };
  const recordEvent = (event) => { events.push(event); notifyBoundaries(); };
  const holds = [];
  const timers = new Map();
  let timerSerial = 0;
  let preferenceFailure = options.preferenceFailure ?? false;
  let pushMode = options.pushMode ?? "success";
  let receiptMode = options.receiptMode ?? "success";
  let databaseFailure = options.databaseFailure ?? null;
  let tokenReadFailure = options.tokenReadFailure ?? null;
  let blockReadFailure = options.blockReadFailure ?? false;
  let intentReadFailure = options.intentReadFailure ?? false;
  const tables = {
    money_purchase_intents: [{ id: ids.intent, creator_id: ids.creator,
      source_id: ids.source, source_type: productType, metadata: { party_id: ids.party } }],
    channel_audience_blocks: [],
    paid_watch_party_offers: [{ id: ids.source, creator_id: ids.creator, party_id: ids.party }],
    paid_live_watch_party_offers: [{ id: ids.source, creator_id: ids.creator, party_id: ids.party, pass_type: productType }],
    paid_creator_events: [{ creator_event_id: ids.source, creator_id: ids.creator }],
    notification_preferences: [ids.buyer, ids.creator].map((user_id) => ({
      user_id, in_app_enabled: true, push_enabled: true,
      creator_money_purchases_enabled: true, creator_money_sales_enabled: true,
      ...(options.preferences?.[user_id] ?? {}),
    })),
    user_push_tokens: [ids.buyer, ids.creator].map((user_id) => ({
      id: nextId(), user_id, provider: "expo", platform, enabled: true,
      revoked_at: null, token: `synthetic-token-${user_id}`, last_seen_at: new Date(now).toISOString(),
    })),
    notifications: [], notification_event_dedupes: [], notification_delivery_attempts: [],
  };
  function query(table) {
    assert.ok(Object.hasOwn(tables, table), `unmodeled DB table: ${table}`);
    let operation = "select"; let values; let single = false; let limit = Infinity;
    const filters = []; const equalities = new Map(); let result;
    const q = {
      select() { return q; },
      eq(key, value) { equalities.set(key, value); filters.push((r) => r[key] === value); return q; },
      is(key, value) { filters.push((r) => (r[key] ?? null) === value); return q; },
      not(key, operator, value) { assert.equal(operator, "is"); filters.push((r) => (r[key] ?? null) !== value); return q; },
      in(key, values) { filters.push((r) => values.includes(r[key])); return q; },
      order() { return q; }, limit(value) { limit = value; return q; },
      maybeSingle() { single = true; return q; },
      insert(value) { operation = "insert"; values = copy(value); return q; },
      update(value) { operation = "update"; values = copy(value); return q; },
      delete() { operation = "delete"; return q; },
      then(resolve, reject) {
        result ??= Promise.resolve().then(() => {
          recordEvent({ kind: "db", table, operation, values: copy(values) });
          if (table === "money_purchase_intents" && operation === "select" && intentReadFailure) {
            return { data: null, error: { code: "XX000", message: "modeled intent lookup failure" } };
          }
          if (table === "channel_audience_blocks" && operation === "select" && blockReadFailure) {
            return { data: null, error: { code: "XX000", message: "modeled block lookup failure" } };
          }
          if (table === "user_push_tokens" && operation === "select" && tokenReadFailure
            && equalities.get("user_id") === ids.buyer
            && equalities.get("platform") === tokenReadFailure) {
            return { data: null, error: { code: "XX000", message: "modeled token lookup failure" } };
          }
          if (databaseFailure === `${table}:${operation}` && (values?.user_id ?? values?.recipient_user_id) === ids.buyer) {
            return { data: null, error: { code: "XX000", message: "modeled storage failure" } };
          }
          if (table === "notification_preferences" && operation === "select" && (preferenceFailure === true
            || tables[table].some((r) => r.user_id === preferenceFailure && filters.every((f) => f(r))))) {
            return { data: null, error: { code: "XX000", message: "modeled preference read failure" } };
          }
          let rows = tables[table].filter((r) => filters.every((f) => f(r))).slice(0, limit);
          if (operation === "insert") {
            if (table === "notification_event_dedupes" && tables[table].some((r) => r.dedupe_key === values.dedupe_key)) {
              return { data: null, error: { code: "23505" } };
            }
            const row = { id: nextId(), created_at: new Date(now).toISOString(), ...values };
            tables[table].push(row); rows = [row];
          } else if (operation === "update") rows.forEach((r) => Object.assign(r, values));
          else if (operation === "delete") tables[table] = tables[table].filter((r) => !rows.includes(r));
          return { data: copy(single ? rows[0] ?? null : rows), error: null };
        });
        return result.then(resolve, reject);
      },
    };
    return q;
  }
  const client = {
    from: query,
    async rpc(name, args) {
      assert.equal(name, options.writer === "live" ? "process_revenuecat_live_watch_party_event_atomic"
        : platform === "ios" ? "process_revenuecat_app_store_event_atomic" : "process_revenuecat_google_play_event_atomic");
      recordEvent({ kind: "atomic_rpc", name, args: copy(args) });
      // Deliberately modeled durable purchase result, stable IDs on replay.
      return { error: null, data: {
        status: options.atomicStatus ?? "processed", productType, productKey: "synthetic-product",
        purchaseIntentId: ids.intent, ledgerEventId: ids.ledger, providerEventId: ids.provider,
        environment: "sandbox", payableState: "not_payable", grantStatus: "sandbox_only",
        ...options.atomicResult,
      } };
    },
  };
  const simulatedFetch = async (url, init) => {
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body);
    if (url === "https://exp.host/--/api/v2/push/getReceipts") {
      recordEvent({ kind: "receipt_lookup", body });
      if (receiptMode === "hold") return new Promise((resolve) => holds.push(() => resolve(response({ data: {} }))));
      return response({ data: {} });
    }
    assert.equal(url, "https://exp.host/--/api/v2/push/send", "no external endpoint allowed");
    recordEvent({ kind: "push_send", body, hasAbortSignal: !!init.signal });
    const success = () => response({ data: { status: "ok", id: `synthetic-ticket-${nextId()}` } });
    if (pushMode === "throw_buyer" && body.to.endsWith(ids.buyer)) throw new TypeError("modeled Expo transport rejection");
    if (pushMode === "hold_buyer" && body.to.endsWith(ids.buyer)) {
      return new Promise((resolve, reject) => {
        holds.push(() => resolve(success()));
        init.signal?.addEventListener("abort", () => reject(new Error("modeled request aborted")), { once: true });
      });
    }
    if (pushMode === "hold_body_buyer" && body.to.endsWith(ids.buyer)) {
      return { ok: true, status: 200, json: () => new Promise((resolve) => holds.push(() => resolve({ data: { status: "ok", id: "late-ticket" } }))) };
    }
    if (pushMode === "reject_body_buyer" && body.to.endsWith(ids.buyer)) {
      return { ok: true, status: 200, json: async () => { throw new SyntaxError("modeled truncated provider body"); } };
    }
    if (pushMode === "invalid_ticket_buyer" && body.to.endsWith(ids.buyer)) return response({ data: {} });
    return success();
  };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const testCrypto = options.beforeDigest ? { subtle: { async digest(...args) {
    await options.beforeDigest();
    return webcrypto.subtle.digest(...args);
  } } } : webcrypto;
  const context = {
    exports: {}, Date: ClockDate, TextEncoder, Uint8Array, crypto: testCrypto, Response,
    fetch: simulatedFetch, ...payloadPolicy, ...receiptPolicy, ...storePolicy,
    Deno: { env: { get: (key) => { assert.equal(key, "IOS_ORDINARY_PUSH_ROLLOUT_ENABLED"); return options.iosRollout === false ? "false" : "true"; } } },
    setTimeout(fn, ms) { const id = ++timerSerial; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); }, AbortController,
  };
  const readinessContext = { ...context, exports: {} };
  vm.runInNewContext(compile(readiness), readinessContext, { filename: "actual-provider-readiness-helpers.js" });
  const receiptContext = { ...context, exports: {} };
  vm.runInNewContext(compile(receipts), receiptContext, { filename: "actual-expo-receipt-helper.js" });
  Object.assign(context, readinessContext.exports, receiptContext.exports);
  vm.runInNewContext(compiled, context, { filename: "actual-revenuecat-notification-declarations.js" });
  const event = {
    id: "synthetic-event", type: "NON_RENEWING_PURCHASE", app_user_id: ids.buyer,
    product_id: "synthetic-store-product", store: platform === "ios" ? "APP_STORE" : "PLAY_STORE",
    original_transaction_id: "synthetic-original", environment: "SANDBOX", currency: "USD",
    price_in_purchased_currency: 0.99, event_timestamp_ms: now,
  };
  const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
  return {
    tables, events,
    run: () => {
      activeRuns++;
      const writer = options.writer === "live" ? context.production.writeLiveWatchPartyMoneyFromRevenueCatEvent
        : platform === "ios" ? context.production.writeIosConsumableFromRevenueCatEvent
        : context.production.writeGooglePlayCreatorMoneyFromRevenueCatEvent;
      return writer(client, event, JSON.stringify(event)).finally(() => { activeRuns--; notifyBoundaries(); });
    },
    setPushMode(value) { pushMode = value; },
    setPreferenceFailure(value) { preferenceFailure = value; },
    setReceiptMode(value) { receiptMode = value; },
    setDatabaseFailure(value) { databaseFailure = value; },
    setTokenReadFailure(value) { tokenReadFailure = value; },
    setBlockReadFailure(value) { blockReadFailure = value; },
    setIntentReadFailure(value) { intentReadFailure = value; },
    sends: () => events.filter((e) => e.kind === "push_send"),
    rpcs: () => events.filter((e) => e.kind === "atomic_rpc"),
    async waitForBoundary(kind = "push_send", predicate = () => true) {
      // Real crypto completion is independent of event-loop turn counts. This
      // host timer detects test hangs only; advance() controls production time.
      await new Promise((resolve, reject) => {
        const finish = (error) => {
          clearTimeout(hangGuard);
          boundaryListeners.delete(check);
          if (error) reject(error); else resolve();
        };
        const check = () => {
          if (events.some((event) => event.kind === kind && predicate(event))) finish();
          else if (activeRuns === 0) finish(new Error(`production run settled without provider boundary: ${kind}`));
        };
        const hangGuard = setTimeout(() => finish(new Error(`provider boundary wait exceeded real hang guard: ${kind}`)), 5_000);
        boundaryListeners.add(check);
        check();
      });
    },
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
      await flush();
    },
    async release() { pushMode = "success"; receiptMode = "success"; holds.splice(0).forEach((release) => release()); await flush(); },
  };
}
