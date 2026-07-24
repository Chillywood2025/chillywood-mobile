import {
  createHandler,
  hashEvidencePacket,
  isStrictAdvisoryOutput,
  isStrictModelRequest,
  openAiResponsesTransport,
  promptTemplateVersionHash,
  sha256Hex,
} from "./index.ts";

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertEquals = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
};

const evidencePacket = () => ({
  observationCategory: "product_experience" as const,
  surface: "android/live",
  observations: [{
    evidenceId: "live-loading-01",
    claim: "The route displayed a loading state for twelve seconds.",
    status: "fail" as const,
    metrics: [{
      name: "first_interactive_ms",
      unit: "ms",
      value: 12_000,
    }],
  }],
});

const validPayload = async () => {
  const packet = evidencePacket();
  return {
    action: "assess_sanitized_evidence" as const,
    schemaVersion: "cognitive-model-advisory-v1" as const,
    assessmentId: "android-live-advisory-01",
    taskId: "11111111-1111-4111-8111-111111111111",
    projectId: "22222222-2222-4222-8222-222222222222",
    platform: "android" as const,
    environment: "production" as const,
    councilRole: "product_user_experience" as const,
    blindFirstRound: true as const,
    evidencePacketHash: await hashEvidencePacket(packet),
    evidencePacket: packet,
    budget: {
      maxCostUsd: 0.5,
      maxDurationMs: 10_000,
      maxOutputTokens: 600,
    },
  };
};

const advisory = () => ({
  verdict: "investigate",
  confidence: 0.8,
  summary: "The bounded evidence supports another direct observation.",
  findings: [{
    findingKey: "live.loading.suspected",
    severity: "medium",
    classification: "suspected",
    summary: "The route may be slow to become interactive.",
    rationale: "The measured interval exceeded the bounded observation window.",
    evidenceIds: ["live-loading-01"],
  }],
  uncertainties: ["The evidence does not identify the underlying layer."],
  recommendedNextSteps: [{
    kind: "reproduce",
    summary: "Repeat the same bounded observation with network timing.",
  }],
});

const invocationToken = "bounded-model-router-invocation";
const invocationHash = await sha256Hex(invocationToken);

const testEnv = (overrides: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    COGNITIVE_MODEL_ROUTER_INVOKE_SHA256: invocationHash,
    COGNITIVE_MODEL_PROVIDER: "openai",
    COGNITIVE_MODEL_FAMILY: "gpt-5.6",
    COGNITIVE_MODEL_NAME: "gpt-5.6-luna",
    COGNITIVE_MODEL_OPENAI_API_KEY: "test-only-provider-value",
    COGNITIVE_MODEL_INPUT_USD_PER_MILLION: "1",
    COGNITIVE_MODEL_OUTPUT_USD_PER_MILLION: "6",
    ...overrides,
  };
  return (name: string): string | undefined => values[name];
};

const requestFor = (
  payload: unknown,
  headers: Record<string, string> = {},
): Request =>
  new Request("http://localhost/cognitive-model-router", {
    method: "POST",
    headers: {
      authorization: "Bearer platform-verified-jwt-fixture",
      "content-type": "application/json",
      "x-cognitive-model-router-invocation": invocationToken,
      ...headers,
    },
    body: JSON.stringify(payload),
  });

Deno.test("strict model request accepts the exact bounded advisory schema", async () => {
  assert(
    isStrictModelRequest(await validPayload()),
    "valid payload was rejected",
  );
});

Deno.test("strict model request rejects extras, unsafe evidence, and authority-bearing flags", async () => {
  const payload = await validPayload();
  const rejected = [
    { ...payload, extra: true },
    { ...payload, blindFirstRound: false },
    { ...payload, action: "approve_assessment" },
    {
      ...payload,
      evidencePacket: {
        ...payload.evidencePacket,
        observations: [{
          ...payload.evidencePacket.observations[0],
          password: "forbidden",
        }],
      },
    },
    {
      ...payload,
      budget: { ...payload.budget, maxOutputTokens: 1_201 },
    },
  ];
  for (const entry of rejected) {
    assert(!isStrictModelRequest(entry), "malformed payload was accepted");
  }
  const unsafe = {
    ...payload,
    evidencePacket: {
      ...payload.evidencePacket,
      observations: [{
        ...payload.evidencePacket.observations[0],
        claim: "authorization: bearer-not-allowed",
      }],
    },
  };
  const handler = createHandler({ env: testEnv() });
  const response = await handler(requestFor(unsafe));
  assertEquals(response.status, 400, "unsafe evidence status");
});

