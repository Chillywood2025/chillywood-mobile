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

export const LEGAL_DOCUMENT_KEYS = ["terms", "privacy", "community_guidelines", "creator_terms", "money_terms"] as const;

export type LegalDocumentKey = typeof LEGAL_DOCUMENT_KEYS[number];

const LEGAL_DOCUMENT_POLICY_SLUG: Record<LegalDocumentKey, string> = {
  terms: "terms", privacy: "privacy", community_guidelines: "community-guidelines",
  creator_terms: "creator-rules", money_terms: "creator-monetization",
};

export const ACCOUNT_LEGAL_DOCUMENT_KEYS: readonly LegalDocumentKey[] = ["terms", "privacy", "community_guidelines"];

export const LEGAL_DOCUMENTS = LEGAL_DOCUMENT_KEYS.map((documentKey) => {
  const policy = getLegalPolicy(LEGAL_DOCUMENT_POLICY_SLUG[documentKey]);
  if (!policy) throw new Error(`Missing bundled legal policy for ${documentKey}.`);
  return { documentKey, path: policy.path, title: policy.title, version: policy.version };
});

export const getLegalDocument = (documentKey: LegalDocumentKey) => (
  LEGAL_DOCUMENTS.find((document) => document.documentKey === documentKey) ?? null
);
