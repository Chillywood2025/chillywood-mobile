#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import process from "node:process";

const SYSTEM_ID = "installed_product_qa_operator";
const PROVIDER = "firebase_test_lab";
const PROOF_SOURCE = "firebase_test_lab_uploaded_artifact";
const FUNCTION_NAME = "installed-product-qa-operator";
const TOKEN_HEADER = "x-installed-qa-operator-token";
const DEFAULT_LEDGER_PATH = "/tmp/chillywood-installed-qa-firebase-test-lab-budget-ledger.jsonl";

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
const oneOf = (value, values, fallback) => (values.includes(value) ? value : fallback);
const roundUsdUp = (value) => Math.ceil(Math.max(0, value) * 100) / 100;

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

const commandExists = (command) => spawnSync("command", ["-v", command], {
  encoding: "utf8",
  shell: true,
}).status === 0;

const runQuiet = (command, commandArgs) => spawnSync(command, commandArgs, {
  encoding: "utf8",
  stdio: "pipe",
});

const timeoutMinutes = (timeout) => {
  const value = String(timeout || "").trim().toLowerCase();
  const match = value.match(/^(\d+(?:\.\d+)?)([smh])$/);
  if (!match) return Number.NaN;
  const amount = Number(match[1]);
  if (match[2] === "s") return Math.max(1, Math.ceil(amount / 60));
  if (match[2] === "h") return Math.ceil(amount * 60);
  return Math.ceil(amount);
};

const monthKey = (date = new Date()) => date.toISOString().slice(0, 7);
const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

const readLedgerEvents = (ledgerPath) => {
  if (!ledgerPath || !existsSync(ledgerPath)) return [];
  return readFileSync(ledgerPath, "utf8")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
};

const writeLedgerEvent = (ledgerPath, event) => {
  if (boolEnv("FIREBASE_TEST_LAB_LEDGER_DISABLED")) return false;
  mkdirSync(dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, `${JSON.stringify(redact(event))}\n`, { encoding: "utf8", mode: 0o600 });
  return true;
};

const monthlySpentFromLedger = (events, currentMonth) => events
  .filter((event) => event.month === currentMonth && event.countAgainstBudget !== false)
  .reduce((sum, event) => sum + Number(event.costEstimateUsd || 0), 0);

const scheduledRunCountFromLedger = (events, currentDay) => events
  .filter((event) => event.day === currentDay && event.runReason === "daily_scheduled" && event.eventType === "run_completed")
  .length;

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
    apkPath,
    apkPresent: existsSync(apkPath),
    aabPath,
    aabPresent: existsSync(aabPath),
  };
};

