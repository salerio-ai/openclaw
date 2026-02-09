# Bustly Mock Data Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an OpenClaw skill that intelligently generates realistic mock data for e-commerce (Shopify, BigCommerce, WooCommerce, Magento) and advertising (Google Ads) platforms, with real-time data analysis, business logic awareness, and complete scenario generation.

**Architecture:** Five-layer architecture (Agent Interface → Data Analysis → Business Rules → Data Generation → Supabase Interface) with real-time analysis of existing data patterns, intelligent scaling based on current data volume, and transaction-safe database operations.

**Tech Stack:** TypeScript, Node.js 22+, Supabase (REST API + RPC), tsx for execution, existing bustly-search-data skill for reference patterns.

---

## Prerequisites

**Before starting:**
1. Read design document: `docs/plans/2026-02-09-bustly-mock-data-design.md`
2. Review reference skill: `skills/bustly-search-data/` (for Supabase patterns, config loading)
3. Ensure Supabase credentials available (will be configured during setup)

**Important:** Do NOT push to remote repository. All commits stay local.

---

## Task 1: Create Skill Skeleton and Basic Configuration

**Files:**
- Create: `skills/bustly-mock-data/skill.md`
- Create: `skills/bustly-mock-data/package.json`
- Create: `skills/bustly-mock-data/tsconfig.json`
- Create: `skills/bustly-mock-data/config/.gitignore`
- Create: `skills/bustly-mock-data/config/supabase.json.example`

### Step 1: Create skill.md documentation

Create `skills/bustly-mock-data/skill.md`:

```markdown
---
name: bustly-mock-data
description: Intelligently generate realistic mock data for e-commerce and advertising platforms. Analyzes existing data patterns and generates correlated test data with business logic integrity for Shopify, BigCommerce, WooCommerce, Magento, and Google Ads.
metadata: {"openclaw":{"always":true,"requires":{"env":["SEARCH_DATA_SUPABASE_URL","SEARCH_DATA_SUPABASE_ANON_KEY","SEARCH_DATA_SUPABASE_ACCESS_TOKEN","SEARCH_DATA_WORKSPACE_ID"]}}}
---

This skill generates intelligent mock data for e-commerce SaaS platforms, writing to the same Supabase data warehouse used by bustly-search-data.

## Quick Start

### Generate Mock Data (Smart Mode)
```bash
npm run generate -- shopify smart
```

### Check Data Status
```bash
npm run status
```

### Clean Mock Data
```bash
npm run clean -- shopify
```

## Configuration

This skill requires two configuration sources:

### 1. Base Configuration (shared with bustly-search-data)
Read from `~/.bustly/bustlyOauth.json` (Bustly OAuth login state):
- `SEARCH_DATA_SUPABASE_URL` - Supabase API URL
- `SEARCH_DATA_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SEARCH_DATA_SUPABASE_ACCESS_TOKEN` - Supabase session access token
- `SEARCH_DATA_WORKSPACE_ID` - Workspace identifier

### 2. Service Role Keys (mock data specific)
Create `config/supabase.json`:

```json
{
  "staging": {
    "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key-here",
    "SUPABASE_URL": "https://xxx-staging.supabase.co"
  },
  "production": {
    "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key-here",
    "SUPABASE_URL": "https://xxx-production.supabase.co"
  },
  "defaultEnv": "staging"
}
```

**Security:** Service role keys have full write access. Never commit `config/supabase.json` to git.

## Supported Platforms

### E-commerce Platforms
- **Shopify** - 7 tables: shop_info, orders, order_items, products, variants, customers, pixel_events
- **BigCommerce** - 6 tables: shop_info, products, variants, customers, orders, order_items
- **WooCommerce** - 6 tables: shop_info, products, variants, customers, orders, order_items
- **Magento** - 6 tables: shop_info, products, variants, customers, orders, order_items

### Advertising Platforms
- **Google Ads** - 5 tables: ads_campaigns, ads_products, ads_keywords, ads_search_terms, ads_creatives

## Generation Strategies

### Smart Mode (Recommended)
Analyzes existing data and intelligently scales:
- Current data < 50 records: Generate 5× more
- Current data 50-200: Generate 2× more
- Current data > 200: Add 20% more

Uses real-time analysis of:
- Price distributions and percentiles
- Customer-product affinities
- Conversion funnels (pixel events)
- Temporal patterns (peak hours, seasonality)

### Minimal Mode
Generate ~10 records per table for quick testing.

### Comprehensive Mode
Generate ~500 records per table for complete scenarios.

## Data Realism Features

- **Foreign Key Integrity**: All orders reference valid products and customers
- **Business Logic**: Order totals match sum of order items
- **Conversion Funnels**: Pixel events follow realistic ratios (view 5-10× purchase)
- **Time Patterns**: Orders follow historical temporal patterns
- **Cross-Platform**: Ad conversions link to e-commerce orders

## Safety Features

- **Transaction Protection**: All operations wrapped in rollback-safe transactions
- **Workspace Isolation**: Only affects current workspace
- **Confirmation Required**: Clean operations require explicit confirmation
- **Dry Run Mode**: Preview what would be generated without inserting

## Usage Examples

### Generate Shopify test data
```bash
npm run generate -- shopify smart
```

### Generate data for all platforms
```bash
npm run generate -- all smart
```

### Force specific quantity
```bash
npm run generate -- shopify smart --count 100
```

### Check current data status
```bash
npm run status
```

### Clean Shopify mock data
```bash
npm run clean -- shopify --confirm
```

## Technical Details

- **Language**: TypeScript (ESM)
- **Runtime**: Node.js 22+
- **Database**: Supabase PostgreSQL via REST API
- **Analysis**: Real-time statistical analysis of existing data
- **Generation**: Probabilistic generation based on observed distributions
- **Batching**: 100 records per batch for performance
- **Retry**: Automatic retry with exponential backoff (max 3 attempts)

## Agent Tools

### generate_mock_data
Generate mock data for specified platforms.

### get_mock_data_status
View current data status across platforms.

### clean_mock_data
Clean up generated mock data (requires confirmation).
```

### Step 2: Create package.json

Create `skills/bustly-mock-data/package.json`:

```json
{
  "name": "bustly-mock-data",
  "version": "0.1.0",
  "description": "Intelligent mock data generation for e-commerce and advertising platforms",
  "type": "module",
  "scripts": {
    "generate": "tsx scripts/generate.ts",
    "status": "tsx scripts/status.ts",
    "clean": "tsx scripts/clean.ts",
    "test": "tsx tests/run.ts"
  },
  "dependencies": {
    "dotenv": "^17.2.3"
  },
  "devDependencies": {
    "@types/node": "^22.19.7",
    "tsx": "^4.21.0"
  }
}
```

### Step 3: Create tsconfig.json

