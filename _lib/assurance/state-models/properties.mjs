import * as fc from "fast-check";
import { escapedDefectFixtures, modelDefinitions, runCommands } from "./models.mjs";

const serialize = (value) => JSON.parse(JSON.stringify(value));

export function runPropertyModels(options = {}) {
  const ids = options.domains?.length ? options.domains : Object.keys(modelDefinitions);
  const numRuns = Number(options.numRuns ?? 200);
  const maxCommands = Number(options.maxCommands ?? 24);
  const results = ids.map((id) => {
    const definition = modelDefinitions[id];
    if (!definition) return { domain: id, status: "BLOCKED_INTERNAL", finding: `UNKNOWN_MODEL_DOMAIN:${id}` };
    const seed = Number(options.seeds?.[id] ?? definition.seed);
    const arbitrary = fc.array(definition.commandArbitrary(fc), { maxLength: maxCommands });
    const details = fc.check(fc.property(arbitrary, (commands) => {
      let state = definition.initial();
      for (const command of commands) {
        state = definition.apply(state, command);
        if (definition.violations(state).length) return false;
      }
      return true;
    }), {
      seed,
      numRuns,
      ...(options.path && ids.length === 1 ? { path: options.path } : {})
    });
    return {
      domain: id,
      featureId: definition.featureId,
      status: details.failed ? "BLOCKED_INTERNAL" : "MODEL_CLEAR",
      seed: details.seed,
      path: details.counterexamplePath ?? null,
      replayPath: details.failed ? `--domain=${id} --seed=${details.seed} --path=${details.counterexamplePath}` : `--domain=${id} --seed=${details.seed}`,
      minimizedCommandSequence: details.failed ? serialize(details.counterexample?.[0] ?? []) : [],
      numRuns: details.numRuns,
      numShrinks: details.numShrinks
    };
  });
  return {
    ok: results.every(({ status }) => status === "MODEL_CLEAR"),
    status: results.every(({ status }) => status === "MODEL_CLEAR") ? "MODEL_CLEAR" : "BLOCKED_INTERNAL",
    propertyCases: results.reduce((total, result) => total + (result.numRuns ?? 0), 0),
    maxCommands,
    results
  };
}

export function runEscapedDefectChecks() {
  const results = escapedDefectFixtures.map((fixture) => {
    const historical = runCommands(fixture.domain, fixture.commands, fixture.variant);
    const current = runCommands(fixture.domain, fixture.commands);
    return {
      defectId: fixture.id,
      domain: fixture.domain,
      historicalVariant: fixture.variant,
      historicalDetected: historical.violations.includes(fixture.id),
      currentModelPass: current.violations.length === 0,
      currentViolations: current.violations
    };
  });
  return {
    ok: results.every(({ historicalDetected, currentModelPass }) => historicalDetected && currentModelPass),
    fixtureCount: results.length,
    results
  };
}
