import * as Application from "expo-application";
import { Platform } from "react-native";
import { isIsolatedTestStoreV3Flavor, readIsolatedTestStoreV3Build } from "./isolatedTestStoreV3Build";
import { isIsolatedTestStoreFlavor } from "./isolatedTestStoreBuild";
import { isIsolatedTestStoreV2Flavor } from "./isolatedTestStoreV2Build";

// SHA256("native-paid-video-authoring-v1"). This is a public protocol selector,
// not build attestation, storage qualification or permission to buy anything.
// The server separately admits a qualified, default-off native media profile.
export const NATIVE_PAID_VIDEO_AUTHORING_CONFIGURATION = "8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0";
export function readPaidVideoAuthoringProfile(): Readonly<{ mode: "native" | "test_store_v3"; configId: string }> | null {
  if (isIsolatedTestStoreFlavor() || isIsolatedTestStoreV2Flavor()) return null;
  if (isIsolatedTestStoreV3Flavor()) {
    const build = readIsolatedTestStoreV3Build();
    return build ? Object.freeze({ mode: "test_store_v3", configId: build.configId }) : null;
  }
  if (Application.applicationId !== "com.chillywood.mobile" || !["ios", "android"].includes(Platform.OS)) return null;
  return Object.freeze({ mode: "native", configId: NATIVE_PAID_VIDEO_AUTHORING_CONFIGURATION });
}