Deno.test("advisory output rejects unknown evidence references and additional fields", () => {
  const ids = new Set(["live-loading-01"]);
  assert(
    isStrictAdvisoryOutput(advisory(), ids),
    "valid advisory was rejected",
  );
  assert(
    !isStrictAdvisoryOutput(
      {
        ...advisory(),
        findings: [{
          ...advisory().findings[0],
          evidenceIds: ["invented-evidence"],
        }],
      },
      ids,
    ),
    "invented evidence reference was accepted",
  );
  assert(
    !isStrictAdvisoryOutput({ ...advisory(), approved: true }, ids),
    "authority-bearing extra output was accepted",
  );
});

Deno.test("handler requires both platform JWT presence and the dedicated invocation proof", async () => {
  const payload = await validPayload();
  const handler = createHandler({ env: testEnv() });
  const noJwt = await handler(
    requestFor(payload, { authorization: "" }),
  );
  assertEquals(noJwt.status, 401, "missing JWT status");
  const wrongInvocation = await handler(
    requestFor(payload, {
      "x-cognitive-model-router-invocation": "wrong-value",
    }),
  );
  assertEquals(wrongInvocation.status, 401, "wrong invocation status");
});

Deno.test("handler sends a non-stored tool-free strict structured request and remains advisory-only", async () => {
  const payload = await validPayload();
  let providerBody: Record<string, unknown> | undefined;
  let providerApiKey = "";
  let providerTimeout = 0;
  let clock = 1_000;
  const handler = createHandler({
    env: testEnv(),
    now: () => {
      const current = clock;
      clock += 25;
      return current;
    },
    randomUuid: () => "33333333-3333-4333-8333-333333333333",
    transport: ({ apiKey, body, timeoutMs }) => {
      providerBody = body;
      providerApiKey = apiKey;
      providerTimeout = timeoutMs;
      return Promise.resolve({
        modelVersion: "gpt-5.6-luna",
        providerResponseId: "provider-response-fixture",
        outputText: JSON.stringify(advisory()),
        usage: { inputTokens: 500, outputTokens: 200 },
      });
    },
  });
  const response = await handler(requestFor(payload));
  assertEquals(response.status, 200, "advisory response status");
  const result = await response.json();
  assertEquals(result.authority, "advisory_only", "authority");
  assertEquals(result.quorumEligible, false, "quorum eligibility");
  assertEquals(
    result.independenceStatus,
    "MODEL_INDEPENDENCE_PROVIDER_REQUIRED",
    "independence status",
  );
  assertEquals(result.evaluatorProofPresent, false, "evaluator proof");
  assertEquals(
    result.promptTemplateVersionHash,
    await promptTemplateVersionHash(),
    "prompt template hash",
  );
  assertEquals(
    result.providerIdentityHash,
    await sha256Hex("openai"),
    "provider identity is family-independent",
  );
  assertEquals(providerApiKey, "test-only-provider-value", "server credential");
  assertEquals(providerTimeout, payload.budget.maxDurationMs, "timeout cap");
  assert(providerBody !== undefined, "provider request was not captured");
  assertEquals(providerBody?.store, false, "provider storage");
  assert(!("tools" in (providerBody ?? {})), "tools were sent to the provider");
  assert(
    !("previous_response_id" in (providerBody ?? {})),
    "stateful response linkage was sent",
  );
  const text = providerBody?.text as Record<string, unknown>;
  const format = text.format as Record<string, unknown>;
  assertEquals(format.type, "json_schema", "structured output format");
  assertEquals(format.strict, true, "strict structured output");
});

Deno.test("handler binds and verifies the canonical evidence packet hash", async () => {
  const payload = await validPayload();
  const handler = createHandler({ env: testEnv() });
  const response = await handler(requestFor({
    ...payload,
    evidencePacketHash: "f".repeat(64),
  }));
  assertEquals(response.status, 409, "evidence hash mismatch status");
  const result = await response.json();
  assertEquals(
    result.error,
    "evidence_packet_hash_mismatch",
    "evidence hash mismatch error",
  );
});

