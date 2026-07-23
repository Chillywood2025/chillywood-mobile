import {
  classifyCanonicalSecurityPayload,
  type CanonicalSecurityPolicy,
} from "../_lib/cognitivePolicyEngine.ts";
import corpusJson from "../config/intelligence/cognitive-security-regression-corpus.json" with {
  type: "json",
};
import policyJson from "../config/intelligence/cognitive-security-classification-policy.json" with {
  type: "json",
};

const policy = policyJson as CanonicalSecurityPolicy;
const cases = corpusJson.cases.map((fixture) => ({
  classification: classifyCanonicalSecurityPayload(fixture.value, policy),
  id: fixture.id,
}));

console.log(JSON.stringify(cases));
