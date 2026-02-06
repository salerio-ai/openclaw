/**
 * Bustly OAuth state management
 * Manages login state using $OPENCLAW_STATE_DIR/bustlyOauth.json
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import * as os from "node:os";
import type { BustlyOAuthState, BustlySearchDataConfig } from "../../../../src/config/types.base.js";

function resolveUserPath(input: string, homeDir: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("~")) {
    return resolve(trimmed.replace(/^~(?=$|[\\/])/, homeDir));
  }
  return resolve(trimmed);
}

function resolveStateDir(): string {
  const homeDir = os.homedir();
  const override = process.env.OPENCLAW_STATE_DIR?.trim();
  if (override) {
    return resolveUserPath(override, homeDir);
  }
  return resolve(homeDir, ".bustly");
}

const OPENCLAW_OAUTH_FILE = resolve(resolveStateDir(), "bustlyOauth.json");
const DEFAULT_CALLBACK_PORT = 18790;
const SESSION_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes for auth code
const DEFAULT_TOKEN_EXPIRY_MS = 7200 * 1000; // 2 hours for access token

/**
 * Ensure state directory exists
 */
function ensureConfigDir(): void {
  const dir = resolveStateDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Generate device ID for OAuth
 */
function generateDeviceId(): string {
  const hostname = os.hostname();
  // Generate a persistent device ID based on hostname
  const randomPart = Buffer.from(hostname).toString("base64").slice(0, 16);
  return Buffer.from(`${hostname}-${randomPart}`).toString("base64");
}

/**
 * Read Bustly OAuth state from file
 */
export function readBustlyOAuthState(): BustlyOAuthState | null {
  try {
    if (!existsSync(OPENCLAW_OAUTH_FILE)) {
      return null;
    }
    const content = readFileSync(OPENCLAW_OAUTH_FILE, "utf-8");
    return JSON.parse(content) as BustlyOAuthState;
  } catch (error) {
    console.error("[BustlyOAuth] Failed to read state:", error);
    return null;
  }
}

/**
 * Write Bustly OAuth state to file
 */
export function writeBustlyOAuthState(state: BustlyOAuthState): void {
  try {
    ensureConfigDir();
    writeFileSync(OPENCLAW_OAUTH_FILE, JSON.stringify(state, null, 2), "utf-8");
    console.log("[BustlyOAuth] State saved to", OPENCLAW_OAUTH_FILE);
  } catch (error) {
    console.error("[BustlyOAuth] Failed to write state:", error);
    throw error;
  }
}

/**
 * Check if user is logged in
 * Login state is determined by either:
 * 1. Presence of Supabase access token in search data config (new format)
 * 2. Presence of user info (old format, for backward compatibility)
 */
export function isBustlyLoggedIn(): boolean {
  const state = readBustlyOAuthState();
  // Check for new format (supabase access token in search data) or old format (user exists)
  return !!state?.bustlySearchData?.SEARCH_DATA_SUPABASE_ACCESS_TOKEN || !!state?.user;
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
 * Initialize OAuth flow - create state with login trace ID
 */
export function initBustlyOAuthFlow(port?: number): BustlyOAuthState {
  // Clear any existing state first
  clearBustlyOAuthState();

  const loginTraceId = generateLoginTraceId();
  const callbackPort = port ?? DEFAULT_CALLBACK_PORT;
  const deviceId = generateDeviceId();

  const state: BustlyOAuthState = {
    loginTraceId,
    deviceId,
    callbackPort,
    expiresAt: Date.now() + SESSION_EXPIRY_MS,
  };

  writeBustlyOAuthState(state);
  return state;
}

/**
 * Generate a login trace ID for tracking the login flow
 * Returns a UUID v4 format string
 */
export function generateLoginTraceId(): string {
  return crypto.randomUUID();
}

/**
 * Update state with authorization code (callback received)
 */
export function setBustlyAuthCode(code: string): void {
  const state = readBustlyOAuthState();
  if (!state) {
    throw new Error("[BustlyOAuth] No active OAuth flow found");
  }

  state.authCode = code;
  state.expiresAt = Date.now() + SESSION_EXPIRY_MS;
  writeBustlyOAuthState(state);
}

/**
 * Get stored authorization code (for token exchange)
 */
export function getBustlyAuthCode(): string | null {
  const state = readBustlyOAuthState();
  if (!state || !state.authCode) {
    return null;
  }
  // Check expiry
  if (Date.now() > state.expiresAt) {
    clearBustlyOAuthState();
    return null;
  }
  return state.authCode;
}

/**
 * Complete login - store user info and search data config
 * All configuration is stored in bustlyOauth.json
 * Supabase access token is stored within bustlySearchData.SEARCH_DATA_SUPABASE_ACCESS_TOKEN
 */
export function completeBustlyLogin(params: {
  user: {
    userId: string;
    userName: string;
    userEmail: string;
    workspaceId: string;
    skills: string[];
  };
  bustlySearchData?: BustlySearchDataConfig;
}): void {
  const state = readBustlyOAuthState();
  if (!state) {
    throw new Error("[BustlyOAuth] No active OAuth flow found");
  }

  // Update state with user info and search data config
  state.user = params.user;
  state.bustlySearchData = params.bustlySearchData;
  state.loggedInAt = Date.now();

  // Clear transient fields
  delete state.authCode;
  delete state.expiresAt;

  writeBustlyOAuthState(state);
  console.log("[BustlyOAuth] Login completed for user:", params.user.userEmail);
}

/**
 * Logout / clear OAuth state
 */
export function logoutBustly(): void {
  clearBustlyOAuthState();
  console.log("[BustlyOAuth] Logged out");
}

/**
 * Clear OAuth state file
 */
export function clearBustlyOAuthState(): void {
  try {
    if (existsSync(OPENCLAW_OAUTH_FILE)) {
      unlinkSync(OPENCLAW_OAUTH_FILE);
      console.log("[BustlyOAuth] State cleared");
    }
  } catch (error) {
    console.error("[BustlyOAuth] Failed to clear state:", error);
  }
}

/**
 * Get callback port from state or default
 */
export function getBustlyCallbackPort(): number {
  const state = readBustlyOAuthState();
  return state?.callbackPort ?? DEFAULT_CALLBACK_PORT;
}
