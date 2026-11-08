import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { createHash, webcrypto } from "node:crypto";
import { Buffer } from "node:buffer";
import ts from "typescript";
const uuid = n => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = { userId: uuid(1), accountId: uuid(1), sessionGeneration: uuid(2), restoreOnly: false };
const B = { userId: uuid(3), accountId: uuid(3), sessionGeneration: uuid(4), restoreOnly: false };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture({ platform = "ios", unavailable = false } = {}) {
  let current = A, cancel = false, bytes = Buffer.from("actual byte snapshot"), size = bytes.length, pickedSize = size, pickerWait = null, bytesWait = null, hashWait = null;
  const listeners = new Set(), calls = [];
  const same = (a, b) => !!a && !!b && ["userId", "accountId", "sessionGeneration", "restoreOnly"].every(k => a[k] === b[k]);
  const asset = { name: "Private.mp4", uri: "file:///private/app-cache/source.mp4", mimeType: "video/mp4", size: pickedSize };
  class LocalFile {
    constructor(uri) { assert.equal(uri, asset.uri); calls.push("file"); }
    get size() { return size; } get exists() { return true; }
    async arrayBuffer() { calls.push("bytes"); if (bytesWait) await bytesWait.promise; return Uint8Array.from(bytes).buffer; }
  }
  const bindings = {
    "react-native": { Platform: { OS: platform } }, "expo-file-system": { File: LocalFile },
    "expo-document-picker": { async getDocumentAsync(options) { calls.push(["picker", options]); if (pickerWait) await pickerWait.promise;
      return cancel ? { canceled: true, assets: null } : { canceled: false, assets: [{ ...asset, size: pickedSize }] }; } },
    "expo-crypto": { CryptoDigestAlgorithm: { SHA256: "SHA-256" }, async digest(algorithm, value) { calls.push("hash"); assert.equal(algorithm, "SHA-256"); if (hashWait) await hashWait.promise;
      return webcrypto.subtle.digest(algorithm, Buffer.from(value)); } },
    "./isolatedPaidVideo": { PAID_VIDEO_PROFILE: { maxBytes: 16777216 } },
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => current, sameAccountSessionAuthority: same,
      subscribeToAccountSessionAuthority(fn) { listeners.add(fn); return () => listeners.delete(fn); } },
  };
  const scope = { exports: {}, Error, require(name) { if (unavailable && name === "expo-crypto") throw Error("native module missing"); assert.ok(name in bindings, name); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../_lib/isolatedPaidVideoFiles.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  return { api: scope.exports, calls, asset, initial: Buffer.from(bytes),
    change(value) { current = value; for (const listener of listeners) listener(value); }, cancel() { cancel = true; },
    sizes(value) { size = value; pickedSize = value; }, mismatch() { pickedSize++; }, mutate(value) { bytes = Buffer.from(value); size = bytes.length; },
    delayPicker() { pickerWait = deferred(); return pickerWait; }, delayBytes() { bytesWait = deferred(); return bytesWait; }, delayHash() { hashWait = deferred(); return hashWait; },
  };
}
test("picker hashes the actual bounded byte snapshot and returns a one-use copy without a URI or scan authority", async () => {
  const f = fixture(), owner = f.api.capturePaidVideoFilePicker(A), lease = await owner.choose();
  assert.equal(lease.expectation.expectedSha256, createHash("sha256").update(f.initial).digest("hex"));
  assert.equal(lease.expectation.expectedByteLength, f.initial.length); assert.equal("uri" in lease.expectation, false); assert.equal("clean" in lease.expectation, false);
  const body = lease.takeBytes(); assert.deepEqual(Buffer.from(body), f.initial); await assert.rejects(async () => lease.takeBytes());
  assert.equal(f.calls.find(c => Array.isArray(c))[1].copyToCacheDirectory, true); owner.dispose();
});
test("missing new native crypto module and web fail before any picker or file read", async () => {
  for (const options of [{ unavailable: true }, { platform: "web" }]) {
    const f = fixture(options), owner = f.api.capturePaidVideoFilePicker(A); await assert.rejects(owner.choose(), e => e.code === "native_unavailable");
    assert.equal(f.calls.length, 0); owner.dispose();
  }
});
test("cancel and invalid size/type never read or hash file bytes", async () => {
  const canceled = fixture(), c = canceled.api.capturePaidVideoFilePicker(A); canceled.cancel(); assert.equal(await c.choose(), null); assert.equal(canceled.calls.includes("bytes"), false); c.dispose();
  for (const change of [f => f.sizes(16777217), f => f.sizes(0), f => f.mismatch(), f => { f.asset.mimeType = "image/jpeg"; }, f => { f.asset.uri = "https://foreign.invalid/private.mp4"; }]) {
    const f = fixture(), owner = f.api.capturePaidVideoFilePicker(A); change(f); await assert.rejects(owner.choose(), e => e.code === "invalid_file");
    assert.equal(f.calls.includes("bytes"), false); assert.equal(f.calls.includes("hash"), false); owner.dispose();
  }
});
test("A to B to A while native picker is open permanently retires file authority before reading", async () => {
  const f = fixture(), owner = f.api.capturePaidVideoFilePicker(A), wait = f.delayPicker(); const choosing = owner.choose(); await Promise.resolve(); await Promise.resolve();
  f.change(B); f.change(A); wait.resolve(); await assert.rejects(choosing, e => e.code === "authority_retired");
  assert.equal(f.calls.includes("bytes"), false); await assert.rejects(owner.choose()); owner.dispose();
});
test("auth change or disposal while bytes/hash are pending cannot return a stale file lease", async () => {
  for (const stage of ["bytes", "hash"]) {
    const f = fixture(), owner = f.api.capturePaidVideoFilePicker(A), wait = stage === "bytes" ? f.delayBytes() : f.delayHash();
    const choosing = owner.choose(); for (let i = 0; i < 5; i++) await Promise.resolve();
    owner.dispose(); wait.resolve(); await assert.rejects(choosing, e => e.code === "authority_retired");
  }
});
test("file length change during read fails; successful selection invalidates the older lease", async () => {
  const f = fixture(), owner = f.api.capturePaidVideoFilePicker(A), wait = f.delayBytes(); const choosing = owner.choose(); for (let i = 0; i < 5; i++) await Promise.resolve();
  f.mutate("changed to different length"); wait.resolve(); await assert.rejects(choosing, e => e.code === "invalid_file"); owner.dispose();
  const stable = fixture(), picker = stable.api.capturePaidVideoFilePicker(A); const first = await picker.choose(), second = await picker.choose();
  assert.throws(() => first.takeBytes()); assert.deepEqual(Buffer.from(second.takeBytes()), stable.initial); picker.dispose();
});
test("parallel native selections and stale completed leases cannot bypass the captured account", async () => {
  const f = fixture(), owner = f.api.capturePaidVideoFilePicker(A), wait = f.delayPicker(); const pending = owner.choose(); await Promise.resolve();
  await assert.rejects(owner.choose(), e => e.code === "selection_busy"); wait.resolve(); const lease = await pending;
  f.change(B); f.change(A); assert.throws(() => lease.takeBytes(), e => e.code === "authority_retired"); owner.dispose();
});
