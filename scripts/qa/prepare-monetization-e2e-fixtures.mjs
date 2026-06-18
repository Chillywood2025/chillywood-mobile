#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CHILLYWOOD_E2E_VIEWER_EMAIL"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(JSON.stringify({ ok: false, error: "missing_env", missing }, null, 2));
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const viewerUserId = String(process.env.CHILLYWOOD_E2E_VIEWER_USER_ID ?? "").trim() || null;
const viewerEmail = String(process.env.CHILLYWOOD_E2E_VIEWER_EMAIL).trim().toLowerCase();
const expiresAt = process.env.CHILLYWOOD_E2E_TESTER_EXPIRES_AT || new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

const now = new Date().toISOString();

if (viewerUserId) {
  const { error } = await supabase
    .from("sandbox_monetization_testers")
    .update({ revoked_at: now, status: "revoked" })
    .eq("status", "active")
    .eq("user_id", viewerUserId);
  if (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
  }
}

const { error: revokeEmailError } = await supabase
  .from("sandbox_monetization_testers")
  .update({ revoked_at: now, status: "revoked" })
  .eq("status", "active")
  .eq("email", viewerEmail);

if (revokeEmailError) {
  console.error(JSON.stringify({ ok: false, error: revokeEmailError.message }, null, 2));
  process.exit(1);
}

const { data, error } = await supabase
  .from("sandbox_monetization_testers")
  .insert({
    created_by: "browserstack-monetization-e2e",
    email: viewerEmail,
    expires_at: expiresAt,
    note: "BrowserStack monetization E2E proof tester",
    status: "active",
    user_id: viewerUserId,
  })
  .select("id,user_id,email,status,expires_at,created_at")
  .single();

if (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  action: "grant_sandbox_monetization_tester_direct_service_role",
  viewerUserId,
  viewerEmail,
  expiresAt,
  row: data,
  sandboxOnly: true,
  notPayable: true,
  ownerRoleGranted: false,
  payoutAccessGranted: false,
  serviceRolePrinted: false,
}, null, 2));
