import type { ImageSourcePropType, ImageURISource } from "react-native";

export type ProfileMediaImageAuthority = {
  accessToken?: string | null;
  authorityStatus?: string | null;
  projectUrl: string;
};

const PROFILE_MEDIA_FUNCTION_PATH = "/functions/v1/profile-media-public";

const normalizeAccessToken = (value?: string | null) => {
  const token = String(value ?? "").trim();
  return token && !/[\r\n]/u.test(token) ? token : "";
};

const projectOrigin = (projectUrl: string) => {
  try {
    const parsed = new URL(String(projectUrl ?? "").trim());
    if (parsed.username || parsed.password || parsed.pathname.replace(/\/+$/u, "")) return "";
    return parsed.origin;
  } catch {
    return "";
  }
};

export const isExactProjectProfileMediaUrl = (uri: unknown, projectUrl: string) => {
  const expectedOrigin = projectOrigin(projectUrl);
  if (!expectedOrigin) return false;

  try {
    const parsed = new URL(String(uri ?? "").trim());
    return parsed.origin === expectedOrigin
      && parsed.pathname === PROFILE_MEDIA_FUNCTION_PATH
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
};

export const sourceContainsExactProjectProfileMediaUrl = (
  source: ImageSourcePropType | undefined,
  projectUrl: string,
) => {
  if (!source || typeof source === "number") return false;
  return (Array.isArray(source) ? source : [source])
    .some((candidate) => isExactProjectProfileMediaUrl(candidate.uri, projectUrl));
};

const withoutCallerAuthorization = (headers?: Readonly<Record<string, string>>) => {
  if (!headers) return undefined;
  const sanitized = Object.fromEntries(
    Object.entries(headers).filter(([key]) => key.trim().toLowerCase() !== "authorization"),
  );
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
};

const bindUriSource = (
  source: ImageURISource,
  authority: ProfileMediaImageAuthority,
): ImageURISource => {
  if (!isExactProjectProfileMediaUrl(source.uri, authority.projectUrl)) return source;

  const sanitizedHeaders = withoutCallerAuthorization(source.headers);
  const accessToken = authority.authorityStatus === "active"
    ? normalizeAccessToken(authority.accessToken)
    : "";
  const headers = accessToken
    ? { ...sanitizedHeaders, Authorization: `Bearer ${accessToken}` }
    : sanitizedHeaders;

  return {
    ...source,
    cache: "reload",
    ...(headers ? { headers } : { headers: undefined }),
  };
};

export const bindProfileMediaImageSource = (
  source: ImageSourcePropType,
  authority: ProfileMediaImageAuthority,
): ImageSourcePropType => {
  if (Array.isArray(source)) {
    return source.map((candidate) => bindUriSource(candidate, authority));
  }
  if (typeof source === "number") return source;
  return bindUriSource(source, authority);
};