const buildInput = (audit) => {
  const ledgerPath = textEnv("FIREBASE_TEST_LAB_BUDGET_LEDGER", DEFAULT_LEDGER_PATH);
  const ledgerEvents = readLedgerEvents(ledgerPath);
  const currentMonth = monthKey();
  const currentDay = dayKey();
  const runReason = oneOf(
    textEnv("FIREBASE_TEST_LAB_RUN_REASON", flags.has("--scheduled") ? "daily_scheduled" : "manual"),
    ["manual", "owner_command", "daily_scheduled", "ota_change", "source_change"],
    "manual",
  );
  const deviceType = oneOf(textEnv("FIREBASE_TEST_LAB_DEVICE_TYPE", "virtual"), ["virtual", "physical"], "virtual");
  const timeout = textEnv("FIREBASE_TEST_LAB_TIMEOUT", "5m");
  const plannedMinutes = timeoutMinutes(timeout);
  const deviceCount = boolEnv("FIREBASE_TEST_LAB_TWO_DEVICE") ? 2 : 1;
  const monthlySpentFromEnv = numberEnv("FIREBASE_TEST_LAB_MONTHLY_SPENT_ESTIMATE_USD", Number.NaN);
  const scheduledRunCountFromEnv = numberEnv("FIREBASE_TEST_LAB_SCHEDULED_RUN_COUNT_TODAY", Number.NaN);

  return {
    action: mode,
    labMode: oneOf(textEnv("FIREBASE_TEST_LAB_MODE", "cost_capped"), ["cost_capped", "zero_cost"], "cost_capped"),
    qaTier: oneOf(textEnv("FIREBASE_TEST_LAB_QA_TIER", "tier1"), ["tier0", "tier1", "tier2", "tier3"], "tier1"),
    runReason,
    projectConfigured: audit.firebaseProjectConfigured,
    testLabApiAvailable: audit.testLabApiAvailable && audit.testLabCatalogAccess && audit.testLabVersionsAccess,
    artifactPresent: audit.apkPresent || audit.aabPresent,
    deviceType,
    deviceCount,
    timeout,
    plannedMinutes,
    allowVirtual: boolEnv("FIREBASE_TEST_LAB_ALLOW_VIRTUAL", true),
    allowPhysical: boolEnv("FIREBASE_TEST_LAB_ALLOW_PHYSICAL", false),
    allowBroadCrawl: boolEnv("FIREBASE_TEST_LAB_ALLOW_BROAD_CRAWL", false),
    allowTwoDevice: boolEnv("FIREBASE_TEST_LAB_ALLOW_TWO_DEVICE", false),
    runOnOtaChange: boolEnv("FIREBASE_TEST_LAB_RUN_ON_OTA_CHANGE", true),
    broadCrawlRequested: boolEnv("FIREBASE_TEST_LAB_BROAD_CRAWL", false),
    twoDeviceRequested: boolEnv("FIREBASE_TEST_LAB_TWO_DEVICE", false),
    scheduledRequested: runReason === "daily_scheduled" || flags.has("--scheduled") || boolEnv("FIREBASE_TEST_LAB_SCHEDULED_RUN"),
    monthlyBudgetUsd: numberEnv("FIREBASE_TEST_LAB_MONTHLY_CAP_USD", 5),
    perRunCapUsd: numberEnv("FIREBASE_TEST_LAB_PER_RUN_CAP_USD", 0.25),
    maxScheduledRunsPerDay: numberEnv("FIREBASE_TEST_LAB_MAX_SCHEDULED_RUNS_PER_DAY", 1),
    virtualCostPerHourUsd: numberEnv("FIREBASE_TEST_LAB_VIRTUAL_COST_PER_HOUR_USD", 1),
    physicalCostPerHourUsd: numberEnv("FIREBASE_TEST_LAB_PHYSICAL_COST_PER_HOUR_USD", 5),
    zeroCostConfirmed: boolEnv("FIREBASE_TEST_LAB_ZERO_COST_CONFIRMED"),
    freeQuotaVerified: boolEnv("FIREBASE_TEST_LAB_FREE_QUOTA_VERIFIED"),
    quotaModeInput: oneOf(textEnv("FIREBASE_TEST_LAB_QUOTA_MODE", "unknown"), ["free_quota", "cost_capped_worst_case", "paid_approval_required", "unknown"], "unknown"),
    monthlySpentEstimateUsd: Number.isFinite(monthlySpentFromEnv)
      ? monthlySpentFromEnv
      : monthlySpentFromLedger(ledgerEvents, currentMonth),
    scheduledRunCountToday: Number.isFinite(scheduledRunCountFromEnv)
      ? scheduledRunCountFromEnv
      : scheduledRunCountFromLedger(ledgerEvents, currentDay),
    ledgerPath,
    currentMonth,
    currentDay,
  };
};

