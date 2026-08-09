import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const vendorRoot = path.join(root, "vendor/image-size-safe");
const packageTarball = path.join(
  vendorRoot,
  "chillywood-image-size-safe-1.2.1-chillywood.1.tgz",
);

function bytes(text) {
  return [...Buffer.from(text, "latin1")];
}

function box(size, name, payload = []) {
  return [
    (size >>> 24) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 8) & 0xff,
    size & 0xff,
    ...bytes(name),
    ...payload,
  ];
}

const maliciousFixtures = {
  "heif-zero-ispe": new Uint8Array([
    ...box(16, "ftyp", [...bytes("avif"), 0, 0, 0, 0]),
    ...box(52, "meta", [
      0, 0, 0, 0,
      ...box(40, "iprp", [
        ...box(32, "ipco", [
          ...box(0, "ispe", new Array(16).fill(0)),
        ]),
      ]),
    ]),
  ]),
  "jp2-zero-ihdr": new Uint8Array([
    ...box(12, "jP  ", [0x0d, 0x0a, 0x87, 0x0a]),
    ...box(20, "ftyp", [...bytes("jp2 "), ...new Array(8).fill(0)]),
    ...box(24, "jp2h", [...box(0, "ihdr", new Array(8).fill(0))]),
  ]),
  "jxl-zero-jxlp": new Uint8Array([
    ...box(12, "JXL ", [0x0d, 0x0a, 0x87, 0x0a]),
    ...box(12, "ftyp", bytes("jxl ")),
    ...box(0, "jxlp", new Array(8).fill(0)),
  ]),
  "icns-zero-entry": new Uint8Array([
    ...bytes("icns"),
    0, 0, 0, 16,
    ...bytes("is32"),
    0, 0, 0, 0,
  ]),
  "undersized-heif-ispe": new Uint8Array([
    ...box(16, "ftyp", [...bytes("avif"), 0, 0, 0, 0]),
    ...box(36, "meta", [
      0, 0, 0, 0,
      ...box(24, "iprp", [...box(16, "ipco", box(8, "ispe"))]),
    ]),
  ]),
  "undersized-jp2-ihdr": new Uint8Array([
    ...box(12, "jP  ", [0x0d, 0x0a, 0x87, 0x0a]),
    ...box(20, "ftyp", [...bytes("jp2 "), ...new Array(8).fill(0)]),
    ...box(16, "jp2h", box(8, "ihdr")),
  ]),
  "truncated-box": new Uint8Array([...box(12, "free", [0, 0])]),
  "oversized-box": new Uint8Array([...box(0xffffffff, "free")]),
  "integer-boundary-offset": new Uint8Array(box(8, "free")),
  "repeated-zero-boxes": new Uint8Array([
    ...box(8, "free"),
    ...box(8, "skip"),
    ...box(0, "targ"),
  ]),
};

function probe(packageRoot, fixtureName) {
  const requireFromPackage = createRequire(
    path.join(packageRoot, "package.json"),
  );
  const fixture = maliciousFixtures[fixtureName];
  if (!fixture) {
    throw new Error(`unknown image-size fixture: ${fixtureName}`);
  }

  try {
    if (fixtureName.startsWith("jxl-")) {
      requireFromPackage("./dist/types/jxl.js").JXL.calculate(fixture);
    } else if (fixtureName.startsWith("icns-")) {
      requireFromPackage("./dist/types/icns.js").ICNS.calculate(fixture);
    } else if (fixtureName.includes("heif")) {
      requireFromPackage("./dist/types/heif.js").HEIF.calculate(fixture);
    } else if (fixtureName.includes("jp2")) {
      requireFromPackage("./dist/types/jp2.js").JP2.calculate(fixture);
    } else {
      const { findBox } = requireFromPackage("./dist/types/utils.js");
      const offset = fixtureName === "integer-boundary-offset"
        ? Number.MAX_SAFE_INTEGER
        : 0;
      const result = findBox(
        fixture,
        fixtureName === "repeated-zero-boxes" ? "targ" : "target",
        offset,
      );
      if (result === undefined) {
        throw new TypeError("invalid bounded box");
      }
    }
  } catch (error) {
    process.stdout.write(JSON.stringify({
      fixture: fixtureName,
      result: "rejected",
      error: error?.name ?? "Error",
    }));
    return;
  }

  process.stdout.write(JSON.stringify({
    fixture: fixtureName,
    result: "accepted",
  }));
}

if (process.argv[2] === "--probe") {
  probe(path.resolve(process.argv[3]), process.argv[4]);
  process.exit(0);
}

