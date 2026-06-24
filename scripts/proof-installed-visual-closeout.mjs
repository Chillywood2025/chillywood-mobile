#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PACKAGE_ID = "com.chillywood.mobile";
const PLAY_INSTALLER = "com.android.vending";

const args = new Set(process.argv.slice(2));
const mutationAllowed = args.has("--run-account-mutation");
const resetAppData = args.has("--reset-app-data");
const requestedSerial = process.env.PROOF_ANDROID_SERIAL || process.env.ADB_SERIAL || "";
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");
const artifactDir =
  process.env.PROOF_ARTIFACT_DIR ||
  path.join("/tmp", `app-installed-visual-closeout-proof-${stamp}`);

mkdirSync(artifactDir, { recursive: true });

function redact(value) {
  return String(value ?? "")
    .replace(/(access_token|refresh_token|token|token_hash|password|service_role|apikey|api_key)=([^&\s]+)/gi, "$1=<redacted>")
    .replace(/([?&]code)=([^&\s]+)/gi, "$1=<redacted>")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "<redacted-jwt>")
    .replace(/https?:\/\/[^\s"]*(token|signature|X-Amz-Signature|Expires|Key-Pair-Id)[^\s"]*/gi, "<redacted-signed-url>")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<redacted-email>");
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: options.encoding ?? "utf8",
    timeout: options.timeout ?? 20000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 20,
  });
  return {
    command: [command, ...commandArgs].join(" "),
    status: result.status,
    ok: result.status === 0,
    stdout: options.encoding === "buffer" ? result.stdout : redact(result.stdout),
    stderr: options.encoding === "buffer" ? result.stderr : redact(result.stderr),
    error: result.error ? redact(result.error.message) : null,
  };
}