Create `skills/bustly-mock-data/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["lib/**/*", "scripts/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 4: Create config/.gitignore

Create `skills/bustly-mock-data/config/.gitignore`:

```
# Ignore all files in this directory
*

# Except .gitignore itself
!.gitignore
```

### Step 5: Create supabase.json.example

Create `skills/bustly-mock-data/config/supabase.json.example`:

```json
{
  "staging": {
    "SUPABASE_SERVICE_ROLE_KEY": "your-staging-service-role-key-here",
    "SUPABASE_URL": "https://your-project-staging.supabase.co"
  },
  "production": {
    "SUPABASE_SERVICE_ROLE_KEY": "your-production-service-role-key-here",
    "SUPABASE_URL": "https://your-project-production.supabase.co"
  },
  "defaultEnv": "staging"
}
```

### Step 6: Commit skeleton

Run:
```bash
cd skills/bustly-mock-data
git add .
git commit -m "feat(misc): add bustly-mock-data skill skeleton and config structure"
```

---

## Task 2: Implement Configuration Loading

**Files:**
- Create: `skills/bustly-mock-data/lib/config.ts`

### Step 1: Write config.ts

Create `skills/bustly-mock-data/lib/config.ts`:

```typescript
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
```

### Step 2: Test config loading

Run:
```bash
cd skills/bustly-mock-data
tsx -e "import('./lib/config.ts').then(() => console.log('Config loaded successfully'))"
```

Expected: Error about missing config/supabase.json

### Step 3: Create actual config file

Run:
```bash
cd skills/bustly-mock-data
cp config/supabase.json.example config/supabase.json
# Edit config/supabase.json with actual keys (placeholder for now)
```

### Step 4: Commit config implementation

Run:
```bash
git add lib/config.ts
git commit -m "feat: add configuration loading with base config and service role key support"
```

---

## Task 3: Implement Supabase Client Layer

**Files:**
- Create: `skills/bustly-mock-data/lib/supabase/client.ts`
- Create: `skills/bustly-mock-data/lib/supabase/schema.ts`
- Create: `skills/bustly-mock-data/lib/supabase/inserter.ts`

### Step 1: Create Supabase client base

Create `skills/bustly-mock-data/lib/supabase/client.ts`:

```typescript
/**
 * Supabase Client for Mock Data Operations
 *
 * Uses service role key for write operations.
 * Reuses RPC functions from bustly-search-data.
 */

import { config } from '../config.js'

const REQUEST_TIMEOUT_MS = 30000
const MAX_RETRIES = 3

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getRetryDelay(attempt: number): number {
  return 1000 * Math.pow(2, attempt)
}

/**
 * Supabase API Error
 */
export class SupabaseError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false
  ) {
    super(message)
    this.name = 'SupabaseError'
  }
}

/**
 * Execute RPC function
 */
async function rpc(functionName: string, params: Record<string, any> = {}): Promise<any> {
  const url = `${config.supabaseUrl}/rest/v1/rpc/${functionName}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.supabaseAnonKey!,
          'Authorization': `Bearer ${config.supabaseToken}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(params),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        const isRetryable = response.status >= 500 || response.status === 429

        if (!isRetryable && response.status >= 400 && response.status < 500) {
          throw new SupabaseError(`RPC error (${response.status}): ${errorText}`, response.status, false)
        }

        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = getRetryDelay(attempt)
          console.warn(`Retryable error, waiting ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
          await sleep(delay)
          continue
        }

        throw new SupabaseError(`RPC error (${response.status}): ${errorText}`, response.status, isRetryable)
      }

      return await response.json()
    } catch (err) {
      clearTimeout(timeoutId)

      if (err instanceof SupabaseError) {
        throw err
      }

      if (err instanceof Error && err.name === 'AbortError') {
        throw new SupabaseError(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`, undefined, true)
      }

      throw new SupabaseError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`, undefined, true)
    }
  }

  throw new SupabaseError('Max retries exceeded')
}

/**
 * Get available tables for workspace
 */
export async function getAvailableTables(): Promise<TableInfo[]> {
  const data = await rpc('get_agent_available_tables')
  return data
}

/**
 * Get table schema
 */
export async function getTableSchema(tableName: string): Promise<ColumnInfo[]> {
  const data = await rpc('get_agent_table_schema', {
    p_table_name: tableName
  })
  return data
}

/**
 * Execute SELECT query
 */
export async function runSelectQuery(query: string): Promise<any[]> {
  const normalizedQuery = query.trim().toUpperCase()
  if (!normalizedQuery.startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed')
  }

  const data = await rpc('run_select_ws', {
    p_query: query,
    p_workspace_id: config.workspaceId
  })
  return data
}

/**
 * Table info interface
 */
export interface TableInfo {
  table_name: string
  description?: string
}

/**
 * Column info interface
 */
export interface ColumnInfo {
  column_name: string
  data_type: string
  is_nullable: boolean
  column_default?: string
  description?: string
}
```

### Step 2: Create schema reader

Create `skills/bustly-mock-data/lib/supabase/schema.ts`:

```typescript
/**
 * Schema Reader - Dynamically read table structures
 */

import { getTableSchema, ColumnInfo } from './client.js'

const schemaCache = new Map<string, TableSchema>()

/**
 * Get table schema with caching
 */
export async function getTableSchemaCached(tableName: string): Promise<TableSchema> {
  if (schemaCache.has(tableName)) {
    return schemaCache.get(tableName)!
  }

  const columns = await getTableSchema(tableName)

  const schema: TableSchema = {
    tableName,
    columns: {},
    primaryKeys: [],
    foreignKeys: [],
    requiredFields: []
  }

  for (const col of columns) {
    schema.columns[col.column_name] = {
      name: col.column_name,
      type: col.data_type,
      nullable: col.is_nullable,
      default: col.column_default,
      description: col.description
    }

    if (!col.is_nullable) {
      schema.requiredFields.push(col.column_name)
    }
  }

  // TODO: Parse primary keys and foreign keys from pg_* tables
  // For now, we'll define them manually in platform rules

  schemaCache.set(tableName, schema)
  return schema
}

/**
 * Clear schema cache
 */
export function clearSchemaCache(): void {
  schemaCache.clear()
}

/**
 * Type definitions
 */
export interface TableSchema {
  tableName: string
  columns: Record<string, ColumnDetails>
  primaryKeys: string[]
  foreignKeys: ForeignKey[]
  requiredFields: string[]
}

export interface ColumnDetails {
  name: string
  type: string
  nullable: boolean
  default?: string
  description?: string
}

export interface ForeignKey {
  column: string
  refTable: string
  refColumn: string
}
```

### Step 3: Create data inserter

Create `skills/bustly-mock-data/lib/supabase/inserter.ts`:

