import { GITHUB_BROKER_ADAPTERS } from "./adapters/github.mjs";
import { LIVEKIT_COLLECTOR_ADAPTERS } from "./adapters/livekit.mjs";
import { MODEL_ROUTER_ADAPTERS } from "./adapters/model.mjs";
import { PRODUCT_BASELINE_ADAPTERS } from "./adapters/baseline.mjs";
import { PRODUCT_QUALITY_EVALUATOR_ADAPTERS } from "./adapters/evaluator.mjs";
import { PRODUCT_QUALITY_TRIAGE_ADAPTERS } from "./adapters/triage.mjs";
import { PUBLIC_RESEARCH_BROKER_ADAPTERS } from "./adapters/research-broker.mjs";
import { RESEARCH_EVALUATOR_ADAPTERS } from "./adapters/research-evaluator.mjs";
import { SCHEDULER_ADAPTERS } from "./adapters/scheduler.mjs";
import { SENTINEL_COLLECTOR_ADAPTERS } from "./adapters/sentinel.mjs";

export {
  GITHUB_BROKER_ADAPTERS,
  LIVEKIT_COLLECTOR_ADAPTERS,
  MODEL_ROUTER_ADAPTERS,
  PRODUCT_BASELINE_ADAPTERS,
  PRODUCT_QUALITY_EVALUATOR_ADAPTERS,
  PRODUCT_QUALITY_TRIAGE_ADAPTERS,
  PUBLIC_RESEARCH_BROKER_ADAPTERS,
  RESEARCH_EVALUATOR_ADAPTERS,
  SCHEDULER_ADAPTERS,
  SENTINEL_COLLECTOR_ADAPTERS,
};

export const OPERATION_ADAPTERS = Object.freeze({
  cognitive_github_draft_pr_broker: GITHUB_BROKER_ADAPTERS,
  cognitive_level01_scheduler: SCHEDULER_ADAPTERS,
  cognitive_livekit_experience_collector: LIVEKIT_COLLECTOR_ADAPTERS,
  cognitive_model_router: MODEL_ROUTER_ADAPTERS,
  cognitive_product_baseline_executor: PRODUCT_BASELINE_ADAPTERS,
  cognitive_product_quality_evaluator: PRODUCT_QUALITY_EVALUATOR_ADAPTERS,
  cognitive_product_quality_triage: PRODUCT_QUALITY_TRIAGE_ADAPTERS,
  cognitive_public_research_broker: PUBLIC_RESEARCH_BROKER_ADAPTERS,
  cognitive_research_evaluator: RESEARCH_EVALUATOR_ADAPTERS,
  cognitive_sentinel_collector: SENTINEL_COLLECTOR_ADAPTERS,
});

export const operationAdapter = (principal, operation) =>
  OPERATION_ADAPTERS[principal]?.[operation] ?? null;
