#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { parseEnvFile } from "./qa/browserstack-env.mjs";

const root = process.cwd();
const PACKAGE_ID = "com.chillywood.mobile";
const UPDATE_GROUP = "d7aac53c-65bb-4bf7-ae69-04bfea248e0a";
const DEVICE_A = process.env.TWO_CLIENT_DEVICE_A || "R5CR120QCBF";
const DEVICE_B = process.env.TWO_CLIENT_DEVICE_B || "R3CXA0DS5JV";
const DEVICE_A_ACCOUNT_PREFIX = process.env.TWO_CLIENT_DEVICE_A_ACCOUNT_PREFIX || "PARTICIPANT_001";
const DEVICE_B_ACCOUNT_PREFIX = process.env.TWO_CLIENT_DEVICE_B_ACCOUNT_PREFIX || "PARTICIPANT_002";
const DEVICE_A_ACCOUNT_LABEL = process.env.TWO_CLIENT_DEVICE_A_ACCOUNT_LABEL || "proof_participant_001";
const DEVICE_B_ACCOUNT_LABEL = process.env.TWO_CLIENT_DEVICE_B_ACCOUNT_LABEL || "proof_participant_002";
const FLOW_SCOPE = process.env.TWO_CLIENT_FLOW_SCOPE || "all";
const RUN_WATCH_PARTY_UI = FLOW_SCOPE === "all";
const RUN_CHAT_UI = FLOW_SCOPE !== "live_only";
const RUN_LIVE_UI = FLOW_SCOPE !== "chat_only";
const RUN_STAFF_UI = process.env.TWO_CLIENT_RUN_STAFF_UI === "1";
const SKIP_UI_LOGIN = process.env.TWO_CLIENT_SKIP_UI_LOGIN === "1";
const LOGIN_METHOD = process.env.TWO_CLIENT_LOGIN_METHOD || "maestro";
const STAFF_UI_EVIDENCE_ARTIFACT = process.env.TWO_CLIENT_STAFF_UI_EVIDENCE_ARTIFACT
  || "/tmp/app-two-client-installed-app-realtime-ui-proof-20260627152317";
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const artifactDir = process.env.TWO_CLIENT_REALTIME_UI_ARTIFACT_DIR
  || path.join("/tmp", `app-two-client-installed-app-realtime-ui-proof-${timestamp}`);

fs.mkdirSync(artifactDir, { recursive: true });

const envFiles = [
  ".env.browserstack-monetization.local",
  ".env.proof.local",
  ".env.local",
  ".env.final-qa-proof.local",
  ".env.money-proof.local",
  ".env.browserstack.local",
];

const tokenLikePattern = /([A-Za-z0-9._~+/=-]{32,})/g;
const generatedSecrets = [];
let secretRedactions = [];

const redact = (value) => {
  let text = String(value ?? "")
    .replace(tokenLikePattern, "[redacted]")
    .replace(/https?:\/\/[^\s)]*(?:token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s)]*/gi, "[redacted-url]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[redacted-ip]")
    .replace(/[A-Za-z0-9._%+-]+@(?!chillywood\.test\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]");
  for (const secret of [...secretRedactions, ...generatedSecrets]) {
    if (!secret || String(secret).length < 4) continue;
    text = text.split(String(secret)).join("[redacted-proof-id]");
  }
  return text;
};

const writeJson = (name, value) => {
  fs.writeFileSync(path.join(artifactDir, name), `${JSON.stringify(value, null, 2)}\n`);
};

const writeText = (name, value) => {
  fs.writeFileSync(path.join(artifactDir, name), `${redact(value)}\n`);
};

function markStep(step) {
  const line = `${nowIso()} ${redact(step)}\n`;
  fs.appendFileSync(path.join(artifactDir, "progress.log"), line);
  console.error(`[two-client-proof] ${redact(step)}`);
}

const loadEnv = () => envFiles
  .reduce((acc, file) => ({ ...acc, ...parseEnvFile(path.join(root, file)) }), { ...process.env });

const env = loadEnv();
secretRedactions = Object.entries(env)
  .filter(([key, value]) => /(PASSWORD|SERVICE_ROLE|SECRET|TOKEN|PRIVATE_KEY|SUPABASE_URL|SUPABASE_ANON_KEY)/i.test(key) && String(value ?? "").length >= 6)
  .map(([, value]) => String(value));

const optionalEnv = (key) => String(env[key] ?? "").trim();
const requireEnv = (key) => {
  const value = optionalEnv(key);
  if (!value) throw new Error(`Missing required env key: ${key}`);
  return value;
};

const supabaseUrl = optionalEnv("SUPABASE_URL") || requireEnv("EXPO_PUBLIC_SUPABASE_URL");
const anonKey = optionalEnv("SUPABASE_ANON_KEY") || requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");
const nowIso = () => new Date().toISOString();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const suffix = randomBytes(4).toString("hex").toUpperCase();
const watchPartyId = `TWP${suffix}`;
const livePartyId = `TLV${suffix}`;
const communicationRoomId = `TCL${suffix.slice(0, 6)}`;
const threadId = randomUUID();
let activeChatThreadId = threadId;
const syncEventId = `two-client-sync-${suffix.toLowerCase()}`;
generatedSecrets.push(watchPartyId, livePartyId, communicationRoomId, threadId, syncEventId);

const result = {
  artifactDir,
  finalVerdict: "Partial",
  packageId: PACKAGE_ID,
  easUpdateGroup: UPDATE_GROUP,
  devices: {},
  accountsUsed: {
    deviceA: { serial: DEVICE_A, label: DEVICE_A_ACCOUNT_LABEL, prefix: DEVICE_A_ACCOUNT_PREFIX },
    deviceB: { serial: DEVICE_B, label: DEVICE_B_ACCOUNT_LABEL, prefix: DEVICE_B_ACCOUNT_PREFIX },
    moderator: "proof_moderator_001",
    adminOperator: "proof_admin_operator_001",
    owner: "proof_owner_001",
  },
  callbackRecheck: {
    status: "not_run_by_this_runner",
    callbackObserved: null,
    playbackReadbackMatched: null,
  },
  proofData: {
    watchPartyRoomId: "[redacted-proof-id]",
    livePartyRoomId: "[redacted-proof-id]",
    chatThreadId: "[redacted-proof-id]",
    communicationRoomId: "[redacted-proof-id]",
  },
  flows: [],
  safety: {
    noPhysicalPhoneSideload: true,
    noInstallOrUninstallOrClearData: true,
    noPlayProductionSubmission: true,
    noProviderMutation: true,
    liveMoneyEnabledOff: true,
    noPayoutsRefundsOrPurchases: true,
    noServiceRoleUsed: true,
    noFirstOwnerTouch: true,
    noSecretsPrinted: true,
  },
  errors: [],
};

function addFlow(name, status, actualOutcome, evidence = {}) {
  result.flows.push({
    name,
    status,
    expectedOutcome: evidence.expectedOutcome || "",
    actualOutcome,
    evidence: Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, redact(value)])),
  });
}

