/**
 * OAuth handler for Electron app
 * Provides browser-based OAuth authentication for Bustly login and model providers
 */

import { shell } from "electron";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loginOpenAICodex, loginAntigravity } from "@mariozechner/pi-ai";
import { loadConfig } from "../../../../src/config/config.js";
import * as BustlyOAuth from "./bustly-oauth.js";

let oauthPromptResolver: ((value: string) => void) | null = null;

// ============================================================================
// Bustly OAuth HTTP Server
// ============================================================================

/** Default port for OAuth callback server (separate from gateway to avoid conflicts). */
const DEFAULT_OAUTH_CALLBACK_PORT = 18790;

let oauthServer: ReturnType<typeof createServer> | null = null;
let oauthCodeResolver: ((code: string) => void) | null = null;

/**
 * Get OAuth callback port from config, with fallback to default value
 */
function getOAuthCallbackPort(): number {
  try {
    const config = loadConfig();
    const port = config.bustlyOAuth?.callbackPort ?? DEFAULT_OAUTH_CALLBACK_PORT;
    console.log(`[Bustly OAuth] Using callback port: ${port} (from ${config.bustlyOAuth?.callbackPort ? 'config' : 'default'})`);
    return port;
  } catch (error) {
    console.log(`[Bustly OAuth] Failed to load config, using default port: ${DEFAULT_OAUTH_CALLBACK_PORT}`);
    return DEFAULT_OAUTH_CALLBACK_PORT;
  }
}

/**
 * Generate the login URL for opening in browser
 */
export function generateLoginUrl(
  loginTraceId: string,
  redirectUri: string,
): string {
  // Load config from environment variables
  const apiBaseUrl = process.env.BUSTLY_API_BASE_URL;
  const webBaseUrl = process.env.BUSTLY_WEB_BASE_URL;
  const clientId = process.env.BUSTLY_CLIENT_ID;

  if (!apiBaseUrl || !webBaseUrl || !clientId) {
    throw new Error(
      "Bustly OAuth configuration not found. Please set BUSTLY_API_BASE_URL, BUSTLY_WEB_BASE_URL, and BUSTLY_CLIENT_ID environment variables.",
    );
  }

  const state = BustlyOAuth.readBustlyOAuthState();
  const deviceId = state?.deviceId ?? "";

  console.log("[Bustly OAuth] generateLoginUrl - loginTraceId:", loginTraceId);
  console.log("[Bustly OAuth] generateLoginUrl - deviceId:", deviceId);
  console.log("[Bustly OAuth] generateLoginUrl - redirectUri:", redirectUri);
  console.log("[Bustly OAuth] generateLoginUrl - apiBaseUrl:", apiBaseUrl);
  console.log("[Bustly OAuth] generateLoginUrl - webBaseUrl:", webBaseUrl);
  console.log("[Bustly OAuth] generateLoginUrl - clientId:", clientId);

  // Build the OAuth URL with all the parameters
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    device_id: deviceId,
    login_trace_id: loginTraceId,
  });

  const loginUrl = `${webBaseUrl}/admin/auth?${params.toString()}`;

  console.log("[Bustly OAuth] Final loginUrl:", loginUrl);
  return loginUrl;
}

/**
 * Start the OAuth callback HTTP server
 */
