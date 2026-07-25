import { createScopedDatabasePort } from "./database-core.mjs";
import { BASELINE_STATEMENTS } from "./database-statements/baseline.mjs";
import { EVALUATOR_STATEMENTS } from "./database-statements/evaluator.mjs";
import { GITHUB_STATEMENTS } from "./database-statements/github.mjs";
import { LIVEKIT_STATEMENTS } from "./database-statements/livekit.mjs";
import { MODEL_STATEMENTS } from "./database-statements/model.mjs";
import { RESEARCH_BROKER_STATEMENTS } from "./database-statements/research-broker.mjs";
import { RESEARCH_EVALUATOR_STATEMENTS } from "./database-statements/research-evaluator.mjs";
import { SCHEDULER_STATEMENTS } from "./database-statements/scheduler.mjs";
import { SENTINEL_STATEMENTS } from "./database-statements/sentinel.mjs";
import { TRIAGE_STATEMENTS } from "./database-statements/triage.mjs";

const DOMAIN_STATEMENTS = Object.freeze({
  ...BASELINE_STATEMENTS,
  ...EVALUATOR_STATEMENTS,
  ...GITHUB_STATEMENTS,
  ...LIVEKIT_STATEMENTS,
  ...MODEL_STATEMENTS,
  ...RESEARCH_BROKER_STATEMENTS,
  ...RESEARCH_EVALUATOR_STATEMENTS,
  ...SCHEDULER_STATEMENTS,
  ...SENTINEL_STATEMENTS,
  ...TRIAGE_STATEMENTS,
});

export const STATEMENT_INVENTORY = Object.freeze(
  Object.fromEntries(
    Object.entries(DOMAIN_STATEMENTS).map(([id, statement]) => [
      id,
      Object.freeze({ arity: statement.arity }),
    ]),
  ),
);

// Aggregate test-only constructor. Generated Worker entrypoints import one
// principal-specific statement module instead.
export const createDatabasePort = (options) =>
  createScopedDatabasePort({
    ...options,
    domainStatements: DOMAIN_STATEMENTS,
  });
