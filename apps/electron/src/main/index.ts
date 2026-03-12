import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  shell,
  globalShortcut,
  powerSaveBlocker,
  dialog,
  type OpenDialogOptions,
} from "electron";
import { randomUUID } from "node:crypto";
import { resolve, dirname, basename, join } from "node:path";
import { spawn, spawnSync, ChildProcess } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  appendFileSync,
  cpSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Socket, createServer } from "node:net";
import updater from "electron-updater";
import {
  initializeOpenClaw,
  getConfigPath,
  isFullyInitialized,
  type InitializationResult,
} from "./auto-init.js";
import {
  ensureBundledOpenClawShim,
  resolveCliInvocation,
  resolveOpenClawCliPath,
} from "./cli-utils.js";
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
  cancelOAuthFlow,
  type AuthResult,
  type ProviderId,
} from "./oauth-handler.js";
import * as BustlyOAuth from "./bustly-oauth.js";
import { resolveOpenClawAgentDir } from "../../../../src/agents/agent-paths";
import { ensureAgentWorkspace } from "../../../../src/agents/workspace";
import { loadModelCatalog } from "../../../../src/agents/model-catalog";
import { upsertAuthProfile } from "../../../../src/agents/auth-profiles";
import { DEFAULT_PROVIDER } from "../../../../src/agents/defaults";
import {
  buildModelAliasIndex,
  modelKey,
  normalizeProviderId,
} from "../../../../src/agents/model-selection";
import { loadConfig } from "../../../../src/config/config";
import { updateSessionStore } from "../../../../src/config/sessions";
import { resolveDefaultSessionStorePath } from "../../../../src/config/sessions/paths";
import { applyAgentConfig, listAgentEntries } from "../../../../src/commands/agents.config";
import { resolveGatewayLaunchAgentLabel } from "../../../../src/daemon/constants";
import { GatewayClient } from "../../../../src/gateway/client";
import type { SessionsPatchResult } from "../../../../src/gateway/protocol";
import { applySessionsPatchToStore } from "../../../../src/gateway/sessions-patch";
import { mergeWhatsAppConfig } from "../../../../src/config/merge-config";
import type { DmPolicy, OpenClawConfig } from "../../../../src/config/types";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../../../../src/utils/message-channel";
import {
  applyAuthProfileConfig,
  applyOpenrouterProviderConfig,
  setOpenrouterApiKey,
  writeOAuthCredentials,
} from "../../../../src/commands/onboard-auth";
import { applyPrimaryModel } from "../../../../src/commands/model-picker";
import { enablePluginInConfig } from "../../../../src/plugins/enable";
import { normalizeE164 } from "../../../../src/utils";
import {
  resolveDefaultWhatsAppAccountId,
  resolveWhatsAppAuthDir,
} from "../../../../src/web/accounts";
import { startWebLoginWithQr, waitForWebLogin } from "../../../../src/web/login-qr";
import { webAuthExists } from "../../../../src/web/session";
import { buildAgentMainSessionKey } from "../../../../src/routing/session-key";
import {
  ELECTRON_DEFAULT_MODEL,
  ELECTRON_OPENCLAW_PROFILE,
  getElectronOpenrouterApiKey,
} from "./defaults.js";
import {
  buildBustlyAgentPresetChannelSessionKey,
  buildBustlyWorkspaceAgentId,
} from "../shared/bustly-agent.js";
import { BUSTLY_PRESET_CHANNELS } from "../shared/bustly-preset-channels.js";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const idx = line.indexOf("=");
    if (idx <= 0) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key || !value) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function loadMainProcessEnvFromDotEnv(): void {
  const envPathCandidates = [
    resolve(__dirname, "../../.env"),
    resolve(__dirname, "../.env"),
    resolve(process.cwd(), ".env"),
  ];
  for (const envPath of envPathCandidates) {
    if (!existsSync(envPath)) {
      continue;
    }
    try {
      const parsed = parseDotEnv(readFileSync(envPath, "utf-8"));
      for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key]?.trim()) {
          process.env[key] = value;
        }
      }
      break;
    } catch (error) {
      console.error(`[Env] Failed to load ${envPath}:`, error);
    }
  }
}

loadMainProcessEnvFromDotEnv();

const autoUpdater = updater.autoUpdater;
const APP_PROTOCOL = "bustly";
const DEEP_LINK_CHANNEL = "deep-link";

let gatewayProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let devPanelWindow: BrowserWindow | null = null;
let needsOnboardAtLaunch = false;
let gatewayPort: number = 17999;
let gatewayBind: string = "loopback";
let gatewayToken: string | null = null;

function emitGatewayLifecycle(phase: "starting" | "stopping" | "ready" | "error", message?: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("gateway-lifecycle", {
    phase,
    message: message ?? null,
  });
}

const IMAGE_PREVIEW_EXT_RE = /\.(avif|bmp|gif|heic|jpeg|jpg|png|svg|tiff|webp)$/i;

function parseClipboardFilePathsFromText(value: string): string[] {
  return value
    .replace(/\0/g, "\n")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.startsWith("#"))
    .flatMap((entry) => {
      if (!entry.startsWith("file://")) {
        return [];
      }
      try {
        const url = new URL(entry);
        if (url.protocol !== "file:") {
          return [];
        }
        return [decodeURIComponent(url.pathname)];
      } catch {
        return [];
      }
    });
}

function readNativeClipboardFilePaths(): string[] {
  const formats = clipboard.availableFormats("clipboard");
  const candidates = ["public.file-url", "NSURLPboardType", "text/uri-list"].filter((format) =>
    formats.includes(format),
  );
  const paths = new Set<string>();

  for (const format of candidates) {
    try {
      const raw = clipboard.readBuffer(format, "clipboard");
      for (const path of parseClipboardFilePathsFromText(raw.toString("utf8"))) {
        paths.add(path);
      }
    } catch {
      // Ignore unsupported clipboard formats.
    }
  }

  try {
    for (const path of parseClipboardFilePathsFromText(clipboard.readText("clipboard"))) {
      paths.add(path);
    }
  } catch {
    // Ignore plain-text clipboard failures.
  }

  return [...paths];
}

function basenameFromResolvedPath(pathValue: string): string {
  return basename(pathValue.replace(/[\\/]+$/, "")) || pathValue;
}

function resolvePastedPath(params: {
  directPath?: string;
  entryPath?: string;
  entryName?: string;
  fallbackKind: "file" | "directory";
}): { path: string; kind: "file" | "directory" | null } {
  const directPath = typeof params.directPath === "string" ? params.directPath.trim() : "";
  if (directPath) {
    try {
      return {
        path: directPath,
        kind: statSync(directPath).isDirectory() ? "directory" : "file",
      };
    } catch {
      return { path: directPath, kind: params.fallbackKind };
    }
  }

  const clipboardPaths = readNativeClipboardFilePaths();
  const entryPath = typeof params.entryPath === "string" ? params.entryPath.trim() : "";
  const entryName = typeof params.entryName === "string" ? params.entryName.trim() : "";

  let resolvedPath = "";
  if (clipboardPaths.length === 1) {
    resolvedPath = clipboardPaths[0];
  } else if (entryName) {
    resolvedPath =
      clipboardPaths.find((candidate) => basenameFromResolvedPath(candidate) === entryName) ?? "";
  }
  if (!resolvedPath) {
    resolvedPath = entryPath;
  }
  if (!resolvedPath) {
    return { path: "", kind: null };
  }

  try {
    return {
      path: resolvedPath,
      kind: statSync(resolvedPath).isDirectory() ? "directory" : "file",
    };
  } catch {
    return { path: resolvedPath, kind: params.fallbackKind };
  }
}

function resolveImagePreviewMimeType(filePath: string): string | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) {return "image/png";}
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {return "image/jpeg";}
  if (lower.endsWith(".gif")) {return "image/gif";}
  if (lower.endsWith(".webp")) {return "image/webp";}
  if (lower.endsWith(".bmp")) {return "image/bmp";}
  if (lower.endsWith(".svg")) {return "image/svg+xml";}
  if (lower.endsWith(".avif")) {return "image/avif";}
  if (lower.endsWith(".heic")) {return "image/heic";}
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) {return "image/tiff";}
  return null;
}
let updateReady = false;
let updateVersion: string | null = null;
let updateInstalling = false;
let pendingDeepLink: { url: string; route: string | null } | null = null;

const EXTERNAL_NAV_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function shouldOpenExternal(url: string): boolean {
  if (!url) {
    return false;
  }
  if (url.startsWith("about:") || url.startsWith("file:")) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  return !EXTERNAL_NAV_HOSTS.has(parsed.hostname.toLowerCase());
}

