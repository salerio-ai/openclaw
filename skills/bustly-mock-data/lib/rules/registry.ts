/**
 * Platform registry - Central hub for all platform schemas
 */

import { shopifySchema } from './shopify.js'
import { bigcommerceSchema } from './bigcommerce.js'
import { woocommerceSchema } from './woocommerce.js'
import { magentoSchema } from './magento.js'
import { googleAdsSchema } from './google_ads.js'
import type { PlatformSchema } from './types.js'

const registry = new Map<string, PlatformSchema>()

// Register all platforms
registry.set('shopify', shopifySchema)
registry.set('bigcommerce', bigcommerceSchema)
registry.set('woocommerce', woocommerceSchema)
registry.set('magento', magentoSchema)
registry.set('google_ads', googleAdsSchema)

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
