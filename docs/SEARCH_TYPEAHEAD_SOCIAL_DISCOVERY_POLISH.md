# Search, Typeahead And Social Discovery Polish

Date: June 6, 2026

## Search Audit Matrix

| Screen | File path | Current search source | Query model | Live typing/filtering | Suggestions | Clear button | Loading state | Empty state | Blocking/privacy safe? | Test IDs present | Fix status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chi’lly Chat inbox | `app/chat/index.tsx` | `listChatThreads()` for thread-backed results; `searchPublicPeople(query, { limit: 6 })` for People suggestions | Thread fields and People RPC filter on demand | Yes (local thread filter from current search query) | Yes (People suggestions panel for min 2 chars, plus thread cards) | Yes (`chat-search-clear-button`) | Chat participants empty states + people error/loading states | Uses safe thread/public member fields; blocked/invalid/private chat payloads remain unchanged | `chat-search-input`, `chat-search-clear-button`, `chat-search-suggestion-row-{index}` | Implemented |
| Chi’lly Circle / Rachi | `app/chilly-circle.tsx` with helper `listMyChillyCircle`, `listIncomingChillyCircleRequests`, `listOutgoingChillyCircleRequests`, `searchPublicPeople(query, { limit: 10 })` | Local lists + optional public People RPC | Local arrays + People RPC search by debounced query | Yes (local list filter + debounced `searchPublicPeople`) | Yes (Search suggestions grouped by Circle/Requests/People/Official) | Yes (`chilly-circle-search-clear-button`) | List/section empty states + suggestion no-result states | Uses local identity list data + public People RPC policy filtering; official result uses only official account metadata | `chilly-circle-search-input`, `chilly-circle-search-clear-button`, `chilly-circle-suggestion-row-{kind}-{rowIndex}` | Implemented |
| Home Explore discovery | `app/(tabs)/explore.tsx` | `titles`, `searchPublicPeople`, `readPublicDiscoveryFeedItems`, `readLatestPublicCreatorVideos`, `readLatestPublicEventSummaries` | Debounced `searchQuery` + local scope filters | Yes (local scope filter + people RPC debounced) | Yes (`home-explore-typeahead-results`, `home-explore-suggestion-row-*`) | Yes (`home-explore-search-clear-button`) | Typeahead empty/result states and search section empty states | Uses existing public feeds/models; people search respects platform/public policy | `home-explore-search-input`, `home-explore-search-clear-button`, `home-explore-suggestion-row-{group}-{id}`, plus guard-required `explore-typeahead-results` for legacy compatibility | Implemented |

## Chi’lly Chat

- Thread search stays on local/backed threads and supports direct/in-call/thread state labels.
- People suggestions call `searchPublicPeople` when query length is at least 2 chars.
- Empty states are compact and use honest copy.
- No fake threads/people rows are added.

## Chi’lly Circle

- Search now debounces input, filters local Circle/requests lists, and optionally enriches with People suggestions.
- Rachi is shown as a compact official card with direct action; no private-chat-only copy.
- Official/empty/section states are concise and compact.

## Home Explore

- Search now keeps a debounced live query and grouped typeahead rows.
- Scope and content filters are kept in place for existing public-safe sources.
- No fake title/platform/live/content rows are introduced.
- Suggestion rows and search sections are compact and action-safe.

## Safety/Blocking Coverage

- No fake users, fake relationships, fake comments, or fake room stats introduced.
- Chat/Circle People search is policy-limited by existing public People RPC and thread/relationship policy.
- No private identities, raw emails, or blocked/admin/security metadata are shown in public search surfaces.
- Search result display and copy still avoid “Mini Platform” and social-friendship phrasing.

## Proof Path

- Proof path prepared at `/tmp/chillywood-search-typeahead-social-discovery-proof-20260605/`.

- Required captures:
  - Chi’lly Chat: empty state before/after search and people/typeahead suggestions.
  - Chi’lly Circle: search/input/finding behavior, suggestions per section, compact official row, and compact empty states.
  - Home Explore: scoped search/typeahead groups and people/content results and no private/content-unsafe leakage.
- Android proof should include keyboard-safe behavior for active search and results overlays.

## Remaining Gaps

- Android visual proof capture is not yet in this repo and remains required before final closeout.
- Search behavior for Explore is scoped to existing public-backed sources only; if a new backend purpose-built social index is needed later, this remains a future product lane.
