import { blocked } from "./helpers.mjs";

const REASON = "RESEARCH_EVALUATOR_PURE_CORE_EXTRACTION_REQUIRED";
export const RESEARCH_EVALUATOR_ADAPTERS = Object.freeze({
  evaluate_research_claim: blocked([
    "read_research_snapshot",
    "derive_research_evaluation",
  ], REASON),
  evaluate_contradiction_resolution: blocked([
    "read_research_snapshot",
    "resolve_research_contradiction",
  ], REASON),
});
