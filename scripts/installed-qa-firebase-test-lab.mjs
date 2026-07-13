#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const SYSTEM_ID = "installed_product_qa_operator";
const PROVIDER = "firebase_test_lab";
const PROOF_SOURCE = "firebase_test_lab_uploaded_artifact";
const FUNCTION_NAME = "installed-product-qa-operator";
const TOKEN_HEADER = "x-installed-qa-operator-token";

const args = process.argv.slice(2);
const mode = args.find((arg) => !arg.startsWith("--")) || "status";
const flags = new Set(args.filter((arg) => arg.startsWith("--")));

const secretKeyPattern = /(secret|token|password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|signed[_-]?url|db[_-]?url|database[_-]?url|reporter|private[_-]?evidence|tax|bank)/i;

const boolEnv = (key, fallback = false) => {
  const value = String(process.env[key] ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return value === "1" || value === "true" || value === "yes";
};

const numberEnv = (key, fallback) => {
  const raw = String(process.env[key] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const textEnv = (key, fallback = "") => String(process.env[key] ?? fallback).trim();

const commandExists = (command) => spawnSync("command", ["-v", command], {
  encoding: "utf8",
  shell: true,
}).status === 0;

const runQuiet = (command, commandArgs) => spawnSync(command, commandArgs, {
  encoding: "utf8",
  stdio: "pipe",
});

const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.length > 96) return `${value.slice(0, 16)}...[redacted:${value.length}]`;
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    secretKeyPattern.test(key) && !["activeCredentialCount", "secretsLogged"].includes(key) ? "[redacted]" : redact(entry),
  ]));
};

const timeoutMinutes = (timeout) => {
  const value = String(timeout || "").trim().toLowerCase();
  const match = value.match(/^(\d+(?:\.\d+)?)([smh])$/);
  if (!match) return Number.NaN;
  const amount = Number(match[1]);
  if (match[2] === "s") return amount / 60;
  if (match[2] === "h") return amount * 60;
  return amount;
};

const oneOf = (value, values, fallback) => (values.includes(value) ? value : fallback);

const readGcloudProjectConfigured = () => {
  if (!commandExists("gcloud")) return { configured: false, value: "" };
  const result = runQuiet("gcloud", ["config", "get-value", "project"]);
  const value = String(result.stdout || "").trim();
  return { configured: result.status === 0 && Boolean(value) && value !== "(unset)", value };
};

