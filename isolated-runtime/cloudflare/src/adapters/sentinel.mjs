import { ready } from "./helpers.mjs";

export const SENTINEL_COLLECTOR_ADAPTERS = Object.freeze({
  collect_sentinel_run: ready(
    ["collect_sentinel_run"],
    ({ database, env, payload }) =>
      database.call("collectSentinelRun", [
        payload.taskId,
        payload.projectId,
        payload.platform,
        payload.environment,
        payload.sentinelKey,
        payload.routeOrSurface,
        payload.runtimeIdentityHash,
        payload.sourceBuildHash,
        payload.evidenceManifestHash,
        JSON.stringify(payload.metricManifest),
        payload.resultStatus,
        payload.physicalProofStatus,
        payload.observationStartedAt,
        payload.observationFinishedAt,
        payload.evaluationExpiresAt,
        payload.collectionIdempotencyHash,
        env.COGNITIVE_SENTINEL_COLLECTOR_ASSERTION,
      ]),
  ),
  preflight_visual_sentinel_collection: ready(
    ["preflight_visual_sentinel_collection"],
    ({ database, env, payload }) =>
      database.call("preflightVisualSentinelCollection", [
        payload.taskId,
        payload.projectId,
        payload.platform,
        payload.environment,
        payload.sentinelKey,
        payload.routeOrSurface,
        payload.runtimeIdentityHash,
        payload.sourceBuildHash,
        payload.evidenceManifestHash,
        JSON.stringify(payload.metricManifest),
        payload.resultStatus,
        payload.physicalProofStatus,
        payload.observationStartedAt,
        payload.observationFinishedAt,
        payload.evaluationExpiresAt,
        payload.collectionIdempotencyHash,
        env.COGNITIVE_SENTINEL_COLLECTOR_ASSERTION,
      ]),
  ),
  preflight_visual_generic_manifest_predicates: ready(
    ["preflight_visual_generic_manifest_predicates"],
    ({ database, payload }) =>
      database.call("preflightVisualGenericManifestPredicates", [
        payload.sentinelKey,
        payload.evidenceManifestHash,
        JSON.stringify(payload.metricManifest),
      ]),
  ),
});