const estimateRunCost = (input) => {
  if (input.zeroCostConfirmed && input.freeQuotaVerified && input.quotaModeInput === "free_quota") {
    return {
      costEstimateUsd: 0,
      billingRisk: "none",
      quotaMode: "free_quota",
      estimateBasis: "verified_free_quota",
    };
  }
  const hourlyRate = input.deviceType === "physical" ? input.physicalCostPerHourUsd : input.virtualCostPerHourUsd;
  if (!Number.isFinite(input.plannedMinutes) || input.plannedMinutes <= 0 || !Number.isFinite(hourlyRate) || hourlyRate < 0) {
    return {
      costEstimateUsd: Number.NaN,
      billingRisk: "unknown",
      quotaMode: "unknown",
      estimateBasis: "unbounded",
    };
  }
  const estimated = roundUsdUp((input.plannedMinutes / 60) * hourlyRate * input.deviceCount);
  return {
    costEstimateUsd: estimated,
    billingRisk: estimated <= input.perRunCapUsd ? "low" : "paid_approval_required",
    quotaMode: input.quotaModeInput === "unknown" ? "cost_capped_worst_case" : input.quotaModeInput,
    estimateBasis: "worst_case_paid_rate",
  };
};

const evaluateCostGuard = (input) => {
  const estimate = estimateRunCost(input);
  const monthlyRemainingEstimateUsd = roundUsdUp(input.monthlyBudgetUsd - input.monthlySpentEstimateUsd);
  const base = {
    provider: PROVIDER,
    proofSource: PROOF_SOURCE,
    labMode: input.labMode,
    qaTier: input.qaTier,
    runReason: input.runReason,
    costEstimateUsd: Number.isFinite(estimate.costEstimateUsd) ? estimate.costEstimateUsd : null,
    maxAllowedCostUsd: input.perRunCapUsd,
    monthlyBudgetUsd: input.monthlyBudgetUsd,
    monthlySpentEstimateUsd: input.monthlySpentEstimateUsd,
    monthlyRemainingEstimateUsd,
    billingRisk: estimate.billingRisk,
    quotaMode: estimate.quotaMode,
    estimateBasis: estimate.estimateBasis,
    deviceType: input.deviceType,
    deviceCount: input.deviceCount,
    timeout: input.timeout,
    plannedMinutes: Number.isFinite(input.plannedMinutes) ? input.plannedMinutes : null,
    scheduledRunCountToday: input.scheduledRunCountToday,
    maxScheduledRunsPerDay: input.maxScheduledRunsPerDay,
    notPlayInstalledProof: true,
    premiumProofClosed: false,
    twoDeviceProofClosed: false,
  };

  const block = (blocker, reason, overrides = {}) => ({
    ...base,
    ...overrides,
    canRun: false,
    failClosed: true,
    blocker,
    blockerClassification: "device_unavailable",
    reason,
  });

  if (!input.projectConfigured) return block("firebase_project_missing", "Firebase/GCloud project is not configured.");
  if (!input.testLabApiAvailable) return block("firebase_credentials_missing", "Firebase Test Lab catalog or API access is unavailable.");
  if (!input.artifactPresent) return block("firebase_artifact_missing", "No Android APK/AAB artifact is available for Firebase Test Lab.");
  if (input.qaTier === "tier0") return block("tier0_source_only_no_device_lab", "Tier 0 is source/backend/operator-only and does not start Firebase.");
  if (input.deviceType === "virtual" && !input.allowVirtual) return block("firebase_virtual_device_disabled", "Virtual Firebase devices are disabled by config.");
  if (input.deviceType === "physical" && !input.allowPhysical) {
    return block("firebase_physical_device_blocked_by_default", "Physical Firebase Test Lab runs require explicit owner approval.", {
      billingRisk: "paid_approval_required",
      blockerClassification: "unknown_requires_review",
    });
  }
  if (input.twoDeviceRequested && !input.allowTwoDevice) {
    return block("firebase_two_device_blocked_by_default", "Two-device Firebase runs are disabled by default and cannot close LiveKit from one run.", {
      blockerClassification: "second_device_required",
    });
  }
  if (input.broadCrawlRequested && !input.allowBroadCrawl) {
    return block("firebase_broad_crawl_blocked_by_default", "Broad Firebase crawls are disabled by default.");
  }
  if ((input.runReason === "ota_change" || input.runReason === "source_change") && !input.runOnOtaChange) {
    return block("firebase_on_change_run_disabled", "Firebase on-change runs are disabled by config.");
  }
  if (input.scheduledRequested && input.scheduledRunCountToday >= input.maxScheduledRunsPerDay) {
    return block("firebase_scheduled_daily_limit_reached", "Daily scheduled Firebase smoke limit has already been reached.");
  }
  if (!Number.isFinite(estimate.costEstimateUsd)) {
    return block("firebase_cost_unbounded", "Firebase cost estimate could not be bounded before the run.", {
      billingRisk: "unknown",
      quotaMode: "unknown",
    });
  }
  if (input.labMode === "zero_cost" && estimate.costEstimateUsd > 0) {
    return block("firebase_zero_cost_mode_blocks_paid_estimate", "Zero-cost mode requires verified free quota before running.");
  }
  if (estimate.costEstimateUsd > input.perRunCapUsd) {
    return block("firebase_per_run_cap_exceeded", "Estimated Firebase cost exceeds the per-run cap.", {
      billingRisk: "paid_approval_required",
    });
  }
  if (input.monthlySpentEstimateUsd + estimate.costEstimateUsd > input.monthlyBudgetUsd) {
    return block("firebase_monthly_cap_exceeded", "Estimated Firebase cost would exceed the monthly cap.", {
      billingRisk: "paid_approval_required",
    });
  }

  return {
    ...base,
    canRun: true,
    failClosed: false,
    blocker: null,
    blockerClassification: "unknown_requires_review",
    reason: estimate.costEstimateUsd === 0
      ? "Verified free quota allows this Firebase virtual smoke."
      : "Worst-case Firebase virtual-device cost is under per-run and monthly caps.",
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

const buildOperatorPayload = (report) => {
  const metadata = {
    provider: PROVIDER,
    proofSource: PROOF_SOURCE,
    costEstimateUsd: report.costGuard.costEstimateUsd,
    maxAllowedCostUsd: report.costGuard.maxAllowedCostUsd,
    monthlyBudgetUsd: report.costGuard.monthlyBudgetUsd,
    monthlySpentEstimateUsd: report.costGuard.monthlySpentEstimateUsd,
    billingRisk: report.costGuard.billingRisk,
    quotaMode: report.costGuard.quotaMode,
    deviceType: report.costGuard.deviceType,
    runReason: report.costGuard.runReason,
    qaTier: report.costGuard.qaTier,
    blocker: report.costGuard.blocker,
    matrixId: report.firebaseRun?.matrixId ?? null,
    fakeProof: false,
    moneyMoved: false,
    userRightsChanged: false,
    highRiskExecuted: false,
    secretsLogged: false,
  };
  if (report.firebaseRun?.started) {
    return {
      action: "record_traversal_run",
      source: PROOF_SOURCE,
      discovered_by: "device_lab",
      run_label: "firebase_test_lab_cost_capped_virtual_smoke",
      device_count: 1,
      pass_count: report.firebaseRun.status === 0 ? 1 : 0,
      failure_count: report.firebaseRun.status === 0 ? 0 : 1,
      blocked_count: 0,
      two_device_required_count: 0,
      result: report.firebaseRun.status === 0 ? "partial" : "failed",
      blocker_classification: report.firebaseRun.status === 0 ? "unknown_requires_review" : "device_unavailable",
      metadata,
    };
  }
  return {
    action: "record_device_availability",
    source: PROOF_SOURCE,
    discovered_by: "device_lab",
    device_requirement: "Firebase Test Lab cost-capped virtual-device smoke path",
    available_device_count: report.costGuard.canRun ? 1 : 0,
    required_device_count: 1,
    play_installed_device_available: false,
    device_lab_configured: Boolean(report.costGuard.canRun),
    blocker_classification: report.costGuard.blockerClassification,
    result: report.costGuard.canRun ? "partial" : "blocked",
    next_safe_action: report.costGuard.canRun
      ? "Run only bounded cost-capped Firebase virtual smoke; keep Play-installed, Premium, and two-device proof separate."
      : "Keep Firebase smoke pending or blocked until the cost/scheduler/device guard permits a run.",
    metadata,
  };
};

const reportToOperator = async (report) => {
  const token = process.env.INSTALLED_QA_OPERATOR_TOKEN;
  const explicitUrl = textEnv("INSTALLED_QA_OPERATOR_FUNCTION_URL");
  const functionsUrl = textEnv("SUPABASE_FUNCTIONS_URL");
  const url = explicitUrl || (functionsUrl ? `${functionsUrl.replace(/\/$/, "")}/${FUNCTION_NAME}` : "");
  if (!token || !url) {
    return { configured: false, reported: false, required: boolEnv("INSTALLED_QA_REPORT_REQUIRED") };
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [TOKEN_HEADER]: token,
    },
    body: JSON.stringify(buildOperatorPayload(report)),
  });
  return { configured: true, reported: response.ok, status: response.status };
};

