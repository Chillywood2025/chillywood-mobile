#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";

const repoRoot = process.cwd();
const backupTables = ["media_transcode_jobs", "media_renditions"];
const excludedScopes = [
  "auth.users",
  "billing",
  "payouts",
  "private_media_objects",
  "creator_originals",
  "signed_urls",
];
const requiredWriteEnv = [
  "MEDIA_BACKUP_RUNNER_ENABLED",
  "MEDIA_BACKUP_MODE",
  "MEDIA_BACKUP_DATABASE_URL",
  "MEDIA_BACKUP_R2_BUCKET",
  "MEDIA_BACKUP_R2_PREFIX",
];
const privateBackupPrefixRoot = "backups/media-worker/";
const publicPlaybackBucket = "chillywood-media-public-playback-proof";
const mediaPublicDomain = "media.chillywoodstream.com";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const allowedExportModes = ["auto", "pg_dump", "js"];

const parseArgValue = (name) => {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};

const mode = parseArgValue("--mode") ?? process.env.MEDIA_BACKUP_MODE ?? "dry-run";
const writeMode = mode === "write";
const exportModeRequested = process.env.MEDIA_BACKUP_EXPORT_MODE ?? "auto";

const sha256Hex = (input) => createHash("sha256").update(input).digest("hex");

const safeJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const redactProjectRef = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "not_provided";
  if (text.length <= 8) return "redacted";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
};

const safeExit = (code, payload) => {
  const out = safeJson({
    ...payload,
    noSecretsPrinted: true,
    productionRowsWritten: false,
    productionPlaybackSwitched: false,
  });
  if (code === 0) {
    process.stdout.write(out);
  } else {
    process.stderr.write(out);
  }
  process.exit(code);
};

const failClosed = (reason, details = {}) => {
  safeExit(1, {
    ok: false,
    failClosed: true,
    reason,
    mode,
    ...details,
  });
};

const commandAvailable = (command, args = ["--version"]) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
};

const pgDumpAvailable = () => commandAvailable("pg_dump");
const psqlAvailable = () => commandAvailable("psql");

const resolveExportMode = () => {
  if (!allowedExportModes.includes(exportModeRequested)) {
    failClosed("invalid_export_mode", { allowedExportModes });
  }
  if (exportModeRequested === "js") return "js";
  if (exportModeRequested === "pg_dump") {
    if (!pgDumpAvailable() || !psqlAvailable()) {
      failClosed("pg_dump_export_mode_missing_tools", { requiredTools: ["pg_dump", "psql"] });
    }
    return "pg_dump";
  }
  return pgDumpAvailable() && psqlAvailable() ? "pg_dump" : "js";
};

const hasCloudflareCredentialEnv = () => Boolean(
  process.env.CLOUDFLARE_API_TOKEN
    || (process.env.CLOUDFLARE_EMAIL && process.env.CLOUDFLARE_API_KEY)
    || process.env.WRANGLER_API_TOKEN,
);

const hasS3CredentialEnv = () => Boolean(
  (process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_ENDPOINT)
    || (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_ENDPOINT_URL_S3),
);

const normalizePrefix = (value) => {
  const text = String(value ?? "").trim();
  return text.endsWith("/") ? text : `${text}/`;
};

const assertSafeBackupTarget = ({ bucket, prefix }) => {
  const normalizedPrefix = normalizePrefix(prefix);
  const targetText = `${bucket ?? ""} ${normalizedPrefix}`;
  const failures = [];
  if (!bucket) failures.push("missing_bucket");
  if (bucket === publicPlaybackBucket) failures.push("public_playback_bucket_denied");
  if (/public-playback|public_playback/i.test(bucket ?? "")) failures.push("public_playback_named_bucket_denied");
  if (targetText.includes(mediaPublicDomain)) failures.push("public_media_domain_denied");
  if (normalizedPrefix !== privateBackupPrefixRoot) failures.push("prefix_must_equal_backups_media_worker");
  if (normalizedPrefix.startsWith("playback/public/")) failures.push("public_playback_prefix_denied");
  return { valid: failures.length === 0, failures, normalizedPrefix };
};