const auditFirebaseTestLab = () => {
  const firebaseCliPresent = commandExists("firebase");
  const gcloudCliPresent = commandExists("gcloud");
  const gcloudProject = readGcloudProjectConfigured();
  const project = textEnv("FIREBASE_TEST_LAB_PROJECT", gcloudProject.value);
  const activeCredentialResult = gcloudCliPresent
    ? runQuiet("gcloud", ["auth", "list", "--filter=status:ACTIVE", "--format=value(status)"])
    : { status: 1, stdout: "" };
  const activeCredentialCount = String(activeCredentialResult.stdout || "").split(/\n/).filter(Boolean).length;
  const serviceResult = gcloudCliPresent && project
    ? runQuiet("gcloud", [
      "services",
      "list",
      "--enabled",
      "--project",
      project,
      "--filter=name:(firebase.googleapis.com OR testing.googleapis.com OR toolresults.googleapis.com)",
      "--format=value(config.name)",
    ])
    : { status: 1, stdout: "" };
  const enabledServices = String(serviceResult.stdout || "").split(/\n/).filter(Boolean).sort();
  const modelResult = gcloudCliPresent && project
    ? runQuiet("gcloud", [
      "firebase",
      "test",
      "android",
      "models",
      "list",
      "--project",
      project,
      "--filter=form=VIRTUAL",
      "--limit=1",
      "--format=value(id)",
    ])
    : { status: 1, stdout: "" };
  const versionResult = gcloudCliPresent && project
    ? runQuiet("gcloud", [
      "firebase",
      "test",
      "android",
      "versions",
      "list",
      "--project",
      project,
      "--limit=1",
      "--format=value(id)",
    ])
    : { status: 1, stdout: "" };
  const billingResult = gcloudCliPresent && project
    ? runQuiet("gcloud", ["beta", "billing", "projects", "describe", project, "--format=value(billingEnabled)"])
    : { status: 1, stdout: "" };
  const billingValue = String(billingResult.stdout || "").trim().toLowerCase();
  const envNames = Object.keys(process.env)
    .filter((key) => /FIREBASE|GCLOUD|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_PROJECT|GCP|TEST_LAB/.test(key))
    .sort();
  const apkPath = textEnv("FIREBASE_TEST_LAB_APK", "android/app/build/outputs/apk/release/app-release.apk");
  const aabPath = textEnv("FIREBASE_TEST_LAB_AAB", "android/app/build/outputs/bundle/release/app-release.aab");

  return {
    firebaseCliPresent,
    gcloudCliPresent,
    gcloudProjectConfigured: gcloudProject.configured || Boolean(textEnv("FIREBASE_TEST_LAB_PROJECT")),
    activeCredentialCount,
    firebaseProjectConfigured: Boolean(project),
    serviceAccountOrWorkloadIdentityEnvNames: envNames.filter((key) => /GOOGLE_APPLICATION_CREDENTIALS|WORKLOAD|SERVICE_ACCOUNT|GCLOUD|GCP/.test(key)),
    firebaseEnvNames: envNames.filter((key) => /FIREBASE|TEST_LAB/.test(key)),
    firebaseConfigPresent: existsSync("firebase.json"),
    firebasercPresent: existsSync(".firebaserc"),
    googleServicesRootPresent: existsSync("google-services.json"),
    googleServicesAndroidPresent: existsSync("android/app/google-services.json"),
    testLabServicesQueryOk: serviceResult.status === 0,
    testLabApiAvailable: enabledServices.includes("testing.googleapis.com"),
    firebaseApiAvailable: enabledServices.includes("firebase.googleapis.com"),
    toolResultsApiAvailable: enabledServices.includes("toolresults.googleapis.com"),
    testLabCatalogAccess: modelResult.status === 0 && Boolean(String(modelResult.stdout || "").trim()),
    testLabVersionsAccess: versionResult.status === 0 && Boolean(String(versionResult.stdout || "").trim()),
    billingStatusQueryOk: billingResult.status === 0,
    blazeBillingEnabled: billingResult.status === 0 && billingValue === "true"
      ? "yes"
      : billingResult.status === 0 && billingValue === "false"
        ? "no"
        : "unknown",
    sparkFreeQuotaAvailable: "unknown",
    zeroCostGuaranteed: false,
    apkPath,
    apkPresent: existsSync(apkPath),
    aabPath,
    aabPresent: existsSync(aabPath),
  };
};

const buildInput = (audit) => {
  const deviceType = oneOf(textEnv("FIREBASE_TEST_LAB_DEVICE_TYPE", "virtual"), ["virtual", "physical"], "virtual");
  const quotaMode = oneOf(textEnv("FIREBASE_TEST_LAB_QUOTA_MODE", "unknown"), ["free_quota", "paid_approval_required", "unknown"], "unknown");
  const billingRisk = oneOf(textEnv("FIREBASE_TEST_LAB_BILLING_RISK", "unknown"), ["none", "paid_approval_required", "unknown"], "unknown");
  const timeout = textEnv("FIREBASE_TEST_LAB_TIMEOUT", "5m");
  const requiredMinutes = timeoutMinutes(timeout);
  const remainingFreeMinutes = numberEnv(
    deviceType === "physical"
      ? "FIREBASE_TEST_LAB_REMAINING_FREE_PHYSICAL_MINUTES"
      : "FIREBASE_TEST_LAB_REMAINING_FREE_VIRTUAL_MINUTES",
    Number.NaN,
  );
  return {
    action: mode,
    projectConfigured: audit.firebaseProjectConfigured,
    testLabApiAvailable: audit.testLabApiAvailable && audit.testLabCatalogAccess && audit.testLabVersionsAccess,
    artifactPresent: audit.apkPresent || audit.aabPresent,
    deviceType,
    scheduledRequested: flags.has("--scheduled") || boolEnv("FIREBASE_TEST_LAB_SCHEDULED_RUN"),
    allowPhysical: boolEnv("FIREBASE_TEST_LAB_ALLOW_PHYSICAL"),
    allowScheduled: boolEnv("FIREBASE_TEST_LAB_ALLOW_SCHEDULED"),
    physicalApprovalNotePresent: Boolean(textEnv("FIREBASE_TEST_LAB_OWNER_APPROVAL_NOTE")),
    scheduleQuotaProofPresent: Boolean(textEnv("FIREBASE_TEST_LAB_QUOTA_SAFE_PROOF")),
    maxCostUsd: numberEnv("FIREBASE_TEST_LAB_MAX_COST_USD", 0),
    zeroCostConfirmed: boolEnv("FIREBASE_TEST_LAB_ZERO_COST_CONFIRMED"),
    freeQuotaVerified: boolEnv("FIREBASE_TEST_LAB_FREE_QUOTA_VERIFIED"),
    quotaMode,
    billingRisk,
    timeout,
    requiredMinutes,
    remainingFreeMinutes,
  };
};

