import { createScopedDatabasePort } from "./database-core.mjs";
import { BASELINE_STATEMENTS } from "./database-statements/baseline.mjs";
import { SENTINEL_STATEMENTS } from "./database-statements/sentinel.mjs";
import { TRIAGE_STATEMENTS } from "./database-statements/triage.mjs";

const DOMAIN_STATEMENTS = Object.freeze({
  ...BASELINE_STATEMENTS,
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
