import { Redirect } from "expo-router";

export default function CreatorMonetizationSetupRedirect() {
  return <Redirect href="/channel-studio?tab=monetization&focus=offers" />;
}
