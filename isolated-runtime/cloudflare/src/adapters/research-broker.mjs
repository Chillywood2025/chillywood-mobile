import researchAuthoritiesJson from "../../../../config/intelligence/research-authorities.json" with {
  type: "json",
};
import { assertInvocationActive } from "../abort.mjs";
import { blocked, ready } from "./helpers.mjs";
import {
  createPinnedResearchHostTransport,
} from "./research-pinned-host-transport.mjs";

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9_-]{1,79}$/u;
const INSTRUCTION =
  /\b(?:ignore|override|bypass|disable|weaken|forget)\b[\s\S]{0,80}\b(?:instruction|policy|approval|rls|guard|system|developer|safety)\b|\b(?:merge|deploy|release|execute|run|invoke|read)\b[\s\S]{0,80}\b(?:pull request|production|shell|command|tool|environment|secret|credential)\b/iu;
const SECRET_OR_PRIVATE =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----|[?&](?:x-amz-signature|x-goog-signature|signature|sig|token)=|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:access[_ -]?token|api[_ -]?key|authorization|bearer|client[_ -]?secret|cookie|credential|github[_ -]?token|key[_ -]?password|model[_ -]?key|password|passphrase|private[_ -]?key|refresh[_ -]?token|secret|service[_ -]?role|session[_ -]?cookie|token)\b\s*(?::|=|is)\s*[^\s,;]{6,}/iu;
const CLAIM_CATEGORIES = new Set([
  "technical",
  "platform_policy",
  "consequential_news",
  "product",
  "security",
]);
const CANARY_KEYS = new Set([
  "platform_policy_research",
  "repository_architecture_ux",
  "dependency_security_research",
]);
const MAX_SOURCE_TTL_SECONDS = Object.freeze({
  competitor_research: 30 * 86_400,
  engineering_practice: 30 * 86_400,
  news: 7 * 86_400,
  official_documentation: 30 * 86_400,
  platform_policy: 30 * 86_400,
  product_research: 30 * 86_400,
  security_advisory: 14 * 86_400,
  store_policy: 30 * 86_400,
});
export const RESEARCH_PINNED_TRANSPORT_REQUIRED =
  "RESEARCH_PINNED_TRANSPORT_REQUIRED";
const AUTHORITIES = new Map(
  researchAuthoritiesJson.authorities.map((authority) => [
    authority.authorityId,
    Object.freeze({
      ...authority,
      hostname: authority.hostname.toLowerCase(),
    }),
  ]),
);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, keys) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
};

const boundedText = (value, minimum, maximum) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= minimum &&
      normalized.length <= maximum &&
      new TextEncoder().encode(normalized).byteLength <= maximum * 4
    ? normalized
    : null;
};

const isSecuritySafeText = (value) => {
  if (typeof value !== "string") return false;
  const normalized = value.normalize("NFKC").replace(
    /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\uffa0]/gu,
    "",
  );
  return new TextEncoder().encode(normalized).byteLength <= 4_000 &&
    !INSTRUCTION.test(normalized) &&
    !SECRET_OR_PRIVATE.test(normalized);
};

export const canonicalizeResearchUrl = (raw) => {
  if (typeof raw !== "string" || raw.length < 12 || raw.length > 2_048) {
    return null;
  }
  const normalized = raw.normalize("NFKC").replace(
    /[\u3002\uff0e\uff61]/gu,
    ".",
  );
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (parsed.port && parsed.port !== "443")
  ) {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    !/^[a-z0-9.-]+$/u.test(hostname) ||
    hostname.includes("..")
  ) {
    return null;
  }
  parsed.hostname = hostname;
  parsed.port = "";
  const canonical = parsed.toString();
  return isSecuritySafeText(canonical)
    ? Object.freeze({
      canonical,
      hostname,
      pathAndQuery: `${parsed.pathname}${parsed.search}`,
      pathname: parsed.pathname,
    })
    : null;
};

export const authorityForSource = (
  authorityId,
  target,
  publisher,
  sourceType,
) => {
  const authority = AUTHORITIES.get(authorityId);
  if (
    !authority ||
    authority.hostname !== target.hostname ||
    authority.publisher !== publisher ||
    authority.sourceType !== sourceType ||
    (
      authority.pathPrefix !== undefined &&
      target.pathname !== authority.pathPrefix &&
      !target.pathname.startsWith(`${authority.pathPrefix}/`)
    )
  ) {
    return null;
  }
  return authority;
};

