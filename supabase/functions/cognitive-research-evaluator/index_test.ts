import { handler, researchEvaluationGateOpen } from "./index.ts";
import {
  evaluateStoredResearchClaim,
  type ResearchSnapshot,
} from "./policy.ts";

const assert: (
  condition: unknown,
  message: string,
) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const hash = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const buildSnapshot = async (): Promise<ResearchSnapshot> => {
  const excerpt =
    "Official public documentation with bounded technical guidance.";
  const contentHash = await hash(excerpt);
  const sourceId = "00000000-0000-4000-8000-000000000003";
  return {
    claim: {
      bounded_claim: "The reviewed public documentation supports this claim.",
      category: "technical",
      claim_hash: await hash(
        "The reviewed public documentation supports this claim.",
      ),
      confidence: 0.9,
      contradiction_state: "none",
      environment: "production",
      freshness_deadline: "2026-07-25T12:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000004",
      platform: "shared",
      project_id: "00000000-0000-4000-8000-000000000001",
      status: "supported",
      support_state: "supported",
      task_id: "00000000-0000-4000-8000-000000000002",
    },
    contradictions: [],
    relations: [{ relationship: "supports", source_id: sourceId }],
    retrievals: [{
      id: "00000000-0000-4000-8000-000000000005",
      request_url_hash: "b".repeat(64),
      resolved_address_hashes: ["c".repeat(64)],
      response_hash: contentHash,
      result: "accepted",
      source_id: sourceId,
    }],
    sources: [{
      bounded_excerpt: excerpt,
      canonical_url_hash: "b".repeat(64),
      citation_metadata: {
        locator: "Developer documentation",
        title: "Official documentation",
      },
      content_hash: contentHash,
      freshness_deadline: "2026-07-25T12:00:00.000Z",
      id: sourceId,
      is_primary: true,
      ownership_identity: "apple",
      source_type: "official_documentation",
      trusted_for_tool_execution: false,
    }],
  };
};

const evaluationGateClient = (researchEnabled: boolean) => {
  const results: Record<string, { data: unknown; error: null }> = {
    autonomous_system_emergency_states: {
      data: { status: "active", system_id: "product_intelligence_operator" },
      error: null,
    },
    cognitive_governance_switches: {
      data: [
        {
          enabled: researchEnabled,
          switch_key: "cognitive_research_enabled",
        },
        { enabled: true, switch_key: "cognitive_memory_enabled" },
        {
          enabled: false,
          switch_key: "cognitive_user_derived_memory_enabled",
        },
      ],
      error: null,
    },
    cognitive_retention_policy_states: {
      data: {
        policy_state: "owner_counsel_decision_required",
        private_model_input_allowed: false,
        raw_private_media_allowed: false,
        raw_private_messages_allowed: false,
        raw_user_analytics_allowed: false,
        raw_user_reports_allowed: false,
        user_derived_memory_allowed: false,
      },
      error: null,
    },
    intelligence_tasks: {
      data: {
        cancelled_at: null,
        deadman_at: "2026-07-24T12:00:00.000Z",
        id: "00000000-0000-4000-8000-000000000002",
        quarantined_at: null,
      },
      error: null,
    },
  };
  return {
    from(table: string) {
      const builder = {
        eq: () => builder,
        gt: () => builder,
        in: () => Promise.resolve(results[table]),
        is: () => builder,
        maybeSingle: () => Promise.resolve(results[table]),
        select: () => builder,
      };
      return builder;
    },
  };
};

Deno.test("independent research evaluator passes complete stored provenance", async () => {
  const snapshot = await buildSnapshot();
  const result = await evaluateStoredResearchClaim(
    snapshot,
    new Date("2026-07-23T12:00:00.000Z"),
  );
  assert(result.status === "pass", "complete stored provenance should pass");
  assert(
    result.reasons.length === 0,
    "passing evaluation should be reason-free",
  );
  assert(
    /^[a-f0-9]{64}$/u.test(result.evidenceHash),
    "evidence must be hashed",
  );
});

Deno.test("independent evaluator blocks stale or unresolved research", async () => {
  const snapshot = await buildSnapshot();
  const result = await evaluateStoredResearchClaim(
    {
      ...snapshot,
      claim: {
        ...snapshot.claim,
        contradiction_state: "unresolved",
        freshness_deadline: "2026-07-22T12:00:00.000Z",
      },
      contradictions: [{ resolution_state: "open" }],
    },
    new Date("2026-07-23T12:00:00.000Z"),
  );
  assert(
    result.status === "blocked",
    "stale contradictory evidence must block",
  );
  assert(
    result.reasons.includes("claim_expired") &&
      result.reasons.includes("open_contradiction_exists"),
    "blockers must be explicit",
  );
});

Deno.test("independent evaluator fails hash and broker-receipt mismatches", async () => {
  const snapshot = await buildSnapshot();
  const result = await evaluateStoredResearchClaim(
    {
      ...snapshot,
      retrievals: [{
        ...snapshot.retrievals[0],
        response_hash: "d".repeat(64),
      }],
      sources: [{
        ...snapshot.sources[0],
        content_hash: "e".repeat(64),
      }],
    },
    new Date("2026-07-23T12:00:00.000Z"),
  );
  assert(result.status === "fail", "tampered provenance must fail");
  assert(
    result.reasons.includes("source_content_hash_mismatch") &&
      result.reasons.includes("broker_retrieval_receipt_invalid"),
    "tamper reasons must identify source and receipt bindings",
  );
});

Deno.test("technical claims require a reviewed official primary source", async () => {
  const snapshot = await buildSnapshot();
  const result = await evaluateStoredResearchClaim(
    {
      ...snapshot,
      sources: [{
        ...snapshot.sources[0],
        is_primary: false,
        source_type: "engineering_practice",
      }],
    },
    new Date("2026-07-23T12:00:00.000Z"),
  );
  assert(result.status === "fail", "non-primary technical support must fail");
  assert(
    result.reasons.includes("official_primary_source_required"),
    "primary-source requirement must be explicit",
  );
});

Deno.test("research evaluator obeys switch revocation independently", async () => {
  const request = {
    action: "evaluate_research_claim" as const,
    environment: "production" as const,
    platform: "shared" as const,
    projectId: "00000000-0000-4000-8000-000000000001",
    researchClaimId: "00000000-0000-4000-8000-000000000004",
    taskId: "00000000-0000-4000-8000-000000000002",
  };
  assert(
    await researchEvaluationGateOpen(
      evaluationGateClient(true) as unknown as Parameters<
        typeof researchEvaluationGateOpen
      >[0],
      request,
    ),
    "enabled public research state should permit evaluation",
  );
  assert(
    !await researchEvaluationGateOpen(
      evaluationGateClient(false) as unknown as Parameters<
        typeof researchEvaluationGateOpen
      >[0],
      request,
    ),
    "research switch revocation must stop evaluation",
  );
});

Deno.test("research evaluator HTTP endpoint requires a distinct invocation proof", async () => {
  const response = await handler(
    new Request("https://local.invalid/functions/v1/research-evaluator", {
      body: JSON.stringify({
        action: "evaluate_research_claim",
        environment: "production",
        platform: "shared",
        projectId: "00000000-0000-4000-8000-000000000001",
        researchClaimId: "00000000-0000-4000-8000-000000000004",
        taskId: "00000000-0000-4000-8000-000000000002",
      }),
      method: "POST",
    }),
  );
  assert(response.status === 401, "missing invocation proof must be rejected");
  const body = await response.json();
  assert(
    body.error === "research_evaluator_invocation_required",
    "rejection should not expose evaluator configuration",
  );
});
