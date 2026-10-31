/** Presentation hint only: actual auctions and all actions remain server-authorized. */
export function readAuctionNavigation(params: Record<string, unknown>, expected: string): string | null {
  const { auctionId, auctionTarget, auctionExpiresAt } = params;
  return typeof auctionId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(auctionId)
    && auctionTarget === expected && typeof auctionExpiresAt === "string"
    && Number.isFinite(Date.parse(auctionExpiresAt)) && Date.parse(auctionExpiresAt) > Date.now()
    ? auctionId.toLowerCase() : null;
}