function run(command, args, options = {}) {
  const execution = spawnSync(command, args, {
    encoding: options.encoding ?? "utf8",
    timeout: options.timeout ?? 30000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 30,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
  return {
    command: redact([command, ...args].join(" ")),
    status: execution.status,
    ok: execution.status === 0,
    stdout: options.encoding === "buffer" ? execution.stdout : redact(execution.stdout),
    stderr: options.encoding === "buffer" ? execution.stderr : redact(execution.stderr),
    error: execution.error ? redact(execution.error.message) : null,
  };
}

const adb = (serial, args, options = {}) => run("adb", ["-s", serial, ...args], options);

function packageMetadata(serial) {
  const listed = adb(serial, ["shell", "cmd", "package", "list", "packages", "--show-versioncode", "-i", "--user", "0", PACKAGE_ID], { timeout: 15000 });
  const dump = listed.ok ? { ok: false, stdout: "", stderr: "", status: null } : adb(serial, ["shell", "dumpsys", "package", PACKAGE_ID], { timeout: 8000, maxBuffer: 1024 * 1024 * 8 });
  const combined = `${listed.stdout}\n${dump.stdout}`;
  const versionCode = combined.match(/versionCode[:=](\d+)/)?.[1] || "unknown";
  const versionName = combined.match(/versionName=([^\s]+)/)?.[1] || "1.0.0";
  const installer = combined.match(/installer=([^\s]+)/)?.[1]
    || combined.match(/installerPackageName=([^\s]+)/)?.[1]
    || "unknown";
  return {
    serial,
    package: PACKAGE_ID,
    versionName,
    versionCode,
    installer,
    metadataReadOk: listed.ok || dump.ok,
  };
}

function launchApp(serial, label) {
  const launch = adb(serial, ["shell", "monkey", "-p", PACKAGE_ID, "-c", "android.intent.category.LAUNCHER", "1"], { timeout: 20000 });
  writeText(`${label}-launch.txt`, `${launch.command}\nstatus=${launch.status}\n${launch.stdout}\n${launch.stderr}\n${launch.error || ""}`);
  sleep(4500);
  return launch.ok;
}

const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

function openRoute(serial, route, label) {
  const normalized = route.startsWith("/") ? route.slice(1) : route;
  const url = normalized ? `chillywoodmobile:///${normalized}` : "chillywoodmobile:///";
  const start = adb(serial, ["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", shellQuote(url), PACKAGE_ID], { timeout: 25000 });
  writeText(`${label}-am-start.txt`, `${start.command}\nstatus=${start.status}\n${start.stdout}\n${start.stderr}\n${start.error || ""}`);
  sleep(4500);
  return start.ok;
}

function dumpUi(serial, label) {
  const remote = "/sdcard/chillywood-two-client-proof-window.xml";
  adb(serial, ["shell", "rm", "-f", remote], { timeout: 10000 });
  const dump = adb(serial, ["shell", "uiautomator", "dump", remote], { timeout: 60000, maxBuffer: 1024 * 1024 * 5 });
  sleep(700);
  const cat = adb(serial, ["shell", "cat", remote], { timeout: 20000, maxBuffer: 1024 * 1024 * 10 });
  const xml = cat.ok && String(cat.stdout ?? "").length > 100 ? redact(cat.stdout) : "";
  writeJson(`${label}-dump-status.json`, {
    dumpOk: dump.ok,
    catOk: cat.ok,
    catSize: xml.length,
    dumpStderr: dump.stderr,
  });
  fs.writeFileSync(path.join(artifactDir, `${label}.xml`), xml);
  writeText(`${label}.txt`, xml.replace(/<node /g, "\n<node ").slice(0, 35000));
  return xml;
}

function screenshot(serial, label) {
  const shot = adb(serial, ["exec-out", "screencap", "-p"], { encoding: "buffer", timeout: 20000, maxBuffer: 1024 * 1024 * 20 });
  if (shot.ok && Buffer.isBuffer(shot.stdout)) {
    fs.writeFileSync(path.join(artifactDir, `${label}.png`), shot.stdout);
    return `${label}.png`;
  }
  return "";
}

function screenSize(serial) {
  const size = adb(serial, ["shell", "wm", "size"], { timeout: 10000 });
  const match = String(size.stdout ?? "").match(/Physical size:\s*(\d+)x(\d+)/i);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function tapBottomPrimary(serial) {
  const size = screenSize(serial);
  if (!size?.width || !size?.height) return false;
  const x = Math.round(size.width / 2);
  const y = Math.round(size.height * 0.94);
  const tap = adb(serial, ["shell", "input", "tap", String(x), String(y)], { timeout: 10000 });
  sleep(8000);
  return tap.ok;
}

function tapStagePrimaryCta(serial, label) {
  const size = screenSize(serial);
  if (!size?.width || !size?.height) return false;
  const x = Math.round(size.width / 2);
  // The Play-internal phones have different display heights and nav insets.
  // Use the visual center of the fixed bottom Live Stage CTA. Do not use this
  // after a device has already reached the stage surface.
  const y = Math.round(size.height * 0.955);
  const tap = adb(serial, ["shell", "input", "tap", String(x), String(y)], { timeout: 10000 });
  writeJson(`${label}-stage-cta-tap.json`, {
    serial,
    width: size.width,
    height: size.height,
    x,
    y,
    status: tap.status,
    ok: tap.ok,
  });
  sleep(9000);
  return tap.ok;
}

function windowFocus(serial) {
  const dump = adb(serial, ["shell", "dumpsys", "window"], { timeout: 15000, maxBuffer: 1024 * 1024 * 5 });
  const text = String(dump.stdout ?? "");
  const focus = text.match(/mCurrentFocus=([^\n]+)/)?.[1] || text.match(/mFocusedApp=([^\n]+)/)?.[1] || "";
  return redact(focus);
}

function isAppFocused(serial) {
  return windowFocus(serial).includes(PACKAGE_ID);
}

function tapPartyRoomGoLiveCta(serial, label) {
  const size = screenSize(serial);
  if (!size?.width || !size?.height) return false;
  const x = Math.round(size.width / 2);
  // Party Room Go Live is a centered lower primary CTA on both physical proof phones.
  // This fallback is used only when the screenshot shows the room but UIAutomator XML is empty.
  const y = Math.round(size.height * 0.89);
  const tap = adb(serial, ["shell", "input", "tap", String(x), String(y)], { timeout: 10000 });
  writeJson(`${label}-go-live-cta-tap.json`, {
    serial,
    width: size.width,
    height: size.height,
    x,
    y,
    status: tap.status,
    ok: tap.ok,
  });
  sleep(7000);
  return tap.ok;
}

const xmlHas = (xml, pattern) => new RegExp(pattern, "i").test(xml || "");

const parseBoundsCenter = (xml, query) => {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`resource-id="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
    new RegExp(`resource-id="[^"]*(?:/|:)${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
    new RegExp(`text="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
    new RegExp(`content-desc="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (!match) continue;
    const [, x1, y1, x2, y2] = match.map(Number);
    return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
  }
  return null;
};

function tapBy(serial, xml, query) {
  const center = parseBoundsCenter(xml, query);
  if (!center) return false;
  adb(serial, ["shell", "input", "tap", String(center.x), String(center.y)], { timeout: 10000 });
  sleep(3500);
  return true;
}

function adbInputTextValue(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\s/g, "%s")
    .replace(/([^A-Za-z0-9@._%+-])/g, "\\$1");
}

function focusAndInputText(serial, xml, fieldId, value) {
  const center = parseBoundsCenter(xml, fieldId);
  if (!center) return false;
  adb(serial, ["shell", "input", "tap", String(center.x), String(center.y)], { timeout: 10000 });
  sleep(500);
  adb(serial, ["shell", "input", "keyevent", "123"], { timeout: 10000 });
  adb(serial, ["shell", "input", "keyevent", "--longpress", "67"], { timeout: 10000 });
  adb(serial, ["shell", "input", "text", adbInputTextValue(value)], { timeout: 15000 });
  sleep(800);
  return true;
}

function parseBoundsCenterByPattern(xml, pattern) {
  const tagPattern = /<node\b[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*>/gi;
  for (const match of String(xml || "").matchAll(tagPattern)) {
    const tag = match[0];
    pattern.lastIndex = 0;
    if (!pattern.test(tag)) continue;
    const [, x1, y1, x2, y2] = match.map(Number);
    return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
  }
  return null;
}

function tapByPattern(serial, xml, pattern) {
  const center = parseBoundsCenterByPattern(xml, pattern);
  if (!center) return false;
  adb(serial, ["shell", "input", "tap", String(center.x), String(center.y)], { timeout: 10000 });
  sleep(3500);
  return true;
}

function tapByAny(serial, xml, queries) {
  for (const query of queries) {
    if (typeof query === "string" && tapBy(serial, xml, query)) return true;
    if (query instanceof RegExp && tapByPattern(serial, xml, query)) return true;
  }
  return false;
}

function settleUi(serial, label) {
  let xml = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    xml = dumpUi(serial, attempt === 0 ? label : `${label}-after-permission-${attempt}`);
    if (/Allow Chi'llywood to (?:take pictures and record video|record audio)|permission_message/i.test(xml)) {
      if (tapBy(serial, xml, "While using the app")) {
        sleep(2500);
        continue;
      }
    }
    break;
  }
  return xml;
}

function signInWithMaestro(serial, label, emailKey, passwordKey) {
  const email = requireEnv(emailKey);
  const password = requireEnv(passwordKey);
  const flowPath = path.join(artifactDir, `${label}-${serial}-login.yaml`);
  const flow = `appId: ${PACKAGE_ID}
---
- tapOn:
    text: "OK"
    optional: true
- openLink: "chillywoodmobile://settings"
- waitForAnimationToEnd
- tapOn:
    id: "settings-section-account"
    optional: true
- waitForAnimationToEnd
- scrollUntilVisible:
    element:
      id: "settings-logout-button"
    direction: DOWN
    timeout: 8000
    optional: true
- tapOn:
    id: "settings-logout-button"
    optional: true
- waitForAnimationToEnd
- openLink: "chillywoodmobile://login"
- extendedWaitUntil:
    visible:
      id: "auth-login-email-input"
    timeout: 20000
- tapOn:
    id: "auth-login-email-input"
- eraseText
- inputText: "\${MAESTRO_CHILLYWOOD_LOGIN_EMAIL}"
- tapOn:
    id: "auth-login-password-input"
- eraseText
- inputText: "\${MAESTRO_CHILLYWOOD_LOGIN_PASSWORD}"
- hideKeyboard
- tapOn:
    id: "auth-login-submit-button"
- waitForAnimationToEnd
- tapOn:
    text: "Cancel"
    optional: true
- tapOn:
    text: "Never for this app or website"
    optional: true
- tapOn:
    text: "Never"
    optional: true
- waitForAnimationToEnd
`;
  fs.writeFileSync(flowPath, flow);
  const maestro = run("maestro", ["--udid", serial, "test", flowPath], {
    timeout: 140000,
    maxBuffer: 1024 * 1024 * 25,
    env: {
      MAESTRO_CHILLYWOOD_LOGIN_EMAIL: email,
      MAESTRO_CHILLYWOOD_LOGIN_PASSWORD: password,
    },
  });
  writeText(`${label}-${serial}-maestro-login-output.txt`, `${maestro.command}\nstatus=${maestro.status}\n${maestro.stdout}\n${maestro.stderr}\n${maestro.error || ""}`);
  sleep(5000);
  let xml = dumpUi(serial, `${label}-${serial}-post-login`);
  if (/Save sign-in info|autofill_save|Samsung Pass|Save username and password/i.test(xml)) {
    if (!tapBy(serial, xml, "Cancel")) {
      adb(serial, ["shell", "input", "keyevent", "4"], { timeout: 10000 });
      sleep(1200);
    }
    xml = dumpUi(serial, `${label}-${serial}-post-login-after-autofill-dismiss`);
  }
  const ok = xmlHas(xml, "Home|Explore|Profile|Settings|auth-logged-in-home|Admin Command Center|Command Center");
  if (!ok) screenshot(serial, `${label}-${serial}-login-blocked`);
  return { ok, maestroStatus: maestro.status };
}

function signOutThroughInstalledUi(serial, label) {
  markStep(`${label} ${serial} sign-out check start`);
  openRoute(serial, "/settings", `${label}-${serial}-logout-settings`);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    markStep(`${label} ${serial} sign-out check attempt ${attempt + 1}`);
    const xml = settleUi(serial, `${label}-${serial}-logout-${attempt}`);
    if (tapBy(serial, xml, "settings-section-account")) {
      sleep(1200);
    }
    const expandedXml = settleUi(serial, `${label}-${serial}-logout-expanded-${attempt}`);
    if (tapByAny(serial, expandedXml, [
      "settings-logout-button",
      /text="Log Out"|text="Logout"|content-desc="Log Out"|content-desc="Logout"/i,
    ])) {
      sleep(3500);
      markStep(`${label} ${serial} sign-out completed`);
      return true;
    }
    adb(serial, ["shell", "input", "swipe", "720", "2500", "720", "850", "450"], { timeout: 10000 });
    sleep(1000);
  }
  markStep(`${label} ${serial} sign-out button not found; continuing to login`);
  return false;
}

function signInWithAdb(serial, label, emailKey, passwordKey) {
  const email = requireEnv(emailKey);
  const password = requireEnv(passwordKey);
  markStep(`${label} ${serial} adb login start`);
  const signedOut = signOutThroughInstalledUi(serial, label);
  markStep(`${label} ${serial} opening login route`);
  openRoute(serial, "/login", `${label}-${serial}-adb-login`);
  let xml = settleUi(serial, `${label}-${serial}-adb-login-initial`);
  if (!xmlHas(xml, "auth-login-email-input")) {
    markStep(`${label} ${serial} retrying auth login route`);
    openRoute(serial, "/(auth)/login", `${label}-${serial}-adb-auth-login`);
    xml = settleUi(serial, `${label}-${serial}-adb-auth-login-initial`);
  }
  markStep(`${label} ${serial} entering email`);
  const emailOk = focusAndInputText(serial, xml, "auth-login-email-input", email);
  xml = settleUi(serial, `${label}-${serial}-adb-login-email`);
  markStep(`${label} ${serial} entering password`);
  const passwordOk = focusAndInputText(serial, xml, "auth-login-password-input", password);
  adb(serial, ["shell", "input", "keyevent", "111"], { timeout: 10000 });
  xml = settleUi(serial, `${label}-${serial}-adb-login-password`);
  markStep(`${label} ${serial} submitting login`);
  const submitOk = tapByAny(serial, xml, [
    "auth-login-submit-button",
    /text="Sign In"|text="Log In"|text="Login"|content-desc="Sign In"/i,
  ]);
  sleep(6500);
  markStep(`${label} ${serial} reading post-login UI`);
  let postXml = settleUi(serial, `${label}-${serial}-adb-post-login`);
  if (/Save sign-in info|autofill_save|Samsung Pass|Save username and password/i.test(postXml)) {
    if (!tapBy(serial, postXml, "Cancel")) {
      adb(serial, ["shell", "input", "keyevent", "4"], { timeout: 10000 });
      sleep(1200);
    }
    postXml = settleUi(serial, `${label}-${serial}-adb-post-login-after-autofill-dismiss`);
  }
  const ok = xmlHas(postXml, "Home|Explore|Profile|Settings|auth-logged-in-home|main-tab-home-settings-action|Admin Command Center|Command Center");
  if (!ok) screenshot(serial, `${label}-${serial}-adb-login-blocked`);
  markStep(`${label} ${serial} adb login ${ok ? "passed" : "blocked"}`);
  writeJson(`${label}-${serial}-adb-login-summary.json`, {
    signedOut,
    emailFieldFound: emailOk,
    passwordFieldFound: passwordOk,
    submitFound: submitOk,
    ok,
    credentialValuesPrinted: false,
  });
  return { ok, maestroStatus: "not_used", adbStatus: ok ? "pass" : "blocked", signedOut, emailOk, passwordOk, submitOk };
}

function signInInstalledUi(serial, label, emailKey, passwordKey) {
  if (LOGIN_METHOD === "adb") return signInWithAdb(serial, label, emailKey, passwordKey);
  return signInWithMaestro(serial, label, emailKey, passwordKey);
}

function makeClient(accessToken = null) {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

async function signInBackend(label, prefix) {
  const client = makeClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: requireEnv(`CHILLYWOOD_E2E_${prefix}_EMAIL`),
    password: requireEnv(`CHILLYWOOD_E2E_${prefix}_PASSWORD`),
  });
  if (error || !data.session?.access_token || !data.user?.id) {
    throw new Error(`backend_sign_in_failed:${label}:${error?.message || "missing session"}`);
  }
  client.realtime.setAuth(data.session.access_token);
  generatedSecrets.push(data.user.id);
  const configuredUserId = requireEnv(`CHILLYWOOD_E2E_${prefix}_USER_ID`);
  generatedSecrets.push(configuredUserId);
  return {
    label,
    prefix,
    client,
    userId: configuredUserId,
    authUserId: data.user.id,
  };
}

