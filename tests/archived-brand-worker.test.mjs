import test from "node:test";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { archivedFixture, requestId, resultId, binding } from "./helpers/archived-brand-worker-fixture.mjs";
import { PROJECT_ORIGIN, MAX_BYTES, runArchivedBrandVerification, runBoundedCommand } from "../ops/malware-scanner-worker/archived-brand-worker.mjs";

const using = async (options, action) => {
  const fixture = await archivedFixture(options);
  try { await action(fixture); } finally { await fixture.cleanup(); }
};
const names = fixture => fixture.calls.map(call => call.name.replace("_platform_brand_archived_verification", ""));

test("disabled import and CLI perform no RPC, GET, scan, recovery or configuration lookup", async () => {
  for (const value of [undefined, "false", "TRUE", "1", " true"]) {
    assert.deepEqual(await runArchivedBrandVerification({ ARCHIVED_BRAND_VERIFICATION_ONCE: value }, {
      rpc: () => { throw Error("must not call"); }, fetcher: () => { throw Error("must not call"); },
    }), { status: "disabled", outcomes: [] });
  }
  const child = spawnSync(process.execPath, ["ops/malware-scanner-worker/archived-brand-worker.mjs"], {
    encoding: "utf8", cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH }, timeout: 2000,
  });
  assert.equal(child.status, 0); assert.equal(child.stderr, "");
  assert.deepEqual(JSON.parse(child.stdout), { status: "disabled", outcomes: [] });
});

test("request allowlist rejects missing, malformed, duplicate and more than two IDs before RPC", async () => {
  for (const ids of ["", "bad", `${requestId},${requestId.toUpperCase()}`, `${requestId},${resultId},${binding.assetId}`, `${requestId},`]) {
    await using({ env: { ARCHIVED_BRAND_VERIFICATION_REQUEST_IDS: ids } }, async f => {
      assert.equal((await f.run()).status, "configuration_invalid"); assert.deepEqual(f.calls, []);
    });
  }
});

test("production origin and existing authority configuration fail closed before RPC", async () => {
  const changes = ["http://bmkkhihfbmsnnmcqkoly.supabase.co", "https://other.supabase.co", `${PROJECT_ORIGIN}/path`,
    `${PROJECT_ORIGIN}?x=1`, `${PROJECT_ORIGIN}#x`, `${PROJECT_ORIGIN}:443`, PROJECT_ORIGIN.replace("https://", "https://user:pass@")]
    .map(SUPABASE_URL => ({ SUPABASE_URL }));
  changes.push({ SUPABASE_SERVICE_ROLE_KEY: "" }, { WORKER_ID: "" }, { WORKER_ID: "bad worker" });
  for (const env of changes) await using({ env }, async f => {
    assert.equal((await f.run()).status, "configuration_invalid"); assert.deepEqual(f.calls, []);
  });
});