const evaluateCostGuard = (input) => {
  const base = {
    provider: PROVIDER,
    proofSource: PROOF_SOURCE,
    costEstimateUsd: 0,
    deviceType: input.deviceType,
    quotaMode: input.quotaMode,
    billingRisk: input.billingRisk,
    maxCostUsd: input.maxCostUsd,
    timeout: input.timeout,
    requiredMinutes: Number.isFinite(input.requiredMinutes) ? input.requiredMinutes : null,
    remainingFreeMinutes: Number.isFinite(input.remainingFreeMinutes) ? input.remainingFreeMinutes : null,
    notPlayInstalledProof: true,
  };

  if (input.maxCostUsd !== 0) {
    return {
      ...base,
      canRun: false,
      failClosed: true,
      blocker: "paid_usage_requires_owner_approval",
      blockerClassification: "unknown_requires_review",
      billingRisk: "paid_approval_required",
      reason: "FIREBASE_TEST_LAB_MAX_COST_USD must remain 0 unless owner explicitly approves paid usage.",
    };
  }
  if (!input.projectConfigured) {
    return {
      ...base,
      canRun: false,
      failClosed: true,
      blocker: "firebase_project_missing",
      blockerClassification: "device_unavailable",
      billingRisk: "unknown",
      reason: "Firebase/GCloud project is not configured.",
    };
  }
  if (!input.testLabApiAvailable) {
    return {
      ...base,
      canRun: false,
      failClosed: true,
      blocker: "firebase_credentials_missing",
      blockerClassification: "device_unavailable",
      billingRisk: "unknown",
      reason: "Firebase Test Lab catalog or API access is unavailable.",
    };
  }
  if (!input.artifactPresent) {
    return {
      ...base,
      canRun: false,
      failClosed: true,
      blocker: "firebase_artifact_missing",
      blockerClassification: "device_unavailable",
      reason: "No Android APK/AAB artifact is available for Firebase Test Lab.",
    };
  }
  if (input.deviceType === "physical" && (!input.allowPhysical || !input.physicalApprovalNotePresent)) {
    return {
      ...base,
      canRun: false,
      failClosed: true,
      blocker: "firebase_physical_device_blocked_by_default",
      blockerClassification: "unknown_requires_review",
      billingRisk: "paid_approval_required",
      reason: "Physical Firebase Test Lab runs require explicit owner approval and no-cost quota proof.",
    };
  }
  if (input.scheduledRequested && (!input.allowScheduled || !input.scheduleQuotaProofPresent)) {
    return {
      ...base,
      canRun: false,
      failClosed: true,
      blocker: "firebase_scheduled_run_blocked_by_default",
      blockerClassification: "unknown_requires_review",
      billingRisk: "paid_approval_required",
      reason: "Scheduled Firebase Test Lab runs require owner approval and quota-safe proof.",
    };
  }
  if (
    !input.zeroCostConfirmed
    || !input.freeQuotaVerified
    || input.quotaMode !== "free_quota"
    || input.billingRisk !== "none"
    || !Number.isFinite(input.remainingFreeMinutes)
    || !Number.isFinite(input.requiredMinutes)
    || input.remainingFreeMinutes < input.requiredMinutes
  ) {
    return {
      ...base,
      canRun: false,
      failClosed: true,
      blocker: "firebase_free_quota_unknown",
      blockerClassification: "device_unavailable",
      billingRisk: input.billingRisk === "none" ? "unknown" : input.billingRisk,
      quotaMode: input.quotaMode === "free_quota" ? "unknown" : input.quotaMode,
      reason: "Remaining no-cost Firebase Test Lab quota could not be proven before the run.",
    };
  }
  return {
    ...base,
    canRun: true,
    failClosed: false,
    blocker: null,
    blockerClassification: "unknown_requires_review",
    billingRisk: "none",
    quotaMode: "free_quota",
    reason: "Zero-cost Firebase Test Lab virtual-device smoke is explicitly verified for this run.",
  };
};

