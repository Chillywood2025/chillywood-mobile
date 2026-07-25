import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import test from "node:test";

import {
  buildPinnedTransportAttestation,
  canonicalizePinnedResearchUrl,
  createPinnedPublicResearchTransport,
  pinnedHttpsRequestOptions,
  PINNED_RESEARCH_TRANSPORT_REQUIRES_PROVIDER,
  RESEARCH_PINNED_TRANSPORT_REQUIRED,
  resolvePinnedPublicAddresses,
} from "../src/pinned-public-research-transport.mjs";

const PUBLIC_A = "93.184.216.34";
const PUBLIC_B = "2606:2800:220:1:248:1893:25c8:1946";
const SOURCE = "https://developers.cloudflare.com/workers/";
const NOW = Date.parse("2026-07-24T18:00:00.000Z");

const response = ({
  address = PUBLIC_A,
  body = "bounded public evidence",
  contentType = "text/plain; charset=utf-8",
  headers = {},
  status = 200,
} = {}) => ({
  body: Readable.from([Buffer.from(body)]),
  connectedAddress: address,
  headers: {
    "content-type": contentType,
    ...headers,
  },
  status,
});

test("activation remains fail-closed until a reviewed isolated provider is selected", () => {
  assert.equal(
    RESEARCH_PINNED_TRANSPORT_REQUIRED,
    "RESEARCH_PINNED_TRANSPORT_REQUIRED",
  );
  assert.equal(
    PINNED_RESEARCH_TRANSPORT_REQUIRES_PROVIDER,
    "PINNED_RESEARCH_TRANSPORT_REQUIRES_PROVIDER",
  );
});

test("canonical URL contract accepts HTTPS and rejects embedded authority or credential data", () => {
  assert.equal(
    canonicalizePinnedResearchUrl(SOURCE)?.canonical,
    SOURCE,
  );
  for (const raw of [
    "http://developers.cloudflare.com/workers/",
    "https://user:password@developers.cloudflare.com/workers/",
    "https://developers.cloudflare.com:8443/workers/",
    "https://developers.cloudflare.com/workers/#fragment",
    "https://localhost/workers/",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://169.254.169.254/latest/meta-data/",
    "https://developers.cloudflare.com/workers/?access_token=private",
    "https://developers.cloudflare.com/workers/?client-secret=private",
    "https://developers.cloudflare.com/workers/?next=api_key%3Dprivate",
    "https://developers.cloudflare.com/workers/?next=api_key%253Dprivate",
  ]) {
    assert.equal(canonicalizePinnedResearchUrl(raw), null, raw);
  }
});

test("DNS contract bounds, normalizes, deduplicates, and rejects every non-public answer", async () => {
  const signal = new AbortController().signal;
  assert.deepEqual(
    await resolvePinnedPublicAddresses("example.com", signal, {
      resolver: async () => [PUBLIC_B, PUBLIC_A, PUBLIC_A],
    }),
    [PUBLIC_A, PUBLIC_B],
  );
  for (const addresses of [
    [],
    ["127.0.0.1"],
    [PUBLIC_A, "10.0.0.1"],
    [PUBLIC_A, "not-an-address"],
    Array.from({ length: 17 }, (_, index) => `8.8.8.${index + 1}`),
  ]) {
    await assert.rejects(
      resolvePinnedPublicAddresses("example.com", signal, {
        resolver: async () => addresses,
      }),
      /research_dns_scope_rejected/u,
    );
  }
});

test("production HTTPS options pin lookup while preserving hostname, SNI, and Host", () => {
  const target = canonicalizePinnedResearchUrl(SOURCE);
  assert(target);
  const signal = new AbortController().signal;
  const options = pinnedHttpsRequestOptions(target, PUBLIC_A, signal);
  assert.equal(options.hostname, "developers.cloudflare.com");
  assert.equal(options.servername, "developers.cloudflare.com");
  assert.equal(options.headers.Host, "developers.cloudflare.com");
  assert.equal(options.headers["Accept-Encoding"], "identity");
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.headers.Cookie, undefined);
  assert.equal(options.credentials, undefined);
  options.lookup("ignored.invalid", {}, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, PUBLIC_A);
    assert.equal(family, 4);
  });
  options.lookup("ignored.invalid", { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [{ address: PUBLIC_A, family: 4 }]);
  });
});

