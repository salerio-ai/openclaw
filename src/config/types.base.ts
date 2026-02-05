import type { NormalizedChatType } from "../channels/chat-type.js";

export type ReplyMode = "text" | "command";
export type TypingMode = "never" | "instant" | "thinking" | "message";
export type SessionScope = "per-sender" | "global";
export type DmScope = "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer";
export type ReplyToMode = "off" | "first" | "all";
export type GroupPolicy = "open" | "disabled" | "allowlist";
export type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";

export type OutboundRetryConfig = {
  /** Max retry attempts for outbound requests (default: 3). */
  attempts?: number;
  /** Minimum retry delay in ms (default: 300-500ms depending on provider). */
  minDelayMs?: number;
  /** Maximum retry delay cap in ms (default: 30000). */
  maxDelayMs?: number;
  /** Jitter factor (0-1) applied to delays (default: 0.1). */
  jitter?: number;
};

export type BlockStreamingCoalesceConfig = {
  minChars?: number;
  maxChars?: number;
  idleMs?: number;
};

export type BlockStreamingChunkConfig = {
  minChars?: number;
  maxChars?: number;
  breakPreference?: "paragraph" | "newline" | "sentence";
};

export type MarkdownTableMode = "off" | "bullets" | "code";

export type MarkdownConfig = {
  /** Table rendering mode (off|bullets|code). */
  tables?: MarkdownTableMode;
};

export type HumanDelayConfig = {
  /** Delay style for block replies (off|natural|custom). */
  mode?: "off" | "natural" | "custom";
  /** Minimum delay in milliseconds (default: 800). */
  minMs?: number;
  /** Maximum delay in milliseconds (default: 2500). */
  maxMs?: number;
};

export type SessionSendPolicyAction = "allow" | "deny";
export type SessionSendPolicyMatch = {
  channel?: string;
  chatType?: NormalizedChatType;
  keyPrefix?: string;
};
export type SessionSendPolicyRule = {
  action: SessionSendPolicyAction;
  match?: SessionSendPolicyMatch;
};
export type SessionSendPolicyConfig = {
  default?: SessionSendPolicyAction;
  rules?: SessionSendPolicyRule[];
};

export type SessionResetMode = "daily" | "idle";
export type SessionResetConfig = {
  mode?: SessionResetMode;
  /** Local hour (0-23) for the daily reset boundary. */
  atHour?: number;
  /** Sliding idle window (minutes). When set with daily mode, whichever expires first wins. */
  idleMinutes?: number;
};
export type SessionResetByTypeConfig = {
  dm?: SessionResetConfig;
  group?: SessionResetConfig;
  thread?: SessionResetConfig;
};

export type SessionConfig = {
  scope?: SessionScope;
  /** DM session scoping (default: "main"). */
  dmScope?: DmScope;
  /** Map platform-prefixed identities (e.g. "telegram:123") to canonical DM peers. */
  identityLinks?: Record<string, string[]>;
  resetTriggers?: string[];
  idleMinutes?: number;
  reset?: SessionResetConfig;
  resetByType?: SessionResetByTypeConfig;
  /** Channel-specific reset overrides (e.g. { discord: { mode: "idle", idleMinutes: 10080 } }). */
  resetByChannel?: Record<string, SessionResetConfig>;
  store?: string;
  typingIntervalSeconds?: number;
  typingMode?: TypingMode;
  mainKey?: string;
  sendPolicy?: SessionSendPolicyConfig;
  agentToAgent?: {
    /** Max ping-pong turns between requester/target (0–5). Default: 5. */
    maxPingPongTurns?: number;
  };
};

export type LoggingConfig = {
  level?: "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  file?: string;
  consoleLevel?: "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  consoleStyle?: "pretty" | "compact" | "json";
  /** Redact sensitive tokens in tool summaries. Default: "tools". */
  redactSensitive?: "off" | "tools";
  /** Regex patterns used to redact sensitive tokens (defaults apply when unset). */
  redactPatterns?: string[];
};

