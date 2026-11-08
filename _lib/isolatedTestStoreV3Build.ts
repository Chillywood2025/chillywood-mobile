import * as Application from "expo-application";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import { testStoreUuid } from "./isolatedTestStoreContract";
import { sameTestStoreV3Allocation, sameTestStoreV3Customer, sameTestStoreV3Quote, validTestStoreV3Allocation, validTestStoreV3Customer,
  validTestStoreV3NativeInvocation, validTestStoreV3NativePreparedClosure, type TestStoreV3Allocation, type TestStoreV3Customer, type TestStoreV3NativeInvocation,
  type TestStoreV3NativePreparedClosure, type TestStoreV3NativeRecord,
  type TestStoreV3Result } from "./isolatedTestStoreV3Contract";

export type IsolatedTestStoreV3Build = Readonly<{ protocol: "isolated-test-store-build-v3"; mode: "test-store-debug-v3";
  platform: "ios" | "android"; applicationId: "com.chillywood.mobile.teststoredebugv3"; projectId: string; appId: string;
  publicSdkKey: string; configId: string; storageNamespace: "@chillywood/test-store-debug-v3"; nativeDebug: true }>;
export type TestStoreV3NativeInstallation = { protocol: "isolated-test-store-native-v3"; installationId: string;
  configurationDigest: string; customer: TestStoreV3Customer | null; processRetired: boolean; activeInvocationId: string | null };
export type TestStoreV3NativePrepared = { status: "prepared"; handleId: string; invocation: TestStoreV3NativeInvocation };
export type TestStoreV3NativeLookup = TestStoreV3NativePrepared | { status: "package_unavailable"; handleId: null; invocation: null };
type NativeModule = { isolatedTestStoreV3Flavor?: unknown; build?: unknown;
  inspectInstallation?(): Promise<unknown>; bindCustomer?(customerJson: string, sessionId: string): Promise<unknown>;
  preparePackage?(customerJson: string, allocationJson: string, sessionId: string): Promise<unknown>;
  purchasePrepared?(handleId: string, claimJson: string): Promise<unknown>;
  closePrepared?(customerJson: string, allocationJson: string, currentSessionId: string): Promise<unknown>;
  readInvocation?(dispatchId: string): Promise<unknown>; retireSession?(sessionId: string): Promise<unknown> };
