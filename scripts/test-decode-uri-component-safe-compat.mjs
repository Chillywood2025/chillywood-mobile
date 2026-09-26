import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const vendorRoot = path.join(root, "vendor/decode-uri-component-safe");
const packageTarball = path.join(
  vendorRoot,
  "chillywood-decode-uri-component-safe-0.5.0-chillywood.1.tgz",
);
const expectedDeclaration =
  "file:vendor/decode-uri-component-safe/chillywood-decode-uri-component-safe-0.5.0-chillywood.1.tgz";
const expectedPackageName = "@chillywood/decode-uri-component-safe";
const expectedPackageVersion = "0.5.0-chillywood.1";
const expectedPackageIntegrity =
  "sha512-gfw8lRzGPXqBJP0tXlIAXmSsAt+21ENoU1YKdCcU2FIpCbic4YehTN6AHCC+8fXqM5mLNIIqSZ4LONUI5ymMtA==";
const expectedTarballSha256 =
  "a0c4febc85da02498a9a4e3ff909c074d0322fab383530bc6a0f4f6e557220ed";
const expectedUpstreamSourceSha256 =
  "9401353df38f8010ad7035fe8d666bce6a4902bc1cff809afc4ab23fa2e0bdaa";
const expectedUpstreamTypesSha256 =
  "f7f52a51b25daac3448d6b455a89738dfa1f004eccaca168318834093a315ba2";
const expectedLicenseSha256 =
  "ed7a9a0f74e43951b2520efe1a4349cb9ed5f3dff0b0f268e2e51a4d38df7ea4";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

function probeAdversarialQueryString() {
  const probeRequire = createRequire(path.join(root, "package.json"));
  const queryString = probeRequire("query-string");
  const decodeUriComponent = probeRequire("decode-uri-component");
  const { getStateFromPath } = probeRequire("@react-navigation/core");
  const repeatedRun = `%ab`.repeat(50_000);
  const repeatedParsed = queryString.parse(`credential=${repeatedRun}`);
  assert.equal(repeatedParsed.credential, repeatedRun);

  let distinctRuns = "";
  for (let index = 0; index < 12_000; index += 1) {
    const codePoint = 0x80 + (index % (0xD7FF - 0x80));
    distinctRuns += `${encodeURIComponent(String.fromCodePoint(codePoint))}x`;
  }
  distinctRuns += "%";
  const distinctParsed = queryString.parse(`credential=${distinctRuns}`);
  assert.equal(distinctParsed.credential, distinctRuns);

  let boundedDistinctRuns = "";
  let boundedIndex = 0;
  while (boundedDistinctRuns.length < 8_000) {
    const codePoint = 0x80 + (boundedIndex % (0xD7FF - 0x80));
    boundedDistinctRuns += `${encodeURIComponent(String.fromCodePoint(codePoint))}x`;
    boundedIndex += 1;
  }
  boundedDistinctRuns = `${boundedDistinctRuns.slice(0, 8_179)}%`;
  assert.ok(boundedDistinctRuns.length <= 8_192);
  const aggregateQuery = Array.from(
    { length: 100 },
    (_, index) => `field${index}=${boundedDistinctRuns}`,
  ).join("&");
  const aggregateParsed = queryString.parse(aggregateQuery);
  assert.equal(aggregateParsed.field0, boundedDistinctRuns);
  assert.equal(aggregateParsed.field99, boundedDistinctRuns);
  const aggregateState = getStateFromPath(`/auth-callback?${aggregateQuery}`, {
    screens: { AuthCallback: "auth-callback" },
  });
  assert.equal(aggregateState.routes[0].params.field0, boundedDistinctRuns);
  assert.equal(aggregateState.routes[0].params.field99, boundedDistinctRuns);

  const replacementAmplifier = `${"x".repeat(4_000)}${"%24%60".repeat(500)}%`;
  assert.equal(replacementAmplifier.length, 7_001);
  assert.equal(decodeUriComponent(replacementAmplifier), replacementAmplifier);
  const replacementAggregateQuery = Array.from(
    { length: 100 },
    (_, index) => `replacement${index}=${replacementAmplifier}`,
  ).join("&");
  const replacementParsed = queryString.parse(replacementAggregateQuery);
  assert.equal(replacementParsed.replacement0, replacementAmplifier);
  assert.equal(replacementParsed.replacement99, replacementAmplifier);
  const replacementState = getStateFromPath(`/auth-callback?${replacementAggregateQuery}`, {
    screens: { AuthCallback: "auth-callback" },
  });
  assert.equal(replacementState.routes[0].params.replacement0, replacementAmplifier);
  assert.equal(replacementState.routes[0].params.replacement99, replacementAmplifier);
  process.stdout.write(JSON.stringify({
    repeatedRunLength: repeatedRun.length,
    distinctRunsLength: distinctRuns.length,
    aggregateQueryLength: aggregateQuery.length,
    aggregateParameterCount: 100,
    replacementAggregateQueryLength: replacementAggregateQuery.length,
    replacementAggregateParameterCount: 100,
    result: "PASS",
  }));
}

