import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createPinnedResearchHostTransport,
  RESEARCH_PINNED_TRANSPORT_REQUIRED,
} from "../src/adapters/research-pinned-host-transport.mjs";
import {
  createPublicResearchBrokerAdapters,
} from "../src/adapters/research-broker.mjs";
import {
  buildPinnedTransportAttestation,
} from "../../pinned-research-transport/src/pinned-public-research-transport.mjs";
import {
  invocationHeaderNames,
  PINNED_RESEARCH_EXTERNAL_PATH,
  PINNED_RESEARCH_HOST_SCHEMA_VERSION,
  responseHeaderNames,
} from "../../pinned-research-transport/src/invocation-contract.mjs";
import {
  signHostResponse,
} from "../../pinned-research-transport/src/host-auth.mjs";

const KEY = "a".repeat(64);
const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const SOURCE_URL = "https://developers.cloudflare.com/workers/";
const PUBLIC_ADDRESS = "93.184.216.34";
const NOW = Date.parse("2026-07-24T18:00:00.000Z");
const ENDPOINT =
  `https://research-transport.example.invalid${PINNED_RESEARCH_EXTERNAL_PATH}`;

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const result = ({
  body = "bounded public research evidence",
  contentType = "text/plain",
} = {}) => {
  const retrievalDate = new Date(NOW).toISOString();
  const attestation = buildPinnedTransportAttestation({
    body,
    finalUrl: SOURCE_URL,
    history: [{
      approvedAddresses: [PUBLIC_ADDRESS],
      connectedAddress: PUBLIC_ADDRESS,
      contentType,
      status: 200,
      url: SOURCE_URL,
    }],
    retrievalDate,
  });
  return {
    body,
    canonicalUrl: SOURCE_URL,
    compressedBytes: Buffer.byteLength(body),
    connectedPeerHash: sha256(PUBLIC_ADDRESS),
    contentType,
    credentialsSent: false,
    decompressedBytes: Buffer.byteLength(body),
    lastModifiedHeader: null,
    networkBoundary: "isolated_node_pinned_https_v1",
    providerReadiness: "ACTIVE",
    rawArchivePersisted: false,
    resolvedAddresses: [PUBLIC_ADDRESS],
    retrievalDate,
    status: 200,
    transportAttestationHash: attestation.hash,
    transportAttestationManifest: attestation.manifest,
    trustedForPersistence: true,
    untrustedEvidence: true,
  };
};

const context = Object.freeze({
  deadlineAt: new Date(NOW + 30_000).toISOString(),
  requestId: REQUEST_ID,
});
const env = Object.freeze({
  COGNITIVE_RESEARCH_PINNED_TRANSPORT_HMAC_KEY: KEY,
  COGNITIVE_RESEARCH_PINNED_TRANSPORT_URL: ENDPOINT,
});

test("Worker adapter sends only bounded HMAC invocation headers and accepts exact peer attestation", async () => {
  let captured;
  const transport = createPinnedResearchHostTransport({
    fetcher: async (url, options) => {
      captured = { options, url };
      const request = JSON.parse(options.body);
      const nonce = options.headers[invocationHeaderNames.nonce];
      const timestamp = Number(
        options.headers[invocationHeaderNames.timestamp],
      );
      const body = JSON.stringify({
        requestId: request.requestId,
        result: result(),
        schemaVersion: PINNED_RESEARCH_HOST_SCHEMA_VERSION,
      });
      const signed = signHostResponse({
        body,
        hmacKey: KEY,
        nonce,
        requestId: request.requestId,
        timestamp,
      });
      return new Response(body, {
        headers: {
          "content-type": "application/json",
          [responseHeaderNames.bodySha256]: signed.bodySha256,
          [responseHeaderNames.signature]: signed.signature,
        },
        status: 200,
      });
    },
    now: () => NOW,
    randomBytes: () => new Uint8Array(16).fill(7),
  });
  const value = await transport(
    SOURCE_URL,
    new AbortController().signal,
    { authorityId: "cloudflare-docs", context, env },
  );
  assert.equal(captured.url, ENDPOINT);
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.redirect, "manual");
  assert.equal(captured.options.credentials, "omit");
  assert.equal(captured.options.headers.authorization, undefined);
  assert.equal(captured.options.headers.cookie, undefined);
  assert.equal(
    Object.keys(captured.options.headers).sort().join(","),
    [
      "accept-encoding",
      "content-type",
      invocationHeaderNames.bodySha256,
      invocationHeaderNames.keyId,
      invocationHeaderNames.nonce,
      invocationHeaderNames.signature,
      invocationHeaderNames.timestamp,
    ].sort().join(","),
  );
  assert.equal(value.providerReadiness, "ACTIVE");
  assert.equal(value.trustedForPersistence, true);
  assert.match(value.transportAttestationHash, /^[a-f0-9]{64}$/u);
});

