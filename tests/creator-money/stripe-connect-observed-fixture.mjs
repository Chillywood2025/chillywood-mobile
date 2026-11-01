import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

export function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function("exports", "module", "require", ...Object.keys(globals), code)(module.exports, module,
    id => { assert.ok(id in mocks, `unexpected import ${id}`); return mocks[id]; }, ...Object.values(globals));
  return module.exports;
}
export const connect = load("supabase/functions/_shared/stripe-connect.ts", {
  "npm:@supabase/supabase-js@2": {}, "./exact-subject-authority.ts": {},
});
export const account = (changes = {}) => ({
  id: "acct_synthetic_configuration", livemode: false, type: "none", charges_enabled: true,
  payouts_enabled: true, details_submitted: true, capabilities: { transfers: "active", card_payments: "active" },
  requirements: { currently_due: [], past_due: [] },
  controller: { type: "application", is_controller: true, fees: { payer: "application" },
    losses: { payments: "application" }, requirement_collection: "stripe", stripe_dashboard: { type: "express" } },
  ...changes,
});
export const creator = "cf100000-0000-4000-8000-000000000001";
export function clientFor(db) {
  const identifier = value => { assert.match(value, /^[a-z_]+$/u); return `"${value}"`; };
  return { from(table) {
    let operation = "select", values, filters = [], limit, ordering;
    const query = {
      select() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
      is(key, value) { filters.push([key, value]); return query; }, order(key, options={}) { ordering=`${identifier(key)} ${options.ascending === false ? 'desc' : 'asc'}`; return query; },
      in(key, value) { filters.push([key, value, "in"]); return query; },
      limit(value) { limit = value; return query; },
      update(value) { operation = "update"; values = value; return query; },
      insert(value) { operation = "insert"; values = value; return query; },
      upsert(value) { operation = "upsert"; values = value; return query; },
      async execute() {
        try {
          const args = [], parameter = value => { args.push(value); return `$${args.length}`; };
          const where = filters.length ? ` where ${filters.map(([key, value, operator]) => operator === "in" ? `${identifier(key)}=any(${parameter(value)}::text[])` : value === null ? `${identifier(key)} is null` : `${identifier(key)}=${parameter(value)}`).join(" and ")}` : "";
          let sql;
          if (operation === "select") sql = `select * from public.${identifier(table)}${where}${ordering ? ` order by ${ordering}` : ''}${limit ? ` limit ${Number(limit)}` : ""}`;
          else if (operation === "update") sql = `update public.${identifier(table)} set ${Object.entries(values).map(([key, value]) => `${identifier(key)}=${parameter(value)}`).join(",")}${where} returning *`;
          else {
            const columns = Object.keys(values);
            sql = `insert into public.${identifier(table)} (${columns.map(identifier).join(",")}) values (${Object.values(values).map(parameter).join(",")})`;
            if (operation === "upsert") sql += ` on conflict (creator_user_id) do update set ${columns.filter(key => key !== "creator_user_id").map(key => `${identifier(key)}=excluded.${identifier(key)}`).join(",")}`;
            sql += " returning *";
          }
          const { rows } = await db.query(sql, args);
          return { data: JSON.parse(JSON.stringify(rows)), error: null, count: rows.length };
        } catch (error) { return { data: null, error }; }
      },
      async single() { const result = await query.execute(); return { ...result, data: result.data?.[0] ?? null,
        error: result.error || (result.data?.length !== 1 ? new Error("exact account binding no longer exists") : null) }; },
      async maybeSingle() { const result = await query.execute(); return { ...result, data: result.data?.[0] ?? null }; },
      then(resolve, reject) { return query.execute().then(resolve, reject); },
    };
    return query;
  } };
}
export const payoutsFor = supabase => load("_lib/creatorPayouts.ts", {
  "./supabase": { supabase }, "./creatorMonetization": {
    CREATOR_INSTANT_CASHOUT_FEE_BPS: 100, CREATOR_INSTANT_CASHOUT_FEE_CAP_CENTS: null,
    calculateScheduledPayoutFeeCents: () => 0,
  },
});
