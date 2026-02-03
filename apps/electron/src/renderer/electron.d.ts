/**
 * TypeScript declarations for the electronAPI exposed via contextBridge
 */

interface PresetConfigOptions {
  /** Gateway port (default: 18789) */
  gatewayPort?: number;
  /** Gateway bind address (default: "loopback") */
  gatewayBind?: "loopback" | "lan" | "auto";
  /** Workspace directory (default: "~/.openclaw/workspace") */
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

interface ElectronAPI {
  // OpenClaw initialization
  openclawInit: (options?: PresetConfigOptions) => Promise<InitializationResult>;
  openclawIsInitialized: () => Promise<boolean>;

  // Gateway management
  gatewayStart: (apiKey?: string) => Promise<{ success: boolean; error?: string }>;
  gatewayStop: () => Promise<{ success: boolean; error?: string }>;
  gatewayStatus: () => Promise<GatewayStatus>;
  getAppInfo: () => Promise<AppInfo>;

  // Event listeners
  onGatewayLog: (callback: (data: GatewayLogData) => void) => () => void;
  onGatewayExit: (callback: (data: GatewayExitData) => void) => () => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
