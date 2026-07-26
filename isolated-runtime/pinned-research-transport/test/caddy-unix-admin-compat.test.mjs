import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CADDY_ADMIN_SOCKET_FINAL_MODE,
  CADDY_ADMIN_SOCKET_DIRECTORY,
  CADDY_ADMIN_SOCKET_DIRECTORY_MODE,
  CADDY_ADMIN_SOCKET_INITIAL_MODE,
  CADDY_ADMIN_SOCKET_PATH,
  verifyFixedCaddyAdminSocket,
} from "../deploy/verify-caddy-admin-socket.mjs";

const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const helperPath = resolve(
  packageRoot,
  "deploy/verify-caddy-admin-socket.mjs",
);

const metadata = ({
  dev = 7n,
  gid = 1001n,
  ino = 11n,
  mode = CADDY_ADMIN_SOCKET_INITIAL_MODE,
  socket = true,
  symlink = false,
  uid = 1001n,
} = {}) => ({
  dev,
  gid,
  ino,
  isSocket: () => socket,
  isSymbolicLink: () => symlink,
  mode: BigInt(mode),
  uid,
});

const directoryMetadata = ({
  dev = 6n,
  directory = true,
  gid = 1001n,
  ino = 10n,
  mode = CADDY_ADMIN_SOCKET_DIRECTORY_MODE,
  symlink = false,
  uid = 1001n,
} = {}) => ({
  dev,
  gid,
  ino,
  isDirectory: () => directory,
  isSymbolicLink: () => symlink,
  mode: BigInt(mode),
  uid,
});

const runVerifier = ({
  after = metadata({ mode: CADDY_ADMIN_SOCKET_FINAL_MODE }),
  argv = ["/usr/bin/node", helperPath],
  before = metadata(),
  chmodError = null,
  directoryAfter = directoryMetadata(),
  directoryBefore = directoryMetadata(),
} = {}) => {
  const paths = [];
  const modes = [];
  let directoryReads = 0;
  let socketReads = 0;
  const status = verifyFixedCaddyAdminSocket({
    argv,
    chmod: (path, mode) => {
      paths.push(path);
      modes.push(mode);
      if (chmodError) {
        throw chmodError;
      }
    },
    getgid: () => 1001,
    getuid: () => 1001,
    lstat: (path) => {
      paths.push(path);
      if (path === CADDY_ADMIN_SOCKET_DIRECTORY) {
        directoryReads += 1;
        return directoryReads === 1
          ? directoryBefore
          : directoryAfter;
      }
      assert.equal(path, CADDY_ADMIN_SOCKET_PATH);
      socketReads += 1;
      return socketReads === 1 ? before : after;
    },
  });
  return { modes, paths, status };
};

test("fixed-path verifier accepts one exact 0755-to-0600 socket transition inside 0700", () => {
  const result = runVerifier();
  assert.equal(result.status, 0);
  assert.deepEqual(result.modes, [CADDY_ADMIN_SOCKET_FINAL_MODE]);
  assert.deepEqual(result.paths, [
    CADDY_ADMIN_SOCKET_DIRECTORY,
    CADDY_ADMIN_SOCKET_PATH,
    CADDY_ADMIN_SOCKET_PATH,
    CADDY_ADMIN_SOCKET_PATH,
    CADDY_ADMIN_SOCKET_DIRECTORY,
  ]);
});

for (const [name, directoryBefore] of [
  ["symlink parent", directoryMetadata({ symlink: true })],
  ["non-directory parent", directoryMetadata({ directory: false })],
  ["wrong parent mode", directoryMetadata({ mode: 0o755 })],
  ["wrong parent owner", directoryMetadata({ uid: 1002n })],
  ["wrong parent group", directoryMetadata({ gid: 1002n })],
]) {
  test(`fixed-path verifier rejects ${name} before socket access`, () => {
    const result = runVerifier({ directoryBefore });
    assert.equal(result.status, 1);
    assert.deepEqual(result.modes, []);
    assert.deepEqual(result.paths, [CADDY_ADMIN_SOCKET_DIRECTORY]);
  });
}

for (const [name, before] of [
  ["symlink", metadata({ symlink: true })],
  ["non-socket", metadata({ socket: false })],
  ["wrong initial mode", metadata({ mode: 0o700 })],
  ["wrong owner", metadata({ uid: 1002n })],
  ["wrong group", metadata({ gid: 1002n })],
]) {
  test(`fixed-path verifier rejects ${name} before chmod`, () => {
    const result = runVerifier({ before });
    assert.equal(result.status, 1);
    assert.deepEqual(result.modes, []);
  });
}

for (const [name, directoryAfter] of [
  ["parent symlink replacement", directoryMetadata({ symlink: true })],
  ["parent type replacement", directoryMetadata({ directory: false })],
  ["parent device replacement", directoryMetadata({ dev: 8n })],
  ["parent inode replacement", directoryMetadata({ ino: 12n })],
  ["parent owner replacement", directoryMetadata({ uid: 1002n })],
  ["parent group replacement", directoryMetadata({ gid: 1002n })],
  ["parent mode replacement", directoryMetadata({ mode: 0o755 })],
]) {
  test(`fixed-path verifier rejects ${name} after chmod`, () => {
    const result = runVerifier({ directoryAfter });
    assert.equal(result.status, 1);
    assert.deepEqual(result.modes, [CADDY_ADMIN_SOCKET_FINAL_MODE]);
  });
}