const authorityOwnerForId = (authorityId) =>
  AUTHORITIES.get(authorityId)?.ownerId ?? null;

const normalizeScope = (payload) =>
  payload.platform === "shared" &&
    payload.environment === "production" &&
    typeof payload.taskId === "string" &&
    UUID.test(payload.taskId) &&
    typeof payload.projectId === "string" &&
    UUID.test(payload.projectId);

export const normalizeSourceRequest = (payload) => {
  const keys = [
    "action",
    "authorityId",
    "citationLocator",
    "citationTitle",
    "environment",
    "evidenceQuery",
    "freshnessSeconds",
    "platform",
    "projectId",
    "publisher",
    "sourceType",
    "taskId",
    "url",
  ];
  if (
    !exactKeys(payload, keys) ||
    payload.action !== "retrieve_source" ||
    !normalizeScope(payload)
  ) {
    return null;
  }
  const authorityId = boundedText(payload.authorityId, 2, 80);
  const publisher = boundedText(payload.publisher, 1, 120);
  const sourceType = boundedText(payload.sourceType, 2, 80);
  const citationTitle = boundedText(payload.citationTitle, 1, 512);
  const citationLocator = boundedText(payload.citationLocator, 1, 512);
  const evidenceQuery = boundedText(payload.evidenceQuery, 4, 512);
  const url = canonicalizeResearchUrl(payload.url);
  const maximumTtl = sourceType
    ? MAX_SOURCE_TTL_SECONDS[sourceType]
    : undefined;
  if (
    !authorityId ||
    !SAFE_IDENTIFIER.test(authorityId) ||
    !publisher ||
    !sourceType ||
    !SAFE_IDENTIFIER.test(sourceType) ||
    !citationTitle ||
    !citationLocator ||
    !evidenceQuery ||
    !isSecuritySafeText(evidenceQuery) ||
    !url ||
    !authorityForSource(authorityId, url, publisher, sourceType) ||
    !Number.isSafeInteger(payload.freshnessSeconds) ||
    maximumTtl === undefined ||
    payload.freshnessSeconds < 300 ||
    payload.freshnessSeconds > maximumTtl
  ) {
    return null;
  }
  if (
    authorityId === "chillywood-public-repository" &&
    !/^\/Chillywood2025\/chillywood-mobile\/commit\/[a-f0-9]{40}$/u.test(
      url.pathname,
    )
  ) {
    return null;
  }
  return Object.freeze({
    ...payload,
    authorityId,
    citationLocator,
    citationTitle,
    evidenceQuery,
    publisher,
    sourceType,
    url: url.canonical,
  });
};

export const normalizeClaimRequest = (payload, now = Date.now()) => {
  const keys = [
    "action",
    "boundedClaim",
    "canaryKey",
    "category",
    "confidence",
    "contradictionState",
    "environment",
    "freshnessDeadline",
    "platform",
    "projectId",
    "sourceIds",
    "taskId",
  ];
  if (
    !exactKeys(payload, keys) ||
    payload.action !== "record_claim" ||
    !normalizeScope(payload) ||
    !CANARY_KEYS.has(payload.canaryKey) ||
    !CLAIM_CATEGORIES.has(payload.category) ||
    payload.contradictionState !== "none" ||
    typeof payload.confidence !== "number" ||
    !Number.isFinite(payload.confidence) ||
    payload.confidence < 0 ||
    payload.confidence > 1 ||
    !Array.isArray(payload.sourceIds) ||
    payload.sourceIds.length < 1 ||
    payload.sourceIds.length > 8 ||
    payload.sourceIds.some((id) => typeof id !== "string" || !UUID.test(id)) ||
    new Set(payload.sourceIds).size !== payload.sourceIds.length
  ) {
    return null;
  }
  const boundedClaim = boundedText(payload.boundedClaim, 4, 2_000);
  const freshness = typeof payload.freshnessDeadline === "string"
    ? Date.parse(payload.freshnessDeadline)
    : Number.NaN;
  if (
    !boundedClaim ||
    !isSecuritySafeText(boundedClaim) ||
    !Number.isFinite(freshness) ||
    freshness <= now ||
    freshness > now + 30 * 86_400_000
  ) {
    return null;
  }
  return Object.freeze({
    ...payload,
    boundedClaim,
    freshnessDeadline: new Date(freshness).toISOString(),
    sourceIds: Object.freeze([...payload.sourceIds]),
  });
};

