/**
 * Bustly OAuth state management (shared between gateway and Electron main process)
 * Manages login state using ~/.bustly/bustlyOauth.json
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import * as os from "node:os";
import { resolve } from "node:path";
import type {
  BustlyOAuthState,
  BustlySearchDataConfig,
  BustlySupabaseConfig,
} from "./config/types.base.js";

const BUSTLY_OAUTH_FILE = resolve(os.homedir(), ".bustly", "bustlyOauth.json");

export type { BustlyOAuthState, BustlySearchDataConfig, BustlySupabaseConfig };

/**
 * Ensure ~/.bustly directory exists
 */
function ensureConfigDir(): void {
  const dir = resolve(os.homedir(), ".bustly");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function migrateLegacyOAuthState(state: BustlyOAuthState): BustlyOAuthState {
  const nextState: BustlyOAuthState = {
    ...state,
    user: state.user ? { ...state.user } : undefined,
    supabase: state.supabase ? { ...state.supabase } : undefined,
  };
  const legacySearchData = state.bustlySearchData;
  const legacyAccessToken = legacySearchData?.SEARCH_DATA_SUPABASE_ACCESS_TOKEN?.trim() ?? "";
  const legacyWorkspaceId = legacySearchData?.SEARCH_DATA_WORKSPACE_ID?.trim() ?? "";
  const legacySupabaseUrl = legacySearchData?.SEARCH_DATA_SUPABASE_URL?.trim() ?? "";
  const legacySupabaseAnonKey = legacySearchData?.SEARCH_DATA_SUPABASE_ANON_KEY?.trim() ?? "";
  const currentAccessToken = nextState.user?.userAccessToken?.trim() ?? "";
  const currentWorkspaceId = nextState.user?.workspaceId?.trim() ?? "";
  if (nextState.user && !currentAccessToken && legacyAccessToken) {
    nextState.user.userAccessToken = legacyAccessToken;
  }
  if (nextState.user && !currentWorkspaceId && legacyWorkspaceId) {
    nextState.user.workspaceId = legacyWorkspaceId;
  }
  if (!nextState.supabase && (legacySupabaseUrl || legacySupabaseAnonKey)) {
    nextState.supabase = {
      url: legacySupabaseUrl,
      anonKey: legacySupabaseAnonKey,
    };
  } else if (nextState.supabase) {
    if (!nextState.supabase.url && legacySupabaseUrl) {
      nextState.supabase.url = legacySupabaseUrl;
    }
    if (!nextState.supabase.anonKey && legacySupabaseAnonKey) {
      nextState.supabase.anonKey = legacySupabaseAnonKey;
    }
  }
  delete nextState.bustlySearchData;
  return nextState;
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
    const parsed = JSON.parse(content) as BustlyOAuthState;
    const migrated = migrateLegacyOAuthState(parsed);
    if (JSON.stringify(migrated) !== JSON.stringify(parsed)) {
      writeFileSync(BUSTLY_OAUTH_FILE, JSON.stringify(migrated, null, 2), "utf-8");
      console.log("[BustlyOAuth] Migrated legacy bustlySearchData into user/supabase profile");
    }
    return migrated;
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
  // Single source of truth for gateway JWT.
  return Boolean(state?.user?.userAccessToken?.trim());
}

/**
 * Get current logged-in user info
 */
export function getBustlyUserInfo(): BustlyOAuthState["user"] | null {
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
  clearBustlyAuthData();
  console.log("[BustlyOAuth] Logged out");
}

/**
 * Complete login - store user info and canonical supabase config.
 * This is the final step after successful token exchange.
 */
export function completeBustlyLogin(params: {
  user: BustlyOAuthState["user"];
  supabase?: BustlySupabaseConfig;
}): void {
  const currentState = readBustlyOAuthState();
  if (!currentState) {
    // Create new state if none exists
    const callbackPort = getDefaultCallbackPort();
    const newState: BustlyOAuthState = {
      deviceId: generateDeviceId(),
      callbackPort,
      user: params.user,
      loggedInAt: Date.now(),
      supabase: params.supabase,
    };
    writeBustlyOAuthState(newState);
    console.log("[BustlyOAuth] Login completed for user:", params.user?.userEmail);
    return;
  }

  // Update existing state
  const newState: BustlyOAuthState = {
    ...currentState,
    user: params.user,
    loggedInAt: Date.now(),
    supabase: params.supabase,
    // Clear transient fields
    authCode: undefined,
    expiresAt: undefined,
  };
  delete newState.bustlySearchData;
  writeBustlyOAuthState(newState);
  console.log("[BustlyOAuth] Login completed for user:", params.user?.userEmail);
}

/**
 * Clear user + token info from OAuth state (preserves other fields).
 */
function clearBustlyAuthData(): void {
  const state = readBustlyOAuthState();
  if (!state) {
    return;
  }

  delete state.user;
  delete state.loggedInAt;

  writeBustlyOAuthState(state);
  console.log("[BustlyOAuth] Cleared token and user data");
}
