#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { IOS_QA_RELEASE_EXPECTATION, sanitizeAutonomousReadback } from "../supabase/functions/_shared/ios-autonomous-operator-policy.mjs";

const args = new Set(process.argv.slice(2));
const toText = (value) => String(value ?? "").trim();
const firstPresent = (...names) => names.map((name) => process.env[name]).find((value) => toText(value)) ?? "";

const parseCapturedJson = (text) => {
  const raw = toText(text);
  for (const marker of ["[", "{"]) {
    const index = raw.indexOf(marker);
    if (index < 0) continue;
    try { return JSON.parse(raw.slice(index)); } catch { /* Raw provider output is never emitted. */ }
  }
  return null;
};

const runProviderJson = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = result.status === 0 ? parseCapturedJson(result.stdout) : null;
  return { ok: result.status === 0 && parsed !== null, data: parsed };
};

const readEas = () => {
  const command = firstPresent("EAS_CLI_BIN") || "eas";
  const builds = runProviderJson(command, ["build:list", "--platform", "ios", "--limit", "20", "--json", "--non-interactive"]);
  const channel = runProviderJson(command, ["channel:view", IOS_QA_RELEASE_EXPECTATION.channel, "--json", "--non-interactive"]);
  if (!builds.ok || !channel.ok) {
    return {
      readbackComplete: false,
      capability: "eas_build_channel_update_readback",
      reason: !builds.ok ? "eas_build_readback_unavailable" : "eas_channel_readback_unavailable",
    };
  }

  const rows = Array.isArray(builds.data) ? builds.data : [];
  const build = rows.find((row) => (
    String(row?.appBuildVersion ?? row?.buildNumber ?? "") === IOS_QA_RELEASE_EXPECTATION.nativeBuild
    && String(row?.appVersion ?? "") === IOS_QA_RELEASE_EXPECTATION.appVersion
    && String(row?.platform ?? "").toLowerCase() === IOS_QA_RELEASE_EXPECTATION.platform
  )) ?? null;
  const updateRows = Array.isArray(channel.data?.branches)
    ? channel.data.branches.flatMap((branch) => Array.isArray(branch?.updates) ? branch.updates : [])
    : Array.isArray(channel.data?.updates) ? channel.data.updates : [];
  const compatible = updateRows.filter((row) => String(row?.runtimeVersion ?? "") === IOS_QA_RELEASE_EXPECTATION.runtimeVersion);
  if (!build) {
    const observedChannel = toText(channel.data?.name ?? channel.data?.channel?.name) || null;
    return {
      readbackComplete: false,
      capability: "eas_build_and_channel_readback",
      reason: "local_ios_build_absent_from_eas_cloud_build_history",
      cloudBuildReadbackComplete: true,
      expectedCloudBuildPresent: false,
      channelReadbackComplete: true,
      channel: observedChannel,
      runtimeVersion: compatible[0]?.runtimeVersion ?? null,
      updateId: compatible[0]?.id ?? null,
      updateGroup: compatible[0]?.group ?? compatible[0]?.groupId ?? null,
      latestCompatibleUpdate: compatible[0]?.id ?? null,
      rollbackTargetAvailable: compatible.length > 1,
      rollbackTargetKind: compatible.length > 1 ? "previous_compatible_update" : null,
      embeddedLaunchAvailable: false,
      emergencyLaunch: false,
      compatibleUpdateCount: compatible.length,
    };
  }
  return {
    readbackComplete: true,
    capability: "eas_build_and_channel_readback",
    project: build?.project?.slug ?? build?.project?.name ?? null,
    platform: build?.platform ? String(build.platform).toLowerCase() : null,
    buildId: build?.id ?? null,
    appVersion: build?.appVersion ?? null,
    nativeBuild: build?.appBuildVersion ?? build?.buildNumber ?? null,
    profile: build?.buildProfile ?? null,
    channel: build?.channel ?? null,
    runtimeVersion: build?.runtimeVersion ?? null,
    processingStatus: build?.status ?? null,
    artifactAvailable: Boolean(build?.artifacts?.buildUrl || build?.artifacts?.applicationArchiveUrl),
    sourceCommit: build?.gitCommitHash ?? null,
    updateId: compatible[0]?.id ?? null,
    updateGroup: compatible[0]?.group ?? compatible[0]?.groupId ?? null,
    latestCompatibleUpdate: compatible[0]?.id ?? null,
    rollbackTargetAvailable: compatible.length > 1 || Boolean(build?.id),
    rollbackTargetKind: compatible.length > 1 ? "previous_compatible_update" : build?.id ? "embedded_build_update" : null,
    embeddedLaunchAvailable: Boolean(build?.id),
    emergencyLaunch: false,
  };
};

