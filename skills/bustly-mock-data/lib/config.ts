/**
 * Configuration Management for Bustly Mock Data Skill
 *
 * Loads configuration from two sources:
 * 1. Base config (URL, workspace) from ~/.bustly/bustlyOauth.json (shared with bustly-search-data)
 * 2. Service role keys from config/supabase.json (mock data specific)
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SKILL_ROOT = resolve(__dirname, '..')

/**
 * Resolve user state directory
 */
function resolveStateDir(): string {
  const homeDir = homedir()
  const override = process.env.OPENCLAW_STATE_DIR?.trim()
  if (override) {
    return resolve(override.replace(/^~/, homeDir))
  }
  return resolve(homeDir, '.bustly')
}

/**
 * Load base configuration from Bustly OAuth
 * (shared with bustly-search-data)
 */
function loadBaseConfig(): Record<string, string> | null {
  try {
    const bustlyOauthPath = resolve(resolveStateDir(), 'bustlyOauth.json')
    if (!existsSync(bustlyOauthPath)) {
      return null
    }

    const bustlyOauth = JSON.parse(readFileSync(bustlyOauthPath, 'utf-8'))
    if (bustlyOauth.bustlySearchData) {
      console.log('✓ Loaded base configuration from ~/.bustly/bustlyOauth.json')
      return {
        SEARCH_DATA_SUPABASE_URL: bustlyOauth.bustlySearchData.SEARCH_DATA_SUPABASE_URL || '',
        SEARCH_DATA_SUPABASE_ANON_KEY: bustlyOauth.bustlySearchData.SEARCH_DATA_SUPABASE_ANON_KEY || '',
        SEARCH_DATA_SUPABASE_ACCESS_TOKEN: bustlyOauth.bustlySearchData.SEARCH_DATA_SUPABASE_ACCESS_TOKEN || '',
        SEARCH_DATA_WORKSPACE_ID: bustlyOauth.bustlySearchData.SEARCH_DATA_WORKSPACE_ID || '',
      }
    }
    return null
  } catch (err) {
    console.warn('Warning: Could not load bustlyOauth.json:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Load service role key configuration
 */
function loadServiceRoleConfig(): ServiceRoleConfig | null {
  const configPath = resolve(SKILL_ROOT, 'config', 'supabase.json')

  if (!existsSync(configPath)) {
    console.error('❌ Service role configuration not found')
    console.error(`   Expected: ${configPath}`)
    console.error('   Copy config/supabase.json.example to config/supabase.json and configure your keys')
    return null
  }

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    console.log('✓ Loaded service role configuration from config/supabase.json')
    return config
  } catch (err) {
    console.error('❌ Failed to parse config/supabase.json:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Get current environment from:
 * 1. Environment variable MOCK_DATA_ENV
 * 2. Config file defaultEnv
 * 3. Default to 'staging'
 */
function getCurrentEnvironment(config: ServiceRoleConfig): 'staging' | 'production' {
  const envVar = process.env.MOCK_DATA_ENV?.toLowerCase()
  if (envVar === 'staging' || envVar === 'production') {
    return envVar
  }
  return config.defaultEnv || 'staging'
}

// Load configurations
const baseConfig = loadBaseConfig()
const serviceRoleConfig = loadServiceRoleConfig()

if (!baseConfig) {
  throw new Error(
    'Missing base configuration. Please login via Bustly OAuth in the desktop app first.'
  )
}

if (!serviceRoleConfig) {
  throw new Error(
    'Missing service role configuration. See config/supabase.json.example for instructions.'
  )
}

const currentEnv = getCurrentEnvironment(serviceRoleConfig)
const envConfig = serviceRoleConfig[currentEnv]

if (!envConfig || !envConfig.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    `Service role key not configured for environment: ${currentEnv}. ` +
    `Please check config/supabase.json.`
  )
}

/**
 * Exported configuration
 */
export const config = {
  // Base config (from bustlyOauth.json)
  supabaseUrl: baseConfig.SEARCH_DATA_SUPABASE_URL,
  supabaseAnonKey: baseConfig.SEARCH_DATA_SUPABASE_ANON_KEY,
  supabaseToken: baseConfig.SEARCH_DATA_SUPABASE_ACCESS_TOKEN,
  workspaceId: baseConfig.SEARCH_DATA_WORKSPACE_ID,

  // Service role config (from config/supabase.json)
  serviceRoleKey: envConfig.SUPABASE_SERVICE_ROLE_KEY,
  supabaseUrl: envConfig.SUPABASE_URL || baseConfig.SEARCH_DATA_SUPABASE_URL,

  // Current environment
  env: currentEnv,
}

console.log(`✓ Using environment: ${currentEnv}`)

/**
 * Type definitions
 */
interface ServiceRoleConfig {
  staging?: {
    SUPABASE_SERVICE_ROLE_KEY: string
    SUPABASE_URL?: string
  }
  production?: {
    SUPABASE_SERVICE_ROLE_KEY: string
    SUPABASE_URL?: string
  }
  defaultEnv?: 'staging' | 'production'
}
