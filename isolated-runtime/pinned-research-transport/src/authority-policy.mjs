import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const researchAuthorities = require(
  "../../../config/intelligence/research-authorities.json",
);

const AUTHORITIES = new Map(
  researchAuthorities.authorities.map((authority) => [
    authority.authorityId,
    Object.freeze({
      hostname: authority.hostname.toLowerCase(),
      pathPrefix: authority.pathPrefix ?? null,
    }),
  ]),
);

export const authorityAllowsPinnedResearchUrl = (authorityId, rawUrl) => {
  const authority = AUTHORITIES.get(authorityId);
  if (!authority || typeof rawUrl !== "string") return false;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname.toLowerCase() !== authority.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.toString() !== rawUrl
  ) {
    return false;
  }
  return authority.pathPrefix === null ||
    parsed.pathname === authority.pathPrefix ||
    parsed.pathname.startsWith(`${authority.pathPrefix}/`);
};
