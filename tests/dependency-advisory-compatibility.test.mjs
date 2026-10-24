#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { finished } from "node:stream/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));

test("patched advisory leaves are resolved independently in all three package trees", () => {
  const rootManifest = readJson("package.json");
  const rootLock = readJson("package-lock.json");
  assert.equal(rootLock.packages["node_modules/@humanfs/node"].version, "0.16.8");
  assert.equal(rootLock.packages["node_modules/postcss"].version, "8.5.23");
  assert.equal(rootManifest.overrides["shell-quote"], "1.11.0");
  assert.equal(rootLock.packages["node_modules/shell-quote"].version, "1.11.0");
  assert.equal(rootManifest.overrides["fast-uri"], "3.1.7");
  assert.equal(rootLock.packages["node_modules/fast-uri"].version, "3.1.7");
  assert.equal(rootManifest.overrides.undici, "6.29.1");
  assert.equal(rootLock.packages["node_modules/undici"].version, "6.29.1");
  assert.equal(
    rootManifest.dependencies["decode-uri-component"],
    "file:vendor/decode-uri-component-safe/chillywood-decode-uri-component-safe-0.5.0-chillywood.1.tgz",
  );
  assert.equal(rootManifest.overrides["decode-uri-component"], "$decode-uri-component");
  const decoderEntries = Object.entries(rootLock.packages).filter(
    ([packagePath]) => packagePath === "node_modules/decode-uri-component"
      || packagePath.endsWith("/node_modules/decode-uri-component"),
  );
  assert.equal(decoderEntries.length, 1);
  assert.equal(decoderEntries[0][0], "node_modules/decode-uri-component");
  assert.equal(decoderEntries[0][1].name, "@chillywood/decode-uri-component-safe");
  assert.equal(decoderEntries[0][1].version, "0.5.0-chillywood.1");

  const alertLock = readJson("ops/alert-automation/package-lock.json");
  assert.equal(alertLock.packages["node_modules/nanoid"].version, "3.3.18");
  assert.equal(alertLock.packages["node_modules/postcss"].version, "8.5.23");
  assert.equal(alertLock.packages["node_modules/vitest"].version, "4.1.11");
  assert.equal(alertLock.packages["node_modules/@vitest/mocker"].version, "4.1.11");
  assert.equal(alertLock.packages["node_modules/nodemailer"].version, "10.0.12");

  const isolatedLock = readJson("isolated-runtime/cloudflare/package-lock.json");
  assert.equal(isolatedLock.packages["node_modules/wrangler"].version, "4.141.0");
  assert.equal(isolatedLock.packages["node_modules/sharp"].version, "0.35.4");
  assert.equal(isolatedLock.packages["node_modules/undici"].version, "7.29.1");
  assert.equal(readJson("isolated-runtime/cloudflare/package.json").overrides.undici, "7.29.1");
});

test("patched fast-uri preserves URI references used by both Expo Ajv consumers", () => {
  for (const parent of ["expo-build-properties", "expo-dev-launcher"]) {
    const parentRequire = createRequire(require.resolve(`${parent}/package.json`));
    const ajvRequire = createRequire(parentRequire.resolve("ajv/package.json"));
    assert.equal(ajvRequire("fast-uri/package.json").version, "3.1.7");
    const uri = ajvRequire("fast-uri");
    const ordinary = "https://example.invalid:8443/catalog?item=one#details";
    const parsed = uri.parse(ordinary);
    assert.equal(parsed.error, undefined);
    assert.equal(uri.serialize(parsed), ordinary);
    assert.equal(uri.resolve("https://example.invalid/catalog/", "item.json"), "https://example.invalid/catalog/item.json");
    const Ajv = parentRequire("ajv");
    const validator = new Ajv();
    validator.addSchema({ $id: "https://schemas.example.invalid/item.json", type: "object", properties: { title: { type: "string" } }, required: ["title"] });
    const validate = validator.compile({ type: "array", items: { $ref: "https://schemas.example.invalid/item.json" } });
    assert.equal(validate([{ title: "Chi'llywood" }]), true);
    assert.equal(validate([{ title: 123 }]), false);
  }
});

