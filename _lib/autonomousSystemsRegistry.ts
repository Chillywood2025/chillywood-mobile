export type AutonomousSystemId = "livekit_operator" | "media_automation";

export type AutonomousActivationMode =
  | "off"
  | "dry_run"
  | "manual_cli"
  | "bounded_run"
  | "limited_scheduled_if_approved"
  | "limited_scheduled_probe"
  | "limited_scheduled_safe_recovery";

export type AutonomousApprovalLevel = 0 | 1 | 2 | 3 | 4;

export type AutonomousSystemSurface = {
  id: string;
  approvalLevel: AutonomousApprovalLevel;
  allowedReadScope: readonly string[];
  allowedWriteScope: readonly string[];
  forbiddenScope: readonly string[];
  proofScript: string;
  guardScript: string;
  rollbackBehavior: string;
  killSwitchOrFallback: string;
  ownerApprovalRequired: boolean;
};

export type AutonomousSystemContract = {
  id: AutonomousSystemId;
  displayName: string;
  status: string;
  activationModes: readonly AutonomousActivationMode[];
  activeActivationMode: AutonomousActivationMode;
  schedulerStatus: string;
  allowedSurfaces: readonly string[];
  allowedWrites: readonly string[];
  forbidden: readonly string[];
  requiredGates: readonly string[];
  requiredProofScripts: readonly string[];
  requiredGuardScripts: readonly string[];
  surfaces: readonly AutonomousSystemSurface[];
};

export const AUTONOMOUS_SYSTEM_EXPANSION_RULES = [
  "system id",
  "action/surface id",
  "activation mode",
  "allowed read scope",
  "allowed write scope",
  "forbidden scope",
  "approval level",
  "proof script",
  "guard script",
  "rollback/quarantine behavior",
  "kill switch/fallback behavior",
  "owner/admin approval requirement for Level 3/4",
] as const;

export const AUTONOMOUS_HIGH_RISK_DOMAINS = [
  "auth/RLS",
  "billing/provider",
  "Premium entitlement",
  "payout/cashout",
  "destructive DB",
  "public/private exposure",
  "app store/public release",
  "provider plan/add-on",
] as const;

