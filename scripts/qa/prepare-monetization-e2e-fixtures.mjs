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

const { data, error } = await supabase.rpc("grant_sandbox_monetization_tester", {
  p_user_id: viewerUserId,
  p_email: viewerEmail,
  p_expires_at: expiresAt,
  p_note: "BrowserStack monetization E2E proof tester",
});

if (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  action: "grant_sandbox_monetization_tester",
  viewerUserId,
  viewerEmail,
  expiresAt,
  row: data,
}, null, 2));
