/**
 * Default OpenClaw configuration for the Electron app
 * This configuration is used for automatic onboarding
 */

import { randomBytes } from "node:crypto";
/* @ts-ignore */
import type { OpenClawConfig } from "../../../src/config/config.js";

export interface PresetConfigOptions {
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

/**
 * Generate a default OpenClaw configuration
 */
export function generateDefaultConfig(
  options: PresetConfigOptions = {},
): { config: OpenClawConfig; gatewayToken: string } {
  const {
    gatewayPort = 18789,
    gatewayBind = "loopback",
    workspace = "~/.openclaw/workspace",
    nodeManager = "pnpm",
    openrouterApiKey,
  } = options;

  // Generate a random gateway token
  const gatewayToken = generateRandomToken();

  const config: OpenClawConfig = {
    meta: {
      lastTouchedVersion: "2026.1.30", // Keep in sync with package.json
      lastTouchedAt: new Date().toISOString(),
    },
    wizard: {
      lastRunAt: new Date().toISOString(),
      lastRunVersion: "2026.1.30",
      lastRunCommand: "electron-auto-init",
      lastRunMode: "local",
    },
    env: {
      shellEnv: {
        enabled: true,
      },
      ...(openrouterApiKey && { OPENROUTER_API_KEY: openrouterApiKey }),
    },
    auth: {
      profiles: {
        "google:default": {
          provider: "google",
          mode: "api_key",
        },
      },
    },
    models: {
      bedrockDiscovery: {
        enabled: false,
        providerFilter: [],
      },
    },
    agents: {
      defaults: {
        model: {
          primary: "openrouter/minimax/minimax-m2.1",
        },
        models: {
          "openrouter/minimax/minimax-m2.1": {},
        },
        workspace,
        compaction: {
          mode: "safeguard",
        },
        maxConcurrent: 4,
        subagents: {
          maxConcurrent: 8,
        },
      },
      list: [],
    },
    messages: {
      ackReactionScope: "group-mentions",
    },
    commands: {
      native: "auto",
      nativeSkills: "auto",
    },
    channels: {},
    gateway: {
      port: gatewayPort,
      mode: "local",
      bind: gatewayBind,
      auth: {
        mode: "token",
        token: gatewayToken,
      },
      tailscale: {
        mode: "off",
        resetOnExit: false,
      },
      remote: {},
    },
    skills: {
      install: {
        nodeManager,
      },
    },
    plugins: {
      entries: {},
    },
  };

  return { config, gatewayToken };
}

/**
 * Generate a random 40-character hex token for gateway authentication
 */
function generateRandomToken(): string {
  return randomBytes(20).toString("hex");
}
