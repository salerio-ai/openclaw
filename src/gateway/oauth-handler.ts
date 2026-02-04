/**
 * OAuth handler for Salerio login integration
 * Handles login callbacks from Salerio and token exchange
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import type { OpenClawConfig, SalerioOAuthConfig } from "../config/types.js";
import type { OAuthSessionData, OAuthTokenResponse } from "./oauth-types.js";
import { loadConfig, writeConfigFile } from "../config/io.js";

// In-memory storage for OAuth sessions (will be lost on restart, but that's acceptable for auth flow)
const oauthSessions = new Map<string, OAuthSessionData>();

/**
 * Load Salerio OAuth config from environment variables
 */
function loadSalerioConfig(): SalerioOAuthConfig {
  const apiBaseUrl = process.env.SALERIO_API_BASE_URL;
  const webBaseUrl = process.env.SALERIO_WEB_BASE_URL;
  const clientId = process.env.SALERIO_CLIENT_ID;

  if (!apiBaseUrl || !webBaseUrl || !clientId) {
    throw new Error(
      "Salerio OAuth configuration not found. Please set SALERIO_API_BASE_URL, SALERIO_WEB_BASE_URL, and SALERIO_CLIENT_ID environment variables in your .env file.",
    );
  }

  return {
    apiBaseUrl,
    webBaseUrl,
    clientId,
  };
}

function getDeviceId(): string {
  // Generate a device ID from hostname and a random component
  const hostname = os.hostname();
  const randomId = crypto.randomBytes(8).toString("hex");
  return crypto.createHash("sha256").update(`${hostname}-${randomId}`).digest("hex");
}

/**
 * Generate a login trace ID for tracking the login flow
 */
export function generateLoginTraceId(): string {
  return crypto.randomUUID();
}

/**
 * Generate the login URL for opening in browser
 */
export function generateLoginUrl(
  loginTraceId: string,
  redirectUri: string,
  config?: SalerioOAuthConfig,
): string {
  // Load config from file if not provided
  const salerioConfig = config ?? loadSalerioConfig();

  const deviceId = getDeviceId();
  console.log("[OAuth handler] generateLoginUrl - loginTraceId:", loginTraceId);
  console.log("[OAuth handler] generateLoginUrl - deviceId:", deviceId);
  console.log("[OAuth handler] generateLoginUrl - redirectUri:", redirectUri);
  console.log("[OAuth handler] generateLoginUrl - apiBaseUrl:", salerioConfig.apiBaseUrl);
  console.log("[OAuth handler] generateLoginUrl - webBaseUrl:", salerioConfig.webBaseUrl);
  console.log("[OAuth handler] generateLoginUrl - clientId:", salerioConfig.clientId);

  // Build the OAuth URL with all the parameters (only one layer of redirect)
  const params = new URLSearchParams({
    client_id: salerioConfig.clientId,
    redirect_uri: redirectUri,
    device_id: deviceId,
    login_trace_id: loginTraceId,
  });

  // Direct URL with all parameters - no nested redirect
  const loginUrl = `${salerioConfig.webBaseUrl}/admin/auth?${params.toString()}`;

  // Store session data
  const sessionData: OAuthSessionData = {
    login_trace_id: loginTraceId,
    device_id: deviceId,
    expires_at: Date.now() + 5 * 60 * 1000, // 5 minutes
  };
  oauthSessions.set(loginTraceId, sessionData);
  console.log("[OAuth handler] Session stored:", loginTraceId);

  console.log("[OAuth handler] Final loginUrl:", loginUrl);
  return loginUrl;
}

/**
 * Handle the OAuth callback from Salerio
 * GET /authorize?code=xxx&state=xxx
 */
