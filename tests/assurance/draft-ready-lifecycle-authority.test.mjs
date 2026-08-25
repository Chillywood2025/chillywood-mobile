import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHASE1_REQUIRED_JOB_NAMES,
  phase1LifecyclePolicyRequired,
  phase1WorkflowHasRunDisplayProvenance,
  phase1WorkflowProvidesLifecycleRunProvenance,
  phase1WorkflowRequiresLifecycleBinding,
  verifyPhase1PullRequestLifecycle,
  verifyPhase1RunEvidence,
} from "../../scripts/assurance/engineering-closure.mjs";

const repository = "Chillywood2025/chillywood-mobile";
const head = "a".repeat(40);
const base = "b".repeat(40);
const tree = "c".repeat(40);
const identity = {
  repository,
  pr: 901,
  branch: "codex/draft-ready-lifecycle-proof",
  headSha: head,
  baseSha: base,
};

const jobs = PHASE1_REQUIRED_JOB_NAMES.map((name, index) => ({
  id: index + 1,
  name,
  status: "completed",
  conclusion: "success",
  head_sha: head,
}));

const runAt = (createdAt, overrides = {}) => ({
  id: 700001,
  run_attempt: 1,
  name: "Phase 1 CI",
  event: "pull_request",
  status: "completed",
  conclusion: "success",
  head_sha: head,
  head_branch: identity.branch,
  created_at: createdAt,
  display_title: `phase1 pr=${identity.pr} action=opened draft=false`,
  pull_requests: [{
    number: identity.pr,
    head: { sha: head },
    base: { sha: base },
  }],
  ...overrides,
});

const pull = (overrides = {}) => ({
  number: identity.pr,
  state: "open",
  draft: false,
  created_at: "2026-08-23T10:00:00Z",
  merged_at: null,
  head: { ref: identity.branch, sha: head, repo: { full_name: repository } },
  base: { ref: "main", sha: base, repo: { full_name: repository } },
  ...overrides,
});

const verify = ({ createdAt, pullRequest = pull(), lifecycleEvents = [], run = null, lifecyclePaginationComplete = true, lifecyclePolicyRequired = true, lifecycleDisplayProvenanceConfigured = true } = {}) => {
  const effectiveRun = run ?? runAt(createdAt);
  const options = {
    run: effectiveRun,
    jobs,
    identity,
    tree,
    pullRequest,
    lifecycleEvents,
    lifecyclePaginationComplete,
    lifecyclePolicyRequired,
    lifecycleDisplayProvenanceConfigured,
  };
  return {
    ...verifyPhase1RunEvidence(options),
    pullRequestLifecycle: verifyPhase1PullRequestLifecycle(options),
  };
};

test("ordinary opened-ready Phase 1 remains valid with the same authoritative evidence hash", () => {
  const run = runAt("2026-08-23T10:01:00Z");
  const historical = verifyPhase1RunEvidence({ run, jobs, identity, tree });
  const bound = verify({ run });

  assert.equal(historical.valid, true);
  assert.equal(bound.valid, true);
  assert.equal(bound.pullRequestLifecycle.epochEvent, "opened_ready");
  assert.equal(bound.evidenceHash, historical.evidenceHash);
});

test("a draft run cannot authorize after the same head is marked ready", () => {
  const lifecycleEvents = [{ event: "ready_for_review", created_at: "2026-08-23T10:05:00Z" }];
  const staleDraftRun = verify({
    lifecycleEvents,
    run: runAt("2026-08-23T10:01:00Z", { display_title: `phase1 pr=${identity.pr} action=opened draft=true` }),
  });
  const sameSecondDraftRun = verify({
    lifecycleEvents,
    run: runAt("2026-08-23T10:05:00Z", { display_title: `phase1 pr=${identity.pr} action=synchronize draft=true` }),
  });
  const sameSecondFreshReadyRun = verify({
    lifecycleEvents,
    run: runAt("2026-08-23T10:05:00Z", { display_title: `phase1 pr=${identity.pr} action=ready_for_review draft=false` }),
  });

  assert.equal(staleDraftRun.valid, false);
  assert.equal(staleDraftRun.pullRequestLifecycle.reason, "PHASE1_RUN_LIFECYCLE_DISPLAY_PROVENANCE_INVALID");
  assert.equal(sameSecondDraftRun.valid, false);
  assert.equal(sameSecondDraftRun.pullRequestLifecycle.reason, "PHASE1_RUN_LIFECYCLE_DISPLAY_PROVENANCE_INVALID");
  assert.equal(sameSecondFreshReadyRun.valid, true);
  assert.equal(sameSecondFreshReadyRun.pullRequestLifecycle.epochEvent, "ready_for_review");
});

