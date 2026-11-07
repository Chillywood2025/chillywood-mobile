import * as Application from "expo-application";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import { testStoreUuid } from "./isolatedTestStoreContract";
import { sameTestStoreV2Allocation, sameTestStoreV2Customer, validTestStoreV2Allocation, validTestStoreV2Customer,
  validTestStoreV2NativeInvocation, type TestStoreV2Allocation, type TestStoreV2Customer, type TestStoreV2NativeInvocation,
  type TestStoreV2Result } from "./isolatedTestStoreV2Contract";

export type IsolatedTestStoreV2Build = Readonly<{ protocol: "isolated-test-store-build-v2"; mode: "test-store-debug-v2";
  platform: "ios" | "android"; applicationId: "com.chillywood.mobile.teststoredebugv2"; projectId: string; appId: string;
  publicSdkKey: string; configId: string; storageNamespace: "@chillywood/test-store-debug-v2"; nativeDebug: true }>;
export type TestStoreV2NativeInstallation = { protocol: "isolated-test-store-native-v2"; installationId: string;
  configurationDigest: string; customer: TestStoreV2Customer | null; processRetired: boolean; activeInvocationId: string | null };
export type TestStoreV2NativePrepared = { status: "prepared"; handleId: string; invocation: TestStoreV2NativeInvocation };
export type TestStoreV2NativeLookup = TestStoreV2NativePrepared | { status: "package_unavailable"; handleId: null; invocation: null };
type NativeModule = { isolatedTestStoreV2Flavor?: unknown; build?: unknown;
  inspectInstallation?(): Promise<unknown>; bindCustomer?(customerJson: string, sessionId: string): Promise<unknown>;
  preparePackage?(customerJson: string, allocationJson: string, sessionId: string): Promise<unknown>;
  purchasePrepared?(handleId: string, claimJson: string): Promise<unknown>;
  readInvocation?(dispatchId: string): Promise<unknown>; retireSession?(sessionId: string): Promise<unknown> };