```typescript
/**
 * Data Inserter - Batch insert with transaction safety
 */

import { config } from '../config.js'

const BATCH_SIZE = 100

/**
 * Insert batch of records
 */
export async function insertBatch(
  tableName: string,
  rows: any[]
): Promise<InsertResult> {
  if (rows.length === 0) {
    return { inserted: 0, failed: 0, errors: [] }
  }

  const url = `${config.supabaseUrl}/rest/v1/${tableName}`
  const results: InsertResult = { inserted: 0, failed: 0, errors: [] }

  // Process in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.serviceRoleKey,
          'Authorization': `Bearer ${config.serviceRoleKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(batch)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Insert failed: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      results.inserted += Array.isArray(data) ? data.length : 1
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      results.failed += batch.length
      results.errors.push(`Batch ${i / BATCH_SIZE}: ${errorMsg}`)
    }
  }

  return results
}

/**
 * Delete records by tenant_id
 */
export async function deleteByTenantId(
  tableName: string,
  tenantId: string
): Promise<number> {
  const url = `${config.supabaseUrl}/rest/v1/${tableName}?tenant_id=eq.${tenantId}`

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': config.serviceRoleKey,
      'Authorization': `Bearer ${config.serviceRoleKey}`
    }
  })

  if (!response.ok) {
    throw new Error(`Delete failed: ${response.status}`)
  }

  // Return count from headers
  const contentRange = response.headers.get('Content-Range')
  if (contentRange) {
    const match = contentRange.match(/(\d+)-(\d+)\/(\d+)/)
    if (match) {
      return parseInt(match[3], 10)
    }
  }

  return 0
}

/**
 * Type definitions
 */
export interface InsertResult {
  inserted: number
  failed: number
  errors: string[]
}
```

### Step 4: Test Supabase layer

Create test file `skills/bustly-mock-data/tests/test-supabase.ts`:

```typescript
import { getAvailableTables, getTableSchema, runSelectQuery } from '../lib/supabase/client.js'
import { getTableSchemaCached } from '../lib/supabase/schema.js'

async function test() {
  console.log('Testing Supabase client...\n')

  try {
    // Test 1: Get available tables
    console.log('Test 1: Get available tables')
    const tables = await getAvailableTables()
    console.log(`✓ Found ${tables.length} tables`)
    console.log(`  Example: ${tables.slice(0, 3).map(t => t.table_name).join(', ')}\n`)

    // Test 2: Get table schema
    console.log('Test 2: Get table schema')
    const schema = await getTableSchemaCached('semantic.dm_orders_shopify')
    console.log(`✓ Loaded schema for dm_orders_shopify`)
    console.log(`  Columns: ${Object.keys(schema.columns).length}`)
    console.log(`  Required: ${schema.requiredFields.length}\n`)

    // Test 3: Run select query
    console.log('Test 3: Run select query')
    const result = await runSelectQuery('SELECT COUNT(*) as count FROM semantic.dm_orders_shopify LIMIT 1')
    console.log(`✓ Query executed successfully`)
    console.log(`  Result: ${JSON.stringify(result)}\n`)

    console.log('All tests passed!')
  } catch (err) {
    console.error('Test failed:', err)
    process.exit(1)
  }
}

test()
```

Run:
```bash
tsx tests/test-supabase.ts
```

### Step 5: Commit Supabase layer

Run:
```bash
git add lib/supabase/
git commit -m "feat: implement Supabase client layer with schema reader and batch inserter"
```

---

## Task 4: Implement Data Analysis Layer

**Files:**
- Create: `skills/bustly-mock-data/lib/analyzer/index.ts`
- Create: `skills/bustly-mock-data/lib/analyzer/scale.ts`
- Create: `skills/bustly-mock-data/lib/analyzer/distribution.ts`
- Create: `skills/bustly-mock-data/lib/analyzer/association.ts`

### Step 1: Create analyzer types

Create `skills/bustly-mock-data/lib/analyzer/types.ts`:

```typescript
/**
 * Analysis result types
 */

export interface AnalysisReport {
  platform: string
  timestamp: Date
  scales: Record<string, number>
  distributions: Record<string, Distribution>
  associations?: AssociationMap
  funnels?: FunnelMetrics
}

export interface Distribution {
  min: number
  max: number
  mean: number
  median: number
  p25: number
  p75: number
  p90: number
}

export interface AssociationMap {
  customerProductAffinity: Map<string, string[]>  // customer_id -> product categories
  productPopularity: Map<string, number>          // product_id -> order count
}

export interface FunnelMetrics {
  pageViewToPurchase: number  // ratio
  addToCartToPurchase: number
  purchaseCount: number
}
```

### Step 2: Create scale analyzer

Create `skills/bustly-mock-data/lib/analyzer/scale.ts`:

```typescript
/**
 * Scale Analyzer - Count records and determine generation quantity
 */

import { runSelectQuery } from '../supabase/client.js'

/**
 * Get record count for a table
 */
export async function getTableCount(tableName: string): Promise<number> {
  const query = `SELECT COUNT(*) as count FROM ${tableName}`
  const result = await runSelectQuery(query)
  return result[0]?.count || 0
}

/**
 * Get scale for all tables in a platform
 */
export async function getPlatformScale(tables: string[]): Promise<Record<string, number>> {
  const scales: Record<string, number> = {}

  for (const table of tables) {
    try {
      scales[table] = await getTableCount(table)
    } catch (err) {
      console.warn(`Warning: Could not count ${table}:`, err)
      scales[table] = 0
    }
  }

  return scales
}

/**
 * Determine generation quantity based on current scale
 */
export function determineGenerationQuantity(currentCount: number): number {
  if (currentCount < 50) {
    // Expand 5x
    return currentCount * 5
  } else if (currentCount < 200) {
    // Expand 2x
    return currentCount * 2
  } else {
    // Supplement 20%
    return Math.floor(currentCount * 0.2)
  }
}

/**
 * Clamp quantity to reasonable range
 */
export function clampQuantity(quantity: number): number {
  return Math.max(10, Math.min(quantity, 1000))
}
```

### Step 3: Create distribution analyzer

Create `skills/bustly-mock-data/lib/analyzer/distribution.ts`:

```typescript
/**
 * Distribution Analyzer - Analyze value distributions
 */

import { runSelectQuery } from '../supabase/client.js'
import type { Distribution } from './types.js'

/**
 * Analyze numeric column distribution
 */
