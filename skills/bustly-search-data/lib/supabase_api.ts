/**
 * Supabase API Client
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Request timeout control
 * - Comprehensive error handling
 */

import { config, validateConfig } from './config'

// Validate configuration on import
validateConfig()

// Constants for retry and timeout
const MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 1000
const REQUEST_TIMEOUT_MS = 30000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getRetryDelay(attempt: number): number {
  return BASE_RETRY_DELAY_MS * Math.pow(2, attempt)
}

export class SupabaseApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false,
    public readonly originalError?: unknown
  ) {
    super(message)
    this.name = 'SupabaseApiError'
  }
}

async function rpc(functionName: string, params: Record<string, any> = {}): Promise<any> {
  const url = `${config.supabaseUrl}/rest/v1/rpc/${functionName}`

  let lastError: Error | null = null

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
          throw new SupabaseApiError(
            `Supabase API error: ${response.status} - ${errorText}`,
            response.status,
            false
          )
        }

        lastError = new SupabaseApiError(
          `Supabase RPC error (${response.status}): ${errorText}`,
          response.status,
          isRetryable
        )

        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = getRetryDelay(attempt)
          console.warn(`Retryable error, waiting ${delay}ms before retry (attempt ${attempt + 1}/${MAX_RETRIES})`)
          await sleep(delay)
          continue
        }

        throw lastError
      }

      return await response.json()
    } catch (err) {
      clearTimeout(timeoutId)
      
      if (err instanceof SupabaseApiError) {
        throw err
      }

      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new SupabaseApiError(
          `Request timeout after ${REQUEST_TIMEOUT_MS}ms`,
          undefined,
          true,
          err
        )
      } else {
        lastError = new SupabaseApiError(
          `Network error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          undefined,
          true,
          err
        )
      }

      if (attempt < MAX_RETRIES) {
        const delay = getRetryDelay(attempt)
        console.warn(`Network error, waiting ${delay}ms before retry (attempt ${attempt + 1}/${MAX_RETRIES})`)
        await sleep(delay)
        continue
      }

      throw lastError
    }
  }

  throw lastError
}

export async function getAvailableTables(): Promise<TableInfo[]> {
  try {
    console.log('Fetching available tables...')
    const data = await rpc('get_agent_available_tables')
    console.log(`Found ${data.length} available tables`)
    return data
  } catch (err) {
    console.error('Failed to get available tables:', err)
    throw err
  }
}

export async function getTableSchema(tableName: string): Promise<ColumnInfo[]> {
  if (!tableName || typeof tableName !== 'string') {
    throw new Error('Table name is required and must be a string')
  }

  try {
    console.log(`Fetching schema for table: ${tableName}`)
    const data = await rpc('get_agent_table_schema', {
      p_table_name: tableName
    })
    console.log(`Found ${data.length} columns in table "${tableName}"`)
    return data
  } catch (err) {
    console.error(`Failed to get schema for table "${tableName}":`, err)
    throw err
  }
}

export async function runSelectQuery(query: string): Promise<any[]> {
  if (!query || typeof query !== 'string') {
    throw new Error('Query is required and must be a string')
  }

  const normalizedQuery = query.trim().toUpperCase()
  // Allow SELECT queries and CTEs (WITH clauses)
  if (!normalizedQuery.startsWith('SELECT') && !normalizedQuery.startsWith('WITH')) {
    throw new Error('Only SELECT queries (including CTEs with WITH) are allowed for security reasons')
  }

  const displayQuery = query.length > 200 ? query.substring(0, 200) + '...' : query
  console.log(`Executing query: ${displayQuery}`)

  try {
    const data = await rpc('run_select_ws', {
      p_query: query,
      p_workspace_id: config.workspaceId
    })
    console.log(`Query returned ${data.length} rows`)
    return data
  } catch (err) {
    console.error('Failed to execute query:', err)
    throw err
  }
}

export interface TableInfo {
  table_name: string
  description?: string
}

export interface ColumnInfo {
  column_name: string
  data_type: string
  is_nullable: boolean
  column_default?: string
  description?: string
}
