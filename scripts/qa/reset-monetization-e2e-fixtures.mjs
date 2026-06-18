#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(JSON.stringify({ ok: false, error: "missing_env", missing }, null, 2));
  process.exit(1);
}

const testerId = String(process.env.CHILLYWOOD_E2E_TESTER_ROW_ID ?? "").trim() || null;
const viewerUserId = String(process.env.CHILLYWOOD_E2E_VIEWER_USER_ID ?? "").trim() || null;
const viewerEmail = String(process.env.CHILLYWOOD_E2E_VIEWER_EMAIL ?? "").trim().toLowerCase() || null;

if (!testerId && !viewerUserId && !viewerEmail) {
  console.error(JSON.stringify({ ok: false, error: "missing_tester_identity" }, null, 2));
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let query = supabase
  .from("sandbox_monetization_testers")
  .update({
    revoked_at: new Date().toISOString(),
    status: "revoked",
  })
  .eq("status", "active");

if (testerId) query = query.eq("id", testerId);
else if (viewerUserId) query = query.eq("user_id", viewerUserId);
else query = query.eq("email", viewerEmail);

const { data, error } = await query.select("id,user_id,email,status,revoked_at,updated_at");

if (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  action: "revoke_sandbox_monetization_tester_direct_service_role",
  testerId,
  viewerUserId,
  viewerEmail,
  revokedCount: Array.isArray(data) ? data.length : 0,
  rows: data,
  serviceRolePrinted: false,
}, null, 2));