Deno.test("budget preflight rejects a call before provider transport", async () => {
  const payload = await validPayload();
  let calls = 0;
  const handler = createHandler({
    env: testEnv({
      COGNITIVE_MODEL_INPUT_USD_PER_MILLION: "1000",
      COGNITIVE_MODEL_OUTPUT_USD_PER_MILLION: "1000",
    }),
    transport: () => {
      calls += 1;
      return Promise.reject(new Error("transport_should_not_run"));
    },
  });
  const response = await handler(requestFor({
    ...payload,
    budget: { ...payload.budget, maxCostUsd: 0.0001 },
  }));
  assertEquals(response.status, 409, "budget preflight status");
  assertEquals(calls, 0, "provider transport call count");
});

Deno.test("budget postflight compares exact usage cost before display rounding", async () => {
  const payload = await validPayload();
  const handler = createHandler({
    env: testEnv({
      COGNITIVE_MODEL_INPUT_USD_PER_MILLION: "0.0001",
      COGNITIVE_MODEL_OUTPUT_USD_PER_MILLION: "0.0001",
    }),
    transport: () =>
      Promise.resolve({
        modelVersion: "gpt-5.6-luna",
        providerResponseId: "provider-response-fixture",
        outputText: JSON.stringify(advisory()),
        usage: { inputTokens: 1_000_001, outputTokens: 1 },
      }),
  });
  const response = await handler(requestFor({
    ...payload,
    budget: { ...payload.budget, maxCostUsd: 0.0001 },
  }));
  assertEquals(response.status, 409, "budget postflight status");
  const result = await response.json();
  assertEquals(
    result.error,
    "model_budget_postflight_rejected",
    "budget postflight error",
  );
});

Deno.test("provider-returned model identity must match the configured model", async () => {
  const payload = await validPayload();
  const handler = createHandler({
    env: testEnv(),
    transport: () =>
      Promise.resolve({
        modelVersion: "other-model-family",
        providerResponseId: "provider-response-fixture",
        outputText: JSON.stringify(advisory()),
        usage: { inputTokens: 500, outputTokens: 200 },
      }),
  });
  const response = await handler(requestFor(payload));
  assertEquals(response.status, 502, "model identity mismatch status");
});

Deno.test("OpenAI transport accepts only a completed assistant structured response", async () => {
  const originalFetch = globalThis.fetch;
  const responseFixture = {
    id: "provider-response-fixture",
    status: "completed",
    error: null,
    incomplete_details: null,
    model: "gpt-5.6-luna",
    output: [{
      type: "message",
      role: "assistant",
      content: [{
        type: "output_text",
        text: JSON.stringify(advisory()),
        annotations: [],
      }],
    }],
    usage: { input_tokens: 500, output_tokens: 200 },
  };
  try {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify(responseFixture), { status: 200 }),
      )) as typeof fetch;
    const completed = await openAiResponsesTransport({
      apiKey: "test-only-provider-value",
      body: { model: "gpt-5.6-luna" },
      timeoutMs: 1_000,
    });
    assertEquals(completed.modelVersion, "gpt-5.6-luna", "completed model");

    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ...responseFixture,
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
          }),
          { status: 200 },
        ),
      )) as typeof fetch;
    let rejected = false;
    try {
      await openAiResponsesTransport({
        apiKey: "test-only-provider-value",
        body: { model: "gpt-5.6-luna" },
        timeoutMs: 1_000,
      });
    } catch {
      rejected = true;
    }
    assert(rejected, "incomplete provider response was accepted");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("invalid provider output cannot become an advisory or quorum evidence", async () => {
  const payload = await validPayload();
  const handler = createHandler({
    env: testEnv(),
    transport: () =>
      Promise.resolve({
        modelVersion: "gpt-5.6-luna",
        providerResponseId: "provider-response-fixture",
        outputText: JSON.stringify({
          ...advisory(),
          findings: [{
            ...advisory().findings[0],
            evidenceIds: ["invented-evidence"],
          }],
        }),
        usage: { inputTokens: 500, outputTokens: 200 },
      }),
  });
  const response = await handler(requestFor(payload));
  assertEquals(response.status, 502, "invalid provider output status");
  const result = await response.json();
  assertEquals(
    result.error,
    "model_provider_response_rejected",
    "invalid provider output error",
  );
});
