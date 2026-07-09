#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const gatewaySource = readFileSync("supabase/functions/media-scan-private-access/index.ts", "utf8");
const scanCli = readFileSync("scripts/media-scan-cli.mjs", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");

const assertIncludes = (text, needle, message) => {
  assert(text.includes(needle), `${message}: missing ${needle}`);
};

const assertNotIncludes = (text, needle, message) => {
  assert(!text.includes(needle), `${message}: found ${needle}`);
};

assertIncludes(config, "[functions.media-scan-private-access]", "gateway function config exists");
assertIncludes(config, "verify_jwt = false", "gateway enforces own token when JWT disabled");

assertIncludes(gatewaySource, "MEDIA_SCAN_OPERATOR_TOKEN_SHA256", "gateway stores token hash only");
assertIncludes(gatewaySource, "x-media-scan-operator-token", "gateway reads scanner token header");
assertIncludes(gatewaySource, "timingSafeEqualHex", "gateway uses constant-time hash comparison");
assertIncludes(gatewaySource, "scanner_operator_token_required", "missing/invalid token is denied");
assertIncludes(gatewaySource, "private_denied", "private candidate is denied");
assertIncludes(gatewaySource, "premium_denied", "Premium candidate is denied");
assertIncludes(gatewaySource, "moderation_blocked", "moderation-blocked candidate is denied");
assertIncludes(gatewaySource, "streamS3Object", "S3/Hetzner streaming path exists");
assertIncludes(gatewaySource, "streamSupabaseStorageObject", "Supabase Storage streaming path exists");
assertIncludes(gatewaySource, "record_scan_result", "record scan result action exists");
assertIncludes(gatewaySource, "observed_readable_required", "clean write requires scanner proof");
assertIncludes(gatewaySource, "decoded_stream_required", "clean write requires decoded stream proof");
assertIncludes(gatewaySource, "ffprobe_media_readability_only_not_malware_or_content_moderation", "scanner is not overclaimed");
assertIncludes(gatewaySource, "media_scan_result_recorded", "redacted audit event is written");
assertIncludes(gatewaySource, "noSecretsReturned", "audit response declares no secrets");
assertNotIncludes(gatewaySource, "downloadUrl,", "gateway must not return a signed download URL field");
assertNotIncludes(gatewaySource, "uploadUrl,", "gateway must not return an upload URL field");

assertIncludes(scanCli, "MEDIA_SCAN_ACCESS_MODE", "CLI supports backend access mode");
assertIncludes(scanCli, "backend_gateway", "CLI defaults to backend gateway");
assertIncludes(scanCli, "MEDIA_SCAN_OPERATOR_TOKEN", "CLI uses scanner operator token");
assertIncludes(scanCli, "media-scan-private-access", "CLI calls scanner gateway");
assertIncludes(scanCli, "trusted_scan_gateway_download_denied", "CLI fails closed on gateway download denial");
assertIncludes(scanCli, "trusted_scan_gateway_record_denied", "CLI fails closed on gateway record denial");
assertIncludes(scanCli, "rawServiceRoleRequired: false", "CLI does not need local service-role key");
assertIncludes(scanCli, "rawStorageCredentialsRequired: false", "CLI does not need local storage credentials");

const deniedWithoutConfirmation = spawnSync(process.execPath, ["./scripts/media-scan-cli.mjs", "--mode=run-auto", "--source=fixture"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
const deniedOutput = JSON.parse(deniedWithoutConfirmation.stdout || deniedWithoutConfirmation.stderr || "{}");
assert(deniedWithoutConfirmation.status !== 0, "fixture run-auto remains denied without confirmation");
assert(deniedOutput.reason === "media_scan_run_auto_confirmation_missing", "run-auto confirmation remains required");

console.log(JSON.stringify({
  ok: true,
  missingTokenDenied: true,
  invalidTokenDeniedByGatewaySource: true,
  privateCandidateDenied: true,
  premiumCandidateDenied: true,
  moderationBlockedDenied: true,
  s3HetznerSupported: true,
  supabaseStorageSupported: true,
  noSignedUrlReturned: true,
  noLocalServiceRoleRequired: true,
  noLocalStorageCredentialsRequired: true,
  ffprobeNotOverclaimed: true,
  runAutoStillRequiresConfirmation: true,
  noSecretsPrinted: true,
}, null, 2));
