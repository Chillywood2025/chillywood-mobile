import { createHmac } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../src/server.js";

let tempDir: string;
const webhookSecret = "parser-test-secret";
const body = JSON.stringify({ alerts: [{ labels: { alertname: "ServerCpuMemoryPressure" } }] });
const signature = `sha256=${createHmac("sha256", webhookSecret).update(body).digest("hex")}`;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "chillywood-parser-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function fixture() {
  return createApp({
    NODE_ENV: "test",
    JOB_STORE_PATH: join(tempDir, "jobs.json"),
    AUDIT_LOG_PATH: join(tempDir, "audit.log"),
    OPS_WEBHOOK_SECRET: webhookSecret
  });
}

async function postCompressed(
  server: Server,
  data: Buffer,
  encoding: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing_test_server_address");
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: "127.0.0.1",
      port: address.port,
      path: "/webhook/alert",
      method: "POST",
      agent: false,
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": encoding,
        "Content-Length": String(data.length),
        "X-Ops-Signature": signature,
        ...headers
      }
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("error", reject);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(responseBody) });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(2000, () => req.destroy(new Error("compressed_request_timeout")));
    req.end(data);
  });
}

async function withServer(run: (server: Server, value: ReturnType<typeof fixture>) => Promise<void>) {
  const value = fixture();
  const server = value.app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    await run(server, value);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("patched request parser compatibility", () => {
  it.each([
    ["gzip", gzipSync],
    ["deflate", deflateSync],
    ["br", brotliCompressSync]
  ] as const)("preserves signed %s webhooks and dry-run behavior", async (encoding, compress) => {
    await withServer(async (server, { store }) => {
      const response = await postCompressed(server, compress(Buffer.from(body)), encoding);
      expect(response.status).toBe(202);
      expect(response.body.accepted).toBe(true);
      const jobs = await store.list();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe("dry_run_completed");
      expect(jobs[0].executionResult).toBeUndefined();
    });
  });

  // GHSA-27r3-jxmh-p828: a raw HTTP client allows trailing bytes to reach
  // the decompressor after its valid gzip frame has already completed.
  it.each(["application/json", "application/json; charset=utf-999"])(
    "survives trailing gzip bytes with %s",
    async (contentType) => {
      await withServer(async (server, { app, store }) => {
        const data = Buffer.concat([gzipSync(Buffer.from(body)), Buffer.from([0]), Buffer.alloc(100 * 1024, 0x58)]);
        const response = await postCompressed(server, data, "gzip", { "Content-Type": contentType });
        // Keep the existing app error contract for unsupported charsets.
        expect(response.status).toBe(contentType === "application/json" ? 202 : 500);
        await delay(200);
        await request(app).get("/healthz").expect(200);
        expect(await store.list()).toHaveLength(contentType === "application/json" ? 1 : 0);
      });
    }
  );

  it("preserves signature rejection and the decompressed 256kb limit", async () => {
    await withServer(async (server, { app, store }) => {
      const unsigned = await postCompressed(server, gzipSync(Buffer.from(body)), "gzip", { "X-Ops-Signature": "invalid" });
      expect(unsigned).toEqual({ status: 401, body: { error: "invalid_webhook_signature" } });
      const oversized = gzipSync(Buffer.from(JSON.stringify({ padding: "x".repeat(256 * 1024) })));
      const rejected = await postCompressed(server, oversized, "gzip");
      expect(rejected.status).toBe(500);
      expect(rejected.body.error).toBe("request entity too large");
      expect(await store.list()).toHaveLength(0);
      await request(app).get("/healthz").expect(200);
    });
  });
});

describe("patched Zod collection validation", () => {
  it("rejects oversized constrained arrays before visiting their elements", () => {
    let visits = 0;
    const collection = z.array(z.unknown().transform((value) => { visits += 1; return value; })).max(1);
    for (const schema of [collection, z.object({ alerts: collection })]) {
      const oversized = Array(1000).fill(null);
      const result = schema.safeParse(schema === collection ? oversized : { alerts: oversized });
      expect(result.success).toBe(false);
      expect(visits).toBe(0);
    }
    expect(collection.parse(["valid"])).toEqual(["valid"]);
    expect(visits).toBe(1);
  });

  it.each([{ alerts: [] }, { alerts: [{ labels: { alertname: 1 } }] }, { alerts: Array(1000).fill(null) }])(
    "retains the webhook's invalid-payload response without creating jobs",
    async (payload) => {
      const { app, store } = fixture();
      const json = JSON.stringify(payload);
      const hmac = createHmac("sha256", webhookSecret).update(json).digest("hex");
      const response = await request(app).post("/webhook/alert")
        .set("Content-Type", "application/json").set("X-Ops-Signature", `sha256=${hmac}`).send(json);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "invalid_alertmanager_payload" });
      expect(await store.list()).toHaveLength(0);
    }
  );
});
