/**
 * OAuth request handlers for Bustly integration
 */

import { randomBytes } from "node:crypto";
import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "./types.js";
import * as BustlyOAuth from "../../bustly-oauth.js";

// In-memory OAuth state storage (for pending logins)
const pendingOAuthLogins = new Map<string, { expiresAt: number }>();

/**
 * Get OAuth callback port from environment or default
 */
function getOAuthCallbackPort(): number {
  const port = process.env.BUSTLY_OAUTH_CALLBACK_PORT
    ? parseInt(process.env.BUSTLY_OAUTH_CALLBACK_PORT, 10)
    : 18790;
  return port;
}

/**
 * Generate a random trace ID for OAuth login
 */
function generateTraceId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Initiate Bustly OAuth login flow
 */
export const oauthLogin: GatewayRequestHandler = async ({
  respond,
}: Pick<GatewayRequestHandlerOptions, "respond">) => {
  try {
    // Load environment variables for OAuth configuration
    const apiBaseUrl = process.env.BUSTLY_API_BASE_URL;
    const webBaseUrl = process.env.BUSTLY_WEB_BASE_URL;
    const clientId = process.env.BUSTLY_CLIENT_ID;

    if (!apiBaseUrl || !webBaseUrl || !clientId) {
      respond(false, undefined, {
        code: "OAUTH_ERROR",
        message:
          "Bustly OAuth configuration not found. Please set BUSTLY_API_BASE_URL, BUSTLY_WEB_BASE_URL, and BUSTLY_CLIENT_ID environment variables.",
      });
      return;
    }

    // Read current OAuth state to get device ID
    const currentState = BustlyOAuth.readBustlyOAuthState();
    const deviceId = currentState?.deviceId ?? generateTraceId();

    // Generate login trace ID
    const loginTraceId = generateTraceId();

    // Build OAuth login URL
    const redirectUri = `http://127.0.0.1:${getOAuthCallbackPort()}/authorize`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      device_id: deviceId,
      login_trace_id: loginTraceId,
    });
    const loginUrl = `${webBaseUrl}/admin/auth?${params.toString()}`;

    // Store pending login state
    pendingOAuthLogins.set(loginTraceId, {
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    // Initialize OAuth state with login trace ID
    BustlyOAuth.initBustlyOAuthFlow();
    BustlyOAuth.updateBustlyOAuthState({ loginTraceId });

    respond(true, { loginUrl, loginTraceId }, undefined);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    respond(false, undefined, {
      code: "OAUTH_ERROR",
      message: `Failed to initiate login: ${errorMsg}`,
    });
  }
};

/**
 * Poll for OAuth login completion
 */
export const oauthPoll: GatewayRequestHandler = async ({
  params,
  respond,
}: Pick<GatewayRequestHandlerOptions, "params" | "respond">) => {
  try {
    const loginTraceId = params?.loginTraceId as string | undefined;

    if (!loginTraceId) {
      respond(false, undefined, {
        code: "OAUTH_ERROR",
        message: "Missing loginTraceId parameter",
      });
      return;
    }

    // Check if pending login exists
    const pendingLogin = pendingOAuthLogins.get(loginTraceId);
    if (!pendingLogin) {
      // Login might have already completed, check current state
      const isLoggedIn = BustlyOAuth.isBustlyLoggedIn();
      respond(true, { pending: !isLoggedIn }, undefined);
      return;
    }

    // Check if login has expired
    if (Date.now() > pendingLogin.expiresAt) {
      pendingOAuthLogins.delete(loginTraceId);
      respond(false, undefined, {
        code: "OAUTH_ERROR",
        message: "Login session expired",
      });
      return;
    }

    // Check if user is now logged in
    const isLoggedIn = BustlyOAuth.isBustlyLoggedIn();

    // If logged in, clear pending state
    if (isLoggedIn) {
      pendingOAuthLogins.delete(loginTraceId);
    }

    respond(true, { pending: !isLoggedIn }, undefined);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    respond(false, undefined, {
      code: "OAUTH_ERROR",
      message: `Failed to poll login status: ${errorMsg}`,
    });
  }
};

/**
 * Check if user is logged in to Bustly
 */
export const oauthIsLoggedIn: GatewayRequestHandler = async ({
  respond,
}: Pick<GatewayRequestHandlerOptions, "respond">) => {
  try {
    const loggedIn = BustlyOAuth.isBustlyLoggedIn();
    respond(true, { loggedIn }, undefined);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    respond(false, undefined, {
      code: "OAUTH_ERROR",
      message: `Failed to check login status: ${errorMsg}`,
    });
  }
};

/**
 * Get current Bustly user info
 */
export const oauthGetUserInfo: GatewayRequestHandler = async ({
  respond,
}: Pick<GatewayRequestHandlerOptions, "respond">) => {
  try {
    const userInfo = BustlyOAuth.getBustlyUserInfo();
    respond(true, { user: userInfo }, undefined);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    respond(false, undefined, {
      code: "OAUTH_ERROR",
      message: `Failed to get user info: ${errorMsg}`,
    });
  }
};

/**
 * Logout from Bustly
 */
export const oauthLogout: GatewayRequestHandler = async ({
  respond,
}: Pick<GatewayRequestHandlerOptions, "respond">) => {
  try {
    BustlyOAuth.logoutBustly();
    respond(true, { success: true }, undefined);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    respond(false, undefined, {
      code: "OAUTH_ERROR",
      message: `Failed to logout: ${errorMsg}`,
    });
  }
};

export const oauthHandlers = {
  "oauth.login": oauthLogin,
  "oauth.poll": oauthPoll,
  "oauth.is-logged-in": oauthIsLoggedIn,
  "oauth.get-user-info": oauthGetUserInfo,
  "oauth.logout": oauthLogout,
};
