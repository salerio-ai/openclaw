/**
 * TypeScript declarations for the electronAPI exposed via contextBridge
 */

interface PresetConfigOptions {
  /** Gateway port (default: 17999) */
  gatewayPort?: number;
  /** Gateway bind address (default: "loopback") */
  gatewayBind?: "loopback" | "lan" | "auto";
  /** Workspace directory (default: "$OPENCLAW_STATE_DIR/workspace", fallback "~/.bustly/workspace") */
  workspace?: string;
  /** Node manager for skills (default: "pnpm") */
  nodeManager?: "npm" | "pnpm" | "bun";
  /** OpenRouter API key for minimax model */
  openrouterApiKey?: string;
}

interface InitializationResult {
  success: boolean;
  configPath: string;
  gatewayPort: number;
  gatewayBind: string;
  workspace: string;
  error?: string;
}

interface GatewayStatus {
  running: boolean;
  pid: number | null;
  port: number;
  host: string;
  bind: string;
  wsUrl: string; // No token when auth is disabled
  initialized: boolean;
}

interface GatewayConnectConfig {
  wsUrl: string;
  token: string | null;
  host: string;
  port: number;
}

interface ChatContextPathSelection {
  path: string;
  name: string;
  kind: "file" | "directory";
  imageUrl?: string;
}

interface AppInfo {
  version: string;
  name: string;
  electronVersion: string;
  nodeVersion: string;
}

interface GatewayLogData {
  stream: "stdout" | "stderr";
  message: string;
}

interface GatewayExitData {
  code: number | null;
  signal: string | null;
}
interface GatewayLifecycleData {
  phase: "starting" | "stopping" | "ready" | "error";
  message: string | null;
}
interface MainLogData {
  message: string;
}
interface DeepLinkData {
  url: string;
  route: string | null;
}

// Bustly OAuth types
interface BustlyUserInfo {
  userId: string;
  userName: string;
  userEmail: string;
  workspaceId: string;
  skills: string[];
}

interface BustlySupabaseConfig {
  url: string;
  anonKey: string;
  accessToken: string;
  workspaceId: string;
  userId: string;
  userEmail: string;
  userName: string;
}

// Onboarding types
interface ProviderConfig {
  id: string;
  label: string;
  authMethods: Array<{ id: string; label: string; kind: "oauth" | "api_key" | "token" | "device_code" | "custom" }>;
  defaultModel: string;
  envKey: string;
  isDev?: boolean;
}

interface AuthResult {
  success: boolean;
  provider: string;
  method: string;
  credential?: {
    type: "api_key" | "token" | "oauth";
    provider: string;
    key?: string;
    token?: string;
    access?: string;
    refresh?: string;
    expires?: number;
    email?: string;
    projectId?: string;
  };
  defaultModel?: string;
  error?: string;
}

interface ModelCatalogEntry {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: Array<"text" | "image">;
  aliases?: string[];
}

type WhatsAppDmPolicy = "pairing" | "allowlist" | "open" | "disabled";

type WhatsAppAllowFromMode = "keep" | "unset" | "list";

type WhatsAppConfigRequest =
  | {
      mode: "personal";
      personalNumber: string;
    }
  | {
      mode: "separate";
      dmPolicy: WhatsAppDmPolicy;
      allowFromMode: WhatsAppAllowFromMode;
      allowFromList?: string;
    };

interface WhatsAppStatus {
  linked: boolean;
  accountId: string;
  dmPolicy: WhatsAppDmPolicy;
  allowFrom: string[];
  selfChatMode: boolean;
}

interface ElectronAPI {
  // OpenClaw initialization
  openclawInit: (options?: PresetConfigOptions) => Promise<InitializationResult>;
  openclawIsInitialized: () => Promise<boolean>;
  openclawReset: () => Promise<{ success: boolean; error?: string }>;
  openclawNeedsOnboard: () => Promise<boolean>;

