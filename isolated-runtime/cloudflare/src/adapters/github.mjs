import { blocked } from "./helpers.mjs";

const REASON = "GITHUB_PROVIDER_PURE_CORE_EXTRACTION_REQUIRED";
export const GITHUB_BROKER_ADAPTERS = Object.freeze({
  status: blocked([], REASON),
  attest_provider_readback: blocked(
    ["record_github_provider_readback"],
    REASON,
  ),
  execute_canary: blocked([
    "consume_github_capability",
    "accept_github_tool_result",
  ], REASON),
});
