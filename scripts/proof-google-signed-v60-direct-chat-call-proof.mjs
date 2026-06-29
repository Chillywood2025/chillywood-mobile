#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const read = (relativePath) => {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};

const requireText = (label, content, needle) => {
  if (!content.includes(needle)) failures.push(`${label} missing required text: ${needle}`);
};

const doc = read("docs/release/GOOGLE_SIGNED_V60_DIRECT_CHAT_CALL_PROOF.md");
const packageJson = read("package.json");
const chatLib = read("_lib/chat.ts");
const userData = read("_lib/userData.ts");
const settings = read("app/settings.tsx");
const initialRepairMigration = read("supabase/migrations/20260628205325_chilly_chat_direct_thread_open_repair.sql");
const safetyMigration = read("supabase/migrations/20260628212500_chilly_chat_direct_thread_repair_safety_guards.sql");
const grantsMigration = read("supabase/migrations/20260628213000_chilly_chat_direct_thread_repair_execute_grants.sql");
const pairKeyMigration = read("supabase/migrations/20260628215750_chilly_chat_direct_thread_repair_ambiguous_pair_key.sql");
const memberUpsertMigration = read("supabase/migrations/20260628215943_chilly_chat_direct_thread_repair_member_upsert_constraint.sql");
const ownerReadbackMigration = read("supabase/migrations/20260628223157_chilly_chat_owner_initiated_thread_member_readback.sql");
const directMemberReadbackMigration = read("supabase/migrations/20260628223918_chilly_chat_direct_member_platform_owner_thread_readback.sql");
const callLib = read("_lib/chillyChatCalls.ts");
const communicationLib = read("_lib/communication.ts");
const threadScreen = read("app/chat/[threadId].tsx");
const communicationPanel = read("components/communication/in-room-communication-panel.tsx");
const participantGrid = read("components/communication/communication-participant-grid.tsx");
const responsiveLayout = read("hooks/use-responsive-layout.ts");
const inviteSheet = read("components/chat/internal-invite-sheet.tsx");
const adminReadModels = read("_lib/adminReadModels.ts");
const moderationLib = read("_lib/moderation.ts");
const platformIdentity = read("_lib/platformIdentity.ts");

[
  "Google-signed Play internal install proof: Closed / Partial / Blocked",
  "Final verdict: Partial",
  "installerPackageName must be com.android.vending",
  "Sideloaded APK proof is not accepted",
  "No logout, uninstall, reinstall, or clear-data happened",
  "Fresh remote profile must win over stale AsyncStorage",
  "Settings/Profile/Chat must agree on the current handle",
  "One user identity must render consistently across profile, chat, search, circle, followers, and following",
  "Circle/Followers/Following must not keep stale handle metadata as primary identity",
  "Existing inbox rows must not show stale participant metadata as primary identity",
  "Stale @user230456 is not Closed if it still appears as the primary inbox, circle, follower, following, or user-card identity",
  "Platform/owner/admin/moderator/creator surfaces must use the same fresh profile identity source as Chat/Profile/Search/Circle/Followers",
  "Role badges may show role/status, but they must not cause stale handle/name/avatar metadata to win",
  "The app must not confuse role identity with profile identity",
  "First Owner permissions and ownership rules were not changed",
  "Visible People result must open or create a direct thread",
  "Direct-thread repair must be authenticated and RLS-safe",
  "Unable to open Chi’lly Chat with this person right now is not Closed",
  "Receiver banner must resolve a valid readable direct thread",
  "This Chi’lly Chat thread could not be found is not Closed",
  "Receiver banner tap must join or open the correct call thread",
  "Same-thread proof is not enough",
  "Background push/ringing is Partial without installed-app evidence",
  "Video feed must not be cut off by bottom controls",
  "Participant metadata overlay must not block the center of the video",
  "Local and remote video must be visible on both phones",
  "Video tiles must adapt to phone size instead of hard-coded device hacks",
  "Cross-platform responsive support is not Closed without tested device/simulator coverage",
  "iOS/tablet/foldable proof remains Pending unless tested",
  "Fullscreen video fit is not Closed until proved on installed app",
  "Call end/decline/missed cleanup must be proved before full call closure",
  "Source fixed is not installed-app proof",
  "Google Play internal install is not enough without actual user flow proof",
  "If Robert/testers cannot reproduce it in the Google-signed Play-internal installed app, it is not actual-user Closed",
  "No auth/RLS/chat/account-status permission weakening happened",
  "No service-role chat proof was counted",
  "No service-role chat/social proof was counted",
  "No provider/live-money mutation happened",
  "liveMoneyEnabled remains OFF",
  "Repo Commit Proved",
  "Origin/Main Alignment",
  "Supabase RPC / Migration Verification",
  "Google Play Internal Build Result",
  "Google-Signed Install Verification",
  "Device Version / Installer Proof",
  "No Logout / No Data Reset Confirmation",
  "Fresh Profile Handle Result",
  "People Search Result",
  "Direct Thread Open/Create Repair Result",
  "Inbox/Search Call Path Result",
  "Existing Thread Call Path Result",
  "Normal Profile Call Path Result",
  "Receiver Same-Thread Result",
  "Receiver Elsewhere-In-App Result",
  "Receiver Background/Push Result",
  "Voice Call Result",
  "Video Call Local/Remote Result",
  "Fullscreen Video Fit Result",
  "Call End / Decline / Missed Cleanup Result",
  "Cross-Lane Issues Found",
  "Fixes Made",
  "Issues Documented But Not Fixed",
  "Remaining Launch Blockers",
  "Screenshots/XML/Log Artifact Paths",
  "Actual-User Proof Classification",
  "Safety Confirmation",
].forEach((needle) => requireText("v60 proof doc", doc, needle));

