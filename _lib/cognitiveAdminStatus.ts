export const OWNER_ASSISTED_COGNITIVE_MODE =
  "OWNER_ASSISTED_ACTIVE" as const;
export const ISOLATED_AUTONOMOUS_COGNITIVE_MODE =
  "ISOLATED_AUTONOMOUS_PENDING" as const;

export type LiveCognitiveStatus = Readonly<{
  canManageLevel01: boolean;
  deploymentState: string;
  isolatedAutonomousMode: typeof ISOLATED_AUTONOMOUS_COGNITIVE_MODE;
  isolatedAutonomousRuntimeLive: false;
  ownerAssistedMode: typeof OWNER_ASSISTED_COGNITIVE_MODE;
  schedulerState: string;
  switches: Readonly<Record<string, boolean>>;
  pendingApprovalCount: number;
  latestDecisionCount: number;
  emergencyStop: boolean;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const boundedStatusText = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= 128
    ? value
    : null;

const boundedCount = (value: unknown): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;

export const parseLiveCognitiveStatusResponse = (
  value: unknown,
): LiveCognitiveStatus | null => {
  if (!isRecord(value)) return null;
  const candidate =
    value.ok === true && isRecord(value.status) ? value.status : value;
  if (candidate.source !== "live_readback") return null;
  const deploymentState = boundedStatusText(
    candidate.deploymentState ?? candidate.deployment,
  );
  const schedulerState = boundedStatusText(
    candidate.schedulerState ?? candidate.scheduler,
  );
  if (
    !deploymentState ||
    !schedulerState ||
    typeof candidate.canManageLevel01 !== "boolean" ||
    candidate.ownerAssistedMode !== OWNER_ASSISTED_COGNITIVE_MODE ||
    candidate.isolatedAutonomousMode !==
      ISOLATED_AUTONOMOUS_COGNITIVE_MODE ||
    candidate.isolatedAutonomousRuntimeLive !== false
  ) {
    return null;
  }
  const switches = isRecord(candidate.switches)
    ? Object.fromEntries(
        Object.entries(candidate.switches).filter(
          (entry): entry is [string, boolean] =>
            entry[0].length > 0 &&
            entry[0].length <= 128 &&
            typeof entry[1] === "boolean",
        ),
      )
    : {};
  return Object.freeze({
    canManageLevel01: candidate.canManageLevel01,
    deploymentState,
    isolatedAutonomousMode: ISOLATED_AUTONOMOUS_COGNITIVE_MODE,
    isolatedAutonomousRuntimeLive: false,
    ownerAssistedMode: OWNER_ASSISTED_COGNITIVE_MODE,
    schedulerState,
    switches: Object.freeze(switches),
    pendingApprovalCount: boundedCount(candidate.pendingApprovalCount),
    latestDecisionCount: boundedCount(candidate.latestDecisionCount),
    emergencyStop:
      typeof candidate.emergencyStop === "boolean"
        ? candidate.emergencyStop
        : true,
  });
};