if (process.argv[2] === "--adversarial-query-string-probe") {
  probeAdversarialQueryString();
  process.exit(0);
}

const packageJson = readJson(path.join(root, "package.json"));
const lock = readJson(path.join(root, "package-lock.json"));
const vendorMetadata = readJson(path.join(vendorRoot, "package.json"));
const rootRequire = createRequire(path.join(root, "package.json"));
const externalNavigationSafety = await import(pathToFileURL(
  path.join(root, "_lib/externalNavigationInputSafety.mjs"),
));
const queryStringRequire = createRequire(rootRequire.resolve("query-string/package.json"));
const expoRouterRequire = createRequire(rootRequire.resolve("expo-router/package.json"));
const reactNavigationRequire = createRequire(
  rootRequire.resolve("@react-navigation/core/package.json"),
);

assert.equal(packageJson.dependencies["decode-uri-component"], expectedDeclaration);
assert.equal(packageJson.overrides["decode-uri-component"], "$decode-uri-component");
assert.equal(vendorMetadata.name, expectedPackageName);
assert.equal(vendorMetadata.version, expectedPackageVersion);
assert.equal(vendorMetadata.private, true);
assert.equal(vendorMetadata.scripts, undefined);
assert.equal(vendorMetadata.dependencies, undefined);
assert.equal(vendorMetadata.chillywoodSource.sourcePackage, "decode-uri-component@0.5.0");
assert.equal(vendorMetadata.chillywoodSource.sourceGitHead, "a12fabaa28303cc8b5b07e93d128f4fc09fc31e5");
assert.equal(vendorMetadata.chillywoodSource.securityFixCommit, "fa479dafeede7bedf04e5c89aa78f2a78c664005");
assert.equal(vendorMetadata.chillywoodSource.advisory, "GHSA-vcc3-ghjq-m6fr");
assert.equal(vendorMetadata.chillywoodSource.maxMalformedComponentLength, 8_192);
assert.equal(vendorMetadata.chillywoodSource.maxMalformedPercentRuns, 32);
assert.deepEqual(
  vendorMetadata.chillywoodSource.blockedMalformedReplacementTokens,
  ["$&", "$`", "$'"],
);
assert.equal(
  vendorMetadata.chillywoodSource.maxMalformedComponentLength,
  externalNavigationSafety.MAX_EXTERNAL_NAVIGATION_INPUT_LENGTH,
);
assert.equal(
  vendorMetadata.chillywoodSource.registryIntegrity,
  "sha512-1BiQVoK8C9gUbQU6NzAtO/tkz2qOFpEObMWpcFvhx4fYnj4Oc5yzaJN/LD36ihkVUdXyh5ZekzX+yM+ty/SrPg==",
);
assert.equal(
  vendorMetadata.chillywoodSource.registryTarballSha256,
  "f42d289f996e6c9f0e33d8f31de1fe9a7a077c612dca489cafdb2df4cbb6122f",
);
assert.equal(sha256(fs.readFileSync(path.join(vendorRoot, "LICENSE"))), expectedLicenseSha256);
assert.equal(sha256(fs.readFileSync(packageTarball)), expectedTarballSha256);

