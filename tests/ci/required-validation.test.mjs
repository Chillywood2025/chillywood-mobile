import assert from "node:assert/strict";
import test from "node:test";

import { computeValidationPlan, evaluateRun, evaluateWorkflowSnapshot, expectedJobs, validatePublisherAppIdentity } from "../../scripts/ci/required-validation.mjs";

const sha = (character) => character.repeat(40);
const successfulJobs = (paths) => expectedJobs(computeValidationPlan(paths)).map((name) => ({ name, status: "completed", conclusion: "success", headSha: sha("b") }));
const evaluate = (paths, overrides = {}) => evaluateRun({
  baseRef: "main",
  baseSha: sha("a"),
  headSha: sha("b"),
  paths,
  jobs: successfulJobs(paths),
  reviews: [],
  author: "contributor",
  ...overrides,
});

test("ordinary product source selects core and product checks without legacy authority", () => {
  const result = evaluate(["app/index.tsx"]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.requiredJobs, ["Validation / Plan", "Validation / Core", "Validation / Results", "Validation / Product"]);
});

test("known documentation and historical task artifacts avoid diff-size authority accounting", () => {
  const paths = ["docs/assurance/tasks/large-historical-artifact.json"];
  const result = evaluate(paths);
  assert.equal(result.ok, true);
  assert.deepEqual(result.requiredJobs, ["Validation / Plan", "Validation / Core", "Validation / Results"]);
});

test("unknown paths conservatively select every category", () => {
  const plan = computeValidationPlan(["new-system/unknown.bin"]);
  assert.equal(plan.conservative, true);
  assert.ok(Object.values(plan.categories).every(Boolean));
});

test("auth, database, native, release and CI paths select proportionate strict checks", () => {
  assert.equal(computeValidationPlan(["app/(auth)/login.tsx"]).categories.sensitive, true);
  assert.equal(computeValidationPlan(["app/admin.tsx"]).categories.sensitive, true);
  assert.equal(computeValidationPlan(["app/premium.tsx"]).categories.sensitive, true);
  assert.equal(computeValidationPlan(["components/monetization/tip-sheet.tsx"]).categories.sensitive, true);
  assert.equal(computeValidationPlan(["components/communication/in-room-communication-panel.tsx"]).categories.sensitive, true);
  assert.equal(computeValidationPlan(["supabase/migrations/1.sql"]).categories.database, true);
  assert.equal(computeValidationPlan(["ios/AppDelegate.swift"]).categories.nativeRelease, true);
  assert.equal(computeValidationPlan(["scripts/publish-internal-v2-ota.mjs"]).categories.nativeRelease, true);
  assert.equal(computeValidationPlan([".github/workflows/required-validation.yml"]).categories.policy, true);
});

test("policy changes require a trusted exact-head review from someone other than author", () => {
  const paths = [".github/workflows/required-validation.yml"];
  const jobs = successfulJobs(paths);
  assert.ok(evaluate(paths, { jobs }).findings.includes("VALIDATION_POLICY_REVIEW_REQUIRED"));
  const approved = { id: 1, state: "APPROVED", authorAssociation: "OWNER", user: "reviewer", commitId: sha("b"), submittedAt: "2026-09-24T10:00:00Z" };
  assert.equal(evaluate(paths, { jobs, reviews: [approved] }).ok, true);
  assert.equal(evaluate(paths, { jobs, reviews: [{ ...approved, user: "contributor" }] }).ok, false);
  assert.equal(evaluate(paths, { jobs, reviews: [{ ...approved, commitId: sha("c") }] }).ok, false);
  assert.equal(evaluate(paths, { jobs, reviews: [{ ...approved, authorAssociation: "NONE" }] }).ok, false);
  assert.equal(evaluate(paths, { jobs, reviews: [approved, { ...approved, id: 2, state: "CHANGES_REQUESTED", submittedAt: "2026-09-24T11:00:00Z" }] }).ok, false);
  assert.equal(evaluate(paths, { jobs, reviews: [{ ...approved, state: "CHANGES_REQUESTED" }, { ...approved, id: 2, submittedAt: "2026-09-24T11:00:00Z" }] }).ok, true);
  assert.equal(evaluate(paths, { jobs, reviews: [approved, { ...approved, id: 2, state: "DISMISSED", submittedAt: "2026-09-24T11:00:00Z" }] }).ok, false);
});

test("missing, failed, cancelled, skipped, timed-out, stale and wrong-base evidence blocks", () => {
  const paths = ["app/index.tsx"];
  const jobs = successfulJobs(paths);
  assert.equal(evaluate(paths, { jobs: jobs.slice(0, -1) }).ok, false);
  for (const conclusion of ["failure", "cancelled", "skipped", "timed_out", null]) {
    const mutated = structuredClone(jobs);
    mutated[1].conclusion = conclusion;
    assert.equal(evaluate(paths, { jobs: mutated }).ok, false);
  }
  const stale = structuredClone(jobs);
  stale[1].headSha = sha("c");
  assert.equal(evaluate(paths, { jobs: stale }).ok, false);
  assert.equal(evaluate(paths, { jobs, baseRef: "release" }).ok, false);
  assert.equal(evaluate(paths, { jobs: [...jobs, jobs[0]] }).ok, false);
});

