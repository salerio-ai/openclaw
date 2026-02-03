import { app, BrowserWindow, ipcMain, shell } from "electron";
import { resolve } from "node:path";
import { spawn, ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Socket } from "node:net";
import { initializeOpenClaw, isInitialized, type InitializationResult } from "./auto-init.js";
import {
  listProviders,
  authenticateWithApiKey,
  authenticateWithToken,
  authenticateWithOAuth,
  handleOAuthPromptResponse,
  type AuthResult,
} from "./oauth-handler.js";
import { loadModelCatalog } from "../../../../src/agents/model-catalog";
import { upsertAuthProfile } from "../../../../src/agents/auth-profiles";
import {
  applyAuthProfileConfig,
  setAnthropicApiKey,
  setOpenrouterApiKey,
  writeOAuthCredentials,
} from "../../../../src/commands/onboard-auth";
import { applyPrimaryModel } from "../../../../src/commands/model-picker";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

let gatewayProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let controlWindow: BrowserWindow | null = null;
let gatewayPort: number = 18789;
let gatewayBind: string = "loopback";
let gatewayToken: string | null = null;
let initResult: InitializationResult | null = null;

// Gateway configuration
const GATEWAY_HOST = "127.0.0.1";

/**
 * Find the OpenClaw CLI executable (bundled with Electron app only)
 */
function findOpenClawCli(): string | null {
  // In development: look for built CLI in repo root
  // In production: look for bundled CLI in app resources

  // Try to find the CLI in bundled locations only
  const possiblePaths = [
    // Development: CLI built to repo root
    resolve(__dirname, "../../../openclaw.mjs"),
    resolve(__dirname, "../../../dist/cli.js"),
    // Development: CLI built in dist directory
    resolve(__dirname, "../../dist/cli.js"),
    // Production: Bundled CLI (adjust based on your build configuration)
    // If using electron-builder, resources might be in process.resourcesPath
    // For now, we assume CLI is bundled relative to the app
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      console.log(`Found OpenClaw CLI at: ${path}`);
      return path;
    }
  }

  console.error("OpenClaw CLI not found in bundled locations");
  return null;
}

/**
 * Load gateway configuration from the config file
 */
function loadGatewayConfig(): { port: number; bind: string; token?: string } | null {
  try {
    const configPath = resolve(app.getPath("home"), ".openclaw/openclaw.json");
    if (!existsSync(configPath)) {
      return null;
    }

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const port = config.gateway?.port ?? 18789;
    const bind = config.gateway?.bind ?? "loopback";
    const token = config.gateway?.auth?.token;

    console.log(`Loaded gateway config: port=${port}, bind=${bind}, auth=${token ? "token" : "none"}`);
    return { port, bind, token };
  } catch (error) {
    console.error("Failed to load gateway config:", error);
    return null;
  }
}

/**
 * Start the OpenClaw Gateway process
 */