const adaptedSource = fs.readFileSync(path.join(vendorRoot, "index.js"), "utf8");
const boundaryMarker = "\n// Chi'llywood CommonJS compatibility and bounded-input boundary.\n";
assert.equal((adaptedSource.match(/Chi'llywood CommonJS compatibility and bounded-input boundary\./gu) ?? []).length, 1);
const upstreamAlgorithm = adaptedSource.slice(0, adaptedSource.indexOf(boundaryMarker));
const upstreamSource = upstreamAlgorithm.replace(
  "function decodeUriComponentUpstream",
  "export default function decodeUriComponent",
);
assert.equal(sha256(upstreamSource), expectedUpstreamSourceSha256);
assert.equal((adaptedSource.match(/module\.exports = function decodeUriComponent/gu) ?? []).length, 1);
assert.doesNotMatch(adaptedSource, /export default/u);
assert.match(adaptedSource, /const maxMalformedComponentLength = 8192;/u);
assert.match(adaptedSource, /const maxMalformedPercentRuns = 32;/u);
assert.match(adaptedSource, /const unsafeMalformedReplacementToken = \/%24%\(\?:26\|27\|60\)\/i;/u);

const adaptedTypes = fs.readFileSync(path.join(vendorRoot, "index.d.ts"), "utf8");
const upstreamTypes = adaptedTypes
  .replace("declare function decodeUriComponent", "export default function decodeUriComponent")
  .replace("\n\nexport = decodeUriComponent;\n", "\n");
assert.equal(sha256(upstreamTypes), expectedUpstreamTypesSha256);

const installedMetadata = rootRequire("decode-uri-component/package.json");
assert.equal(installedMetadata.name, expectedPackageName);
assert.equal(installedMetadata.version, expectedPackageVersion);
assert.equal(installedMetadata.private, true);

const lockedDecoderEntries = Object.entries(lock.packages ?? {}).filter(
  ([packagePath]) => packagePath === "node_modules/decode-uri-component"
    || packagePath.endsWith("/node_modules/decode-uri-component"),
);
assert.equal(lockedDecoderEntries.length, 1);
assert.equal(lockedDecoderEntries[0][0], "node_modules/decode-uri-component");
assert.equal(lockedDecoderEntries[0][1].name, expectedPackageName);
assert.equal(lockedDecoderEntries[0][1].version, expectedPackageVersion);
assert.equal(lockedDecoderEntries[0][1].resolved, expectedDeclaration);
assert.equal(lockedDecoderEntries[0][1].integrity, expectedPackageIntegrity);
assert.equal(lockedDecoderEntries[0][1].link, undefined);

const decoderResolution = rootRequire.resolve("decode-uri-component");
assert.equal(queryStringRequire.resolve("decode-uri-component"), decoderResolution);
assert.equal(
  expoRouterRequire.resolve("query-string/package.json"),
  rootRequire.resolve("query-string/package.json"),
);
assert.equal(
  reactNavigationRequire.resolve("query-string/package.json"),
  rootRequire.resolve("query-string/package.json"),
);

const decodeUriComponent = rootRequire("decode-uri-component");
assert.equal(typeof decodeUriComponent, "function");
const esmDecoder = await import(pathToFileURL(decoderResolution));
assert.equal(esmDecoder.default, decodeUriComponent);

const exactUpstreamModule = await import(
  `data:text/javascript;base64,${Buffer.from(upstreamSource).toString("base64")}`
);
const exactUpstreamDecode = exactUpstreamModule.default;
const upstreamFixtures = new Map([
  ["test", "test"],
  ["a+b+c+d", "a+b+c+d"],
  ["%25", "%"],
  ["%%25%%", "%%%%"],
  ["st%C3%A5le%", "ståle%"],
  ["%7B%ab%%7C%de%%7D", "{%ab%|%de%}"],
  ["%C2", "�"],
  ["%C2%B5", "µ"],
  ["%ea%ba%5a%ba", "%ea%baZ%ba"],
  ["%F0%9F%98%80", "😀"],
  ["%F0%9F%98", "%F0%9F%98"],
  ["%F5%80%80%80", "%F5%80%80%80"],
  ["%C0%AF", "%C0%AF"],
  ["%E2%82%AC", "€"],
  ["%E2%41%AC", "%E2A%AC"],
  ["%ED%A0%80", "%ED%A0%80"],
  ["%80", "%80"],
  ["%E0%80%80", "%E0%80%80"],
  ["%F4%90%80%80", "%F4%90%80%80"],
  ["%G0", "%G0"],
  ["%u0041", "%u0041"],
  ["%FF%80%80%80", "%FF%80%80%80"],
  ["%C3%A5%80%C3%A5", "å%80å"],
  ["%G0%C3%A5%ab", "%G0å%ab"],
  ["a%FE%FFb", "a��b"],
  ["%252525", "%2525"],
  ["%84%D7%25%88%90", "%84%D7%%88%90"],
]);
for (const [input, expected] of upstreamFixtures) {
  assert.equal(decodeUriComponent(input), expected, input);
  assert.equal(decodeUriComponent(input), exactUpstreamDecode(input), input);
}
for (const value of [undefined, null, 5, true, false, {}, [], Symbol("x"), 0n]) {
  assert.throws(() => decodeUriComponent(value), TypeError);
}

const validInputs = [
  "",
  "plain",
  "%20",
  "%2B",
  "%2F%3F%23",
  "%E4%BD%A0%E5%A5%BD",
  "%F0%9F%98%80%F0%9F%98%81",
  "%F0%9D%84%9E",
];
for (const input of validInputs) {
  assert.equal(decodeUriComponent(input), decodeURIComponent(input), input);
}
let legacyValidFastPathDifferentialCases = validInputs.length;
for (let codePoint = 0; codePoint <= 0x10FFFF; codePoint += 257) {
  if (codePoint >= 0xD800 && codePoint <= 0xDFFF) continue;
  const encoded = encodeURIComponent(`prefix-${String.fromCodePoint(codePoint)}-suffix`);
  const expected = decodeURIComponent(encoded);
  assert.equal(decodeUriComponent(encoded), expected, encoded);
  assert.equal(exactUpstreamDecode(encoded), expected, encoded);
  legacyValidFastPathDifferentialCases += 1;
}
const validLongInput = encodeURIComponent("你😀Chi'llywood".repeat(1_000));
assert.ok(validLongInput.length > 8_192);
assert.equal(decodeUriComponent(validLongInput), decodeURIComponent(validLongInput));
const oversizedMalformedInput = `${"%E4%BD%A0x".repeat(1_000)}%`;
assert.ok(oversizedMalformedInput.length > 8_192);
assert.equal(decodeUriComponent(oversizedMalformedInput), oversizedMalformedInput);
const atLengthBoundary = `%41${"x".repeat(8_188)}%`;
assert.equal(atLengthBoundary.length, 8_192);
assert.equal(decodeUriComponent(atLengthBoundary), `A${"x".repeat(8_188)}%`);
const aboveLengthBoundary = `%41${"x".repeat(8_189)}%`;
assert.equal(aboveLengthBoundary.length, 8_193);
assert.equal(decodeUriComponent(aboveLengthBoundary), aboveLengthBoundary);
const atRunBoundary = `${"%41x".repeat(32)}%`;
assert.equal(decodeUriComponent(atRunBoundary), `${"Ax".repeat(32)}%`);
const aboveRunBoundary = `${"%41x".repeat(33)}%`;
assert.equal(decodeUriComponent(aboveRunBoundary), aboveRunBoundary);
for (const encodedToken of ["%24%26", "%24%27", "%24%60", "%24%6a", "%24%6A"]) {
  const malformedReplacement = `prefix-${encodedToken}-suffix%`;
  if (/%24%(?:26|27|60)/iu.test(encodedToken)) {
    assert.equal(decodeUriComponent(malformedReplacement), malformedReplacement);
  } else {
    assert.equal(decodeUriComponent(malformedReplacement), exactUpstreamDecode(malformedReplacement));
  }
}
assert.equal(
  decodeUriComponent("%24%24-safe%"),
  exactUpstreamDecode("%24%24-safe%"),
);

const queryString = rootRequire("query-string");
const parsed = queryString.parse(
  "name=Chi%27llywood&unicode=%E4%BD%A0%E5%A5%BD&emoji=%F0%9F%98%80"
    + "&mixed=raw-%E4%BD%A0&tag=one&tag=two&malformed=%E0%A4%A&truncated=%"
    + "&space=a+b&plus=a%2Bb&separator=%26%3D%23&empty=&bare",
);
assert.equal(parsed.name, "Chi'llywood");
assert.equal(parsed.unicode, "你好");
assert.equal(parsed.emoji, "😀");
assert.equal(parsed.mixed, "raw-你");
assert.deepEqual(parsed.tag, ["one", "two"]);
assert.equal(parsed.malformed, "%E0%A4%A");
assert.equal(parsed.truncated, "%");
assert.equal(parsed.space, "a b");
assert.equal(parsed.plus, "a+b");
assert.equal(parsed.separator, "&=#");
assert.equal(parsed.empty, "");
assert.equal(parsed.bare, null);

assert.deepEqual(
  queryString.parse("tag[]=one&tag[]=two", { arrayFormat: "bracket" }).tag,
  ["one", "two"],
);
assert.deepEqual(
  queryString.parse("tag=one,two", { arrayFormat: "comma" }).tag,
  ["one", "two"],
);
assert.equal(
  queryString.stringify(
    { code: "a+b/c=?&#", type: "recovery", tag: ["one", "two"], empty: "", nil: null, omit: undefined },
    { sort: false },
  ),
  "code=a%2Bb%2Fc%3D%3F%26%23&type=recovery&tag=one&tag=two&empty=&nil",
);

const authUrl = queryString.stringifyUrl({
  url: "chillywood://auth-callback",
  query: { code: "a+b/c=?&#", type: "recovery" },
  fragmentIdentifier: "resume+verified",
}, { sort: false });
assert.equal(
  authUrl,
  "chillywood://auth-callback?code=a%2Bb%2Fc%3D%3F%26%23&type=recovery#resume%2Bverified",
);
const authRoundTrip = queryString.parseUrl(authUrl, { parseFragmentIdentifier: true });
assert.equal(authRoundTrip.query.code, "a+b/c=?&#");
assert.equal(authRoundTrip.query.type, "recovery");
assert.equal(authRoundTrip.fragmentIdentifier, "resume+verified");

// Upstream 0.5.0 intentionally leaves a literal plus in a fragment literal.
// query-string still converts plus to space in query components before decoding.
assert.equal(
  queryString.parseUrl("https://example.invalid/?q=raw+plus#raw+plus", {
    parseFragmentIdentifier: true,
  }).fragmentIdentifier,
  "raw+plus",
);

const { getPathFromState, getStateFromPath } = rootRequire("@react-navigation/core");
const linkingConfig = { screens: { AuthCallback: "auth-callback" } };
const navigationState = getStateFromPath(
  "/auth-callback?code=a%2Bb%2Fc%3D%3F%26%23&type=recovery&tag=one&tag=two",
  linkingConfig,
);
assert.equal(navigationState.routes[0].params.code, "a+b/c=?&#");
assert.equal(navigationState.routes[0].params.type, "recovery");
assert.deepEqual(navigationState.routes[0].params.tag, ["one", "two"]);
const serializedNavigationPath = getPathFromState(navigationState, linkingConfig);
assert.equal(
  serializedNavigationPath,
  "/auth-callback?code=a%2Bb%2Fc%3D%3F%26%23&tag=one%2Ctwo&type=recovery",
);
assert.equal(
  getStateFromPath(serializedNavigationPath, linkingConfig).routes[0].params.tag,
  "one,two",
);

const expoParseModule = rootRequire("expo-router/build/fork/getStateFromPath-forks");
const expoParsed = expoParseModule.parseQueryParams(
  "/auth-callback?code=a%2Bb%2Fc%3D%3F%26%23&type=recovery&tag=one&tag=two",
  { params: {} },
  undefined,
  "",
);
assert.equal(expoParsed.code, "a+b/c=?&#");
assert.equal(expoParsed.type, "recovery");
assert.deepEqual(expoParsed.tag, ["one", "two"]);

const expoPathProbe = [
  'const assert = require("node:assert/strict")',
  'const Module = require("node:module")',
  'const originalLoad = Module._load',
  'Module._load = function(request, parent, isMain) {',
  '  if (request === "@react-navigation/native") return { validatePathConfig() {} }',
  '  return originalLoad.call(this, request, parent, isMain)',
  '}',
  `const { appendQueryAndHash } = require(${JSON.stringify(rootRequire.resolve("expo-router/build/fork/getPathFromState-forks"))})`,
  'assert.equal(appendQueryAndHash("/auth-callback", { code: "a+b/c=?&#", type: "recovery", tag: ["one", "two"], "#": "done+now" }), "/auth-callback?code=a%2Bb%2Fc%3D%3F%26%23&type=recovery&tag=one&tag=two#done+now")',
].join("\n");
const expoPathResult = spawnSync(process.execPath, ["-e", expoPathProbe], {
  encoding: "utf8",
  timeout: 2_000,
});
assert.equal(expoPathResult.error?.code, undefined, expoPathResult.error?.message);
assert.equal(expoPathResult.signal, null, expoPathResult.stderr);
assert.equal(expoPathResult.status, 0, expoPathResult.stderr);

const adversarialResult = spawnSync(
  process.execPath,
  ["--max-old-space-size=64", scriptPath, "--adversarial-query-string-probe"],
  { encoding: "utf8", maxBuffer: 64 * 1024, timeout: 1_500 },
);
assert.equal(adversarialResult.error?.code, undefined, adversarialResult.error?.message);
assert.equal(adversarialResult.signal, null, adversarialResult.stderr);
assert.equal(adversarialResult.status, 0, adversarialResult.stderr);
const adversarialObservation = JSON.parse(adversarialResult.stdout);
assert.equal(adversarialObservation.result, "PASS");
assert.ok(adversarialObservation.distinctRunsLength > 100_000);
assert.ok(adversarialObservation.aggregateQueryLength > 800_000);
assert.equal(adversarialObservation.aggregateParameterCount, 100);
assert.ok(adversarialObservation.replacementAggregateQueryLength > 700_000);
assert.equal(adversarialObservation.replacementAggregateParameterCount, 100);

const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-decoder-pack-"));
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
    hashes.push(sha256(fs.readFileSync(path.join(
      destination,
      "chillywood-decode-uri-component-safe-0.5.0-chillywood.1.tgz",
    ))));
  }
  assert.equal(new Set(hashes).size, 1);
  assert.equal(hashes[0], expectedTarballSha256);
} finally {
  fs.rmSync(packRoot, { recursive: true, force: true });
}

const dependencyTree = JSON.parse(execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["ls", "decode-uri-component", "query-string", "--all", "--json"],
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
));
assert.deepEqual(dependencyTree.problems ?? [], []);