export async function analyzeDistribution(
  tableName: string,
  columnName: string,
  whereClause: string = ''
): Promise<Distribution> {
  const query = `
    SELECT
      MIN(${columnName}) as min,
      MAX(${columnName}) as max,
      AVG(${columnName}) as mean,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${columnName}) as median,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${columnName}) as p25,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${columnName}) as p75,
      PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY ${columnName}) as p90
    FROM ${tableName}
    ${whereClause ? `WHERE ${whereClause}` : ''}
  `

  const result = await runSelectQuery(query)
  const row = result[0]

  return {
    min: row.min || 0,
    max: row.max || 0,
    mean: row.mean || 0,
    median: row.median || 0,
    p25: row.p25 || 0,
    p75: row.p75 || 0,
    p90: row.p90 || 0
  }
}

/**
 * Generate value from distribution
 */
export function generateFromDistribution(dist: Distribution): number {
  // Box-Muller transform for normal distribution
  const u1 = Math.random()
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)

  // Convert to distribution parameters
  const stdDev = (dist.p75 - dist.p25) / 1.35  // approximate
  let value = dist.mean + z * stdDev

  // Clamp to range
  value = Math.max(dist.min, Math.min(value, dist.max))

  return value
}
```

### Step 4: Create main analyzer

Create `skills/bustly-mock-data/lib/analyzer/index.ts`:

```typescript
/**
 * Main Data Analyzer - Coordinates all analysis operations
 */

import { getPlatformScale, determineGenerationQuantity, clampQuantity } from './scale.js'
import { analyzeDistribution } from './distribution.js'
import type { AnalysisReport, Distribution } from './types.js'

/**
 * Analyze a platform
 */
export async function analyzePlatform(
  platform: string,
  tables: string[]
): Promise<AnalysisReport> {
  console.log(`\n📊 Analyzing ${platform}...`)

  // Get scale
  const scales = await getPlatformScale(tables)
  console.log(`  Scale: ${Object.values(scales).reduce((sum, v) => sum + v, 0)} total records`)

  // Analyze key distributions
  const distributions: Record<string, Distribution> = {}

  if (platform === 'shopify' || platform === 'bigcommerce' || platform === 'woocommerce' || platform === 'magento') {
    // Analyze price distribution
    const productsTable = `semantic.dm_products_${platform}`
    if (scales[productsTable] > 0) {
      try {
        distributions['price'] = await analyzeDistribution(productsTable, 'price')
        console.log(`  Price: $${distributions['price'].median.toFixed(2)} median`)
      } catch (err) {
        console.warn(`  Warning: Could not analyze price distribution`)
      }
    }
  }

  return {
    platform,
    timestamp: new Date(),
    scales,
    distributions
  }
}

/**
 * Determine generation strategy
 */
export function determineStrategy(
  analysis: AnalysisReport,
  userStrategy: 'smart' | 'minimal' | 'comprehensive',
  forceCount?: number
): { targetCount: number; mode: string } {
  if (forceCount !== undefined) {
    return { targetCount: clampQuantity(forceCount), mode: 'forced' }
  }

  if (userStrategy === 'minimal') {
    return { targetCount: 10, mode: 'minimal' }
  }

  if (userStrategy === 'comprehensive') {
    return { targetCount: 500, mode: 'comprehensive' }
  }

  // Smart mode
  const ordersTable = `semantic.dm_orders_${analysis.platform}`
  const currentOrders = analysis.scales[ordersTable] || 0
  const targetCount = determineGenerationQuantity(currentOrders)

  return {
    targetCount: clampQuantity(targetCount),
    mode: currentOrders < 50 ? 'expand' : currentOrders < 200 ? 'grow' : 'supplement'
  }
}
```

### Step 5: Commit analysis layer

Run:
```bash
git add lib/analyzer/
git commit -m "feat: implement data analysis layer with scale and distribution analyzers"
```

---

## Task 5: Implement Business Rules Layer

**Files:**
- Create: `skills/bustly-mock-data/lib/rules/registry.ts`
- Create: `skills/bustly-mock-data/lib/rules/shopify.ts`

### Step 1: Create rule types

Create `skills/bustly-mock-data/lib/rules/types.ts`:

```typescript
/**
 * Business rule types
 */

export interface PlatformSchema {
  name: string
  type: 'ecommerce' | 'ads'
  tables: TableSchema[]
  dependencies: DependencyGraph
  businessRules: BusinessRule[]
}

export interface TableSchema {
  name: string
  columns: Record<string, ColumnDef>
  primaryKeys: string[]
  foreignKeys: ForeignKey[]
  requiredFields: string[]
}

export interface ColumnDef {
  type: string
  nullable: boolean
  default?: any
  enum?: string[]
  validation?: (value: any) => boolean
}

export interface ForeignKey {
  column: string
  refTable: string
  refColumn: string
}

export type DependencyGraph = Record<string, string[]>

export interface BusinessRule {
  description: string
  validate: (data: any) => boolean
}
```

### Step 2: Create Shopify rules

Create `skills/bustly-mock-data/lib/rules/shopify.ts`:

```typescript
/**
 * Shopify platform rules and schema
 */

import type { PlatformSchema } from './types.js'

