/** Wire validation only, not an issuer. Qualification is resolved by the server
 * from immutable operator-owned evidence; caller fields never create it. */
type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, names: string[]): v is Row => row(v) && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const id = (v: unknown, prefix: string) => typeof v === "string" && v.startsWith(prefix) && uuid(v.slice(prefix.length));
const positive = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const text = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 512 && v === v.trim() && !/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(v);
const digest = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
export type NativeDispatchQualification = {
 id: string; revision: number; projectId: string; appId: string; store: "APP_STORE" | "PLAY_STORE"; environment: "SANDBOX";
 wireProductId: string; catalogBindingId: string; catalogRevision: number; quoteDigest: string; connectionId: string; connectionRevision: number;
 protocolEvidenceSha256: string; platform: "ios" | "android"; nativeBuild: string; nativeVersion: string; signedAppVersion: string; sdkVersion: string;
 noChargeAccountScope: "testflight_distribution" | "play_license_account"; accountEvidenceSha256: string;
};
export function validNativeDispatchQualification(v: unknown): v is NativeDispatchQualification {
 return keys(v, ["id", "revision", "projectId", "appId", "store", "environment", "wireProductId", "catalogBindingId", "catalogRevision", "quoteDigest", "connectionId", "connectionRevision", "protocolEvidenceSha256", "platform", "nativeBuild", "nativeVersion", "signedAppVersion", "sdkVersion", "noChargeAccountScope", "accountEvidenceSha256"])
 && id(v.id, "nssv1_qualification_") && positive(v.revision) && text(v.projectId) && text(v.appId) && v.environment === "SANDBOX"
 && text(v.wireProductId) && id(v.catalogBindingId, "nssv1_catalog_") && positive(v.catalogRevision) && digest(v.quoteDigest)
 && uuid(v.connectionId) && positive(v.connectionRevision) && digest(v.protocolEvidenceSha256) && digest(v.accountEvidenceSha256)
 && text(v.nativeBuild) && text(v.nativeVersion) && text(v.signedAppVersion) && text(v.sdkVersion)
 && (v.store === "APP_STORE" && v.platform === "ios" && v.noChargeAccountScope === "testflight_distribution"
   || v.store === "PLAY_STORE" && v.platform === "android" && v.noChargeAccountScope === "play_license_account");
}
export function validNativeDispatchData(v: unknown, context: { command: string; requestId: string; selectionId: unknown; reservationId: unknown; sessionGeneration: string; status: unknown; dispatchAllowed: unknown }): boolean {
 if (context.command === "dispatch-qualification") return context.dispatchAllowed === false && keys(v, ["qualification", "reason"])
   && (context.status === "ok" ? validNativeDispatchQualification(v.qualification) && v.reason === null
     : context.status === "held" && v.qualification === null && text(v.reason));
 if (!keys(v, ["attempt", "qualification", "newlyConsumed", "reason"])) return false;
 if (context.status !== "ok") return context.dispatchAllowed === false && v.newlyConsumed === false && v.attempt === null && v.qualification === null
   && text(v.reason) && (context.status === "held" || context.status === "unknown" && context.command === "dispatch-recover");
 const a = v.attempt;
 if (v.reason !== null || !validNativeDispatchQualification(v.qualification)
   || !keys(a, ["id", "reservationId", "selectionId", "originalRequestId", "originalSessionGeneration", "quoteDigest", "createdAt", "state", "dispatchAllowed", "providerQualified"])
   || !id(a.id, "nssv1_attempt_") || a.reservationId !== context.reservationId || a.selectionId !== context.selectionId
   || a.originalRequestId !== context.requestId || !uuid(a.originalSessionGeneration) || a.quoteDigest !== v.qualification.quoteDigest
   || typeof a.createdAt !== "string" || !/^\d{4}-\d\d-\d\dT/u.test(a.createdAt) || !Number.isFinite(Date.parse(a.createdAt))
   || a.state !== "consumed" || a.dispatchAllowed !== false || a.providerQualified !== false || typeof v.newlyConsumed !== "boolean") return false;
 // Android remains unqualified: a saved operator row is not current Play account proof.
 const allow = context.command === "dispatch-consume" && v.newlyConsumed === true && a.originalSessionGeneration === context.sessionGeneration
   && v.qualification.platform === "ios" && v.qualification.store === "APP_STORE" && v.qualification.noChargeAccountScope === "testflight_distribution";
 return (v.newlyConsumed === false || allow) && context.dispatchAllowed === allow;
}
