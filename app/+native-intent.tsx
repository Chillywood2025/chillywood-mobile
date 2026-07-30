import { Platform } from "react-native";

import { redirectChillyChatNativeCallSystemPath } from "../_lib/chillyChatNativeCallRoutes.mjs";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  if (Platform.OS !== "android") return path;
  return redirectChillyChatNativeCallSystemPath(path);
}