export type DiagnosticsOtelConfig = {
  enabled?: boolean;
  endpoint?: string;
  protocol?: "http/protobuf" | "grpc";
  headers?: Record<string, string>;
  serviceName?: string;
  traces?: boolean;
  metrics?: boolean;
  logs?: boolean;
  /** Trace sample rate (0.0 - 1.0). */
  sampleRate?: number;
  /** Metric export interval (ms). */
  flushIntervalMs?: number;
};

export type DiagnosticsCacheTraceConfig = {
  enabled?: boolean;
  filePath?: string;
  includeMessages?: boolean;
  includePrompt?: boolean;
  includeSystem?: boolean;
};

export type DiagnosticsConfig = {
  enabled?: boolean;
  /** Optional ad-hoc diagnostics flags (e.g. "telegram.http"). */
  flags?: string[];
  otel?: DiagnosticsOtelConfig;
  cacheTrace?: DiagnosticsCacheTraceConfig;
};

export type WebReconnectConfig = {
  initialMs?: number;
  maxMs?: number;
  factor?: number;
  jitter?: number;
  maxAttempts?: number; // 0 = unlimited
};

export type WebConfig = {
  /** If false, do not start the WhatsApp web provider. Default: true. */
  enabled?: boolean;
  heartbeatSeconds?: number;
  reconnect?: WebReconnectConfig;
};

// Provider docking: allowlists keyed by provider id (and internal "webchat").
export type AgentElevatedAllowFromConfig = Partial<Record<string, Array<string | number>>>;

export type IdentityConfig = {
  name?: string;
  theme?: string;
  emoji?: string;
  /** Avatar image: workspace-relative path, http(s) URL, or data URI. */
  avatar?: string;
};

/** Bustly OAuth configuration for desktop client login. */
export type BustlyOAuthConfig = {
  /** Base URL for Bustly API (e.g., "https://test-www.bustly.shop"). */
  apiBaseUrl: string;
  /** Base URL for Bustly Web interface (e.g., "https://test-www.bustly.shop"). */
  webBaseUrl: string;
  /** Client ID for OpenClaw desktop application. */
  clientId: string;
  /** Port for OAuth callback server (default: 18790). This is separate from gateway port to avoid conflicts. */
  callbackPort?: number;
};

/** Bustly OAuth login state stored in ~/.openclaw/bustlyOauth.json. */
export type BustlyOAuthState = {
  /** Login trace ID for OAuth flow tracking. */
  loginTraceId?: string;
  /** Device ID for this client. */
  deviceId: string;
  /** OAuth callback port. */
  callbackPort: number;
  /** Authorization code (transient, cleared after token exchange). */
  authCode?: string;
  /** Session expiration timestamp (milliseconds since epoch, transient). */
  expiresAt?: number;
  /** User information (populated after successful login). */
  user?: {
    /** User ID. */
    userId: string;
    /** User name. */
    userName: string;
    /** User email. */
    userEmail: string;
    /** Workspace ID. */
    workspaceId: string;
    /** Assigned skills. */
    skills: string[];
  };
  /** Login timestamp (milliseconds since epoch). */
  loggedInAt?: number;
  /** Bustly search data configuration (populated after successful login). */
  bustlySearchData?: BustlySearchDataConfig;
};

/** Bustly search data configuration from API extras. */
export type BustlySearchDataConfig = {
  /** Search data access token (same as Bustly access token). */
  SEARCH_DATA_TOKEN: string;
  /** Supabase API URL. */
  SEARCH_DATA_SUPABASE_URL: string;
  /** Supabase anonymous key. */
  SEARCH_DATA_SUPABASE_ANON_KEY: string;
  /** Supabase session access token (for login state and API calls). */
  SEARCH_DATA_SUPABASE_ACCESS_TOKEN: string;
  /** Workspace ID. */
  SEARCH_DATA_WORKSPACE_ID: string;
};