export async function handleOAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { config: Pick<OpenClawConfig, "gateway"> },
): Promise<boolean> {
  console.log("=".repeat(60));
  console.log("🔐 [OAuth Callback] Received OAuth callback request");
  console.log("=".repeat(60));

  const urlRaw = req.url;
  if (!urlRaw) {
    console.log("❌ [OAuth Callback] No URL in request");
    return false;
  }

  const gatewayPort = opts.config.gateway?.port ?? 18789;
  const url = new URL(urlRaw, `http://localhost:${gatewayPort}`);
  console.log(`📍 [OAuth Callback] Pathname: ${url.pathname}`);
  console.log(`🔍 [OAuth Callback] Full URL: ${url.href}`);

  // Check if this is an OAuth callback
  if (url.pathname !== "/authorize") {
    console.log(`⏭️  [OAuth Callback] Not an OAuth callback, skipping pathname: ${url.pathname}`);
    return false;
  }

  console.log("✅ [OAuth Callback] Successfully detected /authorize endpoint!");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  console.log(
    `🔑 [OAuth Callback] Authorization Code: ${code ? code.substring(0, 10) + "..." : "MISSING"}`,
  );
  console.log(`🆔 [OAuth Callback] State (loginTraceId): ${state}`);

  if (!code) {
    console.log("❌ [OAuth Callback] Missing authorization code - rendering error page");
    // Render error page
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>登录失败</title>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; }
          h1 { color: #e74c3c; }
        </style>
      </head>
      <body>
        <h1>❌ 登录失败</h1>
        <p>缺少授权码，请重试。</p>
      </body>
      </html>
    `);
    return true;
  }

  // Store the code for the UI to pick up
  const sessionKey = state ?? "default";
  console.log(`📦 [OAuth Callback] Session key: ${sessionKey}`);

  const session = oauthSessions.get(sessionKey);
  console.log(`📦 [OAuth Callback] Existing session found: ${!!session}`);

  if (session) {
    session.code = code;
    session.expires_at = Date.now() + 5 * 60 * 1000; // Extend to 5 more minutes
    oauthSessions.set(sessionKey, session);
    console.log("✅ [OAuth Callback] Updated existing session with authorization code");
  } else {
    // Create a new session with the code
    const newSession: OAuthSessionData = {
      login_trace_id: sessionKey,
      device_id: getDeviceId(),
      code: code,
      expires_at: Date.now() + 5 * 60 * 1000,
    };
    oauthSessions.set(sessionKey, newSession);
    console.log("✅ [OAuth Callback] Created new session with authorization code");
  }

  console.log(
    `📋 [OAuth Callback] Active sessions: ${Array.from(oauthSessions.keys()).join(", ")}`,
  );
  console.log("⏳ [OAuth Callback] Waiting for frontend to poll for authorization code...");

  // Render success page
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>登录成功</title>
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
        <h1>✅ 登录成功</h1>
        <p>正在完成配置，请稍候...</p>
        <div class="spinner"></div>
        <p style="font-size: 14px; color: #999;">您可以关闭此页面并返回 OpenClaw 桌面应用</p>
      </div>
      <script>
        // Try to close after 3 seconds
        setTimeout(() => window.close(), 3000);
      </script>
    </body>
    </html>
  `);

  console.log("✅ [OAuth Callback] Success page rendered, callback handled successfully");
  console.log("=".repeat(60));

  return true;
}

/**
 * Exchange authorization code for access token
 */
/**
 * New API Token response format from http://127.0.0.1:8080/api/oauth/getToken
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
    skills: string[];
  };
};

export async function exchangeToken(code: string): Promise<OAuthTokenResponse> {
  console.log("🔄 [Token Exchange] Exchanging authorization code for access token");
  console.log(`🔑 [Token Exchange] Auth code: ${code.substring(0, 10)}...`);

  // Load client_id from environment
  const clientId = process.env.SALERIO_CLIENT_ID ?? "openclaw-desktop";
  console.log(`🔑 [Token Exchange] Client ID: ${clientId}`);

  // Use new API endpoint: http://127.0.0.1:8080/api/oauth/getToken
  const apiEndpoint = "http://127.0.0.1:8080/api/oauth/getToken";
  console.log(`🌐 [Token Exchange] API endpoint: ${apiEndpoint}`);

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

  console.log(`📡 [Token Exchange] Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ [Token Exchange] Failed: ${response.status} ${errorText}`);
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const apiResponse = (await response.json()) as BustlyTokenApiResponse;

  console.log(
    `📋 [Token Exchange] API response - code: ${apiResponse.code}, status: ${apiResponse.status}, message: ${apiResponse.message}`,
  );

  // Check API response: status must be "0" for success
  if (apiResponse.status !== "0") {
    console.error(
      `❌ [Token Exchange] API returned error status: ${apiResponse.status} - ${apiResponse.message}`,
    );
    throw new Error(apiResponse.message || "Token exchange failed");
  }

  // Map new API format to OAuthTokenResponse format
  const tokenResponse: OAuthTokenResponse = {
    access_token: apiResponse.data.accessToken,
    refresh_token: apiResponse.data.refreshToken,
    token_type: apiResponse.data.tokenType,
    expires_in: apiResponse.data.expiresIn,
    workspace_id: apiResponse.data.workspaceId,
    user_id: apiResponse.data.userId,
    user_name: apiResponse.data.userName,
    user_email: apiResponse.data.userEmail,
    skills: apiResponse.data.skills,
  };

  console.log("✅ [Token Exchange] Token exchange successful!");
  console.log(`   👤 User: ${tokenResponse.user_name}`);
  console.log(`   📧 Email: ${tokenResponse.user_email}`);
  console.log(`   🏢 Workspace: ${tokenResponse.workspace_id}`);
  console.log(`   🛠️  Skills: ${tokenResponse.skills.join(", ")}`);

  return tokenResponse;
}

/**
 * Get stored authorization code by trace ID
 */
