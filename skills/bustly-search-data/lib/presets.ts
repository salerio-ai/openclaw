/**
 * Helper Functions for bustly-search-data
 *
 * This module provides utility functions to assist with Text2SQL queries.
 * Core querying is done via supabase_api.ts functions.
 */

import { runSelectQuery } from './supabase_api'
import { detectAvailablePlatforms } from './data-source-detector'

// ============================================
// Platform Discovery Helpers
// ============================================

/**
 * Get comprehensive data catalog with dynamic platform detection
 * Useful for AI to understand what tables are available
 */
export async function getDataCatalog(): Promise<Record<string, string[]>> {
  const platforms = await detectAvailablePlatforms()
  const catalog: Record<string, string[]> = {}

  for (const platform of platforms) {
    const tables: string[] = []

    for (const [tableType, tableName] of Object.entries(platform.tables)) {
      const prettyName = tableType
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
      tables.push(`${tableName} - ${prettyName}`)
    }

    catalog[platform.name] = tables
  }

  return catalog
}

/**
 * Get a summary of all connected platforms
 * Useful for AI to understand which platforms have data
 */
export async function getConnectedPlatformsSummary() {
  const platforms = await detectAvailablePlatforms()

  return {
    totalPlatforms: platforms.length,
    ecommerceCount: platforms.filter(p => p.type === 'ecommerce').length,
    advertisingCount: platforms.filter(p => p.type === 'advertising').length,
    platforms: platforms.map(p => ({
      name: p.name,
      type: p.type,
      hasOrders: p.hasOrders,
      hasProducts: p.hasProducts,
      hasCustomers: p.hasCustomers,
      hasCampaigns: p.hasCampaigns
    }))
  }
}

// Re-export platform detector for convenience
export {
  detectAvailablePlatforms,
  getEcommercePlatforms,
  getAdvertisingPlatforms,
  getPrimaryEcommercePlatform,
  getTableName,
  clearPlatformCache
} from './data-source-detector'

// ============================================
// Formatting Helpers
// ============================================

export function formatCurrency(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(value)
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// ============================================
// Schema Cache Management
// ============================================

import { clearSchemaCache as clearDynamicSchemaCache } from './schema-manager'

/**
 * Clear schema cache (useful for testing or when schema changes)
 */
export function clearSchemaCache() {
  clearDynamicSchemaCache()
}

// Re-export schema utilities
export { COLUMN_PATTERNS, findColumnByPattern, buildDynamicSelect, getTableSchemaCached } from './schema-manager'

// Re-export core API for convenience
export { getAvailableTables, getTableSchema, runSelectQuery } from './supabase_api'