test("patched undici preserves Expo's fetch and response contract without network access", async () => {
  const expoRequire = createRequire(require.resolve("expo/package.json"));
  const cliRequire = createRequire(expoRequire.resolve("@expo/cli/package.json"));
  assert.equal(cliRequire("undici/package.json").version, "6.29.1");
  const { fetch, MockAgent, Response, Agent, RetryAgent, EnvHttpProxyAgent } = cliRequire("undici");
  for (const constructor of [Agent, RetryAgent, EnvHttpProxyAgent]) assert.equal(typeof constructor, "function");
  const dispatcher = new MockAgent();
  dispatcher.disableNetConnect();
  try {
    dispatcher.get("https://fixture.example.invalid").intercept({ path: "/metadata", method: "GET" })
      .reply(200, { platform: "android" }, { headers: { "content-type": "application/json" } });
    const response = await fetch("https://fixture.example.invalid/metadata", { dispatcher });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { platform: "android" });
    assert.deepEqual(await new Response('{"cached":true}', { status: 200 }).json(), { cached: true });
    dispatcher.assertNoPendingInterceptors();
  } finally {
    await dispatcher.close();
  }
});

test("Expo's undici rejects excessive encodings without an uncaught early-close error", { timeout: 15_000 }, () => {
  const expoRequire = createRequire(require.resolve("expo/package.json"));
  const cliRequire = createRequire(expoRequire.resolve("@expo/cli/package.json"));
  // Isolate a possible uncaught exception so a dependency regression cannot
  // terminate the parent test runner. All traffic stays on loopback.
  const probe = `
    const assert = require("node:assert/strict");
    const { once } = require("node:events");
    const { createServer } = require("node:net");
    const { gzipSync } = require("node:zlib");
    const { fetch, Client } = require(${JSON.stringify(cliRequire.resolve("undici"))});
    (async () => {
      const goodBody = gzipSync(Buffer.from('{"ok":true}'));
      for (const codingCount of [6, 20]) {
        let resolveBadSocketClosed;
        const badSocketClosed = new Promise((resolve) => { resolveBadSocketClosed = resolve; });
        const server = createServer((socket) => {
          socket.on("error", () => {});
          socket.once("data", (request) => {
            if (request.toString().startsWith("GET /safe ")) {
              socket.end(Buffer.concat([
                Buffer.from("HTTP/1.1 200 OK\\r\\nContent-Encoding: gzip\\r\\nContent-Length: " + goodBody.length + "\\r\\nConnection: close\\r\\n\\r\\n"),
                goodBody
              ]));
            } else {
              socket.once("close", resolveBadSocketClosed);
              socket.end("HTTP/1.1 200 OK\\r\\nContent-Encoding: " + Array(codingCount).fill("gzip").join(", ") + "\\r\\nContent-Length: 1\\r\\nConnection: close\\r\\n\\r\\n");
            }
          });
        });
        await once(server.listen(0, "127.0.0.1"), "listening");
        const origin = "http://127.0.0.1:" + server.address().port;
        const client = new Client(origin);
        try {
          await assert.rejects(fetch(origin + "/excessive", { dispatcher: client }),
            (error) => /too many content-encodings/.test(error.cause?.message));
          await badSocketClosed;
          const response = await fetch(origin + "/safe", { dispatcher: client });
          assert.equal(response.status, 200);
          assert.deepEqual(await response.json(), { ok: true });
        } finally {
          await client.close();
          await new Promise((resolve) => server.close(resolve));
        }
      }
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ["-e", probe], { encoding: "utf8", timeout: 10_000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
});

test("Expo's undici bounds retained EventSource state and preserves ordinary events", async () => {
  const expoRequire = createRequire(require.resolve("expo/package.json"));
  const cliRequire = createRequire(expoRequire.resolve("@expo/cli/package.json"));
  const { EventSourceStream } = cliRequire("undici/lib/web/eventsource/eventsource-stream.js");
  async function parse(chunks, maxEventSize) {
    const events = [];
    const parser = new EventSourceStream({ maxEventSize, eventSourceSettings: { origin: "https://fixture.example.invalid" } });
    parser.on("data", (event) => events.push(event));
    const complete = finished(parser, { cleanup: true });
    for (const chunk of chunks) {
      if (parser.destroyed) break;
      parser.write(Buffer.from(chunk));
    }
    parser.end();
    await complete;
    return events;
  }
  // Each collection is far below the byte limit but exceeds the retained
  // item bound. Also cover unfinished lines and aggregate metadata bytes.
  await assert.rejects(parse(["data:\n".repeat(1025)], 128 * 1024), /EventSource message size exceeded/);
  await assert.rejects(parse(Array(1025).fill("x"), 128 * 1024), /EventSource message size exceeded/);
  await assert.rejects(parse(["data: " + "x".repeat(150)], 128), /EventSource message size exceeded/);
  await assert.rejects(parse(["event: " + "x".repeat(96) + "\ndata: " + "y".repeat(64) + "\n"], 128), /EventSource message size exceeded/);
  const atItemLimit = await parse(["data:\n".repeat(1024) + "\n"], 128 * 1024);
  assert.equal(atItemLimit[0].options.data, "\n".repeat(1023));
  const atByteLimit = await parse([Buffer.from([0xef]), Buffer.from([0xbb, 0xbf]), "data: " + "x".repeat(128) + "\r", "\n\r\n"], 128);
  assert.equal(atByteLimit[0].options.data, "x".repeat(128));
  const events = await parse(["id: 7\nevent: update\ndata: hel", "lo\ndata: world\n\n", ...Array(1100).fill("data: next\n\n")], 128);
  assert.equal(events.length, 1101);
  assert.deepEqual(events[0], { type: "update", options: { data: "hello\nworld", lastEventId: "7", origin: "https://fixture.example.invalid" } });
  assert.equal(events.at(-1).options.data, "next");
});

test("React Native devtools resolves shell-quote that rejects post-comment line terminators", () => {
  const reactNativeRequire = createRequire(require.resolve("react-native/package.json"));
  const devtoolsRequire = createRequire(reactNativeRequire.resolve("react-devtools-core/package.json"));
  assert.equal(devtoolsRequire("shell-quote/package.json").version, "1.11.0");
  const { parse, quote } = devtoolsRequire("shell-quote");

  // GHSA-pqg4-j6r4-53mv: a comment can hide an opening quote, leaving a
  // subsequent line terminator to expose the rest of an argument as shell input.
  // Inspect the quoting contract only; never execute the resulting shell text.
  for (const lineTerminator of ["\n", "\r", "\u2028", "\u2029"]) {
    assert.throws(() => quote([
      "echo", "safe", { comment: "comment" }, `argument${lineTerminator}printf injected;#`,
    ]), TypeError);
    assert.throws(() => quote([
      "echo", { comment: "comment" }, "intervening safe token", `argument${lineTerminator}printf injected;#`,
    ]), TypeError);
    const parsedWithComment = parse("echo https://example.invalid/#fragment");
    assert.ok(parsedWithComment.some((token) => typeof token === "object" && "comment" in token));
    assert.throws(() => quote([
      ...parsedWithComment, `argument${lineTerminator}printf injected;#`,
    ]), TypeError);
  }

  const ordinaryArgs = ["open", "a path with spaces", "Chi'llywood", "quote\"here", "$literal", "line\nbreak"];
  assert.deepEqual(parse(quote(ordinaryArgs)), ordinaryArgs);
  assert.deepEqual(parse(quote(["echo", "safe", { comment: "ordinary comment" }])), [
    "echo", "safe", { comment: "ordinary comment" },
  ]);
});

