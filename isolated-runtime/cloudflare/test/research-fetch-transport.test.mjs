import assert from "node:assert/strict";
import test from "node:test";
import {
  createPublicResearchBrokerAdapters,
} from "../src/adapters/research-broker.mjs";
import {
  createMediatedResearchTransport,
} from "../src/adapters/research-fetch-transport.mjs";

const UUID_A = "10000000-0000-4000-8000-000000000001";
const UUID_B = "20000000-0000-4000-8000-000000000002";
const UUID_C = "30000000-0000-4000-8000-000000000003";
const UUID_D = "40000000-0000-4000-8000-000000000004";
const PUBLIC_ADDRESS = "93.184.216.34";
const NOW = Date.parse("2026-07-24T18:00:00.000Z");
const TOKEN = "r".repeat(40);

const sourcePayload = Object.freeze({
  action: "retrieve_source",
  authorityId: "cloudflare-docs",
  citationLocator: "caller locator is not persisted",
  citationTitle: "caller title is not persisted",
  environment: "production",
  evidenceQuery: "Workers HTTP fetches use the mediated public fetch proxy",
  freshnessSeconds: 86_400,
  platform: "shared",
  projectId: UUID_B,
  publisher: "Cloudflare",
  sourceType: "official_documentation",
  taskId: UUID_A,
  url: "https://developers.cloudflare.com/workers/configuration/integrations/apis/",
});

const html = (body) =>
  '<html><head><title>Workers APIs · Cloudflare docs</title>' +
  '<meta property="article:published_time" content="2026-04-23T00:00:00.000Z">' +
  `</head><body>${body}</body></html>`;

test("retrieve_source uses mediated fetch and binds every SQL argument by signature", async () => {
  const requests = [];
  const resolutions = [];
  const responses = [
    new Response(null, {
      headers: { Location: "/workers/configuration/integrations/apis/reference/" },
      status: 302,
    }),
    new Response(
      html("Workers HTTP fetches use the mediated public fetch proxy."),
      { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200 },
    ),
  ];
  const adapters = createPublicResearchBrokerAdapters({
    fetcher: async (url, options) => {
      requests.push({ options, url });
      return responses.shift();
    },
    now: () => NOW,
    resolveAddresses: async (hostname) => {
      resolutions.push(hostname);
      return [PUBLIC_ADDRESS];
    },
  });
  const calls = [];
  const result = await adapters.retrieve_source.execute({
    database: {
      call: async (id, parameters) => {
        calls.push({ id, parameters });
        return {
          content_hash: parameters[11],
          retrieval_id: UUID_D,
          source_id: UUID_C,
        };
      },
    },
    env: { COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN: TOKEN },
    payload: sourcePayload,
  });

  assert.equal(requests.length, 2);
  assert.deepEqual(resolutions, [
    "developers.cloudflare.com",
    "developers.cloudflare.com",
  ]);
  assert.equal(requests[0].options.redirect, "manual");
  assert.equal(requests[0].options.method, "GET");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, "recordPublicResearchSource");
  assert.deepEqual(calls[0].parameters.slice(0, 12), [
    UUID_A,
    UUID_B,
    "shared",
    "production",
    "cloudflare-docs",
    "developers.cloudflare.com",
    "official_documentation",
    "Cloudflare",
    "cloudflare",
    calls[0].parameters[9],
    calls[0].parameters[10],
    calls[0].parameters[11],
  ]);
  for (const index of [9, 10, 11]) {
    assert.match(calls[0].parameters[index], /^[a-f0-9]{64}$/u);
  }
  assert.equal(calls[0].parameters[12], "2026-04-23T00:00:00.000Z");
  assert.equal(calls[0].parameters[13].mode, "published_metadata");
  assert.equal(calls[0].parameters[14], "2026-07-24T18:00:00.000Z");
  assert.equal(calls[0].parameters[16], true);
  assert.match(
    calls[0].parameters[17],
    /mediated public fetch proxy/u,
  );
  assert.equal(calls[0].parameters[18].title, "Workers APIs · Cloudflare docs");
  assert.notEqual(calls[0].parameters[18].title, sourcePayload.citationTitle);
  assert.deepEqual(calls[0].parameters[19].length, 1);
  assert.doesNotMatch(JSON.stringify(calls[0].parameters), /93\.184\.216\.34/u);
  assert.equal(calls[0].parameters[20], TOKEN);
  assert.equal(result.sourceId, UUID_C);
  assert.equal(result.retrievalId, UUID_D);
  assert.equal(result.trustedForToolExecution, false);
  assert.equal(result.evaluatorRequired, true);
  assert.equal(result.privateDataUsed, false);
});

