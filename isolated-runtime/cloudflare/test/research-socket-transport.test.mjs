import assert from "node:assert/strict";
import test from "node:test";
import {
  createPublicResearchBrokerAdapters,
} from "../src/adapters/research-broker.mjs";
import {
  createPinnedResearchTransport,
  parseHttpResponse,
} from "../src/adapters/research-socket-transport.mjs";

const UUID_A = "10000000-0000-4000-8000-000000000001";
const UUID_B = "20000000-0000-4000-8000-000000000002";
const UUID_C = "30000000-0000-4000-8000-000000000003";
const UUID_D = "40000000-0000-4000-8000-000000000004";
const PUBLIC_ADDRESS = "93.184.216.34";
const NOW = Date.parse("2026-07-24T18:00:00.000Z");
const TOKEN = "r".repeat(40);
const encoder = new TextEncoder();

const rawHttp = (status, headers, body = "") => {
  const bodyBytes = encoder.encode(body);
  const normalized = {
    "Content-Length": String(bodyBytes.byteLength),
    ...headers,
  };
  const head = Object.entries(normalized)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\r\n");
  return encoder.encode(`HTTP/1.1 ${status}\r\n${head}\r\n\r\n${body}`);
};

const fakeSocket = ({
  remoteAddress = PUBLIC_ADDRESS,
  response,
  writes,
  opened = Promise.resolve({ remoteAddress }),
}) => ({
  close() {},
  closed: Promise.resolve(),
  opened,
  readable: new ReadableStream({
    start(controller) {
      if (response !== undefined) controller.enqueue(response);
      controller.close();
    },
  }),
  writable: new WritableStream({
    write(chunk) {
      writes.push(new Uint8Array(chunk));
    },
  }),
});

const sourcePayload = Object.freeze({
  action: "retrieve_source",
  authorityId: "cloudflare-docs",
  citationLocator: "caller locator is not persisted",
  citationTitle: "caller title is not persisted",
  environment: "production",
  evidenceQuery: "SocketInfo remoteAddress identifies the connected peer",
  freshnessSeconds: 86_400,
  platform: "shared",
  projectId: UUID_B,
  publisher: "Cloudflare",
  sourceType: "official_documentation",
  taskId: UUID_A,
  url: "https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/",
});