const base64url = (value) => Buffer.from(value).toString("base64url");
const createAscJwt = (keyId, issuerId, privateKey) => {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({ iss: issuerId, iat: now - 5, exp: now + 900, aud: "appstoreconnect-v1" }));
  const unsigned = `${header}.${body}`;
  const signature = crypto.sign("sha256", Buffer.from(unsigned), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${unsigned}.${signature}`;
};

const readAppStoreConnect = async () => {
  const keyId = firstPresent("APP_STORE_CONNECT_KEY_ID", "ASC_API_KEY_ID", "ASC_KEY_ID");
  const issuerId = firstPresent("APP_STORE_CONNECT_ISSUER_ID", "ASC_API_ISSUER_ID", "ASC_ISSUER_ID");
  const keyPath = firstPresent("APP_STORE_CONNECT_PRIVATE_KEY_PATH", "ASC_API_KEY_PATH", "EXPO_ASC_API_KEY_PATH");
  if (!keyId || !issuerId || !keyPath || !fs.existsSync(keyPath)) {
    return { readbackComplete: false, capability: "app_store_connect_api", reason: "provider_readback_unavailable" };
  }
  let jwt;
  try { jwt = createAscJwt(keyId, issuerId, fs.readFileSync(keyPath, "utf8")); }
  catch { return { readbackComplete: false, capability: "app_store_connect_api", reason: "credential_read_failed" }; }

  const asc = async (path) => {
    const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, { headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json" } });
    return response.ok ? { ok: true, data: await response.json() } : { ok: false, data: null };
  };
  const [app, builds, versions] = await Promise.all([
    asc(`/v1/apps/${IOS_QA_RELEASE_EXPECTATION.appId}?fields[apps]=bundleId,name`),
    asc(`/v1/builds?filter[app]=${IOS_QA_RELEASE_EXPECTATION.appId}&sort=-uploadedDate&limit=20&fields[builds]=version,processingState,uploadedDate,expired`),
    asc(`/v1/apps/${IOS_QA_RELEASE_EXPECTATION.appId}/appStoreVersions?filter[platform]=IOS&limit=50&fields[appStoreVersions]=versionString,appStoreState`),
  ]);
  if (![app, builds, versions].every((result) => result.ok)) {
    return { readbackComplete: false, capability: "app_store_connect_api", reason: "provider_query_failed" };
  }
  const buildRows = builds.data?.data ?? [];
  const versionRows = versions.data?.data ?? [];
  const submissionStates = new Set(["WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE", "PENDING_APPLE_RELEASE", "PROCESSING_FOR_APP_STORE"]);
  const publicSubmissionPresent = versionRows.some((row) => submissionStates.has(row?.attributes?.appStoreState));
  const publicReleasePresent = versionRows.some((row) => row?.attributes?.appStoreState === "READY_FOR_SALE");
  const latest = buildRows.find((row) => String(row?.attributes?.version ?? "") === IOS_QA_RELEASE_EXPECTATION.nativeBuild) ?? buildRows[0] ?? null;
  if (!latest?.id) {
    return {
      readbackComplete: false,
      capability: "app_store_connect_api",
      reason: "expected_ios_build_not_found",
      appId: IOS_QA_RELEASE_EXPECTATION.appId,
      bundleIdentifier: app.data?.data?.attributes?.bundleId ?? null,
      publicSubmissionPresent,
      publicReleasePresent,
    };
  }
  const [groups, individualTesters, betaDetail] = await Promise.all([
    asc(`/v1/builds/${latest.id}/betaGroups?limit=200&fields[betaGroups]=name,isInternalGroup,publicLinkEnabled`),
    asc(`/v1/builds/${latest.id}/individualTesters?limit=200`),
    asc(`/v1/builds/${latest.id}/buildBetaDetail?fields[buildBetaDetails]=internalBuildState,externalBuildState`),
  ]);
  if (![groups, individualTesters, betaDetail].every((result) => result.ok)) {
    return { readbackComplete: false, capability: "app_store_connect_build_assignment_api", reason: "provider_query_failed" };
  }
  const groupRows = groups.data?.data ?? [];
  return {
    readbackComplete: true,
    capability: "app_store_connect_api",
    appId: IOS_QA_RELEASE_EXPECTATION.appId,
    bundleIdentifier: app.data?.data?.attributes?.bundleId ?? null,
    latestBuildId: latest?.id ?? null,
    latestNativeBuild: latest?.attributes?.version ?? null,
    processingState: latest?.attributes?.processingState ?? null,
    internalGroupAssigned: groupRows.some((row) => row?.attributes?.isInternalGroup === true && row?.attributes?.name === "Chillywood Internal"),
    externalGroupCount: groupRows.filter((row) => row?.attributes?.isInternalGroup !== true).length,
    individualTesterCount: Array.isArray(individualTesters.data?.data) ? individualTesters.data.data.length : 0,
    betaReviewState: betaDetail.data?.data?.attributes?.externalBuildState ?? betaDetail.data?.data?.attributes?.internalBuildState ?? null,
    publicSubmissionPresent,
    publicReleasePresent,
  };
};

const providerReadback = sanitizeAutonomousReadback({ eas: readEas(), appStoreConnect: await readAppStoreConnect() });
const payload = {
  action: "watch_once",
  platform: "ios",
  scheduler: process.env.OPERATOR_SCHEDULER || "manual_cli",
  operator_id: "release_ota_operator",
  source: process.env.OPERATOR_SOURCE || "host_provider_adapter:release_ota_operator",
  provider_readback: providerReadback,
};

if (args.has("--post")) {
  const functionUrl = firstPresent("RELEASE_OPERATOR_FUNCTION_URL") || `${firstPresent("SUPABASE_FUNCTIONS_URL").replace(/\/$/u, "")}/release-operator`;
  const operatorToken = firstPresent("RELEASE_OPERATOR_TOKEN");
  if (!functionUrl || !operatorToken) {
    console.log(JSON.stringify({ ok: false, reason: "operator_access_missing", providerReadback }));
    process.exitCode = 2;
  } else {
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-release-operator-token": operatorToken },
      body: JSON.stringify(payload),
    });
    console.log(JSON.stringify({ ok: response.ok, status: response.status, providerReadback }));
    if (!response.ok) process.exitCode = 1;
  }
} else {
  console.log(JSON.stringify(providerReadback, null, 2));
}