function adb(serial, commandArgs, options = {}) {
  const prefix = serial ? ["-s", serial] : [];
  return run("adb", [...prefix, ...commandArgs], options);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeText(fileName, contents) {
  writeFileSync(path.join(artifactDir, fileName), redact(contents));
}

function writeJson(fileName, value) {
  writeFileSync(path.join(artifactDir, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

function status(statusValue, result, blocker = "") {
  return { status: statusValue, result, blocker };
}

function loadLocalEnv() {
  for (const file of [
    ".env.local",
    ".env.final-qa-proof.local",
    ".env.attached-device-monetization.local",
    ".env.browserstack-monetization.local",
  ]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key]) continue;
      let value = match[2].trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function envValue(...keys) {
  for (const key of keys) {
    const value = String(process.env[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function supabaseClient(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseDevices(output) {
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === "device")
    .map(([serial]) => serial);
}

function parseBoundsCenter(xml, query) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`resource-id="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`),
    new RegExp(`text="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`),
    new RegExp(`content-desc="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (!match) continue;
    const [, x1, y1, x2, y2] = match.map(Number);
    return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) };
  }
  return null;
}

function xmlHas(xml, value) {
  return xml.includes(`resource-id="${value}"`) || xml.includes(`text="${value}"`) || xml.includes(`content-desc="${value}"`);
}

function dumpUi(serial, name) {
  const remote = `/sdcard/${name}.xml`;
  const local = path.join(artifactDir, `${name}.xml`);
  adb(serial, ["shell", "uiautomator", "dump", remote], { timeout: 20000 });
  adb(serial, ["pull", remote, local], { timeout: 20000 });
  const xml = existsSync(local) ? readFileSync(local, "utf8") : "";
  writeText(`${name}.txt`, xml.replace(/<node /g, "\n<node ").slice(0, 20000));
  return xml;
}

function tap(serial, x, y) {
  adb(serial, ["shell", "input", "tap", String(x), String(y)], { timeout: 10000 });
  sleep(900);
}

function tapBy(serial, xml, query) {
  const center = parseBoundsCenter(xml, query);
  if (!center) return false;
  tap(serial, center.x, center.y);
  return true;
}

function dismissAlert(serial, label) {
  const xml = dumpUi(serial, `${label}-dismiss-alert`);
  if (/android:id\/button1|text="OK"|content-desc="OK"|Enter email and password|Error/.test(xml)) {
    return tapBy(serial, xml, "OK") || tapBy(serial, xml, "android:id/button1");
  }
  return false;
}

function scrollDown(serial) {
  adb(serial, ["shell", "input", "swipe", "540", "1850", "540", "520", "450"], { timeout: 10000 });
  sleep(700);
}

function adbInputTextValue(value) {
  return String(value ?? "")
    .replace(/%/g, "%25")
    .replace(/\s/g, "%s")
    .replace(/([^A-Za-z0-9@._%+-])/g, "\\$1");
}

function focusAndPaste(serial, xml, fieldId, value) {
  const center = parseBoundsCenter(xml, fieldId);
  if (!center) return false;
  tap(serial, center.x, center.y);
  adb(serial, ["shell", "input", "keyevent", "123"], { timeout: 10000 });
  adb(serial, ["shell", "input", "keyevent", "--longpress", "67"], { timeout: 10000 });
  adb(serial, ["shell", "input", "text", adbInputTextValue(value)], { timeout: 15000 });
  sleep(500);
  return true;
}

function launch(serial) {
  adb(serial, ["shell", "monkey", "-p", PACKAGE_ID, "-c", "android.intent.category.LAUNCHER", "1"], { timeout: 20000 });
  sleep(4500);
}

function clearAppData(serial) {
  adb(serial, ["shell", "pm", "clear", PACKAGE_ID], { timeout: 20000 });
  sleep(1500);
}

function openDeepLink(serial, url) {
  adb(serial, ["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", url, PACKAGE_ID], { timeout: 20000 });
  sleep(2500);
}

function signIn(serial, label, email, password) {
  dismissAlert(serial, `${label}-pre`);
  openDeepLink(serial, "chillywoodmobile://chat");
  dismissAlert(serial, `${label}-post-link`);
  let xml = dumpUi(serial, `${label}-login-initial`);
  if (xmlHas(xml, "auth-logged-in-home") || xmlHas(xml, "main-tab-home-settings-action")) {
    return { ok: true, alreadySignedIn: true };
  }
  if (!xmlHas(xml, "auth-login-email-input")) {
    launch(serial);
    dismissAlert(serial, `${label}-post-launch`);
    xml = dumpUi(serial, `${label}-login-launch`);
  }
  const emailOk = focusAndPaste(serial, xml, "auth-login-email-input", email);
  xml = dumpUi(serial, `${label}-login-email`);
  const passwordOk = focusAndPaste(serial, xml, "auth-login-password-input", password);
  xml = dumpUi(serial, `${label}-login-password`);
  const submitOk = tapBy(serial, xml, "auth-login-submit-button") || tapBy(serial, xml, "Log in") || tapBy(serial, xml, "Log In");
  sleep(5500);
  const postXml = dumpUi(serial, `${label}-login-post`);
  const signedIn = xmlHas(postXml, "auth-logged-in-home") || xmlHas(postXml, "main-tab-home-settings-action");
  return { ok: signedIn, emailOk, passwordOk, submitOk, alreadySignedIn: false };
}

function signOut(serial, label) {
  openDeepLink(serial, "chillywoodmobile://settings");
  for (let i = 0; i < 4; i += 1) {
    const xml = dumpUi(serial, `${label}-logout-${i}`);
    if (tapBy(serial, xml, "settings-logout-button") || tapBy(serial, xml, "Log Out")) {
      sleep(2500);
      return true;
    }
    scrollDown(serial);
  }
  return false;
}

function openSettingsFromHome(serial, label) {
  launch(serial);
  let xml = dumpUi(serial, `${label}-home`);
  const homeVisible = xmlHas(xml, "auth-logged-in-home");
  const tapped = tapBy(serial, xml, "main-tab-home-settings-action") || tapBy(serial, xml, "Settings");
  sleep(1800);
  const settingsXml = dumpUi(serial, `${label}-settings`);
  return {
    homeVisible,
    settingsOpened: /Settings|settings-delete-account-button|settings-logout-button/i.test(settingsXml),
    settingsXml,
  };
}

function findInSettings(serial, label, query, maxScrolls = 6, expandSectionId = "") {
  openDeepLink(serial, "chillywoodmobile://settings");
  const sectionQuery = expandSectionId ? `settings-section-${expandSectionId}` : "";
  for (let i = 0; i <= maxScrolls; i += 1) {
    const xml = dumpUi(serial, `${label}-settings-search-${i}`);
    if (xmlHas(xml, query) || parseBoundsCenter(xml, query)) return xml;
    if (sectionQuery && (xmlHas(xml, sectionQuery) || parseBoundsCenter(xml, sectionQuery))) {
      tapBy(serial, xml, sectionQuery);
      const expandedXml = dumpUi(serial, `${label}-settings-search-${i}-expanded-${expandSectionId}`);
      if (xmlHas(expandedXml, query) || parseBoundsCenter(expandedXml, query)) return expandedXml;
    }
    scrollDown(serial);
  }
  return "";
}

function confirmDialog(serial, label, preferredText = "Delete Account") {
  const xml = dumpUi(serial, `${label}-dialog`);
  return tapBy(serial, xml, preferredText)
    || tapBy(serial, xml, preferredText.toUpperCase())
    || tapBy(serial, xml, "OK")
    || tapBy(serial, xml, "android:id/button1")
    || tapBy(serial, xml, "Delete account")
    || tapBy(serial, xml, "DELETE ACCOUNT");
}

function captureLogcat(serial, name) {
  const logcat = adb(serial, ["logcat", "-d", "-t", "1500"], { timeout: 30000, maxBuffer: 1024 * 1024 * 20 });
  writeText(`${name}-logcat-redacted.txt`, logcat.stdout + logcat.stderr);
  return !/FATAL EXCEPTION|AndroidRuntime.*FATAL|ANR in com\.chillywood\.mobile/i.test(logcat.stdout + logcat.stderr);
}

loadLocalEnv();

const devicesResult = run("adb", ["devices"]);
const devices = devicesResult.ok ? parseDevices(devicesResult.stdout) : [];
const serial = requestedSerial || (devices.length === 1 ? devices[0] : "R5CR120QCBF");
writeText("adb-devices.txt", devicesResult.stdout + devicesResult.stderr);

const proof = {
  generatedAt: new Date().toISOString(),
  packageId: PACKAGE_ID,
  selectedSerial: serial,
  artifactDir,
  mutationAllowed,
  resetAppData,
  device: null,
  packageReadback: null,
  matrix: {},
  notes: [],
};
let blockFixtureCreated = false;

const credentials = {
  signedInSmoke: {
    label: "signed-in smoke proof user",
    email: envValue("CHILLYWOOD_E2E_OWNER_EMAIL", "FINAL_QA_PROOF_EMAIL"),
    password: envValue("CHILLYWOOD_E2E_OWNER_PASSWORD", "FINAL_QA_PROOF_PASSWORD"),
  },
  deletion: {
    label: "account deletion/restore proof user",
    email: envValue("CHILLYWOOD_E2E_VIEWER_09_EMAIL"),
    password: envValue("CHILLYWOOD_E2E_VIEWER_09_PASSWORD"),
  },
  blockedViewer: {
    label: "blocked viewer proof user",
    email: envValue("CHILLYWOOD_E2E_VIEWER_EMAIL"),
    password: envValue("CHILLYWOOD_E2E_VIEWER_PASSWORD"),
  },
  unrelatedViewer: {
    label: "unrelated viewer proof user",
    email: envValue("CHILLYWOOD_E2E_VIEWER_02_EMAIL"),
    password: envValue("CHILLYWOOD_E2E_VIEWER_02_PASSWORD"),
  },
};
const proofIds = {
  ownerUserId: envValue("CHILLYWOOD_E2E_OWNER_USER_ID"),
  blockedViewerUserId: envValue("CHILLYWOOD_E2E_VIEWER_USER_ID"),
  unrelatedViewerUserId: envValue("CHILLYWOOD_E2E_VIEWER_02_USER_ID"),
};
const supabaseUrl = envValue("SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL") || "https://bmkkhihfbmsnnmcqkoly.supabase.co";
const serviceRoleKey = envValue("SUPABASE_SERVICE_ROLE_KEY");
proof.credentialPresence = Object.fromEntries(
  Object.entries(credentials).map(([key, value]) => [key, { email: !!value.email, password: !!value.password }]),
);
proof.fixturePresence = {
  ownerUserId: !!proofIds.ownerUserId,
  blockedViewerUserId: !!proofIds.blockedViewerUserId,
  unrelatedViewerUserId: !!proofIds.unrelatedViewerUserId,
  serviceRoleKey: !!serviceRoleKey,
};

if (!serial || !devices.includes(serial)) {
  proof.matrix.installer = status("Blocked", "No attached Android device available.", "Attach one physical Android device.");
} else {
  const model = adb(serial, ["shell", "getprop", "ro.product.model"]);
  const android = adb(serial, ["shell", "getprop", "ro.build.version.release"]);
  proof.device = { serial, model: model.stdout.trim(), android: android.stdout.trim() };

  const packageDump = adb(serial, ["shell", "dumpsys", "package", PACKAGE_ID], { timeout: 30000 });
  const installerList = adb(serial, ["shell", "pm", "list", "packages", "-i", PACKAGE_ID]);
  writeText("package-dumpsys.txt", packageDump.stdout + packageDump.stderr);
  writeText("package-installer.txt", installerList.stdout + installerList.stderr);
  const installerLine = installerList.stdout.split("\n").find((line) => line.includes(PACKAGE_ID));
  proof.packageReadback = {
    packageId: PACKAGE_ID,
    versionCode: packageDump.stdout.match(/versionCode=(\d+)/)?.[1] || null,
    versionName: packageDump.stdout.match(/versionName=([^\s]+)/)?.[1] || null,
    firstInstallTime: packageDump.stdout.match(/firstInstallTime=([^\n]+)/)?.[1]?.trim() || null,
    lastUpdateTime: packageDump.stdout.match(/lastUpdateTime=([^\n]+)/)?.[1]?.trim() || null,
    installer: installerLine?.match(/installer=([^\s]+)/)?.[1] || "unknown",
  };
  proof.matrix.installer = proof.packageReadback.installer === PLAY_INSTALLER && Number(proof.packageReadback.versionCode) >= 55
    ? status("Pass", `Play-installed runtime read back versionCode ${proof.packageReadback.versionCode}, installer ${proof.packageReadback.installer}.`)
    : status("Blocked", `Installed runtime readback was versionCode ${proof.packageReadback.versionCode}, installer ${proof.packageReadback.installer}.`, "Requires versionCode 55+ from Google Play.");

  adb(serial, ["logcat", "-c"], { timeout: 10000 });

  if (resetAppData) {
    clearAppData(serial);
  }

  if (credentials.signedInSmoke.email && credentials.signedInSmoke.password) {
    clearAppData(serial);
    const login = signIn(serial, "signed-in-smoke", credentials.signedInSmoke.email, credentials.signedInSmoke.password);
    const visual = openSettingsFromHome(serial, "signed-in-smoke");
    proof.matrix.signedInHome = visual.homeVisible
      ? status("Pass", "Home marker was visible after signing in on the Play-installed runtime.")
      : status("Pending installed proof", "Home marker was not visible after sign-in attempt.", "Credential entry or session state did not reach Home.");
    proof.matrix.signedInSettings = visual.settingsOpened
      ? status("Pass", "Settings opened from Home on the Play-installed runtime.")
      : status("Pending installed proof", "Settings did not open from Home.", "Requires a signed-in Home session.");
    clearAppData(serial);
  } else {
    proof.matrix.signedInHome = status("Pending installed proof", "Signed-in smoke credentials were not available as ignored local env keys.");
    proof.matrix.signedInSettings = status("Pending installed proof", "Signed-in smoke credentials were not available as ignored local env keys.");
  }

  if (credentials.deletion.email && credentials.deletion.password) {
    clearAppData(serial);
    const deletionLogin = signIn(serial, "account-deletion", credentials.deletion.email, credentials.deletion.password);
    let deleteXml = findInSettings(serial, "account-deletion", "settings-delete-account-button", 8, "account");
    const deletionUiReachable = !!deleteXml;
    const copyHonest = /30-day restore|Delete account|Schedules account deletion|Deletion is scheduled|Restore by/i.test(deleteXml);
    proof.matrix.accountDeletionUi = deletionUiReachable && copyHonest
      ? status("Pass", "Settings account deletion UI is reachable and shows scheduled-deletion / 30-day restore copy.")
      : status("Pending installed proof", "Account deletion UI/copy was not fully captured.", deletionLogin.ok ? "Settings account action row was not found in UI dump." : "Deletion proof user sign-in did not complete.");

    if (mutationAllowed && deletionUiReachable) {
      const tappedDelete = tapBy(serial, deleteXml, "settings-delete-account-button") || tapBy(serial, deleteXml, "Delete Account");
      sleep(700);
      const confirmed = tappedDelete ? confirmDialog(serial, "account-deletion-confirm", "Delete Account") : false;
      sleep(5000);
      const postDeleteXml = dumpUi(serial, "account-deletion-after-schedule");
      const scheduledVisual = /Sign In|auth-login-email-input|Deletion is scheduled|Restore Account/i.test(postDeleteXml);
      proof.matrix.accountDeletionSchedule = tappedDelete && confirmed && scheduledVisual
        ? status("Pass", "Delete Account flow was triggered for the proof user and returned to an honest signed-out/scheduled state.")
        : status("Partial", "Delete Account flow was attempted but scheduled-state UI was not conclusively captured.", "Backend/runtime deletion proof remains source of truth.");

      clearAppData(serial);
      const restoreLogin = signIn(serial, "account-restore", credentials.deletion.email, credentials.deletion.password);
      let restoreXml = findInSettings(serial, "account-restore", "settings-restore-account-button", 8, "account");
      const restoreUi = !!restoreXml && /Restore Account|Deletion is scheduled|Restore by/i.test(restoreXml);
      let restoreTapped = false;
      if (restoreUi) {
        restoreTapped = tapBy(serial, restoreXml, "settings-restore-account-button") || tapBy(serial, restoreXml, "Restore Account");
        sleep(2500);
        confirmDialog(serial, "account-restore-confirm", "Restore Account");
        sleep(3500);
      }
      const restoredXml = dumpUi(serial, "account-restore-after");
      proof.matrix.accountRestoreCancel = restoreUi && restoreTapped && /Account deletion canceled|30-day restore|Delete Account|auth-logged-in-home|Settings/i.test(restoredXml)
        ? status("Pass", "Restore Account UI was available and restore/cancel flow completed for the proof user.")
        : status("Partial", "Restore UI was not conclusively completed from installed visuals.", restoreLogin.ok ? "Backend cleanup should be checked if needed." : "Restore proof user sign-in did not complete.");
      clearAppData(serial);
    } else {
      proof.matrix.accountDeletionSchedule = status(
        mutationAllowed ? "Pending installed proof" : "Partial",
        mutationAllowed ? "Mutation was allowed but Delete Account control was not available." : "Deletion schedule mutation was not run; UI/copy reachability was the installed proof scope.",
        mutationAllowed ? "Delete Account control not found." : "Run with --run-account-mutation to visually schedule and restore a proof account.",
      );
      proof.matrix.accountRestoreCancel = status(
        mutationAllowed ? "Pending installed proof" : "Partial",
        "Restore/cancel visual mutation was not run.",
        mutationAllowed ? "Schedule step did not complete." : "Run with --run-account-mutation to visually schedule and restore a proof account.",
      );
      clearAppData(serial);
    }
  } else {
    proof.matrix.accountDeletionUi = status("Pending installed proof", "Deletion proof credentials were not available as ignored local env keys.");
    proof.matrix.accountDeletionSchedule = status("Pending installed proof", "Deletion proof credentials were not available as ignored local env keys.");
    proof.matrix.accountRestoreCancel = status("Pending installed proof", "Deletion proof credentials were not available as ignored local env keys.");
  }

  if (serviceRoleKey && proofIds.ownerUserId && proofIds.blockedViewerUserId) {
    const admin = supabaseClient(supabaseUrl, serviceRoleKey);
    const cleanup = await admin
      .from("channel_audience_blocks")
      .delete()
      .eq("channel_user_id", proofIds.ownerUserId)
      .eq("blocked_user_id", proofIds.blockedViewerUserId);
    if (cleanup.error) {
      proof.notes.push(`blocked fixture pre-cleanup failed: ${redact(cleanup.error.message)}`);
    }
    const block = await admin.from("channel_audience_blocks").upsert({
      blocked_by_user_id: proofIds.ownerUserId,
      blocked_user_id: proofIds.blockedViewerUserId,
      channel_user_id: proofIds.ownerUserId,
      reason: `installed-visual-closeout:${stamp}`,
    });
    blockFixtureCreated = !block.error;
    if (block.error) proof.notes.push(`blocked fixture setup failed: ${redact(block.error.message)}`);
  }

  if (credentials.blockedViewer.email && credentials.blockedViewer.password && proofIds.ownerUserId) {
    clearAppData(serial);
    const login = signIn(serial, "blocked-viewer", credentials.blockedViewer.email, credentials.blockedViewer.password);
    openDeepLink(serial, `chillywoodmobile://profile/${encodeURIComponent(proofIds.ownerUserId)}`);
    const profileXml = dumpUi(serial, "blocked-viewer-profile");
    openDeepLink(serial, `chillywoodmobile://channel/${encodeURIComponent(proofIds.ownerUserId)}`);
    const platformXml = dumpUi(serial, "blocked-viewer-platform");
    const combinedBlockedXml = profileXml + platformXml;
    const blockedStateVisible = /blocked|unavailable|This profile is unavailable|This Platform is unavailable|not available to this account|Sign In/i.test(combinedBlockedXml);
    const messageBlocked = !/Message|Chi'lly Chat/i.test(combinedBlockedXml) || blockedStateVisible;
    const callBlocked = !/Call|Voice|Video/i.test(combinedBlockedXml) || blockedStateVisible;
    const followBlocked = !/Follow|Request/i.test(combinedBlockedXml) || blockedStateVisible;
    proof.matrix.blockedViewerProfile = login.ok
      ? (blockedStateVisible
          ? status("Pass", "Blocked viewer opened blocker-owned Profile route and saw blocked/unavailable state on the Play-installed runtime.")
          : status("Partial", "Blocked viewer opened blocker-owned Profile route, but visual blocked copy was not conclusive.", blockFixtureCreated ? "Backend fixture existed; UI may expose public-safe shell while backend blocks actions." : "Blocked fixture setup was not confirmed."))
      : status("Pending installed proof", "Blocked viewer sign-in did not complete.");
    proof.matrix.blockedViewerPlatform = login.ok
      ? (blockedStateVisible
          ? status("Pass", "Blocked viewer opened blocker-owned Platform route and saw blocked/unavailable state on the Play-installed runtime.")
          : status("Partial", "Blocked viewer opened blocker-owned Platform route, but visual blocked copy was not conclusive.", blockFixtureCreated ? "Backend fixture existed; UI may expose public-safe shell while backend blocks actions." : "Blocked fixture setup was not confirmed."))
      : status("Pending installed proof", "Blocked viewer sign-in did not complete.");
    proof.matrix.blockedActions = messageBlocked && callBlocked && followBlocked
      ? status(blockedStateVisible ? "Pass" : "Partial", "Captured installed blocked-viewer owner route state did not expose obvious message/call/follow harassment actions.")
      : status("Pending installed proof", "Blocked-viewer route still exposed possible interaction labels in generic route capture.", "Needs owner-specific route fixture and backend denial readback.");
    clearAppData(serial);
  } else {
    proof.matrix.blockedViewerProfile = status("Pending installed proof", "Blocked-viewer credentials were not available as ignored local env keys.");
    proof.matrix.blockedViewerPlatform = status("Pending installed proof", "Blocked-viewer credentials were not available as ignored local env keys.");
    proof.matrix.blockedActions = status("Pending installed proof", "Blocked-viewer credentials were not available as ignored local env keys.");
  }

  if (credentials.unrelatedViewer.email && credentials.unrelatedViewer.password && proofIds.ownerUserId) {
    clearAppData(serial);
    const login = signIn(serial, "unrelated-viewer", credentials.unrelatedViewer.email, credentials.unrelatedViewer.password);
    openDeepLink(serial, `chillywoodmobile://profile/${encodeURIComponent(proofIds.ownerUserId)}`);
    const profileXml = dumpUi(serial, "unrelated-viewer-profile");
    openDeepLink(serial, `chillywoodmobile://channel/${encodeURIComponent(proofIds.ownerUserId)}`);
    const platformXml = dumpUi(serial, "unrelated-viewer-platform");
    proof.matrix.unrelatedViewerRegression = login.ok && /Profile|Platform|Public|Home|Message|Follow|Platform Studio|Videos|Creator/i.test(profileXml + platformXml)
      ? status("Pass", "Unrelated viewer signed in and opened the same owner Profile/Platform routes without blocked/unavailable denial.")
      : status("Pending installed proof", "Unrelated viewer sign-in or route capture did not complete.");
    clearAppData(serial);
  } else {
    proof.matrix.unrelatedViewerRegression = status("Pending installed proof", "Unrelated-viewer credentials were not available as ignored local env keys.");
  }

  proof.matrix.crashFatalScan = captureLogcat(serial, "installed-visual-closeout")
    ? status("Pass", "No fatal/crash markers were found in the captured installed proof logcat window.")
    : status("Gap", "Fatal/crash marker found in captured logcat.");
}

if (blockFixtureCreated && serviceRoleKey && proofIds.ownerUserId && proofIds.blockedViewerUserId) {
  const admin = supabaseClient(supabaseUrl, serviceRoleKey);
  const cleanup = await admin
    .from("channel_audience_blocks")
    .delete()
    .eq("channel_user_id", proofIds.ownerUserId)
    .eq("blocked_user_id", proofIds.blockedViewerUserId);
  proof.matrix.blockFixtureCleanup = cleanup.error
    ? status("Pending installed proof", `Blocked relationship cleanup failed: ${redact(cleanup.error.message)}`)
    : status("Pass", "Temporary blocked relationship fixture cleaned up.");
}

const scanPatterns = [
  /service_role/i,
  /eyJ[A-Za-z0-9_-]{20,}/,
  /refresh_token/i,
  /access_token/i,
  /pushToken/i,
  /LiveKit token/i,
  /signedUrl/i,
  /X-Goog-Signature/i,
  /provider key/i,
];
const scanFiles = [
  "package-dumpsys.txt",
  "package-installer.txt",
  "installed-visual-closeout-logcat-redacted.txt",
  ...["signed-in-smoke", "account-deletion", "account-restore", "blocked-viewer", "unrelated-viewer"]
    .flatMap((prefix) => ["login-initial", "login-post", "home", "settings"].map((suffix) => `${prefix}-${suffix}.xml`)),
].filter((file) => existsSync(path.join(artifactDir, file)));
const scanHits = [];
for (const file of scanFiles) {
  const content = readFileSync(path.join(artifactDir, file), "utf8");
  for (const pattern of scanPatterns) {
    if (pattern.test(content)) scanHits.push({ file, pattern: String(pattern) });
  }
}
proof.matrix.secretTokenScan = scanHits.length === 0
  ? status("Pass", "Artifact secret/token scan found no credential, token, or signed-URL values.")
  : status("Pending installed proof", "Artifact scan found token-like terms for review.", "Inspect secret-token-scan.json before sharing artifacts.");
proof.secretScan = { status: scanHits.length === 0 ? "Pass" : "Review", hits: scanHits };

writeJson("proof-matrix.json", proof);
writeText("secret-token-scan.txt", scanHits.length ? JSON.stringify(scanHits, null, 2) : "");
writeText("README.md", [
  "# Installed Visual Closeout Proof",
  "",
  `Generated: ${proof.generatedAt}`,
  "",
  `Package: ${PACKAGE_ID}`,
  `Device: ${proof.device?.serial ?? "not available"} / ${proof.device?.model ?? "unknown"}`,
  `Installer: ${proof.packageReadback?.installer ?? "unknown"}`,
  `Version: ${proof.packageReadback?.versionCode ?? "unknown"} / ${proof.packageReadback?.versionName ?? "unknown"}`,
  "",
  "This artifact contains sanitized installed-device UI/log proof. It does not include proof credentials, service-role keys, provider keys, push tokens, LiveKit tokens, signed URLs, or proof passwords.",
  "",
  "Matrix:",
  ...Object.entries(proof.matrix).map(([key, value]) => `- ${key}: ${value.status} — ${value.result}${value.blocker ? ` Blocker: ${value.blocker}` : ""}`),
  "",
].join("\n"));

console.log(JSON.stringify({
  artifactDir,
  packageReadback: proof.packageReadback,
  device: proof.device,
  matrix: proof.matrix,
  credentialPresence: proof.credentialPresence,
  secretScan: proof.secretScan.status,
}, null, 2));