for (const [name, after] of [
  ["symlink replacement", metadata({ mode: 0o600, symlink: true })],
  ["non-socket replacement", metadata({ mode: 0o600, socket: false })],
  ["device replacement", metadata({ dev: 8n, mode: 0o600 })],
  ["inode replacement", metadata({ ino: 12n, mode: 0o600 })],
  ["owner replacement", metadata({ mode: 0o600, uid: 1002n })],
  ["group replacement", metadata({ gid: 1002n, mode: 0o600 })],
  ["wrong final mode", metadata({ mode: 0o640 })],
]) {
  test(`fixed-path verifier rejects ${name} after chmod`, () => {
    const result = runVerifier({ after });
    assert.equal(result.status, 1);
    assert.deepEqual(result.modes, [CADDY_ADMIN_SOCKET_FINAL_MODE]);
  });
}

test("fixed-path verifier fails closed when lstat or chmod fails", () => {
  assert.equal(
    verifyFixedCaddyAdminSocket({
      argv: ["/usr/bin/node", helperPath],
      chmod: () => {},
      getgid: () => 1001,
      getuid: () => 1001,
      lstat: () => {
        throw new Error("missing");
      },
    }),
    1,
  );
  assert.equal(
    runVerifier({ chmodError: new Error("denied") }).status,
    1,
  );
});

test("fixed-path verifier rejects arguments and ignores environment path input", () => {
  assert.equal(
    runVerifier({
      argv: ["/usr/bin/node", helperPath, "/tmp/attacker.sock"],
    }).status,
    1,
  );
  const previous = process.env.CADDY_ADMIN_SOCKET_PATH;
  process.env.CADDY_ADMIN_SOCKET_PATH = "/tmp/attacker.sock";
  try {
    const result = runVerifier();
    assert.equal(result.status, 0);
    assert.ok(result.paths.every((path) =>
      path === CADDY_ADMIN_SOCKET_PATH ||
      path === CADDY_ADMIN_SOCKET_DIRECTORY
    ));
  } finally {
    if (previous === undefined) {
      delete process.env.CADDY_ADMIN_SOCKET_PATH;
    } else {
      process.env.CADDY_ADMIN_SOCKET_PATH = previous;
    }
  }
});

test("CLI rejection is silent and does not echo arguments or environment", () => {
  const execution = spawnSync(
    process.execPath,
    [helperPath, "/tmp/private-admin.sock"],
    {
      encoding: "utf8",
      env: {
        CADDY_ADMIN_SOCKET_PATH: "/tmp/private-admin.sock",
        PATH: process.env.PATH,
      },
    },
  );
  assert.equal(execution.status, 1);
  assert.equal(execution.stdout, "");
  assert.equal(execution.stderr, "");
});

test("templates bind the exact Unix admin path and no-force reload contract", async () => {
  const [globalOptions, dropIn, helper] = await Promise.all([
    readFile(
      resolve(
        packageRoot,
        "deploy/Caddyfile.unix-admin-global-options.template",
      ),
      "utf8",
    ),
    readFile(
      resolve(packageRoot, "deploy/caddy-unix-admin.conf.template"),
      "utf8",
    ),
    readFile(helperPath, "utf8"),
  ]);

  assert.equal(
    globalOptions,
    "{\n\tadmin unix//run/caddy/admin.sock\n}\n",
  );
  assert.equal(
    dropIn,
    [
      "[Service]",
      "RuntimeDirectory=caddy",
      "RuntimeDirectoryMode=0700",
      "RuntimeDirectoryPreserve=no",
      "ExecStartPost=/usr/bin/node /usr/local/libexec/verify-caddy-admin-socket.mjs",
      "ExecReload=",
      "ExecReload=/usr/bin/caddy reload --address unix//run/caddy/admin.sock --config /etc/caddy/Caddyfile --adapter caddyfile",
      "",
    ].join("\n"),
  );
  assert.doesNotMatch(globalOptions, /\|0600|localhost:2019|127\.0\.0\.1:2019/u);
  assert.doesNotMatch(dropIn, /--force|localhost:2019|127\.0\.0\.1:2019/u);
  assert.doesNotMatch(helper, /process\.env|readline|stdin|argv\[[2-9]\]/u);
  assert.match(helper, /CADDY_ADMIN_SOCKET_DIRECTORY_MODE = 0o700/u);
  assert.match(helper, /CADDY_ADMIN_SOCKET_INITIAL_MODE = 0o755/u);
  assert.match(helper, /CADDY_ADMIN_SOCKET_FINAL_MODE = 0o600/u);
  assert.match(helper, /isSymbolicLink\(\) === false/u);
  assert.match(helper, /after\.dev !== device/u);
  assert.match(helper, /after\.ino !== inode/u);
  assert.match(helper, /directoryAfter\.ino !== directoryInode/u);
  assert.doesNotMatch(dropIn, /^UMask=/mu);
});

test("rollback expectations remove the admin route, drop-in, helper, and socket", async () => {
  const readme = await readFile(resolve(packageRoot, "README.md"), "utf8");
  const normalizedReadme = readme.replace(/\s+/gu, " ");
  for (const expected of [
    "restore the exact prior Caddyfile",
    "remove the Unix-admin drop-in",
    "remove the fixed socket verifier",
    "remove the research route snippet",
    "restart Caddy with `admin off`",
    "research transport inactive",
  ]) {
    assert.ok(normalizedReadme.includes(expected));
  }
});