test("private DNS fails before fetch and cross-host redirects fail closed", async () => {
  let fetches = 0;
  const canonicalizeUrl = (raw) => {
    const url = new URL(raw);
    return {
      canonical: url.toString(),
      hostname: url.hostname,
      pathAndQuery: `${url.pathname}${url.search}`,
    };
  };
  const privateTransport = createMediatedResearchTransport({
    canonicalizeUrl,
    fetcher: async () => {
      fetches += 1;
      return new Response("must not fetch");
    },
    resolveAddresses: async () => ["127.0.0.1"],
  });
  await assert.rejects(
    privateTransport("https://developers.cloudflare.com/reference"),
    /research_dns_scope_rejected/u,
  );
  assert.equal(fetches, 0);

  const redirectTransport = createMediatedResearchTransport({
    canonicalizeUrl,
    fetcher: async () => {
      fetches += 1;
      return new Response(null, {
        headers: { Location: "https://example.net/" },
        status: 302,
      });
    },
    resolveAddresses: async () => [PUBLIC_ADDRESS],
  });
  await assert.rejects(
    redirectTransport("https://developers.cloudflare.com/reference"),
    /research_redirect_scope_rejected/u,
  );
  assert.equal(fetches, 1);
});

test("transport enforces total timeout and streamed response byte bounds", async () => {
  const canonicalizeUrl = (raw) => {
    const url = new URL(raw);
    return {
      canonical: url.toString(),
      hostname: url.hostname,
      pathAndQuery: `${url.pathname}${url.search}`,
    };
  };
  const timeoutTransport = createMediatedResearchTransport({
    canonicalizeUrl,
    fetcher: async () => new Promise(() => {}),
    resolveAddresses: async () => [PUBLIC_ADDRESS],
    totalTimeoutMs: 10,
  });
  await assert.rejects(
    timeoutTransport("https://developers.cloudflare.com/reference"),
    /research_total_timeout/u,
  );

  const oversizedTransport = createMediatedResearchTransport({
    canonicalizeUrl,
    fetcher: async () =>
      new Response("x", {
        headers: { "Content-Length": "1048577" },
        status: 200,
      }),
    resolveAddresses: async () => [PUBLIC_ADDRESS],
  });
  await assert.rejects(
    oversizedTransport("https://developers.cloudflare.com/reference"),
    /research_response_size_rejected/u,
  );
});

test("transport rejects a pre-aborted invocation before DNS or fetch", async () => {
  let resolutions = 0;
  let fetches = 0;
  const canonicalizeUrl = (raw) => {
    const url = new URL(raw);
    return {
      canonical: url.toString(),
      hostname: url.hostname,
      pathAndQuery: `${url.pathname}${url.search}`,
    };
  };
  const transport = createMediatedResearchTransport({
    canonicalizeUrl,
    fetcher: async () => {
      fetches += 1;
      return new Response("must not fetch");
    },
    resolveAddresses: async () => {
      resolutions += 1;
      return [PUBLIC_ADDRESS];
    },
  });
  const controller = new AbortController();
  controller.abort(new Error("deadline_rejected"));

  await assert.rejects(
    transport(
      "https://developers.cloudflare.com/reference",
      controller.signal,
    ),
    /research_cancelled/u,
  );
  assert.equal(resolutions, 0);
  assert.equal(fetches, 0);
});

test("transport aborts during DNS and never begins provider fetch", async () => {
  let observedAbort = false;
  let fetches = 0;
  let resolverStarted;
  const started = new Promise((resolve) => {
    resolverStarted = resolve;
  });
  const canonicalizeUrl = (raw) => {
    const url = new URL(raw);
    return {
      canonical: url.toString(),
      hostname: url.hostname,
      pathAndQuery: `${url.pathname}${url.search}`,
    };
  };
  const transport = createMediatedResearchTransport({
    canonicalizeUrl,
    fetcher: async () => {
      fetches += 1;
      return new Response("must not fetch");
    },
    resolveAddresses: async (_hostname, signal) =>
      new Promise((_resolve, reject) => {
        resolverStarted();
        signal.addEventListener("abort", () => {
          observedAbort = true;
          reject(signal.reason);
        }, { once: true });
      }),
  });
  const controller = new AbortController();
  const result = transport(
    "https://developers.cloudflare.com/reference",
    controller.signal,
  );
  await started;
  controller.abort(new Error("deadline_rejected"));

  await assert.rejects(result, /research_cancelled/u);
  assert.equal(observedAbort, true);
  assert.equal(fetches, 0);
});
