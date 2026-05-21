import {
  CREATOR_UPLOAD_ACKNOWLEDGEMENT,
  LEGAL_POLICIES as RAW_LEGAL_POLICIES,
  LEGAL_POLICY_BY_PATH,
  LEGAL_POLICY_BY_SLUG,
  LEGAL_PUBLIC_BASE_URL,
  LEGAL_SUPPORT_EMAIL,
  LIVE_REPLAY_ACKNOWLEDGEMENT,
  countPolicyWords,
  getLegalPolicy,
  getPolicyText,
} from "../legal/policies.mjs";

export type LegalPolicySection = {
  heading: string;
  paragraphs: string[];
};

export type LegalPolicy = {
  effectiveDate: string;
  path: string;
  sections: LegalPolicySection[];
  slug: string;
  summary: string;
  title: string;
  version: string;
};

export {
  CREATOR_UPLOAD_ACKNOWLEDGEMENT,
  LEGAL_POLICY_BY_PATH,
  LEGAL_POLICY_BY_SLUG,
  LEGAL_PUBLIC_BASE_URL,
  LEGAL_SUPPORT_EMAIL,
  LIVE_REPLAY_ACKNOWLEDGEMENT,
  countPolicyWords,
  getLegalPolicy,
  getPolicyText,
};

export const LEGAL_POLICIES = RAW_LEGAL_POLICIES as LegalPolicy[];

export const LEGAL_POLICY_ROUTES = LEGAL_POLICIES.map((policy) => ({
  path: policy.path,
  slug: policy.slug,
  title: policy.title,
  summary: policy.summary,
  wordCount: countPolicyWords(policy),
}));

export const REQUIRED_LEGAL_POLICY_SLUGS = LEGAL_POLICIES.map((policy) => policy.slug);