test("clean exact full GET hashes and scans the same private file, rechecks, records once, then seals", async () => {
  await using({}, async f => {
    assert.equal((await f.run()).outcomes[0].status, "sealed");
    assert.deepEqual(names(f), ["claim", "read_attempt", "GET", "read_attempt", "read_attempt", "record_result", "seal"]);
    const get = f.calls.find(call => call.name === "GET");
    assert.equal(get.url, `${PROJECT_ORIGIN}/storage/v1/object/${binding.bucket}/${binding.objectKey}`);
    assert.equal(get.init.method, "GET"); assert.equal(get.init.redirect, "error"); assert.equal(get.init.cache, "no-store");
    assert.equal(get.init.headers["accept-encoding"], "identity"); assert.equal(get.init.headers.range, undefined);
    const recorded = f.recorded()[0].payload.p_result;
    assert.deepEqual(Object.keys(recorded).sort(), ["status", "sha256", "sizeBytes", "scannerProvider", "scannerVersion", "signatureVersion",
      "exitCode", "durationMs", "findingName", "errorCode", "fullReadback"].sort());
    assert.equal(recorded.sha256, createHash("sha256").update(f.body).digest("hex"));
    assert.equal(recorded.sizeBytes, f.body.length); assert.equal(recorded.fullReadback, true);
    assert.equal(recorded.sizeBytes, f.attempt.archiveBinding.expectedSizeBytes);
    assert.equal(recorded.status, "clean"); assert.equal(recorded.exitCode, 0); assert.equal(recorded.errorCode, null);
    assert.equal(recorded.scannerVersion, "ClamAV 1.4.3"); assert.match(recorded.signatureVersion, /^28000\//);
    const processes = await f.scanned(); assert.equal(processes.length, 1);
    assert.equal(processes[0].sha256, recorded.sha256); assert.equal(processes[0].size, recorded.sizeBytes);
    assert.equal(processes[0].mode, 0o600); assert.equal(processes[0].directoryMode, 0o700);
    assert.ok(processes[0].args.includes("--alert-exceeds-max=yes"));
    assert.equal(f.sealed()[0].payload.p_result_id, resultId); assert.deepEqual(await f.leftovers(), []);
  });
});

test("server-disabled and empty batch are finite no-op outcomes", async () => {
  for (const [claim, status] of [[{ status: "disabled", attempts: [] }, "disabled"], [{ status: "claimed", attempts: [] }, "no_work"]]) {
    await using({ claim }, async f => { assert.equal((await f.run()).status, status); assert.equal(f.calls.length, 1); });
  }
});

test("two explicit unique requests scan sequentially in one bounded claim, without polling", async () => {
  await using({ env: { ARCHIVED_BRAND_VERIFICATION_REQUEST_IDS: `${requestId},${resultId}` } }, async f => {
    const second = { ...structuredClone(f.attempt), requestId: resultId, attemptId: binding.assetId };
    const rpc = async (name, payload) => {
      if (name === "claim_platform_brand_archived_verification") {
        f.calls.push({ name, payload });
        return { status: "claimed", attempts: [structuredClone(f.attempt), second] };
      }
      if (name === "read_platform_brand_archived_verification_attempt" && payload.p_attempt_id === second.attemptId) {
        f.calls.push({ name, payload }); return { status: "authorized", ...structuredClone(second) };
      }
      return f.rpc(name, payload);
    };
    const result = await runArchivedBrandVerification(f.env, { rpc, fetcher: f.fetcher, tempRoot: f.directory,
      clamscanBin: `${f.directory}/clamscan-fixture`, scanTimeoutMs: 2000 });
    assert.deepEqual(result.outcomes.map(outcome => outcome.status), ["sealed", "sealed"]);
    assert.equal(f.calls.filter(call => call.name === "claim_platform_brand_archived_verification").length, 1);
    assert.deepEqual(f.calls[0].payload.p_request_ids, [requestId, resultId]);
    assert.equal((await f.scanned()).length, 2); assert.equal(f.recorded().length, 2); assert.equal(f.sealed().length, 2);
    assert.deepEqual(await f.leftovers(), []);
  });
});

test("invalid, foreign, duplicate and expired claims never GET or mutate a result", async () => {
  const mutations = [a => { a.requestId = resultId; }, a => { a.workerId = "another"; }, a => { a.claimToken = "bad token"; },
    a => { a.expiresAt = "2000-01-01T00:00:00Z"; }, a => { a.expiresAt = new Date(Date.now() + 30 * 60_000).toISOString(); },
    a => { a.binding.provider = "s3"; }, a => { a.binding.bucket = "other"; }, a => { a.binding.objectKey = "another-owner/file"; },
    a => { a.binding.objectKey = `${binding.ownerId}/../private`; }, a => { a.binding.storageVersion = ""; },
    a => { a.archiveBinding.binding.storageVersion = "other"; }, a => { a.archiveBinding.assetState = "published"; },
    a => { a.archiveBinding.assetType = "unexpected"; }, a => { a.archiveBinding.removalClock = "unknown"; },
    a => { delete a.archiveBinding.sourceDeletedAt; }, a => { a.archiveBinding.sourceDeletedAt = "2026-02-30T00:00:00.000000Z"; },
    a => { a.archiveBinding.incarnationObservedAt = null; }, a => { a.archiveBinding.retainUntil = "2026-11-02T00:00:00.654322Z"; },
    a => { a.archiveBinding.removedAt = a.archiveBinding.sourceDeletedAt; }, a => { a.archiveBinding.extra = "unbound"; }];
  for (const changeAttempt of mutations) await using({ changeAttempt }, async f => {
    assert.equal((await f.run()).status, "claim_uncertain"); assert.deepEqual(names(f), ["claim"]);
  });
  await using({ env: { ARCHIVED_BRAND_VERIFICATION_REQUEST_IDS: `${requestId},${resultId}` } }, async f => {
    const result = await runArchivedBrandVerification(f.env, { rpc: async () => ({ status: "claimed", attempts: [f.attempt, f.attempt] }) });
    assert.equal(result.status, "claim_uncertain");
  });
});

test("every incarnation, tombstone, claim and expiry change fails closed at each recheck", async () => {
  const mutations = [a => { a.binding.storageVersion = "other"; a.archiveBinding.binding.storageVersion = "other"; },
    a => { a.archiveBinding.sourceDeletedAt = "2026-10-03T00:00:00.000000Z"; }, a => { a.claimToken = resultId; },
    a => { a.archiveBinding.expectedSizeBytes++; },
    a => { a.expiresAt = "2000-01-01T00:00:00Z"; }];
  for (const denyRead of [1, 2, 3]) await using({ denyRead }, async f => {
    assert.equal((await f.run()).outcomes[0].status, "attempt_unavailable");
    assert.equal(f.recorded().length, 0); assert.equal(f.sealed().length, 0);
    assert.equal(f.calls.some(call => call.name === "GET"), denyRead !== 1);
    assert.equal((await f.scanned()).length, denyRead === 3 ? 1 : 0); assert.deepEqual(await f.leftovers(), []);
  });
  for (const change of mutations) for (const at of [1, 2, 3]) await using({ changeRead: (value, count) => { if (count === at) change(value); } }, async f => {
    assert.equal((await f.run()).outcomes[0].status, "attempt_unavailable"); assert.equal(f.recorded().length, 0);
  });
});

test("partial, encoded, transformed, unbounded or noninteger-length responses cannot scan or seal", async () => {
  const variants = [{ status: 206 }, { status: 404 }, { headers: { "content-range": "bytes 0-2/20" } },
    { headers: { "content-encoding": "gzip" } }, ...["0", "-1", "", "1.5", "1e2", " 1 ", "01", "Infinity", String(MAX_BYTES + 1)]
      .map(length => ({ headers: { "content-length": length } })),
    { response: () => { const value = new Response("abc", { headers: { "content-length": "3" } }); Object.defineProperty(value, "redirected", { value: true }); return value; } },
    { response: () => new Response("abc") }];
  for (const options of variants) await using(options, async f => {
    assert.equal((await f.run()).outcomes[0].status, "scan_failed"); assert.equal((await f.scanned()).length, 0);
    assert.equal(f.recorded()[0].payload.p_result.fullReadback, false); assert.equal(f.recorded()[0].payload.p_result.sha256, null);
    assert.equal(f.sealed().length, 0); assert.deepEqual(await f.leftovers(), []);
  });
  await using({ body: Buffer.from("abc"), expectedSizeBytes: 29, headers: { "content-length": "3" },
    dependencies: { tempRoot: "/nonexistent-archived-local-test-tmp" } }, async f => {
    assert.equal((await f.run()).outcomes[0].status, "scan_failed");
    assert.equal(f.recorded()[0].payload.p_result.errorCode, "full_read_required",
      "mismatched declared size must reject before attempting temporary filesystem creation");
    assert.deepEqual(await f.engineInvocations(), []);
  });
});

test("empty, truncated, extra, throwing and stalled streams fail without fabricated byte evidence", async () => {
  const variants = [{ body: Buffer.from("") }, { headers: { "content-length": "1" } }, { headers: { "content-length": "100" } },
    { fetchError: true }, { expectedSizeBytes: 3, response: () => new Response(new ReadableStream({ pull() { throw Error("secret body error"); } }), { headers: { "content-length": "3" } }) },
    { expectedSizeBytes: 3, downloadTimeoutMs: 30, response: () => new Response(new ReadableStream({ start() {} }), { headers: { "content-length": "3" } }) }];
  for (const options of variants) await using(options, async f => {
    const outcome = await f.run(); assert.equal(outcome.outcomes[0].status, "scan_failed");
    const value = f.recorded()[0].payload.p_result; assert.equal(value.sha256, null); assert.equal(value.sizeBytes, null);
    assert.equal(value.fullReadback, false); assert.equal(f.sealed().length, 0); assert.deepEqual(await f.leftovers(), []);
  });
});

test("pinned source size is mandatory, positive and bounded before GET or any engine invocation", async () => {
  for (const expectedSizeBytes of [undefined, null, 0, -1, 1.5, "29", MAX_BYTES + 1, Number.MAX_SAFE_INTEGER + 1]) {
    await using({ changeAttempt: attempt => { attempt.archiveBinding.expectedSizeBytes = expectedSizeBytes; } }, async f => {
      assert.equal((await f.run()).status, "claim_uncertain");
      assert.deepEqual(names(f), ["claim"]); assert.deepEqual(await f.engineInvocations(), []);
      assert.equal(f.recorded().length, 0); assert.equal(f.sealed().length, 0); assert.deepEqual(await f.leftovers(), []);
    });
  }
});

test("empty and misleading-length bodies never reach the engine or mint clean byte evidence", async () => {
  const variants = [
    { body: Buffer.from(""), expectedSizeBytes: 29, headers: { "content-length": "0" } },
    { body: Buffer.from(""), expectedSizeBytes: 29, headers: { "content-length": "29" } },
    { body: Buffer.from(""), expectedSizeBytes: 29, headers: { "content-length": "1" } },
    { body: Buffer.from("abc"), expectedSizeBytes: 29, headers: { "content-length": "3" } },
    { body: Buffer.from("abc"), expectedSizeBytes: 3, headers: { "content-length": "4" } },
    { body: Buffer.from("abcd"), expectedSizeBytes: 3, headers: { "content-length": "3" } },
  ];
  for (const options of variants) await using(options, async f => {
    const result = await f.run(); assert.equal(result.outcomes[0].status, "scan_failed");
    assert.deepEqual(await f.engineInvocations(), [], JSON.stringify(options.headers));
    const record = f.recorded()[0].payload.p_result;
    assert.equal(record.fullReadback, false); assert.equal(record.sha256, null); assert.equal(record.sizeBytes, null);
    assert.equal(record.status, "scan_failed"); assert.equal(record.scannerVersion, "unknown");
    assert.ok(["full_read_required", "length_mismatch"].includes(record.errorCode));
    assert.equal(f.sealed().length, 0); assert.deepEqual(await f.leftovers(), []);
  });
});

test("infection records exact full bytes and a sanitized finding but never seals", async () => {
  await using({ mode: "malware" }, async f => {
    assert.equal((await f.run()).outcomes[0].status, "malware_detected");
    const value = f.recorded()[0].payload.p_result;
    assert.equal(value.findingName, "Fixture.EICAR.UNOFFICIAL"); assert.equal(value.exitCode, 1); assert.equal(value.fullReadback, true);
    assert.equal(value.sha256, createHash("sha256").update(f.body).digest("hex")); assert.equal(f.sealed().length, 0);
  });
});

test("chunk boundaries cannot change hash or scanned bytes, and post-failure denial prevents recording", async () => {
  const body = Buffer.from("abcdef".repeat(1000));
  await using({ body, response: () => new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < body.length; i += 17) controller.enqueue(body.subarray(i, i + 17));
    controller.close();
  } }), { headers: { "content-length": String(body.length) } }) }, async f => {
    assert.equal((await f.run()).outcomes[0].status, "sealed");
    assert.equal(f.recorded()[0].payload.p_result.sha256, createHash("sha256").update(body).digest("hex"));
  });
  for (const options of [{ fetchError: true, denyRead: 2 }, { mode: "version_unknown", denyRead: 3 }, { readError: 1 }]) {
    await using(options, async f => {
      assert.equal((await f.run()).outcomes[0].status, "attempt_unavailable");
      assert.equal(f.recorded().length, 0); assert.equal(f.sealed().length, 0); assert.deepEqual(await f.leftovers(), []);
    });
  }
});