const buildLedgerEvent = (eventType, report) => ({
  eventType,
  createdAt: new Date().toISOString(),
  month: monthKey(),
  day: dayKey(),
  systemId: SYSTEM_ID,
  provider: PROVIDER,
  proofSource: PROOF_SOURCE,
  qaTier: report.costGuard.qaTier,
  runReason: report.costGuard.runReason,
  costEstimateUsd: report.costGuard.costEstimateUsd ?? 0,
  maxAllowedCostUsd: report.costGuard.maxAllowedCostUsd,
  monthlyBudgetUsd: report.costGuard.monthlyBudgetUsd,
  monthlySpentEstimateUsd: report.costGuard.monthlySpentEstimateUsd,
  billingRisk: report.costGuard.billingRisk,
  quotaMode: report.costGuard.quotaMode,
  deviceType: report.costGuard.deviceType,
  canRun: report.costGuard.canRun,
  blocker: report.costGuard.blocker,
  matrixId: report.firebaseRun?.matrixId ?? null,
  result: report.firebaseRun?.started ? (report.firebaseRun.status === 0 ? "completed" : "failed") : "blocked_or_status",
  countAgainstBudget: Boolean(report.firebaseRun?.started),
  fakeProof: false,
  moneyMoved: false,
  userRightsChanged: false,
  highRiskExecuted: false,
  secretsLogged: false,
});

