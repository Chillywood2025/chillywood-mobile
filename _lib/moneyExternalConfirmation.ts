import type { AutonomousApprovalLevel } from "./autonomousSystemsRegistry";

export type MoneyExternalConfirmationSource =
  | "stripe_transfer_readback"
  | "stripe_payout_readback"
  | "stripe_charge_readback"
  | "google_play_receipt_readback"
  | "revenuecat_customer_info_readback"
  | "signed_provider_webhook_verification"
  | "payout_provider_transfer_id_readback"
  | "owner_attested_manual_external_confirmation";

export type MoneyEnvironmentMode = "sandbox" | "test" | "production";

export type MoneyExternalConfirmationInput = {
  actionId: string;
  approvalLevel: AutonomousApprovalLevel;
  environmentMode: MoneyEnvironmentMode;
  confirmation?: {
    source: MoneyExternalConfirmationSource | string;
    providerReferenceId?: string | null;
    providerMode: MoneyEnvironmentMode | string;
    checkedAt?: string | null;
    ownerAttested?: boolean;
    explicitlyMarked?: boolean;
    metadata?: Record<string, unknown> | null;
  } | null;
};

const VALID_CONFIRMATION_SOURCES: readonly MoneyExternalConfirmationSource[] = [
  "stripe_transfer_readback",
  "stripe_payout_readback",
  "stripe_charge_readback",
  "google_play_receipt_readback",
  "revenuecat_customer_info_readback",
  "signed_provider_webhook_verification",
  "payout_provider_transfer_id_readback",
  "owner_attested_manual_external_confirmation",
];

const SECRET_KEY_PATTERN = /(secret|token|password|authorization|service[_-]?role|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url|webhook[_-]?secret|signed[_-]?url)/i;
const SECRET_VALUE_PATTERN = /[A-Za-z0-9._~+/=-]{48,}/;

export const moneyExternalConfirmationSources = VALID_CONFIRMATION_SOURCES;

export const sanitizeMoneyExternalConfirmationMetadata = (metadata: Record<string, unknown> | null | undefined) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) => !SECRET_KEY_PATTERN.test(key) && !(typeof value === "string" && SECRET_VALUE_PATTERN.test(value)))
      .slice(0, 32)
      .map(([key, value]) => [key, typeof value === "string" ? value.replace(SECRET_VALUE_PATTERN, "[redacted]") : value]),
  );
};

export const validateMoneyExternalConfirmation = (input: MoneyExternalConfirmationInput) => {
  const failures: string[] = [];
  if (input.approvalLevel < 4) {
    return {
      ok: true,
      required: false,
      failures,
      source: input.confirmation?.source ?? null,
      confirmationStatus: "not_required" as const,
    };
  }

  const confirmation = input.confirmation;
  if (!confirmation) failures.push("external_provider_confirmation_required");
  const source = confirmation?.source ?? "";
  if (confirmation && !VALID_CONFIRMATION_SOURCES.includes(source as MoneyExternalConfirmationSource)) {
    failures.push("unsupported_external_confirmation_source");
  }
  if (confirmation && !confirmation.providerReferenceId) failures.push("provider_reference_readback_required");
  if (confirmation && !confirmation.checkedAt) failures.push("confirmation_checked_at_required");
  if (confirmation && input.environmentMode === "production" && confirmation.providerMode !== "production") {
    failures.push("test_mode_confirmation_cannot_satisfy_production");
  }
  if (confirmation && input.environmentMode !== "production" && confirmation.providerMode === "production") {
    failures.push("production_confirmation_cannot_satisfy_sandbox_proof");
  }
  if (
    source === "owner_attested_manual_external_confirmation"
    && (!confirmation?.ownerAttested || !confirmation?.explicitlyMarked)
  ) {
    failures.push("owner_attested_manual_confirmation_must_be_explicitly_marked");
  }

  const confirmationStatus = failures.length === 0
    ? (input.environmentMode === "production" ? "provided_production" : "provided_test_mode")
    : "rejected";

  return {
    ok: failures.length === 0,
    required: true,
    failures,
    source: source || null,
    confirmationStatus,
    sanitizedMetadata: sanitizeMoneyExternalConfirmationMetadata(confirmation?.metadata),
  };
};
