import { blocked } from "./helpers.mjs";

export const MODEL_ROUTER_ADAPTERS = Object.freeze({
  assess_sanitized_evidence: blocked([
    "recover_model_reservation",
    "reserve_model_invocation",
    "settle_model_invocation",
  ], "MODEL_PROVIDER_PURE_CORE_EXTRACTION_REQUIRED"),
});
