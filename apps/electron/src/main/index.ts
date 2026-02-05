import { app, BrowserWindow, ipcMain, shell, globalShortcut, powerSaveBlocker } from "electron";
import { resolve, dirname } from "node:path";
import { spawn, spawnSync, ChildProcess } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  appendFileSync,
  cpSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Socket } from "node:net";
import {
  initializeOpenClaw,
  getConfigPath,
  isFullyInitialized,
  type InitializationResult,
} from "./auto-init.js";
import { resolveCliInvocation, resolveOpenClawCliPath } from "./cli-utils.js";
import {
  listProviders,
  authenticateWithApiKey,
  authenticateWithToken,
  authenticateWithOAuth,
  handleOAuthPromptResponse,
  exchangeToken,
  generateLoginUrl,
  startOAuthCallbackServer,
  stopOAuthCallbackServer,
  type AuthResult,
} from "./oauth-handler.js";
import * as BustlyOAuth from "./bustly-oauth.js";
import { loadModelCatalog } from "../../../../src/agents/model-catalog";
import { upsertAuthProfile } from "../../../../src/agents/auth-profiles";
import { DEFAULT_PROVIDER } from "../../../../src/agents/defaults";
import {
  buildAllowedModelSet,
  buildModelAliasIndex,
  modelKey,
  normalizeProviderId,
} from "../../../../src/agents/model-selection";
import { loadConfig } from "../../../../src/config/config";
import { mergeWhatsAppConfig } from "../../../../src/config/merge-config";
import type { DmPolicy, OpenClawConfig } from "../../../../src/config/types";
import {
  applyAuthProfileConfig,
  setOpenrouterApiKey,
  writeOAuthCredentials,
} from "../../../../src/commands/onboard-auth";
import { applyPrimaryModel } from "../../../../src/commands/model-picker";
import { normalizeE164 } from "../../../../src/utils";
import {
  resolveDefaultWhatsAppAccountId,
  resolveWhatsAppAuthDir,
} from "../../../../src/web/accounts";
import { startWebLoginWithQr, waitForWebLogin } from "../../../../src/web/login-qr";
import { webAuthExists } from "../../../../src/web/session";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

let gatewayProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let devPanelWindow: BrowserWindow | null = null;
let needsOnboardAtLaunch = false;
let gatewayPort: number = 18789;
let gatewayBind: string = "loopback";
let gatewayToken: string | null = null;
let initResult: InitializationResult | null = null;
let mainLogPath: string | null = null;

type WhatsAppConfigRequest =
  | {
      mode: "personal";
      personalNumber: string;
    }
  | {
      mode: "separate";
      dmPolicy: DmPolicy;
      allowFromMode: "keep" | "unset" | "list";
      allowFromList?: string;
    };

// Gateway configuration
const GATEWAY_HOST = "127.0.0.1";
const DEV_PANEL_HASH = "devpanel";
const DEV_PANEL_SHORTCUT = "CommandOrControl+Shift+Alt+D";
const PRELOAD_PATH = process.env.NODE_ENV === "development"
  ? resolve(__dirname, "main/preload.js")
  : resolve(__dirname, "preload.js");

function ensureMainLogPath(): string {
  if (mainLogPath) {
    return mainLogPath;
  }
  const logDir = resolve(app.getPath("home"), ".openclaw/electron/logs");
  mkdirSync(logDir, { recursive: true, mode: 0o700 });
  mainLogPath = resolve(logDir, "main.log");
  return mainLogPath;
}

function writeMainLog(message: string) {
  try {
    const logPath = ensureMainLogPath();
    const line = `[${new Date().toISOString()}] ${message}\n`;
    appendFileSync(logPath, line, "utf-8");
  } catch (error) {
    console.error("[Main log] Failed to write:", error);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("main-log", { message });
  }
}

function logStartupPaths(): void {
  writeMainLog(`cwd=${process.cwd()}`);
  writeMainLog(`__dirname=${__dirname}`);
}

