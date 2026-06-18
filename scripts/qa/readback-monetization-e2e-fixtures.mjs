#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CHILLYWOOD_E2E_OWNER_USER_ID"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(JSON.stringify({ ok: false, error: "missing_env", missing }, null, 2));
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ownerUserId = String(process.env.CHILLYWOOD_E2E_OWNER_USER_ID).trim();
const viewerUserId = String(process.env.CHILLYWOOD_E2E_VIEWER_USER_ID ?? "").trim() || null;
const viewerEmail = String(process.env.CHILLYWOOD_E2E_VIEWER_EMAIL ?? "").trim().toLowerCase() || null;

const safeRpc = async (name, args = {}) => {
  const { data, error } = await supabase.rpc(name, args);
  return error ? { ok: false, error: error.message } : { ok: true, data };
};

const safeSelect = async (table, query) => {
  const { data, error } = await query(supabase.from(table));
  return error ? { ok: false, error: error.message } : { ok: true, data };
};

const output = {
  ok: true,
  ownerUserId,
  viewerUserId,
  viewerEmail,
  sandboxTester: viewerUserId || viewerEmail
    ? await safeRpc("resolve_sandbox_monetization_tester", {
        p_user_id: viewerUserId,
        p_email: viewerEmail,
      })
    : { ok: false, error: "viewer_not_configured" },
  creatorConfigs: await safeRpc("admin_list_creator_sandbox_monetization_configs"),
  purchaseIntents: await safeSelect("money_purchase_intents", (query) =>
    query.select("id, user_id, creator_id, product_type, status, environment, payable_state, provider, created_at, updated_at")
      .eq("creator_id", ownerUserId)
      .order("updated_at", { ascending: false })
      .limit(20),
  ),
  accessGrants: await safeSelect("creator_access_grants", (query) =>
    query.select("id, user_id, creator_id, access_type, access_scope, source, status, created_at, updated_at")
      .eq("creator_id", ownerUserId)
      .order("updated_at", { ascending: false })
      .limit(20),
  ),
};

console.log(JSON.stringify(output, null, 2));
