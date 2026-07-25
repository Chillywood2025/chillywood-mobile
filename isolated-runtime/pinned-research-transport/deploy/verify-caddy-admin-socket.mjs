#!/usr/bin/node
import {
  chmodSync,
  lstatSync,
} from "node:fs";
import { pathToFileURL } from "node:url";

export const CADDY_ADMIN_SOCKET_PATH = "/run/caddy/admin.sock";
export const CADDY_ADMIN_SOCKET_DIRECTORY = "/run/caddy";
export const CADDY_ADMIN_SOCKET_DIRECTORY_MODE = 0o700;
export const CADDY_ADMIN_SOCKET_INITIAL_MODE = 0o755;
export const CADDY_ADMIN_SOCKET_FINAL_MODE = 0o600;

const permissionMode = (metadata) => Number(metadata.mode) & 0o7777;

const validSocket = (metadata, uid, gid, mode) =>
  metadata !== null &&
  typeof metadata === "object" &&
  typeof metadata.isSocket === "function" &&
  typeof metadata.isSymbolicLink === "function" &&
  metadata.isSocket() === true &&
  metadata.isSymbolicLink() === false &&
  metadata.uid === uid &&
  metadata.gid === gid &&
  permissionMode(metadata) === mode;

const validDirectory = (metadata, uid, gid) =>
  metadata !== null &&
  typeof metadata === "object" &&
  typeof metadata.isDirectory === "function" &&
  typeof metadata.isSymbolicLink === "function" &&
  metadata.isDirectory() === true &&
  metadata.isSymbolicLink() === false &&
  metadata.uid === uid &&
  metadata.gid === gid &&
  permissionMode(metadata) === CADDY_ADMIN_SOCKET_DIRECTORY_MODE;

export const verifyFixedCaddyAdminSocket = ({
  argv = process.argv,
  chmod = chmodSync,
  getgid = process.getgid,
  getuid = process.getuid,
  lstat = (path) => lstatSync(path, { bigint: true }),
} = {}) => {
  try {
    if (
      !Array.isArray(argv) ||
      argv.length !== 2 ||
      typeof chmod !== "function" ||
      typeof getgid !== "function" ||
      typeof getuid !== "function" ||
      typeof lstat !== "function"
    ) {
      return 1;
    }

    const uid = BigInt(getuid());
    const gid = BigInt(getgid());
    const directoryBefore = lstat(CADDY_ADMIN_SOCKET_DIRECTORY);
    if (!validDirectory(directoryBefore, uid, gid)) {
      return 1;
    }
    const directoryDevice = directoryBefore.dev;
    const directoryInode = directoryBefore.ino;

    const before = lstat(CADDY_ADMIN_SOCKET_PATH);
    if (
      !validSocket(
        before,
        uid,
        gid,
        CADDY_ADMIN_SOCKET_INITIAL_MODE,
      )
    ) {
      return 1;
    }
    const device = before.dev;
    const inode = before.ino;

    chmod(CADDY_ADMIN_SOCKET_PATH, CADDY_ADMIN_SOCKET_FINAL_MODE);

    const after = lstat(CADDY_ADMIN_SOCKET_PATH);
    const directoryAfter = lstat(CADDY_ADMIN_SOCKET_DIRECTORY);
    if (
      !validSocket(
        after,
        uid,
        gid,
        CADDY_ADMIN_SOCKET_FINAL_MODE,
      ) ||
      after.dev !== device ||
      after.ino !== inode ||
      !validDirectory(directoryAfter, uid, gid) ||
      directoryAfter.dev !== directoryDevice ||
      directoryAfter.ino !== directoryInode
    ) {
      return 1;
    }
    return 0;
  } catch {
    return 1;
  }
};

const invokedAsMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsMain) {
  process.exitCode = verifyFixedCaddyAdminSocket();
}