export function startOAuthCallbackServer(): number {
  if (oauthServer) {
    const port = getOAuthCallbackPort();
    console.log("[Bustly OAuth] OAuth server already running on port", port);
    return port;
  }

  const port = getOAuthCallbackPort();
  console.log("[Bustly OAuth] Starting OAuth callback server on port", port);

  oauthServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    console.log("=".repeat(60));
    console.log("[Bustly OAuth] Received request:", req.method, req.url);
    console.log("=".repeat(60));

    const urlRaw = req.url;
    if (!urlRaw) {
      console.log("[Bustly OAuth] No URL in request");
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }

    const url = new URL(urlRaw, `http://127.0.0.1:${port}`);
    console.log("[Bustly OAuth] Pathname:", url);

    // Check if this is an OAuth callback
    if (url.pathname !== "/authorize") {
      console.log("[Bustly OAuth] Not an OAuth callback, returning 404");
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not Found");
      return;
    }

    console.log("[Bustly OAuth] OAuth callback detected!");

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    console.log("[Bustly OAuth] Authorization Code:", code ? code.substring(0, 10) + "..." : "MISSING");
    console.log("[Bustly OAuth] State (loginTraceId):", state);

    if (!code) {
      console.log("[Bustly OAuth] Missing authorization code - rendering error page");
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Login Failed</title>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <h1>❌ Login Failed</h1>
          <p>Missing authorization code. Please try again.</p>
        </body>
        </html>
      `);
      return;
    }

    // Verify state matches our login trace ID
    const oauthState = BustlyOAuth.readBustlyOAuthState();
    if (!oauthState || oauthState.loginTraceId !== state) {
      console.log("[Bustly OAuth] Invalid state, not matching our login trace ID");
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Login Failed</title>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <h1>❌ Login Failed</h1>
          <p>Invalid request state. Please try again.</p>
        </body>
        </html>
      `);
      return;
    }

    // Store the auth code in state
    BustlyOAuth.setBustlyAuthCode(code);
    console.log("[Bustly OAuth] Authorization code stored in state");

    // Notify the waiting promise if any
    // The IPC handler in index.ts will handle token exchange
    if (oauthCodeResolver) {
      console.log("[Bustly OAuth] Notifying waiting promise");
      oauthCodeResolver(code);
      oauthCodeResolver = null;
    }

    console.log("[Bustly OAuth] Waiting for IPC handler to exchange token...");

    // Render success page
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Login Successful</title>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
          .container { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
          h1 { color: #27ae60; margin-bottom: 10px; }
          p { color: #555; font-size: 16px; line-height: 1.6; }
          .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #667eea; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Login Successful</h1>
          <p>Finishing setup, please wait...</p>
          <div class="spinner"></div>
          <p style="font-size: 14px; color: #999;">You can close this page and return to the OpenClaw desktop app.</p>
        </div>
        <script>
          setTimeout(() => window.close(), 3000);
        </script>
      </body>
      </html>
    `);

    console.log("[Bustly OAuth] Success page rendered, callback handled successfully");
    console.log("=".repeat(60));
  });

  oauthServer.listen(port, "127.0.0.1", () => {
    console.log("[Bustly OAuth] OAuth callback server listening on http://127.0.0.1:" + port);
  });

  oauthServer.on("error", (err: Error) => {
    console.error("[Bustly OAuth] OAuth server error:", err);
  });

  return port;
}

/**
 * Stop the OAuth callback HTTP server
 */
export function stopOAuthCallbackServer(): void {
  if (oauthServer) {
    console.log("[Bustly OAuth] Stopping OAuth callback server...");
    oauthServer.close(() => {
      console.log("[Bustly OAuth] OAuth callback server stopped");
    });
    oauthServer = null;
  }
}

export function cancelOAuthFlow(): void {
  if (oauthPromptResolver) {
    oauthPromptResolver("");
    oauthPromptResolver = null;
  }
  stopOAuthCallbackServer();
}

/**
 * Token exchange API response format
 */
export type BustlyTokenApiResponse = {
  code: string;
  message: string;
  status: string;
  data: {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresIn: number;
    workspaceId: string;
    userId: string;
    userName: string;
    userEmail: string;
    extras?: {
      "bustly-search-data"?: {
        search_DATA_TOKEN: string;
        search_DATA_SUPABASE_URL: string;
        search_DATA_SUPABASE_ANON_KEY: string;
        search_DATA_WORKSPACE_ID: string;
      };
      supabase_session?: {
        access_token: string;
      };
    };
    skills?: string[];
  };
};

/**
 * Exchange authorization code for access token
 * Returns the full API response including extras field
 */
export async function exchangeToken(code: string): Promise<BustlyTokenApiResponse> {
  console.log("[Bustly OAuth] Exchanging authorization code for access token");
  console.log("[Bustly OAuth] Auth code:", code.substring(0, 10) + "...");

  const clientId = process.env.BUSTLY_CLIENT_ID ?? "openclaw-desktop";
  console.log("[Bustly OAuth] Client ID:", clientId);

  const apiBaseUrl = process.env.BUSTLY_API_BASE_URL;
  if (!apiBaseUrl) {
    throw new Error(
      "Bustly OAuth configuration not found. Please set BUSTLY_API_BASE_URL environment variable.",
    );
  }
  const apiEndpoint = `${apiBaseUrl.replace(/\/+$/, "")}/api/oauth/getToken`;
  console.log("[Bustly OAuth] API endpoint:", apiEndpoint);

  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: code,
      client_id: clientId,
      grant_type: "authorization_code",
    }),
  });

  console.log("[Bustly OAuth] Response status:", response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Bustly OAuth] Failed:", response.status, errorText);
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const apiResponse = (await response.json()) as BustlyTokenApiResponse;

  console.log(
    "[Bustly OAuth] API response - code:",
    apiResponse.code,
    "status:",
    apiResponse.status,
    "message:",
    apiResponse.message,
  );

  // Check API response: status must be "0" for success
  if (apiResponse.status !== "0") {
    console.error(
      "[Bustly OAuth] API returned error status:",
      apiResponse.status,
      "-",
      apiResponse.message,
    );
    throw new Error(apiResponse.message || "Token exchange failed");
  }

  console.log("[Bustly OAuth] Token exchange successful!");
  console.log("   User:", apiResponse.data.userName);
  console.log("   Email:", apiResponse.data.userEmail);
  console.log("   Workspace:", apiResponse.data.workspaceId);
  console.log("   Has extras:", !!apiResponse.data.extras);

  return apiResponse;
}

// ============================================================================
// Provider OAuth (OpenAI, Google, etc.)
// ============================================================================

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
    defaultModel: "google-antigravity/gemini-3-pro-high",
    envKey: "GOOGLE_OAUTH",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    authMethods: [
      { id: "api_key", label: "API Key", kind: "api_key" as AuthMethodKind },
    ],
    defaultModel: "openrouter/minimax/minimax-m2.1",
    envKey: "OPENROUTER_API_KEY",
    isDev: true,
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    authMethods: [
      { id: "api_key", label: "API Key", kind: "api_key" as AuthMethodKind },
    ],
    defaultModel: "anthropic/claude-opus-4-5",
    envKey: "ANTHROPIC_API_KEY",
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
        defaultModel: "google-antigravity/gemini-3-pro-high",
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
  const randomValues = new Uint8Array(16);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (b) => b.toString(16).padStart(2, "0")).join("");
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
