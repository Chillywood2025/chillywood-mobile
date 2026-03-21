import { hasPartyPassAccess, unlockPartyPass } from "./monetization";

export async function canJoinPartyRoom(partyId: string): Promise<boolean> {
  return hasPartyPassAccess(partyId);
}

export async function grantPartyPassAccess(partyId: string): Promise<boolean> {
  return unlockPartyPass(partyId);
}