test("untrusted labels or caller classifications cannot downgrade a sensitive diff", () => {
  const plan = computeValidationPlan(["supabase/functions/auth/index.ts"]);
  assert.equal(plan.categories.database, true);
  assert.equal(plan.categories.sensitive, true);
  assert.equal("labels" in plan, false);
});

test("concurrent candidates are independent and changing one head invalidates only its evidence", () => {
  const paths = ["components/Card.tsx"];
  const jobsA = successfulJobs(paths);
  const jobsB = jobsA.map((job) => ({ ...job, headSha: sha("c") }));
  assert.equal(evaluate(paths, { jobs: jobsA, headSha: sha("b") }).ok, true);
  assert.equal(evaluate(paths, { jobs: jobsB, headSha: sha("c") }).ok, true);
  assert.equal(evaluate(paths, { jobs: jobsA, headSha: sha("c") }).ok, false);
});

test("protected publisher rejects wrong workflow, stale source, incomplete paths and wrong PR identity", () => {
  const head = sha("b");
  const files = [{ filename: "app/index.tsx" }];
  const jobs = successfulJobs(files.map((file) => file.filename)).map((job) => ({ ...job, headSha: undefined }));
  const snapshot = {
    repository: "Chillywood2025/chillywood-mobile",
    run: { event: "pull_request", name: "Chi'llywood Source Validation", path: ".github/workflows/required-validation.yml", status: "completed", conclusion: "success", head_sha: head, pull_requests: [{ number: 7, head: { sha: head }, base: { ref: "main", sha: sha("a") } }] },
    pull: { number: 7, state: "open", changed_files: 1, user: { login: "contributor" }, head: { sha: head }, base: { ref: "main", sha: sha("a"), repo: { full_name: "Chillywood2025/chillywood-mobile" } } },
    files,
    runJobs: jobs,
    reviews: [],
  };
  assert.equal(evaluateWorkflowSnapshot(snapshot).ok, true);
  assert.throws(() => evaluateWorkflowSnapshot({ ...snapshot, run: { ...snapshot.run, name: "forged" } }), /VALIDATION_WORKFLOW_RUN_INVALID/u);
  assert.throws(() => evaluateWorkflowSnapshot({ ...snapshot, run: { ...snapshot.run, path: ".github/workflows/forged.yml" } }), /VALIDATION_WORKFLOW_RUN_INVALID/u);
  assert.throws(() => evaluateWorkflowSnapshot({ ...snapshot, run: { ...snapshot.run, conclusion: "failure" } }), /VALIDATION_WORKFLOW_RUN_INVALID/u);
  assert.throws(() => evaluateWorkflowSnapshot({ ...snapshot, run: { ...snapshot.run, head_sha: sha("c") } }), /VALIDATION_WORKFLOW_HEAD_STALE/u);
  assert.throws(() => evaluateWorkflowSnapshot({ ...snapshot, run: { ...snapshot.run, pull_requests: [{ ...snapshot.run.pull_requests[0], base: { ref: "main", sha: sha("c") } }] } }), /VALIDATION_WORKFLOW_BASE_STALE/u);
  assert.throws(() => evaluateWorkflowSnapshot({ ...snapshot, files: [] }), /VALIDATION_CHANGED_PATHS_INCOMPLETE/u);
  assert.throws(() => evaluateWorkflowSnapshot({ ...snapshot, pull: { ...snapshot.pull, number: 8 } }), /VALIDATION_PULL_REQUEST_IDENTITY_INVALID/u);
});

test("required result is bound to the dedicated checks-only App and one repository", () => {
  process.env.PHASE1_ADMISSION_APP_CLIENT_ID = "Iv1.client";
  process.env.PHASE1_ADMISSION_APP_INSTALLATION_ID = "123";
  const expected = {
    integrationId: 4707730,
    clientIdVariable: "PHASE1_ADMISSION_APP_CLIENT_ID",
    installationIdVariable: "PHASE1_ADMISSION_APP_INSTALLATION_ID",
    owner: "Chillywood2025",
    slug: "chillywood-phase1-admission-app",
    repositorySelection: "selected",
    permissions: { checks: "write", metadata: "read" },
  };
  const input = {
    repository: "Chillywood2025/chillywood-mobile",
    app: { id: 4707730, client_id: "Iv1.client", owner: { login: "Chillywood2025" }, slug: "chillywood-phase1-admission-app", permissions: { metadata: "read", checks: "write" } },
    installation: { id: 123, app_id: 4707730, account: { login: "Chillywood2025" }, repository_selection: "selected", suspended_at: null, permissions: { checks: "write", metadata: "read" } },
    repositories: { total_count: 1, repositories: [{ full_name: "Chillywood2025/chillywood-mobile" }] },
    expected,
  };
  assert.equal(validatePublisherAppIdentity(input).ok, true);
  assert.equal(validatePublisherAppIdentity({ ...input, app: { ...input.app, id: 15368 } }).ok, false);
  assert.equal(validatePublisherAppIdentity({ ...input, app: { ...input.app, permissions: { ...input.app.permissions, contents: "write" } } }).ok, false);
  assert.equal(validatePublisherAppIdentity({ ...input, repositories: { total_count: 1, repositories: [{ full_name: "Chillywood2025/other" }] } }).ok, false);
  delete process.env.PHASE1_ADMISSION_APP_CLIENT_ID;
  delete process.env.PHASE1_ADMISSION_APP_INSTALLATION_ID;
});
