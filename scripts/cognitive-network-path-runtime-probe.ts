import {
  classifySensitiveRepositoryPath,
  validateCanonicalResearchUrl,
  validateResolvedResearchAddresses,
  type CanonicalNetworkPolicy,
  type SensitivePathPolicy,
} from "../_lib/cognitivePolicyEngine.ts";
import { validateLexicalRepositoryPath } from "../_lib/cognitivePlatformFoundation.ts";
import networkPolicyJson from "../config/intelligence/cognitive-network-policy.json" with {
  type: "json",
};
import pathPolicyJson from "../config/intelligence/cognitive-sensitive-path-policy.json" with {
  type: "json",
};

const networkPolicy = networkPolicyJson as CanonicalNetworkPolicy;
const pathPolicy = pathPolicyJson as SensitivePathPolicy;
const pathFixtures = [
  "docs/.env",
  "docs/.AWS/credentials.old",
  "docs/.config/gcloud/application_default_credentials.json.copy",
  "docs/intelligence/safe.md",
  "docs/..%252f.env",
  "docs/ＮＥＳＴＥＤ/.ＳＳＨ/id_ed25519",
  "docs/.cargo/credentials.toml",
  "docs/.yarnrc.yml",
  "docs/.pypirc",
  "docs/.gem/credentials",
  "config/npm-token.txt",
  "config/npm_token.txt",
  "config/.npm-token",
  "config/yarn-token.txt",
  "config/github-token.txt",
] as const;

const result = {
  paths: pathFixtures.map((value) => [
    value,
    classifySensitiveRepositoryPath(value, pathPolicy),
  ]),
  executorPaths: pathFixtures.map((value) => [
    value,
    validateLexicalRepositoryPath(value),
  ]),
  peers: [
    [["93.184.216.34"], "93.184.216.34"],
    [["93.184.216.34"], "127.0.0.1"],
    [["10.0.0.1"], "10.0.0.1"],
  ].map(([resolved, peer]) => [
    resolved,
    peer,
    validateResolvedResearchAddresses(
      resolved as string[],
      peer as string,
      networkPolicy,
    ),
  ]),
  urls: [
    "https://example.com/",
    "https://metadata.google.internal/",
    "https://127.0.0.1/",
    "https://2130706433/",
    "https://0x7f000001/",
    "https://0177.0.0.1/",
    "https://[::ffff:127.0.0.1]/",
    "https://example.com.:443/",
    "http://example.com/",
    "https://user:synthetic@example.com/",
  ].map((value) => [
    value,
    validateCanonicalResearchUrl(value, networkPolicy),
  ]),
};

console.log(JSON.stringify(result));