test("an older ready run and its final-source reference cannot authorize after converted_to_draft", () => {
  const result = verify({
    createdAt: "2026-08-23T10:01:00Z",
    pullRequest: pull({ draft: true }),
    lifecycleEvents: [{ event: "convert_to_draft", created_at: "2026-08-23T10:05:00Z" }],
  });

  assert.equal(result.valid, false);
  assert.equal(result.result, "BLOCKED_INTERNAL");
  assert.equal(result.pullRequestLifecycle.reason, "PHASE1_PULL_REQUEST_CURRENTLY_DRAFT");
});

test("ready to draft to ready requires a new same-head Phase 1 in the latest ready epoch", () => {
  const lifecycleEvents = [
    { event: "convert_to_draft", created_at: "2026-08-23T10:05:00Z" },
    { event: "ready_for_review", created_at: "2026-08-23T10:10:00Z" },
  ];
  const staleReadyRun = verify({ createdAt: "2026-08-23T10:01:00Z", lifecycleEvents });
  const currentReadyRun = verify({
    lifecycleEvents,
    run: runAt("2026-08-23T10:10:00Z", { display_title: `phase1 pr=${identity.pr} action=ready_for_review draft=false` }),
  });

  assert.equal(staleReadyRun.valid, false);
  assert.equal(currentReadyRun.valid, true);
  assert.equal(currentReadyRun.pullRequestLifecycle.epochAt, "2026-08-23T10:10:00Z");
});

test("reopened requires fresh Phase 1 even when the source head did not change", () => {
  const lifecycleEvents = [{ event: "reopened", created_at: "2026-08-23T10:10:00Z" }];
  assert.equal(verify({ createdAt: "2026-08-23T10:01:00Z", lifecycleEvents }).valid, false);
  assert.equal(verify({ createdAt: "2026-08-23T10:10:00Z", lifecycleEvents }).valid, false);
  assert.equal(verify({
    lifecycleEvents,
    run: runAt("2026-08-23T10:10:00Z", { display_title: `phase1 pr=${identity.pr} action=reopened draft=false` }),
  }).valid, true);
  assert.equal(verify({ createdAt: "2026-08-23T10:11:00Z", lifecycleEvents }).valid, true);
});

test("edited preserves the current ready epoch but cannot substitute foreign live PR identity", () => {
  const edited = verify({
    run: runAt("2026-08-23T10:11:00Z", { display_title: `phase1 pr=${identity.pr} action=edited draft=false` }),
  });
  assert.equal(edited.valid, true);
  for (const pullRequest of [
    pull({ number: identity.pr + 1 }),
    pull({ head: { ref: identity.branch, sha: "d".repeat(40), repo: { full_name: repository } } }),
    pull({ base: { ref: "main", sha: "e".repeat(40), repo: { full_name: repository } } }),
    pull({ head: { ref: identity.branch, sha: head, repo: { full_name: "attacker/fork" } } }),
  ]) {
    const result = verify({ run: runAt("2026-08-23T10:11:00Z"), pullRequest });
    assert.equal(result.valid, false);
    assert.equal(result.pullRequestLifecycle.reason, "PHASE1_PULL_REQUEST_LIFECYCLE_IDENTITY_INVALID");
  }
});

test("policy-bound evidence rejects missing, wrong-PR, or converted-to-draft run display provenance", () => {
  const lifecycleEvents = [{ event: "ready_for_review", created_at: "2026-08-23T10:05:00Z" }];
  for (const display_title of [
    undefined,
    `phase1 pr=${identity.pr + 1} action=ready_for_review draft=false`,
    `phase1 pr=${identity.pr} action=converted_to_draft draft=true`,
    `phase1 pr=${identity.pr} action=ready_for_review draft=true`,
  ]) {
    const result = verify({
      lifecycleEvents,
      run: runAt("2026-08-23T10:05:00Z", { display_title }),
    });
    assert.equal(result.valid, false, String(display_title));
    assert.equal(result.pullRequestLifecycle.reason, "PHASE1_RUN_LIFECYCLE_DISPLAY_PROVENANCE_INVALID");
  }
  const unconfigured = verify({
    lifecycleEvents,
    lifecycleDisplayProvenanceConfigured: false,
    run: runAt("2026-08-23T10:05:00Z", { display_title: `phase1 pr=${identity.pr} action=ready_for_review draft=false` }),
  });
  assert.equal(unconfigured.valid, false);
  assert.equal(unconfigured.pullRequestLifecycle.reason, "PHASE1_RUN_LIFECYCLE_DISPLAY_PROVENANCE_INVALID");
});

