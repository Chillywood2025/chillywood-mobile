export type LegalPolicySection = {
  heading: string;
  paragraphs: string[];
};

export type LegalPolicy = {
  effectiveDate: string;
  path: string;
  slug: string;
  summary: string;
  title: string;
  version: string;
  sections: LegalPolicySection[];
};

export const LEGAL_EFFECTIVE_DATE: string;
export const LEGAL_VERSION: string;
export const LEGAL_SUPPORT_EMAIL: string;
export const LEGAL_PUBLIC_BASE_URL: string;
export const CREATOR_UPLOAD_ACKNOWLEDGEMENT: string;
export const LIVE_REPLAY_ACKNOWLEDGEMENT: string;
export const LEGAL_POLICIES: LegalPolicy[];
export const LEGAL_POLICY_BY_SLUG: Record<string, LegalPolicy>;
export const LEGAL_POLICY_BY_PATH: Record<string, LegalPolicy>;
export function getLegalPolicy(slug: string): LegalPolicy | null;
export function getPolicyText(policy: LegalPolicy | null | undefined): string;
export function countPolicyWords(policy: LegalPolicy | null | undefined): number;
export function policyHasText(policy: LegalPolicy | null | undefined, search: string): boolean;

