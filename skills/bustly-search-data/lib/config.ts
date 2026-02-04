/**
 * Supabase Configuration
 *
 * This file loads configuration settings from:
 * 1. OpenClaw-injected env vars (SKILL_NAME + PREFIX_*) - for OpenClaw sessions
 * 2. ~/.openclaw/openclaw.json (preferred - OpenClaw global config)
 * 3. Environment variables (fallback)
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

// First, try OpenClaw-injected env vars (preferred - these come from openclaw.json's env)
let configFromEnv: Record<string, string> = {};
const prefixes = ['SEARCH_DATA', 'SUPABASE'];
for (const prefix of prefixes) {
  const vars = findSkillEnvVars(prefix);
  configFromEnv = { ...configFromEnv, ...vars };
}

let configFromOpenClaw: Record<string, string> | null = null;
if (Object.keys(configFromEnv).length > 0) {
  configFromOpenClaw = configFromEnv;
  console.log('Loaded configuration from OpenClaw env vars');
} else {
  // Fallback: read directly from openclaw.json
  try {
    const homeDir = process.env.HOME;
    if (!homeDir) {
      throw new Error('HOME environment variable is not set');
    }
    const openclawConfigPath = resolve(homeDir, '.openclaw/openclaw.json');
    const openclawConfig = JSON.parse(readFileSync(openclawConfigPath, 'utf-8'));
    
    // Try to find this skill's config (support both skill name formats)
    const skillKey = SKILL_NAME.replace(/-/g, '_');
    if (openclawConfig.skills?.entries?.[SKILL_NAME]?.env) {
      configFromOpenClaw = openclawConfig.skills.entries[SKILL_NAME].env;
      console.log(`Loaded configuration from ~/.openclaw/openclaw.json for skill: ${SKILL_NAME}`);
    } else if (openclawConfig.skills?.entries?.[skillKey]?.env) {
      configFromOpenClaw = openclawConfig.skills.entries[skillKey].env;
      console.log(`Loaded configuration from ~/.openclaw/openclaw.json for skill: ${skillKey}`);
    }
  } catch (err) {
    // Config file doesn't exist or is invalid
  }
}

export const config = {
  supabaseUrl: configFromOpenClaw?.SEARCH_DATA_SUPABASE_URL || process.env.SEARCH_DATA_SUPABASE_URL || process.env.SUPABASE_URL,
  supabaseAnonKey: configFromOpenClaw?.SEARCH_DATA_SUPABASE_ANON_KEY || process.env.SEARCH_DATA_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
  supabaseToken: configFromOpenClaw?.SEARCH_DATA_TOKEN || process.env.SEARCH_DATA_TOKEN || process.env.SUPABASE_TOKEN,
  workspaceId: configFromOpenClaw?.SEARCH_DATA_WORKSPACE_ID || process.env.SEARCH_DATA_WORKSPACE_ID || process.env.WORKSPACE_ID,
};

export function validateConfig() {
  const missing: string[] = [];
  if (!config.supabaseUrl) missing.push('SEARCH_DATA_SUPABASE_URL');
  if (!config.supabaseAnonKey) missing.push('SEARCH_DATA_SUPABASE_ANON_KEY');
  if (!config.supabaseToken) missing.push('SEARCH_DATA_TOKEN');

  if (missing.length > 0) {
    throw new Error(
      `Missing required Supabase configuration: ${missing.join(', ')}.\n` +
      `Please set these in ~/.openclaw/openclaw.json under skills.entries.${SKILL_NAME}.env`
    );
  }

  if (!config.workspaceId) {
    console.warn('Warning: SEARCH_DATA_WORKSPACE_ID not set. Some queries may require it.');
  }
}