async function startGateway(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (gatewayProcess) {
      console.log("Gateway already running");
      resolve(true);
      return;
    }

    const cliPath = findOpenClawCli();
    if (!cliPath) {
      reject(new Error("OpenClaw CLI not found"));
      return;
    }

    console.log(`Starting gateway with CLI: ${cliPath}`);

    // Try to load config first, otherwise use initialization result or defaults
    const loadedConfig = loadGatewayConfig();
    if (loadedConfig) {
      gatewayPort = loadedConfig.port;
      gatewayBind = loadedConfig.bind;
      // Ensure token is loaded
      if (loadedConfig.token) {
        gatewayToken = loadedConfig.token;
      }
    } else if (initResult) {
      gatewayPort = initResult.gatewayPort;
      gatewayBind = initResult.gatewayBind;
      if (initResult.gatewayToken) {
        gatewayToken = initResult.gatewayToken;
      }
    }

    console.log(`Starting gateway on port ${gatewayPort} with bind=${gatewayBind}`);
    console.log(`Authentication: ${loadedConfig?.token ? "token" : "none (local development mode)"}`);

    const args = [
      "gateway",
      "run",
      "--port", String(gatewayPort),
      "--bind", gatewayBind,
      "--allow-unconfigured",
    ];

    // Store token for WS URL
    if (gatewayToken) {
      console.log(`Using token: ${gatewayToken.slice(0, 8)}...`);
      args.push("--token", gatewayToken);
    }

    gatewayProcess = spawn(cliPath, args, {
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      stdio: "pipe",
    });

    gatewayProcess.stdout?.on("data", (data) => {
      const output = data.toString().trim();
      console.log(`[Gateway stdout]: ${output}`);
      mainWindow?.webContents.send("gateway-log", { stream: "stdout", message: output });
    });

    gatewayProcess.stderr?.on("data", (data) => {
      const output = data.toString().trim();
      console.error(`[Gateway stderr]: ${output}`);
      mainWindow?.webContents.send("gateway-log", { stream: "stderr", message: output });
    });

    gatewayProcess.on("error", (error) => {
      console.error("[Gateway error]:", error);
      gatewayProcess = null;
      reject(error);
    });

    gatewayProcess.on("exit", (code, signal) => {
      console.log(`[Gateway exit]: code=${code}, signal=${signal}`);
      gatewayProcess = null;
      mainWindow?.webContents.send("gateway-exit", { code, signal });
    });

    // Give it a moment to start
    setTimeout(() => {
      if (gatewayProcess && !gatewayProcess.killed) {
        console.log("Gateway started successfully");
        resolve(true);
      } else {
        reject(new Error("Gateway failed to start"));
      }
    }, 2000); // Increased timeout to allow for startup
  });
}

/**
 * Stop the OpenClaw Gateway process
 */
function stopGateway(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!gatewayProcess) {
      console.log("Gateway not running");
      resolve(true);
      return;
    }

    console.log("Stopping gateway...");

    gatewayProcess.kill("SIGTERM");

    // Force kill after 5 seconds
    const timeout = setTimeout(() => {
      if (gatewayProcess && !gatewayProcess.killed) {
        console.log("Force killing gateway...");
        gatewayProcess.kill("SIGKILL");
      }
    }, 5000);

    gatewayProcess.on("exit", () => {
      clearTimeout(timeout);
      gatewayProcess = null;
      console.log("Gateway stopped");
      resolve(true);
    });
  });
}

function buildControlUiUrl(params: { port: number; token?: string | null }) {
  const baseUrl = `http://127.0.0.1:${params.port}`;
  if (!params.token) {
    return baseUrl;
  }
  return `${baseUrl}?token=${params.token}`;
}

async function waitForGatewayPort(port: number, timeoutMs = 20_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await new Promise<boolean>((resolve) => {
      const socket = new Socket();
      const onDone = (result: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(1_000);
      socket.once("connect", () => onDone(true));
      socket.once("timeout", () => onDone(false));
      socket.once("error", () => onDone(false));
      socket.connect(port, "127.0.0.1");
    });
    if (ready) {
      return true;
    }
    await delay(250);
  }
  return false;
}

