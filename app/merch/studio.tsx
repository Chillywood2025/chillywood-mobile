import { MerchStudioScreen } from "../../components/merch/merch-screens";
import { useLocalSearchParams } from "expo-router";
import { merchOrderHelpDestination } from "../../_lib/merchOrderHelp";
export default function MerchStudioRoute() {
  const { orderId, caseId } = useLocalSearchParams<{ orderId?: string; caseId?: string }>();
  return <MerchStudioScreen caseId={merchOrderHelpDestination(caseId, "creator")?.params.orderId} orderId={merchOrderHelpDestination(orderId, "creator")?.params.orderId} />;
}
