import { createRemoteJWKSet, jwtVerify } from "jose";
import { createGatewayHandler } from "./gateway-core.mjs";

const jwksByDomain = new Map();

export const isExactAccessServiceToken = (
  payload,
  expectedCommonName,
) =>
  payload !== null &&
  typeof payload === "object" &&
  payload.type === "app" &&
  payload.sub === "" &&
  typeof payload.common_name === "string" &&
  /^[a-f0-9]{32}\.access$/u.test(expectedCommonName) &&
  payload.common_name === expectedCommonName;

const verifyAccess = async (request, env) => {
  const token = request.headers.get("cf-access-jwt-assertion")?.trim() ?? "";
  const teamDomain = typeof env.CF_ACCESS_TEAM_DOMAIN === "string"
    ? env.CF_ACCESS_TEAM_DOMAIN.replace(/\/+$/u, "")
    : "";
  const audience =
    typeof env.CF_ACCESS_AUD === "string" ? env.CF_ACCESS_AUD : "";
  const expectedCommonName =
    typeof env.CF_ACCESS_SERVICE_TOKEN_COMMON_NAME === "string"
      ? env.CF_ACCESS_SERVICE_TOKEN_COMMON_NAME
      : "";
  if (
    !token ||
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/u.test(teamDomain) ||
    !/^[a-f0-9]{64}$/u.test(audience) ||
    !/^[a-f0-9]{32}\.access$/u.test(expectedCommonName)
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
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ["RS256"],
      audience,
      issuer: teamDomain,
    });
    return isExactAccessServiceToken(payload, expectedCommonName);
  } catch {
    return false;
  }
};

const handler = createGatewayHandler({ verifyAccess });

export default {
  fetch: handler,
};