export const AUTONOMOUS_SYSTEMS_REGISTRY = [
  {
    id: "media_automation",
    displayName: "Media Autonomous System",
    status: "bounded_source_and_cli_automation_with_object_storage_shutdown_readiness_closed",
    activeActivationMode: "bounded_run",
    schedulerStatus: "no_daemon_no_cron_no_queue_processor_enabled",
    activationModes: ["off", "dry_run", "manual_cli", "bounded_run", "limited_scheduled_if_approved"],
    allowedSurfaces: [
      "media scan",
      "catalog readiness",
      "auto-detect planning",
      "source-aware rendition ladder",
      "transcode worker",
      "media_renditions audit",
      "R2 public/free playback",
      "Premium protected HD rows",
      "object-storage R2 migration/readiness",
      "backup/restore",
    ],
    allowedWrites: [
      "scoped media_transcode_jobs",
      "scoped media_renditions",
      "scan result writes through trusted scanner authority",
      "migration audit/resolution metadata",
      "private backup/export artifacts",
    ],
    forbidden: [
      "private/Premium/original public exposure",
      "unscanned/moderation-blocked processing",
      "broad uncapped backfill",
      "fake audit pass",
      "deleting private source objects without approval",
      "billing/Premium/auth/RLS/payout changes",
    ],
    requiredGates: [
      "backup/restore",
      "scan/moderation",
      "audit before trust",
      "rollback/quarantine",
      "kill switch/emergency stop",
      "fallback",
      "secret scan",
    ],
    requiredProofScripts: [
      "proof:media-automation-controller",
      "proof:media-automation-cli",
      "proof:media-object-storage-zero-hetzner",
    ],
    requiredGuardScripts: [
      "guard:autonomous-operating-model",
      "guard:media-delivery-architecture",
      "guard:media-object-storage-migration",
      "guard:vod-quality-policy",
    ],
    surfaces: [
      {
        id: "safe_media_scan_and_catalog_readiness",
        approvalLevel: 1,
        allowedReadScope: ["candidate media metadata", "scanner readiness metadata"],
        allowedWriteScope: ["trusted scanner result writes", "readiness audit metadata"],
        forbiddenScope: ["private source exposure", "manual Premium grant", "auth/RLS mutation"],
        proofScript: "proof:media-scan-automation",
        guardScript: "guard:media-delivery-architecture",
        rollbackBehavior: "mark affected candidates blocked/quarantined through scanner policy",
        killSwitchOrFallback: "media automation emergency stop and signed-origin fallback",
        ownerApprovalRequired: false,
      },
      {
        id: "bounded_public_transcode_and_rendition_audit",
        approvalLevel: 2,
        allowedReadScope: ["public-safe source metadata", "clean scan/moderation status"],
        allowedWriteScope: ["scoped media_transcode_jobs", "scoped media_renditions"],
        forbiddenScope: ["private/Premium/original public CDN", "broad uncapped backfill"],
        proofScript: "proof:media-automation-cli",
        guardScript: "guard:media-delivery-architecture",
        rollbackBehavior: "scoped rollback plan and quarantine for failed rows",
        killSwitchOrFallback: "media automation pause/emergency-stop and signed-origin fallback",
        ownerApprovalRequired: false,
      },
      {
        id: "object_storage_migration_and_shutdown_readiness",
        approvalLevel: 2,
        allowedReadScope: ["redacted storage metadata", "backend verified object inventory"],
        allowedWriteScope: ["migration audit/resolution metadata", "private R2 backup/export artifacts"],
        forbiddenScope: ["delete Hetzner objects", "touch Hetzner LiveKit", "fake R2 objects"],
        proofScript: "proof:media-object-storage-zero-hetzner",
        guardScript: "guard:media-object-storage-migration",
        rollbackBehavior: "retain Hetzner read fallback until owner shutdown decision",
        killSwitchOrFallback: "migration fallback retention and no-delete gate",
        ownerApprovalRequired: false,
      },
      {
        id: "broad_media_backfill_or_new_scheduler",
        approvalLevel: 3,
        allowedReadScope: ["explicitly approved catalog scope"],
        allowedWriteScope: ["owner-approved bounded writes only"],
        forbiddenScope: ["uncapped production backfill", "new daemon without approval"],
        proofScript: "proof:autonomous-systems-contract",
        guardScript: "guard:autonomous-systems-contract",
        rollbackBehavior: "owner-approved rollback/quarantine plan required before execution",
        killSwitchOrFallback: "owner-approved emergency stop required before execution",
        ownerApprovalRequired: true,
      },
    ],
  },
  {
    id: "livekit_operator",
    displayName: "LiveKit Autonomous Operator",
    status: "limited_scheduled_safe_recovery_active_systemd_timer",
    activeActivationMode: "limited_scheduled_safe_recovery",
    schedulerStatus: "chillywood-livekit-operator-watch-once.timer_every_5_minutes",
    activationModes: ["manual_cli", "limited_scheduled_probe", "limited_scheduled_safe_recovery"],
    allowedSurfaces: [
      "live_stage",
      "watch_party_live",
      "party_room_live_sidecar",
      "chat_call",
      "livekit_token",
      "livekit_router",
      "heartbeat_monitor",
      "host_agent",
      "render_telemetry",
    ],
    allowedWrites: [
      "livekit_operator_events",
      "livekit_surface_health_snapshots",
      "livekit_operator_recovery_actions",
      "livekit_operator_learning_state",
      "legitimate heartbeat monitor invocation",
      "scoped safe recovery audit",
    ],
    forbidden: [
      "fake heartbeat",
      "stale cutoff loosening",
      "broad DB mutation",
      "marking unhealthy server active without host proof",
      "secret rotation",
      "TURN credential changes",
      "provider/server replacement",
      "Premium bypass",
      "R2/media writes",
      "auto-source OTA without policy gate",
    ],
    requiredGates: [
      "narrow token",
      "constant-time token validation",
      "RLS/client-write deny",
      "audit every action",
      "safe recovery only",
      "learning cannot override Level 3/4 owner approval",
      "scheduler status must match actual installed systemd/GitHub/Cloudflare state",
    ],
    requiredProofScripts: [
      "proof:livekit-autonomous-operator",
      "proof:livekit-surface-health",
      "proof:livekit-render-telemetry",
      "proof:livekit-operator-recovery-loop",
    ],
    requiredGuardScripts: [
      "guard:livekit-autonomous-operator-policy",
      "guard:livekit-heartbeat-monitor-policy",
      "guard:watch-party-livekit-camera",
    ],
    surfaces: [
      {
        id: "backend_router_and_token_health",
        approvalLevel: 2,
        allowedReadScope: ["livekit server health", "token issuer audit summaries"],
        allowedWriteScope: ["livekit operator health/audit/learning tables"],
        forbiddenScope: ["stale cutoff loosening", "fake heartbeat", "non-LiveKit table mutation"],
        proofScript: "proof:livekit-surface-health",
        guardScript: "guard:livekit-autonomous-operator-policy",
        rollbackBehavior: "audit-only report or scoped recovery action rollback",
        killSwitchOrFallback: "pause affected LiveKit surface reporting without changing Premium gates",
        ownerApprovalRequired: false,
      },
      {
        id: "render_telemetry_regression_detection",
        approvalLevel: 1,
        allowedReadScope: ["sanitized client render/token telemetry"],
        allowedWriteScope: ["livekit_operator_events", "livekit_surface_health_snapshots"],
        forbiddenScope: ["participant tokens", "room tokens", "secrets", "direct recovery from client event"],
        proofScript: "proof:livekit-render-telemetry",
        guardScript: "guard:livekit-autonomous-operator-policy",
        rollbackBehavior: "operator incident report and source patch recommendation only",
        killSwitchOrFallback: "stable in-surface LiveKit shell and fallback roster suppression guard",
        ownerApprovalRequired: false,
      },
      {
        id: "safe_heartbeat_or_counter_recovery",
        approvalLevel: 2,
        allowedReadScope: ["heartbeat age", "capacity counters", "host proof summaries"],
        allowedWriteScope: ["legitimate heartbeat monitor invocation", "scoped recovery audit rows"],
        forbiddenScope: ["manual heartbeat timestamp writes", "mark server active without host proof"],
        proofScript: "proof:livekit-operator-recovery-loop",
        guardScript: "guard:livekit-heartbeat-monitor-policy",
        rollbackBehavior: "record recovery failed and leave router fail-closed",
        killSwitchOrFallback: "operator safe recovery disable flag",
        ownerApprovalRequired: false,
      },
      {
        id: "secret_rotation_turn_or_server_replacement",
        approvalLevel: 4,
        allowedReadScope: ["redacted incident summary", "host proof summary"],
        allowedWriteScope: ["owner-approved external provider action only"],
        forbiddenScope: ["automatic secret rotation", "automatic provider/server replacement"],
        proofScript: "proof:autonomous-systems-contract",
        guardScript: "guard:autonomous-systems-contract",
        rollbackBehavior: "owner-approved rollback and external provider confirmation required",
        killSwitchOrFallback: "owner-approved emergency plan required",
        ownerApprovalRequired: true,
      },
    ],
  },
] as const satisfies readonly AutonomousSystemContract[];

export const AUTONOMOUS_SYSTEM_IDS = AUTONOMOUS_SYSTEMS_REGISTRY.map((system) => system.id);

export const findAutonomousSystemContract = (id: AutonomousSystemId) => (
  AUTONOMOUS_SYSTEMS_REGISTRY.find((system) => system.id === id) ?? null
);

export const listAutonomousApprovalRequiredSurfaces = () => (
  AUTONOMOUS_SYSTEMS_REGISTRY.flatMap((system) => (
    system.surfaces
      .filter((surface) => surface.approvalLevel >= 3 || surface.ownerApprovalRequired)
      .map((surface) => ({
        systemId: system.id,
        surfaceId: surface.id,
        approvalLevel: surface.approvalLevel,
        proofScript: surface.proofScript,
        guardScript: surface.guardScript,
      }))
  ))
);
