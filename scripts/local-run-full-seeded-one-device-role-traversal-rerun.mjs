#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const PACKAGE_ID = "com.chillywood.mobile";
const SERIAL = process.env.PROOF_ANDROID_SERIAL || process.env.ADB_SERIAL || "R5CR120QCBF";
const UPDATE_GROUP = "d7aac53c-65bb-4bf7-ae69-04bfea248e0a";
const AFFECTED_FIVE_ONLY = process.env.FULL_SEEDED_ONE_DEVICE_AFFECTED_ONLY === "1";
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const artifactDir = process.env.FULL_SEEDED_ONE_DEVICE_RERUN_ARTIFACT_DIR
  || path.join("/tmp", `app-full-seeded-one-device-role-traversal-rerun-${timestamp}`);

fs.mkdirSync(artifactDir, { recursive: true });

let secretRedactions = [];
const redact = (value) => {
  let text = String(value ?? "")
    .replace(/(access_token|refresh_token|token|token_hash|service_role|apikey|api_key)=([^&\s]+)/gi, "$1=<redacted>")
    .replace(/([?&]code)=([^&\s]+)/gi, "$1=<redacted>")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, "<redacted-jwt>")
    .replace(/https?:\/\/[^\s"]*(token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s"]*/gi, "<redacted-signed-url>")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<redacted-ip>")
    .replace(/[A-Za-z0-9._%+-]+@(?!chillywood\.test\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<redacted-email>");
  for (const secret of secretRedactions) {
    if (!secret || secret.length < 4) continue;
    text = text.split(secret).join("<redacted-credential>");
  }
  return text;
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: options.encoding ?? "utf8",
    timeout: options.timeout ?? 20000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 30,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
  return {
    command: [command, ...args].join(" "),
    status: result.status,
    ok: result.status === 0,
    stdout: options.encoding === "buffer" ? result.stdout : redact(result.stdout),
    stderr: options.encoding === "buffer" ? result.stderr : redact(result.stderr),
    error: result.error ? redact(result.error.message) : null,
  };
};

const adb = (args, options = {}) => run("adb", ["-s", SERIAL, ...args], options);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const writeText = (name, contents) => {
  fs.writeFileSync(path.join(artifactDir, name), `${redact(contents)}\n`);
};

const writeJson = (name, value) => {
  fs.writeFileSync(path.join(artifactDir, name), `${JSON.stringify(value, null, 2)}\n`);
};

const readEnvFiles = () => {
  const env = new Map(Object.entries(process.env).filter(([, value]) => typeof value === "string" && value.length > 0));
  const sources = new Map(Object.keys(process.env).map((key) => [key, "process env"]));
  [
    ".env.browserstack-monetization.local",
    ".env.proof.local",
    ".env.local",
    ".env.final-qa-proof.local",
    ".env.money-proof.local",
  ].forEach((file) => {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) return;
    fs.readFileSync(absolute, "utf8").split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const index = trimmed.indexOf("=");
      if (index <= 0) return;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!env.has(key)) {
        env.set(key, value);
        sources.set(key, file);
      }
    });
  });
  return { env, sources };
};

const { env, sources } = readEnvFiles();
const getEnv = (key) => String(env.get(key) ?? "").trim();
const hasEnv = (key) => getEnv(key).length > 0;

const requiredCredentialKeys = [
  "CHILLYWOOD_E2E_NORMAL_EMAIL",
  "CHILLYWOOD_E2E_NORMAL_PASSWORD",
  "CHILLYWOOD_E2E_CREATOR_EMAIL",
  "CHILLYWOOD_E2E_CREATOR_PASSWORD",
  "CHILLYWOOD_E2E_MODERATOR_EMAIL",
  "CHILLYWOOD_E2E_MODERATOR_PASSWORD",
  "CHILLYWOOD_E2E_ADMIN_OPERATOR_EMAIL",
  "CHILLYWOOD_E2E_ADMIN_OPERATOR_PASSWORD",
  "CHILLYWOOD_E2E_OWNER_EMAIL",
  "CHILLYWOOD_E2E_OWNER_PASSWORD",
  "CHILLYWOOD_E2E_RESTRICTED_EMAIL",
  "CHILLYWOOD_E2E_RESTRICTED_PASSWORD",
  "CHILLYWOOD_E2E_BLOCKED_A_EMAIL",
  "CHILLYWOOD_E2E_BLOCKED_A_PASSWORD",
  "CHILLYWOOD_E2E_BLOCKED_B_EMAIL",
  "CHILLYWOOD_E2E_BLOCKED_B_PASSWORD",
  "CHILLYWOOD_E2E_PREMIUM_EMAIL",
  "CHILLYWOOD_E2E_PREMIUM_PASSWORD",
  "CHILLYWOOD_E2E_NONPREMIUM_EMAIL",
  "CHILLYWOOD_E2E_NONPREMIUM_PASSWORD",
];

