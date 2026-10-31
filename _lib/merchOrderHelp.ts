// Route context is never order authority. Both destinations perform their own
// exact-session buyer/creator ownership reads.
export function merchOrderHelpDestination(orderId: unknown, orderRole: unknown) {
  if (typeof orderId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) return null;
  return { pathname: orderRole === "creator" ? "/merch/studio" as const : "/merch/orders" as const, params: { orderId } };
}
