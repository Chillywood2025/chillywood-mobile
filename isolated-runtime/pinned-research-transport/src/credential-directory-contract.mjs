export const CURRENT_CREDENTIAL_DIRECTORY_ABI =
  "chillywood-systemd-fixed-user-ephemeral-0400-v1";
export const CURRENT_CREDENTIAL_DIRECTORY_PATH =
  "/run/chillywood-research-transport-runtime";

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
    credentialDirectoryAbi !== CURRENT_CREDENTIAL_DIRECTORY_ABI ||
    credentialDirectoryPath !== CURRENT_CREDENTIAL_DIRECTORY_PATH ||
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
