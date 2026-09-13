import { Platform } from "react-native";

import { redirectEarlyAndroidNativeCallSystemPath } from "../_lib/chillyChatNativeCallRouteBuffer";
import { sanitizeExternalNavigationInput } from "../_lib/externalNavigationInputSafety.mjs";
import { sanitizeExternalIosNativeCallPath } from "../_lib/nativeCallTransitionProvenance.mjs";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  const safePath = sanitizeExternalNavigationInput(path) ?? "/";
  if (Platform.OS === "android") return redirectEarlyAndroidNativeCallSystemPath(safePath);
  if (Platform.OS === "ios") return sanitizeExternalIosNativeCallPath(safePath);
  return safePath;
}
