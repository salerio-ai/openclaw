/**
 * Supabase Configuration
 *
 * This file loads configuration settings from:
 * 1. $OPENCLAW_STATE_DIR/bustlyOauth.json (Bustly OAuth login state - preferred)
 * 2. OpenClaw-injected env vars (SKILL_NAME + PREFIX_*) - for OpenClaw sessions
 * 3. Environment variables (fallback)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Get skill root directory (parent of lib/)
const SKILL_ROOT = resolve(__dirname, '..');
// Get skill name from directory name
const SKILL_NAME = SKILL_ROOT.split('/').pop() || 'unknown';

// Helper to find env vars for this skill with flexible prefix matching
function findSkillEnvVars(prefix: string): Record<string, string> {
  const result: Record<string, string> = {};
  const env = process.env;

  for (const key of Object.keys(env)) {
    if (key.startsWith(prefix + '_') || key.startsWith(prefix.toUpperCase() + '_')) {
      const suffix = key.replace(/^[A-Z0-9_]+_/i, '');
      result[key] = env[key]!;
      result[suffix] = env[key]!;
    }
  }
  return result;
}

function resolveUserPath(input: string, homeDir: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith('~')) {
    return resolve(trimmed.replace(/^~(?=$|[\\/])/, homeDir));
  }
  return resolve(trimmed);
}

function resolveStateDir(): string {
  const homeDir = homedir();
  const override = process.env.OPENCLAW_STATE_DIR?.trim();
  if (override) {
    return resolveUserPath(override, homeDir);
  }
  return resolve(homeDir, '.bustly');
}

// First, try to read from bustlyOauth.json (Bustly OAuth login state)
let configFromBustlyOAuth: Record<string, string> | null = null;
try {
  const bustlyOauthPath = resolve(resolveStateDir(), 'bustlyOauth.json');
  if (existsSync(bustlyOauthPath)) {
    const bustlyOauth = JSON.parse(readFileSync(bustlyOauthPath, 'utf-8'));
    if (bustlyOauth.bustlySearchData) {
      configFromBustlyOAuth = {
        SEARCH_DATA_SUPABASE_URL: bustlyOauth.bustlySearchData.SEARCH_DATA_SUPABASE_URL || '',
        SEARCH_DATA_SUPABASE_ANON_KEY: bustlyOauth.bustlySearchData.SEARCH_DATA_SUPABASE_ANON_KEY || '',
        SEARCH_DATA_SUPABASE_ACCESS_TOKEN: bustlyOauth.bustlySearchData.SEARCH_DATA_SUPABASE_ACCESS_TOKEN || '',
        SEARCH_DATA_WORKSPACE_ID: bustlyOauth.bustlySearchData.SEARCH_DATA_WORKSPACE_ID || '',
      };
      console.log('Loaded configuration from $OPENCLAW_STATE_DIR/bustlyOauth.json');
    }
  }
} catch (err) {
  // Bustly OAuth config doesn't exist or is invalid
}

// If not found in bustlyOauth.json, try OpenClaw-injected env vars
let configFromEnv: Record<string, string> = {};
if (!configFromBustlyOAuth) {
  const prefixes = ['SEARCH_DATA', 'SUPABASE'];
  for (const prefix of prefixes) {
    const vars = findSkillEnvVars(prefix);
    configFromEnv = { ...configFromEnv, ...vars };
  }

  if (Object.keys(configFromEnv).length > 0) {
    configFromBustlyOAuth = configFromEnv;
    console.log('Loaded configuration from OpenClaw env vars');
  }
}

export const config = {
  supabaseUrl: configFromBustlyOAuth?.SEARCH_DATA_SUPABASE_URL || process.env.SEARCH_DATA_SUPABASE_URL || process.env.SUPABASE_URL,
  supabaseAnonKey: configFromBustlyOAuth?.SEARCH_DATA_SUPABASE_ANON_KEY || process.env.SEARCH_DATA_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
  supabaseToken: configFromBustlyOAuth?.SEARCH_DATA_SUPABASE_ACCESS_TOKEN || process.env.SEARCH_DATA_SUPABASE_ACCESS_TOKEN || process.env.SEARCH_DATA_TOKEN || process.env.SUPABASE_TOKEN,
  workspaceId: configFromBustlyOAuth?.SEARCH_DATA_WORKSPACE_ID || process.env.SEARCH_DATA_WORKSPACE_ID || process.env.WORKSPACE_ID,
};

export function validateConfig() {
  const missing: string[] = [];
  if (!config.supabaseUrl) missing.push('SEARCH_DATA_SUPABASE_URL');
  if (!config.supabaseAnonKey) missing.push('SEARCH_DATA_SUPABASE_ANON_KEY');
  if (!config.supabaseToken) missing.push('SEARCH_DATA_SUPABASE_ACCESS_TOKEN');

  if (missing.length > 0) {
    throw new Error(
      `Missing required Supabase configuration: ${missing.join(', ')}.\n` +
      `Please login via Bustly OAuth in the desktop app, or set these environment variables.`
    );
  }

  if (!config.workspaceId) {
    console.warn('Warning: SEARCH_DATA_WORKSPACE_ID not set. AliExpress account lookup will fail.');
  }
}
