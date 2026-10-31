import { useLocalSearchParams } from "expo-router";
import { merchOrderHelpDestination } from "../../_lib/merchOrderHelp";
import { MerchOrdersScreen } from "../../components/merch/merch-screens";
export default function MerchOrdersRoute() { const { orderId, caseId } = useLocalSearchParams<{ orderId?: string; caseId?: string }>(); return <MerchOrdersScreen caseId={merchOrderHelpDestination(caseId, "buyer")?.params.orderId} orderId={typeof orderId === "string" ? orderId : undefined} />; }