[
  "0b563c79384e5270440bc0ad076bbc4ca687bf57",
  "c08c4bd1d98d3ea6672df5c3441c8d7b232b6b82",
  "HEAD == origin/main",
  "8642fea7-b782-4c18-98c8-5805b6c7c20e",
  "VersionCode: `60`",
  "VersionName: `1.0.0`",
  "20260628211504 chilly_chat_direct_thread_open_repair",
  "20260628211710 chilly_chat_direct_thread_repair_safety_guards",
  "20260628211813 chilly_chat_direct_thread_repair_execute_grants",
  "Authenticated execute: true",
  "Anonymous execute: false",
  "Service-role execute: false",
  "Checks blocked relationship before thread insert: true",
  "Checks account access before thread insert: true",
  "Checks target profile exists before thread insert: true",
  "API probe result for anonymous caller: `exists_permission_denied_for_anon`",
  "R5CR120QCBF",
  "R3CXA0DS5JV",
  "com.chillywood.mobile",
  "com.android.vending",
  "versionCode `60`",
  "lastUpdateTime=2026-06-28 16:49:54",
  "lastUpdateTime=2026-06-28 16:49:28",
  "@user230455",
  "@user230456",
  "Build status: FINISHED",
  "Google Play internal testing upload status: delivered to internal testing",
  "Status: Passed for installed visible Chat search open/create after live RPC fixes.",
  "R5CR120QCBF` showed an app-wide incoming banner",
  "This Chi'lly Chat thread could not be found.",
  "Caller End Call returned both phones to readable direct-thread screens with `No Active Call`.",
  "20260628215838 chilly_chat_direct_thread_repair_ambiguous_pair_key",
  "20260628220027 chilly_chat_direct_thread_repair_member_upsert_constraint",
  "20260628223330 chilly_chat_owner_initiated_thread_member_readback",
  "20260628223918 chilly_chat_direct_member_platform_owner_thread_readback",
  "Receiver banner thread-readback fix",
  "callee_can_access=true",
  "thread_readable_by_callee=true",
  "callee_member_readable=true",
  "R5CR120QCBF` tapped the app-wide banner and joined the correct call surface",
  "Voice call active",
  "2 in call",
  "Participant",
  "false `Missed voice call`",
  "background push/ringing, decline/missed/background cleanup, user -> owner direction, and iOS/tablet/foldable responsive proof remain incomplete",
  "Responsive video call layout cleanup",
  "Responsive foundation added.",
  "Direct Chat video call layout adapts by dimensions and safe area.",
  "compactPhone",
  "regularPhone",
  "tallPhone",
  "largePhone",
  "tablet",
  "foldableOrExpanded",
  "landscape",
  "Google-signed v61 responsive video call proof",
  "Android two-phone installed proof passed",
  "iOS proof result: Pending",
  "Tablet/foldable proof result: Pending",
  "Whole-app responsive audit result",
  "bottom controls from covering the lower participant feed",
  "participant metadata is compact at the tile edge",
  "Fullscreen video fit is not Closed until proved on installed app",
  "bc2e9532-6a1e-4174-a153-679345c6ef20",
  "36c7bae7-4181-4c67-ac46-75070f76142f",
  "70b276c336b1164a674a8ae51b421e0a039d0d35",
  "VersionCode: `61`",
  "versionCode `61`",
  "lastUpdateTime=2026-06-28 19:06:13",
  "lastUpdateTime=2026-06-28 19:05:47",
  "R5CR120QCBF-video-call-banner-v61.png",
  "R5CR120QCBF-after-banner-tap-v61.png",
  "R3CXA0DS5JV-after-receiver-banner-tap-v61.png",
  "R3CXA0DS5JV-back-to-thread-during-call-v61.png",
  "R3CXA0DS5JV-final-after-second-end-v61.xml",
  "R5CR120QCBF-final-after-second-end-v61.xml",
  "Room `622ZK4` proved the first joined call; room `5ZVR4J` proved repeated call after end",
  "Closed for Google-signed v61 Android two-phone Direct Chat responsive video layout; Partial for full cross-platform responsive coverage and full call cleanup matrix.",
  "Cross-surface stale identity metadata fix",
  "Source fixed / installed proof pending v62+",
  "v62+ Google Play internal proof is still required",
].forEach((needle) => requireText("v60 proof facts", doc, needle));

