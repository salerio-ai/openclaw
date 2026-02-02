import { contextBridge, ipcRenderer } from "electron";

/**
 * Expose protected methods that allow the renderer process to use
 * the ipcRenderer without exposing the entire object
 */
contextBridge.exposeInMainWorld("electronAPI", {
  // OpenClaw initialization
  openclawInit: (options?) => ipcRenderer.invoke("openclaw-init", options),
  openclawIsInitialized: () => ipcRenderer.invoke("openclaw-is-initialized"),

  // Gateway management
  gatewayStart: () => ipcRenderer.invoke("gateway-start"),
  gatewayStop: () => ipcRenderer.invoke("gateway-stop"),
  gatewayStatus: () => ipcRenderer.invoke("gateway-status"),

  // App info
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),

  // Event listeners
  onGatewayLog: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("gateway-log", listener);
    return () => ipcRenderer.removeListener("gateway-log", listener);
  },

  onGatewayExit: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("gateway-exit", listener);
    return () => ipcRenderer.removeListener("gateway-exit", listener);
  },
});