test("xcode uses the patched uuid line without changing native identifier generation", () => {
  const rootManifest = readJson("package.json");
  const rootLock = readJson("package-lock.json");
  const xcodeSource = fs.readFileSync("node_modules/xcode/lib/pbxProject.js", "utf8");

  assert.equal(rootManifest.overrides["xcode@3.0.1"].uuid, "11.1.1");
  assert.equal(rootLock.packages["node_modules/xcode"].version, "3.0.1");
  assert.equal(rootLock.packages["node_modules/uuid"].version, "11.1.1");
  assert.match(xcodeSource, /uuid\.v4\(\)/u);
  assert.doesNotMatch(xcodeSource, /uuid\.v(?:3|5|6)\(/u);
  assert.doesNotThrow(() => require("xcode"));

  const project = require("xcode").project("/nonexistent/project.pbxproj");
  project.hash = { project: { objects: {} } };
  const identifiers = Array.from({ length: 256 }, () => project.generateUuid());

  assert.equal(new Set(identifiers).size, identifiers.length);
  for (const identifier of identifiers) {
    assert.match(identifier, /^[0-9A-F]{24}$/u);
  }

  const xcodeRequire = createRequire(require.resolve("xcode/package.json"));
  const uuid = xcodeRequire("uuid");
  assert.equal(xcodeRequire("uuid/package.json").version, "11.1.1");
  assert.equal(typeof uuid.v4, "function");
  assert.throws(() => uuid.v3("name", uuid.v3.DNS, new Uint8Array(1), 0), RangeError);
  assert.throws(() => uuid.v5("name", uuid.v5.DNS, new Uint8Array(1), 0), RangeError);
  assert.throws(() => uuid.v6({}, new Uint8Array(1), 0), RangeError);
});

test("the fixed decoder preserves the supported router query and auth-link contract", () => {
  const decoderMetadata = require("decode-uri-component/package.json");
  const queryString = require("query-string");
  assert.equal(decoderMetadata.name, "@chillywood/decode-uri-component-safe");
  assert.equal(decoderMetadata.version, "0.5.0-chillywood.1");
  assert.equal(typeof require("decode-uri-component"), "function");
  const query = "name=Chi%27llywood&unicode=%E4%BD%A0%E5%A5%BD&tag=one&tag=two&malformed=%E0%A4%A&space=a+b";
  const parsed = queryString.parse(query);

  assert.equal(parsed.name, "Chi'llywood");
  assert.equal(parsed.unicode, "你好");
  assert.deepEqual(parsed.tag, ["one", "two"]);
  assert.equal(parsed.malformed, "%E0%A4%A");
  assert.equal(parsed.space, "a b");
  assert.equal(
    queryString.stringify({ code: "a+b/c=", type: "recovery", tag: ["one", "two"] }, { sort: false }),
    "code=a%2Bb%2Fc%3D&type=recovery&tag=one&tag=two",
  );

  const parserPath = require.resolve("expo-router/build/fork/getStateFromPath-forks");
  const probe = [
    `const assert = require("node:assert/strict");`,
    `const { parseQueryParams } = require(${JSON.stringify(parserPath)});`,
    `const query = ${JSON.stringify(query)};`,
    `const parsed = parseQueryParams("/auth-callback?" + query, { params: {} }, undefined, "");`,
    `assert.equal(parsed.name, "Chi'llywood");`,
    `assert.equal(parsed.unicode, "你好");`,
    `assert.deepEqual(parsed.tag, ["one", "two"]);`,
    `assert.equal(parsed.space, "a b");`,
    `const generic = require("query-string").parse("code=" + "%ab".repeat(5000));`,
    `assert.equal(generic.code, "%ab".repeat(5000));`,
    `let bounded = ""; let index = 0;`,
    `while (bounded.length < 8000) { const codePoint = 0x80 + (index % (0xD7FF - 0x80)); bounded += encodeURIComponent(String.fromCodePoint(codePoint)) + "x"; index += 1; }`,
    `bounded = bounded.slice(0, 8179) + "%";`,
    `const aggregateQuery = Array.from({ length: 100 }, (_, field) => "field" + field + "=" + bounded).join("&");`,
    `const aggregate = require("query-string").parse(aggregateQuery);`,
    `assert.equal(aggregate.field0, bounded); assert.equal(aggregate.field99, bounded);`,
    `const { getStateFromPath } = require("@react-navigation/core");`,
    `const state = getStateFromPath("/auth-callback?" + aggregateQuery, { screens: { AuthCallback: "auth-callback" } });`,
    `assert.equal(state.routes[0].params.field0, bounded); assert.equal(state.routes[0].params.field99, bounded);`,
    `const amplifier = "x".repeat(4000) + "%24%60".repeat(500) + "%";`,
    `assert.equal(require("decode-uri-component")(amplifier), amplifier);`,
    `const amplifierQuery = Array.from({ length: 100 }, (_, field) => "amplifier" + field + "=" + amplifier).join("&");`,
    `const amplified = require("query-string").parse(amplifierQuery);`,
    `assert.equal(amplified.amplifier0, amplifier); assert.equal(amplified.amplifier99, amplifier);`,
    `const amplifierState = getStateFromPath("/auth-callback?" + amplifierQuery, { screens: { AuthCallback: "auth-callback" } });`,
    `assert.equal(amplifierState.routes[0].params.amplifier0, amplifier); assert.equal(amplifierState.routes[0].params.amplifier99, amplifier);`,
    `const adversarial = parseQueryParams("/auth-callback?code=" + "%ab".repeat(5000), { params: {} }, undefined, "");`,
    `assert.equal(typeof adversarial.code, "string");`,
  ].join("\n");
  const result = spawnSync(process.execPath, ["--max-old-space-size=64", "-e", probe], {
    encoding: "utf8",
    timeout: 2_000,
  });

  assert.equal(result.error?.code, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
});

test("the complete vendored decoder compatibility suite passes", { timeout: 60_000 }, () => {
  const result = spawnSync(process.execPath, ["scripts/test-decode-uri-component-safe-compat.mjs"], {
    encoding: "utf8",
    timeout: 45_000,
  });

  assert.equal(result.error?.code, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.vulnerableInstalledCopies, 0);
  assert.equal(report.genericQueryParserAggregateParameters, 100);
  assert.ok(report.genericQueryParserAggregateCharacters > 800_000);
  assert.equal(report.replacementAmplifierAggregateParameters, 100);
  assert.ok(report.replacementAmplifierAggregateCharacters > 700_000);
});