test("synchronize, incomplete lifecycle discovery, and inconsistent readiness fail closed", () => {
  const changedHeadRun = runAt("2026-08-23T10:11:00Z", { head_sha: "d".repeat(40) });
  assert.equal(verify({ run: changedHeadRun }).valid, false);

  const incomplete = verify({ createdAt: "2026-08-23T10:11:00Z", lifecyclePaginationComplete: false });
  assert.equal(incomplete.valid, false);
  assert.equal(incomplete.pullRequestLifecycle.reason, "PHASE1_PULL_REQUEST_LIFECYCLE_DISCOVERY_INCOMPLETE");

  const inconsistent = verify({
    createdAt: "2026-08-23T10:11:00Z",
    lifecycleEvents: [{ event: "convert_to_draft", created_at: "2026-08-23T10:10:00Z" }],
  });
  assert.equal(inconsistent.valid, false);
  assert.equal(inconsistent.pullRequestLifecycle.reason, "PHASE1_PULL_REQUEST_LIFECYCLE_STATE_INCONSISTENT");

  const ambiguous = verify({
    createdAt: "2026-08-23T10:11:00Z",
    lifecycleEvents: [
      { event: "convert_to_draft", created_at: "2026-08-23T10:10:00Z" },
      { event: "ready_for_review", created_at: "2026-08-23T10:10:00Z" },
    ],
  });
  assert.equal(ambiguous.valid, false);
  assert.equal(ambiguous.pullRequestLifecycle.reason, "PHASE1_PULL_REQUEST_LIFECYCLE_TIMESTAMP_AMBIGUOUS");
});

test("merged pre-policy historical exact-head evidence remains durable but future policy-bound merges stay strict", () => {
  const run = runAt("2026-08-23T10:01:00Z");
  const historical = verifyPhase1RunEvidence({ run, jobs, identity, tree });
  const pullRequest = pull({ state: "closed", merged_at: "2026-08-23T10:20:00Z", base: { ref: "main", sha: "e".repeat(40), repo: { full_name: repository } } });
  const lifecycleEvents = [{ event: "ready_for_review", created_at: "2026-08-23T10:05:00Z" }];
  const mergedLegacy = verify({
    run,
    pullRequest,
    lifecycleEvents,
    lifecyclePolicyRequired: false,
  });
  const mergedPolicyBound = verify({ run, pullRequest, lifecycleEvents });

  assert.equal(mergedLegacy.valid, true);
  assert.equal(mergedLegacy.pullRequestLifecycle.epochEvent, "legacy_merged_historical");
  assert.equal(mergedLegacy.evidenceHash, historical.evidenceHash);
  assert.equal(mergedPolicyBound.valid, false);
  assert.equal(mergedPolicyBound.pullRequestLifecycle.reason, "PHASE1_RUN_PREDATES_CURRENT_READY_LIFECYCLE");
});

