import { runCurrentAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";

export const RECONCILIATION_ALERTS = {
  driver_disabled: "Automatic reconciliation is off",
  driver_heartbeat_missing: "No reconciliation run in the last 30 minutes",
  cost_refresh_overdue: "Payment or dispute evidence needs refreshing",
  provider_refresh_failures: "Provider refreshes failed during the last six hours",
  observed_capacity_shortfall: "Observed processing is below the six-hour workload",
  tracking_unqualified: "Shipment provider qualification needs attention",
  tracking_refresh_overdue: "Shipment checks are older than twelve hours or missing",
  tracking_review_required: "Shipment evidence requires review",
} as const;
export type ReconciliationHealth = {
  observedAt: string; driverEnabled: boolean; eligible: number; due: number;
  completed: number; incomplete: number; runs: number; assigned: number;
  alerts: (keyof typeof RECONCILIATION_ALERTS)[];
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
  return value as Record<string, unknown>;
};
const count = (value: unknown) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw Error();
  return value;
};
export async function readOwnerReconciliationHealth(): Promise<ReconciliationHealth> {
  try {
    const result = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("get_owner_merch_reconciliation_health", {});
    if (result.error) throw Error();
    const data = object(result.data), cost = object(data.cost), tracking = object(data.tracking), measured = object(data.measured);
    if (data.schemaVersion !== 1 || data.environment !== "sandbox" || data.financialAuthority !== false
      || data.liveActivationAllowed !== false || typeof data.driverEnabled !== "boolean"
      || typeof data.observedAt !== "string" || !Number.isFinite(Date.parse(data.observedAt))
      || measured.capacityGuaranteed !== false || cost.capacityGuaranteed !== false || measured.windowHours !== 6
      || !Array.isArray(data.alerts) || data.alerts.some(alert => typeof alert !== "string" || !Object.hasOwn(RECONCILIATION_ALERTS, alert))
      || new Set(data.alerts).size !== data.alerts.length) throw Error();
    return { observedAt: data.observedAt, driverEnabled: data.driverEnabled,
      eligible: count(cost.eligible), due: count(cost.due), completed: count(measured.completed),
      incomplete: count(measured.incomplete), runs: count(measured.runs), assigned: count(tracking.assigned),
      alerts: data.alerts as ReconciliationHealth["alerts"] };
  } catch { throw new Error("Reconciliation health is unavailable."); }
}