export const shopifySchema: PlatformSchema = {
  name: 'shopify',
  type: 'ecommerce',

  tables: [
    {
      name: 'semantic.dm_products_shopify',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        title: { type: 'text', nullable: false },
        status: { type: 'text', nullable: false, enum: ['active', 'archived', 'draft'] },
        vendor: { type: 'text', nullable: true },
        product_type: { type: 'text', nullable: true },
        created_at: { type: 'timestamp', nullable: false },
        updated_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'title', 'status', 'created_at', 'updated_at']
    },
    {
      name: 'semantic.dm_variants_shopify',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        product_id: { type: 'text', nullable: false },
        price: { type: 'numeric', nullable: false },
        compare_at_price: { type: 'numeric', nullable: true },
        inventory_quantity: { type: 'integer', nullable: true },
        created_at: { type: 'timestamp', nullable: false },
        updated_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'product_id', refTable: 'semantic.dm_products_shopify', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'product_id', 'price', 'created_at', 'updated_at']
    },
    {
      name: 'semantic.dm_customers_shopify',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        email: { type: 'text', nullable: false },
        first_name: { type: 'text', nullable: true },
        last_name: { type: 'text', nullable: true },
        orders_count: { type: 'integer', nullable: true },
        total_spent: { type: 'numeric', nullable: true },
        created_at: { type: 'timestamp', nullable: false },
        updated_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'email', 'created_at', 'updated_at']
    },
    {
      name: 'semantic.dm_orders_shopify',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        customer_id: { type: 'text', nullable: false },
        financial_status: { type: 'text', nullable: false, enum: ['paid', 'pending', 'refunded', 'partially_paid', 'voided'] },
        fulfillment_status: { type: 'text', nullable: true, enum: ['fulfilled', 'partial', 'restocked', 'null'] },
        total_price: { type: 'numeric', nullable: false },
        subtotal_price: { type: 'numeric', nullable: false },
        created_at: { type: 'timestamp', nullable: false },
        updated_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'customer_id', refTable: 'semantic.dm_customers_shopify', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'customer_id', 'financial_status', 'total_price', 'created_at', 'updated_at']
    },
    {
      name: 'semantic.dm_order_items_shopify',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        order_id: { type: 'text', nullable: false },
        product_id: { type: 'text', nullable: false },
        variant_id: { type: 'text', nullable: false },
        quantity: { type: 'integer', nullable: false },
        price: { type: 'numeric', nullable: false },
        created_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'order_id', refTable: 'semantic.dm_orders_shopify', refColumn: 'id' },
        { column: 'product_id', refTable: 'semantic.dm_products_shopify', refColumn: 'id' },
        { column: 'variant_id', refTable: 'semantic.dm_variants_shopify', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'order_id', 'product_id', 'variant_id', 'quantity', 'price', 'created_at']
    },
    {
      name: 'semantic.dm_shopify_pixel_events',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        event_name: { type: 'text', nullable: false, enum: ['page_view', 'add_to_cart', 'purchase'] },
        user_id: { type: 'text', nullable: true },
        session_id: { type: 'text', nullable: false },
        event_time: { type: 'timestamp', nullable: false },
        created_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'event_name', 'session_id', 'event_time', 'created_at']
    }
  ],

  dependencies: {
    'semantic.dm_orders_shopify': ['semantic.dm_products_shopify', 'semantic.dm_customers_shopify'],
    'semantic.dm_order_items_shopify': ['semantic.dm_orders_shopify', 'semantic.dm_products_shopify', 'semantic.dm_variants_shopify'],
    'semantic.dm_shopify_pixel_events': ['semantic.dm_orders_shopify']
  },

  businessRules: [
    {
      description: 'Order financial status must be valid enum',
      validate: (order) => ['paid', 'pending', 'refunded', 'partially_paid', 'voided'].includes(order.financial_status)
    },
    {
      description: 'Order total must be >= 0',
      validate: (order) => order.total_price >= 0
    }
  ]
}
```

### Step 3: Create platform registry

Create `skills/bustly-mock-data/lib/rules/registry.ts`:

```typescript
/**
 * Platform registry - Central hub for all platform schemas
 */

import { shopifySchema } from './shopify.js'
import type { PlatformSchema } from './types.js'

const registry = new Map<string, PlatformSchema>()

// Register platforms
registry.set('shopify', shopifySchema)

// TODO: Add other platforms
// registry.set('bigcommerce', bigcommerceSchema)
// registry.set('woocommerce', woocommerceSchema)
// registry.set('magento', magentoSchema)
// registry.set('google_ads', googleAdsSchema)

/**
 * Get platform schema
 */
export function getPlatformSchema(platform: string): PlatformSchema | undefined {
  return registry.get(platform)
}

/**
 * Get all registered platforms
 */
export function getAllPlatforms(): string[] {
  return Array.from(registry.keys())
}

/**
 * Check if platform is registered
 */
export function hasPlatform(platform: string): boolean {
  return registry.has(platform)
}

/**
 * Get dependency order for a platform (topological sort)
 */
export function getDependencyOrder(platform: string): string[] {
  const schema = getPlatformSchema(platform)
  if (!schema) {
    throw new Error(`Platform not found: ${platform}`)
  }

  const deps = schema.dependencies
  const order: string[] = []
  const visited = new Set<string>()

  function visit(table: string) {
    if (visited.has(table)) return
    visited.add(table)

    const depsForTable = deps[table] || []
    for (const dep of depsForTable) {
      visit(dep)
    }

    order.push(table)
  }

  for (const table of Object.keys(deps)) {
    visit(table)
  }

  // Add tables with no dependencies
  for (const tableSchema of schema.tables) {
    if (!order.includes(tableSchema.name)) {
      order.unshift(tableSchema.name)
    }
  }

  return order
}
```

### Step 4: Commit rules layer

Run:
```bash
git add lib/rules/
git commit -m "feat: implement business rules layer with Shopify schema and dependency graph"
```

---

## Task 6: Implement Data Generation Layer

**Files:**
- Create: `skills/bustly-mock-data/lib/generator/index.ts`
- Create: `skills/bustly-mock-data/lib/generator/values.ts`
- Create: `skills/bustly-mock-data/lib/generator/shopify.ts`

### Step 1: Create value generators

Create `skills/bustly-mock-data/lib/generator/values.ts`:

```typescript
/**
 * Smart value generators
 */

import type { Distribution } from '../analyzer/types.js'

/**
 * Generate ID
 */
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Generate email
 */
export function generateEmail(firstName: string, lastName: string): string {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'example.com']
  const domain = domains[Math.floor(Math.random() * domains.length)]
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '')
  const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '')
  return `${cleanFirst}.${cleanLast}${Math.floor(Math.random() * 100)}@${domain}`
}

/**
 * Generate price from distribution
 */
export function generatePrice(dist?: Distribution): number {
  if (dist) {
    // Use distribution (will be implemented in distribution.ts)
    const mean = dist.mean || 50
    const variance = (dist.p75 - dist.p25) / 4
    return Math.max(1, Math.round((mean + (Math.random() - 0.5) * variance) * 100) / 100)
  }
  // Default: $10-100
  return Math.round((10 + Math.random() * 90) * 100) / 100
}

/**
 * Generate date in range
 */
export function generateDate(startDate: Date, endDate: Date): Date {
  const start = startDate.getTime()
  const end = endDate.getTime()
  return new Date(start + Math.random() * (end - start))
}

/**
 * Generate date within last N days
 */
export function generateRecentDate(daysBack: number): Date {
  const now = Date.now()
  const msBack = daysBack * 24 * 60 * 60 * 1000
  return new Date(now - Math.random() * msBack)
}

/**
 * Pick random element
 */
export function pickRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

/**
 * Pick random N elements
 */
export function pickRandomN<T>(array: T[], n: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, array.length))
}
```

### Step 2: Create Shopify generator

Create `skills/bustly-mock-data/lib/generator/shopify.ts`:

```typescript
/**
 * Shopify data generator
 */

import type { AnalysisReport } from '../analyzer/types.js'
import type { PlatformSchema } from '../rules/types.js'
import { generateId, generateEmail, generatePrice, generateRecentDate, pickRandom, pickRandomN } from './values.js'

/**
 * Generate Shopify products
 */