function normalizeDeepLinkRoute(route: string | null | undefined): string | null {
  if (!route) {
    return null;
  }
  const normalized = route.replace(/^#\/?/, "").replace(/^\/+/, "").trim();
  if (!normalized) {
    return null;
  }
  if (normalized === "home") {
    return "/";
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function resolveBustlyWebBaseUrl(): string {
  const baseUrl = process.env.BUSTLY_WEB_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("Missing BUSTLY_WEB_BASE_URL");
  }
  return baseUrl.replace(/\/+$/, "");
}

function buildBustlyAdminUrl(params: Record<string, string | null | undefined>, path?:string): string {
  const url = new URL(`${resolveBustlyWebBaseUrl()}/admin${path ?? ""}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function parseDeepLink(url: string): { url: string; route: string | null } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${APP_PROTOCOL}:`) {
    return null;
  }

  const routeFromQuery = normalizeDeepLinkRoute(parsed.searchParams.get("route"));
  const routeFromPath = normalizeDeepLinkRoute(parsed.pathname);
  const routeFromHost =
    parsed.hostname && parsed.hostname !== "open" ? normalizeDeepLinkRoute(parsed.hostname) : null;

  return {
    url,
    route: routeFromQuery ?? routeFromPath ?? routeFromHost ?? null,
  };
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function dispatchDeepLink(url: string): boolean {
  const payload = parseDeepLink(url);
  if (!payload) {
    return false;
  }

  pendingDeepLink = payload;
  writeMainLog(`[DeepLink] received url=${payload.url} route=${payload.route ?? "(none)"}`);

  if (!mainWindow || mainWindow.isDestroyed()) {
    ensureWindow();
    return true;
  }

  focusMainWindow();
  if (payload.route) {
    loadRendererWindow(mainWindow, { hash: payload.route });
  }
  mainWindow.webContents.send(DEEP_LINK_CHANNEL, payload);
  pendingDeepLink = null;
  return true;
}

function flushPendingDeepLink() {
  if (!pendingDeepLink || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const payload = pendingDeepLink;
  focusMainWindow();
  if (payload.route) {
    loadRendererWindow(mainWindow, { hash: payload.route });
  }
  mainWindow.webContents.send(DEEP_LINK_CHANNEL, payload);
  pendingDeepLink = null;
}

function registerProtocolClient() {
  try {
    let success = false;
    if (process.defaultApp && process.argv.length >= 2) {
      success = app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [resolve(process.argv[1])]);
    } else {
      success = app.setAsDefaultProtocolClient(APP_PROTOCOL);
    }
    writeMainLog(`[DeepLink] protocol registration ${success ? "ok" : "failed"} scheme=${APP_PROTOCOL}`);
  } catch (error) {
    writeMainLog(
      `[DeepLink] protocol registration error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
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
const DEV_PANEL_HASH = "/devpanel";
const BUSTLY_LOGIN_HASH = "/bustly-login";
const PROVIDER_SETUP_HASH = "/provider-setup";
const DEV_PANEL_SHORTCUT = "CommandOrControl+Shift+Alt+D";
const DASHBOARD_CHANNEL_PLUGIN_IDS = ["whatsapp"] as const;
const BUSTLY_PROVIDER_ID = "bustly";
const BUSTLY_PROVIDER_PROFILE_ID = `${BUSTLY_PROVIDER_ID}:default`;
const BUSTLY_MODEL_GATEWAY_BASE_URL_DEFAULT = "https://gw.bustly.ai/api/v1";
const BUSTLY_MODEL_GATEWAY_BASE_URL_ENV = process.env.BUSTLY_MODEL_GATEWAY_BASE_URL?.trim() ?? "";
const BUSTLY_MODEL_GATEWAY_BASE_URL =
  BUSTLY_MODEL_GATEWAY_BASE_URL_ENV || BUSTLY_MODEL_GATEWAY_BASE_URL_DEFAULT;
const BUSTLY_MODEL_GATEWAY_USER_AGENT =
  process.env.BUSTLY_MODEL_GATEWAY_USER_AGENT?.trim() || "openclaw/2026.2.24";
const BUSTLY_ROUTE_MODELS = [
  {
    routeKey: "chat.lite",
    modelRef: "bustly/chat.lite",
    alias: "Lite",
    description: "Fast & efficient for daily tasks.",
    reasoning: false,
  },
  {
    routeKey: "chat.pro",
    modelRef: "bustly/chat.pro",
    alias: "Pro",
    description: "Balanced performance for complex reasoning.",
    reasoning: true,
  },
  {
    routeKey: "chat.max",
    modelRef: "bustly/chat.max",
    alias: "Max",
    description: "Frontier intelligence for critical challenges.",
    reasoning: true,
  },
] as const;
const BUSTLY_MODEL_REF_SET = new Set<string>(BUSTLY_ROUTE_MODELS.map((entry) => entry.modelRef));
const BUSTLY_ROUTE_KEY_SET = new Set<string>(BUSTLY_ROUTE_MODELS.map((entry) => entry.routeKey));
const PRELOAD_PATH = process.env.NODE_ENV === "development"
  ? resolve(__dirname, "main/preload.js")
  : resolve(__dirname, "preload.js");
const UPDATE_STATUS_CHANNEL = "update-status";
const WINDOW_NATIVE_FULLSCREEN_CHANNEL = "window-native-fullscreen";

function sendNativeFullscreenState(isNativeFullscreen: boolean) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(WINDOW_NATIVE_FULLSCREEN_CHANNEL, { isNativeFullscreen });
}

function resolveBustlyWorkspaceIdFromOAuthState(): string {
  const oauthState = BustlyOAuth.readBustlyOAuthState();
  return oauthState?.user?.workspaceId?.trim() || "";
}

function normalizeBustlyModelRef(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (BUSTLY_MODEL_REF_SET.has(raw)) {
    return raw;
  }
  if (raw.startsWith(`${BUSTLY_PROVIDER_ID}/`)) {
    const routeKey = raw.slice(`${BUSTLY_PROVIDER_ID}/`.length);
    if (BUSTLY_ROUTE_KEY_SET.has(routeKey)) {
      return `${BUSTLY_PROVIDER_ID}/${routeKey}`;
    }
  }
  if (BUSTLY_ROUTE_KEY_SET.has(raw)) {
    return `${BUSTLY_PROVIDER_ID}/${raw}`;
  }
  if (raw === "lite" || raw === "auto") {
    return "bustly/chat.lite";
  }
  if (raw === "pro") {
    return "bustly/chat.pro";
  }
  if (raw === "max") {
    return "bustly/chat.max";
  }
  return "bustly/chat.lite";
}

function buildBustlyProviderHeaders(workspaceId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": BUSTLY_MODEL_GATEWAY_USER_AGENT,
  };
  if (workspaceId?.trim()) {
    headers["X-Workspace-Id"] = workspaceId.trim();
  }
  return headers;
}

function buildBustlyProviderModels(headers: Record<string, string>) {
  return BUSTLY_ROUTE_MODELS.map((entry) => ({
    id: entry.routeKey,
    name: entry.alias,
    reasoning: entry.reasoning,
    input: ["text", "image"] as Array<"text" | "image">,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 200_000,
    maxTokens: 8_192,
    headers: { ...headers },
  }));
}

function resolveBustlyGatewayBaseUrl(cfg: OpenClawConfig): string {
  if (BUSTLY_MODEL_GATEWAY_BASE_URL_ENV) {
    return BUSTLY_MODEL_GATEWAY_BASE_URL_ENV;
  }
  const configured = cfg.models?.providers?.[BUSTLY_PROVIDER_ID]?.baseUrl?.trim();
  if (configured) {
    return configured;
  }
  return BUSTLY_MODEL_GATEWAY_BASE_URL;
}

function applyBustlyOnlyConfig(cfg: OpenClawConfig, selectedModelInput?: string): OpenClawConfig {
  const selectedModel = normalizeBustlyModelRef(selectedModelInput);
  const workspaceId = resolveBustlyWorkspaceIdFromOAuthState();
  const bustlyHeaders = buildBustlyProviderHeaders(workspaceId);
  const nextAgentModels: Record<string, { alias?: string }> = {};
  for (const entry of BUSTLY_ROUTE_MODELS) {
    nextAgentModels[entry.modelRef] = { alias: entry.alias };
  }
  const existingDefaults = cfg.agents?.defaults ?? {};
  const existingModelConfig = existingDefaults.model;
  const preservedFallbacks =
    typeof existingModelConfig === "object" &&
    existingModelConfig !== null &&
    Array.isArray((existingModelConfig as { fallbacks?: unknown }).fallbacks)
      ? (existingModelConfig as { fallbacks?: string[] }).fallbacks
      : undefined;

  return {
    ...cfg,
    auth: {
      ...cfg.auth,
      profiles: {
        [BUSTLY_PROVIDER_PROFILE_ID]: {
          provider: BUSTLY_PROVIDER_ID,
          mode: "token",
        },
      },
      order: {
        [BUSTLY_PROVIDER_ID]: [BUSTLY_PROVIDER_PROFILE_ID],
      },
    },
    agents: {
      ...cfg.agents,
      defaults: {
        ...existingDefaults,
        model: {
          ...(preservedFallbacks ? { fallbacks: preservedFallbacks } : {}),
          primary: selectedModel,
        },
        models: nextAgentModels,
      },
    },
    models: {
      ...cfg.models,
      providers: {
        [BUSTLY_PROVIDER_ID]: {
          baseUrl: resolveBustlyGatewayBaseUrl(cfg),
          auth: "token",
          api: "openai-completions",
          headers: bustlyHeaders,
          models: buildBustlyProviderModels(bustlyHeaders),
        },
      },
    },
  };
}

function syncBustlyConfigFile(configPath: string, selectedModelInput?: string): void {
  if (!existsSync(configPath)) {
    return;
  }
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw) as OpenClawConfig;
  const nextConfig = applyBustlyOnlyConfig(config, selectedModelInput);
  writeFileSync(configPath, JSON.stringify(nextConfig, null, 2));
}

function resolveUserPath(input: string, homeDir: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("~")) {
    return resolve(trimmed.replace(/^~(?=$|[\\/])/, homeDir));
  }
  return resolve(trimmed);
}

function resolveElectronStateDir(): string {
  const homeDir = app.getPath("home");
  const override = process.env.OPENCLAW_STATE_DIR?.trim();
  if (override) {
    return resolveUserPath(override, homeDir);
  }
  return resolve(homeDir, ".bustly");
}

function resolveElectronConfigPath(): string {
  const homeDir = app.getPath("home");
  const override = process.env.OPENCLAW_CONFIG_PATH?.trim();
  if (override) {
    return resolveUserPath(override, homeDir);
  }
  return resolve(resolveElectronStateDir(), "openclaw.json");
}

function resolveBustlyWorkspaceAgentWorkspaceDir(workspaceId: string): string {
  const agentId = buildBustlyWorkspaceAgentId(workspaceId);
  const stateDir = resolveElectronStateDir();
  return join(stateDir, "workspaces", agentId);
}

function resolveBustlyWorkspaceAgentSessionKey(workspaceId: string): string {
  return buildAgentMainSessionKey({ agentId: buildBustlyWorkspaceAgentId(workspaceId) });
}

async function ensureBustlyPresetChannels(params: { agentId: string }): Promise<void> {
  const legacyPresetIcons = new Set(["ChartBar", "TrendUp", "ChatCircleText"]);
  const presets = BUSTLY_PRESET_CHANNELS
    .filter((entry) => entry.enabled !== false)
    .slice()
    .sort((a, b) => a.order - b.order);
  if (presets.length === 0) {
    return;
  }

  const cfg = loadConfig();
  const storePath = resolveDefaultSessionStorePath(params.agentId);

  await updateSessionStore(storePath, async (store) => {
    for (const preset of presets) {
      const storeKey = buildBustlyAgentPresetChannelSessionKey(params.agentId, preset.slug);
      const existing = store[storeKey];
      const nextPatch: {
        key: string;
        label?: string;
        icon?: string;
        model?: string;
      } = { key: storeKey };

      if (!existing?.label?.trim()) {
        nextPatch.label = preset.label;
      }
      if (!existing?.icon?.trim() || legacyPresetIcons.has(existing.icon.trim())) {
        nextPatch.icon = preset.icon;
      }
      if (!existing?.modelOverride?.trim() && preset.model?.trim()) {
        nextPatch.model = preset.model.trim();
      }
      if (!("label" in nextPatch) && !("icon" in nextPatch) && !("model" in nextPatch)) {
        continue;
      }

      const applied = await applySessionsPatchToStore({
        cfg,
        store,
        storeKey,
        patch: nextPatch,
      });
      if (!applied.ok) {
        throw new Error(applied.error.message);
      }
    }
    return store;
  });
}

async function ensureBustlyWorkspaceAgentConfig(params: {
  workspaceId: string;
  workspaceName?: string;
}): Promise<{ agentId: string; sessionKey: string; workspaceDir: string }> {
  const workspaceId = params.workspaceId.trim();
  if (!workspaceId) {
    throw new Error("Bustly workspaceId is required.");
  }
  const configPath = resolveElectronConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(`OpenClaw config not found at ${configPath}`);
  }

  const workspaceDir = resolveBustlyWorkspaceAgentWorkspaceDir(workspaceId);
  const agentId = buildBustlyWorkspaceAgentId(workspaceId);
  const sessionKey = resolveBustlyWorkspaceAgentSessionKey(workspaceId);
  const config = JSON.parse(readFileSync(configPath, "utf-8")) as OpenClawConfig;
  const nextName = params.workspaceName?.trim() || workspaceId;
  const updated = applyAgentConfig(config, {
    agentId,
    name: nextName,
    workspace: workspaceDir,
  });
  const currentList = listAgentEntries(updated);
  const nextList = currentList.map((entry) => ({
    ...entry,
    default: entry.id === agentId,
  }));
  const normalizedNextList = nextList.some((entry) => entry.id === agentId)
    ? nextList
    : [...nextList, { id: agentId, name: nextName, workspace: workspaceDir, default: true }];
  const nextConfig: OpenClawConfig = {
    ...updated,
    agents: {
      ...updated.agents,
      defaults: {
        ...updated.agents?.defaults,
        workspace: workspaceDir,
      },
      list: normalizedNextList,
    },
  };

  if (JSON.stringify(nextConfig) !== JSON.stringify(config)) {
    writeFileSync(configPath, JSON.stringify(nextConfig, null, 2));
  }

  await ensureAgentWorkspace({
    dir: workspaceDir,
    ensureBootstrapFiles: true,
  });

  await ensureBustlyPresetChannels({ agentId });

  return { agentId, sessionKey, workspaceDir };
}

async function syncBustlyWorkspaceAgent(params: {
  workspaceId?: string;
  workspaceName?: string;
  forceInit?: boolean;
}): Promise<{ agentId: string; sessionKey: string; workspaceDir: string } | null> {
  const workspaceId = params.workspaceId?.trim() || resolveBustlyWorkspaceIdFromOAuthState();
  if (!workspaceId) {
    return null;
  }
  const configPath = resolveElectronConfigPath();
  const workspaceDir = resolveBustlyWorkspaceAgentWorkspaceDir(workspaceId);
  if (params.forceInit === true || !existsSync(configPath)) {
    const result = await initializeOpenClaw({
      force: params.forceInit === true,
      workspace: workspaceDir,
    });
    if (!result.success) {
      throw new Error(result.error ?? "Failed to initialize OpenClaw");
    }
    initResult = result;
    gatewayPort = result.gatewayPort;
    gatewayBind = result.gatewayBind;
    gatewayToken = result.gatewayToken ?? null;
    needsOnboardAtLaunch = false;
  }
  return await ensureBustlyWorkspaceAgentConfig({
    workspaceId,
    workspaceName: params.workspaceName,
  });
}

async function synchronizeBustlyWorkspaceContext(params?: {
  workspaceId?: string;
  workspaceName?: string;
  selectedModelInput?: string;
  forceInit?: boolean;
}): Promise<{ agentId: string; sessionKey: string; workspaceDir: string } | null> {
  const agentBinding = await syncBustlyWorkspaceAgent({
    workspaceId: params?.workspaceId,
    workspaceName: params?.workspaceName,
    forceInit: params?.forceInit,
  });
  syncBustlyConfigFile(resolveElectronConfigPath(), params?.selectedModelInput?.trim());
  return agentBinding;
}

function prependPathEntry(pathValue: string, entry: string): string {
  const delimiter = process.platform === "win32" ? ";" : ":";
  const parts = pathValue
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.includes(entry)) {
    parts.unshift(entry);
  }
  return parts.join(delimiter);
}

function getPathDelimiter(): string {
  return process.platform === "win32" ? ";" : ":";
}

function ensureMainLogPath(): string {
  if (mainLogPath) {
    return mainLogPath;
  }
  const logDir = resolve(resolveElectronStateDir(), "electron", "logs");
  mkdirSync(logDir, { recursive: true, mode: 0o700 });
  mainLogPath = resolve(logDir, "main.log");
  return mainLogPath;
}

function writeMainLog(message: string) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  const writeLine = () => {
    const logPath = ensureMainLogPath();
    mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 });
    appendFileSync(logPath, line, "utf-8");
  };

  try {
    writeLine();
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      try {
        mainLogPath = null;
        writeLine();
      } catch (retryError) {
        console.error("[Main log] Failed to write:", retryError);
      }
    } else {
      console.error("[Main log] Failed to write:", error);
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("main-log", { message });
  }
}

function stopGatewayLaunchAgentForElectron(): void {
  const cliPath = resolveOpenClawCliPath({
    info: () => {},
    error: () => {},
  });

  if (cliPath) {
    const invocation = resolveCliInvocation(cliPath, ["gateway", "stop"], {
      includeBundledNode: true,
    });
    if (invocation) {
      try {
        const cliEnv = buildElectronCliEnv({ cliPath });
        const result = spawnSync(invocation.command, invocation.args, {
          encoding: "utf-8",
          env: cliEnv,
        });
        const detail = (result.stderr || result.stdout || "").trim();
        if (result.status === 0) {
          writeMainLog("[Gateway Service] Stopped supervised gateway via `openclaw gateway stop`");
          return;
        }
        writeMainLog(
          `[Gateway Service] \`openclaw gateway stop\` failed: ${detail || `exit ${result.status ?? "unknown"}`}`,
        );
      } catch (error) {
        writeMainLog(
          `[Gateway Service] \`openclaw gateway stop\` error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (process.platform !== "darwin" || typeof process.getuid !== "function") {
    return;
  }
  const label = resolveGatewayLaunchAgentLabel(ELECTRON_OPENCLAW_PROFILE);
  const domain = `gui/${process.getuid()}`;
  const target = `${domain}/${label}`;
  try {
    const result = spawnSync("launchctl", ["bootout", target], { encoding: "utf-8" });
    const detail = (result.stderr || result.stdout || "").trim();
    if (result.status === 0) {
      writeMainLog(`[LaunchAgent] Stopped ${target} before Electron gateway startup`);
      return;
    }
    const lowered = detail.toLowerCase();
    if (
      lowered.includes("no such process") ||
      lowered.includes("service is not loaded") ||
      lowered.includes("could not find service")
    ) {
      writeMainLog(`[LaunchAgent] ${target} not loaded`);
      return;
    }
    writeMainLog(`[LaunchAgent] bootout ${target} failed: ${detail || `exit ${result.status ?? "unknown"}`}`);
  } catch (error) {
    writeMainLog(
      `[LaunchAgent] bootout ${target} error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function loadLoginShellEnvironment(shellPath: string, homeDir: string): Record<string, string> {
  try {
    const result = spawnSync(shellPath, ["-lc", "env -0"], {
      encoding: "buffer",
      env: {
        ...process.env,
        HOME: homeDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0 || !result.stdout) {
      return {};
    }

    const out = result.stdout.toString("utf8");
    const env: Record<string, string> = {};
    for (const entry of out.split("\0")) {
      if (!entry) {
        continue;
      }
      const eq = entry.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const key = entry.slice(0, eq);
      const value = entry.slice(eq + 1);
      if (!key) {
        continue;
      }
      env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

function loadElectronEnvVars(): Record<string, string> {
  const envVars: Record<string, string> = {};
  const envPaths = [
    process.env.NODE_ENV === "development"
      ? resolve(__dirname, "../.env")
      : resolve(__dirname, "../../.env"),
    resolve(app.getAppPath(), ".env"),
  ];

  for (const envPath of envPaths) {
    try {
      if (!existsSync(envPath)) {
        continue;
      }
      const envContent = readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith("#")) {
          continue;
        }
        const [key, ...valueParts] = trimmedLine.split("=");
        const value = valueParts.join("=").trim();
        if (key && value) {
          envVars[key] = value;
        }
      }
      console.log(`[Env] Loaded environment variables from ${envPath}:`, Object.keys(envVars));
      break;
    } catch (error) {
      console.error(`[Env] Failed to load ${envPath}:`, error);
    }
  }

  return envVars;
}

function buildElectronCliEnv(params?: {
  cliPath?: string;
  oauthCallbackPort?: number;
}): NodeJS.ProcessEnv {
  const homeDir = app.getPath("home");
  const stateDir = resolveElectronStateDir();
  const shellPath = process.env.SHELL?.trim() || "/bin/zsh";
  const loginShellEnv = loadLoginShellEnvironment(shellPath, homeDir);
  const fixedPath =
    loginShellEnv.PATH?.trim() ||
    process.env.PATH?.trim() ||
    "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  const bundledCliShim = params?.cliPath
    ? ensureBundledOpenClawShim(params.cliPath, stateDir, { includeBundledNode: true })
    : null;
  const effectivePath = bundledCliShim ? prependPathEntry(fixedPath, bundledCliShim.shimDir) : fixedPath;
  const bunInstall = process.env.BUN_INSTALL?.trim() || resolve(homeDir, ".bun");
  const homebrewPrefix = process.env.HOMEBREW_PREFIX?.trim() || "/opt/homebrew";
  const appPath = app.getAppPath();
  const resourcesPath = process.resourcesPath || appPath;
  const bundledSkillsDir = resolve(resourcesPath, "skills");
  const bundledPluginsDir = ensureBundledExtensionsDir({
    resourcesPath,
    appPath,
  });
  const appNodeModules = resolve(appPath, "node_modules");
  const resourcesNodeModules = resolve(resourcesPath, "node_modules");
  const openclawNodeModules = resolve(resourcesPath, "openclaw", "node_modules");
  const inheritedNodePath = process.env.NODE_PATH?.trim();
  const effectiveNodePath =
    [
      openclawNodeModules,
      appNodeModules,
      resourcesNodeModules,
      inheritedNodePath,
    ]
      .filter((value) => Boolean(value && value.length > 0))
      .join(":") || openclawNodeModules;
  const bundledVersion = resolveBundledOpenClawVersion();

  return {
    ...process.env,
    ...loadElectronEnvVars(),
    ...loginShellEnv,
    NODE_ENV: "production",
    OPENCLAW_PROFILE: ELECTRON_OPENCLAW_PROFILE,
    OPENCLAW_BUNDLED_PLUGINS_DIR: bundledPluginsDir,
    ...(existsSync(bundledSkillsDir) ? { OPENCLAW_BUNDLED_SKILLS_DIR: bundledSkillsDir } : {}),
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: resolveElectronConfigPath(),
    HOME: homeDir,
    USERPROFILE: homeDir,
    OPENCLAW_LOAD_SHELL_ENV: "1",
    SHELL: shellPath,
    PATH: effectivePath,
    BUN_INSTALL: bunInstall,
    HOMEBREW_PREFIX: homebrewPrefix,
    TERM: process.env.TERM?.trim() || "xterm-256color",
    COLORTERM: process.env.COLORTERM?.trim() || "truecolor",
    TERM_PROGRAM: process.env.TERM_PROGRAM?.trim() || "OpenClaw",
    NODE_PATH: effectiveNodePath,
    ...(bundledCliShim ? { OPENCLAW_EXEC_PATH_PREPEND: bundledCliShim.shimDir } : {}),
    ...(typeof params?.oauthCallbackPort === "number"
      ? { OPENCLAW_OAUTH_CALLBACK_PORT: String(params.oauthCallbackPort) }
      : {}),
    ...(bundledVersion ? { OPENCLAW_BUNDLED_VERSION: bundledVersion } : {}),
  };
}

function sendUpdateStatus(event: string, payload?: Record<string, unknown>) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(UPDATE_STATUS_CHANNEL, { event, ...payload });
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
    const configPath = resolveElectronConfigPath();
    if (!existsSync(configPath)) {
      return null;
    }

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const port = config.gateway?.port ?? 17999;
    const bind = config.gateway?.bind ?? "loopback";
    const token = config.gateway?.auth?.token;

    console.log(`Loaded gateway config: port=${port}, bind=${bind}, auth=${token ? "token" : "none"}`);
    return { port, bind, token };
  } catch (error) {
    console.error("Failed to load gateway config:", error);
    return null;
  }
}

function resolveGatewayProbeHost(bind: string): string {
  return bind === "loopback" ? "127.0.0.1" : "0.0.0.0";
}

async function isGatewayPortAvailable(port: number, bind: string): Promise<boolean> {
  const host = resolveGatewayProbeHost(bind);
  return await new Promise<boolean>((resolve) => {
    const server = createServer();
    let settled = false;
    const finish = (available: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        server.close(() => resolve(available));
      } catch {
        resolve(available);
      }
    };
    server.once("error", (error) => {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EADDRINUSE" || code === "EACCES") {
        finish(false);
        return;
      }
      writeMainLog(
        `Gateway port probe failed for ${host}:${port}: ${error instanceof Error ? error.message : String(error)}`,
      );
      finish(false);
    });
    server.once("listening", () => finish(true));
    server.listen(port, host);
  });
}

type ListeningProcessInfo = {
  pid: number;
  command: string;
  descriptors: string[];
};

function inspectListeningProcess(port: number): ListeningProcessInfo | null {
  const lsof = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpct"], {
    encoding: "utf-8",
  });
  if (lsof.status !== 0 || !lsof.stdout) {
    return null;
  }

  let pid = 0;
  let command = "";
  for (const line of lsof.stdout.split("\n")) {
    if (line.startsWith("p")) {
      pid = Number.parseInt(line.slice(1), 10) || 0;
    } else if (line.startsWith("c")) {
      command = line.slice(1).trim();
    }
  }
  if (!pid) {
    return null;
  }

  const details = spawnSync("lsof", ["-nP", "-p", String(pid), "-Fn"], {
    encoding: "utf-8",
  });
  const descriptors =
    details.status === 0 && details.stdout
      ? details.stdout
        .split("\n")
        .filter((line) => line.startsWith("n"))
        .map((line) => line.slice(1).trim())
        .filter(Boolean)
      : [];

  return { pid, command, descriptors };
}

function inspectListeningProcessesInRange(startPort: number, endPort: number): Map<number, ListeningProcessInfo> {
  const listeners = new Map<number, ListeningProcessInfo>();
  for (let port = startPort; port <= endPort; port += 1) {
    const info = inspectListeningProcess(port);
    if (info) {
      listeners.set(info.pid, info);
    }
  }
  return listeners;
}

function isManagedBustlyGatewayProcess(info: ListeningProcessInfo | null): boolean {
  if (!info) {
    return false;
  }
  const haystack = [info.command, ...info.descriptors].join("\n").toLowerCase();
  return (
    haystack.includes("openclaw") &&
    (haystack.includes("/.bustly/") || haystack.includes("gateway.") || haystack.includes("gateway.log"))
  );
}

async function terminateManagedProcess(pid: number): Promise<boolean> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return false;
  }

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await delay(150);
    } catch {
      return true;
    }
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return false;
  }

  const killDeadline = Date.now() + 2_000;
  while (Date.now() < killDeadline) {
    try {
      process.kill(pid, 0);
      await delay(100);
    } catch {
      return true;
    }
  }
  return false;
}

