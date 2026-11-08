import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  PAID_VIDEO_BASELINE, materializePaidVideoBaseline,
  validatePaidVideoBaselineEntry, validatePaidVideoBaselineManifest,
} from "../../scripts/ci/paid-video-baseline.mjs";

const manifestBytes = fs.readFileSync(new URL("../../scripts/ci/fixtures/paid-video-v2-baseline.json", import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const temporaryDirectory = (t) => {
  // Resolve the system temp alias before exercising the no-symlink policy.
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "paid-video-baseline-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};
const entry = () => {
  const contents = Buffer.from("immutable source baseline\n");
  const blob = createHash("sha1").update(`blob ${contents.length}\0`).update(contents).digest("hex");
  return { name: "source/baseline.sql", mode: "100644", type: "blob", contents,
    blob, expectedBlob: blob, expectedSha256: sha256(contents) };
};

test("baseline manifest retains its exact reviewed bytes and published identity", () => {
  const manifest = validatePaidVideoBaselineManifest(manifestBytes);
  assert.equal(sha256(manifestBytes), "f3b28f88a28e8024c100b999e7cbc7569e60507838a4ffa0f8a7856a8f9d6959");
  assert.equal(manifest.remoteCommit, "0d1d3b3a959295dfc44a6485ab8f7067d933bb43");
  assert.equal(manifest.tree, "5e9b8f86792c2fab606ed216037aec916f094b7c");
  assert.equal(manifest.commit, "12335a768fb683267ac281b1a180f9650479a98d", "local source identity is unchanged provenance");
  assert.equal(Object.keys(manifest.files).length, 20);
  for (const mutate of [
    (value) => { value.files[Object.keys(value.files)[0]] = "a".repeat(64); },
    (value) => { value.gitBlobs[Object.keys(value.gitBlobs)[0]] = "b".repeat(40); },
    (value) => { value.remoteCommit = value.commit; },
    (value) => { value.files["../escape.sql"] = "a".repeat(64); },
  ]) {
    const changed = JSON.parse(manifestBytes);
    mutate(changed);
    assert.throws(() => validatePaidVideoBaselineManifest(Buffer.from(JSON.stringify(changed))), /MANIFEST_SHA256_MISMATCH/u);
  }
  assert.throws(() => validatePaidVideoBaselineManifest(Buffer.concat([manifestBytes, Buffer.from("\n")])), /MANIFEST_SHA256_MISMATCH/u);
});

test("entry validation independently binds tree blob, Git content identity and SHA256", () => {
  const original = entry();
  assert.equal(validatePaidVideoBaselineEntry(original), original.contents);
  assert.throws(() => validatePaidVideoBaselineEntry({ ...original, blob: "f".repeat(40) }), /TREE_BLOB_MISMATCH/u);
  assert.throws(() => validatePaidVideoBaselineEntry({ ...original, contents: Buffer.from("different bytes\n") }), /BLOB_CONTENT_MISMATCH/u);
  assert.throws(() => validatePaidVideoBaselineEntry({ ...original, expectedSha256: "f".repeat(64) }), /FILE_SHA256_MISMATCH/u);
  assert.throws(() => validatePaidVideoBaselineEntry({ ...original, blob: "f".repeat(40), expectedBlob: "f".repeat(40) }), /BLOB_CONTENT_MISMATCH/u);
});

test("entry validation rejects symlinks, Git links, nonregular modes and unsafe relative paths", () => {
  for (const changed of [{ mode: "120000" }, { mode: "160000", type: "commit" }, { mode: "100755" }]) {
    assert.throws(() => validatePaidVideoBaselineEntry({ ...entry(), ...changed }), /ENTRY_NOT_REGULAR/u);
  }
  for (const name of ["../escape.sql", "a/../../escape.sql", "/absolute.sql", "a//b.sql", "a/./b.sql",
    "a\\b.sql", "a\0b.sql", "manifest.json", ""]) {
    assert.throws(() => validatePaidVideoBaselineEntry({ ...entry(), name }), /PATH_INVALID/u, name);
  }
});

test("materialization reads the actual published Git tree and creates an exact readonly baseline", (t) => {
  const destination = path.join(temporaryDirectory(t), "baseline");
  const result = materializePaidVideoBaseline({ repositoryRoot: process.cwd(), destination });
  assert.deepEqual(result, { destination, manifestPath: path.join(destination, "manifest.json"),
    manifestSha256: PAID_VIDEO_BASELINE.manifestSha256,
    sourceCommit: PAID_VIDEO_BASELINE.sourceCommit, sourceTree: PAID_VIDEO_BASELINE.sourceTree, fileCount: 20 });
  assert.deepEqual(fs.readFileSync(result.manifestPath), manifestBytes);
  const manifest = JSON.parse(manifestBytes);
  const files = [];
  const walk = (directory) => {
    const stat = fs.lstatSync(directory);
    assert.equal(stat.mode & 0o777, 0o700);
    assert.equal(stat.isSymbolicLink(), false);
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name);
      const child = fs.lstatSync(file);
      if (child.isDirectory()) walk(file);
      else {
        assert.equal(child.isFile(), true);
        assert.equal(child.mode & 0o777, 0o400);
        files.push(path.relative(destination, file));
      }
    }
  };
  walk(destination);
  assert.deepEqual(files.sort(), [...Object.keys(manifest.files), "manifest.json"].sort());
  for (const name of Object.keys(manifest.files)) {
    validatePaidVideoBaselineEntry({ name, mode: "100644", type: "blob", blob: manifest.gitBlobs[name],
      expectedBlob: manifest.gitBlobs[name], expectedSha256: manifest.files[name],
      contents: fs.readFileSync(path.join(destination, name)) });
  }
});

test("materialization rejects existing directories, files and dangling destination symlinks without overwriting", (t) => {
  const root = temporaryDirectory(t);
  const directory = path.join(root, "existing-directory");
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, "keep.txt"), "preserve");
  const file = path.join(root, "existing-file");
  fs.writeFileSync(file, "preserve");
  const link = path.join(root, "dangling-link");
  fs.symlinkSync(path.join(root, "missing-target"), link);
  for (const destination of [directory, file, link]) {
    assert.throws(() => materializePaidVideoBaseline({ repositoryRoot: process.cwd(), destination }), /DESTINATION_EXISTS/u);
  }
  assert.equal(fs.readFileSync(file, "utf8"), "preserve");
  assert.equal(fs.readFileSync(path.join(directory, "keep.txt"), "utf8"), "preserve");
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
  assert.equal(fs.existsSync(path.join(root, "missing-target")), false);
});

