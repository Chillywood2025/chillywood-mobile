import { createRemoteJWKSet, jwtVerify } from "jose";
import { createGatewayHandler } from "./gateway-core.mjs";

const jwksByDomain = new Map();

const verifyAccess = async (request, env) => {
  const token = request.headers.get("cf-access-jwt-assertion")?.trim() ?? "";
  const teamDomain = typeof env.CF_ACCESS_TEAM_DOMAIN === "string"
    ? env.CF_ACCESS_TEAM_DOMAIN.replace(/\/+$/u, "")
    : "";
  const audience =
    typeof env.CF_ACCESS_AUD === "string" ? env.CF_ACCESS_AUD : "";
  if (
    !token ||
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/u.test(teamDomain) ||
    !/^[a-f0-9]{64}$/u.test(audience)
  ) {
    return false;
  }
  let jwks = jwksByDomain.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${teamDomain}/cdn-cgi/access/certs`),
    );
    jwksByDomain.set(teamDomain, jwks);
  }
  try {
    await jwtVerify(token, jwks, {
      algorithms: ["RS256"],
      audience,
      issuer: teamDomain,
    });
    return true;
  } catch {
    return false;
  }
};

const handler = createGatewayHandler({ verifyAccess });

export default {
  fetch: handler,
};
