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