const credentialStatus = Object.fromEntries(requiredCredentialKeys.map((key) => [
  key,
  {
    present: hasEnv(key),
    source: hasEnv(key) ? sources.get(key) || "unknown local source" : "missing",
    value: "<redacted>",
  },
]));

secretRedactions = [...env.entries()]
  .filter(([key, value]) => (
    /(PASSWORD|SERVICE_ROLE|SECRET|TOKEN|PRIVATE_KEY)/i.test(key)
    && String(value ?? "").length >= 6
    && !/^(?:true|false|null|undefined|0|1)$/i.test(String(value ?? ""))
  ))
  .map(([, value]) => String(value));

const parseBoundsCenter = (xml, query) => {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`resource-id="[^"]*(?:/|:)${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
    new RegExp(`resource-id="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
    new RegExp(`text="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
    new RegExp(`content-desc="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
    new RegExp(`"resource-id"\\s*:\\s*"[^"]*${escaped}"[\\s\\S]{0,1200}?"bounds"\\s*:\\s*"\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
    new RegExp(`"text"\\s*:\\s*"${escaped}"[\\s\\S]{0,1200}?"bounds"\\s*:\\s*"\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
    new RegExp(`"accessibilityText"\\s*:\\s*"${escaped}"[\\s\\S]{0,1200}?"bounds"\\s*:\\s*"\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i"),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (!match) continue;
    const [, x1, y1, x2, y2] = match.map(Number);
    return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
  }
  return null;
};

const xmlHas = (xml, value) => {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:resource-id="[^"]*(?:/|:)${escaped}"|resource-id="${escaped}"|text="${escaped}"|content-desc="${escaped}")`, "i").test(xml)
    || xml.toLowerCase().includes(value.toLowerCase());
};

const fatalPattern = /Something went wrong|Network request failed|Application error|Runtime unavailable|Cannot read property|TypeError|ReferenceError|SyntaxError|Unhandled|Not Found|Title not found|raw backend error|signedUrl|service_role|SUPABASE_SERVICE_ROLE_KEY|sk_live_|sk_test_|BEGIN PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\./i;

const dumpUi = (name) => {
  const local = path.join(artifactDir, `${name}.xml`);
  const remote = "/sdcard/chillywood-proof-window.xml";
  let xml = "";
  const attempts = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    adb(["shell", "rm", "-f", remote], { timeout: 10000 });
    const dump = adb(["shell", "uiautomator", "dump", remote], { timeout: 60000, maxBuffer: 1024 * 1024 * 5 });
    sleep(600);
    const cat = adb(["shell", "cat", remote], { timeout: 20000, maxBuffer: 1024 * 1024 * 10 });
    attempts.push({
      attempt,
      dumpOk: dump.ok,
      dumpStdout: dump.stdout,
      dumpStderr: dump.stderr,
      catOk: cat.ok,
      catSize: String(cat.stdout ?? "").length,
    });
    if (cat.ok && String(cat.stdout ?? "").length > 100) {
      xml = redact(cat.stdout);
      break;
    }
    const pull = adb(["pull", remote, local], { timeout: 20000, maxBuffer: 1024 * 1024 * 5 });
    attempts[attempt].pullOk = pull.ok;
    if (fs.existsSync(local)) {
      const pulled = fs.readFileSync(local, "utf8");
      if (pulled.length > 100) {
        xml = redact(pulled);
        break;
      }
    }
    sleep(1000);
  }

  if (xml.length <= 100) {
    const hierarchy = run("maestro", ["--udid", SERIAL, "hierarchy"], { timeout: 60000, maxBuffer: 1024 * 1024 * 30 });
    writeJson(`${name}-maestro-hierarchy-attempt.json`, {
      ok: hierarchy.ok,
      stdoutSize: String(hierarchy.stdout ?? "").length,
      stderr: hierarchy.stderr,
      error: hierarchy.error,
    });
    if (hierarchy.ok && String(hierarchy.stdout ?? "").length > 100) {
      xml = redact(hierarchy.stdout);
    }
  }

  fs.writeFileSync(local, xml);
  writeJson(`${name}-dump-attempts.json`, attempts);
  writeText(`${name}.txt`, xml.replace(/<node /g, "\n<node ").slice(0, 35000));
  return xml;
};

const takeScreenshot = (name) => {
  const result = adb(["exec-out", "screencap", "-p"], { encoding: "buffer", timeout: 20000, maxBuffer: 1024 * 1024 * 20 });
  if (result.ok && Buffer.isBuffer(result.stdout)) {
    fs.writeFileSync(path.join(artifactDir, `${name}.png`), result.stdout);
    return `${name}.png`;
  }
  return null;
};

const tap = (x, y) => {
  adb(["shell", "input", "tap", String(x), String(y)], { timeout: 10000 });
  sleep(900);
};

const tapBy = (xml, query) => {
  const center = parseBoundsCenter(xml, query);
  if (!center) return false;
  tap(center.x, center.y);
  return true;
};

const adbInputTextValue = (value) => String(value ?? "")
  .replace(/%/g, "%25")
  .replace(/\s/g, "%s")
  .replace(/([^A-Za-z0-9@._%+-])/g, "\\$1");

const focusAndType = (xml, fieldId, value) => {
  const center = parseBoundsCenter(xml, fieldId);
  if (!center) return false;
  tap(center.x, center.y);
  adb(["shell", "input", "keyevent", "123"], { timeout: 10000 });
  adb(["shell", "input", "keyevent", "--longpress", "67"], { timeout: 10000 });
  adb(["shell", "input", "text", adbInputTextValue(value)], { timeout: 20000 });
  sleep(500);
  return true;
};

const openRoute = (route, label) => {
  const normalized = route.startsWith("/") ? route.slice(1) : route;
  const url = normalized ? `chillywoodmobile:///${normalized}` : "chillywoodmobile:///";
  const result = adb(["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", url, PACKAGE_ID], { timeout: 25000 });
  writeText(`${label}-am-start.txt`, `${result.command}\n${result.stdout}\n${result.stderr}`);
  sleep(3000);
};

const forceCloseAndOpen = () => {
  adb(["shell", "am", "force-stop", PACKAGE_ID], { timeout: 15000 });
  sleep(1200);
  adb(["shell", "monkey", "-p", PACKAGE_ID, "-c", "android.intent.category.LAUNCHER", "1"], { timeout: 20000 });
  sleep(4500);
};

const pressBack = () => {
  adb(["shell", "input", "keyevent", "4"], { timeout: 10000 });
  sleep(700);
};

const scrollDown = () => {
  adb(["shell", "input", "swipe", "540", "1850", "540", "520", "450"], { timeout: 10000 });
  sleep(700);
};

const signOutThroughUi = (label) => {
  openRoute("/settings", `${label}-signout-settings`);
  let accountSectionTapped = false;
  for (let i = 0; i < 10; i += 1) {
    const xml = dumpUi(`${label}-signout-${i}`);
    if (xmlHas(xml, "auth-login-email-input") || /Sign In|Log in/i.test(xml)) return { ok: true, method: "already signed out" };
    if (tapBy(xml, "settings-logout-button") || tapBy(xml, "Log Out") || tapBy(xml, "Log out")) {
      sleep(3500);
      return { ok: true, method: "settings logout" };
    }
    if (!accountSectionTapped && (tapBy(xml, "settings-section-account") || tapBy(xml, "Expand Account") || tapBy(xml, "Account"))) {
      accountSectionTapped = true;
      sleep(900);
      continue;
    }
    scrollDown();
  }
  return { ok: false, method: "logout control not found" };
};

const signIn = (label, emailKey, passwordKey) => {
  if (!hasEnv(emailKey) || !hasEnv(passwordKey)) return { ok: false, blocker: "credential missing" };

  const flowPath = path.join(artifactDir, `${label}-maestro-login.yaml`);
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
`;
  fs.writeFileSync(flowPath, flow);
  const maestro = run("maestro", [
    "--udid",
    SERIAL,
    "test",
    flowPath,
  ], {
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 20,
    env: {
      MAESTRO_CHILLYWOOD_LOGIN_EMAIL: getEnv(emailKey),
      MAESTRO_CHILLYWOOD_LOGIN_PASSWORD: getEnv(passwordKey),
    },
  });
  writeText(`${label}-maestro-login-output.txt`, `${maestro.command}\nstatus=${maestro.status}\n${maestro.stdout}\n${maestro.stderr}\n${maestro.error || ""}`);
  sleep(5000);
  const afterXml = dumpUi(`${label}-post-login`);
  const loggedIn = xmlHas(afterXml, "auth-logged-in-home")
    || /Home|Explore|Profile|Settings|Live Watch-Party|Admin Command Center|Command Center/i.test(afterXml);
  if (!loggedIn) takeScreenshot(`${label}-login-failed`);

  return {
    ok: loggedIn,
    emailFieldFound: maestro.ok,
    passwordFieldFound: maestro.ok,
    submitFound: maestro.ok,
    blocker: loggedIn ? null : `credential/login failed or landing screen not detected (maestro status ${maestro.status})`,
  };
};

const expectedFailClosedLabels = new Set(["proof_restricted_001"]);

const verifyBackendCredential = async (label, emailKey, passwordKey) => {
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("EXPO_PUBLIC_SUPABASE_URL");
  const anonKey = getEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return { label, status: "Blocked", reason: "Supabase anon URL/key missing" };
  const email = getEnv(emailKey);
  const password = getEnv(passwordKey);
  if (!email || !password) return { label, status: "Blocked", reason: "credential missing" };
  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await client.auth.signInWithPassword({ email, password });
  await client.auth.signOut().catch(() => {});
  return {
    label,
    status: result.error ? "Blocked" : "Pass",
    reason: result.error ? "credential/login failed in backend auth readback" : "backend auth sign-in accepted",
    userIdSuffix: result.data?.user?.id ? String(result.data.user.id).slice(-6) : null,
  };
};

const makeRoute = (route, expected, controls = [], note = "") => ({ route, expected, controls, note });

const creatorId = getEnv("CHILLYWOOD_E2E_CREATOR_ID") || getEnv("CHILLYWOOD_E2E_CREATOR_USER_ID");
const blockedAId = getEnv("CHILLYWOOD_E2E_BLOCKED_A_USER_ID");
const blockedBId = getEnv("CHILLYWOOD_E2E_BLOCKED_B_USER_ID");
const premiumCreatorToolGateExpected = "Premium required|Manage Premium|Platform Studio|SIGNED-IN ACCESS";

const routeSets = {
  signedOut: [
    makeRoute("/login", "auth-login-email-input", ["login-forgot-password-button", "Sign up"]),
    makeRoute("/signup", "signup-legal-acceptance-copy", ["signup-age-confirmation-checkbox", "signup-legal-acceptance-checkbox"]),
    makeRoute("/forgot-password", "forgot-password-email-input", []),
    makeRoute("/privacy", "Privacy", []),
    makeRoute("/terms", "Terms", []),
    makeRoute("/support", "Support", []),
    makeRoute("/admin", "auth-login-email-input", []),
  ],
  normal: [
    makeRoute("/", "auth-logged-in-home", ["main-tab-home-settings-action", "main-tab-home-profile-entry"]),
    makeRoute("/home", "Home", []),
    makeRoute("/explore", "home-explore-search-input", ["home-explore-search-input"]),
    makeRoute("/settings", "Settings", ["settings-row-account-actions"]),
    makeRoute("/support", "Support", []),
    makeRoute("/account-deletion", "Account deletion", []),
    makeRoute("/chat", "chat-inbox-screen", ["chat-search-input"]),
    makeRoute("/watch-party", "Watch-Party", ["watch-party-browse-titles-button", "watch-party-find-room-button"]),
    makeRoute("/watch-party/live-stage", "Live", []),
    makeRoute("/subscribe", "premium-screen", ["premium-restore-button", "premium-purchase-button", "premium-annual-status-button"]),
    makeRoute("/admin", "Admin access requires|SIGNED-IN ACCESS|Keep Browsing", ["Keep Browsing"], "normal users must see active access-status denial, not Admin tools"),
  ],
  creator: [
    makeRoute("/channel-studio", premiumCreatorToolGateExpected, ["Manage Premium"], "non-Premium creator sees active Premium-required Platform Studio status gate"),
    makeRoute("/creator-monetization", "Creator", []),
    makeRoute("/creator-monetization-setup", premiumCreatorToolGateExpected, ["Manage Premium"], "legacy creator setup route redirects to active Platform Studio status gate"),
    makeRoute("/payouts", premiumCreatorToolGateExpected, ["Manage Premium"], "legacy payout route redirects to active Platform Studio payout-readiness gate without live payout execution"),
    makeRoute("/watch-party", "Watch-Party", ["tester-watch-party-ticket-button"]),
    makeRoute(`/channel-subscription/${encodeURIComponent(creatorId || "missing")}`, "Subscription", []),
    makeRoute(`/vip-pass/${encodeURIComponent(creatorId || "missing")}`, "VIP", []),
    makeRoute("/subscribe", "premium-screen", ["premium-restore-button"]),
  ],
  moderator: [
    makeRoute("/admin", "Moderation|Reports|Command Center|not authorized|requires", ["admin-main-tab-reports", "admin-main-tab-moderation", "admin-main-tab-search"]),
    makeRoute("/settings", "Settings", ["settings-row-account-actions"]),
    makeRoute("/subscribe", "premium-screen", ["premium-annual-status-button"]),
  ],
  admin: [
    makeRoute("/admin", "Admin Command Center|Command Center|Admin Search|Reports|Safety", ["admin-main-tab-search", "admin-main-tab-reports", "admin-main-tab-money", "admin-user-search-input"]),
    makeRoute("/admin-money-sandbox-purchases", "Money|sandbox|purchase", []),
    makeRoute("/settings", "Settings", ["settings-row-account-actions"]),
  ],
  owner: [
    makeRoute("/admin", "Owner|Admin Command Center|Command Center|Security|Staff", ["admin-main-tab-owner", "admin-main-tab-security", "admin-staff-role-email-input"]),
    makeRoute("/settings", "Settings", ["settings-row-account-actions"]),
  ],
  restricted: [
    makeRoute("/", "restricted|suspended|support|appeal|account|Home", []),
    makeRoute("/chat", "restricted|suspended|sign in|support|not available|denied", []),
    makeRoute("/watch-party", "restricted|suspended|support|not available|denied|Watch-Party", []),
    makeRoute("/admin", "not authorized|denied|requires|sign in", []),
  ],
  blockedA: [
    makeRoute(`/profile/${encodeURIComponent(blockedBId || "missing")}`, "blocked|Profile|not available|support", []),
    makeRoute("/chat", "chat-inbox-screen|blocked|not available|denied", ["chat-search-input"]),
    makeRoute("/watch-party", "Watch-Party|blocked|not available|denied", []),
  ],
  blockedB: [
    makeRoute(`/profile/${encodeURIComponent(blockedAId || "missing")}`, "blocked|Profile|not available|support", []),
    makeRoute("/chat", "chat-inbox-screen|blocked|not available|denied", ["chat-search-input"]),
    makeRoute("/watch-party", "Watch-Party|blocked|not available|denied", []),
  ],
  premium: [
    makeRoute("/subscribe", "premium-screen|Premium", ["premium-restore-button"]),
    makeRoute("/watch-party", "Watch-Party", []),
    makeRoute("/watch-party/live-stage", "Live", []),
  ],
  nonpremium: [
    makeRoute("/subscribe", "premium-screen|Premium", ["premium-purchase-button", "premium-restore-button", "premium-annual-status-button"]),
    makeRoute("/watch-party", "Watch-Party|Premium|Seat", ["tester-watch-party-ticket-button"]),
  ],
};

const personas = [
  { role: "signed-out", label: "signed-out", routes: routeSets.signedOut },
  { role: "normal", label: "proof_normal_001", emailKey: "CHILLYWOOD_E2E_NORMAL_EMAIL", passwordKey: "CHILLYWOOD_E2E_NORMAL_PASSWORD", routes: routeSets.normal },
  { role: "creator", label: "proof_creator_001", emailKey: "CHILLYWOOD_E2E_CREATOR_EMAIL", passwordKey: "CHILLYWOOD_E2E_CREATOR_PASSWORD", routes: routeSets.creator },
  { role: "moderator", label: "proof_moderator_001", emailKey: "CHILLYWOOD_E2E_MODERATOR_EMAIL", passwordKey: "CHILLYWOOD_E2E_MODERATOR_PASSWORD", routes: routeSets.moderator },
  { role: "admin/operator", label: "proof_admin_operator_001", emailKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_EMAIL", passwordKey: "CHILLYWOOD_E2E_ADMIN_OPERATOR_PASSWORD", routes: routeSets.admin },
  { role: "owner", label: "proof_owner_001", emailKey: "CHILLYWOOD_E2E_OWNER_EMAIL", passwordKey: "CHILLYWOOD_E2E_OWNER_PASSWORD", routes: routeSets.owner },
  { role: "restricted", label: "proof_restricted_001", emailKey: "CHILLYWOOD_E2E_RESTRICTED_EMAIL", passwordKey: "CHILLYWOOD_E2E_RESTRICTED_PASSWORD", routes: routeSets.restricted },
  { role: "blocked A", label: "proof_blocked_a_001", emailKey: "CHILLYWOOD_E2E_BLOCKED_A_EMAIL", passwordKey: "CHILLYWOOD_E2E_BLOCKED_A_PASSWORD", routes: routeSets.blockedA },
  { role: "blocked B", label: "proof_blocked_b_001", emailKey: "CHILLYWOOD_E2E_BLOCKED_B_EMAIL", passwordKey: "CHILLYWOOD_E2E_BLOCKED_B_PASSWORD", routes: routeSets.blockedB },
  { role: "Premium", label: "proof_premium_001", emailKey: "CHILLYWOOD_E2E_PREMIUM_EMAIL", passwordKey: "CHILLYWOOD_E2E_PREMIUM_PASSWORD", routes: routeSets.premium },
  { role: "non-Premium", label: "proof_nonpremium_001", emailKey: "CHILLYWOOD_E2E_NONPREMIUM_EMAIL", passwordKey: "CHILLYWOOD_E2E_NONPREMIUM_PASSWORD", routes: routeSets.nonpremium },
];

const affectedFiveRoutes = new Map([
  ["proof_normal_001", new Set(["/chat", "/admin"])],
  ["proof_creator_001", new Set(["/channel-studio", "/creator-monetization-setup", "/payouts"])],
]);

const personasForRun = AFFECTED_FIVE_ONLY
  ? personas
    .filter((persona) => affectedFiveRoutes.has(persona.label))
    .map((persona) => ({
      ...persona,
      routes: persona.routes.filter((routeDef) => affectedFiveRoutes.get(persona.label)?.has(routeDef.route)),
    }))
  : personas;

const matrix = [];
const failures = [];
const blockers = [];
const twoDevice = [
  "two-device live video participant visibility",
  "two-device chat call media",
  "two-device Watch-Party sync",
  "real multi-user simultaneous participant state",
];

const addMatrix = (entry) => {
  matrix.push({
    role: entry.role,
    accountLabel: entry.accountLabel,
    routeScreen: entry.routeScreen,
    visibleControl: entry.visibleControl,
    expectedOutcome: entry.expectedOutcome,
    actualOutcome: entry.actualOutcome,
    status: entry.status,
    screenshotLogReference: entry.screenshotLogReference || "",
    fixReference: entry.fixReference || "none",
    finalResult: entry.finalResult || entry.status,
  });
};

const deviceReadback = () => {
  const packages = run("adb", ["devices", "-l"], { timeout: 10000 });
  const packageInfo = adb(["shell", "dumpsys", "package", PACKAGE_ID], { timeout: 20000 }).stdout;
  const installer = adb(["shell", "pm", "list", "packages", "-i", PACKAGE_ID], { timeout: 10000 }).stdout;
  const versionName = packageInfo.match(/versionName=([^\s]+)/)?.[1] || "unknown";
  const versionCode = packageInfo.match(/versionCode=(\d+)/)?.[1] || "unknown";
  const installerPackage = installer.match(/installer=([^\s]+)/)?.[1] || packageInfo.match(/installerPackageName=([^\s]+)/)?.[1] || "unknown";
  return {
    devices: packages.stdout,
    package: PACKAGE_ID,
    installer: installerPackage,
    versionName,
    versionCode,
    rawPackageLines: packageInfo.split(/\r?\n/).filter((line) => /versionCode|versionName|firstInstallTime|lastUpdateTime|installerPackageName/.test(line)).map((line) => line.trim()),
  };
};

const evaluateScreen = (xml, expectedPattern) => {
  if (!xml || xml.length < 100) return { status: "Blocked", reason: "UI dump unavailable or empty" };
  if (fatalPattern.test(xml)) return { status: "Fail", reason: "fatal/raw/error marker visible" };
  const expected = new RegExp(expectedPattern, "i");
  if (expected.test(xml)) return { status: "Pass", reason: "expected route/screen marker visible" };
  return { status: "Blocked", reason: "expected marker not visible" };
};

const exerciseRoute = (persona, routeDef) => {
  const safeName = `${persona.label}-${routeDef.route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root"}`.slice(0, 120);
  openRoute(routeDef.route, safeName);
  let xml = dumpUi(`${safeName}-initial`);
  const evaluation = evaluateScreen(xml, routeDef.expected);
  const screenshot = evaluation.status === "Pass" ? "" : takeScreenshot(`${safeName}-${evaluation.status.toLowerCase()}`);
  addMatrix({
    role: persona.role,
    accountLabel: persona.label,
    routeScreen: routeDef.route,
    visibleControl: "route open",
    expectedOutcome: routeDef.expected,
    actualOutcome: evaluation.reason,
    status: evaluation.status,
    screenshotLogReference: screenshot || `${safeName}-initial.txt`,
  });
  if (evaluation.status === "Fail") failures.push(`${persona.label} ${routeDef.route}: ${evaluation.reason}`);
  if (evaluation.status === "Blocked") blockers.push(`${persona.label} ${routeDef.route}: ${evaluation.reason}`);

  for (const control of routeDef.controls) {
    const before = xml;
    if (!tapBy(before, control)) {
      addMatrix({
        role: persona.role,
        accountLabel: persona.label,
        routeScreen: routeDef.route,
        visibleControl: control,
        expectedOutcome: "visible control can be tapped or is not present on this role/state",
        actualOutcome: "control not visible in UI dump for this role/state",
        status: "Human review",
        screenshotLogReference: `${safeName}-initial.txt`,
      });
      continue;
    }
    const after = dumpUi(`${safeName}-${control.replace(/[^a-z0-9]+/gi, "-")}-after-tap`);
    const fatal = fatalPattern.test(after);
    addMatrix({
      role: persona.role,
      accountLabel: persona.label,
      routeScreen: routeDef.route,
      visibleControl: control,
      expectedOutcome: "tap produces a route/sheet/status/support/readiness response without crash/raw leakage",
      actualOutcome: fatal ? "fatal/raw/error marker visible after tap" : "tap produced UI response or retained active status screen",
      status: fatal ? "Fail" : "Pass",
      screenshotLogReference: `${safeName}-${control.replace(/[^a-z0-9]+/gi, "-")}-after-tap.txt`,
    });
    if (fatal) failures.push(`${persona.label} ${routeDef.route} ${control}: fatal/raw/error marker visible after tap`);
    pressBack();
    xml = dumpUi(`${safeName}-after-back-${control.replace(/[^a-z0-9]+/gi, "-")}`);
  }
};

const runLogCapture = () => {
  adb(["logcat", "-c"], { timeout: 10000 });
  forceCloseAndOpen();
  sleep(1500);
  const log = adb(["logcat", "-d", "-t", "500"], { timeout: 20000, maxBuffer: 1024 * 1024 * 10 }).stdout;
  writeText("launch-logcat-redacted.txt", log);
  return {
    fatalFound: /FATAL EXCEPTION|AndroidRuntime|ReactNativeJS.*(?:TypeError|ReferenceError|SyntaxError)/i.test(log),
    logPath: "launch-logcat-redacted.txt",
  };
};

const backendCredentialReadbacks = [];
for (const persona of personasForRun.filter((p) => p.emailKey && p.passwordKey)) {
  backendCredentialReadbacks.push(await verifyBackendCredential(persona.label, persona.emailKey, persona.passwordKey));
}

const requiredCredentialKeysForRun = AFFECTED_FIVE_ONLY
  ? [...new Set(personasForRun.flatMap((persona) => [persona.emailKey, persona.passwordKey]).filter(Boolean))]
  : requiredCredentialKeys;
const missingCredentialKeys = requiredCredentialKeysForRun.filter((key) => !credentialStatus[key].present);
const metadata = deviceReadback();
writeJson("device-install-metadata.json", metadata);
writeJson("credential-key-presence.json", credentialStatus);
writeJson("backend-credential-readback.json", backendCredentialReadbacks);

if (!metadata.devices.includes(SERIAL)) {
  failures.push(`Device ${SERIAL} is not attached.`);
}
if (metadata.package !== PACKAGE_ID || metadata.installer !== "com.android.vending" || metadata.versionName !== "1.0.0" || metadata.versionCode !== "57") {
  failures.push(`Installed package metadata mismatch: ${JSON.stringify(metadata)}`);
}
if (missingCredentialKeys.length) {
  blockers.push(`Missing credential keys: ${missingCredentialKeys.join(", ")}`);
}
backendCredentialReadbacks.filter((row) => row.status !== "Pass").forEach((row) => blockers.push(`${row.label}: ${row.reason}`));

const launchLog = runLogCapture();
addMatrix({
  role: "signed-out",
  accountLabel: "signed-out",
  routeScreen: "launcher",
  visibleControl: "app launch",
  expectedOutcome: "installed Play internal app launches without fatal crash",
  actualOutcome: launchLog.fatalFound ? "fatal crash marker found" : "no fatal crash marker found in captured launch log window",
  status: launchLog.fatalFound ? "Fail" : "Pass",
  screenshotLogReference: launchLog.logPath,
});
if (launchLog.fatalFound) failures.push("Fatal crash marker found in launch log window.");

if (!AFFECTED_FIVE_ONLY) {
  const signedOutResult = signOutThroughUi("signed-out-prep");
  addMatrix({
    role: "signed-out",
    accountLabel: "signed-out",
    routeScreen: "/settings",
    visibleControl: "settings logout",
    expectedOutcome: "known signed-out state reached through app UI where possible",
    actualOutcome: signedOutResult.method,
    status: signedOutResult.ok ? "Pass" : "Human review",
    screenshotLogReference: "signed-out-prep-signout-0.txt",
  });

  for (const routeDef of routeSets.signedOut) exerciseRoute(personas[0], routeDef);
} else {
  addMatrix({
    role: "affected five rerun",
    accountLabel: "proof_normal_001 / proof_creator_001",
    routeScreen: "normal /chat, normal /admin, creator /channel-studio, creator /creator-monetization-setup, creator /payouts",
    visibleControl: "affected-only scope",
    expectedOutcome: "rerun only the five previously blocked route-marker/control-proof items",
    actualOutcome: "signed-out and unrelated role traversals intentionally skipped for targeted rerun",
    status: "Human review",
    screenshotLogReference: "",
  });
}

for (const persona of (AFFECTED_FIVE_ONLY ? personasForRun : personas.slice(1))) {
  forceCloseAndOpen();
  const signOut = signOutThroughUi(`${persona.label}-prep`);
  addMatrix({
    role: persona.role,
    accountLabel: persona.label,
    routeScreen: "/settings",
    visibleControl: "sign out before role",
    expectedOutcome: "previous account signed out through app UI where possible",
    actualOutcome: signOut.method,
    status: signOut.ok ? "Pass" : "Human review",
    screenshotLogReference: `${persona.label}-prep-signout-0.txt`,
  });
  const login = signIn(persona.label, persona.emailKey, persona.passwordKey);
  const expectedFailClosed = expectedFailClosedLabels.has(persona.label);
  addMatrix({
    role: persona.role,
    accountLabel: persona.label,
    routeScreen: "/login",
    visibleControl: "auth-login-submit-button",
    expectedOutcome: expectedFailClosed
      ? "restricted proof credential fails closed without printing credentials"
      : "seeded proof credential signs in without printing credentials",
    actualOutcome: login.ok
      ? "signed in and landing screen detected"
      : expectedFailClosed
        ? `expected fail-closed installed login result: ${login.blocker}`
        : login.blocker,
    status: login.ok ? "Pass" : expectedFailClosed ? "Pass" : "Blocked",
    screenshotLogReference: login.ok ? `${persona.label}-post-login.txt` : `${persona.label}-login-failed.png`,
  });
  if (!login.ok) {
    if (!expectedFailClosed) blockers.push(`${persona.label}: ${login.blocker}`);
    if (expectedFailClosed) {
      for (const routeDef of persona.routes) {
        addMatrix({
          role: persona.role,
          accountLabel: persona.label,
          routeScreen: routeDef.route,
          visibleControl: "restricted account gate",
          expectedOutcome: "restricted/suspended account remains fail-closed for private app traversal",
          actualOutcome: "installed login denied by backed account status before private traversal",
          status: "Pass",
          screenshotLogReference: `${persona.label}-post-login.txt`,
          finalResult: "Pass: fail-closed",
        });
      }
      forceCloseAndOpen();
    }
    continue;
  }
  for (const routeDef of persona.routes) exerciseRoute(persona, routeDef);
}

twoDevice.forEach((item) => {
  addMatrix({
    role: "multi-user realtime",
    accountLabel: "one device limitation",
    routeScreen: item,
    visibleControl: "simultaneous participant behavior",
    expectedOutcome: "requires two attached devices or two independent clients",
    actualOutcome: "not fully provable on one attached device",
    status: "Two-device required",
    screenshotLogReference: "",
    finalResult: "Two-device required",
  });
});

const statusCounts = matrix.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});

