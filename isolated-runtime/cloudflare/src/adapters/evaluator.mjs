import { blocked } from "./helpers.mjs";

const REASON = "EVALUATOR_PURE_CORE_EXTRACTION_REQUIRED";
export const PRODUCT_QUALITY_EVALUATOR_ADAPTERS = Object.freeze({
  evaluate_product_baseline_selection: blocked(
    ["evaluate_product_baseline"],
    REASON,
  ),
  evaluate_sentinel_detection: blocked([
    "read_product_quality_snapshot",
    "read_active_baseline",
    "compute_detection_hash",
    "record_sentinel_evaluator_proof",
  ], REASON),
  evaluate_sentinel_resolution: blocked([
    "read_product_quality_snapshot",
    "read_active_baseline",
    "compute_resolution_hash",
    "record_sentinel_evaluator_proof",
  ], REASON),
});
