/**
 * Data Source Detector
 *
 * Dynamically detects available e-commerce platforms from Supabase tables.
 * This allows the skill to work with any connected data source (Shopify, BigCommerce,
 * WooCommerce, Magento, etc.) without hardcoding platform names.
 */

import { getAvailableTables } from './supabase_api'

export interface PlatformInfo {
  name: string
  suffix: string
  tables: {
    shopInfo?: string
    orders?: string
    orderItems?: string
    products?: string
    variants?: string
    customers?: string
  }
}

// Platform definitions based on table naming conventions
const PLATFORM_DEFINITIONS: Record<string, Omit<PlatformInfo, 'name'>> = {
  shopify: {
    suffix: 'shopify',
    tables: {
      shopInfo: 'semantic.dm_shop_info_shopify',
      orders: 'semantic.dm_orders_shopify',
      orderItems: 'semantic.dm_order_items_shopify',
      products: 'semantic.dm_products_shopify',
      variants: 'semantic.dm_variants_shopify',
      customers: 'semantic.dm_customers_shopify'
    }
  },
  bigcommerce: {
    suffix: 'bigcommerce',
    tables: {
      shopInfo: 'semantic.dm_shop_info_bigcommerce',
      orders: 'semantic.dm_orders_bigcommerce',
      orderItems: 'semantic.dm_order_items_bigcommerce',
      products: 'semantic.dm_products_bigcommerce',
      variants: 'semantic.dm_variants_bigcommerce',
      customers: 'semantic.dm_customers_bigcommerce'
    }
  },
  woocommerce: {
    suffix: 'woocommerce',
    tables: {
      shopInfo: 'semantic.dm_shop_info_woocommerce',
      orders: 'semantic.dm_orders_woocommerce',
      orderItems: 'semantic.dm_order_items_woocommerce',
      products: 'semantic.dm_products_woocommerce',
      variants: 'semantic.dm_variants_woocommerce',
      customers: 'semantic.dm_customers_woocommerce'
    }
  },
  magento: {
    suffix: 'magento',
    tables: {
      shopInfo: 'semantic.dm_shop_info_magento',
      orders: 'semantic.dm_orders_magento',
      orderItems: 'semantic.dm_order_items_magento',
      products: 'semantic.dm_products_magento',
      variants: 'semantic.dm_variants_magento',
      customers: 'semantic.dm_customers_magento'
    }
  },
  google: {
    suffix: 'google',
    tables: {
      // Google Ads has different table structure
      orders: 'semantic.dm_ads_campaigns_google'
    }
  }
}

export interface DetectedPlatform extends PlatformInfo {
  isAvailable: boolean
  hasOrders: boolean
  hasProducts: boolean
  hasCustomers: boolean
}

let cachedPlatforms: DetectedPlatform[] | null = null

/**
 * Detect which e-commerce platforms are available based on actual tables in Supabase
 */
export async function detectAvailablePlatforms(): Promise<DetectedPlatform[]> {
  // Return cached result if available
  if (cachedPlatforms) {
    return cachedPlatforms
  }

  try {
    console.log('Detecting available data sources...')
    const tables = await getAvailableTables()
    const tableNames = new Set(tables.map(t => t.table_name))

    const platforms: DetectedPlatform[] = []

    for (const [platformKey, definition] of Object.entries(PLATFORM_DEFINITIONS)) {
      // Check if any tables for this platform exist
      const availableTables = Object.values(definition.tables).filter(
        tableName => tableNames.has(tableName)
      )

      if (availableTables.length > 0) {
        platforms.push({
          name: platformKey.charAt(0).toUpperCase() + platformKey.slice(1),
          suffix: definition.suffix,
          tables: definition.tables,
          isAvailable: true,
          hasOrders: definition.tables.orders ? tableNames.has(definition.tables.orders) : false,
          hasProducts: definition.tables.products ? tableNames.has(definition.tables.products) : false,
          hasCustomers: definition.tables.customers ? tableNames.has(definition.tables.customers) : false
        })
        console.log(`  ✓ Found ${platformKey} platform (${availableTables.length} tables)`)
      }
    }

    cachedPlatforms = platforms
    return platforms
  } catch (err) {
    console.error('Failed to detect platforms:', err)
    // Fallback to empty array if detection fails
    return []
  }
}

/**
 * Get the primary (first available) platform
 * Useful for simple queries when user doesn't specify a platform
 */
export async function getPrimaryPlatform(): Promise<DetectedPlatform | null> {
  const platforms = await detectAvailablePlatforms()
  // Prefer Shopify if available, otherwise use first available
  const shopify = platforms.find(p => p.suffix === 'shopify')
  return shopify || platforms[0] || null
}

/**
 * Get all platforms that have order data
 */
export async function getOrderPlatforms(): Promise<DetectedPlatform[]> {
  const platforms = await detectAvailablePlatforms()
  return platforms.filter(p => p.hasOrders)
}

/**
 * Get table name for a specific platform and table type
 * Falls back to primary platform if platform not specified
 */
export async function getTableName(
  tableType: 'orders' | 'products' | 'customers' | 'shopInfo' | 'orderItems',
  platformSuffix?: string
): Promise<string | null> {
  const platforms = await detectAvailablePlatforms()

  let platform: DetectedPlatform | undefined

  if (platformSuffix) {
    platform = platforms.find(p => p.suffix === platformSuffix)
  }

  // Fall back to primary platform
  if (!platform) {
    platform = platforms.find(p => p.tables[tableType])
  }

  return platform?.tables[tableType] || null
}

/**
 * Build a UNION query across all available platforms for the given table type
 */
export async function buildUnionQuery(
  tableType: 'orders' | 'products' | 'customers',
  baseQuery: string
): Promise<string> {
  const platforms = await detectAvailablePlatforms()
  const platformsWithTable = platforms.filter(p => p.tables[tableType])

  if (platformsWithTable.length === 0) {
    throw new Error(`No tables found for type: ${tableType}`)
  }

  if (platformsWithTable.length === 1) {
    // Single platform, no need for UNION
    const tableName = platformsWithTable[0].tables[tableType]!
    return baseQuery.replace(/\{\{table_name\}\}/g, tableName)
  }

  // Multiple platforms, build UNION query
  const queries = platformsWithTable.map(platform => {
    const tableName = platform.tables[tableType]!
    return baseQuery.replace(/\{\{table_name\}\}/g, tableName)
  })

  return queries.join('\n    UNION ALL\n')
}

/**
 * Clear the platform detection cache
 * Useful for testing or when platform availability changes
 */
export function clearPlatformCache(): void {
  cachedPlatforms = null
}
