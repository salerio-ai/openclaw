const VALID_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const INVALID_CHARS_RE = /[^a-z0-9_-]+/g;
const LEADING_DASH_RE = /^-+/;
const TRAILING_DASH_RE = /-+$/;

function normalizeToken(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "";
  }
  if (VALID_ID_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return trimmed
    .toLowerCase()
    .replace(INVALID_CHARS_RE, "-")
    .replace(LEADING_DASH_RE, "")
    .replace(TRAILING_DASH_RE, "")
    .slice(0, 64);
}

export function buildBustlyWorkspaceAgentId(workspaceId: string | undefined | null): string {
  const normalized = normalizeToken(workspaceId);
  return normalized ? `bustly-${normalized}` : "main";
}

export function buildBustlyWorkspaceMainSessionKey(workspaceId: string | undefined | null): string {
  return `agent:${buildBustlyWorkspaceAgentId(workspaceId)}:main`;
}

function normalizeSessionSlug(value: string | undefined | null): string {
  return normalizeToken(value) || "channel";
}

export function buildBustlyAgentPresetChannelSessionKey(
  agentId: string | undefined | null,
  slug: string | undefined | null,
): string {
  const normalizedAgentId = normalizeToken(agentId) || "main";
  return `agent:${normalizedAgentId}:main:channel:${normalizeSessionSlug(slug)}`;
}

export function isAgentMainSessionKey(sessionKey: string, agentId: string): boolean {
  const normalizedAgentId = normalizeToken(agentId) || "main";
  return sessionKey === `agent:${normalizedAgentId}:main`;
}

export function isAgentChannelSessionKey(sessionKey: string, agentId: string): boolean {
  const normalizedAgentId = normalizeToken(agentId) || "main";
  return sessionKey.startsWith(`agent:${normalizedAgentId}:main:channel:`);
}
