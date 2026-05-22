# NEXT TASK

## Admin Content Programming Remaining Gaps

Admin Content Programming Center is repo-side implemented for the current UI/RPC lane. True remaining Content-tab gaps only:

- Start local Supabase or use a safe linked staging target, then run Supabase migration lint/apply proof for `202605220007_admin_content_programming_center.sql`.
- Run physical Android proof with a normal user to confirm `/admin` Content is hidden or backend-denied and no programming config, title action, creator grant, or content audit data leaks.
- Run physical Android proof with an owner/admin/operator to confirm Content loads, refresh works, title counts are real or honestly unavailable, theme presets render, selected-vs-saved preset state is clear, Save Config persists through `save_admin_content_config`, and the content audit timeline records the save.
- Prove title programming actions on Android for at least one safe test title: feature/unfeature, pin/unpin, trend/untrend, set/remove hero, sort, publish/unpublish, and archive/restore only through the reason-required confirmation path.
- Prove creator grants on Android only against a safe test creator account, with `save_admin_creator_grants` audit rows and no fake grants.
- Add richer Home preview/deep-link proof only after the public Home read path can safely return a resolved programming preview from the same saved config.
