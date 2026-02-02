/**
 * Default OpenClaw configuration for the Electron app
 * This configuration is used for automatic onboarding
 */

import { randomBytes } from "node:crypto";
import type { OpenClawConfig } from "../../../src/config/config.js";

export interface PresetConfigOptions {
  /** Gateway port (default: 18789) */
  gatewayPort?: number;
  /** Gateway bind address (default: "loopback") */
  gatewayBind?: "loopback" | "lan" | "auto";
  /** Workspace directory (default: "~/.openclaw/workspace") */
  workspace?: string;
  /** Auth provider and profile */
  authProvider?: "google" | "anthropic" | "openai";
  /** Auth mode (default: "api_key") */
  authMode?: "api_key" | "token";
  /** Node manager for skills (default: "pnpm") */
  nodeManager?: "npm" | "pnpm" | "bun";
  /** Slack bot token (optional) */
  slackBotToken?: string;
  /** Slack app token (optional) */
  slackAppToken?: string;
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
    authProvider = "google",
    authMode = "api_key",
    nodeManager = "pnpm",
    slackBotToken,
    slackAppToken,
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
    },
    auth: {
      profiles: {
        [`${authProvider}:default`]: {
          provider: authProvider,
          mode: authMode,
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
          primary: authProvider === "google" ? "google/gemini-3-pro-preview" : "anthropic/claude-sonnet-4-20250514",
        },
        models:
          authProvider === "google"
            ? {
                "google/gemini-3-pro-preview": {
                  alias: "gemini",
                },
              }
            : {
                "anthropic/claude-sonnet-4-20250514": {
                  alias: "sonnet",
                },
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

  // Add Slack configuration if tokens are provided
  if (slackBotToken || slackAppToken) {
    config.channels = {
      slack: {
        mode: "socket",
        webhookPath: "/slack/events",
        enabled: true,
        ...(slackBotToken && { botToken: slackBotToken }),
        ...(slackAppToken && { appToken: slackAppToken }),
        userTokenReadOnly: true,
        groupPolicy: "allowlist",
        channels: {},
      },
    };
    config.plugins = {
      entries: {
        slack: {
          enabled: true,
        },
      },
    };
  }

  return { config, gatewayToken };
}

/**
 * Generate a random 40-character hex token for gateway authentication
 */
function generateRandomToken(): string {
  return randomBytes(20).toString("hex");
}
