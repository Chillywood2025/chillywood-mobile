import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = {
  callback: read("app/auth-callback.tsx"),
  forgot: read("app/(auth)/forgot-password.tsx"),
  inbox: read("app/chat/index.tsx"),
  layout: read("app/_layout.tsx"),
  login: read("app/(auth)/login.tsx"),
  reset: read("app/reset-password.tsx"),
  signup: read("app/(auth)/signup.tsx"),
  surface: read("components/ui/chillywood-branded-surface.tsx"),
  thread: read("app/chat/[threadId].tsx"),
};
const assertIncludes = (value, markers, label) => {
  for (const marker of markers) {
    assert.ok(value.includes(marker), `${label} is missing ${marker}`);
  }
};
test("the canonical Chi'llywood foundation owns the skyline, overlay, glass, and brand reserve", () => {
  assertIncludes(source.surface, [
    'assets/images/chicago-skyline.jpg',
    'export const CHILLYWOOD_VISUAL',
    'export function ChillywoodBrandedSurface',
    'export function ChillywoodBrandReserve',
    'export function ChillywoodGlassPanel',
    'accessibilityLabel="Chi\'llywood. Stream the City."',
    'backgroundColor: "rgba(4,5,18,0.76)"',
    'glassBackground: "rgba(7,5,27,0.91)"',
    'borderColor: CHILLYWOOD_VISUAL.glassBorder',
  ], "shared visual foundation");
  assert.doesNotMatch(source.surface, /BlurView|Animated\.loop|setInterval/);
});
test("Sign In, Sign Up, and Forgot Password render the shared branded auth family", () => {
  assertIncludes(source.login, [
    '<ChillywoodBrandedSurface testID="auth-login-branded-surface">',
    'testID="auth-login-branding-clearance"',
    'testID="auth-login-glass-panel"',
  ], "Sign In");
  assertIncludes(source.signup, [
    '<ChillywoodBrandedSurface testID="auth-signup-branded-surface">',
    'testID="auth-signup-branding-clearance"',
    'testID="auth-signup-glass-panel"',
  ], "Sign Up");
  assertIncludes(source.forgot, [
    '<ChillywoodBrandedSurface testID="auth-forgot-password-branded-surface">',
    'testID="auth-forgot-password-branding-clearance"',
    'testID="auth-forgot-password-glass-panel"',
  ], "Forgot Password");
});
test("visible auth callback and password recovery states use the branded responsive shell", () => {
  assertIncludes(source.callback, [
    '<ChillywoodBrandedSurface testID="auth-callback-branded-surface">',
    'testID="auth-callback-branding-clearance"',
    'testID="auth-callback-glass-panel"',
    'contentContainerStyle={[',
    'Math.max(insets.bottom + 72, 96)',
  ], "auth callback");
  assertIncludes(source.reset, [
    '<ChillywoodBrandedSurface testID="auth-reset-password-branded-surface">',
    'testID="auth-reset-password-branding-clearance"',
    'testID="auth-reset-password-glass-panel"',
    'behavior={Platform.OS === "ios" ? "padding" : "height"}',
    'keyboardShouldPersistTaps="handled"',
    'Math.max(insets.bottom + 96, 120)',
  ], "reset password");
});
test("auth actions, route targets, legal controls, and keyboard behavior remain wired", () => {
  assertIncludes(source.login, [
    'supabase.auth.signInWithPassword',
    'router.push(`/forgot-password?${query.toString()}` as Href)',
    'pathname: "/(auth)/signup"',
    'behavior={Platform.OS === "ios" ? "padding" : "height"}',
  ], "Sign In behavior");
  assertIncludes(source.signup, [
    'supabase.auth.signUp',
    'checkUsernameAvailability',
    'testID="signup-age-confirmation-checkbox"',
    'testID="signup-legal-acceptance-checkbox"',
    'recordAccountLegalAcceptance',
    'pathname: "/(auth)/login"',
    'keyboardShouldPersistTaps="handled"',
  ], "Sign Up behavior");
  assertIncludes(source.forgot, [
    'supabase.auth.resetPasswordForEmail',
    'redirectTo: PASSWORD_RESET_REDIRECT_URL',
    'testID="forgot-password-submit-button"',
    'pathname: "/(auth)/login"',
  ], "Forgot Password behavior");
});
test("the post-login legal acceptance gate is branded and remains fail-closed", () => {
  assertIncludes(source.layout, [
    'testID="legal-acceptance-branded-surface"',
    'testID="legal-acceptance-glass-panel"',
    '<Text style={styles.legalGateKicker}>ACCOUNT REQUIREMENT</Text>',
    '<Text style={styles.legalGateTitle}>Review current policies</Text>',
    'recordAccountLegalAcceptance(supabase, authority.userId, "account", readback)',
    'if (!authority || !confirmed || busy) return',
    'disabled={!readback || !confirmed || busy}',
    'accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }}',
    'testID="legal-acceptance-submit-button"',
    'void supabase.auth.signOut()',
  ], "legal acceptance gate");
});
test("Chat Inbox and direct thread use the fixed branded chat shell", () => {
  assertIncludes(source.inbox, [
    'testID="chat-inbox-branded-surface"',
    'variant="chat"',
    'testID="chat-search-input"',
    'testID={`chat-thread-row-${item.threadId}`}',
    'Math.max(safeAreaInsets.bottom + 38, 52)',
  ], "Chat Inbox");
  assertIncludes(source.thread, [
    'testID="chat-thread-branded-surface"',
    'testID="chat-thread-screen"',
    'testID="chat-thread-messages-scroll"',
    'testID="chat-thread-composer"',
    'Platform.OS === "android" && composerFocused ? styles.composerKeyboardDocked : null',
    'Math.max(safeAreaInsets.bottom + 18, 28)',
  ], "direct Chat thread");
});
test("Chat call, message, attachment, navigation, and safety authority wiring is unchanged", () => {
  assert.equal(source.thread.match(/startChatThreadCall\(threadId, mode\)/g)?.length, 1);
  assertIncludes(source.thread, [
    'testID="chat-thread-voice-call-button"',
    'onPress={() => void handleStartCall("voice")}',
    'testID="chat-thread-video-call-button"',
    'onPress={() => void handleStartCall("video")}',
    'sendChatMessage(threadId, trimmedDraft, selectedAttachment)',
    'onSelect={handleSelectAttachment}',
    'testID="chat-message-report-button"',
    'onPress={() => router.back()}',
  ], "direct Chat behavior");
  assertIncludes(source.inbox, [
    'listChatThreads()',
    'subscribeToInbox',
    'getOrCreateDirectThread',
    'hideChatThreadFromInbox',
  ], "Chat Inbox behavior");
});
test("message and composer presentation keeps long content readable and input multiline", () => {
  assertIncludes(source.thread, [
    'maxWidth: "84%"',
    'lineHeight: 19',
    'multiline',
    'maxHeight: 120',
    'keyboardShouldPersistTaps="handled"',
  ], "message layout");
  assert.doesNotMatch(source.thread, /width:\s*\d{3,}[^\n]*messageBubble/);
});

test("visible recovery handlers preserve token safety and route authority", () => {
  assertIncludes(source.callback, [
    'consumeApplicationAuthInput(callbackRoute, "auth_callback")',
    'clearExactLocalAuthSession',
    'router.replace(targetRoute as Parameters<typeof router.replace>[0])',
  ], "auth callback security");
  assertIncludes(source.reset, [
    'consumeApplicationAuthInput',
    'beginPasswordRecoverySessionQuarantine',
    'persistVerifiedPasswordRecoveryBinding',
    'clearExactLocalAuthSession',
    'testID="reset-password-update-button"',
  ], "password recovery security");
  for (const presentationSource of [source.surface, source.login, source.signup, source.forgot, source.inbox]) {
    assert.doesNotMatch(presentationSource, /console\.(?:log|debug|info|warn|error)/);
    assert.doesNotMatch(presentationSource, /access_token|refresh_token|token_hash/);
  }
});
