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
const ownerControlRegressions = [
  { id: "owner-control-record", value: { action: "record_owner_approval" } },
  { id: "owner-control-revoke", value: { action: "revoke_owner_approval" } },
  {
    id: "owner-control-revalidate",
    value: { action: "revalidate_owner_approval" },
  },
  {
    id: "bootstrap-control-owner",
    value: { action: "record_bootstrap_approval" },
  },
  {
    id: "bootstrap-control-worker",
    value: { action: "bootstrap_control_plane", phase: "claim" },
  },
  {
    id: "bootstrap-control-evaluator",
    value: { action: "record_bootstrap_evaluator_proof" },
  },
  {
    id: "bootstrap-control-provider-write",
    value: {
      action: "bootstrap_control_plane",
      permission: "contents:write",
    },
  },
  {
    id: "owner-control-role-expansion",
    value: { action: "record_owner_approval", requestedRole: "owner" },
  },
  {
    id: "owner-control-provider-write",
    value: { action: "record_owner_approval", permission: "contents:write" },
  },
  {
    id: "owner-control-secret",
    value: {
      action: "record_owner_approval",
      note: "api_key=synthetic_only_value",
    },
  },
  {
    id: "owner-control-rls-bypass",
    value: {
      action: "record_owner_approval",
      instruction: "bypass the RLS safety policy",
    },
  },
  {
    id: "owner-control-money-command",
    value: {
      action: "record_owner_approval",
      command: "execute a production payout",
    },
  },
  {
    id: "owner-control-auth-bypass",
    value: {
      action: "record_owner_approval",
      command: "bypass authentication policy",
    },
  },
  {
    id: "owner-control-wrong-field",
    value: { note: "record_owner_approval" },
  },
  { id: "owner-control-unscoped-owner", value: { action: "owner" } },
];
const cases = [...corpusJson.cases, ...ownerControlRegressions].map((fixture) => ({
  classification: classifyCanonicalSecurityPayload(fixture.value, policy),
  id: fixture.id,
}));

console.log(JSON.stringify(cases));