export const normalizeContradictionRequest = (payload) => {
  const keys = [
    "action",
    "boundedEvidence",
    "claimId",
    "environment",
    "platform",
    "projectId",
    "sourceId",
    "taskId",
  ];
  if (
    !exactKeys(payload, keys) ||
    payload.action !== "detect_contradiction" ||
    !normalizeScope(payload) ||
    typeof payload.claimId !== "string" ||
    !UUID.test(payload.claimId) ||
    typeof payload.sourceId !== "string" ||
    !UUID.test(payload.sourceId)
  ) {
    return null;
  }
  const boundedEvidence = boundedText(payload.boundedEvidence, 4, 2_000);
  return boundedEvidence && isSecuritySafeText(boundedEvidence)
    ? Object.freeze({ ...payload, boundedEvidence })
    : null;
};

export const normalizeMaintenanceRequest = (payload) => {
  const keys = [
    "action",
    "environment",
    "limit",
    "platform",
    "projectId",
    "taskId",
  ];
  return exactKeys(payload, keys) &&
      payload.action === "expire_public_memory" &&
      normalizeScope(payload) &&
      Number.isSafeInteger(payload.limit) &&
      payload.limit >= 1 &&
      payload.limit <= 100
    ? Object.freeze({ ...payload })
    : null;
};

const serviceToken = (env) => {
  const token = typeof env.COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN === "string"
    ? env.COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN.trim()
    : "";
  const length = new TextEncoder().encode(token).byteLength;
  if (length < 32 || length > 512) {
    throw new Error("research_broker_configuration_rejected");
  }
  return token;
};

const sha256Hex = async (value) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const decodeHtmlEntities = (value) =>
  value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'");

export const extractBoundedExcerpt = (
  body,
  contentType,
  evidenceQuery,
) => {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (
    ![
      "application/feed+json",
      "application/json",
      "text/html",
      "text/plain",
    ].includes(mediaType)
  ) {
    return null;
  }
  let text = body;
  if (mediaType === "text/html") {
    text = text
      .replace(/<!--[\s\S]*?-->/gu, " ")
      .replace(/<(script|style|form|noscript|svg)\b[\s\S]*?<\/\1\s*>/giu, " ")
      .replace(
        /<[^>]+(?:hidden|display\s*:\s*none)[^>]*>[\s\S]*?<\/[^>]+>/giu,
        " ",
      )
      .replace(/<[^>]+>/gu, " ");
    text = decodeHtmlEntities(text);
  }
  text = text.replace(/\s+/gu, " ").trim();
  const query = evidenceQuery?.replace(/\s+/gu, " ").trim();
  if (
    query !== undefined &&
    (
      query.length < 4 ||
      query.length > 512 ||
      !isSecuritySafeText(query)
    )
  ) {
    return null;
  }
  const matchAt = query === undefined
    ? 0
    : text.toLocaleLowerCase("en-US").indexOf(
      query.toLocaleLowerCase("en-US"),
    );
  if (matchAt < 0) return null;
  const start = query === undefined
    ? 0
    : Math.max(0, Math.min(matchAt - 600, text.length - 2_000));
  const bounded = text.slice(start, start + 2_000).trim();
  return bounded && isSecuritySafeText(bounded) ? bounded : null;
};

