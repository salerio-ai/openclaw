import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";

type OpenClawInitOptions = {
  gatewayPort?: number;
  gatewayBind?: "loopback" | "lan" | "auto";
  workspace?: string;
  nodeManager?: "npm" | "pnpm" | "bun";
  openrouterApiKey?: string;
};

type OnboardAuthResult = {
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
};

type GatewayLogPayload = { stream: "stdout" | "stderr"; message: string };
type GatewayExitPayload = { code: number | null; signal: string | null };
type MainLogPayload = { message: string };
type UpdateStatusPayload = { event: string };
type GatewayLifecyclePayload = {
  phase: "starting" | "stopping" | "ready" | "error";
  message: string | null;
};

type WhatsAppConfigRequest =
  | {
      mode: "personal";
      personalNumber: string;
    }
  | {
      mode: "separate";
      dmPolicy: string;
      allowFromMode: "keep" | "unset" | "list";
      allowFromList?: string;
    };

/**
 * Expose protected methods that allow the renderer process to use
 * the ipcRenderer without exposing the entire object
 */
contextBridge.exposeInMainWorld("electronAPI", {
  // OpenClaw initialization
  openclawInit: (options?: OpenClawInitOptions) => ipcRenderer.invoke("openclaw-init", options),
  openclawIsInitialized: () => ipcRenderer.invoke("openclaw-is-initialized"),
  openclawReset: () => ipcRenderer.invoke("openclaw-reset"),
  openclawNeedsOnboard: () => ipcRenderer.invoke("openclaw-needs-onboard"),

  // Gateway management
  gatewayStart: (apiKey?: string) => ipcRenderer.invoke("gateway-start", apiKey),
  gatewayStop: () => ipcRenderer.invoke("gateway-stop"),
  gatewayStatus: () => ipcRenderer.invoke("gateway-status"),
  gatewayConnectConfig: () => ipcRenderer.invoke("gateway-connect-config"),
  gatewayPatchSession: (key: string, patch: { label?: string | null; icon?: string | null }) =>
    ipcRenderer.invoke("gateway-patch-session", key, patch),
  gatewayPatchSessionLabel: (key: string, label: string) =>
    ipcRenderer.invoke("gateway-patch-session-label", key, label),
  gatewayPatchSessionModel: (key: string, model: string) =>
    ipcRenderer.invoke("gateway-patch-session-model", key, model),
  gatewayDeleteSession: (key: string) => ipcRenderer.invoke("gateway-delete-session", key),
  resolvePastedPath: (params: {
    file?: File;
    entryPath?: string;
    entryName?: string;
    fallbackKind: "file" | "directory";
  }) =>
    ipcRenderer.invoke("resolve-pasted-path", {
      directPath: params.file ? webUtils.getPathForFile(params.file) : "",
      entryPath: params.entryPath,
      entryName: params.entryName,
      fallbackKind: params.fallbackKind,
    }),
  selectChatContextPaths: () => ipcRenderer.invoke("dialog-select-chat-context-paths"),
  resolveChatImagePreview: (path: string) => ipcRenderer.invoke("resolve-chat-image-preview", path),

  // App info
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
  getNativeFullscreenStatus: () => ipcRenderer.invoke("window-native-fullscreen-status"),
  updaterCheck: () => ipcRenderer.invoke("updater-check"),
  updaterInstall: () => ipcRenderer.invoke("updater-install"),
  updaterStatus: () => ipcRenderer.invoke("updater-status"),

  // Onboarding
  bustlyLogin: () => ipcRenderer.invoke("bustly-login"),
  bustlyIsLoggedIn: () => ipcRenderer.invoke("bustly-is-logged-in"),
  bustlyGetUserInfo: () => ipcRenderer.invoke("bustly-get-user-info"),
  bustlyGetSupabaseConfig: () => ipcRenderer.invoke("bustly-get-supabase-config"),
  bustlySetActiveWorkspace: (workspaceId: string, workspaceName?: string) =>
    ipcRenderer.invoke("bustly-set-active-workspace", workspaceId, workspaceName),
  bustlyLogout: () => ipcRenderer.invoke("bustly-logout"),
  bustlyOpenLogin: () => ipcRenderer.invoke("bustly-open-login"),
  bustlyOpenSettings: () => ipcRenderer.invoke("bustly-open-settings"),
  bustlyOpenProviderSetup: () => ipcRenderer.invoke("bustly-open-provider-setup"),
  bustlyOpenWorkspaceSettings: (workspaceId: string) =>
    ipcRenderer.invoke("bustly-open-workspace-settings", workspaceId),
  bustlyOpenWorkspaceInvite: (workspaceId: string) =>
    ipcRenderer.invoke("bustly-open-workspace-invite", workspaceId),
  bustlyOpenWorkspaceManage: (workspaceId: string) =>
    ipcRenderer.invoke("bustly-open-workspace-manage", workspaceId),
  bustlyOpenWorkspaceCreate: () => ipcRenderer.invoke("bustly-open-workspace-create"),
  bustlyReonboard: () => ipcRenderer.invoke("bustly-reonboard"),
  onboardBetaOpenRouterApiKey: () => ipcRenderer.invoke("onboard-beta-openrouter-api-key"),
  onboardListProviders: () => ipcRenderer.invoke("onboard-list-providers"),
  onboardAuthApiKey: (provider: string, apiKey: string) =>
    ipcRenderer.invoke("onboard-auth-api-key", provider, apiKey),
  onboardAuthToken: (provider: string, token: string) =>
    ipcRenderer.invoke("onboard-auth-token", provider, token),
  onboardAuthOAuth: (provider: string) => ipcRenderer.invoke("onboard-auth-oauth", provider),
  onboardAuthOAuthCancel: () => ipcRenderer.invoke("onboard-auth-oauth-cancel"),
  onboardOAuthSubmitCode: (code: string) => ipcRenderer.invoke("onboard-oauth-submit-code", code),
  onboardListModels: (provider: string) => ipcRenderer.invoke("onboard-list-models", provider),
  onboardComplete: (authResult: OnboardAuthResult, options?: { model?: string; openControlUi?: boolean }) =>
    ipcRenderer.invoke("onboard-complete", authResult, options),
  onboardOpenUrl: (url: string) => ipcRenderer.invoke("onboard-open-url", url),
  onboardOpenControlUi: () => ipcRenderer.invoke("onboard-open-control-ui"),
  onboardWhatsAppStatus: () => ipcRenderer.invoke("onboard-whatsapp-status"),
  onboardWhatsAppStart: (options?: { force?: boolean }) =>
    ipcRenderer.invoke("onboard-whatsapp-start", options),
  onboardWhatsAppWait: (options?: { timeoutMs?: number }) =>
    ipcRenderer.invoke("onboard-whatsapp-wait", options),
  onboardWhatsAppConfig: (payload: WhatsAppConfigRequest) =>
    ipcRenderer.invoke("onboard-whatsapp-config", payload),
  consumePendingDeepLink: () => ipcRenderer.invoke("deep-link-consume-pending"),

  // Event listeners
  onOAuthRequestCode: (callback: (message: string) => void) => {
    const listener = (_event: IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("onboard-oauth-request-code", listener);
    return () => ipcRenderer.removeListener("onboard-oauth-request-code", listener);
  },
  onGatewayLog: (callback: (data: GatewayLogPayload) => void) => {
    const listener = (_event: IpcRendererEvent, data: GatewayLogPayload) => callback(data);
    ipcRenderer.on("gateway-log", listener);
    return () => ipcRenderer.removeListener("gateway-log", listener);
  },

  onGatewayExit: (callback: (data: GatewayExitPayload) => void) => {
    const listener = (_event: IpcRendererEvent, data: GatewayExitPayload) => callback(data);
    ipcRenderer.on("gateway-exit", listener);
    return () => ipcRenderer.removeListener("gateway-exit", listener);
  },
  onGatewayLifecycle: (callback: (data: GatewayLifecyclePayload) => void) => {
    const listener = (_event: IpcRendererEvent, data: GatewayLifecyclePayload) => callback(data);
    ipcRenderer.on("gateway-lifecycle", listener);
    return () => ipcRenderer.removeListener("gateway-lifecycle", listener);
  },
  onMainLog: (callback: (data: MainLogPayload) => void) => {
    const listener = (_event: IpcRendererEvent, data: MainLogPayload) => callback(data);
    ipcRenderer.on("main-log", listener);
    return () => ipcRenderer.removeListener("main-log", listener);
  },
  onUpdateStatus: (callback: (data: UpdateStatusPayload) => void) => {
    const listener = (_event: IpcRendererEvent, data: UpdateStatusPayload) => callback(data);
    ipcRenderer.on("update-status", listener);
    return () => ipcRenderer.removeListener("update-status", listener);
  },
  onNativeFullscreenChange: (callback: (data: { isNativeFullscreen: boolean }) => void) => {
    const listener = (_event: IpcRendererEvent, data: { isNativeFullscreen: boolean }) => callback(data);
    ipcRenderer.on("window-native-fullscreen", listener);
    return () => ipcRenderer.removeListener("window-native-fullscreen", listener);
  },
  onBustlyLoginRefresh: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("bustly-login-refresh", listener);
    return () => ipcRenderer.removeListener("bustly-login-refresh", listener);
  },
  onDeepLink: (callback: (payload: { url: string; route: string | null }) => void) => {
    const listener = (_event: unknown, payload: { url: string; route: string | null }) =>
      callback(payload);
    ipcRenderer.on("deep-link", listener);
    return () => ipcRenderer.removeListener("deep-link", listener);
  },
});
