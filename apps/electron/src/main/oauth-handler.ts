/**
 * OAuth handler for Electron app
 * Provides browser-based OAuth authentication for model providers
 */

import { shell } from "electron";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { loginOpenAICodex } from "@mariozechner/pi-ai";

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
      { id: "api_key", label: "API Key", kind: "api_key" as AuthMethodKind },
    ],
    defaultModel: "openai/gpt-4o",
    envKey: "OPENAI_API_KEY",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    authMethods: [
      { id: "api_key", label: "API Key", kind: "api_key" as AuthMethodKind },
      { id: "token", label: "Setup Token (Claude CLI)", kind: "token" as AuthMethodKind },
    ],
    defaultModel: "anthropic/claude-sonnet-4-20250514",
    envKey: "ANTHROPIC_API_KEY",
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
 * Wait for OAuth callback on local HTTP server
 */
async function waitForOAuthCallback(params: {
  port: number;
  expectedState: string;
  timeoutMs: number;
}): Promise<OAuthCallbackResult> {
  return await new Promise<OAuthCallbackResult>((resolve, reject) => {
    let timeout: NodeJS.Timeout | null = null;
    const server = createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "/", `http://127.0.0.1:${params.port}`);
        const code = requestUrl.searchParams.get("code")?.trim();
        const state = requestUrl.searchParams.get("state")?.trim();

        if (!code) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Missing code");
          return;
        }
        if (!state || state !== params.expectedState) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Invalid state");
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(`
          <!doctype html>
          <html>
            <head>
              <meta charset='utf-8' />
              <title>Authentication Complete</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                .container { max-width: 500px; margin: 100px auto; padding: 40px; text-align: center; }
                h2 { color: #333; }
                p { color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <h2>Authentication Complete</h2>
                <p>You can close this window and return to OpenClaw Desktop.</p>
              </div>
            </body>
          </html>
        `);
        if (timeout) {
          clearTimeout(timeout);
        }
        server.close();
        resolve({ code, state });
      } catch (err) {
        if (timeout) {
          clearTimeout(timeout);
        }
        server.close();
        reject(err);
      }
    });

    server.once("error", (err) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      server.close();
      reject(err);
    });

    server.listen(params.port, "127.0.0.1");

    timeout = setTimeout(() => {
      try {
        server.close();
      } catch {}
      reject(new Error("OAuth callback timeout"));
    }, params.timeoutMs);
  });
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
 * Authenticate using setup token (Anthropic CLI)
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
