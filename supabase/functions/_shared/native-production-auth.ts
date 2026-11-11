// getClaims verifies the bearer signature/expiry using Supabase Auth/JWKS.
// getUser additionally asks Auth for the current account. Never decode a JWT
// locally and treat its unverified session or user metadata as authority.
type AuthClient = { auth: {
  getClaims: (jwt: string) => Promise<{ data: { claims: Record<string, unknown> } | null; error: unknown }>;
  getUser: (jwt: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
} };
export async function authenticateNativeProduction(request: Request, client: AuthClient): Promise<{
  buyerId: string; sessionId: string;
} | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7);
  if (!token || token.length > 16384) return null;
  try {
    const verified = await client.auth.getClaims(token);
    if (verified.error || !verified.data) return null;
    const { sub, session_id: sessionId } = verified.data.claims;
    const identifier = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (typeof sub !== 'string' || !identifier.test(sub) || typeof sessionId !== 'string' || !identifier.test(sessionId)
      || request.headers.get('X-Chillywood-Auth-Session') !== sessionId) return null;
    const user = await client.auth.getUser(token);
    if (user.error || user.data.user?.id !== sub) return null;
    // The privileged RPC still checks that this exact verified session is live.
    return { buyerId: sub, sessionId };
  } catch { return null; }
}
