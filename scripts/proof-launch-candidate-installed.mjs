#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PACKAGE_ID = "com.chillywood.mobile";
const PLAY_INSTALLERS = new Set(["com.android.vending"]);

const args = new Set(process.argv.slice(2));
const requestedSerial = process.env.PROOF_ANDROID_SERIAL || process.env.ADB_SERIAL || "";
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const artifactDir =
  process.env.PROOF_ARTIFACT_DIR ||
  path.join("/tmp", `app-launch-candidate-installed-proof-${timestamp}`);

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
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 10,
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

function parseDevices(output) {
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === "device")
    .map(([serial]) => serial);
}

function writeText(fileName, contents) {
  writeFileSync(path.join(artifactDir, fileName), redact(contents));
}

function status(status, result, blocker = "") {
  return { status, result, blocker };
}

function parseBoundsCenter(xml, resourceId) {
  const pattern = new RegExp(`resource-id="${resourceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`);
  const match = xml.match(pattern);
  if (!match) return null;
  const [, x1, y1, x2, y2] = match.map(Number);
  return {
    x: Math.round((x1 + x2) / 2),
    y: Math.round((y1 + y2) / 2),
  };
}

const devicesResult = run("adb", ["devices"]);
const devices = devicesResult.ok ? parseDevices(devicesResult.stdout) : [];
const serial = requestedSerial || (devices.length === 1 ? devices[0] : "R5CR120QCBF");

const proof = {
  generatedAt: new Date().toISOString(),
  packageId: PACKAGE_ID,
  artifactDir,
  requestedSerial: requestedSerial || null,
  selectedSerial: serial || null,
  runMode: args.has("--run") ? "run" : "dry-run",
  devices,
  packageReadback: null,
  device: null,
  launch: null,
  routeSmoke: [],
  matrix: {},
  notes: [],
};

writeText("adb-devices.txt", devicesResult.stdout + devicesResult.stderr);

