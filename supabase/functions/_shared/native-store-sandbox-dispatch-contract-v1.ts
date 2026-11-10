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
type NativeQualificationBase = {
 id: string; revision: number; projectId: string; appId: string; environment: "SANDBOX";
 wireProductId: string; catalogBindingId: string; catalogRevision: number; quoteDigest: string; connectionId: string; connectionRevision: number;
 protocolEvidenceSha256: string; nativeBuild: string; nativeVersion: string; sdkVersion: string; accountEvidenceSha256: string;
};
export type NativePlayHandoffQualification = NativeQualificationBase & {
 store: "PLAY_STORE"; platform: "android"; noChargeAccountScope: "play_test_sheet_handoff";
 handoffMode: "play_test_sheet_handoff_v1"; automaticNoChargeProof: false; userStoreConfirmationRequired: true;
 buyerId: string; sessionGeneration: string; enrollmentExpiresAt: string;
};
export type NativeDispatchQualification = NativePlayHandoffQualification | NativeQualificationBase & (
 { store: "APP_STORE"; platform: "ios"; signedAppVersion: string; noChargeAccountScope: "testflight_distribution" }
 | { store: "PLAY_STORE"; platform: "android"; signedAppVersion: string; noChargeAccountScope: "play_license_account" }
);
const common = ["id", "revision", "projectId", "appId", "store", "environment", "wireProductId", "catalogBindingId", "catalogRevision", "quoteDigest", "connectionId", "connectionRevision", "protocolEvidenceSha256", "platform", "nativeBuild", "nativeVersion", "sdkVersion", "noChargeAccountScope", "accountEvidenceSha256"];
export function validNativeDispatchQualification(v: unknown): v is NativeDispatchQualification {
 if (!row(v)) return false;
 const handoff = v.noChargeAccountScope === "play_test_sheet_handoff";
 return keys(v, [...common, ...(handoff ? ["handoffMode", "automaticNoChargeProof", "userStoreConfirmationRequired", "buyerId", "sessionGeneration", "enrollmentExpiresAt"] : ["signedAppVersion"])])
 && id(v.id, handoff ? "nssv1_play_qualification_" : "nssv1_qualification_") && positive(v.revision) && text(v.projectId) && text(v.appId) && v.environment === "SANDBOX"
 && text(v.wireProductId) && id(v.catalogBindingId, "nssv1_catalog_") && positive(v.catalogRevision) && digest(v.quoteDigest)
 && uuid(v.connectionId) && positive(v.connectionRevision) && digest(v.protocolEvidenceSha256) && digest(v.accountEvidenceSha256)
 && text(v.nativeBuild) && text(v.nativeVersion) && text(v.sdkVersion)
 && (handoff ? v.store === "PLAY_STORE" && v.platform === "android" && v.sdkVersion === "10.15.1"
   && v.handoffMode === "play_test_sheet_handoff_v1" && v.automaticNoChargeProof === false && v.userStoreConfirmationRequired === true
   && uuid(v.buyerId) && uuid(v.sessionGeneration) && typeof v.enrollmentExpiresAt === "string" && /^\d{4}-\d\d-\d\dT/u.test(v.enrollmentExpiresAt) && Number.isFinite(Date.parse(v.enrollmentExpiresAt))
   : text(v.signedAppVersion) && (v.store === "APP_STORE" && v.platform === "ios" && v.noChargeAccountScope === "testflight_distribution"
     || v.store === "PLAY_STORE" && v.platform === "android" && v.noChargeAccountScope === "play_license_account"));
}
export function validNativeDispatchData(v: unknown, context: { command: string; requestId: string; selectionId: unknown; reservationId: unknown; buyerId: string; sessionGeneration: string; status: unknown; dispatchAllowed: unknown }): boolean {
 if (context.command === "dispatch-qualification") return context.dispatchAllowed === false && keys(v, ["qualification", "reason"])
   && (context.status === "ok" ? validNativeDispatchQualification(v.qualification) && v.reason === null
     && (!("handoffMode" in v.qualification) || v.qualification.buyerId === context.buyerId && v.qualification.sessionGeneration === context.sessionGeneration && Date.parse(v.qualification.enrollmentExpiresAt) > Date.now())
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
 const q = v.qualification;
 if ("handoffMode" in q && (q.buyerId !== context.buyerId || q.sessionGeneration !== a.originalSessionGeneration)) return false;
 // Old quote-wide Android rows remain non-dispatching. A new buyer-scoped
 // handoff permits only presenting Google's confirmation UI, not a grant.
 const allow = context.command === "dispatch-consume" && v.newlyConsumed === true && a.originalSessionGeneration === context.sessionGeneration
   && (q.store === "APP_STORE" && q.noChargeAccountScope === "testflight_distribution"
     || "handoffMode" in q && Date.parse(q.enrollmentExpiresAt) > Date.now());
 return (v.newlyConsumed === false || allow) && context.dispatchAllowed === allow;
}