test("retrieve_source verifies the connected TLS peer before writing and persists exact bounded evidence", async () => {
  const writes = [];
  const connects = [];
  const resolutions = [];
  const body =
    '<html><head><title>TCP sockets · Cloudflare Workers docs</title>' +
    '<meta property="article:published_time" content="2026-06-19T00:00:00.000Z">' +
    "</head><body>SocketInfo remoteAddress identifies the connected peer." +
    " Public technical documentation only.</body></html>";
  const responses = [
    rawHttp(
      "302 Found",
      {
        Location: "/workers/runtime-apis/tcp-sockets/reference/",
      },
    ),
    rawHttp("200 OK", { "Content-Type": "text/html; charset=utf-8" }, body),
  ];
  const adapters = createPublicResearchBrokerAdapters({
    connectSocket: async (address, options) => {
      connects.push({ address, options });
      return fakeSocket({
        response: responses.shift(),
        writes,
      });
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

  assert.equal(connects.length, 2);
  assert.deepEqual(resolutions, [
    "developers.cloudflare.com",
    "developers.cloudflare.com",
  ]);
  for (const connection of connects) {
    assert.deepEqual(connection.address, {
      hostname: "developers.cloudflare.com",
      port: 443,
    });
    assert.deepEqual(connection.options, {
      allowHalfOpen: true,
      secureTransport: "on",
    });
  }
  assert.equal(writes.length, 2);
  const requests = writes.map((bytes) => new TextDecoder().decode(bytes));
  assert.match(requests[0], /^GET \/workers\/runtime-apis\/tcp-sockets\//u);
  assert.match(requests[1], /^GET \/workers\/runtime-apis\/tcp-sockets\/reference\//u);
  assert.match(requests[0], /\r\nHost: developers\.cloudflare\.com\r\n/u);
  assert.match(requests[0], /\r\nAccept-Encoding: identity\r\n/u);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, "recordPublicResearchSource");
  assert.equal(calls[0].parameters.length, 21);
  assert.equal(calls[0].parameters[18].title, "TCP sockets · Cloudflare Workers docs");
  assert.notEqual(calls[0].parameters[18].title, sourcePayload.citationTitle);
  assert.deepEqual(calls[0].parameters[19].length, 1);
  assert.doesNotMatch(JSON.stringify(calls[0].parameters), /93\.184\.216\.34/u);
  assert.equal(result.sourceId, UUID_C);
  assert.equal(result.retrievalId, UUID_D);
  assert.equal(result.trustedForToolExecution, false);
  assert.equal(result.evaluatorRequired, true);
  assert.equal(result.privateDataUsed, false);
});

test("connected-peer mismatch fails before request bytes or database writes", async () => {
  const writes = [];
  let databaseCalls = 0;
  const adapters = createPublicResearchBrokerAdapters({
    connectSocket: async () =>
      fakeSocket({
        remoteAddress: "8.8.8.8",
        response: rawHttp("200 OK", { "Content-Type": "text/plain" }, "unused"),
        writes,
      }),
    now: () => NOW,
    resolveAddresses: async () => [PUBLIC_ADDRESS],
  });
  await assert.rejects(
    adapters.retrieve_source.execute({
      database: {
        call: async () => {
          databaseCalls += 1;
        },
      },
      env: { COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN: TOKEN },
      payload: sourcePayload,
    }),
    /public_research_transport_blocked/u,
  );
  assert.equal(writes.length, 0);
  assert.equal(databaseCalls, 0);
});

test("private DNS and cross-host redirects fail closed", async () => {
  let connects = 0;
  const privateTransport = createPinnedResearchTransport({
    canonicalizeUrl: (raw) => {
      const url = new URL(raw);
      return {
        canonical: url.toString(),
        hostname: url.hostname,
        pathAndQuery: `${url.pathname}${url.search}`,
      };
    },
    connectSocket: async () => {
      connects += 1;
      throw new Error("must_not_connect");
    },
    resolveAddresses: async () => ["127.0.0.1"],
  });
  await assert.rejects(
    privateTransport("https://developers.cloudflare.com/reference"),
    /research_dns_scope_rejected/u,
  );
  assert.equal(connects, 0);

  const writes = [];
  const redirectTransport = createPinnedResearchTransport({
    canonicalizeUrl: (raw) => {
      const url = new URL(raw);
      return {
        canonical: url.toString(),
        hostname: url.hostname,
        pathAndQuery: `${url.pathname}${url.search}`,
      };
    },
    connectSocket: async () => {
      connects += 1;
      return fakeSocket({
        response: rawHttp("302 Found", { Location: "https://example.net/" }),
        writes,
      });
    },
    resolveAddresses: async () => [PUBLIC_ADDRESS],
  });
  await assert.rejects(
    redirectTransport("https://developers.cloudflare.com/reference"),
    /research_redirect_scope_rejected/u,
  );
  assert.equal(connects, 1);
  assert.equal(writes.length, 1);
});

test("transport enforces total timeout and response byte bounds", async () => {
  const transport = createPinnedResearchTransport({
    canonicalizeUrl: (raw) => {
      const url = new URL(raw);
      return {
        canonical: url.toString(),
        hostname: url.hostname,
        pathAndQuery: `${url.pathname}${url.search}`,
      };
    },
    connectSocket: async () =>
      fakeSocket({
        opened: new Promise(() => {}),
        response: undefined,
        writes: [],
      }),
    resolveAddresses: async () => [PUBLIC_ADDRESS],
    totalTimeoutMs: 10,
  });
  await assert.rejects(
    transport("https://developers.cloudflare.com/reference"),
    /research_total_timeout/u,
  );

  assert.throws(
    () =>
      parseHttpResponse(
        encoder.encode(
          "HTTP/1.1 200 OK\r\nContent-Length: 1048577\r\n\r\n",
        ),
      ),
    /research_response_size_rejected/u,
  );
});