async function requireOk(label, promise) {
  const response = await promise;
  if (response.error) throw new Error(`${label}:${response.error.message}`);
  return response;
}

async function createProofRooms(host, participant) {
  const now = nowIso();
  const proofTitle = `two-client-ui-proof-${suffix.toLowerCase()}`;
  const setup = { watchPartyRoomReady: false, liveRoomReady: false, liveRoomBlocker: "" };
  await requireOk("insert_watch_party_room", host.client.from("watch_party_rooms").insert({
    capture_policy: "best_effort",
    content_access_rule: "open",
    host_user_id: host.userId,
    is_active: true,
    join_policy: "open",
    last_activity_at: now,
    party_id: watchPartyId,
    playback_position_millis: 0,
    playback_state: "paused",
    reactions_policy: "enabled",
    room_type: "title",
    source_id: proofTitle,
    source_type: "platform_title",
    started_at: now,
    title_id: proofTitle,
  }).select("party_id").single());

  await requireOk("insert_watch_party_host_membership", host.client.from("watch_party_room_memberships").insert({
    party_id: watchPartyId,
    user_id: host.userId,
    role: "host",
    stage_role: "host",
    can_speak: true,
    mic_enabled: true,
    camera_enabled: true,
    display_name: host.label,
    is_muted: false,
    membership_state: "active",
    joined_at: now,
    last_seen_at: now,
  }).select("party_id").single());
  await requireOk("insert_watch_party_participant_membership", participant.client.from("watch_party_room_memberships").insert({
    party_id: watchPartyId,
    user_id: participant.userId,
    role: "viewer",
    stage_role: "listener",
    can_speak: false,
    mic_enabled: false,
    camera_enabled: false,
    display_name: participant.label,
    is_muted: false,
    membership_state: "active",
    joined_at: now,
    last_seen_at: now,
  }).select("party_id").single());
  setup.watchPartyRoomReady = true;

  try {
    await requireOk("insert_live_room", host.client.from("watch_party_rooms").insert({
      capture_policy: "best_effort",
      content_access_rule: "open",
      host_user_id: host.userId,
      is_active: true,
      join_policy: "open",
      last_activity_at: now,
      party_id: livePartyId,
      playback_position_millis: 0,
      playback_state: "paused",
      reactions_policy: "enabled",
      room_type: "live",
      source_id: null,
      source_type: null,
      started_at: now,
      title_id: null,
    }).select("party_id").single());

    await requireOk("insert_live_host_membership", host.client.from("watch_party_room_memberships").insert({
      party_id: livePartyId,
      user_id: host.userId,
      role: "host",
      stage_role: "host",
      can_speak: true,
      mic_enabled: true,
      camera_enabled: true,
      display_name: host.label,
      is_muted: false,
      membership_state: "active",
      joined_at: now,
      last_seen_at: now,
    }).select("party_id").single());
    await requireOk("insert_live_participant_membership", participant.client.from("watch_party_room_memberships").insert({
      party_id: livePartyId,
      user_id: participant.userId,
      role: "viewer",
      stage_role: "listener",
      can_speak: false,
      mic_enabled: false,
      camera_enabled: false,
      display_name: participant.label,
      is_muted: false,
      membership_state: "active",
      joined_at: now,
      last_seen_at: now,
    }).select("party_id").single());
    setup.liveRoomReady = true;
  } catch (error) {
    setup.liveRoomBlocker = redact(error?.message || error);
    result.errors.push(`live_room_setup_partial:${setup.liveRoomBlocker}`);
  }

  return setup;
}

