#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectTerminalSynchronization } from "./control-plane-v2.mjs";
import { renderCurrentState, renderNextTask } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TRUTH_PATH = path.join(ROOT, "config/assurance/current-truth-v1.json");
const CURRENT_STATE_PATH = path.join(ROOT, "CURRENT_STATE.md");
const NEXT_TASK_PATH = path.join(ROOT, "NEXT_TASK.md");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const transitionArg = process.argv.find((value) => value.startsWith("--transition="));
const write = process.argv.includes("--write");
const record = readJson(TRUTH_PATH);

if (!transitionArg) {
  const noActiveTask = record.activeTaskBinding === null
    && record.engineeringDoctrine?.activeTaskSentinel === "NO_ACTIVE_PRODUCT_IMPLEMENTATION"
    && record.engineeringDoctrine?.taskLeaseState === "NO_ACTIVE_TASK"
    && record.finiteTaskRuntime?.terminalOutcome?.schemaVersion === 3;
  const result = {
    schemaVersion: 1,
    classification: noActiveTask ? "TERMINAL_SYNCHRONIZATION_NO_OP" : "TERMINAL_SYNCHRONIZATION_TRANSITION_REQUIRED",
    ok: noActiveTask,
    mutated: false,
    taskId: record.finiteTaskRuntime?.terminalOutcome?.taskId ?? null,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
} else {
  const transitionPath = path.resolve(ROOT, transitionArg.slice("--transition=".length));
  const transition = readJson(transitionPath);
  const result = projectTerminalSynchronization({ record, transition });
  if (result.ok && write && result.mutated) {
    fs.writeFileSync(TRUTH_PATH, `${JSON.stringify(result.record)}\n`);
    fs.writeFileSync(CURRENT_STATE_PATH, renderCurrentState(result.record));
    fs.writeFileSync(NEXT_TASK_PATH, renderNextTask(result.record));
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    classification: result.ok ? (result.mutated ? "TERMINAL_SYNCHRONIZATION_CONVERGED" : "TERMINAL_SYNCHRONIZATION_NO_OP") : "TERMINAL_SYNCHRONIZATION_INVALID",
    ok: result.ok,
    mutated: result.mutated,
    taskId: transition.taskId ?? null,
    findings: result.findings,
  })}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
