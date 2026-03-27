import { Redirect } from "expo-router";

import { SupportScreen } from "../components/system/support-screen";
import { isClosedBetaEnvironment } from "../_lib/runtimeConfig";

export default function BetaSupportRoute() {
  if (!isClosedBetaEnvironment()) {
    return <Redirect href="/support" />;
  }

  return <SupportScreen />;
}
