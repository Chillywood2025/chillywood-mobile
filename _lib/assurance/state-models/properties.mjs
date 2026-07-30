import * as fc from "fast-check";
import { escapedDefectFixtures, modelDefinitions, runCommands } from "./models.mjs";

const serialize = (value) => JSON.parse(JSON.stringify(value));
const transitionWitnesses = [
  { id: "chat-remote-media", domain: "chat-call", commands: [{ type: "invite", generation: 1, provider: "livekit" }, { type: "accept" }, { type: "issue_token" }, { type: "connect_room" }, { type: "publish_local" }, { type: "remote_participant" }, { type: "subscribe_remote" }, { type: "first_media" }], reached: (s) => s.remoteMedia },
  { id: "revenuecat-provider-authority", domain: "revenuecat", commands: [{ type: "event", eventId: "witness", eventType: "purchase", eventTime: 1, store: "apple", environment: "production", authority: "provider", appUser: "user-a", target: "user-b", product: "premium.monthly", expiresAt: 20 }], reached: (s) => s.productionAccess },
  { id: "ota-source-binding", domain: "ota-build", commands: [{ type: "install_build", platform: "android", environment: "internal", runtime: "runtime-1", channel: "internal", nativeDigest: "native-a", sourceCommit: "source-a", embeddedSafe: true, providedCapabilities: [] }, { type: "activate_update", platform: "android", environment: "internal", runtime: "runtime-1", channel: "internal", nativeDigest: "native-a", sourceCommit: "source-a", requiredCapabilities: [] }], reached: (s) => s.currentUpdate?.sourceCommit === "source-a" },
  { id: "livekit-room-to-ui", domain: "livekit", commands: ["token", "claims", "room", "publication", "remote_participant", "subscription", "first_media", "ui"].map((stage) => ({ type: "advance", stage, platform: "android", fixture: false })).concat({ type: "declare_pass" }), reached: (s) => s.pass },
  { id: "native-server-acceptance", domain: "notification-native-action", commands: [{ type: "native_answer", id: "witness", expiresAt: 5 }, { type: "auth_ready" }, { type: "react_ready" }, { type: "consume_action", id: "witness" }, { type: "server_accept", id: "witness" }], reached: (s) => s.serverStatus === "accepted" },
  { id: "migration-successor", domain: "migrations", commands: [{ type: "align_exact" }, { type: "forward_correction", version: "3", name: "successor", hash: "hash-3" }, { type: "request_merge" }], reached: (s) => s.mergeAllowed && s.forwardSuccessors.length === 1 }
];

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
    const witnesses = transitionWitnesses.filter(({ domain }) => domain === id).map(({ id: witnessId, commands, reached }) => {
      const execution = runCommands(id, commands);
      return { id: witnessId, reached: reached(execution.state), commandCount: commands.length, commands, violations: execution.violations };
    });
    const clear = !details.failed && details.numRuns > 0 && witnesses.length > 0 && witnesses.every(({ reached, violations }) => reached && violations.length === 0);
    return {
      domain: id,
      featureId: definition.featureId,
      status: clear ? "MODEL_CLEAR" : "BLOCKED_INTERNAL",
      seed: details.seed,
      path: details.counterexamplePath ?? null,
      replayPath: details.failed ? `--domain=${id} --seed=${details.seed} --path=${details.counterexamplePath}` : `--domain=${id} --seed=${details.seed}`,
      minimizedCommandSequence: details.failed ? serialize(details.counterexample?.[0] ?? []) : [],
      replayExecuted: details.numRuns > 0,
      transitionWitnesses: witnesses,
      numRuns: details.numRuns,
      numShrinks: details.numShrinks
    };
  });
  return {
    ok: results.every(({ status }) => status === "MODEL_CLEAR"),
    status: results.every(({ status }) => status === "MODEL_CLEAR") ? "MODEL_CLEAR" : "BLOCKED_INTERNAL",
    propertyCases: results.reduce((total, result) => total + (result.numRuns ?? 0), 0),
    maxCommands,
    witnessCount: results.reduce((total, result) => total + (result.transitionWitnesses?.length ?? 0), 0),
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