test("materialization rejects relative, traversal and symlink-parent destinations", (t) => {
  const root = temporaryDirectory(t);
  for (const destination of ["relative-baseline", `${root}/child/../baseline`, `${root}/./baseline`]) {
    assert.throws(() => materializePaidVideoBaseline({ repositoryRoot: process.cwd(), destination }), /DESTINATION_INVALID/u);
  }
  const target = path.join(root, "target");
  fs.mkdirSync(target);
  const link = path.join(root, "link");
  fs.symlinkSync(target, link);
  assert.throws(() => materializePaidVideoBaseline({ repositoryRoot: process.cwd(), destination: path.join(link, "baseline") }), /DESTINATION_PARENT_INVALID/u);
  assert.deepEqual(fs.readdirSync(target), []);
});

test("missing published Git objects fail before writing despite available working-tree lookalikes", (t) => {
  const root = temporaryDirectory(t);
  const repositoryRoot = path.join(root, "repo");
  fs.mkdirSync(repositoryRoot);
  const initialized = spawnSync("git", ["init", "--quiet", repositoryRoot], { encoding: "utf8" });
  assert.equal(initialized.status, 0, initialized.stderr);
  const manifest = JSON.parse(manifestBytes);
  for (const name of Object.keys(manifest.files)) {
    const file = path.join(repositoryRoot, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "working-tree fallback must never be used\n");
  }
  const destination = path.join(root, "baseline");
  assert.throws(() => materializePaidVideoBaseline({ repositoryRoot, destination }), /GIT_OBJECT_UNAVAILABLE/u);
  assert.equal(fs.existsSync(destination), false);
});