const assertNoSecretLikeText = (label, value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const forbidden = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    new RegExp(`\\bX-Amz-${"Signature"}=[A-Fa-f0-9]{32,}\\b`, "i"),
    /\b(Bearer|password|access_key|api_key|authorization)\s*[:=]/i,
    /\bservice[_-]?role[_-]?key\b/i,
  ];
  const matches = forbidden.filter((pattern) => pattern.test(text)).map((pattern) => String(pattern));
  if (matches.length > 0) {
    failClosed("secret_like_value_refused", { label, matches });
  }
};

const getRepoCommit = () => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
};

const getMigrationHead = () => "20260709033207_trusted_media_transcode_renditions";

const buildObjectPrefix = (createdAt, backupId) => {
  const date = new Date(createdAt);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${privateBackupPrefixRoot}${year}/${month}/${day}/${backupId}/`;
};

const writeGzipFile = (filePath, content) => {
  writeFileSync(filePath, gzipSync(Buffer.from(content, "utf8")));
};

const buildStandaloneJsSchemaSql = () => [
  "create schema if not exists public;",
  "create table if not exists public.media_transcode_jobs (",
  "  id uuid primary key,",
  "  source_type text not null,",
  "  source_id text not null,",
  "  creator_id uuid,",
  "  requested_by uuid,",
  "  input_provider text not null,",
  "  input_bucket_role text not null,",
  "  input_bucket text,",
  "  input_path text not null,",
  "  output_provider text not null,",
  "  output_bucket_role text not null,",
  "  output_bucket text,",
  "  output_prefix text not null,",
  "  status text not null,",
  "  requested_renditions jsonb not null,",
  "  completed_renditions jsonb not null,",
  "  duration_ms integer,",
  "  source_width integer,",
  "  source_height integer,",
  "  source_codec text,",
  "  worker_version text,",
  "  source_hash text,",
  "  error_code text,",
  "  error_message text,",
  "  proof_mode boolean not null,",
  "  created_at timestamptz not null,",
  "  updated_at timestamptz not null,",
  "  started_at timestamptz,",
  "  completed_at timestamptz",
  ");",
  "create table if not exists public.media_renditions (",
  "  id uuid primary key,",
  "  job_id uuid,",
  "  media_id text not null,",
  "  video_id uuid,",
  "  source_type text not null,",
  "  source_id text not null,",
  "  creator_id uuid,",
  "  rendition_label text not null,",
  "  delivery_format text not null,",
  "  delivery_provider text not null,",
  "  storage_provider text not null,",
  "  bucket_role text not null,",
  "  storage_bucket text,",
  "  storage_path text,",
  "  public_playback_path text,",
  "  manifest_path text,",
  "  variant_playlist_path text,",
  "  width integer,",
  "  height integer,",
  "  duration_ms integer,",
  "  codec text,",
  "  bitrate integer,",
  "  file_size_bytes bigint,",
  "  cache_policy text,",
  "  visibility text not null,",
  "  scan_status text not null,",
  "  moderation_status text not null,",
  "  is_public_playback_safe boolean not null,",
  "  is_original boolean not null,",
  "  is_ready boolean not null,",
  "  worker_version text,",
  "  source_hash text,",
  "  created_at timestamptz not null,",
  "  updated_at timestamptz not null",
  ");",
  "create index if not exists media_transcode_jobs_source_idx on public.media_transcode_jobs (source_type, source_id);",
  "create index if not exists media_renditions_source_idx on public.media_renditions (source_type, source_id);",
  "create index if not exists media_renditions_ready_idx on public.media_renditions (is_ready, source_type, source_id);",
  "",
].join("\n");

const buildFixtureSchemaSql = () => [
  "create table if not exists public.media_transcode_jobs (",
  "  id text primary key,",
  "  source_type text not null,",
  "  source_id text not null,",
  "  status text not null,",
  "  created_at text not null",
  ");",
  "create table if not exists public.media_renditions (",
  "  id text primary key,",
  "  source_type text not null,",
  "  source_id text not null,",
  "  rendition_label text not null,",
  "  public_playback_path text,",
  "  visibility text not null,",
  "  scan_status text not null,",
  "  moderation_status text not null,",
  "  bucket_role text not null,",
  "  is_original boolean not null,",
  "  is_public_playback_safe boolean not null,",
  "  is_ready boolean not null,",
  "  created_at text not null",
  ");",
  "",
].join("\n");

const buildFixtureDataSql = () => "-- dry-run fixture backup contains no production rows\n";

const buildFixtureDataJsonl = () => "";

const assertNoUnsafeBackupValue = (label, value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const patterns = [
    /https?:\/\//i,
    new RegExp(`\\bX-Amz-${"Signature"}=`, "i"),
    /\btoken=/i,
    /\bsignature=/i,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /\b(Bearer|authorization|access_key|api_key)\s*[:=]/i,
  ];
  const matches = patterns.filter((pattern) => pattern.test(text)).map((pattern) => String(pattern));
  if (matches.length > 0) {
    failClosed("unsafe_value_in_backup_data", { label, matches });
  }
};

const int32Buffer = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value, 0);
  return buffer;
};

const int16From = (buffer, offset) => buffer.readInt16BE(offset);
const int32From = (buffer, offset) => buffer.readInt32BE(offset);

const cstringFrom = (buffer, offset) => {
  const end = buffer.indexOf(0, offset);
  if (end < 0) throw new Error("unterminated_cstring");
  return { value: buffer.slice(offset, end).toString("utf8"), next: end + 1 };
};

const writeFrontendMessage = (socket, type, payload = Buffer.alloc(0)) => {
  const header = type ? Buffer.from(type) : Buffer.alloc(0);
  const length = int32Buffer(payload.length + 4);
  socket.write(Buffer.concat([header, length, payload]));
};

const makePasswordMessage = (value) => Buffer.concat([Buffer.from(value, "utf8"), Buffer.from([0])]);

const xorBuffers = (left, right) => {
  const out = Buffer.alloc(Math.min(left.length, right.length));
  for (let index = 0; index < out.length; index += 1) out[index] = left[index] ^ right[index];
  return out;
};

class PostgresSimpleClient {
  constructor(connectionText) {
    this.url = new URL(connectionText);
    this.host = this.url.hostname;
    this.port = Number(this.url.port || 5432);
    this.user = decodeURIComponent(this.url.username || "");
    this.dbSecretValue = decodeURIComponent(this.url.password || "");
    this.database = decodeURIComponent((this.url.pathname || "/postgres").slice(1) || "postgres");
    this.sslMode = this.url.searchParams.get("sslmode") || "require";
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pendingRows = [];
    this.pendingFields = [];
  }

  connectSocket() {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: this.host, port: this.port });
      socket.once("error", reject);
      socket.once("connect", () => {
        socket.off("error", reject);
        resolve(socket);
      });
    });
  }

  async connect() {
    let socket = await this.connectSocket();
    if (this.sslMode !== "disable") {
      socket.write(Buffer.concat([int32Buffer(8), int32Buffer(80877103)]));
      const sslResponse = await new Promise((resolve, reject) => {
        socket.once("data", resolve);
        socket.once("error", reject);
      });
      if (sslResponse.slice(0, 1).toString("utf8") !== "S") {
        throw new Error("postgres_ssl_refused");
      }
      socket = tls.connect({ socket, servername: this.host });
      await new Promise((resolve, reject) => {
        socket.once("secureConnect", resolve);
        socket.once("error", reject);
      });
    }
    this.socket = socket;
    this.socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
    });

    const params = [
      "user", this.user,
      "database", this.database,
      "client_encoding", "UTF8",
    ];
    const parts = [int32Buffer(196608)];
    for (const param of params) parts.push(Buffer.from(param, "utf8"), Buffer.from([0]));
    parts.push(Buffer.from([0]));
    writeFrontendMessage(this.socket, null, Buffer.concat(parts));

    await this.consumeUntilReady();
  }

  close() {
    if (this.socket) {
      writeFrontendMessage(this.socket, "X");
      this.socket.end();
    }
  }

  async nextMessage() {
    while (this.buffer.length < 5) {
      await new Promise((resolve, reject) => {
        this.socket.once("data", resolve);
        this.socket.once("error", reject);
      });
    }
    const type = this.buffer.slice(0, 1).toString("utf8");
    const length = int32From(this.buffer, 1);
    while (this.buffer.length < length + 1) {
      await new Promise((resolve, reject) => {
        this.socket.once("data", resolve);
        this.socket.once("error", reject);
      });
    }
    const payload = this.buffer.slice(5, length + 1);
    this.buffer = this.buffer.slice(length + 1);
    return { type, payload };
  }

  async consumeUntilReady() {
    for (;;) {
      const message = await this.nextMessage();
      if (message.type === "R") await this.handleAuth(message.payload);
      if (message.type === "E") throw new Error("postgres_error_response");
      if (message.type === "Z") return;
    }
  }

  async handleAuth(payload) {
    const code = int32From(payload, 0);
    if (code === 0) return;
    if (code === 3) {
      writeFrontendMessage(this.socket, "p", makePasswordMessage(this.dbSecretValue));
      return;
    }
    if (code === 5) {
      const salt = payload.slice(4, 8);
      const inner = createHash("md5").update(`${this.dbSecretValue}${this.user}`).digest("hex");
      const outer = createHash("md5").update(Buffer.concat([Buffer.from(inner), salt])).digest("hex");
      writeFrontendMessage(this.socket, "p", makePasswordMessage(`md5${outer}`));
      return;
    }
    if (code === 10) {
      const mechanisms = payload.slice(4).toString("utf8").split("\0").filter(Boolean);
      if (!mechanisms.includes("SCRAM-SHA-256")) throw new Error("postgres_scram_sha256_required");
      await this.startScramAuth();
      return;
    }
    if (code === 11) {
      await this.continueScramAuth(payload.slice(4).toString("utf8"));
      return;
    }
    if (code === 12) {
      this.finishScramAuth(payload.slice(4).toString("utf8"));
      return;
    }
    throw new Error(`unsupported_postgres_auth_${code}`);
  }

  async startScramAuth() {
    this.scramNonce = randomBytes(18).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
    this.clientFirstBare = `n=*,r=${this.scramNonce}`;
    const first = `n,,${this.clientFirstBare}`;
    const mechanism = Buffer.from("SCRAM-SHA-256\0", "utf8");
    const response = Buffer.from(first, "utf8");
    const payload = Buffer.concat([mechanism, int32Buffer(response.length), response]);
    writeFrontendMessage(this.socket, "p", payload);
  }

  async continueScramAuth(serverFirst) {
    const attrs = Object.fromEntries(serverFirst.split(",").map((part) => [part.slice(0, 1), part.slice(2)]));
    if (!attrs.r?.startsWith(this.scramNonce)) throw new Error("postgres_scram_nonce_mismatch");
    const salt = Buffer.from(attrs.s, "base64");
    const iterations = Number(attrs.i);
    const clientFinalWithoutProof = `c=biws,r=${attrs.r}`;
    const authMessage = `${this.clientFirstBare},${serverFirst},${clientFinalWithoutProof}`;
    const salted = pbkdf2Sync(this.dbSecretValue, salt, iterations, 32, "sha256");
    const clientKey = createHmac("sha256", salted).update("Client Key").digest();
    const storedKey = createHash("sha256").update(clientKey).digest();
    const clientSignature = createHmac("sha256", storedKey).update(authMessage).digest();
    const clientProof = xorBuffers(clientKey, clientSignature).toString("base64");
    this.expectedServerSignature = createHmac(
      "sha256",
      createHmac("sha256", salted).update("Server Key").digest(),
    ).update(authMessage).digest("base64");
    writeFrontendMessage(this.socket, "p", Buffer.from(`${clientFinalWithoutProof},p=${clientProof}`, "utf8"));
  }

  finishScramAuth(serverFinal) {
    const verifier = serverFinal.split(",").find((part) => part.startsWith("v="))?.slice(2);
    if (verifier && this.expectedServerSignature) {
      const left = Buffer.from(verifier);
      const right = Buffer.from(this.expectedServerSignature);
      if (left.length !== right.length || !timingSafeEqual(left, right)) {
        throw new Error("postgres_scram_server_signature_mismatch");
      }
    }
  }

  async query(sql) {
    this.pendingRows = [];
    this.pendingFields = [];
    writeFrontendMessage(this.socket, "Q", Buffer.concat([Buffer.from(sql, "utf8"), Buffer.from([0])]));
    for (;;) {
      const message = await this.nextMessage();
      if (message.type === "T") this.pendingFields = this.parseRowDescription(message.payload);
      if (message.type === "D") this.pendingRows.push(this.parseDataRow(message.payload));
      if (message.type === "E") throw new Error("postgres_query_error");
      if (message.type === "Z") return this.pendingRows;
    }
  }

  parseRowDescription(payload) {
    const count = int16From(payload, 0);
    const fields = [];
    let offset = 2;
    for (let index = 0; index < count; index += 1) {
      const name = cstringFrom(payload, offset);
      offset = name.next + 18;
      fields.push(name.value);
    }
    return fields;
  }

  parseDataRow(payload) {
    const count = int16From(payload, 0);
    let offset = 2;
    const row = {};
    for (let index = 0; index < count; index += 1) {
      const length = int32From(payload, offset);
      offset += 4;
      if (length === -1) {
        row[this.pendingFields[index]] = null;
      } else {
        row[this.pendingFields[index]] = payload.slice(offset, offset + length).toString("utf8");
        offset += length;
      }
    }
    return row;
  }
}

const runPgDump = (databaseUrl) => {
  if (!commandAvailable("pg_dump")) {
    failClosed("missing_pg_dump_for_write_mode", { requiredTool: "pg_dump" });
  }
  const baseArgs = [
    "--no-owner",
    "--no-privileges",
    "--table=public.media_transcode_jobs",
    "--table=public.media_renditions",
  ];
  const env = { ...process.env, PGDATABASE: databaseUrl };
  try {
    const schemaSql = execFileSync("pg_dump", ["--schema-only", ...baseArgs], {
      cwd: repoRoot,
      env,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const dataSql = execFileSync("pg_dump", ["--data-only", "--column-inserts", ...baseArgs], {
      cwd: repoRoot,
      env,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { schemaSql, dataSql, toolUsed: "pg_dump" };
  } catch {
    failClosed("pg_dump_failed_without_secret_output", { requiredTables: backupTables });
  }
};

const getRowCounts = (databaseUrl) => {
  if (!commandAvailable("psql")) {
    failClosed("missing_psql_for_write_mode_row_counts", { requiredTool: "psql" });
  }
  const query = [
    "select json_build_object(",
    "  'media_transcode_jobs', (select count(*)::int from public.media_transcode_jobs),",
    "  'media_renditions', (select count(*)::int from public.media_renditions)",
    ");",
  ].join(" ");
  try {
    const out = execFileSync("psql", ["-X", "-q", "-t", "-A", "-c", query], {
      cwd: repoRoot,
      env: { ...process.env, PGDATABASE: databaseUrl },
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const parsed = JSON.parse(out);
    return {
      media_transcode_jobs: Number(parsed.media_transcode_jobs ?? 0),
      media_renditions: Number(parsed.media_renditions ?? 0),
    };
  } catch {
    failClosed("row_count_query_failed_without_secret_output", { requiredTables: backupTables });
  }
};

const runJsExport = async (databaseUrl) => {
  const client = new PostgresSimpleClient(databaseUrl);
  try {
    await client.connect();
    const countRows = await client.query([
      "select",
      "  (select count(*)::int from public.media_transcode_jobs)::text as media_transcode_jobs,",
      "  (select count(*)::int from public.media_renditions)::text as media_renditions",
    ].join(" "));
    const jobRows = await client.query("select row_to_json(t)::text as row from (select * from public.media_transcode_jobs order by created_at asc, id asc) t");
    const renditionRows = await client.query("select row_to_json(t)::text as row from (select * from public.media_renditions order by created_at asc, id asc) t");
    const jsonLines = [];
    for (const entry of jobRows) {
      const row = JSON.parse(entry.row);
      assertNoUnsafeBackupValue("media_transcode_jobs", row);
      jsonLines.push(JSON.stringify({ table: "media_transcode_jobs", row }));
    }
    for (const entry of renditionRows) {
      const row = JSON.parse(entry.row);
      assertNoUnsafeBackupValue("media_renditions", row);
      jsonLines.push(JSON.stringify({ table: "media_renditions", row }));
    }
    const counts = countRows[0] ?? {};
    return {
      schemaSql: buildStandaloneJsSchemaSql(),
      dataContent: `${jsonLines.join("\n")}${jsonLines.length ? "\n" : ""}`,
      dataFileName: "data-media-worker.jsonl.gz",
      rowCounts: {
        media_transcode_jobs: Number(counts.media_transcode_jobs ?? jobRows.length),
        media_renditions: Number(counts.media_renditions ?? renditionRows.length),
      },
      toolUsed: "node_js_postgres_select_export",
    };
  } catch {
    failClosed("js_export_failed_without_secret_output", { requiredTables: backupTables });
  } finally {
    client.close();
  }
};

const uploadWithWrangler = ({ bucket, objectPrefix, files }) => {
  if (!commandAvailable(npxCommand, ["wrangler", "--version"])) {
    failClosed("missing_wrangler_for_cloudflare_upload", { requiredTool: "npx wrangler" });
  }
  for (const [name, filePath] of Object.entries(files)) {
    const target = `${bucket}/${objectPrefix}${name}`;
    const result = spawnSync(npxCommand, ["wrangler", "r2", "object", "put", target, "--file", filePath], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      failClosed("wrangler_r2_upload_failed_without_secret_output", {
        artifact: name,
        objectKey: `${objectPrefix}${name}`,
      });
    }
  }
};

const uploadWithAwsCli = ({ bucket, endpoint, objectPrefix, files }) => {
  if (!commandAvailable("aws", ["--version"])) {
    failClosed("missing_aws_cli_for_s3_upload", { requiredTool: "aws" });
  }
  for (const [name, filePath] of Object.entries(files)) {
    const result = spawnSync("aws", ["s3", "cp", filePath, `s3://${bucket}/${objectPrefix}${name}`, "--endpoint-url", endpoint], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      failClosed("s3_upload_failed_without_secret_output", {
        artifact: name,
        objectKey: `${objectPrefix}${name}`,
      });
    }
  }
};

