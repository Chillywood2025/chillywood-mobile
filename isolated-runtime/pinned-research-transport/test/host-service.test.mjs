import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  authenticateHostInvocation,
  createInvocationReplayGuard,
  sha256Hex,
  signHostResponse,
} from "../src/host-auth.mjs";
import {
  createPinnedResearchHostServer,
} from "../src/host-service.mjs";
import {
  buildPinnedTransportAttestation,
} from "../src/pinned-public-research-transport.mjs";
import {
  canonicalPinnedResearchInvocation,
  invocationHeaderNames,
  PINNED_RESEARCH_HOST_SCHEMA_VERSION,
  PINNED_RESEARCH_INVOCATION_KEY_ID,
  responseHeaderNames,
} from "../src/invocation-contract.mjs";
import { createHmac } from "node:crypto";

const KEY = "a".repeat(64);
const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const SOURCE_COMMIT = "b".repeat(40);
const SOURCE_TREE = "c".repeat(40);
const RELEASE_MANIFEST_SHA256 = "d".repeat(64);
const SOURCE_URL = "https://developers.cloudflare.com/workers/";
const PUBLIC_ADDRESS = "93.184.216.34";
const NOW = Date.parse("2026-07-24T18:00:00.000Z");

const makeTransportResult = () => {
  const body = "bounded public research evidence";
  const retrievalDate = new Date(NOW).toISOString();
  const attestation = buildPinnedTransportAttestation({
    body,
    finalUrl: SOURCE_URL,
    history: [{
      approvedAddresses: [PUBLIC_ADDRESS],
      connectedAddress: PUBLIC_ADDRESS,
      contentType: "text/plain",
      status: 200,
      url: SOURCE_URL,
    }],
    retrievalDate,
  });
  return Object.freeze({
    body,
    canonicalUrl: SOURCE_URL,
    compressedBytes: Buffer.byteLength(body),
    connectedPeerHash: sha256Hex(PUBLIC_ADDRESS),
    contentType: "text/plain",
    credentialsSent: false,
    decompressedBytes: Buffer.byteLength(body),
    lastModifiedHeader: null,
    networkBoundary: "isolated_node_pinned_https_v1",
    providerReadiness: "PINNED_RESEARCH_TRANSPORT_REQUIRES_PROVIDER",
    rawArchivePersisted: false,
    resolvedAddresses: [PUBLIC_ADDRESS],
    retrievalDate,
    status: 200,
    transportAttestationHash: attestation.hash,
    transportAttestationManifest: attestation.manifest,
    trustedForPersistence: false,
    untrustedEvidence: true,
  });
};

const invocation = (changes = {}) => Object.freeze({
  authorityId: "cloudflare-docs",
  deadlineAt: new Date(NOW + 30_000).toISOString(),
  requestId: REQUEST_ID,
  schemaVersion: PINNED_RESEARCH_HOST_SCHEMA_VERSION,
  url: SOURCE_URL,
  ...changes,
});

const signedHeaders = (body, {
  nonce = "1".repeat(32),
  timestamp = Math.floor(NOW / 1_000),
} = {}) => {
  const bodySha256 = sha256Hex(body);
  const canonical = canonicalPinnedResearchInvocation({
    bodySha256,
    nonce,
    timestamp,
  });
  const signature = createHmac("sha256", Buffer.from(KEY, "hex"))
    .update(canonical)
    .digest("hex");
  return {
    "content-type": "application/json",
    [invocationHeaderNames.bodySha256]: bodySha256,
    [invocationHeaderNames.keyId]: PINNED_RESEARCH_INVOCATION_KEY_ID,
    [invocationHeaderNames.nonce]: nonce,
    [invocationHeaderNames.signature]: signature,
    [invocationHeaderNames.timestamp]: String(timestamp),
    "x-forwarded-proto": "https",
  };
};

