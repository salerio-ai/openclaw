import { contextBridge, ipcRenderer } from "electron";

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
  openclawInit: (options?: any) => ipcRenderer.invoke("openclaw-init", options),
  openclawIsInitialized: () => ipcRenderer.invoke("openclaw-is-initialized"),
  openclawReset: () => ipcRenderer.invoke("openclaw-reset"),
  openclawNeedsOnboard: () => ipcRenderer.invoke("openclaw-needs-onboard"),

  // Gateway management
  gatewayStart: (apiKey?: string) => ipcRenderer.invoke("gateway-start", apiKey),
  gatewayStop: () => ipcRenderer.invoke("gateway-stop"),
  gatewayStatus: () => ipcRenderer.invoke("gateway-status"),

  // App info
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
  updaterCheck: () => ipcRenderer.invoke("updater-check"),
  updaterInstall: () => ipcRenderer.invoke("updater-install"),
  updaterStatus: () => ipcRenderer.invoke("updater-status"),

  // Onboarding
  bustlyLogin: () => ipcRenderer.invoke("bustly-login"),
  bustlyIsLoggedIn: () => ipcRenderer.invoke("bustly-is-logged-in"),
  bustlyGetUserInfo: () => ipcRenderer.invoke("bustly-get-user-info"),
  bustlyLogout: () => ipcRenderer.invoke("bustly-logout"),
  bustlyOpenLogin: () => ipcRenderer.invoke("bustly-open-login"),
  bustlyOpenSettings: () => ipcRenderer.invoke("bustly-open-settings"),
  bustlyOpenProviderSetup: () => ipcRenderer.invoke("bustly-open-provider-setup"),
  onboardListProviders: () => ipcRenderer.invoke("onboard-list-providers"),
  onboardAuthApiKey: (provider: string, apiKey: string) =>
    ipcRenderer.invoke("onboard-auth-api-key", provider, apiKey),
  onboardAuthToken: (provider: string, token: string) =>
    ipcRenderer.invoke("onboard-auth-token", provider, token),
  onboardAuthOAuth: (provider: string) => ipcRenderer.invoke("onboard-auth-oauth", provider),
  onboardAuthOAuthCancel: () => ipcRenderer.invoke("onboard-auth-oauth-cancel"),
  onboardOAuthSubmitCode: (code: string) => ipcRenderer.invoke("onboard-oauth-submit-code", code),
  onboardListModels: (provider: string) => ipcRenderer.invoke("onboard-list-models", provider),
  onboardComplete: (authResult: any, options?: { model?: string; openControlUi?: boolean }) =>
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

  // Event listeners
  onOAuthRequestCode: (callback: any) => {
    const listener = (_event: any, message: any) => callback(message);
    ipcRenderer.on("onboard-oauth-request-code", listener);
    return () => ipcRenderer.removeListener("onboard-oauth-request-code", listener);
  },
  onGatewayLog: (callback: any) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on("gateway-log", listener);
    return () => ipcRenderer.removeListener("gateway-log", listener);
  },

  onGatewayExit: (callback: any) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on("gateway-exit", listener);
    return () => ipcRenderer.removeListener("gateway-exit", listener);
  },
  onMainLog: (callback: any) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on("main-log", listener);
    return () => ipcRenderer.removeListener("main-log", listener);
  },
  onUpdateStatus: (callback: any) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on("update-status", listener);
    return () => ipcRenderer.removeListener("update-status", listener);
  },
  onBustlyLoginRefresh: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("bustly-login-refresh", listener);
    return () => ipcRenderer.removeListener("bustly-login-refresh", listener);
  },
});
