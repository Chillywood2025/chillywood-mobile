export const WATCH_PARTY_WAITING_ROOM_ENTRY_SOURCE = "watch-party-waiting-room";

export function resolveWatchPartyReturnNavigation({ canGoBack, entrySource }) {
  const normalizedEntrySource = String(entrySource ?? "").trim().toLowerCase();
  if (canGoBack && normalizedEntrySource === WATCH_PARTY_WAITING_ROOM_ENTRY_SOURCE) {
    return "back";
  }
  return "replace";
}
