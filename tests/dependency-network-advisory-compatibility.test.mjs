import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("PostCSS rejects invalid indexed source-map offsets and preserves ordinary mappings", () => {
  const postcssRequire = createRequire(require.resolve("postcss/package.json"));
  assert.equal(postcssRequire("source-map-js/package.json").version, "1.2.2");
  const { SourceMapConsumer, SourceMapGenerator } = postcssRequire("source-map-js");
  const map = { version: 3, sources: ["input.css"], names: [], mappings: "AAAA" };
  const indexed = (line, column = 0, child = map) => ({
    version: 3, sections: [{ offset: { line, column }, map: child }],
  });
  for (const value of [-1, 0.5, NaN, Infinity, "1", 10000001, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => new SourceMapConsumer(indexed(value)), /Section offset/);
  }
  for (const value of [-1, 0.5, NaN, Infinity, "1", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => new SourceMapConsumer(indexed(0, value)), /Section offset/);
  }
  assert.throws(() => new SourceMapConsumer(indexed(6000000, 0, indexed(6000000))), /including offsets of nested sections/);

  const consumer = new SourceMapConsumer(indexed(2));
  assert.deepEqual(consumer.originalPositionFor({ line: 3, column: 1 }), {
    source: "input.css", line: 1, column: 0, name: null,
  });
  const mappings = [];
  consumer.eachMapping((mapping) => mappings.push(mapping));
  assert.equal(mappings[0].generatedLine, 3);
  assert.equal(mappings[0].source, "input.css");
  const roundTrip = SourceMapGenerator.fromSourceMap(new SourceMapConsumer(map)).toJSON();
  assert.equal(new SourceMapConsumer(roundTrip).originalPositionFor({ line: 1, column: 0 }).source, "input.css");
  const transformed = require("postcss")([]).process("a { color: red }", {
    from: "input.css", to: "output.css", map: { inline: false },
  });
  assert.equal(transformed.map.toJSON().sources[0], "input.css");
});

test("Expo compression releases its actual zlib stream when a response aborts", { timeout: 10000 }, () => {
  // Isolate the zlib observation hook so it cannot affect another test or the
  // package under test. The middleware and zlib streams are real instances.
  const expoRequire = createRequire(require.resolve("expo/package.json"));
  const cliRequire = createRequire(expoRequire.resolve("@expo/cli/package.json"));
  assert.equal(cliRequire("compression/package.json").version, "1.8.2");
  const probe = String.raw`
    const assert = require("node:assert/strict");
    const http = require("node:http");
    const zlib = require("node:zlib");
    const { once } = require("node:events");
    const streams = [];
    const original = zlib.createGzip;
    Object.defineProperty(zlib, "createGzip", { value: function (...args) {
      const stream = original(...args); streams.push(stream); return stream;
    }});
    const compression = require(process.argv[1]);
    const middleware = compression({ threshold: 0 });
    const body = "ordinary compressed response ".repeat(100);
    const server = http.createServer((req, res) => middleware(req, res, () => {
      res.setHeader("Content-Type", "text/plain");
      if (req.url === "/abort") { res.write(body); res.flush(); }
      else res.end(body);
    }));
    (async () => {
      await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
      const port = server.address().port;
      const request = path => http.get({ host: "127.0.0.1", port, path, headers: { "Accept-Encoding": "gzip" } });
      const ordinary = await new Promise((resolve, reject) => {
        request("/ordinary").on("error", reject).on("response", res => {
          const chunks = []; res.on("data", chunk => chunks.push(chunk));
          res.on("end", () => resolve(zlib.gunzipSync(Buffer.concat(chunks)).toString()));
        });
      });
      assert.equal(ordinary, body);
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve, reject) => {
          request("/abort").on("error", reject).on("response", res => {
            res.once("data", () => { res.destroy(); resolve(); });
          });
        });
        const stream = streams.at(-1);
        if (!stream.closed) await once(stream, "close");
        assert.equal(stream.destroyed, true);
      }
      assert.equal(streams.length, 4);
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    })().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ["-e", probe, cliRequire.resolve("compression")], {
    encoding: "utf8", timeout: 5000,
  });
  assert.equal(result.error?.code, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
});

test("Firestore's patched gRPC dependency preserves unary and streaming client contracts", { timeout: 10000 }, async (t) => {
  const firestoreRequire = createRequire(require.resolve("@firebase/firestore"));
  const grpc = firestoreRequire("@grpc/grpc-js");
  assert.equal(firestoreRequire("@grpc/grpc-js/package.json").version, "1.13.6");
  assert.equal(typeof require("@firebase/firestore").initializeFirestore, "function");
  assert.ok(grpc.credentials.createSsl());
  const encode = (value) => Buffer.from(JSON.stringify(value));
  const decode = (value) => JSON.parse(value.toString());
  const method = (name, stream) => ({
    path: `/fixture.Call/${name}`, requestStream: stream, responseStream: stream,
    requestSerialize: encode, requestDeserialize: decode,
    responseSerialize: encode, responseDeserialize: decode,
  });
  const definition = { unary: method("Unary", false), stream: method("Stream", true) };
  const service = grpc.loadPackageDefinition({ "fixture.Call": definition }).fixture.Call;
  const server = new grpc.Server();
  t.after(() => server.forceShutdown());
  server.addService(definition, {
    unary(call, done) {
      done(null, { received: call.request.value, metadata: call.metadata.get("fixture")[0] });
    },
    stream(call) {
      call.on("data", (value) => call.write({ received: value.value }));
      call.on("end", () => call.end());
    },
  });
  const port = await new Promise((resolve, reject) => server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (error, bound) => error ? reject(error) : resolve(bound)));
  const client = new service(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
  t.after(() => client.close());
  const metadata = new grpc.Metadata();
  metadata.set("fixture", "local-only");
  const result = await new Promise((resolve, reject) => client.unary({ value: "one" }, metadata, { deadline: Date.now() + 3000 }, (error, response) => error ? reject(error) : resolve(response)));
  assert.deepEqual(result, { received: "one", metadata: "local-only" });
  const received = [];
  await new Promise((resolve, reject) => {
    const call = client.stream(metadata, { deadline: Date.now() + 3000 });
    call.on("data", (value) => received.push(value));
    call.on("error", reject);
    call.on("end", resolve);
    call.write({ value: "two" });
    call.end({ value: "three" });
  });
  assert.deepEqual(received, [{ received: "two" }, { received: "three" }]);
});
