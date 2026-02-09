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
