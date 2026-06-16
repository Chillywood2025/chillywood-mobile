#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

function readFirstPresentEnv(keys) {
  for (const key of keys) {
    const value = String(process.env[key] ?? "").trim();
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: one of ${keys.join(", ")}`);
}

function readOptionalArg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : "";
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

async function main() {
  const url = readFirstPresentEnv(["SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"]);
  const serviceRoleKey = readFirstPresentEnv(["SUPABASE_SERVICE_ROLE_KEY"]);
  const id = String(readOptionalArg("id") || process.env.SANDBOX_MONEY_TESTER_ID || "").trim();
  const email = normalizeEmail(readOptionalArg("email") || process.env.SANDBOX_MONEY_TESTER_EMAIL);
  const userId = String(readOptionalArg("user-id") || process.env.SANDBOX_MONEY_TESTER_USER_ID || "").trim();

  if (!id && !email && !userId) {
    throw new Error("Provide --id=<row uuid>, --email=<tester@example.com>, or --user-id=<uuid>.");
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = adminClient
    .from("sandbox_monetization_testers")
    .update({
      revoked_at: new Date().toISOString(),
      status: "revoked",
    })
    .eq("status", "active");

  if (id) query = query.eq("id", id);
  else if (userId) query = query.eq("user_id", userId);
  else query = query.eq("email", email);

  const { data, error } = await query.select("id,user_id,email,status,revoked_at,updated_at");
  if (error) throw error;

  console.log(JSON.stringify({
    ok: true,
    action: "revoke",
    revokedCount: Array.isArray(data) ? data.length : 0,
    rows: Array.isArray(data)
      ? data.map((row) => ({
        id: row.id ?? null,
        userId: row.user_id ?? null,
        email: row.email ?? null,
        status: row.status ?? null,
        revokedAt: row.revoked_at ?? null,
        updatedAt: row.updated_at ?? null,
      }))
      : [],
    sandboxOnly: true,
    ownerRoleRevoked: false,
    payoutAccessChanged: false,
    serviceRolePrinted: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    action: "revoke",
    error: error instanceof Error ? error.message : "unknown_error",
    serviceRolePrinted: false,
  }, null, 2));
  process.exit(1);
});
