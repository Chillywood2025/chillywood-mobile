import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)), "..", "..");
try {
  execFileSync("git", [
    "diff",
    "--exit-code",
    "--",
    "isolated-runtime/cloudflare/generated",
  ], { cwd: root, stdio: "inherit" });
} catch {
  throw new Error("isolated_runtime_generated_artifacts_drifted");
}