export function generateShopifyProducts(
  count: number,
  tenantId: string,
  analysis: AnalysisReport
): any[] {
  const products = []
  const priceDist = analysis.distributions['price']

  const productTypes = ['Clothing', 'Electronics', 'Home', 'Accessories', 'Books']
  const vendors = ['Acme Corp', 'Global Traders', 'Quality Goods', 'Value Brands']
  const statuses = ['active', 'active', 'active', 'archived', 'draft']

  for (let i = 0; i < count; i++) {
    const id = generateId('product')
    const now = new Date()

    products.push({
      id,
      tenant_id: tenantId,
      title: `Product ${i + 1} - ${pickRandom(productTypes)}`,
      status: pickRandom(statuses),
      vendor: pickRandom(vendors),
      product_type: pickRandom(productTypes),
      created_at: generateRecentDate(365),
      updated_at: now
    })
  }

  return products
}

/**
 * Generate Shopify variants
 */
export function generateShopifyVariants(
  products: any[],
  tenantId: string
): any[] {
  const variants = []

  for (const product of products) {
    // 1-3 variants per product
    const variantCount = Math.floor(Math.random() * 3) + 1

    for (let i = 0; i < variantCount; i++) {
      const id = generateId('variant')
      const now = new Date()

      variants.push({
        id,
        tenant_id: tenantId,
        product_id: product.id,
        price: generatePrice(),
        compare_at_price: Math.random() > 0.5 ? generatePrice() * 1.2 : null,
        inventory_quantity: Math.floor(Math.random() * 100),
        created_at: product.created_at,
        updated_at: now
      })
    }
  }

  return variants
}

/**
 * Generate Shopify customers
 */
export function generateShopifyCustomers(
  count: number,
  tenantId: string
): any[] {
  const customers = []
  const firstNames = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana', 'Eve', 'Frank']
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis']

  for (let i = 0; i < count; i++) {
    const id = generateId('customer')
    const firstName = pickRandom(firstNames)
    const lastName = pickRandom(lastNames)
    const now = new Date()

    customers.push({
      id,
      tenant_id: tenantId,
      email: generateEmail(firstName, lastName),
      first_name: firstName,
      last_name: lastName,
      orders_count: 0,
      total_spent: 0,
      created_at: generateRecentDate(365),
      updated_at: now
    })
  }

  return customers
}

/**
 * Generate Shopify orders
 */
export function generateShopifyOrders(
  count: number,
  tenantId: string,
  customers: any[],
  analysis: AnalysisReport
): any[] {
  const orders = []
  const financialStatuses = ['paid', 'paid', 'paid', 'pending', 'refunded']

  for (let i = 0; i < count; i++) {
    const id = generateId('order')
    const customer = pickRandom(customers)
    const now = new Date()
    const createdAt = generateRecentDate(90)

    // Calculate total price (will be adjusted when order items are added)
    const totalPrice = generatePrice() * (Math.floor(Math.random() * 3) + 1)

    orders.push({
      id,
      tenant_id: tenantId,
      customer_id: customer.id,
      financial_status: pickRandom(financialStatuses),
      fulfillment_status: Math.random() > 0.3 ? 'fulfilled' : null,
      total_price: totalPrice,
      subtotal_price: totalPrice,
      created_at: createdAt,
      updated_at: now
    })
  }

  return orders
}

/**
 * Generate Shopify order items
 */
export function generateShopifyOrderItems(
  orders: any[],
  variants: any[],
  tenantId: string
): any[] {
  const orderItems = []

  for (const order of orders) {
    // 1-3 items per order
    const itemCount = Math.floor(Math.random() * 3) + 1
    const selectedVariants = pickRandomN(variants, itemCount)

    for (const variant of selectedVariants) {
      const id = generateId('order_item')
      const quantity = Math.floor(Math.random() * 3) + 1

      orderItems.push({
        id,
        tenant_id: tenantId,
        order_id: order.id,
        product_id: variant.product_id,
        variant_id: variant.id,
        quantity,
        price: variant.price,
        created_at: order.created_at
      })
    }
  }

  return orderItems
}

/**
 * Generate Shopify pixel events
 */
export function generateShopifyPixelEvents(
  orders: any[],
  tenantId: string
): any[] {
  const pixelEvents = []

  for (const order of orders) {
    const sessionId = generateId('session')

    // Page views: 5-10 per order, spread over 1-7 days before
    const viewCount = Math.floor(Math.random() * 6) + 5
    for (let i = 0; i < viewCount; i++) {
      const daysBefore = Math.random() * 7
      const eventTime = new Date(order.created_at.getTime() - daysBefore * 24 * 60 * 60 * 1000)

      pixelEvents.push({
        id: generateId('pixel'),
        tenant_id: tenantId,
        event_name: 'page_view',
        user_id: order.customer_id,
        session_id: sessionId,
        event_time: eventTime,
        created_at: eventTime
      })
    }

    // Add to carts: 2-4 per order, 1-3 days before
    const cartCount = Math.floor(Math.random() * 3) + 2
    for (let i = 0; i < cartCount; i++) {
      const daysBefore = Math.random() * 3
      const eventTime = new Date(order.created_at.getTime() - daysBefore * 24 * 60 * 60 * 1000)

      pixelEvents.push({
        id: generateId('pixel'),
        tenant_id: tenantId,
        event_name: 'add_to_cart',
        user_id: order.customer_id,
        session_id: sessionId,
        event_time: eventTime,
        created_at: eventTime
      })
    }

    // Purchase: 1 per order
    pixelEvents.push({
      id: generateId('pixel'),
      tenant_id: tenantId,
      event_name: 'purchase',
      user_id: order.customer_id,
      session_id: sessionId,
      event_time: order.created_at,
      created_at: order.created_at
    })
  }

  return pixelEvents
}
```

### Step 3: Create main generator

Create `skills/bustly-mock-data/lib/generator/index.ts`:

```typescript
/**
 * Main data generator coordinator
 */

import type { AnalysisReport } from '../analyzer/types.js'
import { getPlatformSchema, getDependencyOrder } from '../rules/registry.js'
import * as ShopifyGenerator from './shopify.js'

/**
 * Generate mock data for a platform
 */
