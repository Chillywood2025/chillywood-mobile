import { blocked } from "./helpers.mjs";

const REASON = "RESEARCH_NETWORK_PURE_CORE_EXTRACTION_REQUIRED";
export const PUBLIC_RESEARCH_BROKER_ADAPTERS = Object.freeze({
  retrieve_source: blocked(["record_research_source"], REASON),
  record_claim: blocked(["record_research_claim"], REASON),
  detect_contradiction: blocked(["detect_research_contradiction"], REASON),
  expire_public_memory: blocked(["expire_research"], REASON),
});