function ensureBundledExtensionsDir(params: {
  resourcesPath: string;
  appPath: string;
}): string {
  // Check if we're in development mode by looking for the project root extensions
  // Try multiple possible paths from the app directory
  const possibleProjectExtensions = [
    // From apps/electron/dist, go up to project root (4 levels: dist -> electron -> apps -> project root)
    resolve(params.appPath, "..", "..", "..", "extensions"),
    // From apps/electron/dist, go up to apps (2 levels: dist -> electron)
    resolve(params.appPath, "..", "..", "extensions"),
    // From apps/electron (if running without dist)
    resolve(params.appPath, "..", "extensions"),
  ];

  for (const projectExtensions of possibleProjectExtensions) {
    if (existsSync(projectExtensions)) {
      writeMainLog(`Using project extensions dir: ${projectExtensions}`);
      return projectExtensions;
    }
  }

  // Production: try bundled extensions in resources
  const bundledDir = resolve(params.resourcesPath, "extensions");
  if (existsSync(bundledDir)) {
    return bundledDir;
  }

  // Development mode: try to find extensions in the project root
  // The app is in apps/electron/dist, so we need to go up 3 levels to reach project root
  const devExtensionsDir = resolve(params.appPath, "..", "..", "..", "extensions");
  if (existsSync(devExtensionsDir)) {
    writeMainLog(`Using development extensions dir: ${devExtensionsDir}`);
    return devExtensionsDir;
  }

  const bundledSource = resolve(params.appPath, "..", "resources", "openclaw", "extensions");
  if (!existsSync(bundledSource)) {
    writeMainLog(`Bundled extensions missing and source not found: ${bundledDir}`);
    return bundledDir;
  }
  try {
    if (!existsSync(bundledDir)) {
      mkdirSync(dirname(bundledDir), { recursive: true });
      cpSync(bundledSource, bundledDir, { recursive: true, dereference: true });
      writeMainLog(`Bundled extensions copied: ${bundledSource} -> ${bundledDir}`);
    }
  } catch (error) {
    writeMainLog(
      `Bundled extensions copy failed: ${bundledSource} -> ${bundledDir} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  return bundledDir;
}

function resolveBundledOpenClawVersion(): string | null {
  const candidatePaths = [
    resolve(process.resourcesPath, "openclaw.package.json"),
    resolve(__dirname, "../../../../package.json"),
  ];

  for (const candidate of candidatePaths) {
    try {
      if (!existsSync(candidate)) {
        continue;
      }
      const raw = JSON.parse(readFileSync(candidate, "utf-8")) as { version?: string };
      if (raw.version) {
        return raw.version;
      }
    } catch {
      // ignore
    }
  }

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
  return new Promise((resolvePromise, reject) => {
    const startAt = Date.now();
    if (gatewayProcess) {
      console.log("Gateway already running");
      writeMainLog("Gateway already running");
      resolvePromise(true);
      return;
    }

    const cliPath = resolveOpenClawCliPath({
      info: (message) => console.log(message),
      error: (message) => console.error(message),
    });
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

    const recentStdout: string[] = [];
    const recentStderr: string[] = [];
    const pushRecent = (buffer: string[], line: string) => {
      buffer.push(line);
      if (buffer.length > 50) {
        buffer.shift();
      }
    };

    const invocation = resolveCliInvocation(cliPath, args, { includeBundledNode: true });
    if (!invocation) {
      writeMainLog("Failed to locate node binary. Set OPENCLAW_NODE_PATH or bundle node.");
      reject(new Error("Node binary not found for OpenClaw CLI"));
      return;
    }
    const nodePath = invocation.nodePath ?? null;
    if (invocation.isMjs && nodePath) {
      try {
        const nodeVersion = spawnSync(nodePath, ["-v"], { encoding: "utf-8" }).stdout?.trim();
        const nodeArch = spawnSync(nodePath, ["-p", "process.arch"], { encoding: "utf-8" })
          .stdout?.trim();
        writeMainLog(`Gateway node runtime: path=${nodePath} version=${nodeVersion ?? "unknown"} arch=${nodeArch ?? "unknown"}`);
      } catch (error) {
        writeMainLog(`Gateway node runtime probe failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    writeMainLog(
      `Gateway launch inputs: cli=${cliPath} node=${nodePath ?? "n/a"} port=${gatewayPort} bind=${gatewayBind}`,
    );
    const spawnCommand = invocation.command;
    const spawnArgs = invocation.args;
    const appPath = app.getAppPath();
    const resourcesPath = process.resourcesPath || appPath;
    const bundledPluginsDir = ensureBundledExtensionsDir({
      resourcesPath,
      appPath,
    });
    const bundledVersion = resolveBundledOpenClawVersion();
    if (bundledVersion) {
      writeMainLog(`Bundled OpenClaw version: ${bundledVersion}`);
    }
    const homeDir = app.getPath("home");
    const stateDir = resolve(homeDir, ".openclaw");
    const shellPath = process.env.SHELL?.trim() || "/bin/zsh";
    const fixedPath =
      process.env.PATH?.trim() ||
      "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
    const bunInstall =
      process.env.BUN_INSTALL?.trim() || resolve(app.getPath("home"), ".bun");
    const homebrewPrefix = process.env.HOMEBREW_PREFIX?.trim() || "/opt/homebrew";
    const appNodeModules = resolve(appPath, "node_modules");
    const resourcesNodeModules = resolve(resourcesPath, "node_modules");
    const openclawNodeModules = resolve(resourcesPath, "openclaw", "node_modules");
    const inheritedNodePath = process.env.NODE_PATH?.trim();
    const nodePathCandidates = [
      openclawNodeModules,
      appNodeModules,
      resourcesNodeModules,
      inheritedNodePath,
    ];
    const combinedNodePath = nodePathCandidates
      .filter((value) => Boolean(value && value.length > 0))
      .join(":");
    const effectiveNodePath = combinedNodePath || openclawNodeModules;
    const nodePathStatus = nodePathCandidates
      .filter((value) => Boolean(value && value.length > 0))
      .map((value) => `${value}(${existsSync(value!) ? "exists" : "missing"})`)
      .join(" | ");

    // Load .env file for Bustly OAuth configuration
    const loadEnvVars = () => {
      const envVars: Record<string, string> = {};
      const envPaths = [
        // Try apps/electron/.env first (Bustly config location)
        // In dev: dist/main-dev.js -> ../.env = apps/electron/.env
        // In prod: dist/main/index.js -> ../../.env = apps/electron/.env
        process.env.NODE_ENV === "development"
          ? resolve(__dirname, "../.env")
          : resolve(__dirname, "../../.env"),
        // Fallback to root .env
        resolve(app.getAppPath(), ".env"),
      ];

      for (const envPath of envPaths) {
        try {
          if (existsSync(envPath)) {
            const envContent = readFileSync(envPath, "utf-8");
            for (const line of envContent.split("\n")) {
              const trimmedLine = line.trim();
              if (trimmedLine && !trimmedLine.startsWith("#")) {
                const [key, ...valueParts] = trimmedLine.split("=");
                const value = valueParts.join("=").trim();
                if (key && value) {
                  envVars[key] = value;
                }
              }
            }
            console.log(`[Env] Loaded environment variables from ${envPath}:`, Object.keys(envVars));
            break; // Stop after loading first found .env file
          }
        } catch (error) {
          console.error(`[Env] Failed to load ${envPath}:`, error);
        }
      }
      return envVars;
    };

    const envVars = loadEnvVars();

    // Start OAuth callback server for Bustly login
    const oauthCallbackPort = startOAuthCallbackServer();
    console.log("[Bustly] OAuth callback server started on port", oauthCallbackPort);

    const spawnEnv = {
      ...process.env,
      ...envVars,
      NODE_ENV: "production",
      OPENCLAW_BUNDLED_PLUGINS_DIR: bundledPluginsDir,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG: resolve(stateDir, "openclaw.json"),
      HOME: homeDir,
      USERPROFILE: homeDir,
      OPENCLAW_LOAD_SHELL_ENV: "0",
      OPENCLAW_DEFER_SHELL_ENV_FALLBACK: "1",
      SHELL: shellPath,
      PATH: fixedPath,
      BUN_INSTALL: bunInstall,
      HOMEBREW_PREFIX: homebrewPrefix,
      TERM: process.env.TERM?.trim() || "xterm-256color",
      COLORTERM: process.env.COLORTERM?.trim() || "truecolor",
      TERM_PROGRAM: process.env.TERM_PROGRAM?.trim() || "OpenClaw",
      NODE_PATH: effectiveNodePath,
      BUSTLY_OAUTH_CALLBACK_PORT: String(oauthCallbackPort),
      ...(bundledVersion ? { OPENCLAW_BUNDLED_VERSION: bundledVersion } : {}),
    };
    if (existsSync(bundledPluginsDir)) {
      spawnEnv.OPENCLAW_BUNDLED_PLUGINS_DIR = bundledPluginsDir;
    }
    writeMainLog(
      `Gateway env: SHELL=${shellPath} OPENCLAW_LOAD_SHELL_ENV=1 NODE_PATH=${effectiveNodePath || "(empty)"} appPath=${appPath} resourcesPath=${resourcesPath} candidates=${nodePathStatus || "(none)"} rawOpenClawNodeModules=${openclawNodeModules} rawResourcesNodeModules=${resourcesNodeModules} rawAppNodeModules=${appNodeModules} inheritedNodePath=${inheritedNodePath ?? "(none)"}`,
    );

    writeMainLog(
      `Gateway spawn: command=${spawnCommand} args=${spawnArgs.join(" ")}`,
    );
    gatewayProcess = spawn(spawnCommand, spawnArgs, {
      env: spawnEnv,
      stdio: "pipe",
    });

    gatewayProcess.stdout?.on("data", (data) => {
      const output = data.toString().trim();
      if (output) {
        pushRecent(recentStdout, output);
        writeMainLog(`Gateway stdout: ${output}`);
      }
      console.log(`[Gateway stdout]: ${output}`);
      mainWindow?.webContents.send("gateway-log", { stream: "stdout", message: output });
    });

    gatewayProcess.stderr?.on("data", (data) => {
      const output = data.toString().trim();
      if (output) {
        pushRecent(recentStderr, output);
        writeMainLog(`Gateway stderr: ${output}`);
      }
      console.error(`[Gateway stderr]: ${output}`);
      mainWindow?.webContents.send("gateway-log", { stream: "stderr", message: output });
    });

    gatewayProcess.on("error", (error) => {
      console.error("[Gateway error]:", error);
      writeMainLog(`Gateway spawn error: ${error instanceof Error ? error.message : String(error)}`);
      gatewayProcess = null;
      reject(error);
    });

    gatewayProcess.on("exit", (code, signal) => {
      console.log(`[Gateway exit]: code=${code}, signal=${signal}`);
      writeMainLog(
        `Gateway exited during startup: code=${code ?? "null"} signal=${signal ?? "null"}`,
      );
      if (recentStderr.length > 0) {
        writeMainLog(`Gateway stderr tail:\n${recentStderr.join("\n")}`);
      } else if (recentStdout.length > 0) {
        writeMainLog(`Gateway stdout tail:\n${recentStdout.join("\n")}`);
      }
      gatewayProcess = null;
      mainWindow?.webContents.send("gateway-exit", { code, signal });
    });

    const startupTimeoutMs = 20_000;
    const exitPromise = new Promise<never>((_resolve, rejectExit) => {
      gatewayProcess?.once("exit", (code, signal) => {
        rejectExit(
          new Error(`Gateway exited during startup: code=${code ?? "null"} signal=${signal ?? "null"}`),
        );
      });
    });
    const readyPromise = (async () => {
      const ready = await waitForGatewayPort(gatewayPort, startupTimeoutMs);
      if (!ready) {
        throw new Error(`Gateway port ${gatewayPort} not ready`);
      }
      return true;
    })();

    Promise.race([readyPromise, exitPromise])
      .then(() => {
        const elapsedMs = Date.now() - startAt;
        writeMainLog(`Gateway startup ready in ${elapsedMs}ms`);
        console.log("Gateway started successfully");
        resolvePromise(true);
      })
      .catch((error) => {
        const elapsedMs = Date.now() - startAt;
        writeMainLog(`Gateway startup failed after ${elapsedMs}ms`);
        const stderrTail = recentStderr.length > 0 ? recentStderr.join("\n") : "";
        const stdoutTail = recentStdout.length > 0 ? recentStdout.join("\n") : "";
        if (stderrTail) {
          writeMainLog(`Gateway startup stderr:\n${stderrTail}`);
        } else if (stdoutTail) {
          writeMainLog(`Gateway startup stdout:\n${stdoutTail}`);
        }
        if (gatewayProcess && !gatewayProcess.killed) {
          gatewayProcess.kill("SIGTERM");
        }
        reject(error);
      });
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

function openControlUiInMainWindow(): void {
  const controlUrl = buildControlUiUrl({ port: gatewayPort, token: gatewayToken });
  writeMainLog(
    `Opening Control UI: url=${controlUrl} token=${gatewayToken ? "present" : "missing"}`,
  );
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
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const webContents = mainWindow.webContents;
  const logLoadFailure = (
    _event: unknown,
    errorCode: number,
    errorDescription: string,
    validatedUrl: string,
    isMainFrame: boolean,
  ) => {
    if (!isMainFrame) {
      return;
    }
    writeMainLog(
      `Control UI load failed: code=${errorCode} url=${validatedUrl} error=${errorDescription}`,
    );
  };
  webContents.on("did-fail-load", logLoadFailure);
  webContents.on("did-finish-load", () => {
    const url = webContents.getURL();
    writeMainLog(`Control UI load finished: url=${url}`);
  });
  webContents.on("did-navigate", (_event, url) => {
    writeMainLog(`Control UI navigated: url=${url}`);
  });

  mainWindow.loadURL(`data:text/html,${encodeURIComponent(loadingHtml)}`).catch((error) => {
    writeMainLog(`Loading screen failed: ${error instanceof Error ? error.message : String(error)}`);
  });

  waitForGatewayPort(gatewayPort).then((ready) => {
    writeMainLog(`Gateway port ${gatewayPort} ready=${ready}`);
    if (!ready || !mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.loadURL(controlUrl).catch((error) => {
      writeMainLog(`Control UI loadURL failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  });
}

function resolveOpenClawConfigPath(): string {
  return getConfigPath() ?? resolve(app.getPath("home"), ".openclaw/openclaw.json");
}

function readOpenClawConfigFile(): OpenClawConfig {
  const configPath = resolveOpenClawConfigPath();
  return JSON.parse(readFileSync(configPath, "utf-8")) as OpenClawConfig;
}

function writeOpenClawConfigFile(config: OpenClawConfig): void {
  const configPath = resolveOpenClawConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function parseAllowFromList(raw: string): string[] {
  const parts = String(raw)
    .split(/[\n,;]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
  const normalized = parts.map((part) => (part === "*" ? "*" : normalizeE164(part)));
  return [...new Set(normalized.filter(Boolean))];
}

function loadRendererWindow(targetWindow: BrowserWindow, options?: { hash?: string }) {
  if (process.env.NODE_ENV === "development") {
    const url = options?.hash ? `http://localhost:5180/#${options.hash}` : "http://localhost:5180";
    targetWindow.loadURL(url).catch((error) => {
      writeMainLog(`Renderer load failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  } else {
    const filePath = resolve(__dirname, "../renderer/index.html");
    const loadOptions = options?.hash ? { hash: options.hash } : undefined;
    targetWindow.loadFile(filePath, loadOptions).catch((error) => {
      writeMainLog(`Renderer load failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}

function createDevPanelWindow(): void {
  if (devPanelWindow && !devPanelWindow.isDestroyed()) {
    devPanelWindow.focus();
    return;
  }

  devPanelWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: PRELOAD_PATH,
    },
    title: "OpenClaw DevPanel",
  });

  loadRendererWindow(devPanelWindow, { hash: DEV_PANEL_HASH });

  devPanelWindow.on("closed", () => {
    devPanelWindow = null;
  });
}

function toggleDevPanelWindow(): boolean {
  if (devPanelWindow && !devPanelWindow.isDestroyed()) {
    devPanelWindow.close();
    return false;
  }

  createDevPanelWindow();
  return true;
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
      preload: PRELOAD_PATH,
    },
    title: "OpenClaw",
  });

  // Load the app
  if (process.env.NODE_ENV === "development") {
    loadRendererWindow(mainWindow);
    mainWindow.webContents.openDevTools();
  } else {
    loadRendererWindow(mainWindow);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function ensureWindow(): void {
  if (app.isReady()) {
    createWindow();
    return;
  }
  app.once("ready", () => createWindow());
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
    return isFullyInitialized();
  });

  // Whether this launch needs onboarding (computed on app start)
  ipcMain.handle("openclaw-needs-onboard", () => {
    return needsOnboardAtLaunch;
  });

  // Reset onboarding (delete ~/.openclaw and stop gateway)
  ipcMain.handle("openclaw-reset", async () => {
    try {
      await stopGateway();
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
      if (!isFullyInitialized()) {
        return { success: false, error: "OpenClaw is not onboarded yet." };
      }
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
      initialized: isFullyInitialized(),
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

  // === Bustly OAuth handlers ===

  // Check if user is logged in to Bustly
  ipcMain.handle("bustly-is-logged-in", () => {
    return BustlyOAuth.isBustlyLoggedIn();
  });

  // Get current Bustly user info
  ipcMain.handle("bustly-get-user-info", () => {
    return BustlyOAuth.getBustlyUserInfo();
  });

  // Bustly OAuth login
  ipcMain.handle("bustly-login", async () => {
    try {
      console.log("[Bustly Login] Starting Bustly OAuth login flow");

      // Initialize OAuth flow (clears any existing state)
      const oauthState = BustlyOAuth.initBustlyOAuthFlow();
      console.log("[Bustly Login] OAuth state initialized, traceId:", oauthState.loginTraceId);

      // Start OAuth callback server
      const oauthPort = startOAuthCallbackServer();
      console.log("[Bustly Login] OAuth callback server started on port", oauthPort);

      // Generate login URL
      const redirectUri = `http://127.0.0.1:${oauthPort}/authorize`;
      const loginUrl = generateLoginUrl(oauthState.loginTraceId!, redirectUri);

      console.log("[Bustly Login] Got login URL, opening browser...");

      // Open login URL in browser
      await shell.openExternal(loginUrl);

      // Poll for completion
      const maxPollAttempts = 60; // 2 minutes (60 * 2s)
      let pollAttempts = 0;

      while (pollAttempts < maxPollAttempts) {
        await delay(2000);

        const code = BustlyOAuth.getBustlyAuthCode();

        if (code) {
          // Got the code, now exchange for token
          console.log("[Bustly Login] Got authorization code, exchanging token...");
          const apiResponse = await exchangeToken(code);

          // Extract Supabase access token from extras
          const supabaseAccessToken = apiResponse.data.extras?.supabase_session?.access_token ?? "";
          if (!supabaseAccessToken) {
            throw new Error("Missing Supabase access token in API response");
          }

          // Build search data config from API extras
          const searchDataConfig = apiResponse.data.extras?.["bustly-search-data"];

          // Complete login - store user info and search data config in bustlyOauth.json
          // Supabase access token is stored within bustlySearchData.SEARCH_DATA_SUPABASE_ACCESS_TOKEN
          BustlyOAuth.completeBustlyLogin({
            user: {
              userId: apiResponse.data.userId,
              userName: apiResponse.data.userName,
              userEmail: apiResponse.data.userEmail,
              workspaceId: apiResponse.data.workspaceId,
              skills: apiResponse.data.extras?.["bustly-search-data"]
                ? ["search-data"]
                : apiResponse.data.skills ?? [],
            },
            bustlySearchData: searchDataConfig ? {
              SEARCH_DATA_SUPABASE_URL: searchDataConfig.search_DATA_SUPABASE_URL ?? "",
              SEARCH_DATA_SUPABASE_ANON_KEY: searchDataConfig.search_DATA_SUPABASE_ANON_KEY ?? "",
              SEARCH_DATA_SUPABASE_ACCESS_TOKEN: supabaseAccessToken,
              SEARCH_DATA_TOKEN: searchDataConfig.search_DATA_TOKEN ?? apiResponse.data.accessToken,
              SEARCH_DATA_WORKSPACE_ID: searchDataConfig.search_DATA_WORKSPACE_ID ?? apiResponse.data.workspaceId,
            } : undefined,
          });

          // Stop OAuth callback server
          stopOAuthCallbackServer();

          console.log("[Bustly Login] Login successful! Config stored in bustlyOauth.json");
          return { success: true };
        }

        pollAttempts++;
      }

      // Stop OAuth callback server on timeout
      stopOAuthCallbackServer();
      throw new Error("Login timed out. Please try again.");
    } catch (error) {
      console.error("[Bustly Login] Error:", error);
      // Stop OAuth callback server on error
      stopOAuthCallbackServer();
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Bustly OAuth logout
  ipcMain.handle("bustly-logout", async () => {
    try {
      console.log("[Bustly Logout] Logging out...");
      BustlyOAuth.logoutBustly();
      console.log("[Bustly Logout] Logged out successfully");

      return { success: true };
    } catch (error) {
      console.error("[Bustly Logout] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
      const cfg = loadConfig();
      const catalog = await loadModelCatalog({ config: cfg, useCache: false });
      const aliasIndex = buildModelAliasIndex({ cfg, defaultProvider: DEFAULT_PROVIDER });
      const { allowedCatalog } = buildAllowedModelSet({
        cfg,
        catalog,
        defaultProvider: DEFAULT_PROVIDER,
      });
      const filteredCatalog = allowedCatalog.length > 0 ? allowedCatalog : catalog;
      const normalizedProvider = normalizeProviderId(provider);
      const hiddenKeys = new Set(["openrouter/auto"]);
      return filteredCatalog
        .filter((entry) => normalizeProviderId(entry.provider) === normalizedProvider)
        .filter((entry) => !hiddenKeys.has(modelKey(entry.provider, entry.id)))
        .map((entry) => ({
          ...entry,
          aliases: aliasIndex.byKey.get(modelKey(entry.provider, entry.id)) ?? [],
        }));
    } catch (error) {
      console.warn("[Onboard] Failed to load model catalog:", error);
      return [];
    }
  });

  // Complete onboarding (save credentials and initialize)
  ipcMain.handle(
    "onboard-complete",
    async (
      _event,
      authResult: AuthResult,
      options?: { model?: string; openControlUi?: boolean },
    ) => {
      try {
      const resolveAuthProvider = (result: AuthResult) => {
        if (result.provider === "openai" && result.method === "oauth") {
          return "openai-codex";
        }
        if (result.provider === "google" && result.method === "oauth") {
          return "google-antigravity";
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
          projectId: credential.projectId,
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
        if (provider === "openrouter") {
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
        if (options?.openControlUi !== false) {
          openControlUiInMainWindow();
        }
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

  ipcMain.handle("onboard-whatsapp-status", async () => {
    const cfg = loadConfig();
    const accountId = resolveDefaultWhatsAppAccountId(cfg);
    const { authDir } = resolveWhatsAppAuthDir({ cfg, accountId });
    const linked = await webAuthExists(authDir);
    return {
      linked,
      accountId,
      dmPolicy: cfg.channels?.whatsapp?.dmPolicy ?? "pairing",
      allowFrom: cfg.channels?.whatsapp?.allowFrom ?? [],
      selfChatMode: cfg.channels?.whatsapp?.selfChatMode ?? false,
    };
  });

  ipcMain.handle("onboard-whatsapp-start", async (_event, options?: { force?: boolean }) => {
    return await startWebLoginWithQr({ force: options?.force });
  });

  ipcMain.handle("onboard-whatsapp-wait", async (_event, options?: { timeoutMs?: number }) => {
    return await waitForWebLogin({ timeoutMs: options?.timeoutMs });
  });

  ipcMain.handle(
    "onboard-whatsapp-config",
    async (_event, payload: WhatsAppConfigRequest) => {
      try {
        const cfg = readOpenClawConfigFile();
        const existingAllowFrom = cfg.channels?.whatsapp?.allowFrom ?? [];
        let next = cfg;

        if (payload.mode === "personal") {
          const normalized = normalizeE164(payload.personalNumber);
          const merged = [
            ...existingAllowFrom
              .filter((item) => item !== "*")
              .map((item) => normalizeE164(String(item)))
              .filter(Boolean),
            normalized,
          ];
          const unique = [...new Set(merged.filter(Boolean))];
          next = mergeWhatsAppConfig(next, { selfChatMode: true });
          next = mergeWhatsAppConfig(next, { dmPolicy: "allowlist" });
          next = mergeWhatsAppConfig(next, { allowFrom: unique });
        } else {
          next = mergeWhatsAppConfig(next, { selfChatMode: false });
          next = mergeWhatsAppConfig(next, { dmPolicy: payload.dmPolicy as DmPolicy });
          if (payload.dmPolicy === "open") {
            next = mergeWhatsAppConfig(next, { allowFrom: ["*"] });
          }
          if (payload.dmPolicy !== "disabled") {
            if (payload.allowFromMode === "unset") {
              next = mergeWhatsAppConfig(next, { allowFrom: undefined }, { unsetOnUndefined: ["allowFrom"] });
            } else if (payload.allowFromMode === "list") {
              const allowFrom = parseAllowFromList(payload.allowFromList ?? "");
              if (allowFrom.length === 0) {
                return { success: false, error: "AllowFrom list cannot be empty." };
              }
              next = mergeWhatsAppConfig(next, { allowFrom });
            }
          }
        }

        writeOpenClawConfigFile(next);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle("onboard-open-control-ui", () => {
    try {
      openControlUiInMainWindow();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

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

  ipcMain.handle("devpanel-toggle-window", () => {
    const open = toggleDevPanelWindow();
    return { success: true, open };
  });
}

// App lifecycle
app.whenReady().then(async () => {
  powerSaveBlocker.start("prevent-app-suspension");
  // Load .env file at startup (must be after app is ready to get correct paths)
  const loadDotEnv = () => {
    const envPaths = [
      // Development: dist/main-dev.js -> ../.env = apps/electron/.env
      // Production: dist/main/index.js -> ../../.env = apps/electron/.env
      process.env.NODE_ENV === "development"
        ? resolve(__dirname, "../.env")
        : resolve(__dirname, "../../.env"),
    ];

    for (const envPath of envPaths) {
      try {
        if (existsSync(envPath)) {
          const envContent = readFileSync(envPath, "utf-8");
          for (const line of envContent.split("\n")) {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith("#")) {
              const [key, ...valueParts] = trimmedLine.split("=");
              const value = valueParts.join("=").trim();
              if (key && value) {
                process.env[key] = value;
              }
            }
          }
          console.log(`[Env] Loaded environment variables from ${envPath}:`, Object.keys(process.env).filter(k => k.startsWith("BUSTLY_")));
          break;
        }
      } catch (error) {
        console.error(`[Env] Failed to load ${envPath}:`, error);
      }
    }
  };
  loadDotEnv();

  setupIpcHandlers();

  console.log("=== OpenClaw Desktop starting ===");
  writeMainLog("OpenClaw Desktop starting");
  logStartupPaths();
  writeMainLog(`mainLogPath=${ensureMainLogPath()}`);
  writeMainLog(`resourcesPath=${process.resourcesPath}`);
  writeMainLog(`appVersion=${app.getVersion()} electron=${process.versions.electron}`);

  const isDev = process.env.NODE_ENV === "development";
  const configPath = getConfigPath();
  console.log(`[Init] configPath=${configPath ?? "unresolved"}`);
  writeMainLog(`configPath=${configPath ?? "unresolved"}`);
  // Check if we need to initialize or re-initialize (fix broken config)
  const fullyInitialized = isFullyInitialized();
  console.log(`[Init] fullyInitialized=${fullyInitialized}`);
  writeMainLog(`fullyInitialized=${fullyInitialized}`);
  let needsInit = !fullyInitialized;
  if (!needsInit) {
    const checkConfig = loadGatewayConfig();
    if (checkConfig && !checkConfig.token) {
      console.log("[Init] Existing configuration is missing token, forcing re-initialization...");
      needsInit = true;
    }
  }
  needsOnboardAtLaunch = needsInit;

  ensureWindow();

  const shortcutRegistered = globalShortcut.register(DEV_PANEL_SHORTCUT, () => {
    const open = toggleDevPanelWindow();
    writeMainLog(`DevPanel window ${open ? "opened" : "closed"} via shortcut`);
  });
  if (!shortcutRegistered) {
    writeMainLog(`DevPanel shortcut registration failed: ${DEV_PANEL_SHORTCUT}`);
  }
  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });

  if (needsInit) {
    console.log("[Init] Skipping auto-initialization; waiting for onboarding.");
    writeMainLog("Skipping auto-initialization; waiting for onboarding.");
  } else {
    console.log("[Init] Configuration already exists and is valid");
    writeMainLog("Configuration already exists and is valid");
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

  if (!needsInit) {
    // Auto-start gateway
    console.log("[Gateway] Auto-starting gateway...");
    writeMainLog("Gateway auto-starting");
    try {
      await startGateway();
      console.log("[Gateway] ✓ Gateway started successfully");
      writeMainLog("Gateway started successfully");
      openControlUiInMainWindow();
    } catch (error) {
      console.error("[Gateway] ✗ Failed to start gateway:", error);
      writeMainLog(`Gateway failed to start: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    ensureWindow();
  }
});

app.on("before-quit", async () => {
  console.log("[Lifecycle] App about to quit");
  writeMainLog("App about to quit");

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

  // Stop OAuth callback server
  console.log("[Bustly] Stopping OAuth callback server...");
  stopOAuthCallbackServer();
});

process.on("uncaughtException", (error) => {
  console.error("[Main] uncaughtException:", error);
  writeMainLog(`uncaughtException: ${error?.stack ?? String(error)}`);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Main] unhandledRejection:", reason);
  writeMainLog(`unhandledRejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
});