const listen = async (options = {}) => {
  const server = createPinnedResearchHostServer({
    hmacKey: KEY,
    now: () => NOW,
    releaseManifestSha256: RELEASE_MANIFEST_SHA256,
    sourceCommit: SOURCE_COMMIT,
    sourceTree: SOURCE_TREE,
    transport: async () => makeTransportResult(),
    ...options,
  });
  await new Promise((resolvePromise) =>
    server.listen(0, "127.0.0.1", resolvePromise)
  );
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    close: () =>
      new Promise((resolvePromise, reject) => {
        server.close((error) => error ? reject(error) : resolvePromise());
        server.closeAllConnections();
      }),
    origin: `http://127.0.0.1:${address.port}`,
  };
};

test("host invocation authentication is exact, expiring, and replay protected", () => {
  const body = JSON.stringify(invocation());
  const headers = signedHeaders(body);
  const replayGuard = createInvocationReplayGuard({ now: () => NOW });
  assert(
    authenticateHostInvocation({
      body,
      headers,
      hmacKey: KEY,
      now: () => NOW,
      replayGuard,
    }),
  );
  assert.equal(
    authenticateHostInvocation({
      body,
      headers,
      hmacKey: KEY,
      now: () => NOW,
      replayGuard,
    }),
    null,
  );
  assert.equal(
    authenticateHostInvocation({
      body,
      headers: signedHeaders(body, {
        nonce: "2".repeat(32),
        timestamp: Math.floor(NOW / 1_000) - 61,
      }),
      hmacKey: KEY,
      now: () => NOW,
      replayGuard: createInvocationReplayGuard({ now: () => NOW }),
    }),
    null,
  );
});

