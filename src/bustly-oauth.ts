/**
 * Bustly OAuth state management (shared between gateway and Electron main process)
 * Manages login state using ~/.openclaw/bustlyOauth.json
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import * as os from "node:os";
import { resolve } from "node:path";

const BUSTLY_OAUTH_FILE = resolve(os.homedir(), ".openclaw", "bustlyOauth.json");

export type BustlyUserInfo = {
  userId: string;
  userName: string;
  userEmail: string;
  workspaceId: string;
  skills: string[];
};

export type BustlyOAuthState = {
  loginTraceId?: string;
  deviceId: string;
  callbackPort: number;
  authCode?: string;
  expiresAt?: number;
  user?: BustlyUserInfo;
  supabaseAccessToken?: string;
  loggedInAt?: number;
};

/**
 * Ensure ~/.openclaw directory exists
 */
function ensureConfigDir(): void {
  const dir = resolve(os.homedir(), ".openclaw");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Generate a random device ID
 */
function generateDeviceId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Get default callback port
 */
function getDefaultCallbackPort(): number {
  const port = process.env.BUSTLY_OAUTH_CALLBACK_PORT
    ? parseInt(process.env.BUSTLY_OAUTH_CALLBACK_PORT, 10)
    : 18790;
  return port;
}

/**
 * Initialize OAuth flow with device ID
 */
export function initBustlyOAuthFlow(): void {
  ensureConfigDir();

  const existingState = readBustlyOAuthState();
  const deviceId = existingState?.deviceId ?? generateDeviceId();
  const callbackPort = existingState?.callbackPort ?? getDefaultCallbackPort();

  const newState: BustlyOAuthState = {
    ...(existingState ?? { callbackPort }),
    deviceId,
    callbackPort,
  };

  writeBustlyOAuthState(newState);
  console.log("[BustlyOAuth] Initialized OAuth flow with device ID:", deviceId);
}

/**
 * Update OAuth state with new data
 */
export function updateBustlyOAuthState(updates: Partial<BustlyOAuthState>): void {
  const currentState = readBustlyOAuthState();
  if (!currentState) {
    console.warn("[BustlyOAuth] Cannot update state: no existing state");
    return;
  }

  const newState: BustlyOAuthState = {
    ...currentState,
    ...updates,
  };

  writeBustlyOAuthState(newState);
}

/**
 * Set authorization code after callback
 */
export function setBustlyAuthCode(code: string): void {
  updateBustlyOAuthState({ authCode: code });
  console.log("[BustlyOAuth] Authorization code set");
}

/**
 * Write OAuth state to file
 */
function writeBustlyOAuthState(state: BustlyOAuthState): void {
  try {
    ensureConfigDir();
    writeFileSync(BUSTLY_OAUTH_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    console.error("[BustlyOAuth] Failed to write state:", error);
  }
}

/**
 * Read Bustly OAuth state from file
 */
export function readBustlyOAuthState(): BustlyOAuthState | null {
  try {
    if (!existsSync(BUSTLY_OAUTH_FILE)) {
      return null;
    }
    const content = readFileSync(BUSTLY_OAUTH_FILE, "utf-8");
    return JSON.parse(content) as BustlyOAuthState;
  } catch (error) {
    console.error("[BustlyOAuth] Failed to read state:", error);
    return null;
  }
}

/**
 * Check if user is logged in
 */
export function isBustlyLoggedIn(): boolean {
  const state = readBustlyOAuthState();
  // Check for new format (supabaseAccessToken) or old format (user exists)
  return !!state?.supabaseAccessToken || !!state?.user;
}

/**
 * Get current logged-in user info
 */
export function getBustlyUserInfo(): BustlyUserInfo | null {
  const state = readBustlyOAuthState();
  if (!isBustlyLoggedIn()) {
    return null;
  }
  return state?.user ?? null;
}

/**
 * Logout / clear OAuth state
 */
export function logoutBustly(): void {
  clearBustlyOAuthState();
  console.log("[BustlyOAuth] Logged out");
}

/**
 * Complete login - store user info and Supabase access token
 * This is the final step after successful token exchange
 */
export function completeBustlyLogin(params: {
  user: BustlyUserInfo;
  supabaseAccessToken: string;
}): void {
  const currentState = readBustlyOAuthState();
  if (!currentState) {
    // Create new state if none exists
    const callbackPort = getDefaultCallbackPort();
    const newState: BustlyOAuthState = {
      deviceId: generateDeviceId(),
      callbackPort,
      user: params.user,
      supabaseAccessToken: params.supabaseAccessToken,
      loggedInAt: Date.now(),
    };
    writeBustlyOAuthState(newState);
    console.log("[BustlyOAuth] Login completed for user:", params.user.userEmail);
    return;
  }

  // Update existing state
  const newState: BustlyOAuthState = {
    ...currentState,
    user: params.user,
    supabaseAccessToken: params.supabaseAccessToken,
    loggedInAt: Date.now(),
    // Clear transient fields
    authCode: undefined,
    expiresAt: undefined,
  };
  writeBustlyOAuthState(newState);
  console.log("[BustlyOAuth] Login completed for user:", params.user.userEmail);
}

/**
 * Clear OAuth state file
 */
function clearBustlyOAuthState(): void {
  try {
    if (existsSync(BUSTLY_OAUTH_FILE)) {
      unlinkSync(BUSTLY_OAUTH_FILE);
      console.log("[BustlyOAuth] State cleared");
    }
  } catch (error) {
    console.error("[BustlyOAuth] Failed to clear state:", error);
  }
}