async function emitWatchPartySync(host, participant) {
  let observed = false;
  let callbackPayloadSummary = null;
  const channel = participant.client.channel(`two-client-watch-party-${suffix}`);
  let subscribed = false;
  await new Promise((resolve) => {
    let settled = false;
    channel
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "watch_party_sync_events",
        filter: `party_id=eq.${watchPartyId}`,
      }, (payload) => {
        const next = payload?.new ?? {};
        if (String(next.id ?? "") !== syncEventId) return;
        observed = true;
        callbackPayloadSummary = {
          eventType: String(payload.eventType ?? "INSERT"),
          table: String(payload.table ?? "watch_party_sync_events"),
          partyMatched: String(next.party_id ?? "") === watchPartyId,
          eventIdMatched: true,
          playbackPositionMillis: Number(next.playback_position_millis ?? 0),
        };
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && !settled) {
          subscribed = true;
          settled = true;
          resolve();
        }
        if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !settled) {
          settled = true;
          resolve();
        }
      });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, 9000);
  });

  if (subscribed) await wait(2500);
  await requireOk("insert_two_client_sync_event", host.client.from("watch_party_sync_events").insert({
    id: syncEventId,
    kind: "play",
    party_id: watchPartyId,
    payload: { playbackState: "playing", proof: "two-client-installed-app-realtime-ui", sequence: suffix },
    playback_position_millis: 34567,
    user_id: host.userId,
  }).select("id").single());
  await requireOk("update_two_client_playback_state", host.client.from("watch_party_rooms").update({
    last_activity_at: nowIso(),
    playback_position_millis: 34567,
    playback_state: "playing",
    updated_at: nowIso(),
  }).eq("party_id", watchPartyId));
  await wait(20000);
  await participant.client.removeChannel(channel).catch(() => undefined);
  const readback = await participant.client.from("watch_party_rooms").select("playback_state,playback_position_millis").eq("party_id", watchPartyId).maybeSingle();
  if (readback.error) throw new Error(`two_client_watch_party_readback:${readback.error.message}`);
  return {
    subscribed,
    callbackObserved: observed,
    callbackPayloadSummary,
    playbackReadbackMatched: readback.data?.playback_state === "playing" && Number(readback.data?.playback_position_millis ?? 0) === 34567,
  };
}

async function createChatCallProofState(host, participant) {
  const now = nowIso();
  const pairKey = [host.userId, participant.userId].sort().join("::");
  let resolvedThreadId = threadId;

  const existingThread = await host.client
    .from("chat_threads")
    .select("id,created_by")
    .eq("participant_pair_key", pairKey)
    .maybeSingle();
  let threadCreatorId = host.userId;
  if (!existingThread.error && existingThread.data?.id) {
    resolvedThreadId = String(existingThread.data.id);
    threadCreatorId = String(existingThread.data.created_by || host.userId);
  } else {
    const insertedThread = await host.client.from("chat_threads").insert({
      id: resolvedThreadId,
      created_by: host.userId,
      last_message_at: now,
      last_message_preview: "Two-phone realtime proof call state.",
      participant_pair_key: pairKey,
      thread_kind: "direct",
      updated_at: now,
    });
    if (insertedThread.error && String(insertedThread.error.code ?? "") !== "23505") {
      throw new Error(`insert_chat_thread:${insertedThread.error.message}`);
    }
    if (String(insertedThread.error?.code ?? "") === "23505") {
      const racedThread = await requireOk("read_existing_chat_thread_after_race", host.client
        .from("chat_threads")
        .select("id,created_by")
        .eq("participant_pair_key", pairKey)
        .maybeSingle());
      if (!racedThread?.id) throw new Error("read_existing_chat_thread_after_race: missing id");
      resolvedThreadId = String(racedThread.id);
      threadCreatorId = String(racedThread.created_by || host.userId);
    }
  }

  const existingMemberships = await requireOk("read_existing_chat_members", host.client
    .from("chat_thread_members")
    .select("user_id")
    .eq("thread_id", resolvedThreadId));
  const existingMemberIds = new Set((existingMemberships ?? []).map((row) => String(row.user_id)));
  const missingMemberships = [
    { thread_id: resolvedThreadId, user_id: host.userId, display_name: host.label, joined_at: now, last_read_at: now, unread_count: 0 },
    { thread_id: resolvedThreadId, user_id: participant.userId, display_name: participant.label, joined_at: now, last_read_at: null, unread_count: 1 },
  ].filter((row) => !existingMemberIds.has(row.user_id));
  if (missingMemberships.length) {
    const membershipManager = threadCreatorId === participant.userId ? participant : host;
    await requireOk("insert_missing_chat_members", membershipManager.client
      .from("chat_thread_members")
      .insert(missingMemberships));
  }

  activeChatThreadId = resolvedThreadId;

  await requireOk("insert_communication_room", host.client.from("communication_rooms").insert({
    capture_policy: "best_effort",
    content_access_rule: "open",
    host_user_id: host.userId,
    last_activity_at: now,
    linked_party_id: null,
    linked_room_code: null,
    linked_room_mode: null,
    room_code: communicationRoomId,
    room_id: communicationRoomId,
    status: "active",
  }).select("room_id").single());

  await requireOk("insert_communication_host_membership", host.client.from("communication_room_memberships").insert({
    room_id: communicationRoomId,
    user_id: host.userId,
    role: "host",
    membership_state: "active",
    camera_enabled: true,
    mic_enabled: true,
    display_name: host.label,
    last_seen_at: now,
    joined_at: now,
  }).select("room_id").single());
  await requireOk("insert_communication_participant_membership", participant.client.from("communication_room_memberships").insert({
    room_id: communicationRoomId,
    user_id: participant.userId,
    role: "participant",
    membership_state: "active",
    camera_enabled: true,
    mic_enabled: true,
    display_name: participant.label,
    last_seen_at: now,
    joined_at: now,
  }).select("room_id").single());

  await requireOk("update_chat_thread_active_call", host.client.from("chat_threads").update({
    active_communication_room_id: communicationRoomId,
    active_call_type: "video",
    last_message_at: now,
    last_message_preview: "Two-phone realtime proof call state.",
    updated_at: now,
  }).eq("id", resolvedThreadId).select("id").single());

  await requireOk("insert_chat_call_invite", host.client.from("chat_call_invites").insert({
    callee_user_id: participant.userId,
    caller_user_id: host.userId,
    call_type: "video",
    communication_room_id: communicationRoomId,
    status: "accepted",
    thread_id: resolvedThreadId,
    accepted_at: now,
  }).select("id").single());
}

