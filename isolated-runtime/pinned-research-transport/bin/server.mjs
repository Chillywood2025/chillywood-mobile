import { readFile, stat } from "node:fs/promises";

import {
  createPinnedResearchHostServer,
} from "../src/host-service.mjs";

export const validateResearchHostConfiguration = (environment) => {
  const credentialDirectory = environment.CREDENTIALS_DIRECTORY;
  const credentialDirectoryAbi =
    environment.COGNITIVE_RESEARCH_TRANSPORT_CREDENTIAL_DIRECTORY_ABI;
  const credentialDirectoryPath =
    environment.COGNITIVE_RESEARCH_TRANSPORT_CREDENTIAL_DIRECTORY_PATH;
  const sourceCommit =
    environment.COGNITIVE_RESEARCH_TRANSPORT_SOURCE_COMMIT;
  const sourceTree =
    environment.COGNITIVE_RESEARCH_TRANSPORT_SOURCE_TREE;
  const releaseManifestSha256 =
    environment.COGNITIVE_RESEARCH_TRANSPORT_RELEASE_MANIFEST_SHA256;
  if (
    typeof credentialDirectory !== "string" ||
    credentialDirectoryAbi !==
      "chillywood-systemd-fixed-user-ephemeral-0400-v1" ||
    credentialDirectoryPath !==
      "/run/chillywood-research-transport-runtime" ||
    credentialDirectory !== credentialDirectoryPath ||
    typeof sourceCommit !== "string" ||
    !/^[a-f0-9]{40}$/u.test(sourceCommit) ||
    typeof sourceTree !== "string" ||
    !/^[a-f0-9]{40}$/u.test(sourceTree) ||
    typeof releaseManifestSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(releaseManifestSha256)
  ) {
    throw new Error("research_host_configuration_rejected");
  }
  return Object.freeze({
    credentialDirectory,
    releaseManifestSha256,
    sourceCommit,
    sourceTree,
  });
};

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
