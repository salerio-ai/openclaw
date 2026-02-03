import { contextBridge, ipcRenderer } from "electron";

/**
 * Expose protected methods that allow the renderer process to use
 * the ipcRenderer without exposing the entire object
 */
contextBridge.exposeInMainWorld("electronAPI", {
  // OpenClaw initialization
  openclawInit: (options?: any) => ipcRenderer.invoke("openclaw-init", options),
  openclawIsInitialized: () => ipcRenderer.invoke("openclaw-is-initialized"),
  openclawReset: () => ipcRenderer.invoke("openclaw-reset"),

  // Gateway management
  gatewayStart: (apiKey?: string) => ipcRenderer.invoke("gateway-start", apiKey),
  gatewayStop: () => ipcRenderer.invoke("gateway-stop"),
  gatewayStatus: () => ipcRenderer.invoke("gateway-status"),

  // App info
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),

  // Onboarding
  onboardListProviders: () => ipcRenderer.invoke("onboard-list-providers"),
  onboardAuthApiKey: (provider: string, apiKey: string) =>
    ipcRenderer.invoke("onboard-auth-api-key", provider, apiKey),
  onboardAuthToken: (provider: string, token: string) =>
    ipcRenderer.invoke("onboard-auth-token", provider, token),
  onboardAuthOAuth: (provider: string) => ipcRenderer.invoke("onboard-auth-oauth", provider),
  onboardOAuthSubmitCode: (code: string) => ipcRenderer.invoke("onboard-oauth-submit-code", code),
  onboardListModels: (provider: string) => ipcRenderer.invoke("onboard-list-models", provider),
  onboardComplete: (authResult: any, options?: { model?: string }) =>
    ipcRenderer.invoke("onboard-complete", authResult, options),
  onboardOpenUrl: (url: string) => ipcRenderer.invoke("onboard-open-url", url),

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
});