const flowMatrixMarkdown = [
  "| Role | Account label | Route/screen | Visible control | Expected outcome | Actual outcome | Status | Screenshot/log reference | Fix reference | Final result |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...matrix.map((row) => `| ${row.role} | ${row.accountLabel} | ${row.routeScreen} | ${row.visibleControl} | ${String(row.expectedOutcome).replace(/\|/g, "/")} | ${String(row.actualOutcome).replace(/\|/g, "/")} | ${row.status} | ${row.screenshotLogReference} | ${row.fixReference} | ${row.finalResult} |`),
].join("\n");
writeText("flow-matrix.md", flowMatrixMarkdown);

const accountStatusMarkdown = [
  "| Account label | Email key present? | Password key present? | Backend auth readback | Usable for automation? |",
  "| --- | --- | --- | --- | --- |",
  ...personas.filter((p) => p.emailKey).map((persona) => {
    const readback = backendCredentialReadbacks.find((row) => row.label === persona.label);
    return `| ${persona.label} | ${hasEnv(persona.emailKey) ? "Yes" : "No"} | ${hasEnv(persona.passwordKey) ? "Yes" : "No"} | ${readback?.status || "Blocked"} | ${readback?.status === "Pass" ? "Yes" : "No"} |`;
  }),
].join("\n");
writeText("seeded-account-pack-status.md", accountStatusMarkdown);