async function reclaimManagedGatewayPorts(params: {
  preferredPort: number;
  bind: string;
  maxAttempts: number;
}): Promise<boolean> {
  const rangeEnd = params.preferredPort + params.maxAttempts;
  const listeners = [...inspectListeningProcessesInRange(params.preferredPort, rangeEnd).values()];
  const managedListeners = listeners.filter((listener) => isManagedBustlyGatewayProcess(listener));

  if (managedListeners.length === 0) {
    return false;
  }

  writeMainLog(
    `[Gateway] Reclaiming managed listeners in port range ${params.preferredPort}-${rangeEnd}: ${managedListeners.map((listener) => `${listener.pid}:${listener.command || "unknown"}`).join(", ")}`,
  );

  let reclaimedAny = false;
  for (const listener of managedListeners) {
    const terminated = await terminateManagedProcess(listener.pid);
    if (terminated) {
      reclaimedAny = true;
      writeMainLog(`[Gateway] Reclaimed managed listener pid=${listener.pid} command=${listener.command || "(unknown)"}`);
    } else {
      writeMainLog(`[Gateway] Failed to terminate managed listener pid=${listener.pid} command=${listener.command || "(unknown)"}`);
    }
  }

  if (!reclaimedAny) {
    return false;
  }

  for (let port = params.preferredPort; port <= rangeEnd; port += 1) {
    if (!(await isGatewayPortAvailable(port, params.bind)) && isManagedBustlyGatewayProcess(inspectListeningProcess(port))) {
      writeMainLog(`[Gateway] Managed listener still detected on port ${port} after reclaim attempt`);
      return false;
    }
  }

  writeMainLog(
    `[Gateway] Reclaim completed for port range ${params.preferredPort}-${rangeEnd}`,
  );
  return true;
}

