import { blocked } from "./helpers.mjs";

const REASON = "LIVEKIT_CLASSIFIER_PURE_CORE_EXTRACTION_REQUIRED";
export const LIVEKIT_COLLECTOR_ADAPTERS = Object.freeze({
  prepare_run: blocked([], REASON),
  record_run: blocked(["collect_livekit_sentinel_run"], REASON),
});
