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

function readTtlHours() {
  const raw = readOptionalArg("ttl-hours") || process.env.SANDBOX_MONEY_TESTER_TTL_HOURS || "168";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(720, Math.trunc(parsed))) : 168;
}

async function main() {
  const url = readFirstPresentEnv(["SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"]);
  const serviceRoleKey = readFirstPresentEnv(["SUPABASE_SERVICE_ROLE_KEY"]);
  const email = normalizeEmail(readOptionalArg("email") || process.env.SANDBOX_MONEY_TESTER_EMAIL);
  const userId = String(readOptionalArg("user-id") || process.env.SANDBOX_MONEY_TESTER_USER_ID || "").trim();
  const note = String(readOptionalArg("note") || "sandbox money tester proof access").trim();

  if (!email && !userId) {
    throw new Error("Provide --email=<tester@example.com> or --user-id=<uuid>.");
  }

  const expiresAt = new Date(Date.now() + readTtlHours() * 60 * 60 * 1000).toISOString();
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (userId) {
    const { error } = await adminClient
      .from("sandbox_monetization_testers")
      .update({ revoked_at: new Date().toISOString(), status: "revoked" })
      .eq("status", "active")
      .eq("user_id", userId);
    if (error) throw error;
  }

  if (email) {
    const { error } = await adminClient
      .from("sandbox_monetization_testers")
      .update({ revoked_at: new Date().toISOString(), status: "revoked" })
      .eq("status", "active")
      .eq("email", email);
    if (error) throw error;
  }

  const { data, error } = await adminClient
    .from("sandbox_monetization_testers")
    .insert({
      created_by: "grant-sandbox-money-tester",
      email: email || null,
      expires_at: expiresAt,
      note,
      status: "active",
      user_id: userId || null,
    })
    .select("id,user_id,email,status,expires_at,created_at")
    .single();

  if (error) throw error;

  console.log(JSON.stringify({
    ok: true,
    action: "grant",
    tester: {
      id: data?.id ?? null,
      userId: data?.user_id ?? null,
      email: data?.email ?? null,
      status: data?.status ?? null,
      expiresAt: data?.expires_at ?? null,
      createdAt: data?.created_at ?? null,
    },
    sandboxOnly: true,
    notPayable: true,
    liveMoneyEnabled: false,
    payoutsEnabled: false,
    ownerRoleGranted: false,
    serviceRolePrinted: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    action: "grant",
    error: error instanceof Error ? error.message : "unknown_error",
    serviceRolePrinted: false,
  }, null, 2));
  process.exit(1);
});
