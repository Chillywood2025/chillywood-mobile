import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_SCRIPTS = new Set([
  "turn-cap.sh",
  "net-throttle.sh",
  "net-throttle-rollback.sh"
]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptRoot = resolve(__dirname, "../scripts");

export type ScriptRunResult = {
  script: string;
  args: string[];
  stdout: string;
  stderr: string;
};

function summarize(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}...[truncated]` : trimmed;
}

export async function runAllowedScript(
  scriptName: string,
  args: string[],
  env: Record<string, string | undefined>,
  timeoutMs = 15000
): Promise<ScriptRunResult> {
  if (!ALLOWED_SCRIPTS.has(scriptName)) {
    throw new Error("script_not_allowed");
  }

  const scriptPath = resolve(scriptRoot, scriptName);
  if (!scriptPath.startsWith(`${scriptRoot}/`)) {
    throw new Error("script_path_escape_blocked");
  }

  await access(scriptPath);

  return await new Promise<ScriptRunResult>((resolvePromise, reject) => {
    execFile(
      scriptPath,
      args,
      {
        timeout: timeoutMs,
        env: {
          ...process.env,
          ...env
        }
      },
      (error, stdout, stderr) => {
        const result = {
          script: scriptName,
          args,
          stdout: summarize(stdout),
          stderr: summarize(stderr)
        };

        if (error) {
          reject(Object.assign(error, { result }));
          return;
        }

        resolvePromise(result);
      }
    );
  });
}