test("actual subprocess failures, limits, unknown versions, altered file and identity never produce clean", async () => {
  for (const mode of ["version_error", "version_unknown", "version_malformed", "version_changed", "process_error", "wrong_clean",
    "infection_without_name", "timeout", "output_limit", "mutate_file", "replace_file"]) {
    await using({ mode, scanTimeoutMs: mode === "timeout" ? 150 : 2000 }, async f => {
      const result = await f.run(); assert.equal(result.outcomes[0].status, "scan_failed", mode);
      assert.equal(f.sealed().length, 0); assert.equal(f.recorded().length, 1); assert.deepEqual(await f.leftovers(), []);
      assert.equal(JSON.stringify(result).includes("secret"), false); assert.equal(JSON.stringify(result).includes("private"), false);
    });
  }
  const result = await runBoundedCommand("/nonexistent-local-scanner-test", [], 1000);
  assert.equal(result.exitCode, -1); assert.equal(result.errorCode, "scanner_spawn_failed");
});

test("uncertain claim/result/seal is not retried and an unacknowledged result is never sealed", async () => {
  for (const [options, status] of [[{ claimError: true }, "claim_uncertain"], [{ recordError: true }, "record_uncertain"],
    [{ recordResponse: { resultId, status: "wrong" } }, "record_uncertain"], [{ recordResponse: { resultId: "bad", status: "clean" } }, "record_uncertain"],
    [{ sealError: true }, "seal_uncertain"], [{ sealResponse: { proofRecorded: false } }, "seal_uncertain"]]) {
    await using(options, async f => {
      const result = await f.run(); assert.equal(result.outcomes?.[0]?.status ?? result.status, status);
      assert.equal(f.calls.filter(call => call.name === "claim_platform_brand_archived_verification").length, 1);
      assert.equal(f.recorded().length, options.claimError ? 0 : 1);
      assert.equal(f.sealed().length, status === "seal_uncertain" ? 1 : 0);
      assert.deepEqual(await f.leftovers(), []); assert.equal(JSON.stringify(result).includes("secret"), false);
    });
  }
});