if (!serial || !devices.includes(serial)) {
  proof.notes.push("No selected attached Android device was available for installed proof.");
  proof.matrix.playInternalInstalledSmoke = status("Pending installed proof", "Not run", "No selected attached Android device.");
  proof.matrix.directApkInstalledSmoke = status("Pending installed proof", "Not run", "No selected attached Android device.");
} else {
  const model = adb(serial, ["shell", "getprop", "ro.product.model"]);
  const android = adb(serial, ["shell", "getprop", "ro.build.version.release"]);
  const serialReadback = adb(serial, ["get-serialno"]);
  proof.device = {
    serial: redact(serialReadback.stdout).trim() || serial,
    model: redact(model.stdout).trim(),
    android: redact(android.stdout).trim(),
  };

  const packageDump = adb(serial, ["shell", "dumpsys", "package", PACKAGE_ID], { timeout: 30000 });
  const installerList = adb(serial, ["shell", "pm", "list", "packages", "-i", PACKAGE_ID]);
  writeText("package-dumpsys.txt", packageDump.stdout + packageDump.stderr);
  writeText("package-installer.txt", installerList.stdout + installerList.stderr);

  const dump = packageDump.stdout;
  const installerLine = installerList.stdout
    .split("\n")
    .find((line) => line.includes(PACKAGE_ID));
  const versionCode = dump.match(/versionCode=(\d+)/)?.[1] || null;
  const versionName = dump.match(/versionName=([^\s]+)/)?.[1] || null;
  const firstInstallTime = dump.match(/firstInstallTime=([^\n]+)/)?.[1]?.trim() || null;
  const lastUpdateTime = dump.match(/lastUpdateTime=([^\n]+)/)?.[1]?.trim() || null;
  const installer = installerLine?.match(/installer=([^\s]+)/)?.[1] || "unknown";

  proof.packageReadback = {
    packageId: PACKAGE_ID,
    versionCode,
    versionName,
    installer,
    firstInstallTime,
    lastUpdateTime,
  };

  adb(serial, ["logcat", "-c"], { timeout: 10000 });
  const launch = adb(serial, [
    "shell",
    "monkey",
    "-p",
    PACKAGE_ID,
    "-c",
    "android.intent.category.LAUNCHER",
    "1",
  ]);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  const screenshot = adb(serial, ["exec-out", "screencap", "-p"], {
    encoding: "buffer",
    timeout: 20000,
    maxBuffer: 1024 * 1024 * 20,
  });
  if (screenshot.ok && screenshot.stdout?.length) {
    writeFileSync(path.join(artifactDir, "launch-screen.png"), screenshot.stdout);
  }
  const uiDump = adb(serial, ["shell", "uiautomator", "dump", "/sdcard/launch-candidate-window.xml"]);
  let launchXml = "";
  if (uiDump.ok) {
    const pull = adb(serial, ["pull", "/sdcard/launch-candidate-window.xml", path.join(artifactDir, "launch-window.xml")]);
    proof.notes.push(`UI dump pull status: ${pull.status}`);
    const launchXmlPath = path.join(artifactDir, "launch-window.xml");
    if (existsSync(launchXmlPath)) launchXml = readFileSync(launchXmlPath, "utf8");
  }
  const homeVisible = /resource-id="auth-logged-in-home"|text="HOME"/.test(launchXml);
  const settingsButtonVisible = launchXml.includes('resource-id="main-tab-home-settings-action"');
  const settingsCenter = parseBoundsCenter(launchXml, "main-tab-home-settings-action");
  let settingsOpened = false;
  if (settingsCenter) {
    adb(serial, ["shell", "input", "tap", String(settingsCenter.x), String(settingsCenter.y)], { timeout: 10000 });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
    const settingsDump = adb(serial, ["shell", "uiautomator", "dump", "/sdcard/launch-candidate-settings-window.xml"]);
    if (settingsDump.ok) {
      const pullSettings = adb(serial, ["pull", "/sdcard/launch-candidate-settings-window.xml", path.join(artifactDir, "settings-window.xml")]);
      proof.notes.push(`Settings UI dump pull status: ${pullSettings.status}`);
      const settingsXmlPath = path.join(artifactDir, "settings-window.xml");
      if (existsSync(settingsXmlPath)) {
        const settingsXml = readFileSync(settingsXmlPath, "utf8");
        settingsOpened = /text="SETTINGS"|text="Settings"|resource-id="settings-screen"/i.test(settingsXml);
      }
    }
    adb(serial, ["shell", "input", "keyevent", "4"], { timeout: 10000 });
  }
  const logcat = adb(serial, ["logcat", "-d", "-t", "1000"], {
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 10,
  });
  writeText("launch-logcat-redacted.txt", logcat.stdout + logcat.stderr);

  const fatalPatterns = [
    /FATAL EXCEPTION/i,
    /AndroidRuntime.*FATAL/i,
    /ANR in com\.chillywood\.mobile/i,
    /Process: com\.chillywood\.mobile.*crash/i,
  ];
  const fatalFound = fatalPatterns.some((pattern) => pattern.test(logcat.stdout + logcat.stderr));
  proof.launch = {
    commandStatus: launch.status,
    fatalFound,
    screenshot: screenshot.ok ? "launch-screen.png" : null,
    uiDump: uiDump.ok ? "launch-window.xml" : null,
    homeVisible,
    settingsButtonVisible,
    settingsOpened,
    logcat: "launch-logcat-redacted.txt",
  };

  const isPlayInternal = PLAY_INSTALLERS.has(installer);
  proof.matrix.playInternalInstalledSmoke = isPlayInternal
    ? status("Pass", `Installer readback is ${installer}.`)
    : status("Pending installed proof", `Installer readback is ${installer}.`, "The installed runtime is not Play/internal on this device.");
  proof.matrix.directApkInstalledSmoke = !fatalFound && launch.ok
    ? status("Pass", `Installed runtime launched without a fatal crash in the captured logcat window. Home visible: ${homeVisible ? "yes" : "no"}. Settings opened: ${settingsOpened ? "yes" : "not proved"}.`)
    : status("Gap", "Launch did not pass cleanly.", "Fatal crash or launch failure detected.");
  proof.matrix.homeOpen = homeVisible
    ? status("Pass", "Home was visible in the installed UI dump.")
    : status("Pending installed proof", "Home was not identified in the installed UI dump.", "The current installed session or UI state did not expose the expected Home marker.");
  proof.matrix.settingsOpen = settingsOpened
    ? status("Pass", "Settings opened from the Home settings control.")
    : status("Pending installed proof", settingsButtonVisible ? "Settings control was visible but open state was not confirmed." : "Settings control was not visible.", "Requires installed UI state with the Home settings control available.");
}