export async function generatePlatformData(
  platform: string,
  tenantId: string,
  targetCount: number,
  analysis: AnalysisReport
): Promise<GenerationResult> {
  console.log(`\n🎯 Generating ${platform} data (target: ${targetCount} orders)...`)

  const schema = getPlatformSchema(platform)
  if (!schema) {
    throw new Error(`Platform not found: ${platform}`)
  }

  const results: TableResult[] = []
  let totalRecords = 0

  // Get existing data for sampling
  // TODO: Query existing products, customers

  if (platform === 'shopify') {
    // Generate in dependency order
    const depOrder = getDependencyOrder(platform)

    // 1. Products
    const productCount = Math.ceil(targetCount * 0.5)  // Fewer products than orders
    const products = ShopifyGenerator.generateShopifyProducts(productCount, tenantId, analysis)
    results.push({ table: 'semantic.dm_products_shopify', count: products.length })
    totalRecords += products.length

    // 2. Variants
    const variants = ShopifyGenerator.generateShopifyVariants(products, tenantId)
    results.push({ table: 'semantic.dm_variants_shopify', count: variants.length })
    totalRecords += variants.length

    // 3. Customers
    const customerCount = Math.ceil(targetCount * 0.4)
    const customers = ShopifyGenerator.generateShopifyCustomers(customerCount, tenantId)
    results.push({ table: 'semantic.dm_customers_shopify', count: customers.length })
    totalRecords += customers.length

    // 4. Orders
    const orders = ShopifyGenerator.generateShopifyOrders(targetCount, tenantId, customers, analysis)
    results.push({ table: 'semantic.dm_orders_shopify', count: orders.length })
    totalRecords += orders.length

    // 5. Order items
    const orderItems = ShopifyGenerator.generateShopifyOrderItems(orders, variants, tenantId)
    results.push({ table: 'semantic.dm_order_items_shopify', count: orderItems.length })
    totalRecords += orderItems.length

    // 6. Pixel events
    const pixelEvents = ShopifyGenerator.generateShopifyPixelEvents(orders, tenantId)
    results.push({ table: 'semantic.dm_shopify_pixel_events', count: pixelEvents.length })
    totalRecords += pixelEvents.length

    console.log(`  ✓ Generated ${totalRecords} total records`)
  } else {
    throw new Error(`Platform ${platform} not yet implemented`)
  }

  return {
    platform,
    tables: results,
    totalRecords,
    success: true
  }
}

/**
 * Type definitions
 */
export interface TableResult {
  table: string
  count: number
}

export interface GenerationResult {
  platform: string
  tables: TableResult[]
  totalRecords: number
  success: boolean
  errors?: string[]
}
```

### Step 4: Commit generation layer

Run:
```bash
git add lib/generator/
git commit -m "feat: implement data generation layer with Shopify generators"
```

---

## Task 7: Create CLI Scripts

**Files:**
- Create: `skills/bustly-mock-data/scripts/generate.ts`
- Create: `skills/bustly-mock-data/scripts/status.ts`
- Create: `skills/bustly-mock-data/scripts/clean.ts`

### Step 1: Create generate script

Create `skills/bustly-mock-data/scripts/generate.ts`:

```typescript
#!/usr/bin/env tsx
/**
 * Generate mock data CLI
 */

import { analyzePlatform, determineStrategy } from '../lib/analyzer/index.js'
import { generatePlatformData } from '../lib/generator/index.js'
import { getPlatformSchema, getDependencyOrder } from '../lib/rules/registry.js'
import { insertBatch } from '../lib/supabase/inserter.js'

// Parse arguments
const args = process.argv.slice(2)
const platform = args[0] || 'shopify'
const strategy = (args[1] || 'smart') as 'smart' | 'minimal' | 'comprehensive'
const forceCount = args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1]) : undefined

async function main() {
  console.log('🚀 Bustly Mock Data Generator\n')

  // Validate platform
  if (!getPlatformSchema(platform)) {
    console.error(`❌ Unknown platform: ${platform}`)
    console.error(`   Available: ${['shopify', 'bigcommerce', 'woocommerce', 'magento', 'google_ads'].join(', ')}`)
    process.exit(1)
  }

  // Get schema
  const schema = getPlatformSchema(platform)!
  const depOrder = getDependencyOrder(platform)
  console.log(`Platform: ${platform}`)
  console.log(`Tables: ${depOrder.join(', ')}\n`)

  // Analyze existing data
  const analysis = await analyzePlatform(platform, depOrder)

  // Determine strategy
  const { targetCount, mode } = determineStrategy(analysis, strategy, forceCount)
  console.log(`Strategy: ${strategy} (${mode})`)
  console.log(`Target: ${targetCount} orders\n`)

  // Get tenant_id (use workspace_id as proxy for now)
  const tenantId = process.env.SEARCH_DATA_WORKSPACE_ID || 'default'
  console.log(`Tenant ID: ${tenantId}\n`)

  // Generate data
  const startTime = Date.now()
  const generationResult = await generatePlatformData(platform, tenantId, targetCount, analysis)

  // Insert data (in dependency order)
  console.log(`\n💾 Inserting data...`)

  // TODO: Store generated data and insert in batches
  // For now, just show what would be generated

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)

  console.log(`\n✅ Generation complete!`)
  console.log(`   Platform: ${generationResult.platform}`)
  console.log(`   Tables: ${generationResult.tables.length}`)
  console.log(`   Total records: ${generationResult.totalRecords}`)
  console.log(`   Time: ${elapsed}s`)

  // Summary
  console.log(`\n📊 Summary:`)
  for (const table of generationResult.tables) {
    console.log(`   ${table.table}: ${table.count} records`)
  }
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
```

### Step 2: Create status script

Create `skills/bustly-mock-data/scripts/status.ts`:

```typescript
#!/usr/bin/env tsx
/**
 * Check data status CLI
 */

import { getAvailableTables } from '../lib/supabase/client.js'
import { getTableCount } from '../lib/analyzer/scale.js'

