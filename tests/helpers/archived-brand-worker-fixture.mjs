import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PROJECT_ORIGIN, runArchivedBrandVerification } from "../../ops/malware-scanner-worker/archived-brand-worker.mjs";

export const requestId = "00000000-0000-4000-8000-000000000001";
export const attemptId = "00000000-0000-4000-8000-000000000002";
export const resultId = "00000000-0000-4000-8000-000000000003";
export const receiptId = "00000000-0000-4000-8000-000000000004";
export const binding = {
  assetId: "00000000-0000-4000-8000-000000000005", ownerId: "platform_rachi_official",
  storageObjectId: "00000000-0000-4000-8000-000000000006", storageVersion: "fixture-version-1",
  sourceCreatedAt: "2026-10-01T00:00:00.000000Z", provider: "supabase", bucket: "platform-brand-assets",
  objectKey: "platform_rachi_official/logo/private-fixture.png",
};

// Entirely in-memory RPC/GET fixtures. No server/provider is contacted, no
// service credentials are loaded, and no production request IDs are accepted.
export async function archivedFixture(options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "archived-brand-test-"));
  const calls = [];
  const executable = join(directory, "clamscan-fixture");
  const log = join(directory, "processes.jsonl");
  const invocations = join(directory, "engine-invocations.jsonl");
  const marker = join(directory, "version-counter");
  const mode = options.mode ?? "clean";
  await writeFile(executable, `#!${process.execPath}
const fs = require('node:fs');
const crypto = require('node:crypto');
const mode = ${JSON.stringify(mode)};
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(invocations)}, JSON.stringify(args) + '\\n');
if (args.includes('--version')) {
  if (mode === 'version_error') process.exit(2);
  if (mode === 'version_unknown') { console.log('ClamAV 1.4.3'); process.exit(0); }
  if (mode === 'version_malformed') { console.log('secret credential and private object path'); process.exit(0); }
  let version = '28000';
  if (mode === 'version_changed') {
    const previous = fs.existsSync(${JSON.stringify(marker)}) ? Number(fs.readFileSync(${JSON.stringify(marker)}, 'utf8')) : 0;
    fs.writeFileSync(${JSON.stringify(marker)}, String(previous + 1));
    version = String(28000 + previous);
  }
  console.log('ClamAV 1.4.3/' + version + '/Sun Oct 25 00:00:00 2026');
  process.exit(0);
}
const path = args.at(-1);
const bytes = fs.readFileSync(path);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({args, sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
  size:bytes.length, mode:fs.statSync(path).mode & 511, directoryMode:fs.statSync(require('node:path').dirname(path)).mode & 511}) + '\\n');
if (mode === 'timeout') { setInterval(() => {}, 1000); }
else if (mode === 'output_limit') { process.stdout.write('x'.repeat(100000)); setInterval(() => {}, 1000); }
else if (mode === 'malware') { console.log(path + ': Fixture.EICAR.UNOFFICIAL FOUND'); process.exit(1); }
else if (mode === 'infection_without_name') { console.log('private credential output'); process.exit(1); }
else if (mode === 'process_error') { console.error('private credential and raw path'); process.exit(2); }
else if (mode === 'wrong_clean') { console.log('unrelated path: OK'); process.exit(0); }
else if (mode === 'mutate_file') { fs.writeFileSync(path, Buffer.alloc(bytes.length, 120)); console.log(path + ': OK'); }
else if (mode === 'replace_file') { fs.unlinkSync(path); fs.writeFileSync(path, bytes, { mode:384 }); console.log(path + ': OK'); }
else { console.log(path + ': OK'); }
`, { mode: 0o700 });
  const env = {
    ARCHIVED_BRAND_VERIFICATION_ONCE: "true", ARCHIVED_BRAND_VERIFICATION_REQUEST_IDS: requestId,
    SUPABASE_URL: PROJECT_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-not-a-credential", WORKER_ID: "archived-local-fixture",
    ...options.env,
  };
  const body = options.body ?? Buffer.from("benign archived Brand fixture\n");
  const attempt = {
    requestId, attemptId, claimToken: "00000000-0000-4000-8000-000000000007", workerId: env.WORKER_ID,
    expiresAt: new Date(Date.now() + 19 * 60_000).toISOString(), binding: structuredClone(binding),
    archiveBinding: { binding: structuredClone(binding), assetType: "logo", assetState: "archived",
      sourceDeletedAt: "2026-10-02T00:00:00.123456Z", incarnationObservedAt: "2026-10-03T00:00:00.654321Z",
      removedAt: "2026-10-03T00:00:00.654321Z", retainUntil: "2026-11-02T00:00:00.654321Z",
      removalClock: "legacy_unknown_conservative_observation", expectedSizeBytes: options.expectedSizeBytes ?? Math.max(1, body.length) },
  };
  if (options.changeAttempt) options.changeAttempt(attempt);
  let reads = 0;
  const rpc = async (name, payload) => {
    calls.push({ name, payload: structuredClone(payload) });
    if (name === "claim_platform_brand_archived_verification") {
      if (options.claimError) throw Error("secret claim output");
      return options.claim ?? { status: "claimed", attempts: [structuredClone(attempt)] };
    }
    if (name === "read_platform_brand_archived_verification_attempt") {
      reads++;
      if (options.readError === reads) throw Error("secret read output");
      if (options.denyRead === reads) return { status: "unavailable" };
      const value = { status: "authorized", ...structuredClone(attempt) };
      if (options.changeRead) options.changeRead(value, reads);
      return value;
    }
    if (name === "record_platform_brand_archived_verification_result") {
      if (options.recordError) throw Error("secret uncertain result output");
      return options.recordResponse ?? { resultId, status: payload.p_result.status };
    }
    if (name === "seal_platform_brand_archived_verification") {
      if (options.sealError) throw Error("secret uncertain seal output");
      return options.sealResponse ?? { receiptId, proofRecorded: true };
    }
    throw Error("unexpected RPC");
  };
  const fetcher = async (url, init) => {
    calls.push({ name: "GET", url, init });
    if (options.fetchError) throw Error("secret network output");
    if (options.response) return options.response(url, init);
    return new Response(body, { status: options.status ?? 200,
      headers: { "content-length": String(body.length), ...options.headers } });
  };
  return {
    directory, calls, body, attempt, env, rpc, fetcher,
    run: () => runArchivedBrandVerification(env, { rpc, fetcher, tempRoot: directory, clamscanBin: executable,
      scanTimeoutMs: options.scanTimeoutMs ?? 2000, downloadTimeoutMs: options.downloadTimeoutMs ?? 2000, ...options.dependencies }),
    recorded: () => calls.filter(call => call.name === "record_platform_brand_archived_verification_result"),
    sealed: () => calls.filter(call => call.name === "seal_platform_brand_archived_verification"),
    scanned: async () => (await readFile(log, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line)),
    engineInvocations: async () => (await readFile(invocations, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line)),
    leftovers: async () => (await readdir(directory)).filter(name => name.startsWith("brand-archived-scan-")),
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