test("Worker adapter fails closed on missing provider binding, unsigned result, or attestation tampering", async () => {
  const neverFetch = createPinnedResearchHostTransport({
    fetcher: async () => assert.fail("provider must not be called"),
    now: () => NOW,
  });
  for (const invalidEnv of [
    {},
    { ...env, COGNITIVE_RESEARCH_PINNED_TRANSPORT_HMAC_KEY: "short" },
    {
      ...env,
      COGNITIVE_RESEARCH_PINNED_TRANSPORT_URL:
        "http://research-transport.example.invalid/v1",
    },
  ]) {
    await assert.rejects(
      neverFetch(SOURCE_URL, undefined, {
        authorityId: "cloudflare-docs",
        context,
        env: invalidEnv,
      }),
      new RegExp(RESEARCH_PINNED_TRANSPORT_REQUIRED, "u"),
    );
  }

  const unsigned = createPinnedResearchHostTransport({
    fetcher: async () =>
      new Response(JSON.stringify({
        requestId: REQUEST_ID,
        result: result(),
        schemaVersion: PINNED_RESEARCH_HOST_SCHEMA_VERSION,
      }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    now: () => NOW,
  });
  await assert.rejects(
    unsigned(SOURCE_URL, undefined, {
      authorityId: "cloudflare-docs",
      context,
      env,
    }),
    new RegExp(RESEARCH_PINNED_TRANSPORT_REQUIRED, "u"),
  );

  const tampered = createPinnedResearchHostTransport({
    fetcher: async (_url, options) => {
      const request = JSON.parse(options.body);
      const bad = result();
      bad.transportAttestationHash = "f".repeat(64);
      const body = JSON.stringify({
        requestId: request.requestId,
        result: bad,
        schemaVersion: PINNED_RESEARCH_HOST_SCHEMA_VERSION,
      });
      const signed = signHostResponse({
        body,
        hmacKey: KEY,
        nonce: options.headers[invocationHeaderNames.nonce],
        requestId: request.requestId,
        timestamp: Number(options.headers[invocationHeaderNames.timestamp]),
      });
      return new Response(body, {
        headers: {
          "content-type": "application/json",
          [responseHeaderNames.bodySha256]: signed.bodySha256,
          [responseHeaderNames.signature]: signed.signature,
        },
        status: 200,
      });
    },
    now: () => NOW,
  });
  await assert.rejects(
    tampered(SOURCE_URL, undefined, {
      authorityId: "cloudflare-docs",
      context,
      env,
    }),
    new RegExp(RESEARCH_PINNED_TRANSPORT_REQUIRED, "u"),
  );
});

test("Worker adapter propagates caller cancellation to the provider request", async () => {
  let observedSignal;
  let fetchStarted;
  const started = new Promise((resolve) => {
    fetchStarted = resolve;
  });
  const transport = createPinnedResearchHostTransport({
    fetcher: async (_url, options) => {
      observedSignal = options.signal;
      fetchStarted();
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(options.signal.reason),
          { once: true },
        );
      });
    },
    now: () => NOW,
  });
  const controller = new AbortController();
  const pending = transport(
    SOURCE_URL,
    controller.signal,
    { authorityId: "cloudflare-docs", context, env },
  );
  await started;
  controller.abort(new Error("deadline_rejected"));
  await assert.rejects(pending, /deadline_rejected/u);
  assert.equal(observedSignal, controller.signal);
});

test("broker persists only after provider attestation and propagates its hash", async () => {
  const article =
    "<html><head><title>Workers APIs · Cloudflare docs</title>" +
    '<meta property="article:published_time" ' +
    'content="2026-07-20T15:30:00Z"></head><body>' +
    "Workers HTTP fetches use the mediated public fetch proxy." +
    "</body></html>";
  const transport = createPinnedResearchHostTransport({
    fetcher: async (_url, options) => {
      const request = JSON.parse(options.body);
      const body = JSON.stringify({
        requestId: request.requestId,
        result: result({ body: article, contentType: "text/html" }),
        schemaVersion: PINNED_RESEARCH_HOST_SCHEMA_VERSION,
      });
      const signed = signHostResponse({
        body,
        hmacKey: KEY,
        nonce: options.headers[invocationHeaderNames.nonce],
        requestId: request.requestId,
        timestamp: Number(options.headers[invocationHeaderNames.timestamp]),
      });
      return new Response(body, {
        headers: {
          "content-type": "application/json",
          [responseHeaderNames.bodySha256]: signed.bodySha256,
          [responseHeaderNames.signature]: signed.signature,
        },
        status: 200,
      });
    },
    now: () => NOW,
  });
  const adapters = createPublicResearchBrokerAdapters({
    now: () => NOW,
    requireProviderAttestation: true,
    transport,
  });
  let recorded;
  const output = await adapters.retrieve_source.execute({
    context,
    database: {
      call: async (_operation, parameters) => {
        recorded = parameters;
        return {
          content_hash: parameters[11],
          retrieval_id: "40000000-0000-4000-8000-000000000004",
          source_id: "30000000-0000-4000-8000-000000000003",
        };
      },
    },
    env: {
      ...env,
      COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN: "r".repeat(40),
    },
    payload: {
      action: "retrieve_source",
      authorityId: "cloudflare-docs",
      citationLocator: "caller locator",
      citationTitle: "caller title",
      environment: "production",
      evidenceQuery: "Workers HTTP fetches use the mediated public fetch proxy",
      freshnessSeconds: 86_400,
      platform: "shared",
      projectId: "20000000-0000-4000-8000-000000000002",
      publisher: "Cloudflare",
      sourceType: "official_documentation",
      taskId: "10000000-0000-4000-8000-000000000001",
      url: SOURCE_URL,
    },
    signal: new AbortController().signal,
  });
  assert(recorded);
  assert.match(output.transportAttestationHash, /^[a-f0-9]{64}$/u);
  assert.equal(output.privateDataUsed, false);
  assert.equal(output.userDerivedDataUsed, false);
});