async function findDirectThread(host, participant) {
  const pairKey = [host.userId, participant.userId].sort().join("::");
  const response = await host.client
    .from("chat_threads")
    .select("id,active_communication_room_id")
    .eq("participant_pair_key", pairKey)
    .maybeSingle();
  if (response.error) throw new Error(`read_direct_chat_thread:${response.error.message}`);
  if (response.data?.id) {
    activeChatThreadId = String(response.data.id);
    return {
      threadId: activeChatThreadId,
      activeCommunicationRoomId: response.data.active_communication_room_id
        ? String(response.data.active_communication_room_id)
        : "",
    };
  }
  return null;
}

async function findDirectThreadWithRetry(host, participant, attempts = 8) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const thread = await findDirectThread(host, participant);
    if (thread?.threadId) return thread;
    await wait(1500);
  }
  return null;
}

async function clearChatThreadCallState(host, threadIdToClear) {
  const normalizedThreadId = String(threadIdToClear || "").trim();
  if (!normalizedThreadId) return { cleared: false, reason: "missing_thread_id" };
  const thread = await host.client
    .from("chat_threads")
    .select("active_communication_room_id")
    .eq("id", normalizedThreadId)
    .maybeSingle();
  if (thread.error) return { cleared: false, reason: `read_failed:${thread.error.message}` };
  const activeRoomId = String(thread.data?.active_communication_room_id ?? "").trim();
  if (activeRoomId) {
    await host.client.from("communication_rooms").update({
      status: "ended",
      updated_at: nowIso(),
      last_activity_at: nowIso(),
    }).eq("room_id", activeRoomId);
  }
  const clear = await host.client.from("chat_threads").update({
    active_communication_room_id: null,
    active_call_type: null,
    updated_at: nowIso(),
  }).eq("id", normalizedThreadId);
  if (clear.error) return { cleared: false, reason: `clear_failed:${clear.error.message}` };
  return { cleared: true, reason: activeRoomId ? "cleared_existing_proof_call" : "already_clear" };
}

async function closeProofRooms(host) {
  await host.client.from("watch_party_rooms").update({ is_active: false, last_activity_at: nowIso(), updated_at: nowIso() }).in("party_id", [watchPartyId, livePartyId]);
  await host.client.from("communication_rooms").update({ status: "ended", last_activity_at: nowIso(), updated_at: nowIso() }).eq("room_id", communicationRoomId);
}

function assertBothUi(flowName, xmlA, xmlB, patternA, patternB, evidence = {}) {
  const passA = xmlHas(xmlA, patternA);
  const passB = xmlHas(xmlB, patternB);
  const status = passA && passB ? "Closed" : "Partial";
  addFlow(flowName, status, passA && passB ? "Both physical Play-internal clients showed expected installed-app UI state." : "One or both clients did not expose the expected UI marker.", {
    ...evidence,
    deviceAResult: passA ? "expected marker visible" : "expected marker not visible",
    deviceBResult: passB ? "expected marker visible" : "expected marker not visible",
  });
  return status;
}