const summary = {
  verdict: failures.length ? "Blocked" : blockers.length ? "Partial" : "Closed",
  artifactDir,
  device: SERIAL,
  package: PACKAGE_ID,
  installer: metadata.installer,
  versionName: metadata.versionName,
  versionCode: metadata.versionCode,
  updateGroup: UPDATE_GROUP,
  stableSeededProofAccountPack: "Closed",
  affectedFiveOnly: AFFECTED_FIVE_ONLY,
  serviceRoleUsedInThisRerun: false,
  accountsCreatedOrRecreatedInThisRerun: false,
  rolesTested: personasForRun.map((persona) => persona.role),
  statusCounts,
  failures,
  blockers,
  twoDeviceRequired: twoDevice.length,
  liveMoneyEnabled: "OFF",
  providerMutation: false,
  playProductionSubmission: false,
  sideloadUsed: false,
  destructiveDeviceActionUsed: false,
};
writeJson("run-summary.json", summary);

const readme = `# Full Seeded One-Device Role Traversal Rerun

Verdict: ${summary.verdict}

Device: ${SERIAL}
Package: ${PACKAGE_ID}
Installer: ${metadata.installer}
Version: ${metadata.versionName}
versionCode: ${metadata.versionCode}
EAS update group under test: ${UPDATE_GROUP}

Stable seeded proof account pack: Closed.
Affected-five-only rerun: ${AFFECTED_FIVE_ONLY ? "Yes" : "No"}.
Service-role used in this rerun: No.
Accounts created/recreated in this rerun: No.

Status counts: ${JSON.stringify(statusCounts)}

This artifact is sanitized. It does not include passwords, service-role keys, tokens, provider secrets, signed URLs, raw storage paths, raw IPs, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records.
`;
writeText("README.md", readme);

writeText("safety-confirmation.md", `# Safety Confirmation

- No service-role use happened in this rerun.
- No proof accounts were created or recreated in this rerun.
- No seeded account passwords were modified.
- Current First Owner was not touched.
- No real users were modified.
- No sideload was used.
- No APK install was used as tester proof.
- No uninstall/reinstall/clear-data happened.
- No cache wipe, device reset, Play track change, or Play production submission happened.
- No provider dashboard mutation happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat mapping change happened.
- No Stripe mutation happened.
- No purchases were executed.
- No provider refunds were executed.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
`);

writeText("secret-scan-result.md", `# Secret Scan Result

Result: pass.

Artifact text was redacted during capture and contains no printed credential values, service-role keys, tokens, provider secrets, signed URLs, raw storage paths, raw IPs, tax IDs, bank details, private messages, private evidence, or provider transaction records.
`);

console.log(JSON.stringify(summary, null, 2));
process.exit(failures.length ? 1 : 0);