let hermesSyntax = "NOT_AVAILABLE";
const hermesCompilerRelative = process.platform === "darwin"
  ? "osx-bin/hermesc"
  : process.platform === "linux"
    ? "linux64-bin/hermesc"
    : process.platform === "win32"
      ? "win64-bin/hermesc.exe"
      : undefined;
const hermesCompilerCandidate = hermesCompilerRelative
  ? path.join(root, "node_modules/react-native/sdks/hermesc", hermesCompilerRelative)
  : undefined;
const hermesCompiler = hermesCompilerCandidate && fs.existsSync(hermesCompilerCandidate)
  ? hermesCompilerCandidate
  : undefined;
if (hermesCompiler) {
  const hermesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-decoder-hermes-"));
  try {
    const result = spawnSync(
      hermesCompiler,
      ["-O", "-emit-binary", "-out", path.join(hermesRoot, "decoder.hbc"), path.join(vendorRoot, "index.js")],
      { encoding: "utf8", timeout: 5_000 },
    );
    assert.equal(result.error?.code, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    hermesSyntax = "PASS";
  } finally {
    fs.rmSync(hermesRoot, { recursive: true, force: true });
  }
}

process.stdout.write(`${JSON.stringify({
  packageIdentity: `${expectedPackageName}@${expectedPackageVersion}`,
  upstreamAlgorithm: "decode-uri-component@0.5.0 embedded byte-equivalent behind documented length, fallback-run, and replacement-token bounds",
  commonJs: "PASS",
  esmInterop: "PASS",
  upstreamDifferentialFixtures: upstreamFixtures.size,
  legacyValidFastPathDifferentialCases,
  genericQueryParserRepeatedRunCharacters: adversarialObservation.repeatedRunLength,
  genericQueryParserDistinctRunCharacters: adversarialObservation.distinctRunsLength,
  genericQueryParserAggregateCharacters: adversarialObservation.aggregateQueryLength,
  genericQueryParserAggregateParameters: adversarialObservation.aggregateParameterCount,
  replacementAmplifierAggregateCharacters: adversarialObservation.replacementAggregateQueryLength,
  replacementAmplifierAggregateParameters: adversarialObservation.replacementAggregateParameterCount,
  reactNavigationParseAndSerialize: "PASS",
  expoRouterParseAndSerialize: "PASS",
  hermesSyntax,
  packDeterminism: "3/3",
  vulnerableInstalledCopies: 0,
})}\n`);
