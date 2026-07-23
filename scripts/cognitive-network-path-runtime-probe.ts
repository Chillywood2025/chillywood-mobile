import {
  classifySensitiveRepositoryPath,
  validateCanonicalResearchUrl,
  validateResolvedResearchAddresses,
  type CanonicalNetworkPolicy,
  type SensitivePathPolicy,
} from "../_lib/cognitivePolicyEngine.ts";
import networkPolicyJson from "../config/intelligence/cognitive-network-policy.json" with {
  type: "json",
};
import pathPolicyJson from "../config/intelligence/cognitive-sensitive-path-policy.json" with {
  type: "json",
};

const networkPolicy = networkPolicyJson as CanonicalNetworkPolicy;
const pathPolicy = pathPolicyJson as SensitivePathPolicy;

const result = {
  paths: [
    ".env",
    "nested/.AWS/credentials.old",
    ".config/gcloud/application_default_credentials.json.copy",
    "docs/intelligence/safe.md",
    "..%252f.env",
    "ＮＥＳＴＥＤ/.ＳＳＨ/id_ed25519",
  ].map((value) => [
    value,
    classifySensitiveRepositoryPath(value, pathPolicy),
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
