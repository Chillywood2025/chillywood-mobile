#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const shouldBuild = args.has("--build");
const shouldRun = args.has("--run");
const shouldDownload = args.has("--download");
const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");

const project = process.env.FIREBASE_TEST_LAB_PROJECT || "chillywood-app";
const apk =
  process.env.FIREBASE_TEST_LAB_APK ||
  "android/app/build/outputs/apk/release/app-release.apk";
const device =
  process.env.FIREBASE_TEST_LAB_DEVICE ||
  "model=MediumPhone.arm,version=35,locale=en,orientation=portrait";
const timeout = process.env.FIREBASE_TEST_LAB_TIMEOUT || "5m";
const resultsDir =
  process.env.FIREBASE_TEST_LAB_RESULTS_DIR || `chillywood-smoke-${stamp}`;
const proofDir =
  process.env.FIREBASE_TEST_LAB_PROOF_DIR ||
  `/tmp/chillywood-firebase-test-lab-proof-${today}`;

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    cwd: options.cwd || process.cwd(),
  });
  if (result.status !== 0 && !options.allowFailure) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${commandArgs.join(" ")} failed\n${output}`);
  }
  return result;
}

function commandExists(command) {
  const result = spawnSync("command", ["-v", command], {
    encoding: "utf8",
    shell: true,
  });
  return result.status === 0;
}

mkdirSync(proofDir, { recursive: true });

const environment = [
  `timestamp=${new Date().toISOString()}`,
  `project=${project}`,
  `apk=${apk}`,
  `device=${device}`,
  `timeout=${timeout}`,
  `results_dir=${resultsDir}`,
  `proof_dir=${proofDir}`,
  `build_requested=${shouldBuild}`,
  `run_requested=${shouldRun}`,
  `download_requested=${shouldDownload}`,
].join("\n");
writeFileSync(join(proofDir, "00-environment.txt"), `${environment}\n`);

if (!commandExists("gcloud")) {
  throw new Error(
    "gcloud is not installed or not on PATH. Install Google Cloud SDK before running Firebase Test Lab.",
  );
}

if (shouldBuild) {
  console.log("Building Android release APK for Firebase Test Lab...");
  const build = run("./gradlew", ["assembleRelease", "bundleRelease"], {
    cwd: "android",
    stdio: "pipe",
  });
  writeFileSync(
    join(proofDir, "02-gradle-release-build.log"),
    [build.stdout, build.stderr].filter(Boolean).join("\n"),
  );
}

const auth = run("gcloud", ["auth", "list"], { allowFailure: true });
writeFileSync(
  join(proofDir, "01-gcloud-auth-list.txt"),
  [auth.stdout, auth.stderr].filter(Boolean).join("\n"),
);

const config = run("gcloud", ["config", "list"], { allowFailure: true });
writeFileSync(
  join(proofDir, "01-gcloud-config-list.txt"),
  [config.stdout, config.stderr].filter(Boolean).join("\n"),
);

const services = run(
  "gcloud",
  [
    "services",
    "list",
    "--enabled",
    "--project",
    project,
    "--filter=name:(firebase.googleapis.com OR testing.googleapis.com)",
  ],
  { allowFailure: true },
);
writeFileSync(
  join(proofDir, "07-services-status.txt"),
  [services.stdout, services.stderr].filter(Boolean).join("\n"),
);

if (existsSync(apk)) {
  const shasum = run("shasum", ["-a", "256", apk], { allowFailure: true });
  writeFileSync(
    join(proofDir, "03-build-artifacts.txt"),
    [`apk=${apk}`, shasum.stdout.trim()].join("\n") + "\n",
  );
} else {
  writeFileSync(
    join(proofDir, "03-build-artifacts.txt"),
    `apk_missing=${apk}\nRun with --build or build the release APK first.\n`,
  );
}

const models = run(
  "gcloud",
  ["firebase", "test", "android", "models", "list", "--filter=form=VIRTUAL"],
  { allowFailure: true },
);
writeFileSync(
  join(proofDir, "04-test-lab-models.txt"),
  [models.stdout, models.stderr].filter(Boolean).join("\n"),
);

const versions = run(
  "gcloud",
  ["firebase", "test", "android", "versions", "list"],
  { allowFailure: true },
);
writeFileSync(
  join(proofDir, "05-test-lab-versions.txt"),
  [versions.stdout, versions.stderr].filter(Boolean).join("\n"),
);

const runCommand = [
  "gcloud",
  "firebase",
  "test",
  "android",
  "run",
  "--type",
  "robo",
  "--app",
  apk,
  "--device",
  device,
  "--timeout",
  timeout,
  "--project",
  project,
  "--results-dir",
  resultsDir,
];
writeFileSync(join(proofDir, "08-test-lab-command.txt"), `${runCommand.join(" ")}\n`);

if (!shouldRun) {
  console.log(`Firebase Test Lab preflight written to ${proofDir}`);
  console.log("No test was started. Re-run with --run to consume Test Lab quota.");
  console.log(runCommand.join(" "));
  process.exit(0);
}

if (!existsSync(apk)) {
  throw new Error(`APK not found: ${apk}. Run with --build or build the release APK first.`);
}

console.log("Starting one bounded Firebase Test Lab Robo run...");
const testRun = run(runCommand[0], runCommand.slice(1), { allowFailure: true });
const testRunOutput = [testRun.stdout, testRun.stderr].filter(Boolean).join("\n");
writeFileSync(join(proofDir, "09-test-lab-robo-run.log"), testRunOutput);
if (testRun.status !== 0) {
  throw new Error(`Firebase Test Lab run failed. See ${join(proofDir, "09-test-lab-robo-run.log")}`);
}

if (shouldDownload) {
  console.log(
    "Download requested, but result bucket paths differ per run. Use the GCS path printed in 09-test-lab-robo-run.log and the runbook download command.",
  );
}

console.log(`Firebase Test Lab proof written to ${proofDir}`);
