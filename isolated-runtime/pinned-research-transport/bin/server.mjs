import { readFile, stat } from "node:fs/promises";

import {
  createPinnedResearchHostServer,
} from "../src/host-service.mjs";

const credentialDirectory = process.env.CREDENTIALS_DIRECTORY;
const sourceCommit =
  process.env.COGNITIVE_RESEARCH_TRANSPORT_SOURCE_COMMIT;
const sourceTree =
  process.env.COGNITIVE_RESEARCH_TRANSPORT_SOURCE_TREE;
const releaseManifestSha256 =
  process.env.COGNITIVE_RESEARCH_TRANSPORT_RELEASE_MANIFEST_SHA256;
if (
  typeof credentialDirectory !== "string" ||
  !credentialDirectory.startsWith("/run/credentials/") ||
  typeof sourceCommit !== "string" ||
  !/^[a-f0-9]{40}$/u.test(sourceCommit) ||
  typeof sourceTree !== "string" ||
  !/^[a-f0-9]{40}$/u.test(sourceTree) ||
  typeof releaseManifestSha256 !== "string" ||
  !/^[a-f0-9]{64}$/u.test(releaseManifestSha256)
) {
  throw new Error("research_host_configuration_rejected");
}
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