test("workflow lifecycle policy activation requires the exact generic trigger set", () => {
  const exactRunName = 'run-name: "phase1 pr=${{ github.event.pull_request.number }} action=${{ github.event.action }} draft=${{ github.event.pull_request.draft }}"';
  const policyWorkflow = `${exactRunName}\non:\n  pull_request:\n    types: [opened, synchronize, reopened, edited, ready_for_review, converted_to_draft]\n`;
  const legacyWorkflow = `on:\n  pull_request:\n`;
  assert.equal(phase1WorkflowRequiresLifecycleBinding(policyWorkflow), true);
  assert.equal(phase1WorkflowRequiresLifecycleBinding(`on:\n  pull_request:\n    types:\n      - opened\n      - synchronize\n      - reopened\n      - edited\n      - ready_for_review\n      - converted_to_draft\n  push:\n    branches: [main]\n`), true);
  assert.equal(phase1WorkflowRequiresLifecycleBinding(legacyWorkflow), false);
  assert.equal(phase1WorkflowRequiresLifecycleBinding(`on:\n  pull_request:\n    # ready_for_review converted_to_draft\n`), false);
  assert.equal(phase1WorkflowRequiresLifecycleBinding(`on:\n  pull_request:\n    types: [opened, synchronize, reopened, edited, ready_for_review, converted_to_draft, labeled]\n`), false);
  assert.equal(phase1WorkflowRequiresLifecycleBinding(`on:\n  pull_request:\n    types: [opened, synchronize, reopened, edited, ready_for_review, converted_to_draft, opened]\n`), false);
  assert.equal(
    phase1WorkflowRequiresLifecycleBinding(readFileSync(".github/workflows/phase1-ci.yml", "utf8")),
    true,
    "the checked-in Phase 1 workflow must trigger every readiness lifecycle transition",
  );
  assert.equal(
    phase1WorkflowHasRunDisplayProvenance(readFileSync(".github/workflows/phase1-ci.yml", "utf8")),
    true,
    "the checked-in Phase 1 workflow must bind PR action and draft state into the run display title",
  );
  assert.equal(
    phase1WorkflowProvidesLifecycleRunProvenance(readFileSync(".github/workflows/phase1-ci.yml", "utf8")),
    true,
  );
  assert.equal(phase1WorkflowHasRunDisplayProvenance(`name: Phase 1 CI\n  ${exactRunName}\n`), false);
  assert.equal(phase1WorkflowHasRunDisplayProvenance(`${exactRunName}\nrun-name: attacker-controlled\n`), false);
  assert.equal(phase1LifecyclePolicyRequired({
    headWorkflowSource: legacyWorkflow,
    baseWorkflowSource: policyWorkflow,
  }), true, "a head cannot downgrade policy inherited from its protected base");
  assert.equal(phase1LifecyclePolicyRequired({
    headWorkflowSource: legacyWorkflow,
    baseWorkflowSource: legacyWorkflow,
  }), false, "verifiable pre-policy history retains merged-only compatibility");
  assert.equal(phase1LifecyclePolicyRequired({
    headWorkflowSource: legacyWorkflow,
    baseWorkflowSource: legacyWorkflow,
    baseWorkflowReadable: false,
  }), true, "unreadable protected provenance fails closed");
});

test("a canonical protected base cannot substitute for current-head lifecycle provenance", () => {
  const exactRunName = 'run-name: "phase1 pr=${{ github.event.pull_request.number }} action=${{ github.event.action }} draft=${{ github.event.pull_request.draft }}"';
  const policyWorkflow = `${exactRunName}\non:\n  pull_request:\n    types: [opened, synchronize, reopened, edited, ready_for_review, converted_to_draft]\n`;
  const hardcodedHead = `run-name: "phase1 pr=901 action=ready_for_review draft=false"\non:\n  pull_request:\n    types: [opened, synchronize, reopened, edited, ready_for_review, converted_to_draft]\n`;
  const missingTypesHead = `${exactRunName}\non:\n  pull_request:\n`;

  for (const headWorkflowSource of [hardcodedHead, missingTypesHead]) {
    assert.equal(phase1LifecyclePolicyRequired({
      headWorkflowSource,
      baseWorkflowSource: policyWorkflow,
    }), true, "the base must retain policy activation");
    assert.equal(
      phase1WorkflowProvidesLifecycleRunProvenance(headWorkflowSource),
      false,
      "only the exact current-head trigger and event-derived run-name may prove lifecycle provenance",
    );
    const result = verify({
      createdAt: "2026-08-23T10:05:00Z",
      lifecycleEvents: [{ event: "ready_for_review", created_at: "2026-08-23T10:05:00Z" }],
      lifecycleDisplayProvenanceConfigured: false,
      run: runAt("2026-08-23T10:05:00Z", {
        display_title: `phase1 pr=${identity.pr} action=ready_for_review draft=false`,
      }),
    });
    assert.equal(result.valid, false);
    assert.equal(result.pullRequestLifecycle.reason, "PHASE1_RUN_LIFECYCLE_DISPLAY_PROVENANCE_INVALID");
  }
});
