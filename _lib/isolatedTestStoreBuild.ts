import * as Application from "expo-application";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type IsolatedTestStoreBuild = Readonly<{
  protocol: "isolated-test-store-build-v1"; mode: "test-store-debug"; platform: "ios" | "android";
  applicationId: "com.chillywood.mobile.teststoredebug"; projectId: string; appId: string;
  publicSdkKey: string; configId: string; storageNamespace: "@chillywood/test-store-debug-v1"; nativeDebug: true;
}>;
type NativeAdmission = { isolatedTestStoreFlavor?: unknown; build?: unknown;
  configureTestStore?: (providerAppUserId: string) => Promise<unknown>;
  ownsProviderIdentity?: (providerAppUserId: string) => Promise<unknown> };
let native: NativeAdmission | null = null;
try { native = requireOptionalNativeModule<NativeAdmission>("ChillywoodTestStoreAdmission"); } catch { /* Unavailable must not admit configuration. */ }
const APPLICATION_ID = "com.chillywood.mobile.teststoredebug";
export function isIsolatedTestStoreFlavor(): boolean {
  return Application.applicationId === APPLICATION_ID || native?.isolatedTestStoreFlavor === true;
}
export function readIsolatedTestStoreBuild(): IsolatedTestStoreBuild | null {
  const value = native?.build;
  if (!isIsolatedTestStoreFlavor() || Application.applicationId !== APPLICATION_ID || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const expected = ["protocol", "mode", "platform", "applicationId", "projectId", "appId", "publicSdkKey", "configId", "storageNamespace", "nativeDebug"];
  if (Object.keys(v).length !== expected.length || !expected.every(k => Object.hasOwn(v, k))
    || v.protocol !== "isolated-test-store-build-v1" || v.mode !== "test-store-debug" || v.nativeDebug !== true
    || v.platform !== Platform.OS || (v.platform !== "ios" && v.platform !== "android") || v.applicationId !== APPLICATION_ID
    || v.storageNamespace !== "@chillywood/test-store-debug-v1" || typeof v.projectId !== "string" || !/^[A-Za-z0-9_-]{4,100}$/u.test(v.projectId)
    || typeof v.appId !== "string" || !/^[A-Za-z0-9_-]{4,100}$/u.test(v.appId)
    || typeof v.publicSdkKey !== "string" || !/^test_[A-Za-z0-9_-]{8,200}$/u.test(v.publicSdkKey)
    || typeof v.configId !== "string" || !/^[a-f0-9]{64}$/u.test(v.configId)) return null;
  return Object.freeze({ ...v }) as IsolatedTestStoreBuild;
}
let attempted = false;
export async function configureIsolatedTestStoreNative(providerAppUserId: string): Promise<Readonly<{ configured: true; configId: string; providerAppUserId: string }>> {
  const build = readIsolatedTestStoreBuild();
  if (!build || !native?.configureTestStore || attempted
    || !/^scv1_teststore_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(providerAppUserId))
    throw new Error("TEST_STORE_NATIVE_ADMISSION_UNAVAILABLE");
  attempted = true;
  const value = await native.configureTestStore(providerAppUserId);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("TEST_STORE_NATIVE_CONFIGURATION_UNKNOWN");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(",") !== "configId,configured,providerAppUserId" || v.configured !== true
    || v.configId !== build.configId || v.providerAppUserId !== providerAppUserId) throw new Error("TEST_STORE_NATIVE_CONFIGURATION_UNKNOWN");
  return Object.freeze({ configured: true, configId: build.configId, providerAppUserId });
}
export async function ownsIsolatedTestStoreProviderIdentity(providerAppUserId: string): Promise<boolean> {
  if (!readIsolatedTestStoreBuild() || !native?.ownsProviderIdentity) return false;
  try { return await native.ownsProviderIdentity(providerAppUserId) === true; } catch { return false; }
}
