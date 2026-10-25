import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { archivedFixture } from "../tests/helpers/archived-brand-worker-fixture.mjs";

// LOCAL ONLY. Requires an already installed real ClamAV binary. No installation,
// freshclam, provider, database, credentials, or network access takes place here.
// The temporary hash signature is deterministic TEST evidence, not production
// signature freshness, production malware qualification, or deployment proof.
const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
const clamscanBin = process.env.CLAMSCAN_BIN?.trim() || "clamscan";
const results = [];
for (const [label, body, status] of [["benign", Buffer.from("Benign archived Brand real-engine fixture\n"), "sealed"],
  ["eicar", eicar, "malware_detected"]]) {
  const fixture = await archivedFixture({ body });
  try {
    const localSignatureFile = join(fixture.directory, "archived-fixture.hdb");
    const signature = `${createHash("md5").update(eicar).digest("hex")}:${eicar.length}:ArchivedBrand.EICAR.fixture\n`;
    await writeFile(localSignatureFile, signature, { mode: 0o600 });
    const { runArchivedBrandVerification } = await import("../ops/malware-scanner-worker/archived-brand-worker.mjs");
    const result = await runArchivedBrandVerification(fixture.env, { rpc: fixture.rpc, fetcher: fixture.fetcher,
      tempRoot: fixture.directory, clamscanBin, localSignatureFile, scanTimeoutMs: 30_000 });
    assert.equal(result.outcomes[0].status, status, `${label}: actual ClamAV must produce ${status}`);
    const recorded = fixture.recorded()[0].payload.p_result;
    assert.equal(recorded.sha256, createHash("sha256").update(body).digest("hex"));
    assert.equal(recorded.sizeBytes, body.length); assert.equal(recorded.fullReadback, true);
    assert.equal(recorded.sizeBytes, fixture.attempt.archiveBinding.expectedSizeBytes);
    assert.match(recorded.scannerVersion, /^ClamAV [0-9]+\.[0-9]+\.[0-9]+/);
    assert.equal(recorded.signatureVersion, `local-fixture-sha256:${createHash("sha256").update(signature).digest("hex")}`);
    assert.equal(recorded.exitCode, label === "benign" ? 0 : 1);
    assert.equal(fixture.sealed().length, label === "benign" ? 1 : 0);
    if (label === "eicar") assert.match(recorded.findingName, /EICAR/i);
    assert.deepEqual(await fixture.leftovers(), []);
    results.push({ fixture: label, status, scannerVersion: recorded.scannerVersion, signatureVersion: recorded.signatureVersion });
  } finally { await fixture.cleanup(); }
}
// These run through the same runner with the real binary configured, but must
// fail before engine identity/scan. A forged positive length on an empty body
// must not turn ClamAV's empty-file success into clean evidence.
for (const [label, body, length, errorCode] of [["empty-zero-length", Buffer.from(""), "0", "full_read_required"],
  ["empty-positive-length", Buffer.from(""), "29", "length_mismatch"],
  ["wrong-pinned-size", Buffer.from("abc"), "3", "full_read_required"]]) {
  const fixture = await archivedFixture({ body, expectedSizeBytes: 29, headers: { "content-length": length } });
  try {
    const { runArchivedBrandVerification } = await import("../ops/malware-scanner-worker/archived-brand-worker.mjs");
    const result = await runArchivedBrandVerification(fixture.env, { rpc: fixture.rpc, fetcher: fixture.fetcher,
      tempRoot: fixture.directory, clamscanBin, scanTimeoutMs: 30_000 });
    assert.equal(result.outcomes[0].status, "scan_failed");
    const recorded = fixture.recorded()[0].payload.p_result;
    assert.equal(recorded.errorCode, errorCode); assert.equal(recorded.scannerVersion, "unknown");
    assert.equal(recorded.fullReadback, false); assert.equal(recorded.sha256, null); assert.equal(recorded.sizeBytes, null);
    assert.equal(fixture.sealed().length, 0); assert.deepEqual(await fixture.leftovers(), []);
    results.push({ fixture: label, status: "scan_failed", engineReached: false });
  } finally { await fixture.cleanup(); }
}
console.log(JSON.stringify({ passed: true, localOnly: true, syntheticSignatures: true, productionQualified: false, results }));