export function getStoredCode(traceId: string): string | undefined {
  console.log("[OAuth handler] getStoredCode called for traceId:", traceId);
  const session = oauthSessions.get(traceId);
  console.log("[OAuth handler] Found session:", !!session);
  if (session) {
    console.log("[OAuth handler] Session expired:", Date.now() > session.expires_at);
    console.log("[OAuth handler] Session has code:", !!session.code);
  }
  if (!session || Date.now() > session.expires_at) {
    console.log("[OAuth handler] Session expired or not found, deleting");
    oauthSessions.delete(traceId);
    return undefined;
  }
  console.log("[OAuth handler] Returning code");
  return session.code;
}

/**
 * Clear stored session
 */
export function clearSession(traceId: string): void {
  console.log("[OAuth handler] clearSession called for traceId:", traceId);
  oauthSessions.delete(traceId);
  console.log("[OAuth handler] Remaining sessions:", Array.from(oauthSessions.keys()));
}

/**
 * Write token configuration to ~/.openclaw/openclaw.json
 */
export async function writeTokenConfig(tokenResponse: OAuthTokenResponse): Promise<void> {
  console.log("=".repeat(60));
  console.log("💾 [Config Write] Writing OAuth tokens to config file");
  console.log("=".repeat(60));

  const currentConfig = loadConfig();
  console.log(
    `📁 [Config Write] Current config has ${Object.keys(currentConfig.skills?.entries ?? {}).length} skill entries`,
  );

  // Generate random values for Supabase config (placeholder)
  const randomSupabaseUrl = `https://xxx-${crypto.randomBytes(4).toString("hex")}.supabase.co`;
  const randomSupabaseKey = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${crypto.randomBytes(32).toString("base64")}`;

  const updatedConfig: Partial<OpenClawConfig> = {
    ...currentConfig,
    skills: {
      ...currentConfig.skills,
      entries: {
        ...currentConfig.skills?.entries,
        "bustly-search-data": {
          enabled: true,
          env: {
            SEARCH_DATA_SUPABASE_URL: randomSupabaseUrl,
            SEARCH_DATA_SUPABASE_ANON_KEY: randomSupabaseKey,
            SEARCH_DATA_TOKEN: tokenResponse.access_token,
            SEARCH_DATA_WORKSPACE_ID: tokenResponse.workspace_id,
          },
        },
      },
    },
  };

  console.log("📝 [Config Write] Updated configuration:");
  console.log(`   ✅ bustly-search-data skill enabled`);
  console.log(`   🔑 Workspace ID: ${tokenResponse.workspace_id}`);
  console.log(`   🔑 Access Token: ${tokenResponse.access_token.substring(0, 20)}...`);
  console.log(`   👤 User: ${tokenResponse.user_name} (${tokenResponse.user_email})`);
  console.log(`   🛠️  Available skills: ${tokenResponse.skills.join(", ")}`);

  console.log("💾 [Config Write] Writing to ~/.openclaw/openclaw.json...");
  await writeConfigFile(updatedConfig as OpenClawConfig);

  console.log("✅ [Config Write] Config file written successfully!");
  console.log("🎉 [OAuth Login] Salerio OAuth login flow completed!");
  console.log("=".repeat(60));
}