const runSelfTest = () => {
  const base = {
    labMode: "cost_capped",
    qaTier: "tier1",
    runReason: "manual",
    projectConfigured: true,
    testLabApiAvailable: true,
    artifactPresent: true,
    deviceType: "virtual",
    deviceCount: 1,
    timeout: "5m",
    plannedMinutes: 5,
    allowVirtual: true,
    allowPhysical: false,
    allowBroadCrawl: false,
    allowTwoDevice: false,
    runOnOtaChange: true,
    broadCrawlRequested: false,
    twoDeviceRequested: false,
    scheduledRequested: false,
    monthlyBudgetUsd: 5,
    perRunCapUsd: 0.25,
    maxScheduledRunsPerDay: 1,
    virtualCostPerHourUsd: 1,
    physicalCostPerHourUsd: 5,
    zeroCostConfirmed: false,
    freeQuotaVerified: false,
    quotaModeInput: "unknown",
    monthlySpentEstimateUsd: 0,
    scheduledRunCountToday: 0,
    ledgerPath: DEFAULT_LEDGER_PATH,
    currentMonth: monthKey(),
    currentDay: dayKey(),
  };
  const cases = [
    ["free run allowed", { ...base, zeroCostConfirmed: true, freeQuotaVerified: true, quotaModeInput: "free_quota" }, null, true, 0],
    ["estimated 0.08 run allowed", { ...base }, null, true, 0.09],
    ["estimated 0.50 run blocked", { ...base, plannedMinutes: 30 }, "firebase_per_run_cap_exceeded", false, 0.5],
    ["monthly cap exceeded blocks", { ...base, monthlySpentEstimateUsd: 4.95 }, "firebase_monthly_cap_exceeded", false, 0.09],
    ["physical blocked by default", { ...base, deviceType: "physical" }, "firebase_physical_device_blocked_by_default", false, 0.42],
    ["more than one scheduled run/day blocked", { ...base, runReason: "daily_scheduled", scheduledRequested: true, scheduledRunCountToday: 1 }, "firebase_scheduled_daily_limit_reached", false, 0.09],
    ["unknown unbounded cost blocked", { ...base, timeout: "bad", plannedMinutes: Number.NaN }, "firebase_cost_unbounded", false, null],
    ["two-device blocked by default", { ...base, twoDeviceRequested: true, deviceCount: 2 }, "firebase_two_device_blocked_by_default", false, 0.17],
  ];
  const failures = [];
  for (const [label, input, blocker, canRun, expectedCost] of cases) {
    const result = evaluateCostGuard(input);
    if (result.canRun !== canRun) failures.push(`${label}: canRun expected ${canRun}, got ${result.canRun}`);
    if (blocker && result.blocker !== blocker) failures.push(`${label}: blocker expected ${blocker}, got ${result.blocker}`);
    if (expectedCost !== null && result.costEstimateUsd !== expectedCost) failures.push(`${label}: cost expected ${expectedCost}, got ${result.costEstimateUsd}`);
    if (result.proofSource !== PROOF_SOURCE || !result.notPlayInstalledProof) failures.push(`${label}: Firebase proof source must not become Play-installed proof`);
    if (result.premiumProofClosed || result.twoDeviceProofClosed) failures.push(`${label}: Firebase smoke cannot close Premium/two-device proof`);
  }
  const ledgerEvent = buildLedgerEvent("run_completed", {
    costGuard: evaluateCostGuard(base),
    firebaseRun: { started: true, status: 0, matrixId: "matrix-self-test" },
  });
  if (ledgerEvent.costEstimateUsd <= 0 || ledgerEvent.maxAllowedCostUsd !== 0.25 || ledgerEvent.monthlyBudgetUsd !== 5) {
    failures.push("budget ledger event must record estimate and caps");
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
  qaPlan: {
    tier0: "source/backend/operator-only; no device lab",
    tier1: "Firebase virtual smoke; daily at most, on OTA/source change, or owner command; cost-capped",
    tier2: "broader Firebase virtual/physical; owner-approved only",
    tier3: "physical Play-installed, Premium Billing, two-device LiveKit, camera/mic, push; on-demand only",
  },
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

if (mode === "run" && costGuard.canRun) {
  const result = runQuiet("gcloud", commandArgs);
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  const matrixMatch = output.match(/matrix(?:Id| id)?[=:]\s*([A-Za-z0-9_-]+)/i)
    || output.match(/matrices\/([0-9]+)/i);
  report.firebaseRun = {
    started: true,
    status: result.status,
    matrixId: matrixMatch?.[1] ?? null,
    outputStoredInConsole: true,
  };
  report.ok = result.status === 0;
  if (result.status !== 0) report.failClosed = true;
}

if (mode === "run") {
  report.ledgerWritten = writeLedgerEvent(input.ledgerPath, buildLedgerEvent(
    report.firebaseRun?.started ? "run_completed" : "run_blocked",
    report,
  ));
}

if (flags.has("--report-operator") || boolEnv("FIREBASE_TEST_LAB_REPORT_TO_OPERATOR")) {
  report.operatorReport = await reportToOperator(report);
  if (report.operatorReport.required && !report.operatorReport.reported) {
    console.log(JSON.stringify(redact(report), null, 2));
    process.exit(1);
  }
}

console.log(JSON.stringify(redact(report), null, 2));

if (mode !== "status" && !report.ok) process.exit(1);
