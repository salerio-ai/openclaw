/**
 * Enhanced data analyzer that collects real data patterns
 *
 * Analyzes existing data to extract:
 * - Value distributions for all fields
 * - Unique values and their frequencies
 * - Field relationships and correlations
 */

import { getTableSchema } from '../supabase/client.js'
import { runSelectQuery } from '../supabase/client.js'

export interface FieldPattern {
  fieldName: string
  dataType: string
  uniqueValues: string[]
  valueCounts: Record<string, number>
  sampleValues: any[]
  nullCount: number
  totalCount: number
}

export interface TablePatterns {
  tableName: string
  patterns: Map<string, FieldPattern>
  sampleSize: number
}

export interface PlatformPatterns {
  platform: string
  tables: Map<string, TablePatterns>
}

/**
 * Analyze a single table to extract field patterns
 */
export async function analyzeTablePatterns(
  tableName: string,
  sampleLimit: number = 1000
): Promise<TablePatterns> {
  console.log(`  Analyzing ${tableName}...`)

  // Get table schema
  const columns = await getTableSchema(tableName)
  const patterns = new Map<string, FieldPattern>()
  const samples: any[] = []

  // Sample actual data from the table
  try {
    const sampleQuery = `SELECT * FROM ${tableName} LIMIT ${sampleLimit}`
    samples.push(...await runSelectQuery(sampleQuery))
  } catch (err) {
    console.warn(`    Warning: Could not sample data from ${tableName}`)
    return {
      tableName,
      patterns,
      sampleSize: 0
    }
  }

  // Analyze each column
  for (const column of columns) {
    const fieldName = column.column_name
    const dataType = column.data_type

    const valueCounts = new Map<string, number>()
    const uniqueValues = new Set<string>()
    let nullCount = 0

    // Collect all non-null values
    for (const row of samples) {
      const value = row[fieldName]

      if (value === null || value === undefined) {
        nullCount++
      } else {
        const strValue = String(value)
        uniqueValues.add(strValue)
        valueCounts.set(strValue, (valueCounts.get(strValue) || 0) + 1)
      }
    }

    // For fields with too many unique values, keep top N most common
    const maxUniqueValues = 100
    let topValues: string[]

    if (uniqueValues.size > maxUniqueValues) {
      // Sort by frequency and keep top values
      const sorted = [...valueCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxUniqueValues)
      topValues = sorted.map(e => e[0])
    } else {
      topValues = [...uniqueValues]
    }

    // Collect sample values (preserve original types)
    const sampleValues: any[] = []
    for (const row of samples.slice(0, 10)) {
      const value = row[fieldName]
      if (value !== null && value !== undefined) {
        sampleValues.push(value)
        if (sampleValues.length >= 10) break
      }
    }

    patterns.set(fieldName, {
      fieldName,
      dataType,
      uniqueValues: topValues,
      valueCounts: Object.fromEntries(valueCounts),
      sampleValues,
      nullCount,
      totalCount: samples.length
    })
  }

  console.log(`    ✓ Analyzed ${patterns.size} fields from ${samples.length} records`)

  return {
    tableName,
    patterns,
    sampleSize: samples.length
  }
}

/**
 * Analyze all tables for a platform
 */
export async function analyzePlatformPatterns(
  platform: string,
  tables: string[]
): Promise<PlatformPatterns> {
  console.log(`\n📊 Analyzing ${platform} data patterns...`)

  const tablePatterns = new Map<string, TablePatterns>()

  for (const tableName of tables) {
    const patterns = await analyzeTablePatterns(tableName)
    tablePatterns.set(tableName, patterns)
  }

  return {
    platform,
    tables: tablePatterns
  }
}

/**
 * Sample a value from field patterns
 */
export function sampleValue(
  patterns: TablePatterns,
  fieldName: string,
  fallback?: any
): any {
  const fieldPattern = patterns.patterns.get(fieldName)

  if (!fieldPattern || fieldPattern.sampleValues.length === 0) {
    return fallback
  }

  // Random sample from actual values
  const randomIndex = Math.floor(Math.random() * fieldPattern.sampleValues.length)
  return fieldPattern.sampleValues[randomIndex]
}

/**
 * Sample a unique value from field patterns (for IDs, etc.)
 */
export function sampleUniqueValue(
  patterns: TablePatterns,
  fieldName: string,
  existingValues: Set<any>,
  fallback?: any
): any | null {
  const fieldPattern = patterns.patterns.get(fieldName)

  if (!fieldPattern || fieldPattern.uniqueValues.length === 0) {
    return fallback || null
  }

  // Try to find a value not in existing set
  const maxAttempts = 100
  for (let i = 0; i < maxAttempts; i++) {
    const randomIndex = Math.floor(Math.random() * fieldPattern.uniqueValues.length)
    const value = fieldPattern.uniqueValues[randomIndex]

    // Convert to appropriate type if needed
    const typedValue = convertToFieldType(value, fieldPattern.dataType)

    if (!existingValues.has(typedValue)) {
      return typedValue
    }
  }

  // If no unique value found, generate based on pattern
  return generateValueFromPattern(fieldPattern, existingValues)
}

/**
 * Generate a new value based on field pattern
 */
function generateValueFromPattern(
  fieldPattern: FieldPattern,
  existingValues: Set<any>
): any {
  const sample = fieldPattern.sampleValues[0]

  if (fieldPattern.dataType === 'text' || fieldPattern.dataType === 'character varying') {
    // For text IDs, generate new ones following the pattern
    if (fieldPattern.fieldName.includes('_id') && typeof sample === 'string') {
      // Extract prefix and generate new ID
      const match = sample.match(/^(.+)_\d+$/)
      if (match) {
        const prefix = match[1]
        let counter
        do {
          counter = Math.floor(Math.random() * 1000000)
        } while (existingValues.has(`${prefix}_${counter}`))
        return `${prefix}_${counter}`
      }

      // Timestamp-based IDs
      const match2 = sample.match(/^.+_\d+_[a-z0-9]+$/)
      if (match2) {
        return `${sample.split('_')[0]}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
    }

    // For other text fields, return a sample value
    return sample
  }

  if (fieldPattern.dataType === 'integer' || fieldPattern.dataType === 'bigint') {
    let counter
    do {
      counter = Math.floor(Math.random() * 1000000000)
    } while (existingValues.has(counter))
    return counter
  }

  return sample
}

/**
 * Convert string value to appropriate field type
 */
function convertToFieldType(value: string, dataType: string): any {
  if (dataType === 'integer' || dataType === 'bigint') {
    return parseInt(value, 10)
  }
  if (dataType === 'numeric' || dataType === 'double precision') {
    return parseFloat(value)
  }
  if (dataType === 'boolean') {
    return value === 'true' || value === 't'
  }
  return value
}