test("loopback host returns only signed attested evidence and a local readiness contract", async () => {
  const logs = [];
  const host = await listen({ logger: { log: (value) => logs.push(value) } });
  try {
    const health = await fetch(`${host.origin}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      contract: PINNED_RESEARCH_HOST_SCHEMA_VERSION,
      providerReadiness: "ACTIVE",
      releaseManifestSha256: RELEASE_MANIFEST_SHA256,
      sourceCommit: SOURCE_COMMIT,
      sourceTree: SOURCE_TREE,
    });

    const body = JSON.stringify(invocation());
    const response = await fetch(`${host.origin}/v1/retrieve`, {
      body,
      headers: signedHeaders(body),
      method: "POST",
    });
    assert.equal(response.status, 200);
    const responseBody = await response.text();
    const signed = signHostResponse({
      body: responseBody,
      hmacKey: KEY,
      nonce: "1".repeat(32),
      requestId: REQUEST_ID,
      timestamp: Math.floor(NOW / 1_000),
    });
    assert.equal(
      response.headers.get(responseHeaderNames.bodySha256),
      signed.bodySha256,
    );
    assert.equal(
      response.headers.get(responseHeaderNames.signature),
      signed.signature,
    );
    const parsed = JSON.parse(responseBody);
    assert.equal(parsed.result.providerReadiness, "ACTIVE");
    assert.equal(parsed.result.trustedForPersistence, true);
    assert.match(parsed.result.transportAttestationHash, /^[a-f0-9]{64}$/u);
    assert.equal(parsed.result.credentialsSent, false);
    assert.equal(parsed.result.rawArchivePersisted, false);
    assert.doesNotMatch(logs.join("\n"), /developers\.cloudflare\.com/u);
    assert.doesNotMatch(logs.join("\n"), new RegExp(KEY, "u"));
    assert.doesNotMatch(logs.join("\n"), /bounded public research evidence/u);
  } finally {
    await host.close();
  }
});

test("host rejects replay, schema drift, cookies, and bearer credentials", async () => {
  let calls = 0;
  const host = await listen({
    transport: async () => {
      calls += 1;
      return makeTransportResult();
    },
  });
  try {
    const body = JSON.stringify(invocation());
    const options = {
      body,
      headers: signedHeaders(body),
      method: "POST",
    };
    assert.equal((await fetch(`${host.origin}/v1/retrieve`, options)).status, 200);
    assert.equal((await fetch(`${host.origin}/v1/retrieve`, options)).status, 401);
    assert.equal(calls, 1);

    const extraBody = JSON.stringify(invocation({ extra: true }));
    assert.equal(
      (await fetch(`${host.origin}/v1/retrieve`, {
        body: extraBody,
        headers: signedHeaders(extraBody, { nonce: "2".repeat(32) }),
        method: "POST",
      })).status,
      400,
    );
    for (const forbidden of [
      { authorization: "Bearer forbidden" },
      { cookie: "session=forbidden" },
    ]) {
      const nonce = forbidden.cookie ? "3".repeat(32) : "4".repeat(32);
      assert.equal(
        (await fetch(`${host.origin}/v1/retrieve`, {
          body,
          headers: { ...signedHeaders(body, { nonce }), ...forbidden },
          method: "POST",
        })).status,
        401,
      );
    }
    assert.equal(calls, 1);

    const wrongAuthorityBody = JSON.stringify(
      invocation({ authorityId: "apple-docs" }),
    );
    assert.equal(
      (await fetch(`${host.origin}/v1/retrieve`, {
        body: wrongAuthorityBody,
        headers: signedHeaders(wrongAuthorityBody, {
          nonce: "5".repeat(32),
        }),
        method: "POST",
      })).status,
      400,
    );
    assert.equal(calls, 1);
  } finally {
    await host.close();
  }
});

test("caller disconnect propagates cancellation into pinned network work", async () => {
  let startedResolve;
  const started = new Promise((resolvePromise) => {
    startedResolve = resolvePromise;
  });
  let cancelled = false;
  const host = await listen({
    transport: async (_url, signal) =>
      new Promise((_resolve, reject) => {
        startedResolve();
        signal.addEventListener("abort", () => {
          cancelled = true;
          reject(signal.reason);
        }, { once: true });
      }),
  });
  try {
    const body = JSON.stringify(invocation());
    const controller = new AbortController();
    const pending = fetch(`${host.origin}/v1/retrieve`, {
      body,
      headers: signedHeaders(body),
      method: "POST",
      signal: controller.signal,
    });
    await started;
    controller.abort();
    await assert.rejects(pending);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    assert.equal(cancelled, true);
  } finally {
    await host.close();
  }
});

test("deployment templates bind a separate identity, loopback listener, exact route, and hardened lifecycle", async () => {
  const root = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "deploy",
  );
  const [
    unit,
    credentialCompatibility,
    caddy,
    sysusers,
    deploy,
    rollback,
    readiness,
  ] =
    await Promise.all([
      readFile(resolve(root, "chillywood-research-transport.service.template"), "utf8"),
      readFile(
        resolve(
          root,
          "chillywood-research-transport-credential-compat.conf.template",
        ),
        "utf8",
      ),
      readFile(resolve(root, "Caddyfile.snippet.template"), "utf8"),
      readFile(resolve(root, "chillywood-research-transport.sysusers.conf"), "utf8"),
      readFile(resolve(root, "deploy-reviewed-release.sh"), "utf8"),
      readFile(resolve(root, "rollback-reviewed-release.sh"), "utf8"),
      readFile(resolve(root, "readiness.sh"), "utf8"),
    ]);
  assert.match(sysusers, /^u?[\s\S]*chillywood-research-transport/u);
  assert.match(unit, /^User=chillywood-research-transport$/mu);
  assert.match(unit, /^Group=chillywood-research-transport$/mu);
  assert.match(unit, /^NoNewPrivileges=true$/mu);
  assert.match(unit, /^ProtectSystem=strict$/mu);
  assert.match(unit, /^CapabilityBoundingSet=$/mu);
  assert.match(unit, /LoadCredential=research_transport_hmac:/u);
  assert.match(credentialCompatibility, /^LoadCredential=$/mu);
  assert.match(
    credentialCompatibility,
    /^RuntimeDirectory=credentials\/chillywood-research-transport-runtime$/mu,
  );
  assert.match(credentialCompatibility, /^RuntimeDirectoryMode=0700$/mu);
  assert.match(
    credentialCompatibility,
    /^ExecStartPre=\+\/usr\/bin\/install -o chillywood-research-transport -g chillywood-research-transport -m 0400 \/etc\/chillywood\/research-transport\/research_transport_hmac \/run\/credentials\/chillywood-research-transport-runtime\/research_transport_hmac$/mu,
  );
  assert.match(
    credentialCompatibility,
    /^ExecStopPost=\+\/usr\/bin\/rm -f -- \/run\/credentials\/chillywood-research-transport-runtime\/research_transport_hmac$/mu,
  );
  assert.match(
    credentialCompatibility,
    /^Environment=CREDENTIALS_DIRECTORY=\/run\/credentials\/chillywood-research-transport-runtime$/mu,
  );
  assert.doesNotMatch(
    credentialCompatibility,
    /echo|printf|logger|journal|set -x|printenv|export -p/u,
  );
  assert.match(
    unit,
    /^EnvironmentFile=\/opt\/chillywood\/research-transport\/current\/\.release-environment$/mu,
  );
  assert.doesNotMatch(unit, /REPLACE_WITH_REVIEWED_SOURCE_COMMIT/u);
  assert.match(caddy, /127\.0\.0\.1:4319/u);
  assert.match(
    caddy,
    /\/internal\/cognitive-research-transport\/v1\/retrieve/u,
  );
  assert.doesNotMatch(caddy, /healthz/u);
  assert.match(
    deploy,
    /deployment=LOCAL_READY_PENDING_EXTERNAL_ATTESTATION/u,
  );
  assert.doesNotMatch(deploy, /deployment=ACTIVE/u);
  assert.match(deploy, /deployment=INACTIVE/u);
  assert.match(
    rollback,
    /rollback=LOCAL_READY_PENDING_EXTERNAL_ATTESTATION/u,
  );
  assert.doesNotMatch(rollback, /rollback=ACTIVE/u);
  assert.match(readiness, /127\.0\.0\.1:4319\/healthz/u);
  assert.match(readiness, /external_attestation=REQUIRED/u);
  assert.match(deploy, /verify-bundle/u);
  assert.match(deploy, /verify-extracted/u);
  assert.match(
    deploy,
    /chillywood-research-transport-credential-compat\.conf\.template/u,
  );
  assert.match(deploy, /install_credential_drop_in "\$previous_target"/u);
  assert.match(rollback, /verify-release/u);
  assert.match(
    rollback,
    /chillywood-research-transport-credential-compat\.conf\.template/u,
  );
  assert.match(readiness, /credential_boundary=MISMATCH/u);
  assert.match(readiness, /credential_boundary=MATCH/u);
  assert.match(readiness, /0:0:600/u);
  assert.match(readiness, /\$service_uid:\$service_gid:400/u);
  assert.match(readiness, /cmp -s "\$persistent_credential" "\$runtime_credential"/u);
  for (const value of [deploy, rollback, readiness]) {
    assert.doesNotMatch(value, /set -x|printenv|export -p/u);
  }
});

test("systemd compatibility delta leaves the reviewed Node credential boundary unchanged", async () => {
  const packageRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const expected = new Map([
    [
      "bin/server.mjs",
      "fb61e3ee9901e7ae143cb79bf8948ce4d3208f800a5f9e35db00da75183a307b",
    ],
    [
      "src/host-auth.mjs",
      "a48f8456e56cdd66ba3fe485b0151df93d6df57d88767b5889bcef86c22467a3",
    ],
    [
      "src/host-service.mjs",
      "5ebd79563104167f7c60914e56f2f7f33a5743eb10d715bce17981aa0eebdcaa",
    ],
  ]);
  for (const [relative, expectedHash] of expected) {
    const source = await readFile(resolve(packageRoot, relative));
    assert.equal(
      createHash("sha256").update(source).digest("hex"),
      expectedHash,
    );
  }
});