let native: NativeModule | null = null;
try { native = requireOptionalNativeModule<NativeModule>("ChillywoodTestStoreV3"); } catch { /* No native proof means unavailable. */ }
const APPLICATION_ID = "com.chillywood.mobile.teststoredebugv3";
const row = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).sort().join(",") === expected.sort().join(",");
const fail = (): never => { throw new Error("TEST_STORE_V3_NATIVE_UNAVAILABLE"); };
export function isIsolatedTestStoreV3Flavor(): boolean { return Application.applicationId === APPLICATION_ID || native?.isolatedTestStoreV3Flavor === true; }
export function readIsolatedTestStoreV3Build(): IsolatedTestStoreV3Build | null {
  const value = native?.build;
  if (!isIsolatedTestStoreV3Flavor() || Application.applicationId !== APPLICATION_ID || !row(value)
    || !keys(value, ["protocol", "mode", "platform", "applicationId", "projectId", "appId", "publicSdkKey", "configId", "storageNamespace", "nativeDebug"])
    || value.protocol !== "isolated-test-store-build-v3" || value.mode !== "test-store-debug-v3" || value.nativeDebug !== true
    || value.platform !== Platform.OS || !["ios", "android"].includes(String(value.platform)) || value.applicationId !== APPLICATION_ID
    || value.storageNamespace !== "@chillywood/test-store-debug-v3" || typeof value.projectId !== "string" || !/^[A-Za-z0-9_-]{4,100}$/u.test(value.projectId)
    || typeof value.appId !== "string" || !/^[A-Za-z0-9_-]{4,100}$/u.test(value.appId)
    || typeof value.publicSdkKey !== "string" || !/^test_[A-Za-z0-9_-]{8,200}$/u.test(value.publicSdkKey)
    || typeof value.configId !== "string" || !/^[a-f0-9]{64}$/u.test(value.configId)) return null;
  return Object.freeze({ ...value }) as IsolatedTestStoreV3Build;
}
function build() { return readIsolatedTestStoreV3Build() ?? fail(); }
function customerMatches(customer: TestStoreV3Customer) {
  const b = build();
  if (!validTestStoreV3Customer(customer) || customer.configurationDigest !== b.configId || customer.projectId !== b.projectId || customer.appId !== b.appId) fail();
}
function installation(value: unknown): TestStoreV3NativeInstallation {
  const b = build();
  if (!row(value) || !keys(value, ["protocol", "installationId", "configurationDigest", "customer", "processRetired", "activeInvocationId"])
    || value.protocol !== "isolated-test-store-native-v3" || !testStoreUuid(value.installationId) || value.configurationDigest !== b.configId
    || typeof value.processRetired !== "boolean" || (value.activeInvocationId !== null && !testStoreUuid(value.activeInvocationId))) return fail();
  if (value.customer !== null) {
    if (!validTestStoreV3Customer(value.customer) || value.customer.installationId !== value.installationId) return fail();
    customerMatches(value.customer);
  }
  return value as TestStoreV3NativeInstallation;
}
function invocation(value: unknown, dispatchId: string): TestStoreV3NativeInvocation {
  if (!validTestStoreV3NativeInvocation(value) || value.invocationId !== dispatchId || value.configurationDigest !== build().configId) return fail();
  return value;
}
export async function inspectIsolatedTestStoreV3Installation(): Promise<TestStoreV3NativeInstallation> {
  build(); if (!native?.inspectInstallation) return fail(); return installation(await native.inspectInstallation());
}
export async function bindIsolatedTestStoreV3NativeCustomer(customer: TestStoreV3Customer, sessionId: string): Promise<TestStoreV3NativeInstallation> {
  customerMatches(customer); if (!testStoreUuid(sessionId) || !native?.bindCustomer) return fail();
  const result = installation(await native.bindCustomer(JSON.stringify(customer), sessionId));
  if (!result.customer || !sameTestStoreV3Customer(result.customer, customer) || result.processRetired) return fail(); return result;
}
export async function prepareIsolatedTestStoreV3NativePackage(customer: TestStoreV3Customer, allocation: TestStoreV3Allocation, sessionId: string): Promise<TestStoreV3NativeLookup> {
  customerMatches(customer);
  if (!validTestStoreV3Allocation(allocation) || !allocation.registration || allocation.customerBindingId !== customer.id
    || allocation.configurationDigest !== customer.configurationDigest || !testStoreUuid(sessionId) || !native?.preparePackage) return fail();
  const value = await native.preparePackage(JSON.stringify(customer), JSON.stringify(allocation), sessionId);
  if (!row(value) || !keys(value, ["status", "handleId", "invocation"])) return fail();
  if (value.status === "package_unavailable" && value.handleId === null && value.invocation === null)
    return { status: "package_unavailable", handleId: null, invocation: null };
  if (value.status !== "prepared" || !testStoreUuid(value.handleId)) return fail();
  const observation = invocation(value.invocation, allocation.dispatchId);
  if (observation.state !== "prepared" || observation.customerBindingId !== customer.id || observation.buyerId !== customer.buyerId
    || observation.providerAppUserId !== customer.providerAppUserId || observation.installationId !== customer.installationId
    || observation.sessionId !== sessionId || observation.allocationId !== allocation.id || observation.registrationId !== allocation.registration.id
    || !sameTestStoreV3Quote(observation.quote, allocation.quote)) return fail();
  return { status: "prepared", handleId: value.handleId, invocation: observation };
}
export async function purchaseIsolatedTestStoreV3NativePackage(prepared: TestStoreV3NativePrepared, customer: TestStoreV3Customer,
  allocation: TestStoreV3Allocation, claim: TestStoreV3Result): Promise<TestStoreV3NativeInvocation> {
  customerMatches(customer);
  if (prepared.status !== "prepared" || !testStoreUuid(prepared.handleId) || !validTestStoreV3NativeInvocation(prepared.invocation) || prepared.invocation.state !== "prepared"
    || !validTestStoreV3Allocation(allocation) || !allocation.registration || prepared.invocation.invocationId !== allocation.dispatchId
    || prepared.invocation.configurationDigest !== customer.configurationDigest
    || prepared.invocation.customerBindingId !== customer.id || prepared.invocation.installationId !== customer.installationId
    || prepared.invocation.providerAppUserId !== customer.providerAppUserId || prepared.invocation.buyerId !== customer.buyerId
    || prepared.invocation.allocationId !== allocation.id || prepared.invocation.registrationId !== allocation.registration.id
    || !sameTestStoreV3Quote(prepared.invocation.quote, allocation.quote)
    || claim.command !== "claim" || claim.actor.userId !== customer.buyerId || claim.actor.sessionId !== prepared.invocation.sessionId
    || claim.result.status !== "dispatch_claimed" || !claim.result.dispatchAllowed || !claim.result.customer || !claim.result.allocation
    || !sameTestStoreV3Customer(customer, claim.result.customer) || !sameTestStoreV3Allocation(allocation, claim.result.allocation)
    || !claim.result.authorityValidUntil || Date.parse(claim.result.authorityValidUntil) <= Date.now()
    || Date.parse(claim.result.authorityValidUntil) > Date.now() + 5_000 || !native?.purchasePrepared) return fail();
  const result = invocation(await native.purchasePrepared(prepared.handleId, JSON.stringify(claim)), allocation.dispatchId);
  if (result.state !== "completed" || result.sessionId !== prepared.invocation.sessionId || result.allocationId !== allocation.id
    || result.registrationId !== allocation.registration.id || result.customerBindingId !== customer.id || result.buyerId !== customer.buyerId
    || result.installationId !== customer.installationId || result.providerAppUserId !== customer.providerAppUserId
    || !sameTestStoreV3Quote(result.quote, allocation.quote)) return fail(); return result;
}
function closure(value: unknown, dispatchId: string): TestStoreV3NativePreparedClosure {
  if (!validTestStoreV3NativePreparedClosure(value)) return fail();
  invocation(value.invocation, dispatchId); return value;
}
export async function closeIsolatedTestStoreV3NativePrepared(customer: TestStoreV3Customer, allocation: TestStoreV3Allocation,
  currentSessionId: string): Promise<TestStoreV3NativePreparedClosure> {
  customerMatches(customer);
  if (!validTestStoreV3Allocation(allocation) || !allocation.registration || allocation.customerBindingId !== customer.id
    || allocation.configurationDigest !== customer.configurationDigest || !testStoreUuid(currentSessionId) || !native?.closePrepared) return fail();
  const result = closure(await native.closePrepared(JSON.stringify(customer), JSON.stringify(allocation), currentSessionId), allocation.dispatchId);
  const original = result.invocation;
  if (original.customerBindingId !== customer.id || original.installationId !== customer.installationId || original.buyerId !== customer.buyerId
    || original.providerAppUserId !== customer.providerAppUserId || original.allocationId !== allocation.id || original.registrationId !== allocation.registration.id
    || !sameTestStoreV3Quote(original.quote, allocation.quote)) return fail();
  // original.sessionId is deliberately retained, never rebound to this reader.
  return result;
}
export async function readIsolatedTestStoreV3NativeInvocation(dispatchId: string): Promise<TestStoreV3NativeRecord | null> {
  build(); if (!testStoreUuid(dispatchId) || !native?.readInvocation) return fail(); const value = await native.readInvocation(dispatchId);
  return value === null ? null : validTestStoreV3NativePreparedClosure(value) ? closure(value, dispatchId) : invocation(value, dispatchId);
}
export async function retireIsolatedTestStoreV3NativeSession(sessionId: string): Promise<void> {
  if (!testStoreUuid(sessionId) || !native?.retireSession || !readIsolatedTestStoreV3Build()) return;
  await native.retireSession(sessionId);
}
