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
