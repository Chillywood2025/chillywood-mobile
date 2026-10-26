import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const sourceId = "11111111-1111-4111-8111-111111111111";
const compiled = ts.transpileModule(readFileSync("_lib/creatorSandboxPurchaseDestination.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(response = { data: { id: sourceId, party_id: "party-one" }, error: null }) {
  const queries = [];
  const supabase = { from(table) {
    const query = { table }; queries.push(query);
    const builder = {
      select(fields) { query.fields = fields; return builder; },
      eq(key, value) { query[key] = value; return builder; },
      async maybeSingle() { return response; },
    };
    return builder;
  } };
  const module = { exports: {} };
  new Function("exports", "require", "module", compiled)(module.exports, (name) => {
    assert.equal(name, "./supabase"); return { supabase };
  }, module);
  return { resolve: module.exports.resolveCreatorSandboxPurchaseDestination, queries };
}

test("sandbox source destinations preserve exact buyer context without opening checkout", async () => {
  const { resolve, queries } = load();
  assert.deepEqual(await resolve("paid_content", sourceId), { pathname: "/player/[id]", params: { id: sourceId, source: "creator-video" } });
  assert.deepEqual(await resolve("creator_tip", sourceId), { pathname: "/channel/[userId]", params: { userId: sourceId } });
  assert.deepEqual(await resolve("event", sourceId), { pathname: "/event/[eventId]", params: { eventId: sourceId } });
  assert.equal(queries.length, 0);
  for (const type of ["watch_party_live", "live_watch_party_access", "live_watch_party_seat"]) {
    const route = await resolve(type, sourceId);
    assert.equal(route.pathname, type === "watch_party_live" ? "/watch-party/[partyId]" : "/watch-party/live-stage/[partyId]");
    assert.equal(route.params.partyId, "party-one");
    const query = queries.at(-1);
    assert.equal(query.table, type === "watch_party_live" ? "paid_watch_party_offers" : "paid_live_watch_party_offers");
    assert.equal(query.id, sourceId);
    assert.equal(query.fields, "id,party_id");
  }
});

test("unknown, stale, malformed, denied or unavailable offer mapping stops navigation", async () => {
  await assert.rejects(load().resolve("paid_content", "not-a-uuid"), /valid source/);
  await assert.rejects(load().resolve("unknown", sourceId), /no contextual checkout/);
  for (const response of [
    { data: null, error: null },
    { data: null, error: new Error("unavailable") },
    { data: { id: "other", party_id: "party-one" }, error: null },
    { data: { id: sourceId, party_id: "" }, error: null },
    { data: { id: sourceId, party_id: " party-one" }, error: null },
    { data: { id: sourceId, party_id: 1 }, error: null },
  ]) await assert.rejects(load(response).resolve("watch_party_live", sourceId), /could not be verified/);
});

test("admin digital action delegates to contextual flow and revalidates identity before navigation", () => {
  const source = readFileSync("app/admin-money-sandbox-purchases.tsx", "utf8");
  assert.doesNotMatch(source, /purchaseRevenueCatStoreProduct|create_money_purchase_intent|readRevenueCatNonSubscriptionProducts/);
  assert.match(source, /await resolveCreatorSandboxPurchaseDestination[\s\S]*?await revalidateCreatorMoneyPurchaseSubject[\s\S]*?router\.push\(destination/);
  assert.match(source, /await launchCreatorMerchSandboxCheckout\(\)/);
});
