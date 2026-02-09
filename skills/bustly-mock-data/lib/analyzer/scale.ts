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