[
  "proof:google-signed-v60-direct-chat-call-proof",
  "guard:google-signed-v60-direct-chat-call-policy",
].forEach((needle) => requireText("package scripts", packageJson, needle));

[
  "openOrRepairDirectThreadWithRpc",
  "get_or_create_direct_chat_thread",
  "return openOrRepairDirectThreadWithRpc(target);",
].forEach((needle) => requireText("direct chat repair client", chatLib, needle));

[
  "const remoteProfile = signedInUser.userId ? await readRemoteUserProfile(signedInUser.userId) : null;",
  "await writeJsonValue(USER_PROFILE_KEY, remoteProfile);",
  "refreshSignedInIdentitySnapshots",
  ".from(\"chat_thread_members\")",
  ".from(\"communication_room_memberships\")",
  ".from(\"watch_party_room_memberships\")",
].forEach((needle) => requireText("fresh profile source", userData, needle));

requireText("settings handle cache source", settings, "await saveUserProfile(updatedProfile);");
requireText("chat inbox freshness source", chatLib, "enrichChatThreadsWithUsernames");
requireText("chat inbox freshness source", chatLib, "table: CHAT_THREAD_MEMBERS_TABLE");
requireText("call identity freshness source", communicationLib, "profile,");
requireText("invite/user-card freshness source", inviteSheet, "displayName: target.displayName ?? existing?.displayName");
requireText("admin role identity freshness source", adminReadModels, "profileIdentityLabel");
requireText("admin role identity safety source", adminReadModels, "sanitizeProfileIdentityLabel");
requireText("platform role identity freshness source", moderationLib, "profileIdentityByUserId");
requireText("platform role identity freshness source", moderationLib, "formatUsernameHandle");
requireText("platform role identity safety source", moderationLib, "maskRoleEmailIdentity");
requireText("platform display identity freshness source", platformIdentity, "const handle = profileHandle ?? channelHandle ?? platformHandle");
requireText("initial direct thread repair migration", initialRepairMigration, "create or replace function public.get_or_create_direct_chat_thread");
requireText("initial direct thread repair migration", initialRepairMigration, "auth.uid()::text");
requireText("safety direct thread repair migration", safetyMigration, "public.\"assert_account_private_feature_allowed\"(actor_user_id, 'chat_direct_thread_open')");
requireText("safety direct thread repair migration", safetyMigration, "public.\"has_channel_audience_block_between\"(actor_user_id, normalized_target_user_id)");
requireText("safety direct thread repair migration", safetyMigration, "target_unavailable");
requireText("safety direct thread repair migration", safetyMigration, "revoke all on function public.get_or_create_direct_chat_thread(text, text, text, text) from anon;");
requireText("safety direct thread repair migration", safetyMigration, "revoke all on function public.get_or_create_direct_chat_thread(text, text, text, text) from service_role;");
requireText("direct thread repair grants migration", grantsMigration, "grant execute on function public.get_or_create_direct_chat_thread(text, text, text, text) to authenticated;");
requireText("pair key direct thread repair migration", pairKeyMigration, "v_participant_pair_key");
requireText("pair key direct thread repair migration", pairKeyMigration, "where thread.\"participant_pair_key\" = v_participant_pair_key");
requireText("member upsert direct thread repair migration", memberUpsertMigration, "on conflict on constraint chat_thread_members_pkey do update");
requireText("member upsert direct thread repair migration", memberUpsertMigration, "avoids ambiguous pair-key and member-upsert resolution");
requireText("owner readback migration", ownerReadbackMigration, "create or replace function public.can_access_chat_thread");
requireText("owner readback migration", ownerReadbackMigration, "explicit members of owner-created direct threads");
requireText("direct member readback migration", directMemberReadbackMigration, "create or replace function public.can_access_chat_thread");
requireText("direct member readback migration", directMemberReadbackMigration, "Direct threads that contain a platform owner remain member-only");
requireText("direct member readback migration", directMemberReadbackMigration, "public.\"has_channel_audience_block_between\"(actor.user_id, other_member.\"user_id\")");
requireText("call invite stale missed guard", callLib, "query = query.eq(\"status\", \"ringing\");");
requireText("call invite stale missed guard", callLib, "if (!updatedInvite) return null;");
requireText("banner auto accept source", threadScreen, "Incoming call could not be accepted. Ask the caller to start a new call.");
requireText("banner auto accept source", threadScreen, "status: \"accepted\"");
requireText("responsive layout hook", responsiveLayout, "export type DeviceClass");
requireText("responsive layout hook", responsiveLayout, "useWindowDimensions");
requireText("responsive layout hook", responsiveLayout, "useSafeAreaInsets");
requireText("responsive layout hook", responsiveLayout, "PixelRatio");
requireText("responsive layout hook", responsiveLayout, "getSafeBottomControlPadding");
requireText("responsive layout hook", responsiveLayout, "responsiveTileHeight");
requireText("responsive layout hook", responsiveLayout, "foldableOrExpanded");
requireText("responsive layout hook", responsiveLayout, "compactPhone");
requireText("responsive layout hook", responsiveLayout, "largePhone");
requireText("video call layout panel", communicationPanel, "const responsiveLayout = useResponsiveLayout();");
requireText("video call layout panel", communicationPanel, "paddingBottom: responsiveLayout.safeBottomPadding");
requireText("video call layout panel", communicationPanel, "minimumTouchTarget={responsiveLayout.minimumTouchTarget}");
requireText("video call layout panel", communicationPanel, "participantStageFullscreen");
requireText("video call layout grid", participantGrid, "const videoObjectFit = \"cover\";");
requireText("video call layout panel", communicationPanel, "responsiveLayout={responsiveLayout}");
requireText("video call layout grid", participantGrid, "responsiveLayout.videoTileGap");
requireText("video call layout grid", participantGrid, "isFullscreen && participants.length === 2 && styles.tileFullscreenSplit");
requireText("video call layout grid", participantGrid, "position: \"relative\"");
requireText("video call layout grid", participantGrid, "styles.bottomRow");

if (failures.length) {
  console.error("Google-signed v60 direct chat call proof failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Google-signed v60/v61 direct chat call proof passed.");
console.log("- Google Play v60 receiver-thread proof and v61 Android responsive video layout proof, artifact paths, remaining Partial scope, and safety boundaries are documented.");
