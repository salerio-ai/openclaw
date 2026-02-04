/**
 * OAuth handler for Electron app
 * Provides browser-based OAuth authentication for model providers
 */

import { shell } from "electron";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { loginOpenAICodex, loginAntigravity } from "@mariozechner/pi-ai";

let oauthPromptResolver: ((value: string) => void) | null = null;

/**
 * Handle manual OAuth code/URL input from renderer
 */
export function handleOAuthPromptResponse(value: string) {
  if (oauthPromptResolver) {
    oauthPromptResolver(value);
    oauthPromptResolver = null;
  }
}

// Provider configurations
const PROVIDERS = {
  openai: {
    id: "openai",
    label: "OpenAI",
    authMethods: [
      { id: "oauth", label: "Browser Login (OAuth)", kind: "oauth" as AuthMethodKind },
    ],
    defaultModel: "openai-codex/gpt-5.2",
    envKey: "OPENAI_OAUTH",
  },
  google: {
    id: "google",
    label: "Google",
    authMethods: [
      { id: "oauth", label: "Browser Login (OAuth)", kind: "oauth" as AuthMethodKind },
    ],
    defaultModel: "google-antigravity/claude-opus-4-5-thinking",
    envKey: "GOOGLE_OAUTH",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    authMethods: [
      { id: "api_key", label: "API Key", kind: "api_key" as AuthMethodKind },
    ],
    defaultModel: "openrouter/anthropic/claude-sonnet-4",
    envKey: "OPENROUTER_API_KEY",
    isDev: true,
  },
};

export type ProviderId = keyof typeof PROVIDERS;
export type AuthMethodKind = "oauth" | "api_key" | "token" | "device_code" | "custom";

export interface ProviderConfig {
  id: string;
  label: string;
  authMethods: Array<{ id: string; label: string; kind: AuthMethodKind }>;
  defaultModel: string;
  envKey: string;
  isDev?: boolean;
}

export interface OAuthCallbackResult {
  code: string;
  state: string;
}

export interface AuthResult {
  success: boolean;
  provider: string;
  method: string;
    credential?: {
      type: "api_key" | "token" | "oauth";
      provider: string;
      key?: string;
      token?: string;
      access?: string;
      refresh?: string;
      expires?: number;
      email?: string;
      projectId?: string;
    };
  defaultModel?: string;
  error?: string;
}

/**
 * List available providers
 */
export function listProviders(): ProviderConfig[] {
  return Object.values(PROVIDERS);
}

/**
 * Get provider by ID
 */
export function getProvider(id: string): ProviderConfig | null {
  return PROVIDERS[id as ProviderId] || null;
}

/**
 * Authenticate using API key (manual paste)
 */
export async function authenticateWithApiKey(params: {
  provider: ProviderId;
  apiKey: string;
}): Promise<AuthResult> {
  const provider = getProvider(params.provider);
  if (!provider) {
    return {
      success: false,
      provider: params.provider,
      method: "api_key",
      error: "Unknown provider",
    };
  }

  const trimmedKey = params.apiKey.trim();
  if (!trimmedKey) {
    return {
      success: false,
      provider: params.provider,
      method: "api_key",
      error: "API key is required",
    };
  }

  return {
    success: true,
    provider: params.provider,
    method: "api_key",
    credential: {
      type: "api_key",
      provider: params.provider,
      key: trimmedKey,
    },
    defaultModel: provider.defaultModel,
  };
}

/**
 * Authenticate using setup token
 */
export async function authenticateWithToken(params: {
  provider: ProviderId;
  token: string;
}): Promise<AuthResult> {
  const provider = getProvider(params.provider);
  if (!provider) {
    return {
      success: false,
      provider: params.provider,
      method: "token",
      error: "Unknown provider",
    };
  }

  const trimmedToken = params.token.trim();
  if (!trimmedToken) {
    return {
      success: false,
      provider: params.provider,
      method: "token",
      error: "Token is required",
    };
  }

  return {
    success: true,
    provider: params.provider,
    method: "token",
    credential: {
      type: "token",
      provider: params.provider,
      token: trimmedToken,
    },
    defaultModel: provider.defaultModel,
  };
}

/**
 * Authenticate using OAuth (OpenAI)
 */
export async function authenticateWithOAuth(params: {
  provider: ProviderId;
  onPromptRequired?: (message: string) => void;
}): Promise<AuthResult> {
  if (params.provider === "openai") {
    try {
      const creds = await loginOpenAICodex({
        onAuth: async ({ url }) => {
          await shell.openExternal(url);
        },
        onPrompt: async (prompt) => {
          // Notify renderer that manual input is required
          if (params.onPromptRequired) {
            params.onPromptRequired(prompt.message);
          }

          // Wait for renderer to provide the code/URL via handleOAuthPromptResponse
          return new Promise<string>((resolve) => {
            oauthPromptResolver = resolve;
          });
        },
        onProgress: () => {},
      });

      if (!creds) {
        throw new Error("No credentials returned");
      }

      return {
        success: true,
        provider: "openai",
        method: "oauth",
        credential: {
          type: "oauth",
          provider: "openai-codex",
          ...creds,
        },
        defaultModel: "openai-codex/gpt-5.2",
      };
    } catch (error) {
      return {
        success: false,
        provider: params.provider,
        method: "oauth",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (params.provider === "google") {
    try {
      const creds = await loginAntigravity(
        ({ url }) => {
          void shell.openExternal(url);
        },
        () => {},
        async () => {
          if (!params.onPromptRequired) {
            throw new Error("Manual OAuth prompt handler unavailable");
          }
          let resolved = false;
          const promptTimer = setTimeout(() => {
            if (resolved) {
              return;
            }
            params.onPromptRequired?.(
              "If the browser doesn't finish, paste the full redirect URL here.",
            );
          }, 4000);
          const value = await new Promise<string>((resolve) => {
            oauthPromptResolver = (input) => {
              resolved = true;
              clearTimeout(promptTimer);
              resolve(input);
            };
          });
          return value;
        },
      );

      return {
        success: true,
        provider: "google",
        method: "oauth",
        credential: {
          type: "oauth",
          provider: "google-antigravity",
          ...creds,
        },
        defaultModel: "google-antigravity/claude-opus-4-5-thinking",
      };
    } catch (error) {
      return {
        success: false,
        provider: params.provider,
        method: "oauth",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    success: false,
    provider: params.provider,
    method: "oauth",
    error: "OAuth not supported for this provider",
  };
}

/**
 * Open OAuth URL in browser
 */
async function openOAuthUrl(url: string): Promise<void> {
  await shell.openExternal(url);
}

/**
 * Generate OAuth state parameter
 */
function generateOAuthState(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Start OAuth flow (returns URL to open)
 */
export function startOAuthFlow(params: {
  provider: ProviderId;
  method: string;
}): { url: string; state: string; port: number } | { error: string } {
  const provider = getProvider(params.provider);
  if (!provider) {
    return { error: "Unknown provider" };
  }

  const authMethod = provider.authMethods.find((m) => m.id === params.method);
  if (!authMethod) {
    return { error: "Unknown auth method" };
  }

  // For providers that support OAuth, we would generate OAuth URLs here
  // For now, this is a placeholder for future OAuth implementation
  return { error: "OAuth not yet implemented for this provider" };
}