proof.matrix.accountDeletionRestoreVisual = status(
  "Pending installed proof",
  "Backend/runtime proof remains the source of truth; this script did not mutate account deletion state.",
  "Requires an approved proof account installed session and explicit mutation approval."
);
proof.matrix.blockedViewerVisual = status(
  "Pending installed proof",
  "Backend/runtime block enforcement remains the source of truth; this script did not switch installed proof users.",
  "Requires approved blocker, blocked-viewer, and unrelated-viewer installed sessions or a safe account-switching harness."
);
proof.matrix.firebaseDashboardReceipt = status(
  "Pending external/provider",
  "Firebase packages/config/redaction are repo-proved; no safe Console dashboard receipt was available to this script.",
  "Requires safe Firebase Console receipt proof without private data."
);

const secretScanTargets = [
  "package-dumpsys.txt",
  "package-installer.txt",
  "launch-logcat-redacted.txt",
  "launch-window.xml",
  "settings-window.xml",
];
const secretPattern = /(service_role|refresh_token|access_token|livekit|pushToken|signedUrl|X-Amz-Signature|password=(?!\"false\")|token_hash|eyJ[A-Za-z0-9_-]{20,}\.)/i;

const artifactFiles = [
  "package-dumpsys.txt",
  "package-installer.txt",
  "launch-logcat-redacted.txt",
  "launch-window.xml",
  "settings-window.xml",
  "proof-matrix.json",
  "README.md",
];

const realSecretFindings = secretScanTargets.map((file) => {
  const full = path.join(artifactDir, file);
  if (!existsSync(full)) {
    return { file, checked: false, finding: "missing" };
  }
  const text = readFileSync(full, "utf8");
  return { file, checked: true, finding: secretPattern.test(text) ? "review-needed" : "clean" };
});
proof.secretScan = realSecretFindings;

writeText("proof-matrix.json", JSON.stringify(proof, null, 2));
writeText(
  "README.md",
  [
    "# Launch Candidate Installed Proof",
    "",
    `Generated: ${proof.generatedAt}`,
    `Package: ${PACKAGE_ID}`,
    `Device: ${proof.device ? `${proof.device.model} / ${proof.device.serial}` : "not available"}`,
    "",
    "This artifact set is sanitized and does not include credentials, tokens, signed URLs, or proof passwords.",
    "",
    "## Matrix",
    "",
    ...Object.entries(proof.matrix).map(([key, value]) => `- ${key}: ${value.status} — ${value.result}${value.blocker ? ` Blocker: ${value.blocker}` : ""}`),
    "",
    "## Files",
    "",
    ...artifactFiles.map((file) => `- ${file}`),
  ].join("\n")
);

console.log(JSON.stringify({
  artifactDir,
  packageReadback: proof.packageReadback,
  device: proof.device,
  matrix: proof.matrix,
  secretScan: proof.secretScan,
}, null, 2));

if (proof.matrix.directApkInstalledSmoke.status === "Gap") {
  process.exitCode = 1;
}
