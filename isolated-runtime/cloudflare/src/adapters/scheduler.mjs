import { blocked } from "./helpers.mjs";

const REASON = "SCHEDULER_PURE_CORE_EXTRACTION_REQUIRED";
export const SCHEDULER_ADAPTERS = Object.freeze({
  evaluate_prerequisites: blocked(["read_scheduler_status"], REASON),
  dispatch_occurrence: blocked([
    "read_scheduler_status",
    "issue_recurring_child_task",
  ], REASON),
});
