// @ts-nocheck
/**
 * Automatic onboarding and initialization for the Electron app
 * This module provides a simplified one-call initialization
 */


import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFile, spawnSync } from "node:child_process";
import type { PresetConfigOptions } from "../config/default-config.js";
import { resolveConfigPath as resolveConfigPathFromSrc } from "../../../../src/config/paths";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

function resolveConfigPathSafe(): string {
  try {
    return resolveConfigPathFromSrc();
  } catch {
    return join(homedir(), ".openclaw", "openclaw.json");
  }
}

function resolveOpenClawCliPath(): string | null {
  const candidates = [
    resolve(process.resourcesPath, "openclaw.mjs"),
    resolve(__dirname, "../../../openclaw.mjs"),
    resolve(__dirname, "../../../../openclaw.mjs"),
    resolve(__dirname, "../../../dist/cli.js"),
    resolve(__dirname, "../../dist/cli.js"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveNodeBinary(): string | null {
  const envPath = process.env.OPENCLAW_NODE_PATH?.trim();
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const bundledCandidates = [
    resolve(process.resourcesPath, "node", "bin", "node"),
    resolve(process.resourcesPath, "node"),
  ];
  for (const candidate of bundledCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const which = spawnSync("/usr/bin/which", ["node"], { encoding: "utf-8" });
    const path = which.stdout?.trim();
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // ignore
  }

  return null;
}

async function runCliOnboard(options: InitializationOptions): Promise<void> {
  const cliPath = resolveOpenClawCliPath();
  if (!cliPath) {
    throw new Error("OpenClaw CLI not found. Ensure openclaw.mjs is bundled.");
  }

  const args: string[] = [
    "onboard",
    "--non-interactive",
    "--accept-risk",
    "--skip-channels",
    "--skip-skills",
    "--skip-health",
    "--skip-ui",
    "--json",
  ];

  if (options.workspace) {
    args.push("--workspace", options.workspace);
  }
  if (options.gatewayPort) {
    args.push("--gateway-port", String(options.gatewayPort));
  }
  if (options.gatewayBind) {
    args.push("--gateway-bind", options.gatewayBind);
  }
  if (options.nodeManager) {
    args.push("--node-manager", options.nodeManager);
  }

  if (options.openrouterApiKey) {
    args.push("--auth-choice", "openrouter-api-key", "--openrouter-api-key", options.openrouterApiKey);
  } else {
    args.push("--auth-choice", "skip");
  }

  const isMjs = cliPath.endsWith(".mjs");
  const nodePath = isMjs ? resolveNodeBinary() : null;
  if (isMjs && !nodePath) {
    throw new Error("Node binary not found. Set OPENCLAW_NODE_PATH or bundle node.");
  }
  const command = isMjs ? nodePath! : cliPath;
  const commandArgs = isMjs ? [cliPath, ...args] : args;
  const env = { ...process.env };

  await new Promise<void>((resolvePromise, rejectPromise) => {
    execFile(command, commandArgs, { env }, (error) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      resolvePromise();
    });
  });
}

export interface InitializationResult {
  success: boolean;
  configPath: string;
  gatewayPort: number;
  gatewayToken?: string; // Optional (not used when auth is disabled)
  gatewayBind: string;
  workspace: string;
  error?: string;
}

export interface InitializationOptions extends PresetConfigOptions {
  /** Force re-initialization even if config exists */
  force?: boolean;
  /** OpenRouter API key for minimax model */
  openrouterApiKey?: string;
}

/**
 * Initialize OpenClaw with default configuration
 * This is the main entry point for automatic onboarding
 */
export async function initializeOpenClaw(
  options: InitializationOptions = {},
): Promise<InitializationResult> {
  try {
    const { force = false, ...configOptions } = options;
    const configPath = resolveConfigPathSafe();

    // Check if config already exists
    if (!force && existsSync(configPath)) {
      console.log("Configuration already exists, skipping initialization");
    } else {
      console.log("Initializing OpenClaw via CLI onboarding...");
      await runCliOnboard(configOptions);
      if (!existsSync(configPath)) {
        throw new Error("OpenClaw CLI did not create config file");
      }
    }

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const workspaceDir = config.agents?.defaults?.workspace || "~/.openclaw/workspace";
    const resolvedWorkspace = workspaceDir.startsWith("~")
      ? join(homedir(), workspaceDir.slice(1))
      : workspaceDir;

    return {
      success: true,
      configPath,
      gatewayPort: config.gateway?.port || 18789,
      gatewayBind: config.gateway?.bind || "loopback",
      gatewayToken: config.gateway?.auth?.token,
      workspace: resolvedWorkspace,
    };
  } catch (error) {
    console.error("Initialization failed:", error);
    return {
      success: false,
      configPath: "",
      gatewayPort: 18789,
      gatewayBind: "loopback",
      workspace: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if OpenClaw is already initialized
 */
export function isInitialized(): boolean {
  try {
    const configPath = resolveConfigPathSafe();
    return existsSync(configPath);
  } catch {
    return false;
  }
}

export function isFullyInitialized(): boolean {
  try {
    const configPath = resolveConfigPathSafe();
    console.log(`[Init] Checking config at ${configPath}`);
    if (!existsSync(configPath)) {
      console.log("[Init] Config file not found");
      return false;
    }
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as {
      auth?: { profiles?: Record<string, unknown> };
      agents?: { defaults?: { model?: { primary?: string } | string } };
    };
    const hasProfiles =
      Boolean(config.auth?.profiles) && Object.keys(config.auth?.profiles ?? {}).length > 0;
    const model = config.agents?.defaults?.model;
    const primary = typeof model === "string" ? model : model?.primary;
    const hasPrimaryModel = typeof primary === "string" && primary.trim().length > 0;
    console.log(
      `[Init] hasProfiles=${hasProfiles} hasPrimaryModel=${hasPrimaryModel} primary=${primary ?? ""}`,
    );
    return hasProfiles && hasPrimaryModel;
  } catch {
    return false;
  }
}

export function getConfigPath(): string | null {
  try {
    return resolveConfigPathSafe();
  } catch {
    return null;
  }
}