test("real HTTP adapter uses only canonical archived RPC routes and rejects uncertain transport once", async () => {
  await using({}, async f => {
    const requests = [];
    const fetcher = async (url, init) => {
      requests.push({ url, init });
      if (init.method === "GET") return f.fetcher(url, init);
      const name = url.split("/").at(-1);
      const result = await f.rpc(name, JSON.parse(init.body));
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    };
    const result = await runArchivedBrandVerification(f.env, { fetcher, tempRoot: f.directory,
      clamscanBin: `${f.directory}/clamscan-fixture`, scanTimeoutMs: 2000 });
    assert.equal(result.outcomes[0].status, "sealed");
    for (const request of requests) {
      assert.ok(request.url.startsWith(PROJECT_ORIGIN)); assert.equal(request.init.redirect, "error");
      assert.equal(request.init.cache, "no-store"); assert.equal(request.init.headers.apikey, f.env.SUPABASE_SERVICE_ROLE_KEY);
      assert.equal(request.url.includes("media_scan_jobs"), false);
    }
    let calls = 0;
    const failed = await runArchivedBrandVerification(f.env, { fetcher: async () => { calls++; return new Response("secret", { status: 500 }); } });
    assert.equal(failed.status, "claim_uncertain"); assert.equal(calls, 1);
  });
});

test("RPC response parsing is bounded and treats malformed, partial and timed-out writes as uncertain", async () => {
  await using({}, async f => {
    for (const variant of ["malformed", "oversized", "stalled"]) {
      let calls = 0;
      const result = await runArchivedBrandVerification(f.env, { rpcTimeoutMs: 30, fetcher: async () => {
        calls++;
        if (variant === "malformed") return new Response("not json");
        if (variant === "oversized") return new Response("x".repeat(65_537));
        return new Response(new ReadableStream({ start() {} }));
      } });
      assert.equal(result.status, "claim_uncertain"); assert.equal(calls, 1);
    }
  });
});
