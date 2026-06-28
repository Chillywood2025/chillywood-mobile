#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

import { parseEnvFile } from "./qa/browserstack-env.mjs";

const root = process.cwd();
const envFiles = [
  ".env.local",
  ".env.proof.local",
  ".env.final-qa-proof.local",
  ".env.money-proof.local",
  ".env.browserstack.local",
  ".env.browserstack-monetization.local",
];

const allowedLabels = new Map([
  ["proof_participant_001", "CHILLYWOOD_E2E_PARTICIPANT_001_USER_ID"],
  ["proof_participant_002", "CHILLYWOOD_E2E_PARTICIPANT_002_USER_ID"],
  ["proof_premium_001", "CHILLYWOOD_E2E_PREMIUM_USER_ID"],
]);

function loadEnv() {
  return envFiles.reduce((acc, file) => ({ ...acc, ...parseEnvFile(path.join(root, file)) }), { ...process.env });
}

function requireEnv(env, key) {
  const value = String(env[key] ?? "").trim();
  if (!value) throw new Error(`missing_${key}`);
  return value;
}

function assertLocalAllowed(env) {
  if (process.env.CI && env.CHILLYWOOD_ALLOW_CI_SERVICE_ROLE_PROOF_FIXTURE_BOOTSTRAP !== "true") {
    throw new Error("refusing_premium_test_entitlement_repair_in_ci");
  }
  if (env.CHILLYWOOD_ALLOW_SERVICE_ROLE_PROOF_FIXTURE_BOOTSTRAP !== "true") {
    throw new Error("missing_CHILLYWOOD_ALLOW_SERVICE_ROLE_PROOF_FIXTURE_BOOTSTRAP_true");
  }
}

async function requireOk(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}:${error.message}`);
  return data;
}

async function readUserId(admin, env, label) {
  const envKey = allowedLabels.get(label);
  if (!envKey) throw new Error(`refusing_non_allowed_premium_proof_label:${label}`);
  const fromEnv = String(env[envKey] ?? "").trim();
  if (fromEnv) return fromEnv;
  const profile = await requireOk(`read_profile:${label}`, admin
    .from("user_profiles")
    .select("user_id")
    .eq("username", label)
    .maybeSingle());
  if (!profile?.user_id) throw new Error(`missing_proof_profile_user_id:${label}`);
  return String(profile.user_id);
}

async function main() {
  const env = loadEnv();
  assertLocalAllowed(env);
  const label = String(process.env.CHILLYWOOD_PROOF_PREMIUM_LABEL || "proof_participant_001").trim();
  if (!allowedLabels.has(label)) throw new Error(`refusing_non_allowed_premium_proof_label:${label}`);

  const admin = createClient(
    requireEnv(env, "SUPABASE_URL"),
    requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const userId = await readUserId(admin, env, label);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const row = await requireOk("upsert_premium_test_entitlement", admin
    .from("user_entitlements")
    .upsert({
      user_id: userId,
      entitlement_key: "premium",
      status: "active",
      source: "test_grant",
      starts_at: new Date().toISOString(),
      expires_at: expiresAt,
      revoked_at: null,
      updated_at: new Date().toISOString(),
      metadata: {
        final_live_chat_installed_ui_closure: true,
        proof_only: true,
        sandbox_only: true,
        provider_purchase: false,
        revenuecat_mutation: false,
        google_play_mutation: false,
        live_money_enabled: false,
        payable_balance: false,
      },
    }, { onConflict: "user_id,entitlement_key" })
    .select("entitlement_key,status,source,expires_at")
    .single());

  console.log(JSON.stringify({
    status: "ok",
    label,
    entitlementKey: row.entitlement_key,
    entitlementStatus: row.status,
    source: row.source,
    expiresAtPresent: Boolean(row.expires_at),
    valuesPrinted: false,
    providerMutation: false,
    liveMoneyEnabled: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(`premium test entitlement repair failed: ${error.message}`);
  process.exit(1);
});
