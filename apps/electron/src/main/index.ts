import { app, BrowserWindow, ipcMain } from "electron";
import { resolve } from "node:path";
import { spawn, ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeOpenClaw, isInitialized, type InitializationResult } from "./auto-init.js";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

let gatewayProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
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

  // Start gateway
  ipcMain.handle("gateway-start", async () => {
    try {
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
