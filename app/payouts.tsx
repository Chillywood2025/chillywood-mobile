import { Redirect } from "expo-router";

export default function PayoutsRedirect() {
  return <Redirect href="/channel-studio?tab=monetization&focus=payouts" />;
}
