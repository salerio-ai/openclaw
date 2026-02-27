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
import { resolveCliInvocation, resolveNodeBinary, resolveOpenClawCliPath } from "./cli-utils.js";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

function resolveConfigPathSafe(): string {
  try {
    return resolveConfigPathFromSrc();
  } catch {
    const homeDir = homedir();
    const override = process.env.OPENCLAW_CONFIG_PATH?.trim();
    if (override) {
      return resolve(override.startsWith("~") ? override.replace(/^~(?=$|[\\/])/, homeDir) : override);
    }
    const stateOverride = process.env.OPENCLAW_STATE_DIR?.trim();
    if (stateOverride) {
      const resolved = resolve(
        stateOverride.startsWith("~") ? stateOverride.replace(/^~(?=$|[\\/])/, homeDir) : stateOverride,
      );
      return join(resolved, "openclaw.json");
    }
    return join(homeDir, ".bustly", "openclaw.json");
  }
}

function resolveDefaultWorkspaceDir(explicit?: string): string {
  if (explicit?.trim()) {
    return explicit.trim();
  }
  const homeDir = homedir();
  const stateOverride = process.env.OPENCLAW_STATE_DIR?.trim();
  if (stateOverride) {
    const resolved = resolve(
      stateOverride.startsWith("~") ? stateOverride.replace(/^~(?=$|[\\/])/, homeDir) : stateOverride,
    );
    return join(resolved, "workspace");
  }
  return join(homeDir, ".bustly", "workspace");
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

  const workspace = resolveDefaultWorkspaceDir(options.workspace);
  args.push("--workspace", workspace);
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

  const parseNodeVersion = (value: string | null | undefined): [number, number, number] | null => {
    const match = value?.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
      return null;
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };

  const isNodeAtLeast = (nodePath: string, minimum: [number, number, number]): boolean => {
    try {
      const result = spawnSync(nodePath, ["-v"], { encoding: "utf-8" });
      if (result.status !== 0) {
        return false;
      }
      const parsed = parseNodeVersion(result.stdout);
      if (!parsed) {
        return false;
      }
      const [major, minor, patch] = parsed;
      const [minMajor, minMinor, minPatch] = minimum;
      if (major !== minMajor) {
        return major > minMajor;
      }
      if (minor !== minMinor) {
        return minor >= minMinor;
      }
      return patch >= minPatch;
    } catch {
      return false;
    }
  };

  const minNode: [number, number, number] = [22, 12, 0];
  const explicitNodeCandidates = [
    process.env.OPENCLAW_NODE_PATH?.trim(),
    process.env.OPENCLAW_NODE_BIN?.trim(),
    process.env.OPENCLAW_NODE?.trim(),
    join(homedir(), ".nvm/versions/node/v22.17.1/bin/node"),
    join(homedir(), ".nvm/versions/node/v22.16.0/bin/node"),
    join(homedir(), ".nvm/versions/node/v22.15.0/bin/node"),
    "/opt/homebrew/opt/node@22/bin/node",
  ].filter((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));

  const preferredNode = explicitNodeCandidates.find((candidate) => isNodeAtLeast(candidate, minNode));
  const resolvedInvocation = resolveCliInvocation(cliPath, args, { includeBundledNode: true });
  const resolvedNode =
    preferredNode ??
    (resolvedInvocation?.isMjs && resolvedInvocation.nodePath && isNodeAtLeast(resolvedInvocation.nodePath, minNode)
      ? resolvedInvocation.nodePath
      : resolveNodeBinary({ includeBundled: true }));

  let command: string;
  let commandArgs: string[];
  if (cliPath.endsWith(".mjs")) {
    const nodePath =
      resolvedNode && isNodeAtLeast(resolvedNode, minNode) ? resolvedNode : preferredNode ?? null;
    if (!nodePath) {
      throw new Error("Compatible Node (>=22.12.0) not found for onboarding.");
    }
    command = nodePath;
    commandArgs = [cliPath, ...args];
  } else if (resolvedInvocation) {
    command = resolvedInvocation.command;
    commandArgs = resolvedInvocation.args;
  } else {
    throw new Error("OpenClaw CLI invocation could not be resolved.");
  }

  try {
    const version = spawnSync(command, ["-v"], { encoding: "utf-8" }).stdout?.trim();
    console.log(`[Init] Onboard runtime: ${command} (${version ?? "unknown"})`);
  } catch {
    // ignore
  }

  const env = { ...process.env };
  if (cliPath.endsWith(".mjs")) {
    env.OPENCLAW_NODE_PATH = command;
  }

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
    const workspaceDir =
      config.agents?.defaults?.workspace || resolveDefaultWorkspaceDir(options.workspace);
    const resolvedWorkspace = workspaceDir.startsWith("~")
      ? join(homedir(), workspaceDir.slice(1))
      : workspaceDir;

    return {
      success: true,
      configPath,
      gatewayPort: config.gateway?.port || 17999,
      gatewayBind: config.gateway?.bind || "loopback",
      gatewayToken: config.gateway?.auth?.token,
      workspace: resolvedWorkspace,
    };
  } catch (error) {
    console.error("Initialization failed:", error);
    return {
      success: false,
      configPath: "",
      gatewayPort: 17999,
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