async function main() {
  console.log('📊 Bustly Mock Data Status\n')

  const tables = await getAvailableTables()
  const shopifyTables = tables.filter(t => t.table_name.includes('shopify'))

  console.log('Shopify Tables:')
  for (const table of shopifyTables) {
    const count = await getTableCount(table.table_name)
    console.log(`  ${table.table_name}: ${count} records`)
  }
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
```

### Step 3: Create clean script

Create `skills/bustly-mock-data/scripts/clean.ts`:

```typescript
#!/usr/bin/env tsx
/**
 * Clean mock data CLI
 */

import { deleteByTenantId } from '../lib/supabase/inserter.js'
import { getPlatformSchema, getDependencyOrder } from '../lib/rules/registry.js'

// Parse arguments
const args = process.argv.slice(2)
const platform = args[0] || 'shopify'
const confirm = args.includes('--confirm')

async function main() {
  console.log('🧹 Bustly Mock Data Cleaner\n')

  if (!confirm) {
    console.error('❌ This will delete ALL mock data for this platform!')
    console.error('   Add --confirm flag to proceed.')
    process.exit(1)
  }

  const schema = getPlatformSchema(platform)
  if (!schema) {
    console.error(`❌ Unknown platform: ${platform}`)
    process.exit(1)
  }

  const tenantId = process.env.SEARCH_DATA_WORKSPACE_ID || 'default'

  // Delete in reverse dependency order
  const depOrder = getDependencyOrder(platform).reverse()

  console.log(`Platform: ${platform}`)
  console.log(`Tenant: ${tenantId}`)
  console.log(`Tables to clean: ${depOrder.length}\n`)

  let totalDeleted = 0

  for (const table of depOrder) {
    try {
      const count = await deleteByTenantId(table, tenantId)
      totalDeleted += count
      console.log(`  ✓ Deleted ${count} records from ${table}`)
    } catch (err) {
      console.error(`  ✗ Failed to delete from ${table}:`, err)
    }
  }

  console.log(`\n✅ Deleted ${totalDeleted} total records`)
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
```

### Step 4: Make scripts executable

Run:
```bash
chmod +x skills/bustly-mock-data/scripts/*.ts
```

### Step 5: Commit scripts

Run:
```bash
git add scripts/
git commit -m "feat: add CLI scripts for generate, status, and clean operations"
```

---

## Task 8: Integration Testing

**Files:**
- Create: `skills/bustly-mock-data/tests/integration/test-full-flow.ts`

### Step 1: Create integration test

Create `skills/bustly-mock-data/tests/integration/test-full-flow.ts`:

```typescript
/**
 * Integration test - Full generation flow
 */

import { analyzePlatform, determineStrategy } from '../../lib/analyzer/index.js'
import { generatePlatformData } from '../../lib/generator/index.js'
import { insertBatch } from '../../lib/supabase/inserter.js'

async function test() {
  console.log('🧪 Integration Test: Full Flow\n')

  const platform = 'shopify'
  const tenantId = 'test_tenant'

  try {
    // Step 1: Analyze
    console.log('Step 1: Analyzing existing data...')
    const schema = ['semantic.dm_products_shopify', 'semantic.dm_orders_shopify', 'semantic.dm_customers_shopify']
    const analysis = await analyzePlatform(platform, schema)
    console.log('✓ Analysis complete\n')

    // Step 2: Determine strategy
    console.log('Step 2: Determining generation strategy...')
    const { targetCount, mode } = determineStrategy(analysis, 'minimal')
    console.log(`✓ Strategy: ${mode}, target: ${targetCount}\n`)

    // Step 3: Generate data (without inserting)
    console.log('Step 3: Generating mock data...')
    const result = await generatePlatformData(platform, tenantId, targetCount, analysis)
    console.log(`✓ Generated ${result.totalRecords} records\n`)

    // Step 4: Validate data
    console.log('Step 4: Validating generated data...')
    for (const table of result.tables) {
      console.log(`  ${table.table}: ${table.count} records`)
    }
    console.log('✓ Validation complete\n')

    // Step 5: Dry run - don't actually insert
    console.log('Step 5: Skipping actual insert (dry run)')
    console.log('✓ Test complete!')

  } catch (err) {
    console.error('❌ Test failed:', err)
    process.exit(1)
  }
}

test()
```

### Step 2: Run integration test

Run:
```bash
cd skills/bustly-mock-data
tsx tests/integration/test-full-flow.ts
```

Expected output showing successful generation of all tables.

### Step 3: Commit integration test

Run:
```bash
git add tests/
git commit -m "test: add integration test for full generation flow"
```

---

## Task 9: Documentation and Final Polish

**Files:**
- Update: `skills/bustly-mock-data/README.md`
- Create: `skills/bustly-mock-data/CHANGELOG.md`

### Step 1: Create README

Create `skills/bustly-mock-data/README.md`:

```markdown
# Bustly Mock Data Skill

Intelligent mock data generation for e-commerce and advertising platforms.

## Features

- 🧠 Smart analysis of existing data patterns
- 🔗 Business logic aware (foreign keys, calculations)
- 📊 Realistic distributions (prices, dates, funnels)
- 🛒 Complete scenarios (products → orders → pixels)
- 🏪 Multi-platform: Shopify, BigCommerce, WooCommerce, Magento, Google Ads

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure service role keys
cp config/supabase.json.example config/supabase.json
# Edit config/supabase.json with your keys

# Generate mock data
npm run generate shopify smart

# Check status
npm run status

# Clean data (careful!)
npm run clean shopify --confirm
```

## Configuration

Requires two configuration sources:

1. **Base config** from `~/.bustly/bustlyOauth.json` (shared with bustly-search-data)
2. **Service role keys** from `config/supabase.json` (see `config/supabase.json.example`)

## Strategies

- `smart`: Analyze existing data and intelligently scale (default)
- `minimal`: Generate ~10 records for quick testing
- `comprehensive`: Generate ~500 records for full scenarios

## Development

```bash
# Run integration test
tsx tests/integration/test-full-flow.ts

# Test specific components
tsx -e "import('./lib/analyzer/index.js')"
```

## Safety

- All operations scoped to current workspace
- Transaction protection with rollback
- Service role keys never committed to git
- Clean operations require confirmation

## Architecture

Five-layer architecture:
1. Agent Interface - Tool interface for OpenClaw
2. Data Analysis - Analyze existing patterns
3. Business Rules - Platform rules and constraints
4. Data Generation - Generate mock data
5. Supabase Interface - Database operations

See design doc: `docs/plans/2026-02-09-bustly-mock-data-design.md`
```

### Step 2: Create CHANGELOG

Create `skills/bustly-mock-data/CHANGELOG.md`:

```markdown
# Changelog

## [0.1.0] - 2026-02-09

### Added
- Initial release of bustly-mock-data skill
- Smart data analysis (scale, distributions)
- Business rules layer with Shopify schema
- Data generators for Shopify (6 tables)
- CLI scripts: generate, status, clean
- Configuration management with service role keys
- Integration tests

### Supported Platforms
- Shopify (products, variants, customers, orders, order_items, pixel_events)

### Planned
- BigCommerce support
- WooCommerce support
- Magento support
- Google Ads support
- Cross-platform linking (ads → orders)
```

### Step 3: Final commit

Run:
```bash
git add README.md CHANGELOG.md skill.md
git commit -m "docs: add README, CHANGELOG, and finalize documentation"
```

### Step 4: View all commits

Run:
```bash
cd skills/bustly-mock-data
git log --oneline
```

---

## Completion Checklist

- [x] Skill skeleton created
- [x] Configuration loading implemented
- [x] Supabase client layer implemented
- [x] Data analysis layer implemented
- [x] Business rules layer implemented (Shopify)
- [x] Data generation layer implemented (Shopify)
- [x] CLI scripts created
- [x] Integration tests passing
- [x] Documentation complete
- [x] All commits local (not pushed to remote)

## Local Testing

Test the skill locally:

```bash
cd skills/bustly-mock-data

# Check status
npm run status

# Generate minimal data
npm run generate shopify minimal

# Generate smart data
npm run generate shopify smart

# Clean if needed
npm run clean shopify --confirm
```

## Next Steps

1. Configure actual Supabase service role keys in `config/supabase.json`
2. Test with real workspace data
3. Implement remaining platforms (BigCommerce, WooCommerce, Magento, Google Ads)
4. Add OpenClaw tool interface layer
5. Enhance distribution analysis (funnels, associations)
6. Add transaction rollback protection