let native: NativeModule | null = null;
try { native = requireOptionalNativeModule<NativeModule>("ChillywoodTestStoreV2"); } catch { /* No native proof means unavailable. */ }
const APPLICATION_ID = "com.chillywood.mobile.teststoredebugv2";
const row = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).sort().join(",") === expected.sort().join(",");
const fail = (): never => { throw new Error("TEST_STORE_V2_NATIVE_UNAVAILABLE"); };
export function isIsolatedTestStoreV2Flavor(): boolean { return Application.applicationId === APPLICATION_ID || native?.isolatedTestStoreV2Flavor === true; }
export function readIsolatedTestStoreV2Build(): IsolatedTestStoreV2Build | null {
  const value = native?.build;
  if (!isIsolatedTestStoreV2Flavor() || Application.applicationId !== APPLICATION_ID || !row(value)
    || !keys(value, ["protocol", "mode", "platform", "applicationId", "projectId", "appId", "publicSdkKey", "configId", "storageNamespace", "nativeDebug"])
    || value.protocol !== "isolated-test-store-build-v2" || value.mode !== "test-store-debug-v2" || value.nativeDebug !== true
    || value.platform !== Platform.OS || !["ios", "android"].includes(String(value.platform)) || value.applicationId !== APPLICATION_ID
    || value.storageNamespace !== "@chillywood/test-store-debug-v2" || typeof value.projectId !== "string" || !/^[A-Za-z0-9_-]{4,100}$/u.test(value.projectId)
    || typeof value.appId !== "string" || !/^[A-Za-z0-9_-]{4,100}$/u.test(value.appId)
    || typeof value.publicSdkKey !== "string" || !/^test_[A-Za-z0-9_-]{8,200}$/u.test(value.publicSdkKey)
    || typeof value.configId !== "string" || !/^[a-f0-9]{64}$/u.test(value.configId)) return null;
  return Object.freeze({ ...value }) as IsolatedTestStoreV2Build;
}
function build() { return readIsolatedTestStoreV2Build() ?? fail(); }
function customerMatches(customer: TestStoreV2Customer) {
  const b = build();
  if (!validTestStoreV2Customer(customer) || customer.configurationDigest !== b.configId || customer.projectId !== b.projectId || customer.appId !== b.appId) fail();
}
function installation(value: unknown): TestStoreV2NativeInstallation {
  const b = build();
  if (!row(value) || !keys(value, ["protocol", "installationId", "configurationDigest", "customer", "processRetired", "activeInvocationId"])
    || value.protocol !== "isolated-test-store-native-v2" || !testStoreUuid(value.installationId) || value.configurationDigest !== b.configId
    || typeof value.processRetired !== "boolean" || (value.activeInvocationId !== null && !testStoreUuid(value.activeInvocationId))) return fail();
  if (value.customer !== null) {
    if (!validTestStoreV2Customer(value.customer) || value.customer.installationId !== value.installationId) return fail();
    customerMatches(value.customer);
  }
  return value as TestStoreV2NativeInstallation;
}
function invocation(value: unknown, dispatchId: string): TestStoreV2NativeInvocation {
  if (!validTestStoreV2NativeInvocation(value) || value.invocationId !== dispatchId || value.configurationDigest !== build().configId) return fail();
  return value;
}
export async function inspectIsolatedTestStoreV2Installation(): Promise<TestStoreV2NativeInstallation> {
  build(); if (!native?.inspectInstallation) return fail(); return installation(await native.inspectInstallation());
}
export async function bindIsolatedTestStoreV2NativeCustomer(customer: TestStoreV2Customer, sessionId: string): Promise<TestStoreV2NativeInstallation> {
  customerMatches(customer); if (!testStoreUuid(sessionId) || !native?.bindCustomer) return fail();
  const result = installation(await native.bindCustomer(JSON.stringify(customer), sessionId));
  if (!result.customer || !sameTestStoreV2Customer(result.customer, customer) || result.processRetired) return fail(); return result;
}
export async function prepareIsolatedTestStoreV2NativePackage(customer: TestStoreV2Customer, allocation: TestStoreV2Allocation, sessionId: string): Promise<TestStoreV2NativeLookup> {
  customerMatches(customer);
  if (!validTestStoreV2Allocation(allocation) || !allocation.registration || allocation.customerBindingId !== customer.id
    || allocation.configurationDigest !== customer.configurationDigest || !testStoreUuid(sessionId) || !native?.preparePackage) return fail();
  const value = await native.preparePackage(JSON.stringify(customer), JSON.stringify(allocation), sessionId);
  if (!row(value) || !keys(value, ["status", "handleId", "invocation"])) return fail();
  if (value.status === "package_unavailable" && value.handleId === null && value.invocation === null)
    return { status: "package_unavailable", handleId: null, invocation: null };
  if (value.status !== "prepared" || !testStoreUuid(value.handleId)) return fail();
  const observation = invocation(value.invocation, allocation.dispatchId);
  if (observation.state !== "prepared" || observation.customerBindingId !== customer.id || observation.buyerId !== customer.buyerId
    || observation.providerAppUserId !== customer.providerAppUserId || observation.installationId !== customer.installationId
    || observation.sessionId !== sessionId || observation.allocationId !== allocation.id || observation.registrationId !== allocation.registration.id) return fail();
  return { status: "prepared", handleId: value.handleId, invocation: observation };
}
export async function purchaseIsolatedTestStoreV2NativePackage(prepared: TestStoreV2NativePrepared, customer: TestStoreV2Customer,
  allocation: TestStoreV2Allocation, claim: TestStoreV2Result): Promise<TestStoreV2NativeInvocation> {
  customerMatches(customer);
  if (prepared.status !== "prepared" || !testStoreUuid(prepared.handleId) || !validTestStoreV2NativeInvocation(prepared.invocation) || prepared.invocation.state !== "prepared"
    || !validTestStoreV2Allocation(allocation) || !allocation.registration || prepared.invocation.invocationId !== allocation.dispatchId
    || prepared.invocation.configurationDigest !== customer.configurationDigest
    || prepared.invocation.customerBindingId !== customer.id || prepared.invocation.installationId !== customer.installationId
    || prepared.invocation.providerAppUserId !== customer.providerAppUserId || prepared.invocation.buyerId !== customer.buyerId
    || prepared.invocation.allocationId !== allocation.id || prepared.invocation.registrationId !== allocation.registration.id
    || claim.command !== "claim" || claim.actor.userId !== customer.buyerId || claim.actor.sessionId !== prepared.invocation.sessionId
    || claim.result.status !== "dispatch_claimed" || !claim.result.dispatchAllowed || !claim.result.customer || !claim.result.allocation
    || !sameTestStoreV2Customer(customer, claim.result.customer) || !sameTestStoreV2Allocation(allocation, claim.result.allocation)
    || !claim.result.authorityValidUntil || Date.parse(claim.result.authorityValidUntil) <= Date.now()
    || Date.parse(claim.result.authorityValidUntil) > Date.now() + 5_000 || !native?.purchasePrepared) return fail();
  const result = invocation(await native.purchasePrepared(prepared.handleId, JSON.stringify(claim)), allocation.dispatchId);
  if (result.state !== "completed" || result.sessionId !== prepared.invocation.sessionId || result.allocationId !== allocation.id
    || result.registrationId !== allocation.registration.id || result.customerBindingId !== customer.id || result.buyerId !== customer.buyerId
    || result.installationId !== customer.installationId || result.providerAppUserId !== customer.providerAppUserId) return fail(); return result;
}
export async function readIsolatedTestStoreV2NativeInvocation(dispatchId: string): Promise<TestStoreV2NativeInvocation | null> {
  build(); if (!testStoreUuid(dispatchId) || !native?.readInvocation) return fail(); const value = await native.readInvocation(dispatchId);
  return value === null ? null : invocation(value, dispatchId);
}
export async function retireIsolatedTestStoreV2NativeSession(sessionId: string): Promise<void> {
  if (!testStoreUuid(sessionId) || !native?.retireSession || !readIsolatedTestStoreV2Build()) return;
  await native.retireSession(sessionId);
}