const createArtifacts = ({
  schemaSql,
  dataContent,
  dataFileName = "data-media-worker.sql.gz",
  rowCounts,
  toolUsed,
  bucketRole,
  objectPrefix,
  backupId,
  createdAt,
}) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-worker-backup-"));
  const artifactPaths = {
    "schema.sql.gz": path.join(tempDir, "schema.sql.gz"),
    [dataFileName]: path.join(tempDir, dataFileName),
    "manifest.json": path.join(tempDir, "manifest.json"),
    "sha256sums.txt": path.join(tempDir, "sha256sums.txt"),
  };

  writeGzipFile(artifactPaths["schema.sql.gz"], schemaSql);
  writeGzipFile(artifactPaths[dataFileName], dataContent);

  const schemaSha = sha256Hex(readFileSync(artifactPaths["schema.sql.gz"]));
  const dataSha = sha256Hex(readFileSync(artifactPaths[dataFileName]));
  const manifest = {
    backup_id: backupId,
    created_at: createdAt,
    source_project_ref_redacted: redactProjectRef(process.env.MEDIA_BACKUP_PROJECT_REF),
    database_host_redacted: writeMode ? "redacted" : "not_used_dry_run",
    scope: "media_worker",
    tables_included: backupTables,
    tables_excluded: excludedScopes,
    row_counts: rowCounts,
    migration_head: getMigrationHead(),
    repo_commit: getRepoCommit(),
    artifact_files: Object.keys(artifactPaths),
    r2_bucket_role: bucketRole,
    r2_object_prefix: objectPrefix,
    sha256: {
      "schema.sql.gz": schemaSha,
      [dataFileName]: dataSha,
    },
    tool_used: toolUsed,
    logical_backup_not_pitr: true,
    contains_secrets: false,
    public_bucket_used: false,
    production_rows_written: false,
  };
  assertNoSecretLikeText("manifest", manifest);
  writeFileSync(artifactPaths["manifest.json"], `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestSha = sha256Hex(readFileSync(artifactPaths["manifest.json"]));
  const sums = [
    `${schemaSha}  schema.sql.gz`,
    `${dataSha}  ${dataFileName}`,
    `${manifestSha}  manifest.json`,
  ].join("\n");
  writeFileSync(artifactPaths["sha256sums.txt"], `${sums}\n`);
  assertNoSecretLikeText("sha256sums", readFileSync(artifactPaths["sha256sums.txt"], "utf8"));

  return {
    tempDir,
    artifactPaths,
    manifest,
    sha256: {
      "schema.sql.gz": schemaSha,
      "data-media-worker.sql.gz": dataSha,
      "manifest.json": manifestSha,
      "sha256sums.txt": sha256Hex(readFileSync(artifactPaths["sha256sums.txt"])),
    },
  };
};

if (mode !== "dry-run" && mode !== "write") {
  failClosed("invalid_mode", { allowedModes: ["dry-run", "write"] });
}
const exportModeResolved = resolveExportMode();

const createdAt = new Date().toISOString();
const shortCommit = getRepoCommit().slice(0, 12) || "unknown";
const backupId = `media-worker-logical-${createdAt.replace(/[-:.]/g, "").slice(0, 15)}-${shortCommit}`;
const objectPrefix = buildObjectPrefix(createdAt, backupId);

if (!writeMode) {
  const artifacts = createArtifacts({
    schemaSql: exportModeResolved === "js" ? buildStandaloneJsSchemaSql() : buildFixtureSchemaSql(),
    dataContent: exportModeResolved === "js" ? buildFixtureDataJsonl() : buildFixtureDataSql(),
    dataFileName: exportModeResolved === "js" ? "data-media-worker.jsonl.gz" : "data-media-worker.sql.gz",
    rowCounts: { media_transcode_jobs: 0, media_renditions: 0 },
    toolUsed: exportModeResolved === "js" ? "dry_run_js_fixture" : "dry_run_pg_dump_fixture",
    bucketRole: "private_backup",
    objectPrefix,
    backupId,
    createdAt,
  });
  const summary = {
    ok: true,
    mode: "dry-run",
    dryRun: true,
    backupRunnerAvailable: true,
    uploadAttempted: false,
    writeModeRequiresEnv: requiredWriteEnv,
    exportModeRequested,
    exportModeResolved,
    pgDumpAvailable: pgDumpAvailable(),
    psqlAvailable: psqlAvailable(),
    pgDumpRequired: exportModeResolved === "pg_dump",
    backupId,
    objectPrefix,
    tablesIncluded: backupTables,
    tablesExcluded: excludedScopes,
    artifactFiles: Object.keys(artifacts.artifactPaths),
    manifestValid: true,
    checksumGenerated: true,
    privateR2Prefix: objectPrefix.startsWith(privateBackupPrefixRoot),
    publicBucketUsed: false,
    logicalBackupNotPitr: true,
    productionDbTouched: false,
    productionWorkerDeployed: false,
    continuousAutomationEnabled: false,
  };
  rmSync(artifacts.tempDir, { recursive: true, force: true });
  safeExit(0, summary);
}

const missing = requiredWriteEnv.filter((name) => !process.env[name]);
if (missing.length > 0) {
  failClosed("missing_required_env_for_write_mode", { missingEnv: missing });
}

if (process.env.MEDIA_BACKUP_RUNNER_ENABLED !== "true") {
  failClosed("runner_disabled", { required: "MEDIA_BACKUP_RUNNER_ENABLED true" });
}

if (process.env.MEDIA_BACKUP_MODE !== "write") {
  failClosed("write_mode_env_not_confirmed", { required: "MEDIA_BACKUP_MODE write" });
}

const target = assertSafeBackupTarget({
  bucket: process.env.MEDIA_BACKUP_R2_BUCKET,
  prefix: process.env.MEDIA_BACKUP_R2_PREFIX,
});
if (!target.valid) {
  failClosed("unsafe_backup_target_refused", { targetFailures: target.failures });
}

const cloudflareAuth = hasCloudflareCredentialEnv();
const s3Auth = hasS3CredentialEnv();
if (!cloudflareAuth && !s3Auth) {
  failClosed("missing_r2_upload_credentials", {
    acceptedCredentialFamilies: ["cloudflare_api_or_wrangler", "r2_s3_compatible"],
  });
}

const databaseUrl = process.env.MEDIA_BACKUP_DATABASE_URL;
let dump;
if (exportModeResolved === "pg_dump") {
  const pgDumpResult = runPgDump(databaseUrl);
  dump = {
    schemaSql: pgDumpResult.schemaSql,
    dataContent: pgDumpResult.dataSql,
    dataFileName: "data-media-worker.sql.gz",
    rowCounts: getRowCounts(databaseUrl),
    toolUsed: pgDumpResult.toolUsed,
  };
} else {
  dump = await runJsExport(databaseUrl);
}
const artifacts = createArtifacts({
  schemaSql: dump.schemaSql,
  dataContent: dump.dataContent,
  dataFileName: dump.dataFileName,
  rowCounts: dump.rowCounts,
  toolUsed: dump.toolUsed,
  bucketRole: "private_backup",
  objectPrefix,
  backupId,
  createdAt,
});

try {
  if (cloudflareAuth) {
    uploadWithWrangler({
      bucket: process.env.MEDIA_BACKUP_R2_BUCKET,
      objectPrefix,
      files: artifacts.artifactPaths,
    });
  } else {
    uploadWithAwsCli({
      bucket: process.env.MEDIA_BACKUP_R2_BUCKET,
      endpoint: process.env.R2_ENDPOINT ?? process.env.AWS_ENDPOINT_URL_S3,
      objectPrefix,
      files: artifacts.artifactPaths,
    });
  }

  safeExit(0, {
    ok: true,
    mode: "write",
    dryRun: false,
    uploadAttempted: true,
    uploadSucceeded: true,
    backupId,
    objectPrefix,
    exportModeRequested,
    exportModeResolved,
    tablesIncluded: backupTables,
    tablesExcluded: excludedScopes,
    rowCounts: dump.rowCounts,
    artifactFiles: Object.keys(artifacts.artifactPaths),
    manifestValid: true,
    checksumGenerated: true,
    privateR2Prefix: true,
    publicBucketUsed: false,
    logicalBackupNotPitr: true,
    productionDbTouched: true,
    productionDbWritesEnabled: false,
    productionWorkerDeployed: false,
    continuousAutomationEnabled: false,
  });
} finally {
  if (existsSync(artifacts.tempDir)) {
    rmSync(artifacts.tempDir, { recursive: true, force: true });
  }
}