const buildGcloudCommand = (audit) => {
  const project = textEnv("FIREBASE_TEST_LAB_PROJECT", readGcloudProjectConfigured().value);
  const appPath = audit.apkPresent ? audit.apkPath : audit.aabPath;
  return [
    "firebase",
    "test",
    "android",
    "run",
    "--type",
    "robo",
    "--app",
    appPath,
    "--device",
    textEnv("FIREBASE_TEST_LAB_DEVICE", "model=MediumPhone.arm,version=35,locale=en,orientation=portrait"),
    "--timeout",
    textEnv("FIREBASE_TEST_LAB_TIMEOUT", "5m"),
    "--project",
    project,
    "--results-dir",
    textEnv("FIREBASE_TEST_LAB_RESULTS_DIR", `installed-qa-${new Date().toISOString().slice(0, 10)}`),
    "--format",
    "json",
  ];
};

const reportToOperator = async (report) => {
  const token = process.env.INSTALLED_QA_OPERATOR_TOKEN;
  const explicitUrl = textEnv("INSTALLED_QA_OPERATOR_FUNCTION_URL");
  const functionsUrl = textEnv("SUPABASE_FUNCTIONS_URL");
  const url = explicitUrl || (functionsUrl ? `${functionsUrl.replace(/\/$/, "")}/${FUNCTION_NAME}` : "");
  if (!token || !url) {
    return { configured: false, reported: false, required: boolEnv("INSTALLED_QA_REPORT_REQUIRED") };
  }
  const payload = {
    action: "record_device_availability",
    source: PROOF_SOURCE,
    discovered_by: "device_lab",
    device_requirement: "Firebase Test Lab zero-cost virtual-device smoke path",
    available_device_count: report.costGuard.canRun ? 1 : 0,
    required_device_count: 1,
    play_installed_device_available: false,
    device_lab_configured: Boolean(report.costGuard.canRun),
    blocker_classification: report.costGuard.blockerClassification,
    result: report.costGuard.canRun ? "partial" : "blocked",
    next_safe_action: report.costGuard.canRun
      ? "Run only the bounded zero-cost Firebase smoke; keep Play-installed, Premium, and two-device proof separate."
      : "Keep scheduler pending until Firebase no-cost quota and billing risk are proven; no Firebase matrix was started.",
    metadata: {
      provider: PROVIDER,
      proofSource: PROOF_SOURCE,
      costEstimateUsd: report.costGuard.costEstimateUsd,
      billingRisk: report.costGuard.billingRisk,
      quotaMode: report.costGuard.quotaMode,
      deviceType: report.costGuard.deviceType,
      blocker: report.costGuard.blocker,
      fakeProof: false,
      moneyMoved: false,
      userRightsChanged: false,
      highRiskExecuted: false,
      secretsLogged: false,
    },
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [TOKEN_HEADER]: token,
    },
    body: JSON.stringify(payload),
  });
  return { configured: true, reported: response.ok, status: response.status };
};