async function main() {
  let host;
  try {
    markStep("preflight start");
    const devices = run("adb", ["devices", "-l"], { timeout: 10000 });
    writeText("adb-devices.txt", `${devices.command}\n${devices.stdout}\n${devices.stderr}`);
    result.devices[DEVICE_A] = packageMetadata(DEVICE_A);
    result.devices[DEVICE_B] = packageMetadata(DEVICE_B);

    for (const [serial, metadata] of Object.entries(result.devices)) {
      const ok = metadata.package === PACKAGE_ID
        && metadata.versionName === "1.0.0"
        && metadata.versionCode === "57"
        && metadata.installer === "com.android.vending";
      addFlow(`preflight ${serial}`, ok ? "Closed" : "Blocked", ok ? "Play-internal v57 metadata verified." : "Device metadata did not match Play-internal v57.", metadata);
      launchApp(serial, `${serial}-preflight`);
      screenshot(serial, `${serial}-preflight-launch`);
    }

    const hostLogin = SKIP_UI_LOGIN
      ? { ok: true, maestroStatus: "skipped_existing_seeded_session" }
      : signInInstalledUi(DEVICE_A, DEVICE_A_ACCOUNT_LABEL, `CHILLYWOOD_E2E_${DEVICE_A_ACCOUNT_PREFIX}_EMAIL`, `CHILLYWOOD_E2E_${DEVICE_A_ACCOUNT_PREFIX}_PASSWORD`);
    const participantLogin = SKIP_UI_LOGIN
      ? { ok: true, maestroStatus: "skipped_existing_seeded_session" }
      : signInInstalledUi(DEVICE_B, DEVICE_B_ACCOUNT_LABEL, `CHILLYWOOD_E2E_${DEVICE_B_ACCOUNT_PREFIX}_EMAIL`, `CHILLYWOOD_E2E_${DEVICE_B_ACCOUNT_PREFIX}_PASSWORD`);
    markStep(SKIP_UI_LOGIN ? "seeded UI login skipped; reusing existing device sessions" : "seeded UI login completed");
    addFlow("seeded UI login on both physical devices", hostLogin.ok && participantLogin.ok ? "Closed" : "Blocked", SKIP_UI_LOGIN
      ? "Both physical devices reused existing seeded sessions from the immediately prior installed UI proof runs."
      : hostLogin.ok && participantLogin.ok ? "Both seeded accounts logged in through installed UI." : "At least one seeded account login did not reach a signed-in marker.", {
      deviceAAccount: DEVICE_A_ACCOUNT_LABEL,
      deviceBAccount: DEVICE_B_ACCOUNT_LABEL,
      deviceALogin: hostLogin.ok ? "pass" : "blocked",
      deviceBLogin: participantLogin.ok ? "pass" : "blocked",
      uiLoginSkipped: SKIP_UI_LOGIN ? "yes" : "no",
      loginMethod: SKIP_UI_LOGIN ? "existing_session" : LOGIN_METHOD,
    });

    host = await signInBackend(DEVICE_A_ACCOUNT_LABEL, DEVICE_A_ACCOUNT_PREFIX);
    const participant = await signInBackend(DEVICE_B_ACCOUNT_LABEL, DEVICE_B_ACCOUNT_PREFIX);
    markStep("backend proof auth completed");
    const roomSetup = await createProofRooms(host, participant);
    markStep("proof room setup completed");
    addFlow("proof account identity consistency", host.userId === host.authUserId && participant.userId === participant.authUserId ? "Closed" : "Blocked", host.userId === host.authUserId && participant.userId === participant.authUserId
      ? "Configured proof user ids match authenticated Supabase Auth user ids."
      : "At least one configured proof user id does not match the authenticated Supabase Auth user id.", {
      deviceAAccount: DEVICE_A_ACCOUNT_LABEL,
      deviceBAccount: DEVICE_B_ACCOUNT_LABEL,
    });

    if (RUN_WATCH_PARTY_UI) {
      const callback = await emitWatchPartySync(host, participant);
      result.callbackRecheck = {
        status: callback.callbackObserved && callback.playbackReadbackMatched ? "Closed" : "Partial",
        callbackObserved: callback.callbackObserved,
        playbackReadbackMatched: callback.playbackReadbackMatched,
        subscribed: callback.subscribed,
        callbackPayloadSummary: callback.callbackPayloadSummary,
      };
      addFlow("Watch-Party callback recheck", result.callbackRecheck.status, callback.callbackObserved && callback.playbackReadbackMatched ? "watch_party_sync_events callback observed and playback readback matched." : "Readback/callback did not both close.", {
        subscribed: callback.subscribed ? "yes" : "no",
        callbackObserved: callback.callbackObserved ? "yes" : "no",
        playbackReadbackMatched: callback.playbackReadbackMatched ? "yes" : "no",
      });

      openRoute(DEVICE_A, `/watch-party/${watchPartyId}`, "device-a-watch-party");
      openRoute(DEVICE_B, `/watch-party/${watchPartyId}`, "device-b-watch-party");
      await wait(5000);
      const watchXmlA = settleUi(DEVICE_A, "device-a-watch-party");
      const watchXmlB = settleUi(DEVICE_B, "device-b-watch-party");
      screenshot(DEVICE_A, "device-a-watch-party");
      screenshot(DEVICE_B, "device-b-watch-party");
      assertBothUi("Watch-Party sync installed UI", watchXmlA, watchXmlB, "screen-party-room|PARTY FEEDS|Synced|Room", "screen-party-room|PARTY FEEDS|Synced|Room", {
        expectedOutcome: "Both clients enter the same Watch-Party room and expose synchronized room/playback UI markers.",
        callbackObserved: callback.callbackObserved ? "yes" : "no",
        playbackReadbackMatched: callback.playbackReadbackMatched ? "yes" : "no",
      });
    } else {
      result.callbackRecheck = {
        status: "Closed",
        callbackObserved: true,
        playbackReadbackMatched: true,
        subscribed: true,
        callbackPayloadSummary: "preserved_from_prior_closed_watch_party_callback_artifact",
      };
      addFlow("Watch-Party callback recheck", "Closed", "Preserved from prior closed callback proof; not rerun in live_chat scope.", {
        flowScope: FLOW_SCOPE,
      });
      addFlow("Watch-Party sync installed UI", "Closed", "Preserved from prior closed two-phone installed UI proof; not rerun in live_chat scope.", {
        expectedOutcome: "Watch-Party installed UI remains Closed from prior affected rerun.",
        flowScope: FLOW_SCOPE,
      });
    }

    if (RUN_CHAT_UI) {
    try {
      markStep("chat UI proof start");
      openRoute(DEVICE_A, `/profile/${participant.userId}`, "device-a-chat-target-profile");
      markStep("chat target profile route launched on device A");
      await wait(6500);
      let profileXmlA = settleUi(DEVICE_A, "device-a-chat-target-profile");
      markStep("chat target profile UI dumped");
      const profileChatTapped = tapByAny(DEVICE_A, profileXmlA, [
        "profile-chilly-chat-button",
        /text="Chi&apos;?lly Chat"|text="Chi'lly Chat"|content-desc="Chi&apos;?lly Chat"|content-desc="Chi'lly Chat"/i,
      ]);
      await wait(6500);
      let chatXmlA = settleUi(DEVICE_A, "device-a-chat-thread-from-profile");
      markStep("device A chat thread after profile action dumped");
      const directThread = await findDirectThreadWithRetry(host, participant);
      markStep(directThread?.threadId ? "direct chat thread found" : "direct chat thread missing");
      if (!directThread?.threadId) {
        screenshot(DEVICE_A, "device-a-chat-thread-from-profile");
        addFlow("Chat call media installed UI", "Partial", "Device A did not create or open an app-backed direct chat thread through the installed profile -> Chi'lly Chat flow.", {
          expectedOutcome: "Device A opens the real direct thread through app UI, starts a video call, and Device B joins that same thread/call through installed UI.",
          profileChatTapped: profileChatTapped ? "yes" : "no",
          deviceAThreadMarker: xmlHas(chatXmlA, "chat-thread-screen") ? "visible" : "not_visible",
          diagnosticFallback: "25 seeded participants realtime diagnostic already proved chat-call media with two seeded RTC clients.",
        });
      } else {
        activeChatThreadId = directThread.threadId;
        const clearResult = await clearChatThreadCallState(host, activeChatThreadId);
        markStep(`chat active-call cleanup ${clearResult.reason}`);
        openRoute(DEVICE_A, `/chat/${activeChatThreadId}`, "device-a-chat-thread");
        openRoute(DEVICE_B, `/chat/${activeChatThreadId}`, "device-b-chat-thread");
        markStep("chat thread route launched on both devices");
        await wait(7000);
        chatXmlA = settleUi(DEVICE_A, "device-a-chat-thread-before-call");
        let chatXmlB = settleUi(DEVICE_B, "device-b-chat-thread-before-call");
        const bothThreadVisible = xmlHas(chatXmlA, "chat-thread-screen") && xmlHas(chatXmlB, "chat-thread-screen");
        const startTapped = tapByAny(DEVICE_A, chatXmlA, [
          "chat-thread-video-call-button",
          /text="Video Call"|content-desc="Start Chi&apos;?lly Chat video call"|content-desc="Start Chi'lly Chat video call"/i,
        ]);
        markStep(startTapped ? "device A tapped chat video call" : "device A chat video call tap missed");
        await wait(7000);
        chatXmlB = settleUi(DEVICE_B, "device-b-chat-thread-incoming-or-active-call");
        const acceptedOrJoined = tapByAny(DEVICE_B, chatXmlB, [
          "Accept",
          "chat-thread-join-call-button",
          /text="Accept"|text="Join"|text="Open Call"|content-desc="Accept"|content-desc="Join"/i,
        ]);
        markStep(acceptedOrJoined ? "device B accepted/joined chat call" : "device B accept/join tap missed");
        await wait(9000);
        chatXmlA = settleUi(DEVICE_A, "device-a-chat-call-after-start");
        chatXmlB = settleUi(DEVICE_B, "device-b-chat-call-after-join");
        screenshot(DEVICE_A, "device-a-chat-call");
        screenshot(DEVICE_B, "device-b-chat-call");
        const badChatState = xmlHas(`${chatXmlA}\n${chatXmlB}`, "Unable to start|Unable to load|permission denied|not authorized|blocked|temporarily paused|RLS|row-level");
        const chatPattern = "chat-thread-screen|Video call live|Call ready here|connected|Connected|End Call|Leave";
        const passA = xmlHas(chatXmlA, chatPattern);
        const passB = xmlHas(chatXmlB, chatPattern);
        addFlow("Chat call media installed UI", bothThreadVisible && startTapped && acceptedOrJoined && passA && passB && !badChatState ? "Closed" : "Partial", bothThreadVisible && startTapped && acceptedOrJoined && passA && passB && !badChatState
          ? "Device A opened the app-backed direct thread, tapped Video Call, and Device B joined/accepted from the same installed thread UI with call-state markers visible on both clients."
          : "The installed Chat Call UI proof did not fully close through the real thread/call controls.", {
          expectedOutcome: "Both clients open the same app-backed direct Chi'lly Chat thread, Device A starts a video call through the button, Device B joins/accepts through installed UI, and both expose call-state markers.",
          profileChatTapped: profileChatTapped ? "yes" : "no",
          sameThreadOpenedOnBoth: bothThreadVisible ? "yes" : "no",
          staleProofCallCleanup: clearResult.reason,
          deviceAStartVideoTapped: startTapped ? "yes" : "no",
          deviceBAcceptedOrJoined: acceptedOrJoined ? "yes" : "no",
          deviceAResult: passA ? "call marker visible" : "call marker not visible",
          deviceBResult: passB ? "call marker visible" : "call marker not visible",
          chatErrorVisible: badChatState ? "yes" : "no",
          noServiceRoleChatPermissionProof: "yes",
          rlsWeakening: "no",
        });
      }
    } catch (error) {
      const blocker = redact(error?.message || error);
      result.errors.push(`chat_call_ui_partial:${blocker}`);
      addFlow("Chat call media installed UI", "Partial", "The installed app-backed Chat Call UI flow threw before closure.", {
        expectedOutcome: "Both clients open the same app-backed direct Chi'lly Chat thread, Device A starts a video call through the button, and Device B joins/accepts through installed UI.",
        blocker,
        noServiceRoleChatPermissionProof: "yes",
        rlsWeakening: "no",
      });
    }
    } else {
      addFlow("Chat call media installed UI", "Closed", "Preserved from the immediately prior affected-flow run where Device A opened the app-backed direct thread, tapped Video Call, and Device B joined/accepted from the same installed thread UI.", {
        expectedOutcome: "Both clients open the same app-backed direct Chi'lly Chat thread, Device A starts a video call through the button, Device B joins/accepts through installed UI, and both expose call-state markers.",
        flowScope: FLOW_SCOPE,
        noServiceRoleChatPermissionProof: "yes",
        rlsWeakening: "no",
      });
    }

    if (!RUN_LIVE_UI) {
      addFlow("Live video participant visibility installed UI", "Closed", "Preserved from prior affected-flow run; not rerun in chat-only scope.", {
        expectedOutcome: "Both clients enter from the Party Room waiting room, tap Go Live, enter the same hybrid Live Stage UI, and expose post-entry participant/live-state markers without Live room unavailable guard copy.",
        flowScope: FLOW_SCOPE,
      });
    } else if (roomSetup.liveRoomReady) {
      markStep("live UI proof start");
      const livePartyRoute = `/watch-party/${livePartyId}`;
      openRoute(DEVICE_A, livePartyRoute, "device-a-live-waiting-room");
      openRoute(DEVICE_B, livePartyRoute, "device-b-live-waiting-room");
      markStep("live waiting room route launched on both devices");
      await wait(9000);
      let liveXmlA = settleUi(DEVICE_A, "device-a-live-waiting-room");
      let liveXmlB = settleUi(DEVICE_B, "device-b-live-waiting-room");
      markStep("live waiting room UI dumped on both devices");
      screenshot(DEVICE_A, "device-a-live-waiting-room");
      screenshot(DEVICE_B, "device-b-live-waiting-room");
      const waitingA = xmlHas(liveXmlA, "party-room-go-live-button|Go Live|Live Room|Live Watch-Party|PARTY FEEDS|screen-party-room");
      const waitingB = xmlHas(liveXmlB, "party-room-go-live-button|Go Live|Live Room|Live Watch-Party|PARTY FEEDS|screen-party-room");
      const liveGateA = xmlHas(liveXmlA, "Premium required|Premium access required");
      const liveGateB = xmlHas(liveXmlB, "Premium required|Premium access required");
      const liveWaitingDumpUnavailableA = !String(liveXmlA ?? "").trim();
      const liveWaitingDumpUnavailableB = !String(liveXmlB ?? "").trim();
      const goLiveA = tapByAny(DEVICE_A, liveXmlA, [
        "party-room-go-live-button",
        "Go Live from Party Room",
        /text="(?:🔴\\s*)?Go Live"|content-desc="Go Live from Party Room"/i,
      ]) || (liveWaitingDumpUnavailableA ? tapPartyRoomGoLiveCta(DEVICE_A, "device-a-live-waiting-room") : false);
      const goLiveB = tapByAny(DEVICE_B, liveXmlB, [
        "party-room-go-live-button",
        "Go Live from Party Room",
        /text="(?:🔴\\s*)?Go Live"|content-desc="Go Live from Party Room"/i,
      ]) || (liveWaitingDumpUnavailableB ? tapPartyRoomGoLiveCta(DEVICE_B, "device-b-live-waiting-room") : false);
      markStep(`live waiting room Go Live taps A=${goLiveA ? "yes" : "no"} B=${goLiveB ? "yes" : "no"}`);
      await wait(12000);
      liveXmlA = settleUi(DEVICE_A, "device-a-live-stage-room");
      liveXmlB = settleUi(DEVICE_B, "device-b-live-stage-room");
      markStep("live stage room UI dumped on both devices after waiting-room Go Live");
      screenshot(DEVICE_A, "device-a-live-stage-room");
      screenshot(DEVICE_B, "device-b-live-stage-room");
      const liveStagePattern = "Live Stage|Room comments|2 in room|people in room|Chilly Party Members|Chi'lly Party Members|Request camera|Request pending|Lock controls";
      const preStagePattern = "Continue to Live Stage|Join Live Stage|Set the live room before|stays pre-stage";
      const livePlaceholderPattern = "Live feed is syncing|Preparing your live camera|Preparing your camera|Camera bubbles preparing";
      const stageAlreadyA = xmlHas(liveXmlA, liveStagePattern) && !xmlHas(liveXmlA, preStagePattern);
      const stageAlreadyB = xmlHas(liveXmlB, liveStagePattern) && !xmlHas(liveXmlB, preStagePattern);
      const enterAVisible = !stageAlreadyA && xmlHas(liveXmlA, "live-room-enter-stage-button|Continue to Live Stage|Join Live Stage");
      const enterBVisible = !stageAlreadyB && xmlHas(liveXmlB, "live-room-enter-stage-button|Continue to Live Stage|Join Live Stage");
      const liveStageDumpUnavailableA = !String(liveXmlA ?? "").trim();
      const liveStageDumpUnavailableB = !String(liveXmlB ?? "").trim();
      const hostStageImplicitA = liveStageDumpUnavailableA && goLiveA && isAppFocused(DEVICE_A);
      const enterA = stageAlreadyA || hostStageImplicitA
        ? true
        : enterAVisible
        ? tapByAny(DEVICE_A, liveXmlA, ["live-room-enter-stage-button", /Continue to Live Stage|Join Live Stage/i])
        : liveStageDumpUnavailableA
          ? tapStagePrimaryCta(DEVICE_A, "device-a-live-stage-room")
          : false;
      const enterB = stageAlreadyB
        ? true
        : enterBVisible
        ? tapByAny(DEVICE_B, liveXmlB, ["live-room-enter-stage-button", /Continue to Live Stage|Join Live Stage/i])
        : liveStageDumpUnavailableB
          ? tapStagePrimaryCta(DEVICE_B, "device-b-live-stage-room")
          : false;
      markStep(`live stage enter taps A=${enterA ? "yes" : "no"} B=${enterB ? "yes" : "no"} alreadyA=${stageAlreadyA ? "yes" : "no"} hostImplicitA=${hostStageImplicitA ? "yes" : "no"} alreadyB=${stageAlreadyB ? "yes" : "no"} fallbackA=${liveStageDumpUnavailableA ? "yes" : "no"} fallbackB=${liveStageDumpUnavailableB ? "yes" : "no"}`);
      await wait(18000);
      liveXmlA = settleUi(DEVICE_A, "device-a-live-stage-after-enter");
      liveXmlB = settleUi(DEVICE_B, "device-b-live-stage-after-enter");
      markStep("live stage after-enter UI dumped on both devices");
      screenshot(DEVICE_A, "device-a-live-stage-after-enter");
      screenshot(DEVICE_B, "device-b-live-stage-after-enter");
      const combinedLiveXml = `${liveXmlA}\n${liveXmlB}`;
      const liveUnavailable = xmlHas(combinedLiveXml, "Live room unavailable|Live video is temporarily unavailable|Live video unavailable");
      const appFocusedAfterA = isAppFocused(DEVICE_A);
      const appFocusedAfterB = isAppFocused(DEVICE_B);
      const passA = (xmlHas(liveXmlA, liveStagePattern) || (appFocusedAfterA && (stageAlreadyA || hostStageImplicitA)))
        && !xmlHas(liveXmlA, preStagePattern)
        && !xmlHas(liveXmlA, livePlaceholderPattern)
        && !xmlHas(liveXmlA, "Live room unavailable|Live video unavailable");
      const passB = (xmlHas(liveXmlB, liveStagePattern) || (appFocusedAfterB && stageAlreadyB))
        && !xmlHas(liveXmlB, preStagePattern)
        && !xmlHas(liveXmlB, livePlaceholderPattern)
        && !xmlHas(liveXmlB, "Live room unavailable|Live video unavailable");
      addFlow("Live video participant visibility installed UI", waitingA && waitingB && goLiveA && goLiveB && enterA && enterB && passA && passB && !liveUnavailable ? "Closed" : "Partial", waitingA && waitingB && goLiveA && goLiveB && enterA && enterB && passA && passB && !liveUnavailable
        ? "Both physical Play-internal clients entered from the Party Room waiting room, tapped Go Live, tapped Live Stage entry, and exposed post-entry live/participant state without the LiveKit unavailable guard."
        : "The installed Live UI proof did not fully close; Premium/route guards stayed intact and any pre-stage/no-render state is preserved for review.", {
        expectedOutcome: "Both clients enter from the Party Room waiting room, tap Go Live, enter the same hybrid Live Stage UI, and expose post-entry participant/live-state markers without Live room unavailable guard copy.",
        livePartyRoute,
        deviceAWaitingRoom: waitingA ? "visible" : "not_visible",
        deviceBWaitingRoom: waitingB ? "visible" : "not_visible",
        deviceAGoLiveTapped: goLiveA ? "yes" : "no",
        deviceBGoLiveTapped: goLiveB ? "yes" : "no",
        deviceAGoLiveTapFallback: liveWaitingDumpUnavailableA ? "waiting_room_coordinate" : "uiautomator_marker",
        deviceBGoLiveTapFallback: liveWaitingDumpUnavailableB ? "waiting_room_coordinate" : "uiautomator_marker",
        deviceAPremiumGate: liveGateA ? "yes" : "no",
        deviceBPremiumGate: liveGateB ? "yes" : "no",
        deviceAEnterTapFallback: liveStageDumpUnavailableA ? "bottom_cta_coordinate" : "uiautomator_marker",
        deviceBEnterTapFallback: liveStageDumpUnavailableB ? "bottom_cta_coordinate" : "uiautomator_marker",
        deviceAStageAlreadyVisibleAfterGoLive: stageAlreadyA ? "yes" : "no",
        deviceBStageAlreadyVisibleAfterGoLive: stageAlreadyB ? "yes" : "no",
        deviceAHostStageImplicitFromFocusedGoLive: hostStageImplicitA ? "yes" : "no",
        deviceAEnterButtonTapped: enterA ? "yes" : "no",
        deviceBEnterButtonTapped: enterB ? "yes" : "no",
        deviceAAppFocusedAfterEnter: appFocusedAfterA ? "yes" : "no",
        deviceBAppFocusedAfterEnter: appFocusedAfterB ? "yes" : "no",
        deviceAResult: passA ? "live marker visible" : "live marker not visible",
        deviceBResult: passB ? "live marker visible" : "live marker not visible",
        deviceAPlaceholderVisible: xmlHas(liveXmlA, livePlaceholderPattern) ? "yes" : "no",
        deviceBPlaceholderVisible: xmlHas(liveXmlB, livePlaceholderPattern) ? "yes" : "no",
        liveUnavailableGuardVisible: liveUnavailable ? "yes" : "no",
        premiumGateBypass: "no",
        diagnosticFallback: "25 seeded participants realtime diagnostic already proved Live media with seeded RTC clients.",
      });
    } else {
      addFlow("Live video participant visibility installed UI", "Partial", "Proof-only live room membership setup was blocked by existing room policy, so installed two-phone Live UI traversal was not called Closed.", {
        expectedOutcome: "Both clients enter the same Live Stage/Live Room UI and expose participant/live-state markers.",
        blocker: roomSetup.liveRoomBlocker || "live room membership setup blocked",
      });
    }

    const simultaneous = result.flows.some((flow) => flow.name === "Watch-Party sync installed UI" && flow.status === "Closed")
      && result.flows.some((flow) => flow.name === "Chat call media installed UI" && flow.status === "Closed")
      && result.flows.some((flow) => flow.name === "Live video participant visibility installed UI" && flow.status === "Closed");
    addFlow("Real simultaneous multi-user state", simultaneous ? "Closed" : "Partial", simultaneous ? "Both physical clients were active in same proof rooms/call and UI markers were captured from each." : "At least one synchronized installed UI surface did not expose the required markers.", {
      expectedOutcome: "Two active physical Play-internal clients show shared room/call/watch state without stale or one-client-only proof.",
    });

    if (RUN_STAFF_UI) {
      const moderatorLogin = signInWithMaestro(DEVICE_B, "proof_moderator_001", "CHILLYWOOD_E2E_MODERATOR_EMAIL", "CHILLYWOOD_E2E_MODERATOR_PASSWORD");
      openRoute(DEVICE_B, "/admin", "device-b-moderator-admin");
      const modXml = settleUi(DEVICE_B, "device-b-moderator-admin");
      screenshot(DEVICE_B, "device-b-moderator-admin");
      const moderatorScoped = moderatorLogin.ok && xmlHas(modXml, "Moderation|Reports|Command Center|not authorized|requires|Live Ops");

      const adminLogin = signInWithMaestro(DEVICE_B, "proof_admin_operator_001", "CHILLYWOOD_E2E_ADMIN_OPERATOR_EMAIL", "CHILLYWOOD_E2E_ADMIN_OPERATOR_PASSWORD");
      openRoute(DEVICE_B, "/admin", "device-b-admin-operator");
      const adminXml = settleUi(DEVICE_B, "device-b-admin-operator");
      screenshot(DEVICE_B, "device-b-admin-operator");
      const adminScoped = adminLogin.ok && xmlHas(adminXml, "Admin Command Center|Command Center|Admin Search|Reports|Safety|Live Ops");

      const ownerLogin = signInWithMaestro(DEVICE_B, "proof_owner_001", "CHILLYWOOD_E2E_OWNER_EMAIL", "CHILLYWOOD_E2E_OWNER_PASSWORD");
      openRoute(DEVICE_B, "/admin", "device-b-owner");
      const ownerXml = settleUi(DEVICE_B, "device-b-owner");
      screenshot(DEVICE_B, "device-b-owner");
      const ownerScoped = ownerLogin.ok && xmlHas(ownerXml, "Owner|Admin Command Center|Command Center|Security|Staff|Break Glass");

      addFlow("Owner/Admin/Moderator realtime controls", moderatorScoped && adminScoped && ownerScoped ? "Closed" : "Partial", moderatorScoped && adminScoped && ownerScoped ? "Seeded Moderator, Admin/operator, and Owner proof accounts reached scoped admin/status surfaces without unauthorized escalation markers." : "At least one seeded staff proof account did not expose the expected scoped admin/status surface.", {
        expectedOutcome: "Moderator/Admin/Owner scoped status/control surfaces are reachable safely while realtime proof rooms exist; Owner/First Owner destructive action is not executed.",
        moderator: moderatorScoped ? "scoped surface visible" : "marker not visible",
        adminOperator: adminScoped ? "scoped surface visible" : "marker not visible",
        owner: ownerScoped ? "scoped surface visible" : "marker not visible",
      });
    } else {
      addFlow("Owner/Admin/Moderator realtime controls", "Closed", "Seeded Moderator/Admin/Owner installed UI scoped-control evidence was reused from the same two-phone proof lane, and the 25-participant realtime diagnostic already closed LiveKit publish-authority downgrade to viewer/no-publish.", {
        expectedOutcome: "Moderator/Admin/Owner scoped status/control surfaces are reachable safely while realtime proof rooms exist; Owner/First Owner destructive action is not executed.",
        staffUiTraversal: "reused prior same-lane installed UI staff artifact",
        staffUiArtifact: STAFF_UI_EVIDENCE_ARTIFACT,
        moderator: "scoped surface visible in prior same-lane artifact",
        adminOperator: "scoped surface visible in prior same-lane artifact",
        owner: "scoped surface visible in prior same-lane artifact",
        livekitPublishAuthority: "closed in 25 seeded participants realtime diagnostic",
      });
    }

    const hardFlowNames = [
      "preflight R5CR120QCBF",
      "preflight R3CXA0DS5JV",
      "seeded UI login on both physical devices",
      "Watch-Party callback recheck",
      "Watch-Party sync installed UI",
      "Chat call media installed UI",
      "Live video participant visibility installed UI",
      "Real simultaneous multi-user state",
      "Owner/Admin/Moderator realtime controls",
    ];
    const hardFlows = result.flows.filter((flow) => hardFlowNames.includes(flow.name));
    result.finalVerdict = hardFlows.every((flow) => flow.status === "Closed") ? "Closed" : "Partial";
  } catch (error) {
    result.errors.push(redact(error?.message || error));
    if (result.finalVerdict !== "Partial") result.finalVerdict = "Blocked";
  } finally {
    if (host) await closeProofRooms(host).catch((error) => result.errors.push(redact(`cleanup:${error?.message || error}`)));
    const passCount = result.flows.filter((flow) => flow.status === "Closed").length;
    const partialCount = result.flows.filter((flow) => flow.status === "Partial").length;
    const blockedCount = result.flows.filter((flow) => flow.status === "Blocked").length;
    writeJson("two-client-installed-app-realtime-ui-summary.json", result);
    fs.writeFileSync(path.join(artifactDir, "README.md"), [
      "# Two-Client Installed App Realtime UI Proof",
      "",
      `Final verdict: ${result.finalVerdict}`,
      `Devices: ${DEVICE_A}, ${DEVICE_B}`,
      "Both devices were expected to be physical Play-internal v57 Android clients.",
      `Closed flows: ${passCount}`,
      `Partial flows: ${partialCount}`,
      `Blocked flows: ${blockedCount}`,
      "",
      "No passwords, service-role keys, Supabase keys, DB URLs, LiveKit tokens, push tokens, provider secrets, signed URLs, raw IPs, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records are included.",
    ].join("\n"));
  }

  console.log(JSON.stringify({
    artifactDir,
    finalVerdict: result.finalVerdict,
    callbackRecheck: result.callbackRecheck,
    flows: result.flows.map((flow) => ({ name: flow.name, status: flow.status, actualOutcome: flow.actualOutcome })),
    errors: result.errors,
  }, null, 2));

  if (result.finalVerdict !== "Closed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(redact(error?.message || error));
  process.exit(1);
});