async function resolveGatewayStartupPort(
  preferredPort: number,
  bind: string,
  maxAttempts = 20,
): Promise<{ port: number; switched: boolean }> {
  if (await isGatewayPortAvailable(preferredPort, bind)) {
    return { port: preferredPort, switched: false };
  }
  if (await reclaimManagedGatewayPorts({ preferredPort, bind, maxAttempts })) {
    return { port: preferredPort, switched: false };
  }
  for (let offset = 1; offset <= maxAttempts; offset += 1) {
    const candidate = preferredPort + offset;
    if (await isGatewayPortAvailable(candidate, bind)) {
      return { port: candidate, switched: true };
    }
  }
  throw new Error(
    `Gateway startup aborted: port ${preferredPort} is occupied and no fallback port in ${preferredPort + 1}-${preferredPort + maxAttempts} is available.`,
  );
}

/**
 * Start the OpenClaw Gateway process
 */
async function startGateway(): Promise<boolean> {
  emitGatewayLifecycle("starting", "Starting gateway...");
  const oauthCallbackPort = await startOAuthCallbackServer();
  console.log("[Bustly] OAuth callback server started on port", oauthCallbackPort);

  const startAt = Date.now();
  if (gatewayProcess) {
    console.log("Gateway already running");
    writeMainLog("Gateway already running");
    return true;
  }

  const cliPath = resolveOpenClawCliPath({
    info: (message) => console.log(message),
    error: (message) => console.error(message),
  });
  if (!cliPath) {
    throw new Error("OpenClaw CLI not found");
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

  const preferredGatewayPort = gatewayPort;
  const { port: selectedGatewayPort, switched } = await resolveGatewayStartupPort(
    preferredGatewayPort,
    gatewayBind,
  );
  if (switched) {
    const warning = `Preferred gateway port ${preferredGatewayPort} is occupied; switching to ${selectedGatewayPort}.`;
    console.warn(`[Gateway] ${warning}`);
    writeMainLog(`[Gateway] ${warning}`);
  }
  gatewayPort = selectedGatewayPort;

  return await new Promise((resolvePromise, reject) => {
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
      writeMainLog("Failed to locate node binary in bundled resources.");
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
    const bundledSkillsDir = resolve(resourcesPath, "skills");
    writeMainLog(`Bundled skills dir: ${bundledSkillsDir}`);
    const bundledVersion = resolveBundledOpenClawVersion();
    if (bundledVersion) {
      writeMainLog(`Bundled OpenClaw version: ${bundledVersion}`);
    }
    const homeDir = app.getPath("home");
    const stateDir = resolveElectronStateDir();
    const shellPath = process.env.SHELL?.trim() || "/bin/zsh";
    const loginShellEnv = loadLoginShellEnvironment(shellPath, homeDir);
    const fixedPath =
      loginShellEnv.PATH?.trim() ||
      process.env.PATH?.trim() ||
      "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
    const bundledCliShim = ensureBundledOpenClawShim(cliPath, stateDir, { includeBundledNode: true });
    const effectivePath = bundledCliShim ? prependPathEntry(fixedPath, bundledCliShim.shimDir) : fixedPath;
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

    const spawnEnv = buildElectronCliEnv({ cliPath, oauthCallbackPort });
    if (existsSync(bundledPluginsDir)) {
      spawnEnv.OPENCLAW_BUNDLED_PLUGINS_DIR = bundledPluginsDir;
    }
    writeMainLog(
      `Gateway env: SHELL=${shellPath} OPENCLAW_LOAD_SHELL_ENV=1 NODE_PATH=${effectiveNodePath || "(empty)"} PATH_HEAD=${effectivePath.split(getPathDelimiter())[0] ?? "(empty)"} cliShim=${bundledCliShim?.shimPath ?? "(none)"} appPath=${appPath} resourcesPath=${resourcesPath} candidates=${nodePathStatus || "(none)"} rawOpenClawNodeModules=${openclawNodeModules} rawResourcesNodeModules=${resourcesNodeModules} rawAppNodeModules=${appNodeModules} inheritedNodePath=${inheritedNodePath ?? "(none)"}`,
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

    const startupTimeoutMs = 45_000;
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
        emitGatewayLifecycle("ready", null);
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
        emitGatewayLifecycle(
          "error",
          error instanceof Error ? error.message : String(error),
        );
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
    emitGatewayLifecycle("stopping", "Restarting gateway...");

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

  void waitForGatewayPort(gatewayPort).then((ready) => {
    writeMainLog(`Gateway port ${gatewayPort} ready=${ready}`);
    if (!ready || !mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.loadURL(controlUrl).catch((error) => {
      writeMainLog(`Control UI loadURL failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  });
}

function openBustlyLoginInMainWindow(): void {
  writeMainLog("[Bustly Login] Opening login page in main window");
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  loadRendererWindow(mainWindow, { hash: BUSTLY_LOGIN_HASH });
}

function openProviderSetupInMainWindow(): void {
  writeMainLog("[Provider Setup] Opening provider setup in main window");
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  loadRendererWindow(mainWindow, { hash: PROVIDER_SETUP_HASH });
}

function resolveOpenClawConfigPath(): string {
  return resolveElectronConfigPath();
}

function readGatewayTokenFromConfig(): string | null {
  try {
    const configPath = resolveOpenClawConfigPath();
    if (!existsSync(configPath)) {
      return null;
    }
    const raw = JSON.parse(readFileSync(configPath, "utf-8")) as {
      gateway?: { auth?: { token?: unknown } };
    };
    const token = raw?.gateway?.auth?.token;
    return typeof token === "string" && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

async function withPrivilegedGatewayClient<T>(
  request: (client: GatewayClient) => Promise<T>,
): Promise<T> {
  const token = readGatewayTokenFromConfig() ?? gatewayToken;
  const url = token
    ? `ws://${GATEWAY_HOST}:${gatewayPort}?token=${token}`
    : `ws://${GATEWAY_HOST}:${gatewayPort}`;

  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    let client: GatewayClient | null = null;

    const finish = (error?: unknown, value?: T) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      client?.stop();
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      resolve(value as T);
    };

    const timer = setTimeout(() => {
      finish(new Error("gateway connect timeout"));
    }, 10_000);

    client = new GatewayClient({
      url,
      token: token ?? undefined,
      connectDelayMs: 0,
      clientName: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
      clientDisplayName: "Bustly Electron",
      clientVersion: app.getVersion(),
      platform: process.platform,
      mode: GATEWAY_CLIENT_MODES.BACKEND,
      role: "operator",
      scopes: ["operator.admin"],
      instanceId: `bustly-electron-main-${randomUUID()}`,
      onHelloOk: () => {
        void request(client as GatewayClient).then(
          (result) => finish(undefined, result),
          (error) => finish(error),
        );
      },
      onConnectError: (error) => finish(error),
      onClose: (code, reason) => {
        finish(new Error(`gateway closed during request (${code}): ${reason}`));
      },
    });

    client.start();
  });
}

function readOpenClawConfigFile(): OpenClawConfig {
  const configPath = resolveOpenClawConfigPath();
  return JSON.parse(readFileSync(configPath, "utf-8")) as OpenClawConfig;
}

function writeOpenClawConfigFile(config: OpenClawConfig): void {
  const configPath = resolveOpenClawConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function ensureDashboardChannelPluginsEnabled(cfg: OpenClawConfig): {
  config: OpenClawConfig;
  changed: boolean;
  blocked: string[];
} {
  let next = cfg;
  let changed = false;
  const blocked: string[] = [];

  for (const pluginId of DASHBOARD_CHANNEL_PLUGIN_IDS) {
    if (next.plugins?.enabled === false) {
      blocked.push(pluginId);
      continue;
    }
    if (next.plugins?.deny?.includes(pluginId)) {
      blocked.push(pluginId);
      continue;
    }

    const entry = next.plugins?.entries?.[pluginId] as Record<string, unknown> | undefined;
    const allow = next.plugins?.allow;
    const allowlistActive = Array.isArray(allow) && allow.length > 0;
    const allowlisted = !allowlistActive || allow.includes(pluginId);
    const alreadyEnabled = entry?.enabled === true && allowlisted;
    if (alreadyEnabled) {
      continue;
    }

    const result = enablePluginInConfig(next, pluginId);
    if (!result.enabled) {
      blocked.push(pluginId);
      continue;
    }
    next = result.config;
    changed = true;
  }

  return { config: next, changed, blocked };
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
    backgroundColor: "#ffffff",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Preload is always in dist/main/preload.js
      // In dev: __dirname = "dist/", so "main/preload.js" = "dist/main/preload.js"
      // In prod: __dirname = "dist/main/", so "preload.js" = "dist/main/preload.js"
      preload: PRELOAD_PATH,
    },
    title: "",
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

  mainWindow.on("enter-full-screen", () => {
    sendNativeFullscreenState(true);
  });

  mainWindow.on("leave-full-screen", () => {
    sendNativeFullscreenState(false);
  });

  mainWindow.on("focus", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    void (async () => {
      const loggedIn = await BustlyOAuth.verifyBustlyLoginStatus();
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }
      if (!loggedIn) {
        openBustlyLoginInMainWindow();
      }
      mainWindow.webContents.send("bustly-login-refresh");
    })();
  });

  mainWindow.webContents.once("did-finish-load", () => {
    sendNativeFullscreenState(Boolean(mainWindow?.isFullScreen()));
    flushPendingDeepLink();
  });
  flushPendingDeepLink();
}

function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    writeMainLog("[Updater] Development mode: auto-updates enabled");
  }

  const updateUrl =
    process.env.BUSTLY_UPDATE_URL?.trim();
  const updateBaseUrl =
    process.env.BUSTLY_UPDATE_BASE_URL?.trim();

  const platformKey =
    process.platform === "darwin"
      ? `mac-${process.arch === "arm64" ? "arm64" : "x64"}`
      : process.platform === "win32"
        ? "windows"
        : "linux";
  const normalizeBase = (input: string) => input.replace(/\/+$/, "");
  const buildPlatformUrl = (base: string) => `${normalizeBase(base)}/${platformKey}/`;
  const resolvedUpdateUrl = updateUrl || (updateBaseUrl ? buildPlatformUrl(updateBaseUrl) : "");

  const appVersion = app.getVersion();
  const prerelease = appVersion.includes("-") ? appVersion.split("-")[1] ?? "" : "";
  const inferredChannel = prerelease ? prerelease.split(".")[0] ?? "latest" : "latest";
  autoUpdater.channel = inferredChannel;
  const channel = autoUpdater.channel ?? inferredChannel;
  const metadataFile =
    process.platform === "darwin"
      ? (channel === "latest" ? "latest-mac.yml" : `${channel}-mac.yml`)
      : channel === "latest"
        ? "latest.yml"
        : `${channel}.yml`;

  writeMainLog(`[Updater] App version: ${appVersion}`);
  writeMainLog(`[Updater] Channel: ${channel} metadata: ${metadataFile}`);

  if (channel !== "latest") {
    autoUpdater.allowPrerelease = true;
    writeMainLog("[Updater] allowPrerelease enabled");
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // macOS + generic provider has shown flaky partial installs in our env;
  // force full package downloads instead of differential/blockmap patches.
  autoUpdater.disableDifferentialDownload = true;
  writeMainLog("[Updater] Differential download disabled");

  if (resolvedUpdateUrl) {
    try {
      autoUpdater.setFeedURL({ provider: "generic", url: resolvedUpdateUrl });
      writeMainLog(`[Updater] Feed URL set: ${resolvedUpdateUrl}`);
    } catch (error) {
      writeMainLog(`[Updater] Failed to set feed URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    writeMainLog("[Updater] No update URL configured; using electron-builder publish config");
  }

  autoUpdater.on("checking-for-update", () => {
    writeMainLog("[Updater] Checking for updates...");
    sendUpdateStatus("checking");
  });

  autoUpdater.on("update-available", (info) => {
    writeMainLog(`[Updater] Update available: ${info.version}`);
    sendUpdateStatus("available", { info });
  });

  autoUpdater.on("update-not-available", (info) => {
    writeMainLog(`[Updater] No updates available (current: ${info.version})`);
    sendUpdateStatus("not-available", { info });
  });

  autoUpdater.on("error", (error) => {
    writeMainLog(`[Updater] Error: ${error instanceof Error ? error.message : String(error)}`);
    sendUpdateStatus("error", { error: error instanceof Error ? error.message : String(error) });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus("download-progress", {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    writeMainLog(`[Updater] Update downloaded: ${info.version}`);
    sendUpdateStatus("downloaded", { info });
    updateReady = true;
    updateVersion = info.version ?? null;
  });

  void autoUpdater.checkForUpdates()
    .then((result) => {
      if (result?.updateInfo?.version) {
        writeMainLog(`[Updater] checkForUpdates result: ${result.updateInfo.version}`);
      } else {
        writeMainLog("[Updater] checkForUpdates result: no update info");
      }
    })
    .catch((error) => {
      writeMainLog(`[Updater] checkForUpdates failed: ${error instanceof Error ? error.message : String(error)}`);
    });
}

function ensureWindow(): void {
  if (app.isReady()) {
    createWindow();
    return;
  }
  app.once("ready", () => createWindow());
}

async function ensureElectronBootstrapModel(): Promise<void> {
  const openrouterApiKey = getElectronOpenrouterApiKey();
  if (!openrouterApiKey) {
    return;
  }

  const configPath = resolveElectronConfigPath();
  if (!existsSync(configPath)) {
    return;
  }

  const config = JSON.parse(readFileSync(configPath, "utf-8")) as OpenClawConfig;
  const currentModel = config.agents?.defaults?.model;
  const primaryModel = typeof currentModel === "string" ? currentModel : currentModel?.primary;

  await setOpenrouterApiKey(openrouterApiKey, resolveOpenClawAgentDir());
  let nextConfig = applyOpenrouterProviderConfig(config);
  nextConfig = applyAuthProfileConfig(nextConfig, {
    profileId: "openrouter:default",
    provider: "openrouter",
    mode: "api_key",
  });
  if (!primaryModel?.trim() || primaryModel !== ELECTRON_DEFAULT_MODEL) {
    nextConfig = applyPrimaryModel(nextConfig, ELECTRON_DEFAULT_MODEL);
  }
  if (JSON.stringify(nextConfig) !== JSON.stringify(config)) {
    writeFileSync(configPath, JSON.stringify(nextConfig, null, 2));
    writeMainLog(`[Init] Applied beta bootstrap model ${ELECTRON_DEFAULT_MODEL}`);
  }
}

async function bootstrapDesktopSession(options?: {
  forceInit?: boolean;
  model?: string;
  openControlUi?: boolean;
}): Promise<void> {
  await synchronizeBustlyWorkspaceContext({
    selectedModelInput: options?.model,
    forceInit: options?.forceInit === true,
  });
  const existingConfig = loadGatewayConfig();
  if (existingConfig) {
    gatewayPort = existingConfig.port;
    gatewayBind = existingConfig.bind;
    gatewayToken = existingConfig.token ?? null;
  }
  await ensureElectronBootstrapModel();
  await startGateway();

  if (options?.openControlUi === true) {
    openControlUiInMainWindow();
  }
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
        gatewayToken = result.gatewayToken ?? null;
        needsOnboardAtLaunch = false;
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
    const initialized = isFullyInitialized();
    writeMainLog(`[Init] needsOnboardAtLaunch=${needsOnboardAtLaunch} initialized=${initialized}`);
    if (initialized && needsOnboardAtLaunch) {
      needsOnboardAtLaunch = false;
    }
    return needsOnboardAtLaunch && !initialized;
  });

  // Reset onboarding (delete state dir and stop gateway)
  ipcMain.handle("openclaw-reset", async () => {
    try {
      await stopGateway();
      const stateDir = resolveElectronStateDir();
      rmSync(stateDir, { recursive: true, force: true });
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
        const workspaceId = resolveBustlyWorkspaceIdFromOAuthState();
        const result = await initializeOpenClaw({
          force: true,
          openrouterApiKey: apiKey.trim(),
          workspace: workspaceId ? resolveBustlyWorkspaceAgentWorkspaceDir(workspaceId) : undefined,
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
    const configToken = readGatewayTokenFromConfig();
    const token = configToken ?? gatewayToken;
    const wsUrl = token
      ? `ws://${GATEWAY_HOST}:${gatewayPort}?token=${token}`
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

  ipcMain.handle("gateway-connect-config", () => {
    const configToken = readGatewayTokenFromConfig();
    const token = configToken ?? gatewayToken;
    const wsUrl = token
      ? `ws://${GATEWAY_HOST}:${gatewayPort}?token=${token}`
      : `ws://${GATEWAY_HOST}:${gatewayPort}`;
    console.log(
      `[Gateway Token] connect-config configPath=${resolveOpenClawConfigPath()} configToken=${configToken ? `${configToken.slice(0, 8)}...` : "(missing)"} cachedToken=${gatewayToken ? `${gatewayToken.slice(0, 8)}...` : "(missing)"} chosen=${token ? `${token.slice(0, 8)}...` : "(missing)"}`,
    );
    return {
      wsUrl,
      token,
      host: GATEWAY_HOST,
      port: gatewayPort,
    };
  });

  ipcMain.handle(
    "gateway-patch-session",
    async (_event, key: string, patch: { label?: string | null; icon?: string | null }) => {
      try {
        const normalizedKey = typeof key === "string" ? key.trim() : "";
        if (!normalizedKey) {
          return { success: false, error: "Session key is required." };
        }

        const nextPatch: { key: string; label?: string | null; icon?: string | null } = { key: normalizedKey };
        if (patch && "label" in patch) {
          if (patch.label === null) {
            nextPatch.label = null;
          } else {
            const normalizedLabel = typeof patch.label === "string" ? patch.label.trim() : "";
            if (!normalizedLabel) {
              return { success: false, error: "Scenario name is required." };
            }
            nextPatch.label = normalizedLabel;
          }
        }
        if (patch && "icon" in patch) {
          if (patch.icon === null) {
            nextPatch.icon = null;
          } else {
            const normalizedIcon = typeof patch.icon === "string" ? patch.icon.trim() : "";
            if (!normalizedIcon) {
              return { success: false, error: "Scenario icon is required." };
            }
            nextPatch.icon = normalizedIcon;
          }
        }
        if (!("label" in nextPatch) && !("icon" in nextPatch)) {
          return { success: false, error: "At least one session field is required." };
        }

        const result = await withPrivilegedGatewayClient((client) =>
          client.request<SessionsPatchResult>("sessions.patch", nextPatch),
        );
        if (!result?.ok) {
          return { success: false, error: "Failed to update scenario." };
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

  ipcMain.handle("gateway-patch-session-label", async (_event, key: string, label: string) => {
    try {
      const normalizedKey = typeof key === "string" ? key.trim() : "";
      const normalizedLabel = typeof label === "string" ? label.trim() : "";
      if (!normalizedKey) {
        return { success: false, error: "Session key is required." };
      }
      if (!normalizedLabel) {
        return { success: false, error: "Scenario name is required." };
      }

      const result = await withPrivilegedGatewayClient((client) =>
        client.request<SessionsPatchResult>("sessions.patch", {
          key: normalizedKey,
          label: normalizedLabel,
        }),
      );
      if (!result?.ok) {
        return { success: false, error: "Failed to rename scenario." };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("gateway-patch-session-model", async (_event, key: string, model: string) => {
    try {
      const normalizedKey = typeof key === "string" ? key.trim() : "";
      if (!normalizedKey) {
        return { success: false, error: "Session key is required." };
      }
      const normalizedModel = normalizeBustlyModelRef(model);

      const result = await withPrivilegedGatewayClient((client) =>
        client.request<SessionsPatchResult>("sessions.patch", {
          key: normalizedKey,
          model: normalizedModel,
        })
      );
      if (!result?.ok) {
        return { success: false, error: "Failed to set model for this scenario." };
      }
      return {
        success: true,
        model: result.resolved?.model ?? normalizedModel,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("gateway-delete-session", async (_event, key: string) => {
    try {
      const normalizedKey = typeof key === "string" ? key.trim() : "";
      if (!normalizedKey) {
        return { success: false, error: "Session key is required." };
      }

      const result = await withPrivilegedGatewayClient((client) =>
        client.request<{ ok?: boolean; deleted?: boolean }>("sessions.delete", {
          key: normalizedKey,
        })
      );
      if (!result?.ok) {
        return { success: false, error: "Failed to delete session." };
      }
      if (result.deleted !== true) {
        return { success: false, error: "Session was not deleted." };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("resolve-pasted-path", (_event, params) => {
    const payload =
      params && typeof params === "object"
        ? (params as {
            directPath?: string;
            entryPath?: string;
            entryName?: string;
            fallbackKind?: "file" | "directory";
          })
        : {};
    return resolvePastedPath({
      directPath: payload.directPath,
      entryPath: payload.entryPath,
      entryName: payload.entryName,
      fallbackKind: payload.fallbackKind === "directory" ? "directory" : "file",
    });
  });

  ipcMain.handle("dialog-select-chat-context-paths", async () => {
    const dialogOptions: OpenDialogOptions = {
      title: "Select files or folders",
      properties: ["openFile", "openDirectory", "multiSelections"],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }
    return result.filePaths.map((selectedPath) => {
      let isDirectory = false;
      try {
        isDirectory = statSync(selectedPath).isDirectory();
      } catch {
        isDirectory = false;
      }
      let imageUrl: string | undefined;
      if (!isDirectory && IMAGE_PREVIEW_EXT_RE.test(selectedPath)) {
        try {
          const mimeType = resolveImagePreviewMimeType(selectedPath);
          if (mimeType) {
            const base64 = readFileSync(selectedPath).toString("base64");
            imageUrl = `data:${mimeType};base64,${base64}`;
          }
        } catch {
          imageUrl = undefined;
        }
      }
      return {
        path: selectedPath,
        name: basename(selectedPath) || selectedPath,
        kind: isDirectory ? ("directory" as const) : ("file" as const),
        imageUrl,
      };
    });
  });

  ipcMain.handle("resolve-chat-image-preview", async (_event, rawPath: string) => {
    const targetPath = typeof rawPath === "string" ? rawPath.trim() : "";
    if (!targetPath || !IMAGE_PREVIEW_EXT_RE.test(targetPath)) {
      return null;
    }
    try {
      const mimeType = resolveImagePreviewMimeType(targetPath);
      if (!mimeType) {
        return null;
      }
      const base64 = readFileSync(targetPath).toString("base64");
      return `data:${mimeType};base64,${base64}`;
    } catch {
      return null;
    }
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

  ipcMain.handle("window-native-fullscreen-status", () => {
    return { isNativeFullscreen: Boolean(mainWindow?.isFullScreen()) };
  });

  ipcMain.handle("updater-check", async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("updater-install", () => {
    try {
      writeMainLog("[Updater] updater-install requested");
      sendUpdateStatus("installing", { version: updateVersion });
      updateInstalling = true;
      setTimeout(() => {
        writeMainLog("[Updater] Calling quitAndInstall");
        autoUpdater.quitAndInstall(false, true);
      }, 2000);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("updater-status", () => {
    return {
      ready: updateReady,
      version: updateVersion,
    };
  });

  // === Onboarding handlers ===

  // === Bustly OAuth handlers ===

  // Check if user is logged in to Bustly
  ipcMain.handle("bustly-is-logged-in", async () => {
    return await BustlyOAuth.isBustlyLoggedIn();
  });

  // Get current Bustly user info
  ipcMain.handle("bustly-get-user-info", async () => {
    return await BustlyOAuth.getBustlyUserInfo();
  });

  ipcMain.handle("bustly-get-supabase-config", async () => {
    const state = BustlyOAuth.readBustlyOAuthState();
    const searchData = state?.bustlySearchData;
    if (!searchData?.SEARCH_DATA_SUPABASE_URL || !searchData.SEARCH_DATA_SUPABASE_ANON_KEY || !searchData.SEARCH_DATA_SUPABASE_ACCESS_TOKEN) {
      return null;
    }
    return {
      url: searchData.SEARCH_DATA_SUPABASE_URL,
      anonKey: searchData.SEARCH_DATA_SUPABASE_ANON_KEY,
      accessToken: searchData.SEARCH_DATA_SUPABASE_ACCESS_TOKEN,
      workspaceId: searchData.SEARCH_DATA_WORKSPACE_ID || state?.user?.workspaceId || "",
      userId: state?.user?.userId || "",
      userEmail: state?.user?.userEmail || "",
      userName: state?.user?.userName || "",
    };
  });

  ipcMain.handle(
    "bustly-set-active-workspace",
    async (_event, workspaceId: string, workspaceName?: string) => {
    try {
      BustlyOAuth.setActiveWorkspaceId(workspaceId);
      const agentBinding = await synchronizeBustlyWorkspaceContext({
        workspaceId,
        workspaceName,
      });
      if (gatewayProcess) {
        await stopGateway();
        await startGateway();
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("bustly-login-refresh");
      }
      return {
        success: true,
        agentId: agentBinding?.agentId,
        sessionKey: agentBinding?.sessionKey,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    },
  );

  // Open Bustly login page (standalone)
  ipcMain.handle("bustly-open-login", () => {
    try {
      openBustlyLoginInMainWindow();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Bustly OAuth login
  ipcMain.handle("bustly-login", async () => {
    try {
      console.log("[Bustly Login] Starting Bustly OAuth login flow");

      // Initialize OAuth flow (clears any existing state)
      const oauthState = BustlyOAuth.initBustlyOAuthFlow();
      console.log("[Bustly Login] OAuth state initialized, traceId:", oauthState.loginTraceId);

      // Start OAuth callback server
      const oauthPort = await startOAuthCallbackServer();
      console.log("[Bustly Login] OAuth callback server started on port", oauthPort);

      // Generate login URL
      const redirectUri = `http://127.0.0.1:${oauthPort}/authorize`;
      const loginUrl = generateLoginUrl(oauthState.loginTraceId!, redirectUri);

      console.log("[Bustly Login] Got login URL, opening browser...");

      // Open login URL in browser
      await shell.openExternal(loginUrl);

      // Poll for completion
      while (true) {
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
          // Supabase access token is mirrored to user.userAccessToken
          BustlyOAuth.completeBustlyLogin({
            user: {
              userId: apiResponse.data.userId,
              userName: apiResponse.data.userName,
              userEmail: apiResponse.data.userEmail,
              userAccessToken: supabaseAccessToken,
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

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("bustly-login-refresh");
          }
          // Keep configured workspace header/token source aligned with latest login state.
          try {
            syncBustlyConfigFile(resolveElectronConfigPath());
          } catch (syncError) {
            console.warn("[Bustly Login] Failed to sync bustly provider config:", syncError);
          }

          console.log("[Bustly Login] Login successful! Config stored in bustlyOauth.json");
          void (async () => {
            try {
              console.log("[Bustly Login] Bootstrapping local desktop session...");
              await bootstrapDesktopSession();
            } catch (bootstrapError) {
              console.error("[Bustly Login] Bootstrap error:", bootstrapError);
            } finally {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("bustly-login-refresh");
              }
            }
          })();

          return { success: true };
        }

      }
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("bustly-login-refresh");
      }
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

  ipcMain.handle("bustly-open-settings", async () => {
    try {
      const url = buildBustlyAdminUrl({ setting_modal: "profile" });
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error("[Bustly Settings] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("bustly-open-workspace-settings", async (_event, workspaceId: string) => {
    try {
      const url = buildBustlyAdminUrl({
        setting_modal: "workspace-settings",
        workspace_id: workspaceId,
      });
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error("[Bustly Workspace Settings] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("bustly-open-workspace-invite", async (_event, workspaceId: string) => {
    try {
      const url = buildBustlyAdminUrl({
        setting_modal: "members",
        workspace_id: workspaceId,
      });
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error("[Bustly Workspace Invite] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("bustly-open-workspace-manage", async (_event, workspaceId: string) => {
    try {
      const url = buildBustlyAdminUrl({
        setting_modal: "billing",
        workspace_id: workspaceId,
      });
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error("[Bustly Workspace Manage] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("bustly-open-workspace-create", async () => {
    try {
      const url = buildBustlyAdminUrl({}, "/onboarding");
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error("[Bustly Workspace Create] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("bustly-open-provider-setup", async () => {
    try {
      openProviderSetupInMainWindow();
      return { success: true };
    } catch (error) {
      console.error("[Provider Setup] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("bustly-reonboard", async () => {
    try {
      await stopGateway();
      const stateDir = resolveElectronStateDir();
      const configPath = resolveElectronConfigPath();
      const mainAgentDir = resolve(stateDir, "agents", "main", "agent");
      rmSync(configPath, { force: true });
      rmSync(mainAgentDir, { recursive: true, force: true });
      initResult = null;
      gatewayToken = null;
      gatewayProcess = null;
      needsOnboardAtLaunch = true;
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 50);
      return { success: true };
    } catch (error) {
      console.error("[Reonboard] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // === Onboarding handlers ===

  ipcMain.handle("onboard-beta-openrouter-api-key", () => {
    return process.env.BUSTLY_BETA_OPENROUTER_API_KEY ?? "";
  });

  // List available providers
  ipcMain.handle("onboard-list-providers", () => {
    return listProviders();
  });

  // Authenticate with API key
  ipcMain.handle("onboard-auth-api-key", async (_event, provider: string, apiKey: string) => {
    if (normalizeProviderId(provider) !== BUSTLY_PROVIDER_ID) {
      return {
        success: false,
        provider,
        method: "api_key",
        error: "Only bustly provider is supported.",
      };
    }
    try {
      const result = await authenticateWithApiKey({ provider: provider as ProviderId, apiKey });
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
    if (normalizeProviderId(provider) !== BUSTLY_PROVIDER_ID) {
      return {
        success: false,
        provider,
        method: "token",
        error: "Only bustly provider is supported.",
      };
    }
    try {
      const result = await authenticateWithToken({ provider: provider as ProviderId, token });
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
    if (normalizeProviderId(provider) !== BUSTLY_PROVIDER_ID) {
      return {
        success: false,
        provider,
        method: "oauth",
        error: "Only bustly provider is supported.",
      };
    }
    try {
      const result = await authenticateWithOAuth({
        provider: provider as ProviderId,
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

  ipcMain.handle("onboard-auth-oauth-cancel", () => {
    cancelOAuthFlow();
    return { success: true };
  });

  // List available models for provider
  ipcMain.handle("onboard-list-models", async (_event, provider: string) => {
    try {
      const normalizedProvider = normalizeProviderId(provider);
      if (normalizedProvider === BUSTLY_PROVIDER_ID) {
        return BUSTLY_ROUTE_MODELS.map((entry) => ({
          id: entry.routeKey,
          name: `${entry.alias} · ${entry.description}`,
          provider: BUSTLY_PROVIDER_ID,
          contextWindow: 200_000,
          reasoning: entry.reasoning,
          input: ["text", "image"] as Array<"text" | "image">,
          aliases: [entry.alias.toLowerCase()],
        }));
      }
      return [];
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
        if (provider !== BUSTLY_PROVIDER_ID) {
          return { success: false, error: "Only bustly provider is supported." };
        }
        const result = await bootstrapDesktopSession({
          model: options?.model?.trim() || authResult.defaultModel,
          openControlUi: options?.openControlUi === true,
        });
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
          next = mergeWhatsAppConfig(next, { dmPolicy: payload.dmPolicy });
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
      const cfg = readOpenClawConfigFile();
      const ensured = ensureDashboardChannelPluginsEnabled(cfg);
      if (ensured.changed) {
        writeOpenClawConfigFile(ensured.config);
      }
      if (ensured.blocked.length > 0) {
        writeMainLog(
          `[Onboard] Channel plugins not enabled due to config: ${ensured.blocked.join(", ")}`,
        );
      }
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

  ipcMain.handle("deep-link-consume-pending", () => {
    const next = pendingDeepLink;
    pendingDeepLink = null;
    return next;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", (_event, argv) => {
  const deepLinkArg = argv.find((value) => value.startsWith(`${APP_PROTOCOL}://`));
  if (deepLinkArg) {
    dispatchDeepLink(deepLinkArg);
    return;
  }
  focusMainWindow();
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  dispatchDeepLink(url);
});

const initialDeepLinkArg = process.argv.find((value) => value.startsWith(`${APP_PROTOCOL}://`));

// App lifecycle
void app.whenReady().then(async () => {
  registerProtocolClient();
  if (initialDeepLinkArg) {
    dispatchDeepLink(initialDeepLinkArg);
  }
  stopGatewayLaunchAgentForElectron();
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
          console.log(
            `[Env] Loaded environment variables from ${envPath}:`,
            Object.keys(process.env).filter(
              (k) => k.startsWith("OPENCLAW_") || k.startsWith("BUSTLY_"),
            ),
          );
          break;
        }
      } catch (error) {
        console.error(`[Env] Failed to load ${envPath}:`, error);
      }
    }
  };
  loadDotEnv();
  setupAutoUpdater();

  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (shouldOpenExternal(url)) {
        void shell.openExternal(url);
        return { action: "deny" };
      }
      return { action: "allow" };
    });
    contents.on("will-navigate", (event, url) => {
      if (shouldOpenExternal(url)) {
        event.preventDefault();
        void shell.openExternal(url);
      }
    });
  });

  // Missing Bustly OAuth state should not wipe OpenClaw config/state.
  // Users can complete onboarding via non-Bustly auth flows, which do not
  // necessarily create bustlyOauth.json.
  const stateDir = resolveElectronStateDir();
  const bustlyOauthPath = resolve(stateDir, "bustlyOauth.json");
  if (!existsSync(bustlyOauthPath)) {
    writeMainLog(`[Init] bustlyOauth.json missing; keeping stateDir=${stateDir}`);
  } else {
    writeMainLog(`[Init] bustlyOauth.json found at ${bustlyOauthPath}`);
    try {
      syncBustlyConfigFile(resolveElectronConfigPath());
      writeMainLog("[Init] Synced openclaw.json to bustly-only provider config");
    } catch (error) {
      writeMainLog(
        `[Init] Failed to sync bustly provider config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  setupIpcHandlers();

  console.log("=== OpenClaw Desktop starting ===");
  writeMainLog("OpenClaw Desktop starting");
  logStartupPaths();
  writeMainLog(`mainLogPath=${ensureMainLogPath()}`);
  writeMainLog(`resourcesPath=${process.resourcesPath}`);
  writeMainLog(`appVersion=${app.getVersion()} electron=${process.versions.electron}`);

  const configPath = getConfigPath();
  console.log(`[Init] configPath=${configPath ?? "unresolved"}`);
  writeMainLog(`configPath=${configPath ?? "unresolved"}`);
  // Check if we need to initialize or re-initialize (fix broken config)
  const fullyInitialized = isFullyInitialized();
  const bustlyLoggedIn = await BustlyOAuth.isBustlyLoggedIn();
  console.log(`[Init] fullyInitialized=${fullyInitialized}`);
  writeMainLog(`fullyInitialized=${fullyInitialized} bustlyLoggedIn=${bustlyLoggedIn}`);
  const needsInit = !fullyInitialized;
  needsOnboardAtLaunch = needsInit && !bustlyLoggedIn;

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
    if (bustlyLoggedIn) {
      console.log("[Init] Bustly session found; bootstrapping desktop session.");
      writeMainLog("Bustly session found; bootstrapping desktop session.");
      try {
        await bootstrapDesktopSession();
        console.log("[Init] Desktop session bootstrap complete");
        writeMainLog("Desktop session bootstrap complete");
      } catch (error) {
        console.error("[Init] Failed to bootstrap desktop session:", error);
        writeMainLog(`Desktop session bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      console.log("[Init] Skipping auto-initialization; waiting for login.");
      writeMainLog("Skipping auto-initialization; waiting for login.");
    }
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
    } catch (error) {
      console.error("[Gateway] ✗ Failed to start gateway:", error);
      writeMainLog(`Gateway failed to start: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});

app.on("window-all-closed", async () => {
  console.log("[Lifecycle] All windows closed");

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

  if (updateInstalling) {
    writeMainLog("[Updater] Update install in progress; skipping graceful gateway shutdown");
    return;
  }

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
