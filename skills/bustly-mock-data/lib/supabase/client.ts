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