function openControlUiWindow(): void {
  const controlUrl = buildControlUiUrl({ port: gatewayPort, token: gatewayToken });
  const loadingHtml = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Loading OpenClaw Control</title>
        <style>
          :root {
            color-scheme: light;
          }
          html, body {
            height: 100%;
            margin: 0;
            font-family: "SF Pro Text", "Inter", system-ui, -apple-system, sans-serif;
            background: radial-gradient(circle at top, #f7f3ff, #eef2ff 55%, #fef7ed 100%);
            color: #1f2937;
          }
          .wrap {
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .card {
            background: #ffffffcc;
            border: 1px solid #e5e7eb;
            border-radius: 20px;
            padding: 32px 40px;
            box-shadow: 0 18px 60px rgba(15, 23, 42, 0.12);
            min-width: 320px;
            text-align: center;
          }
          .title {
            font-size: 18px;
            font-weight: 600;
            margin: 0 0 8px;
          }
          .subtitle {
            font-size: 14px;
            color: #6b7280;
            margin: 0 0 20px;
          }
          .spinner {
            width: 44px;
            height: 44px;
            margin: 0 auto;
            border-radius: 50%;
            border: 4px solid #e5e7eb;
            border-top-color: #6366f1;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="card">
            <div class="spinner"></div>
            <p class="title">Loading Control UI</p>
            <p class="subtitle">Starting gateway and preparing dashboard…</p>
          </div>
        </div>
      </body>
    </html>
  `.trim();
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.loadURL(`data:text/html,${encodeURIComponent(loadingHtml)}`).catch(() => {});
    waitForGatewayPort(gatewayPort).then((ready) => {
      if (!ready || !controlWindow || controlWindow.isDestroyed()) {
        return;
      }
      controlWindow.loadURL(controlUrl).catch((error) => {
        console.warn("[Control UI] Failed to reload Control UI:", error);
      });
    });
    controlWindow.focus();
    return;
  }

  controlWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "OpenClaw Control",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  controlWindow.on("closed", () => {
    controlWindow = null;
  });

  controlWindow.loadURL(`data:text/html,${encodeURIComponent(loadingHtml)}`).catch(() => {});
  controlWindow.webContents.on("did-fail-load", () => {
    waitForGatewayPort(gatewayPort).then((ready) => {
      if (!ready || !controlWindow || controlWindow.isDestroyed()) {
        return;
      }
      controlWindow.loadURL(controlUrl).catch((error) => {
        console.warn("[Control UI] Failed to load Control UI:", error);
      });
    });
  });

  waitForGatewayPort(gatewayPort).then((ready) => {
    if (!ready || !controlWindow || controlWindow.isDestroyed()) {
      return;
    }
    controlWindow.loadURL(controlUrl).catch((error) => {
      console.warn("[Control UI] Failed to load Control UI:", error);
    });
  });
}

/**
 * Create the main browser window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Preload is always in dist/main/preload.js
      // In dev: __dirname = "dist/", so "main/preload.js" = "dist/main/preload.js"
      // In prod: __dirname = "dist/main/", so "preload.js" = "dist/main/preload.js"
      preload: process.env.NODE_ENV === "development"
        ? resolve(__dirname, "main/preload.js")
        : resolve(__dirname, "preload.js"),
    },
    title: "OpenClaw",
  });

  // Load the app
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(resolve(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Setup IPC handlers
 */
function setupIpcHandlers(): void {
  // Initialize OpenClaw
  ipcMain.handle("openclaw-init", async (_event, options?) => {
    try {
      const result = await initializeOpenClaw(options);
      if (result.success) {
        initResult = result;
        gatewayPort = result.gatewayPort;
        gatewayBind = result.gatewayBind;
      }
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Check if initialized
  ipcMain.handle("openclaw-is-initialized", () => {
    return isInitialized();
  });

  // Reset onboarding (delete ~/.openclaw and stop gateway)
  ipcMain.handle("openclaw-reset", async () => {
    try {
      await stopGateway();
      if (controlWindow && !controlWindow.isDestroyed()) {
        controlWindow.close();
      }
      const openclawDir = resolve(app.getPath("home"), ".openclaw");
      rmSync(openclawDir, { recursive: true, force: true });
      initResult = null;
      gatewayToken = null;
      gatewayProcess = null;
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Start gateway
  ipcMain.handle("gateway-start", async (_event, apiKey?: string) => {
    try {
      // If API key is provided, re-initialize config with the API key
      if (apiKey && apiKey.trim()) {
        console.log("[Gateway] Re-initializing with API key...");
        const result = await initializeOpenClaw({
          force: true,
          openrouterApiKey: apiKey.trim(),
        });
        if (result.success) {
          initResult = result;
          gatewayPort = result.gatewayPort;
          gatewayBind = result.gatewayBind;
          if (result.gatewayToken) {
            gatewayToken = result.gatewayToken;
          }
        } else {
          return { success: false, error: result.error ?? "Failed to initialize config" };
        }
      }

      await startGateway();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Stop gateway
  ipcMain.handle("gateway-stop", async () => {
    try {
      await stopGateway();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Get gateway status
  ipcMain.handle("gateway-status", () => {
    const wsUrl = gatewayToken
      ? `ws://${GATEWAY_HOST}:${gatewayPort}?token=${gatewayToken}`
      : `ws://${GATEWAY_HOST}:${gatewayPort}`;

    return {
      running: gatewayProcess !== null && !gatewayProcess.killed,
      pid: gatewayProcess?.pid ?? null,
      port: gatewayPort,
      host: GATEWAY_HOST,
      bind: gatewayBind,
      wsUrl,
      initialized: isInitialized(),
    };
  });

  // Get app info
  ipcMain.handle("get-app-info", () => {
    return {
      version: app.getVersion(),
      name: app.getName(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
    };
  });

  // === Onboarding handlers ===

  // List available providers
  ipcMain.handle("onboard-list-providers", () => {
    return listProviders();
  });

  // Authenticate with API key
  ipcMain.handle("onboard-auth-api-key", async (_event, provider: string, apiKey: string) => {
    try {
      const result = await authenticateWithApiKey({ provider: provider as any, apiKey });
      return result;
    } catch (error) {
      return {
        success: false,
        provider,
        method: "api_key",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Authenticate with token
  ipcMain.handle("onboard-auth-token", async (_event, provider: string, token: string) => {
    try {
      const result = await authenticateWithToken({ provider: provider as any, token });
      return result;
    } catch (error) {
      return {
        success: false,
        provider,
        method: "token",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Authenticate with OAuth
  ipcMain.handle("onboard-auth-oauth", async (_event, provider: string) => {
    try {
      const result = await authenticateWithOAuth({
        provider: provider as any,
        onPromptRequired: (message) => {
          // Send request to renderer to ask user for input
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("onboard-oauth-request-code", message);
          }
        },
      });
      return result;
    } catch (error) {
      return {
        success: false,
        provider,
        method: "oauth",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Handle manual OAuth code submission
  ipcMain.handle("onboard-oauth-submit-code", (_event, code: string) => {
    handleOAuthPromptResponse(code);
    return { success: true };
  });

  // List available models for provider
  ipcMain.handle("onboard-list-models", async (_event, provider: string) => {
    try {
      const catalog = await loadModelCatalog({ useCache: false });
      return catalog.filter((entry) => entry.provider === provider);
    } catch (error) {
      console.warn("[Onboard] Failed to load model catalog:", error);
      return [];
    }
  });

  // Complete onboarding (save credentials and initialize)
  ipcMain.handle(
    "onboard-complete",
    async (_event, authResult: AuthResult, options?: { model?: string }) => {
      try {
      const resolveAuthProvider = (result: AuthResult) => {
        if (result.provider === "openai" && result.method === "oauth") {
          return "openai-codex";
        }
        return result.provider;
      };

      const provider = resolveAuthProvider(authResult);
      const credential = authResult.credential;
      if (!credential) {
        return { success: false, error: "Missing credentials from onboarding" };
      }

      // Initialize with the API key in env
      const result = await initializeOpenClaw({
        force: true,
        openrouterApiKey:
          authResult.provider === "openrouter" && credential.type === "api_key"
            ? credential.key
            : undefined,
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Update config with the credential
      const configPath = resolve(app.getPath("home"), ".openclaw/openclaw.json");
      const config = JSON.parse(readFileSync(configPath, "utf-8"));

      let nextConfig = config;
      if (credential.type === "oauth") {
        const email =
          typeof credential.email === "string" && credential.email.trim()
            ? credential.email.trim()
            : "default";
        await writeOAuthCredentials(provider, {
          access: credential.access || "",
          refresh: credential.refresh || "",
          expires: credential.expires || 0,
          email: credential.email || "default",
        });
        nextConfig = applyAuthProfileConfig(nextConfig, {
          profileId: `${provider}:${email}`,
          provider,
          mode: "oauth",
          ...(email !== "default" ? { email } : {}),
        });
      } else if (credential.type === "token") {
        if (!credential.token?.trim()) {
          return { success: false, error: "Missing token credential" };
        }
        upsertAuthProfile({
          profileId: `${provider}:default`,
          credential: {
            type: "token",
            provider,
            token: credential.token,
          },
        });
        nextConfig = applyAuthProfileConfig(nextConfig, {
          profileId: `${provider}:default`,
          provider,
          mode: "token",
        });
      } else if (credential.type === "api_key") {
        if (!credential.key?.trim()) {
          return { success: false, error: "Missing API key credential" };
        }
        if (provider === "anthropic") {
          await setAnthropicApiKey(credential.key);
        } else if (provider === "openrouter") {
          await setOpenrouterApiKey(credential.key);
        } else {
          upsertAuthProfile({
            profileId: `${provider}:default`,
            credential: {
              type: "api_key",
              provider,
              key: credential.key,
            },
          });
        }
        nextConfig = applyAuthProfileConfig(nextConfig, {
          profileId: `${provider}:default`,
          provider,
          mode: "api_key",
        });
      }

      // Update model config
      const selectedModel = options?.model?.trim();
      const resolvedModel = selectedModel || authResult.defaultModel;
      if (resolvedModel) {
        nextConfig = applyPrimaryModel(nextConfig, resolvedModel);
      }

      // Write updated config
      writeFileSync(configPath, JSON.stringify(nextConfig, null, 2));

      // Update gateway settings
      gatewayPort = nextConfig.gateway?.port || 18789;
      gatewayBind = nextConfig.gateway?.bind || "loopback";
      if (nextConfig.gateway?.auth?.token) {
        gatewayToken = nextConfig.gateway.auth.token;
      }

      initResult = result;

      try {
        await startGateway();
        openControlUiWindow();
      } catch (error) {
        console.warn("[Gateway] Failed to auto-start or open Control UI:", error);
      }

      return { success: true };
    } catch (error) {
      return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // Open OAuth URL in browser
  ipcMain.handle("onboard-open-url", async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

// App lifecycle
app.whenReady().then(async () => {
  setupIpcHandlers();
  createWindow();

  console.log("=== OpenClaw Desktop starting ===");

  // Check if we need to initialize or re-initialize (fix broken config)
  let needsInit = !isInitialized();
  if (!needsInit) {
    const checkConfig = loadGatewayConfig();
    if (checkConfig && !checkConfig.token) {
      console.log("[Init] Existing configuration is missing token, forcing re-initialization...");
      needsInit = true;
    }
  }

  // Auto-initialize if needed
  if (needsInit) {
    console.log("[Init] Running auto-initialization...");
    try {
      const result = await initializeOpenClaw({ force: true });
      if (result.success) {
        console.log("[Init] ✓ Auto-initialization successful");
        initResult = result;
        gatewayPort = result.gatewayPort;
        gatewayBind = result.gatewayBind;
        if (result.gatewayToken) {
          gatewayToken = result.gatewayToken;
        }
      } else {
        console.error("[Init] ✗ Auto-initialization failed:", result.error);
      }
    } catch (error) {
      console.error("[Init] ✗ Auto-initialization error:", error);
    }
  } else {
    console.log("[Init] Configuration already exists and is valid");
    // Load existing config to get port and token
    const existingConfig = loadGatewayConfig();
    if (existingConfig) {
      gatewayPort = existingConfig.port;
      gatewayBind = existingConfig.bind;
      if (existingConfig.token) {
        gatewayToken = existingConfig.token;
      }
    }
  }

  // Auto-start gateway
  console.log("[Gateway] Auto-starting gateway...");
  try {
    await startGateway();
    console.log("[Gateway] ✓ Gateway started successfully");
    openControlUiWindow();
  } catch (error) {
    console.error("[Gateway] ✗ Failed to start gateway:", error);
  }
});

app.on("window-all-closed", async () => {
  console.log("[Lifecycle] All windows closed");

  // Stop gateway when all windows are closed
  console.log("[Gateway] Stopping gateway (windows closed)...");
  try {
    await stopGateway();
    console.log("[Gateway] ✓ Gateway stopped");
  } catch (error) {
    console.error("[Gateway] ✗ Failed to stop gateway:", error);
  }

  // On non-macOS platforms, quit the app when all windows are closed
  if (process.platform !== "darwin") {
    console.log("[Lifecycle] Quitting app (non-macOS)");
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    console.log("[Lifecycle] Reactivating app (create new window)");
    createWindow();
  }
});

app.on("before-quit", async () => {
  console.log("[Lifecycle] App about to quit");

  // Ensure gateway is stopped before quitting
  if (gatewayProcess) {
    console.log("[Gateway] Force stopping gateway before quit...");
    try {
      await stopGateway();
      console.log("[Gateway] ✓ Gateway stopped");
    } catch (error) {
      console.error("[Gateway] ✗ Failed to stop gateway:", error);
    }
  }
});
