/**
 * Data Inserter - Batch insert via RPC functions
 *
 * Uses RPC instead of direct REST API because semantic schema tables
 * are not exposed via the REST API by default.
 */

import { config } from '../config.js'

const BATCH_SIZE = 100

/**
 * Insert batch of records via RPC
 */
export async function insertBatch(
  tableName: string,
  rows: any[]
): Promise<InsertResult> {
  if (rows.length === 0) {
    return { inserted: 0, failed: 0, errors: [] }
  }

  const results: InsertResult = { inserted: 0, failed: 0, errors: [] }

  // Try RPC insert first
  try {
    const result = await insertViaRPC(tableName, rows)
    results.inserted = result.inserted
    results.failed = result.failed
    return results
  } catch (rpcError) {
    // Fall back to direct REST API if RPC fails
    console.warn('RPC insert failed, trying direct REST API:', rpcError)
    return await insertViaREST(tableName, rows, results)
  }
}

/**
 * Insert via RPC function (requires install_rpc_functions.sql)
 */
async function insertViaRPC(
  tableName: string,
  rows: any[]
): Promise<{ inserted: number; failed: number }> {
  const url = `${config.supabaseUrl}/rest/v1/rpc/insert_mock_data`

  // Process in batches
  let totalInserted = 0
  let totalFailed = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    // Extract just table name without schema prefix
    const tableNameOnly = tableName.includes('.') ? tableName.split('.')[1] : tableName

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.serviceRoleKey,
        'Authorization': `Bearer ${config.serviceRoleKey}`,
      },
      body: JSON.stringify({
        p_table_name: tableNameOnly,  // Pass table name without schema prefix
        p_records: batch  // Direct JSON object, not stringified
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`RPC insert failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    totalInserted += data.inserted || 0
    totalFailed += data.failed || 0
  }

  return { inserted: totalInserted, failed: totalFailed }
}

/**
 * Insert via direct REST API (requires exposing semantic schema)
 */
async function insertViaREST(
  tableName: string,
  rows: any[],
  results: InsertResult
): Promise<InsertResult> {
  const url = `${config.supabaseUrl}/rest/v1/${tableName}`

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