  // Gateway management
  gatewayStart: (apiKey?: string) => Promise<{ success: boolean; error?: string }>;
  gatewayStop: () => Promise<{ success: boolean; error?: string }>;
  gatewayStatus: () => Promise<GatewayStatus>;
  gatewayConnectConfig: () => Promise<GatewayConnectConfig>;
  gatewayPatchSession: (
    key: string,
    patch: { label?: string | null; icon?: string | null },
  ) => Promise<{ success: boolean; error?: string }>;
  gatewayPatchSessionLabel: (key: string, label: string) => Promise<{ success: boolean; error?: string }>;
  gatewayPatchSessionModel: (
    key: string,
    model: string,
  ) => Promise<{ success: boolean; model?: string; error?: string }>;
  gatewayDeleteSession: (key: string) => Promise<{ success: boolean; error?: string }>;
  resolvePastedPath: (params: {
    file?: File;
    entryPath?: string;
    entryName?: string;
    fallbackKind: "file" | "directory";
  }) => Promise<{ path: string; kind: "file" | "directory" | null }>;
  selectChatContextPaths: () => Promise<ChatContextPathSelection[]>;
  resolveChatImagePreview: (path: string) => Promise<string | null>;
  getAppInfo: () => Promise<AppInfo>;
  getNativeFullscreenStatus: () => Promise<{ isNativeFullscreen: boolean }>;

  // Onboarding
  bustlyLogin: () => Promise<{ success: boolean; error?: string }>;
  bustlyIsLoggedIn: () => Promise<boolean>;
  bustlyGetUserInfo: () => Promise<BustlyUserInfo | null>;
  bustlyGetSupabaseConfig: () => Promise<BustlySupabaseConfig | null>;
  bustlySetActiveWorkspace: (
    workspaceId: string,
    workspaceName?: string,
  ) => Promise<{ success: boolean; agentId?: string; sessionKey?: string; error?: string }>;
  bustlyLogout: () => Promise<{ success: boolean; error?: string }>;
  bustlyOpenLogin: () => Promise<{ success: boolean; error?: string }>;
  bustlyOpenSettings: () => Promise<{ success: boolean; error?: string }>;
  bustlyOpenProviderSetup: () => Promise<{ success: boolean; error?: string }>;
  bustlyOpenWorkspaceSettings: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;
  bustlyOpenWorkspaceInvite: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;
  bustlyOpenWorkspaceManage: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;
  bustlyOpenWorkspaceCreate: () => Promise<{ success: boolean; error?: string }>;
  onboardBetaOpenRouterApiKey: () => Promise<string>;
  onboardListProviders: () => Promise<ProviderConfig[]>;
  onboardAuthApiKey: (provider: string, apiKey: string) => Promise<AuthResult>;
  onboardAuthToken: (provider: string, token: string) => Promise<AuthResult>;
  onboardAuthOAuth: (provider: string) => Promise<AuthResult>;
  onboardAuthOAuthCancel: () => Promise<{ success: boolean }>;
  onboardOAuthSubmitCode: (code: string) => Promise<{ success: boolean }>;
  onboardListModels: (provider: string) => Promise<ModelCatalogEntry[]>;
  onboardComplete: (
    authResult: AuthResult,
    options?: { model?: string; openControlUi?: boolean },
  ) => Promise<{ success: boolean; error?: string }>;
  onboardOpenUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
  onboardOpenControlUi: () => Promise<{ success: boolean; error?: string }>;
  onboardWhatsAppStatus: () => Promise<WhatsAppStatus>;
  onboardWhatsAppStart: (options?: { force?: boolean }) => Promise<{ qrDataUrl?: string; message: string }>;
  onboardWhatsAppWait: (options?: { timeoutMs?: number }) => Promise<{ connected: boolean; message: string }>;
  onboardWhatsAppConfig: (payload: WhatsAppConfigRequest) => Promise<{ success: boolean; error?: string }>;
  updaterStatus: () => Promise<{ ready: boolean; version?: string | null }>;
  consumePendingDeepLink: () => Promise<DeepLinkData | null>;

  // Event listeners
  onOAuthRequestCode: (callback: (message: string) => void) => () => void;
  onGatewayLog: (callback: (data: GatewayLogData) => void) => () => void;
  onGatewayExit: (callback: (data: GatewayExitData) => void) => () => void;
  onGatewayLifecycle: (callback: (data: GatewayLifecycleData) => void) => () => void;
  onMainLog: (callback: (data: MainLogData) => void) => () => void;
  onBustlyLoginRefresh: (callback: () => void) => () => void;
  onUpdateStatus: (callback: (data: { event: string }) => void) => () => void;
  onNativeFullscreenChange: (callback: (data: { isNativeFullscreen: boolean }) => void) => () => void;
  onDeepLink: (callback: (data: DeepLinkData) => void) => () => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