const runSelfTest = () => {
  const base = {
    projectConfigured: true,
    testLabApiAvailable: true,
    artifactPresent: true,
    deviceType: "virtual",
    scheduledRequested: false,
    allowPhysical: false,
    allowScheduled: false,
    physicalApprovalNotePresent: false,
    scheduleQuotaProofPresent: false,
    maxCostUsd: 0,
    zeroCostConfirmed: false,
    freeQuotaVerified: false,
    quotaMode: "unknown",
    billingRisk: "unknown",
    timeout: "5m",
    requiredMinutes: 5,
    remainingFreeMinutes: Number.NaN,
  };
  const cases = [
    ["unknown cost fails closed", { ...base }, "firebase_free_quota_unknown", false],
    ["paid budget fails closed", { ...base, maxCostUsd: 1 }, "paid_usage_requires_owner_approval", false],
    ["physical blocked by default", { ...base, deviceType: "physical" }, "firebase_physical_device_blocked_by_default", false],
    ["scheduled blocked by default", { ...base, scheduledRequested: true }, "firebase_scheduled_run_blocked_by_default", false],
    ["free virtual can run", {
      ...base,
      zeroCostConfirmed: true,
      freeQuotaVerified: true,
      quotaMode: "free_quota",
      billingRisk: "none",
      remainingFreeMinutes: 60,
    }, null, true],
  ];
  const failures = [];
  for (const [label, input, blocker, canRun] of cases) {
    const result = evaluateCostGuard(input);
    if (result.canRun !== canRun) failures.push(`${label}: canRun expected ${canRun}, got ${result.canRun}`);
    if (blocker && result.blocker !== blocker) failures.push(`${label}: blocker expected ${blocker}, got ${result.blocker}`);
    if (result.costEstimateUsd !== 0) failures.push(`${label}: costEstimateUsd must stay 0`);
    if (result.proofSource !== PROOF_SOURCE || !result.notPlayInstalledProof) failures.push(`${label}: Firebase proof source must not become Play-installed proof`);
  }
  if (failures.length) {
    console.error("installed-qa-firebase-test-lab self-test failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("installed-qa-firebase-test-lab self-test passed");
};

if (mode === "self-test") {
  runSelfTest();
  process.exit(0);
}

const audit = auditFirebaseTestLab();
const input = buildInput(audit);
const costGuard = evaluateCostGuard(input);
const commandArgs = buildGcloudCommand(audit);
const report = {
  ok: mode === "status" ? true : costGuard.canRun,
  failClosed: mode !== "status" && !costGuard.canRun,
  systemId: SYSTEM_ID,
  provider: PROVIDER,
  action: mode,
  audit,
  costGuard,
  plannedTest: {
    style: "firebase_virtual_device_robo_smoke",
    preferredDeviceType: "virtual",
    proofSource: PROOF_SOURCE,
    notPlayInstalledProof: true,
    canProve: ["uploaded artifact launches", "bounded Robo smoke has no crash", "route marker findings when instrumentation/robo reaches marker"],
    cannotProve: ["Play-installed package delivery", "Google Play Billing or RevenueCat active Premium", "two-device LiveKit realtime"],
  },
  gcloudCommandPreview: ["gcloud", ...commandArgs].map((part) => secretKeyPattern.test(part) ? "[redacted]" : part),
  highRiskExecuted: false,
  moneyMoved: false,
  userRightsChanged: false,
  fakeProof: false,
  secretsLogged: false,
};

if (flags.has("--report-operator") || boolEnv("FIREBASE_TEST_LAB_REPORT_TO_OPERATOR")) {
  report.operatorReport = await reportToOperator(report);
  if (report.operatorReport.required && !report.operatorReport.reported) {
    console.log(JSON.stringify(redact(report), null, 2));
    process.exit(1);
  }
}

if (mode === "run" && costGuard.canRun) {
  const result = runQuiet("gcloud", commandArgs);
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  const matrixMatch = output.match(/matrix(?:Id| id)?[=:]\s*([A-Za-z0-9_-]+)/i);
  report.firebaseRun = {
    started: result.status === 0,
    status: result.status,
    matrixId: matrixMatch?.[1] ?? null,
    outputStoredInConsole: true,
  };
  report.ok = result.status === 0;
  if (result.status !== 0) report.failClosed = true;
}

console.log(JSON.stringify(redact(report), null, 2));

if (mode !== "status" && !report.ok) process.exit(1);