function runBoundedProbe(packageRoot, fixtureName, timeout = 800) {
  const result = spawnSync(
    process.execPath,
    [
      "--max-old-space-size=64",
      scriptPath,
      "--probe",
      packageRoot,
      fixtureName,
    ],
    {
      encoding: "utf8",
      env: {
        NODE_NO_WARNINGS: "1",
        PATH: process.env.PATH ?? "/usr/bin:/bin",
      },
      maxBuffer: 64 * 1024,
      timeout,
    },
  );
  if (result.error?.code === "ETIMEDOUT") {
    return { fixture: fixtureName, result: "timeout" };
  }
  assert.equal(result.status, 0, `${fixtureName}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function benignFixtures() {
  const png = new Uint8Array([
    0x89, ...bytes("PNG\r\n\x1a\n"),
    0, 0, 0, 13, ...bytes("IHDR"),
    0, 0, 0, 3, 0, 0, 0, 2,
  ]);
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0,
    0x00, 0x10, ...new Array(14).fill(0),
    0xff, 0xc0, 0x00, 0x11, 0x08,
    0x00, 0x02, 0x00, 0x03,
  ]);
  const gif = new Uint8Array([...bytes("GIF89a"), 3, 0, 2, 0]);
  const webp = new Uint8Array([
    ...bytes("RIFF"), 22, 0, 0, 0, ...bytes("WEBPVP8X"),
    10, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0,
  ]);
  const svg = new Uint8Array(Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"></svg>',
  ));
  const bmp = new Uint8Array(26);
  bmp.set(bytes("BM"), 0);
  bmp.set([3, 0, 0, 0], 18);
  bmp.set([2, 0, 0, 0], 22);
  const ico = new Uint8Array([
    0, 0, 1, 0, 1, 0,
    3, 2, 0, 0, 1, 0, 32, 0,
    0, 0, 0, 0, 22, 0, 0, 0,
  ]);
  return [
    ["png", png, { width: 3, height: 2 }],
    ["jpg", jpeg, { width: 3, height: 2 }],
    ["gif", gif, { width: 3, height: 2 }],
    ["webp", webp, { width: 3, height: 2 }],
    ["svg", svg, { width: 3, height: 2 }],
    ["bmp", bmp, { width: 3, height: 2 }],
    ["ico", ico, { width: 3, height: 2 }],
  ];
}

const rootRequire = createRequire(path.join(root, "package.json"));
const metroRequire = createRequire(rootRequire.resolve("metro/package.json"));
const imageSize = rootRequire("image-size");
const installedMetadata = rootRequire("image-size/package.json");
const vendorMetadata = JSON.parse(
  fs.readFileSync(path.join(vendorRoot, "package.json"), "utf8"),
);
assert.equal(installedMetadata.name, "@chillywood/image-size-safe");
assert.equal(installedMetadata.version, "1.2.1-chillywood.1");
assert.deepEqual(installedMetadata, vendorMetadata);
assert.equal(installedMetadata.private, true);
assert.equal(installedMetadata.scripts, undefined);
assert.deepEqual(Object.keys(installedMetadata.dependencies), ["queue"]);
assert.equal(
  sha256(path.join(vendorRoot, "LICENSE")),
  "3109783dad7527b490aabc49c3cb148573c19b41b843e70cf9388a93f3d7fccd",
);

const rootResolution = rootRequire.resolve("image-size");
const metroResolution = metroRequire.resolve("image-size");
assert.equal(rootResolution, metroResolution);
assert.match(rootResolution, /node_modules\/image-size\/dist\/index\.js$/);
assert.equal(typeof imageSize, "function");
assert.equal(imageSize.imageSize, imageSize);
const esmImageSize = await import(pathToFileURL(rootResolution));
assert.equal(typeof esmImageSize.default, "function");

const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json")));
const lockedImageSize = Object.entries(lock.packages ?? {}).filter(
  ([packagePath]) =>
    packagePath === "node_modules/image-size" ||
    packagePath.endsWith("/node_modules/image-size"),
);
assert.equal(lockedImageSize.length, 1);
assert.equal(lockedImageSize[0][1].name, "@chillywood/image-size-safe");
assert.equal(lockedImageSize[0][1].version, "1.2.1-chillywood.1");
assert.equal(
  lockedImageSize[0][1].resolved,
  "file:vendor/image-size-safe/chillywood-image-size-safe-1.2.1-chillywood.1.tgz",
);
assert.match(lockedImageSize[0][1].integrity, /^sha512-/);
assert.equal(lockedImageSize[0][1].link, undefined);

const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-image-size-pack-"));
try {
  const hashes = [];
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const destination = path.join(packRoot, String(iteration));
    fs.mkdirSync(destination);
    execFileSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["pack", vendorRoot, "--pack-destination", destination, "--json"],
      { cwd: root, stdio: ["ignore", "ignore", "pipe"] },
    );
    hashes.push(sha256(path.join(
      destination,
      "chillywood-image-size-safe-1.2.1-chillywood.1.tgz",
    )));
  }
  assert.deepEqual(new Set(hashes).size, 1);
  assert.equal(hashes[0], sha256(packageTarball));
} finally {
  fs.rmSync(packRoot, { recursive: true, force: true });
}

const securityResults = Object.keys(maliciousFixtures).map((fixtureName) =>
  runBoundedProbe(vendorRoot, fixtureName)
);
assert.equal(securityResults.length, 10);
for (const result of securityResults) {
  assert.equal(result.result, "rejected", result.fixture);
}

if (process.env.IMAGE_SIZE_UPSTREAM_ROOT) {
  const upstreamRoot = path.resolve(process.env.IMAGE_SIZE_UPSTREAM_ROOT);
  for (const fixtureName of ["jxl-zero-jxlp", "icns-zero-entry"]) {
    assert.equal(
      runBoundedProbe(upstreamRoot, fixtureName, 500).result,
      "timeout",
      `upstream ${fixtureName}`,
    );
  }
  for (const fixtureName of [
    "heif-zero-ispe",
    "jp2-zero-ihdr",
    "repeated-zero-boxes",
  ]) {
    assert.equal(
      runBoundedProbe(upstreamRoot, fixtureName).result,
      "accepted",
      `upstream ${fixtureName}`,
    );
  }
}

const fixtureResults = benignFixtures().map(([type, input, expected]) => {
  const actual = imageSize(input);
  assert.equal(actual.width, expected.width, type);
  assert.equal(actual.height, expected.height, type);
  return type;
});

const {
  getAssetData,
  getAssetSize,
  isAssetTypeAnImage,
} = metroRequire("./src/Assets.js");
for (const [type, input, expected] of benignFixtures()) {
  if (type === "ico") {
    assert.equal(getAssetSize(type, Buffer.from(input), `synthetic.${type}`), null);
  } else {
    assert.deepEqual(
      getAssetSize(type, Buffer.from(input), `synthetic.${type}`),
      expected,
      type,
    );
  }
}
assert.equal(isAssetTypeAnImage("ico"), false);
assert.equal(imageSize(benignFixtures().at(-1)[1]).type, "ico");

const metroAssetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-metro-asset-"));
try {
  for (const [type, input, expected] of benignFixtures()) {
    if (type === "ico") continue;
    const metroAssetPath = path.join(metroAssetRoot, `synthetic-${type}.${type}`);
    fs.writeFileSync(metroAssetPath, input);
    const metroAssetData = await getAssetData(
      metroAssetPath,
      `synthetic-${type}.${type}`,
      [],
      null,
      "/assets",
    );
    assert.equal(metroAssetData.width, expected.width, type);
    assert.equal(metroAssetData.height, expected.height, type);
    assert.equal(metroAssetData.type, type);
  }
} finally {
  fs.rmSync(metroAssetRoot, { recursive: true, force: true });
}

const repositoryAssets = fs.readdirSync(path.join(root, "assets/images"))
  .filter((name) => /\.(png|jpe?g)$/i.test(name))
  .sort();
for (const name of repositoryAssets) {
  const data = fs.readFileSync(path.join(root, "assets/images", name));
  const type = path.extname(name).slice(1).replace("jpeg", "jpg");
  assert.deepEqual(
    getAssetSize(type, data, name),
    (({ width, height }) => ({ width, height }))(imageSize(data)),
    name,
  );
}

const dependencyTree = JSON.parse(execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["ls", "image-size", "--all", "--json"],
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
));
assert.deepEqual(dependencyTree.problems ?? [], []);

assert.equal(
  execFileSync("git", ["ls-files", "--error-unmatch", "vendor/image-size-safe/dist/index.js"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim(),
  "vendor/image-size-safe/dist/index.js",
);

process.stdout.write(JSON.stringify({
  api: "COMMONJS_ESM_METRO_CLEAR",
  benignFixtures: fixtureResults.length,
  maliciousFixtures: securityResults.length,
  metroRepositoryAssets: repositoryAssets.length,
  packageIdentity: "@chillywood/image-size-safe@1.2.1-chillywood.1",
  packDeterminism: "3/3",
  vulnerableImageSizeCopies: 0,
}) + "\n");
