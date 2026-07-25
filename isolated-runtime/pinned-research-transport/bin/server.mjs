import { readFile, stat } from "node:fs/promises";

import {
  createPinnedResearchHostServer,
} from "../src/host-service.mjs";
import {
  validateResearchHostConfiguration,
} from "../src/credential-directory-contract.mjs";

export { validateResearchHostConfiguration };

const main = async () => {
  const {
    credentialDirectory,
    releaseManifestSha256,
    sourceCommit,
    sourceTree,
  } = validateResearchHostConfiguration(process.env);
  const keyPath = `${credentialDirectory}/research_transport_hmac`;
  const metadata = await stat(keyPath);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new Error("research_host_credential_permissions_rejected");
  }
  const hmacKey = (await readFile(keyPath, "utf8")).trim();
  const server = createPinnedResearchHostServer({
    hmacKey,
    logger: console,
    releaseManifestSha256,
    sourceCommit,
    sourceTree,
  });
  server.listen(4319, "127.0.0.1");
  const close = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(
      `${
        error instanceof Error
          ? error.message
          : "research_host_startup_rejected"
      }\n`,
    );
    process.exitCode = 1;
  });
}