test("synthetic contract retrieval binds the connected peer but cannot self-attest for production", async () => {
  const requests = [];
  const transport = createPinnedPublicResearchTransport({
    connector: async (request) => {
      requests.push(request);
      return response();
    },
    now: () => NOW,
    resolver: async () => [PUBLIC_A],
  });
  const result = await transport(SOURCE);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].pinnedAddress, PUBLIC_A);
  assert.equal(requests[0].target.hostname, "developers.cloudflare.com");
  assert.equal(result.canonicalUrl, SOURCE);
  assert.equal(result.contentType, "text/plain");
  assert.equal(result.credentialsSent, false);
  assert.equal(result.rawArchivePersisted, false);
  assert.equal(result.untrustedEvidence, true);
  assert.equal(result.compressedBytes, result.decompressedBytes);
  assert.match(result.connectedPeerHash, /^[a-f0-9]{64}$/u);
  assert.equal(result.transportAttestationHash, null);
  assert.equal(result.transportAttestationManifest, null);
  assert.equal(result.trustedForPersistence, false);
  assert.equal(result.networkBoundary, "synthetic_contract_fixture_only");
  assert.deepEqual(result.resolvedAddresses, [PUBLIC_A]);
});

test("missing, private, or unpinned connected peers fail closed", async () => {
  for (const address of [null, "127.0.0.1", "8.8.8.8"]) {
    const transport = createPinnedPublicResearchTransport({
      connector: async () => response({ address }),
      resolver: async () => [PUBLIC_A],
    });
    await assert.rejects(
      transport(SOURCE),
      /research_connected_peer_mismatch/u,
    );
  }
});

test("every redirect is canonicalized, resolved again, and newly peer-pinned", async () => {
  const resolutions = [];
  const requests = [];
  const transport = createPinnedPublicResearchTransport({
    connector: async (request) => {
      requests.push(request);
      return requests.length === 1
        ? response({
          address: PUBLIC_A,
          headers: { location: "/workers/runtime-apis/" },
          status: 302,
        })
        : response({ address: "8.8.8.8" });
    },
    now: () => NOW,
    resolver: async (hostname) => {
      resolutions.push(hostname);
      return resolutions.length === 1 ? [PUBLIC_A] : ["8.8.8.8"];
    },
  });
  const result = await transport(SOURCE);
  assert.deepEqual(resolutions, [
    "developers.cloudflare.com",
    "developers.cloudflare.com",
  ]);
  assert.equal(requests[0].pinnedAddress, PUBLIC_A);
  assert.equal(requests[1].pinnedAddress, "8.8.8.8");
  assert.equal(
    result.canonicalUrl,
    "https://developers.cloudflare.com/workers/runtime-apis/",
  );

  const crossHost = createPinnedPublicResearchTransport({
    connector: async () =>
      response({
        headers: { location: "https://example.com/" },
        status: 302,
      }),
    resolver: async () => [PUBLIC_A],
  });
  await assert.rejects(
    crossHost(SOURCE),
    /research_redirect_scope_rejected/u,
  );
});

test("response type, identity encoding, declared size, streamed size, and status are bounded", async () => {
  const cases = [
    {
      expected: /research_content_type_rejected/u,
      value: response({ contentType: "application/octet-stream" }),
    },
    {
      expected: /research_content_encoding_rejected/u,
      value: response({ headers: { "content-encoding": "gzip" } }),
    },
    {
      expected: /research_response_size_rejected/u,
      value: response({ headers: { "content-length": "1048577" } }),
    },
    {
      expected: /research_response_size_rejected/u,
      value: response({ body: "x".repeat(1_048_577) }),
    },
    {
      expected: /research_http_status_rejected/u,
      value: response({ status: 500 }),
    },
  ];
  for (const fixture of cases) {
    const transport = createPinnedPublicResearchTransport({
      connector: async () => fixture.value,
      resolver: async () => [PUBLIC_A],
    });
    await assert.rejects(transport(SOURCE), fixture.expected);
  }
});

test("caller cancellation and total timeout terminate non-cooperative dependencies", async () => {
  const controller = new AbortController();
  let resolverStarted;
  const started = new Promise((resolve) => {
    resolverStarted = resolve;
  });
  const cancelled = createPinnedPublicResearchTransport({
    resolver: async () => {
      resolverStarted();
      return new Promise(() => {});
    },
  });
  const result = cancelled(SOURCE, controller.signal);
  await started;
  controller.abort();
  await assert.rejects(result, /research_cancelled/u);

  const timedOut = createPinnedPublicResearchTransport({
    connector: async () => new Promise(() => {}),
    limits: { totalTimeoutMs: 100 },
    resolver: async () => [PUBLIC_A],
  });
  await assert.rejects(timedOut(SOURCE), /research_total_timeout/u);
});

test("same evidence and retrieval time produce the same attestation hash", async () => {
  const payload = {
    body: "bounded public evidence",
    finalUrl: SOURCE,
    history: [{
      approvedAddresses: [PUBLIC_A],
      connectedAddress: PUBLIC_A,
      contentType: "text/plain",
      status: 200,
      url: SOURCE,
    }],
    retrievalDate: new Date(NOW).toISOString(),
  };
  const first = buildPinnedTransportAttestation(payload);
  const second = buildPinnedTransportAttestation(payload);
  assert.equal(first.hash, second.hash);
  assert.match(first.hash, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(first.manifest), /93\.184\.216\.34/u);
});
