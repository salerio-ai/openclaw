/**
 * Automatic onboarding and initialization for the Electron app
 * This module provides a simplified one-call initialization
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { generateDefaultConfig, type PresetConfigOptions } from "../config/default-config.js";

// Import from OpenClaw source
// NOTE: These imports assume the Electron app is running from the repo root
// In production, you may need to adjust these paths or bundle the required modules
let createConfigIO: (deps?: { fs?: typeof import("node:fs"); json5?: any; env?: NodeJS.ProcessEnv; homedir?: () => string; configPath?: string; logger?: Pick<typeof console, "error" | "warn"> }) => {
  configPath: string;
  loadConfig: () => any;
  readConfigFileSnapshot: () => Promise<any>;
  writeConfigFile: (cfg: any) => Promise<void>;
};
let resolveConfigPath: () => string;
let ensureOpenClawModelsJson: (config?: unknown, agentDirOverride?: string) => Promise<{ agentDir: string; wrote: boolean }>;

async function loadOpenClawModules() {
  try {
    // Load from compiled dist (main repo must be built first)
    const configModule = await import("../../../dist/config/io.js");
    const pathsModule = await import("../../../dist/config/paths.js");
    createConfigIO = configModule.createConfigIO;
    resolveConfigPath = pathsModule.resolveConfigPath;

    // Load models and auth modules
    // @ts-expect-error - Dynamic import from main repo dist
    const modelsConfigModule = await import("../../../dist/agents/models-config.js");
    ensureOpenClawModelsJson = modelsConfigModule.ensureOpenClawModelsJson;
  } catch (cause) {
    console.warn("Could not load OpenClaw modules from dist, trying bundled path...");
    // In production, these would be bundled differently
    throw new Error(
      "OpenClaw modules not found. Please run 'pnpm build' from the repo root first.",
      { cause },
    );
  }
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
}

/**
 * Initialize OpenClaw with default configuration
 * This is the main entry point for automatic onboarding
 */
export async function initializeOpenClaw(
  options: InitializationOptions = {},
): Promise<InitializationResult> {
  try {
    // Lazy load OpenClaw modules
    if (!createConfigIO || !resolveConfigPath) {
      await loadOpenClawModules();
    }

    const { force = false, ...configOptions } = options;
    const configPath = resolveConfigPath();

    // Check if config already exists
    if (!force && existsSync(configPath)) {
      console.log("Configuration already exists, skipping initialization");
      // Read existing config to extract gateway info
      const existingConfig = JSON.parse(require("node:fs").readFileSync(configPath, "utf-8"));
      return {
        success: true,
        configPath,
        gatewayPort: existingConfig.gateway?.port || 18790,
        gatewayBind: existingConfig.gateway?.bind || "loopback",
        gatewayToken: existingConfig.gateway?.auth?.token,
        workspace: existingConfig.agents?.defaults?.workspace || "~/.openclaw/workspace",
      };
    }

    console.log("Initializing OpenClaw with default configuration...");

    // Generate default configuration (auth disabled for local development)
    const { config, gatewayToken } = generateDefaultConfig(configOptions);

    // Ensure config directory exists
    const configDir = dirname(configPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    // Write configuration file
    const io = createConfigIO();
    await io.writeConfigFile(config);
    console.log(`Configuration written to: ${configPath}`);

    // Create workspace directory
    const workspaceDir = config.agents?.defaults?.workspace || "~/.openclaw/workspace";
    const resolvedWorkspace = workspaceDir.startsWith("~")
      ? join(homedir(), workspaceDir.slice(1))
      : workspaceDir;

    if (!existsSync(resolvedWorkspace)) {
      mkdirSync(resolvedWorkspace, { recursive: true, mode: 0o700 });
      console.log(`Workspace created: ${resolvedWorkspace}`);
    }

    // Create sessions directory
    const sessionsDir = join(homedir(), ".openclaw/agents/main/sessions");
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true, mode: 0o700 });
      console.log(`Sessions directory created: ${sessionsDir}`);
    }

    // Create credentials directory
    const credentialsDir = join(homedir(), ".openclaw/credentials");
    if (!existsSync(credentialsDir)) {
      mkdirSync(credentialsDir, { recursive: true, mode: 0o700 });
      console.log(`Credentials directory created: ${credentialsDir}`);
    }

    // Initialize auth profiles (if API key is configured)
    // Check all profiles in the generated config
    const profiles = config.auth?.profiles || {};
    for (const [profileId, profileConfig] of Object.entries(profiles)) {
      const profile = profileConfig as { provider?: string; mode?: string };
      console.log(`Auth profile found: ${profileId} (${profile.provider})`);
    }

    // Generate models.json
    console.log("Generating models.json...");
    try {
      const modelsResult = await ensureOpenClawModelsJson(config);
      if (modelsResult.wrote) {
        console.log(`✓ models.json generated at: ${modelsResult.agentDir}`);
      } else {
        console.log("ℹ models.json already up-to-date");
      }
    } catch (error) {
      console.warn(`Failed to generate models.json: ${error}`);
    }

    return {
      success: true,
      configPath,
      gatewayPort: config.gateway?.port || 18789,
      gatewayBind: config.gateway?.bind || "loopback",
      gatewayToken: config.gateway?.auth?.token || gatewayToken,
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
    if (!resolveConfigPath) {
      return false; // Modules not loaded yet
    }
    const configPath = resolveConfigPath();
    return existsSync(configPath);
  } catch {
    return false;
  }
}