const parseTagAttributes = (source) => {
  const attributes = new Map();
  for (
    const match of source.matchAll(
      /([a-z_:][a-z0-9_.:-]*)\s*=\s*(["'])([\s\S]*?)\2/giu,
    )
  ) {
    const name = match[1].toLowerCase();
    if (!attributes.has(name)) {
      attributes.set(name, decodeHtmlEntities(match[3].trim()));
    }
  }
  return attributes;
};

const schemaTypes = (value) => {
  const values = Array.isArray(value) ? value : [value];
  return Object.freeze(
    values
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
};

const schemaIdentifier = (value) => {
  if (typeof value === "string") return value.trim() || null;
  if (
    isRecord(value) &&
    typeof value["@id"] === "string" &&
    value["@id"].trim()
  ) {
    return value["@id"].trim();
  }
  return null;
};

const schemaIdentifiers = (value) => {
  const values = Array.isArray(value) ? value : [value];
  return Object.freeze(values.map(schemaIdentifier).filter(Boolean));
};

const isArticleNode = (value) =>
  schemaTypes(value["@type"]).some((type) =>
    [
      "article",
      "blogposting",
      "newsarticle",
      "report",
      "scholarlyarticle",
      "techarticle",
    ].includes(type)
  );

const primaryJsonLdNodes = (root) => {
  const graph = Array.isArray(root["@graph"])
    ? root["@graph"].filter(isRecord)
    : [];
  if (graph.length < 1) return Object.freeze([root]);

  const referenced = new Set([
    ...schemaIdentifiers(root.mainEntity),
    ...graph.flatMap((node) =>
      schemaTypes(node["@type"]).includes("webpage")
        ? schemaIdentifiers(node.mainEntity)
        : []
    ),
  ]);
  const explicitlyPrimary = graph.filter((node) => {
    const nodeId = schemaIdentifier(node["@id"]);
    return (
      (nodeId !== null && referenced.has(nodeId)) ||
      node.mainEntityOfPage === true ||
      schemaIdentifier(node.mainEntityOfPage) !== null
    );
  });
  if (explicitlyPrimary.length > 0) {
    return Object.freeze(explicitlyPrimary);
  }
  const articles = graph.filter(isArticleNode);
  return Object.freeze(articles.length === 1 ? articles : []);
};

const extractJsonLdRoots = (body) => {
  const roots = [];
  for (
    const match of body.matchAll(
      /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json(?:\s*;\s*charset=[^"']+)?["'][^>]*>([\s\S]*?)<\/script\s*>/giu,
    )
  ) {
    try {
      roots.push(JSON.parse(decodeHtmlEntities(match[1])));
    } catch {
      // Malformed structured data is not trusted publication evidence.
    }
  }
  return Object.freeze(roots);
};

const hasSchemaOrgContext = (value) => {
  const contexts = Array.isArray(value) ? value : [value];
  return contexts.some((entry) =>
    typeof entry === "string" &&
    /^https?:\/\/schema\.org\/?$/iu.test(entry.trim())
  );
};

export const extractPublicationDateCandidates = (
  body,
  contentType,
  now = Date.now(),
  lastModifiedHeader = null,
) => {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (
    ![
      "application/feed+json",
      "application/json",
      "text/html",
      "text/plain",
    ].includes(mediaType)
  ) {
    return Object.freeze([]);
  }
  const candidates = [];
  const append = (raw, evidenceClass, label, priority) => {
    if (typeof raw !== "string" || raw.length < 4 || raw.length > 80) return;
    const parsed = Date.parse(decodeHtmlEntities(raw.trim()));
    if (!Number.isFinite(parsed) || parsed > now + 300_000) return;
    candidates.push(Object.freeze({
      date: new Date(parsed).toISOString(),
      evidenceClass,
      label,
      priority,
    }));
  };
  const appendJsonLd = (rootValue, explicitlyJsonLd) => {
    const roots = Array.isArray(rootValue) ? rootValue : [rootValue];
    for (const root of roots.filter(isRecord)) {
      for (const node of primaryJsonLdNodes(root)) {
        const article = isArticleNode(node);
        if (
          !article &&
          !explicitlyJsonLd &&
          !hasSchemaOrgContext(root["@context"]) &&
          !hasSchemaOrgContext(node["@context"])
        ) {
          continue;
        }
        append(
          node.datePublished,
          "publication",
          article
            ? "json_ld_article_date_published"
            : "schema_org_date_published",
          article ? 10 : 20,
        );
        append(
          node.dateModified,
          "modification",
          article
            ? "json_ld_article_date_modified"
            : "schema_org_date_modified",
          article ? 110 : 120,
        );
      }
    }
  };

  if (mediaType === "text/html") {
    for (const root of extractJsonLdRoots(body)) appendJsonLd(root, true);
    for (const match of body.matchAll(/<meta\b[^>]{0,2048}>/giu)) {
      const attributes = parseTagAttributes(match[0]);
      const label = (
        attributes.get("property") ??
          attributes.get("name") ??
          attributes.get("itemprop") ??
          ""
      ).toLowerCase();
      const value = attributes.get("content");
      if (label === "article:published_time") {
        append(value, "publication", "open_graph_published_time", 30);
      } else if (label === "article:modified_time") {
        append(value, "modification", "open_graph_modified_time", 130);
      } else if (label === "datepublished") {
        append(value, "publication", "schema_org_date_published", 20);
      } else if (label === "datemodified") {
        append(value, "modification", "schema_org_date_modified", 120);
      } else if (
        ["publication_date", "publish-date", "published"].includes(label)
      ) {
        append(
          value,
          "publication",
          "publisher_labeled_publication_date",
          40,
        );
      } else if (["modified", "modified-date"].includes(label)) {
        append(
          value,
          "modification",
          "publisher_labeled_modified_date",
          140,
        );
      }
    }
    for (
      const match of body.matchAll(
        /<time\b([^>]{0,2048})>([\s\S]{0,256}?)<\/time\s*>/giu,
      )
    ) {
      const attributes = parseTagAttributes(match[1]);
      const itemProp = (attributes.get("itemprop") ?? "").toLowerCase();
      const label = decodeHtmlEntities(match[2])
        .replace(/<[^>]+>/gu, " ")
        .replace(/\s+/gu, " ")
        .trim()
        .toLowerCase();
      const value = attributes.get("datetime") ?? attributes.get("content");
      if (
        itemProp === "datepublished" ||
        /^(?:first\s+)?published(?:\s+(?:at|on))?\b/u.test(label) ||
        /^publication\s+date\b/u.test(label)
      ) {
        append(
          value,
          "publication",
          itemProp === "datepublished"
            ? "schema_org_date_published"
            : "publisher_labeled_publication_date",
          itemProp === "datepublished" ? 20 : 40,
        );
      } else if (
        itemProp === "datemodified" ||
        /^(?:last\s+)?(?:modified|updated)(?:\s+(?:at|on))?\b/u.test(label)
      ) {
        append(
          value,
          "modification",
          itemProp === "datemodified"
            ? "schema_org_date_modified"
            : "publisher_labeled_modified_date",
          itemProp === "datemodified" ? 120 : 140,
        );
      }
    }
  } else if (
    mediaType === "application/json" ||
    mediaType === "application/feed+json"
  ) {
    try {
      const root = JSON.parse(body);
      appendJsonLd(root, false);
      if (
        isRecord(root) &&
        typeof root.version === "string" &&
        root.version.startsWith("https://jsonfeed.org/version/") &&
        Array.isArray(root.items) &&
        root.items.length === 1 &&
        isRecord(root.items[0])
      ) {
        append(
          root.items[0].date_published,
          "publication",
          "trusted_feed_publication_date",
          50,
        );
      }
    } catch {
      // Invalid JSON is not trusted publication evidence.
    }
  }
  append(
    lastModifiedHeader,
    "modification",
    "http_last_modified",
    150,
  );
  const unique = new Map();
  for (const candidate of candidates) {
    unique.set(
      `${candidate.evidenceClass}|${candidate.label}|${candidate.date}`,
      candidate,
    );
  }
  return Object.freeze(
    [...unique.values()].sort((left, right) =>
      left.priority - right.priority ||
      left.date.localeCompare(right.date) ||
      left.label.localeCompare(right.label)
    ),
  );
};

export const selectPublicationDateProvenance = (
  body,
  contentType,
  target,
  authorityId,
  now = Date.now(),
  lastModifiedHeader = null,
) => {
  if (authorityId === "chillywood-public-repository") {
    const commit = target.pathname.match(
      /^\/Chillywood2025\/chillywood-mobile\/commit\/([a-f0-9]{40})$/u,
    )?.[1];
    if (!commit || !contentType.toLowerCase().startsWith("text/html")) {
      return Object.freeze({
        candidates: Object.freeze([]),
        contradictionState: "provenance_incomplete",
        status: "unverified",
      });
    }
    const rawDate = body.match(
      /"(?:committedDate|authoredDate)"\s*:\s*"([^"]{4,80})"/iu,
    )?.[1] ??
      body.match(
        /<relative-time\b[^>]*\bdatetime=["']([^"']{4,80})["'][^>]*>/iu,
      )?.[1];
    const parsed = rawDate === undefined ? Number.NaN : Date.parse(rawDate);
    if (!Number.isFinite(parsed) || parsed > now + 300_000) {
      return Object.freeze({
        candidates: Object.freeze([]),
        contradictionState: "provenance_incomplete",
        status: "unverified",
      });
    }
    const publicationDate = new Date(parsed).toISOString();
    return Object.freeze({
      candidates: Object.freeze([]),
      contradictionState: "none",
      provenance: Object.freeze({
        machineValue: publicationDate,
        mode: "github_commit_metadata",
        publicationDate,
        semanticIdentity: `github-commit:${commit}`,
      }),
      status: "selected",
    });
  }
  const candidates = extractPublicationDateCandidates(
    body,
    contentType,
    now,
    lastModifiedHeader,
  );
  const publicationDates = Object.freeze([
    ...new Set(
      candidates
        .filter((candidate) => candidate.evidenceClass === "publication")
        .map((candidate) => candidate.date),
    ),
  ].sort());
  if (publicationDates.length < 1) {
    return Object.freeze({
      candidates,
      contradictionState: "provenance_incomplete",
      status: "unverified",
    });
  }
  if (publicationDates.length > 1) {
    return Object.freeze({
      candidates,
      contradictionState: "detected",
      publicationDates,
      status: "ambiguous",
    });
  }
  const publicationDate = publicationDates[0];
  return Object.freeze({
    candidates,
    contradictionState: "none",
    provenance: Object.freeze({
      machineValue: publicationDate,
      mode: "published_metadata",
      publicationDate,
      semanticIdentity: `published-at:${publicationDate}`,
    }),
    status: "selected",
  });
};

export const derivePublicationProvenance = (
  body,
  contentType,
  target,
  authorityId,
  now = Date.now(),
  lastModifiedHeader = null,
) => {
  const selection = selectPublicationDateProvenance(
    body,
    contentType,
    target,
    authorityId,
    now,
    lastModifiedHeader,
  );
  return selection.status === "selected" ? selection.provenance : null;
};

export const extractRetrievedCitationMetadata = (
  body,
  contentType,
  canonicalUrl,
  publisher,
  sourceType,
) => {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  let title = "";
  if (mediaType === "text/html") {
    const titleMatch = body.match(
      /<title\b[^>]*>([\s\S]{1,1024}?)<\/title\s*>/iu,
    );
    const metaTitleMatch = body.match(
      /<meta\b[^>]*(?:name|property)\s*=\s*["'](?:og:title|twitter:title)["'][^>]*content\s*=\s*["']([^"']{1,1024})["'][^>]*>/iu,
    );
    title = decodeHtmlEntities(
      (titleMatch?.[1] ?? metaTitleMatch?.[1] ?? "").replace(/<[^>]+>/gu, " "),
    );
  } else if (
    mediaType === "application/json" ||
    mediaType === "application/feed+json"
  ) {
    const match = body.match(
      /"(?:headline|title|name)"\s*:\s*"([^"\\]{1,512})"/iu,
    );
    title = match?.[1] ?? "";
  }
  title = title.replace(/\s+/gu, " ").trim().slice(0, 512);
  if (!title) {
    title = `${publisher} ${sourceType.replace(/_/gu, " ")}`.slice(0, 512);
  }
  const locator = canonicalUrl.slice(0, 512);
  return locator && title && isSecuritySafeText(locator) &&
      isSecuritySafeText(title)
    ? Object.freeze({ locator, title })
    : null;
};

const retrieveAndRecordSource = (
  transport,
  now,
  requireProviderAttestation,
) =>
  ready(
    ["record_research_source"],
    async ({ assertActive, context, database, env, payload, signal }) => {
      const request = normalizeSourceRequest(payload);
      if (!request) throw new Error("research_source_payload_rejected");
      const authorityUrl = canonicalizeResearchUrl(request.url);
      let retrieved;
      try {
        await assertInvocationActive({ assertActive, signal });
        retrieved = await transport(request.url, signal, {
          authorityId: request.authorityId,
          context,
          env,
        });
      } catch {
        signal?.throwIfAborted();
        throw new Error("public_research_transport_blocked");
      }
      if (
        requireProviderAttestation &&
        (
          retrieved?.providerReadiness !== "ACTIVE" ||
          retrieved?.trustedForPersistence !== true ||
          retrieved?.networkBoundary !==
            "isolated_node_pinned_https_v1" ||
          typeof retrieved?.transportAttestationHash !== "string" ||
          !/^[a-f0-9]{64}$/u.test(retrieved.transportAttestationHash)
        )
      ) {
        throw new Error("public_research_transport_blocked");
      }
      const excerpt = extractBoundedExcerpt(
        retrieved.body,
        retrieved.contentType,
        request.evidenceQuery,
      );
      if (!excerpt) throw new Error("public_research_content_rejected");
      const retrievalTime = Date.parse(retrieved.retrievalDate);
      const publicationSelection = selectPublicationDateProvenance(
        retrieved.body,
        retrieved.contentType,
        authorityUrl,
        request.authorityId,
        now(),
        retrieved.lastModifiedHeader ?? null,
      );
      if (publicationSelection.status === "ambiguous") {
        throw new Error("research_publication_date_ambiguous");
      }
      if (publicationSelection.status !== "selected") {
        throw new Error("research_publication_date_unverified");
      }
      const provenance = publicationSelection.provenance;
      if (
        !Number.isFinite(retrievalTime) ||
        Date.parse(provenance.publicationDate) > retrievalTime
      ) {
        throw new Error("research_publication_date_rejected");
      }
      const freshnessDeadline = new Date(
        retrievalTime + request.freshnessSeconds * 1_000,
      ).toISOString();
      const finalUrl = canonicalizeResearchUrl(retrieved.canonicalUrl);
      if (
        !finalUrl ||
        finalUrl.hostname !== authorityUrl.hostname ||
        !authorityForSource(
          request.authorityId,
          finalUrl,
          request.publisher,
          request.sourceType,
        )
      ) {
        throw new Error("public_research_redirect_rejected");
      }
      const citation = extractRetrievedCitationMetadata(
        retrieved.body,
        retrieved.contentType,
        finalUrl.canonical,
        request.publisher,
        request.sourceType,
      );
      if (!citation) {
        throw new Error("research_citation_metadata_unavailable");
      }
      const [
        sourceReferenceHash,
        canonicalUrlHash,
        contentHash,
        provenanceHash,
      ] = await Promise.all([
        sha256Hex(authorityUrl.canonical),
        sha256Hex(finalUrl.canonical),
        sha256Hex(excerpt),
        sha256Hex(
          `${provenance.mode}|${provenance.machineValue}|${provenance.semanticIdentity}`,
        ),
      ]);
      const resolvedAddressHashes = await Promise.all(
        retrieved.resolvedAddresses.map((address) => sha256Hex(address)),
      );
      const result = await database.call("recordPublicResearchSource", [
        request.taskId,
        request.projectId,
        request.platform,
        request.environment,
        request.authorityId,
        finalUrl.hostname,
        request.sourceType,
        request.publisher,
        authorityOwnerForId(request.authorityId),
        sourceReferenceHash,
        canonicalUrlHash,
        contentHash,
        provenance.publicationDate,
        {
          evidenceHash: provenanceHash,
          machineValue: provenance.machineValue,
          mode: provenance.mode,
          semanticIdentity: provenance.semanticIdentity,
        },
        retrieved.retrievalDate,
        freshnessDeadline,
        [
          "official_documentation",
          "security_advisory",
          "platform_policy",
          "store_policy",
        ].includes(request.sourceType),
        excerpt,
        citation,
        resolvedAddressHashes,
        serviceToken(env),
      ]);
      if (
        !isRecord(result) ||
        typeof result.source_id !== "string" ||
        !UUID.test(result.source_id) ||
        typeof result.retrieval_id !== "string" ||
        !UUID.test(result.retrieval_id) ||
        result.content_hash !== contentHash
      ) {
        throw new Error("public_research_source_readback_mismatch");
      }
      return Object.freeze({
        canonicalUrlHash,
        citationLocatorHash: await sha256Hex(citation.locator),
        citationTitle: citation.title,
        contentHash,
        evaluatorRequired: true,
        freshnessDeadline,
        privateDataUsed: false,
        publicationProvenanceMode: provenance.mode,
        publisher: request.publisher,
        retrievalId: result.retrieval_id,
        sourceId: result.source_id,
        sourceType: request.sourceType,
        transportAttestationHash:
          retrieved.transportAttestationHash ?? null,
        trustedForToolExecution: false,
        userDerivedDataUsed: false,
      });
    },
  );

const recordClaim = ready(
  ["record_research_claim"],
  async ({ database, env, payload }) => {
    const request = normalizeClaimRequest(payload);
    if (!request) throw new Error("research_claim_payload_rejected");
    const expectedClaimHash = await sha256Hex(request.boundedClaim);
    const result = await database.call("recordPublicResearchClaim", [
      request.taskId,
      request.projectId,
      request.platform,
      request.environment,
      request.canaryKey,
      request.boundedClaim,
      request.category,
      request.confidence,
      request.freshnessDeadline,
      request.contradictionState,
      [...request.sourceIds],
      serviceToken(env),
    ]);
    const retention = isRecord(result) &&
        typeof result.retention_until === "string"
      ? Date.parse(result.retention_until)
      : Number.NaN;
    if (
      !isRecord(result) ||
      typeof result.research_claim_id !== "string" ||
      !UUID.test(result.research_claim_id) ||
      result.claim_hash !== expectedClaimHash ||
      result.erased_at !== null ||
      !Number.isFinite(retention) ||
      retention <= Date.now() ||
      retention > Date.now() + 30 * 86_400_000 + 300_000
    ) {
      throw new Error("research_claim_readback_rejected");
    }
    return Object.freeze({
      canaryAccepted: false,
      canaryKey: request.canaryKey,
      claimHash: expectedClaimHash,
      evaluatorRequired: true,
      privateDataUsed: false,
      researchClaimId: result.research_claim_id,
      userDerivedDataUsed: false,
    });
  },
);

const detectContradiction = ready(
  ["detect_research_contradiction"],
  async ({ database, env, payload }) => {
    const request = normalizeContradictionRequest(payload);
    if (!request) throw new Error("research_contradiction_payload_rejected");
    const result = await database.call("detectResearchContradiction", [
      request.taskId,
      request.projectId,
      request.platform,
      request.environment,
      request.claimId,
      request.sourceId,
      request.boundedEvidence,
      serviceToken(env),
    ]);
    if (
      !isRecord(result) ||
      typeof result.contradiction_id !== "string" ||
      !UUID.test(result.contradiction_id) ||
      typeof result.event_id !== "string" ||
      !UUID.test(result.event_id) ||
      typeof result.evidence_hash !== "string" ||
      !/^[a-f0-9]{64}$/u.test(result.evidence_hash)
    ) {
      throw new Error("research_contradiction_readback_rejected");
    }
    return Object.freeze({
      contradictionId: result.contradiction_id,
      evaluatorRequired: true,
      eventId: result.event_id,
      evidenceHash: result.evidence_hash,
      privateDataUsed: false,
      state: "detected",
      userDerivedDataUsed: false,
    });
  },
);

const expirePublicMemory = ready(
  ["expire_research"],
  async ({ database, env, payload }) => {
    const request = normalizeMaintenanceRequest(payload);
    if (!request) throw new Error("research_maintenance_payload_rejected");
    const result = await database.call("expirePublicResearch", [
      request.taskId,
      request.projectId,
      request.platform,
      request.environment,
      request.limit,
      serviceToken(env),
    ]);
    if (
      !isRecord(result) ||
      !Number.isSafeInteger(result.source_count) ||
      !Number.isSafeInteger(result.claim_count) ||
      !Number.isSafeInteger(result.total_count) ||
      result.source_count < 0 ||
      result.claim_count < 0 ||
      result.total_count !== result.source_count + result.claim_count ||
      result.total_count > request.limit ||
      result.retention_policy_id !== "chillywood-cognitive-retention-v1"
    ) {
      throw new Error("research_maintenance_readback_rejected");
    }
    return Object.freeze({
      claimCount: result.claim_count,
      privateDataUsed: false,
      retentionPolicyId: result.retention_policy_id,
      sourceCount: result.source_count,
      totalCount: result.total_count,
      userDerivedDataUsed: false,
    });
  },
);

export const createPublicResearchBrokerAdapters = ({
  now = Date.now,
  requireProviderAttestation = false,
  transport,
} = {}) => {
  return Object.freeze({
    retrieve_source: typeof transport === "function"
      ? retrieveAndRecordSource(
        transport,
        now,
        requireProviderAttestation,
      )
      : blocked(
        ["record_research_source"],
        RESEARCH_PINNED_TRANSPORT_REQUIRED,
      ),
    record_claim: recordClaim,
    detect_contradiction: detectContradiction,
    expire_public_memory: expirePublicMemory,
  });
};

export const PUBLIC_RESEARCH_BROKER_ADAPTERS =
  createPublicResearchBrokerAdapters({
    requireProviderAttestation: true,
    transport: createPinnedResearchHostTransport(),
  });
