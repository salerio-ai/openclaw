/**
 * Data Source Detector
 *
 * Dynamically detects available e-commerce platforms and ad platforms from Supabase tables.
 *
 * Platform types:
 * - E-commerce: Shopify, BigCommerce, WooCommerce, Magento
 * - Advertising: Google Ads
 */

import { getAvailableTables } from './supabase_api'

export interface PlatformInfo {
  name: string
  type: 'ecommerce' | 'advertising'
  suffix: string
  tables: Record<string, string>  // Flexible: key = table type, value = actual table name
}

// E-commerce platform definitions
const ECOMMERCE_PLATFORMS = {
  shopify: {
    shopInfo: 'semantic.dm_shop_info_shopify',
    orders: 'semantic.dm_orders_shopify',
    orderItems: 'semantic.dm_order_items_shopify',
    products: 'semantic.dm_products_shopify',
    variants: 'semantic.dm_variants_shopify',
    customers: 'semantic.dm_customers_shopify'
  },
  bigcommerce: {
    shopInfo: 'semantic.dm_shop_info_bigcommerce',
    orders: 'semantic.dm_orders_bigcommerce',
    orderItems: 'semantic.dm_order_items_bigcommerce',
    products: 'semantic.dm_products_bigcommerce',
    variants: 'semantic.dm_variants_bigcommerce',
    customers: 'semantic.dm_customers_bigcommerce'
  },
  woocommerce: {
    shopInfo: 'semantic.dm_shop_info_woocommerce',
    orders: 'semantic.dm_orders_woocommerce',
    orderItems: 'semantic.dm_order_items_woocommerce',
    products: 'semantic.dm_products_woocommerce',
    variants: 'semantic.dm_variants_woocommerce',
    customers: 'semantic.dm_customers_woocommerce'
  },
  magento: {
    shopInfo: 'semantic.dm_shop_info_magento',
    orders: 'semantic.dm_orders_magento',
    orderItems: 'semantic.dm_order_items_magento',
    products: 'semantic.dm_products_magento',
    variants: 'semantic.dm_variants_magento',
    customers: 'semantic.dm_customers_magento'
  }
}

// Advertising platform definitions
const ADVERTISING_PLATFORMS = {
  google: {
    campaigns: 'semantic.dm_ads_campaigns_google',
    products: 'semantic.dm_ads_products_google',
    keywords: 'semantic.dm_ads_keywords_google',
    searchTerms: 'semantic.dm_ads_search_terms_google',
    creatives: 'semantic.dm_ads_creatives_google'
  }
}

export interface DetectedPlatform extends PlatformInfo {
  isAvailable: boolean
  // E-commerce specific
  hasOrders?: boolean
  hasProducts?: boolean
  hasCustomers?: boolean
  // Advertising specific
  hasCampaigns?: boolean
  hasAdData?: boolean
}

let cachedPlatforms: DetectedPlatform[] | null = null

/**
 * Detect which platforms are available based on actual tables in Supabase
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

    // Detect e-commerce platforms
    for (const [platformKey, platformTables] of Object.entries(ECOMMERCE_PLATFORMS)) {
      const availableTables = Object.values(platformTables).filter(
        tableName => tableNames.has(tableName)
      )

      if (availableTables.length > 0) {
        platforms.push({
          name: platformKey.charAt(0).toUpperCase() + platformKey.slice(1),
          type: 'ecommerce',
          suffix: platformKey,
          tables: platformTables,
          isAvailable: true,
          hasOrders: tableNames.has(platformTables.orders),
          hasProducts: tableNames.has(platformTables.products),
          hasCustomers: tableNames.has(platformTables.customers)
        })
        console.log(`  ✓ Found ${platformKey} (e-commerce, ${availableTables.length} tables)`)
      }
    }

    // Detect advertising platforms
    for (const [platformKey, platformTables] of Object.entries(ADVERTISING_PLATFORMS)) {
      const availableTables = Object.values(platformTables).filter(
        tableName => tableNames.has(tableName)
      )

      if (availableTables.length > 0) {
        platforms.push({
          name: platformKey.charAt(0).toUpperCase() + platformKey.slice(1) + ' Ads',
          type: 'advertising',
          suffix: platformKey,
          tables: platformTables,
          isAvailable: true,
          hasCampaigns: tableNames.has(platformTables.campaigns),
          hasAdData: availableTables.length > 0
        })
        console.log(`  ✓ Found ${platformKey} (advertising, ${availableTables.length} tables)`)
      }
    }

    cachedPlatforms = platforms
    return platforms
  } catch (err) {
    console.error('Failed to detect platforms:', err)
    return []
  }
}

/**
 * Get only e-commerce platforms
 */
export async function getEcommercePlatforms(): Promise<DetectedPlatform[]> {
  const platforms = await detectAvailablePlatforms()
  return platforms.filter(p => p.type === 'ecommerce')
}

/**
 * Get only advertising platforms
 */
export async function getAdvertisingPlatforms(): Promise<DetectedPlatform[]> {
  const platforms = await detectAvailablePlatforms()
  return platforms.filter(p => p.type === 'advertising')
}

/**
 * Get the primary e-commerce platform (prefer Shopify)
 */
export async function getPrimaryEcommercePlatform(): Promise<DetectedPlatform | null> {
  const platforms = await getEcommercePlatforms()
  return platforms.find(p => p.suffix === 'shopify') || platforms[0] || null
}

/**
 * Get table name for a specific platform and table type
 */
export async function getTableName(
  tableType: string,
  platformSuffix?: string
): Promise<string | null> {
  const platforms = await detectAvailablePlatforms()

  let platform: DetectedPlatform | undefined

  if (platformSuffix) {
    platform = platforms.find(p => p.suffix === platformSuffix)
  }

  // Fall back to first platform that has this table type
  if (!platform) {
    platform = platforms.find(p => p.tables[tableType])
  }

  return platform?.tables[tableType] || null
}

/**
 * Clear the platform detection cache
 */
export function clearPlatformCache(): void {
  cachedPlatforms = null
}
