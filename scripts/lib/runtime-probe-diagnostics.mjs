import { constants } from "node:os";
import { stripVTControlCharacters } from "node:util";

export const MAX_PROBE_STDERR_BYTES = 4096;
const truncationMarker = "\n[stderr truncated]";
const credentialLine =
  /api[\s_-]?key|secret|token|password|passwd|\bpwd\b|authorization|credential|cookie|private[\s_-]?key|(?:service[\s_-]?role|anon|access)[\s_-]?key|(?:database|connection)[\s_-]?(?:url|string)|\bdsn\b|\b[\w-]*(?:key|auth)[\w-]*["']?\s*[:=]|\b(?:bearer|basic)\s+\S+|\b[a-z][a-z0-9+.-]*:\/\/[^\s/]*@/i;
const knownToken =
  /\b(?:npm_[a-z0-9]+|gh[pousr]_[a-z0-9]+|github_pat_[a-z0-9_]+|sk-[a-z0-9_-]{16,}|[spr]k_(?:live|test)_[a-z0-9]+|sb_(?:secret|publishable)_[a-z0-9_-]+|whsec_[a-z0-9]+|xox[baprs]-[a-z0-9-]+|(?:AKIA|ASIA)[A-Z0-9]{16}|AIza[a-z0-9_-]{20,}|ya29\.[a-z0-9_-]+|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+)\b/i;

function redactStderr(stderr) {
  if (typeof stderr !== "string") return "";
  // Remove presentation controls before matching, so they cannot split labels.
  const plain = stripVTControlCharacters(stderr)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(
      /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?(?:-----END [A-Z0-9 ]+-----|$)/gi,
      "[redacted PEM block]",
    );
  return plain
    .split("\n")
    .map((line) => {
      if (credentialLine.test(line) || knownToken.test(line)) {
        return "[redacted credential-bearing line]";
      }
      return line.replace(
        /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]+/gi,
        "[redacted URL]",
      );
    })
    .join("\n")
    .trim();
}

function boundStderr(stderr) {
  const bytes = Buffer.from(stderr, "utf8");
  if (bytes.length <= MAX_PROBE_STDERR_BYTES) return stderr;
  let end = MAX_PROBE_STDERR_BYTES - Buffer.byteLength(truncationMarker);
  // Do not cut a multibyte character or exceed the bound with a replacement.
  while ((bytes[end] & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end).toString("utf8") + truncationMarker;
}

export function formatRuntimeProbeFailure(runtime) {
  const status = Number.isInteger(runtime.status) ? runtime.status : "null";
  const signal = Object.hasOwn(constants.signals, runtime.signal)
    ? runtime.signal
    : runtime.signal == null ? "none" : "unknown";
  const code = runtime.error?.code;
  const errorCode = Object.hasOwn(constants.errno, code)
    ? code
    : code == null ? "none" : "unknown";
  // Never inspect stdout, the environment, or error.message. Redact the whole
  // captured stderr before truncating, including labels beyond the output cap.
  const stderr = boundStderr(redactStderr(runtime.stderr));
  return `Deno runtime policy probe must pass (status=${status}; signal=${signal}; error.code=${errorCode})\nstderr:\n${stderr || "[empty]"}`;
}
