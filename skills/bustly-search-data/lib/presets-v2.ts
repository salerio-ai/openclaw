/**
 * Dynamic Query Presets (Multi-Platform)
 *
 * Pre-built query templates that automatically adapt to available data sources.
 * Supports Shopify, BigCommerce, WooCommerce, Magento, and Google Ads.
 *
 * Unlike the old presets.ts which was hardcoded for Shopify only,
 * this version detects available platforms and queries across all of them.
 */

import { runSelectQuery } from './supabase_api'
import {
  detectAvailablePlatforms,
  getPrimaryPlatform,
  getOrderPlatforms,
  getTableName,
  buildUnionQuery
} from './data-source-detector'

// ============================================
// Platform-Agnostic Query Functions
// ============================================

/**
 * Get shop information from all available platforms
 */
export async function getShopInfo() {
  const platforms = await detectAvailablePlatforms()
  const results: any[] = []

  for (const platform of platforms) {
    if (platform.tables.shopInfo) {
      try {
        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
            shop_name,
            shop_domain,
            currency,
            iana_timezone,
            plan_display_name,
            money_with_currency_format,
            has_storefront
          FROM ${platform.tables.shopInfo}
          LIMIT 1
        `)
        results.push(...data)
      } catch (err) {
        console.warn(`Failed to fetch shop info for ${platform.name}:`, err)
      }
    }
  }

  return results
}

/**
 * Get recent orders from all available platforms
 */
export async function getRecentOrders(limit: number = 10) {
  const platforms = await getOrderPlatforms()

  if (platforms.length === 0) {
    throw new Error('No order tables found in any connected platform')
  }

  // Build a UNION query to get orders from all platforms
  const unionQueries = await Promise.all(
    platforms.map(async (platform) => {
      const tableName = platform.tables.orders!
      return `
        SELECT
          '${platform.name}' as platform,
          order_id,
          order_number,
          total_price,
          currency,
          financial_status,
          fulfillment_status,
          created_at
        FROM ${tableName}
      `
    })
  )

  const query = `
    WITH all_orders AS (
      ${unionQueries.join('\n      UNION ALL\n')}
    )
    SELECT *
    FROM all_orders
    ORDER BY created_at DESC
    LIMIT ${Number(limit)}
  `

  return await runSelectQuery(query)
}

/**
 * Get daily sales summary across all platforms
 */
export async function getDailySalesSummary(days: number = 30) {
  const platforms = await getOrderPlatforms()

  if (platforms.length === 0) {
    throw new Error('No order tables found in any connected platform')
  }

  // Build UNION query for all platforms
  const unionQueries = platforms.map(platform => {
    const tableName = platform.tables.orders!
    return `
      SELECT
        created_at,
        total_price,
        currency,
        '${platform.name}' as platform
      FROM ${tableName}
      WHERE created_at >= NOW() - INTERVAL '${days} days'
        AND financial_status = 'paid'
    `
  })

  const query = `
    WITH all_sales AS (
      ${unionQueries.join('\n      UNION ALL\n')}
    )
    SELECT
      DATE(created_at) as sale_date,
      COUNT(*) as order_count,
      SUM(total_price) as total_revenue,
      AVG(total_price) as avg_order_value
    FROM all_sales
    GROUP BY DATE(created_at)
    ORDER BY sale_date DESC
  `

  return await runSelectQuery(query)
}

/**
 * Get top products by revenue across all platforms
 */
export async function getTopProductsByRevenue(limit: number = 10, days: number = 30) {
  const platforms = await getOrderPlatforms()

  if (platforms.length === 0) {
    throw new Error('No order tables found in any connected platform')
  }

  // For platforms with order_items table, use it; otherwise fallback to orders
  const queries: string[] = []

  for (const platform of platforms) {
    if (platform.tables.orderItems && platform.tables.orders) {
      // Platform has order_items table (preferred)
      queries.push(`
        SELECT
          '${platform.name}' as platform,
          oi.name as product_title,
          oi.sku,
          COUNT(*) as times_ordered,
          SUM(oi.quantity) as total_quantity,
          SUM(oi.total_discount) as total_discount,
          SUM(oi.price * oi.quantity) as total_revenue
        FROM ${platform.tables.orderItems} oi
        JOIN ${platform.tables.orders} o ON oi.order_id = o.order_id
        WHERE o.created_at >= NOW() - INTERVAL '${days} days'
          AND o.financial_status = 'paid'
        GROUP BY oi.name, oi.sku
      `)
    } else if (platform.tables.orders) {
      // Platform only has orders table (basic info)
      queries.push(`
        SELECT
          '${platform.name}' as platform,
          'N/A' as product_title,
          'N/A' as sku,
          COUNT(*) as times_ordered,
          0 as total_quantity,
          0 as total_discount,
          SUM(total_price) as total_revenue
        FROM ${platform.tables.orders}
        WHERE created_at >= NOW() - INTERVAL '${days} days'
          AND financial_status = 'paid'
        GROUP BY 'N/A', 'N/A'
      `)
    }
  }

  if (queries.length === 0) {
    throw new Error('No product data available')
  }

  const query = `
    WITH all_products AS (
      ${queries.join('\n      UNION ALL\n')}
    )
    SELECT
      product_title,
      sku,
      SUM(times_ordered) as times_ordered,
      SUM(total_quantity) as total_quantity,
      SUM(total_discount) as total_discount,
      SUM(total_revenue) as total_revenue
    FROM all_products
    GROUP BY product_title, sku
    ORDER BY total_revenue DESC
    LIMIT ${Number(limit)}
  `

  return await runSelectQuery(query)
}

/**
 * Get top customers across all platforms
 */
export async function getTopCustomers(limit: number = 10) {
  const platforms = await detectAvailablePlatforms()

  const results: any[] = []

  for (const platform of platforms) {
    if (platform.tables.customers) {
      try {
        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
            customer_id,
            email,
            COALESCE(first_name || ' ' || last_name,
                     first_name,
                     last_name,
                     'Unknown') as name,
            orders_count,
            total_spent,
            created_at as customer_since
          FROM ${platform.tables.customers}
          WHERE orders_count > 0
          ORDER BY total_spent DESC
          LIMIT ${Math.ceil(Number(limit) / platforms.length)}
        `)
        results.push(...data)
      } catch (err) {
        console.warn(`Failed to fetch customers for ${platform.name}:`, err)
      }
    }
  }

  // Sort by total_spent and limit
  return results
    .sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
    .slice(0, Number(limit))
}

/**
 * Get inventory status across all platforms
 */
export async function getInventoryStatus(limit: number = 20) {
  const platforms = await detectAvailablePlatforms()

  const results: any[] = []

  for (const platform of platforms) {
    if (platform.tables.variants && platform.tables.products) {
      try {
        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
            v.sku,
            v.inventory_quantity,
            v.price,
            v.title as variant_title,
            p.title as product_title,
            p.product_type,
            p.vendor
          FROM ${platform.tables.variants} v
          JOIN ${platform.tables.products} p ON v.product_id = p.product_id
          ORDER BY v.inventory_quantity ASC
          LIMIT ${Math.ceil(Number(limit) / platforms.length)}
        `)
        results.push(...data)
      } catch (err) {
        console.warn(`Failed to fetch inventory for ${platform.name}:`, err)
      }
    }
  }

  return results
    .sort((a, b) => (a.inventory_quantity || 0) - (b.inventory_quantity || 0))
    .slice(0, Number(limit))
}

/**
 * Get Google Ads campaigns
 */
export async function getGoogleAdsCampaigns(limit: number = 10) {
  return await runSelectQuery(`
    SELECT
      campaign_id,
      campaign_name,
      campaign_status,
      impressions,
      clicks,
      cost_micros,
      conversions,
      ROAS
    FROM semantic.dm_ads_campaigns_google
    ORDER BY cost_micros DESC
    LIMIT ${Number(limit)}
  `)
}

/**
 * Get order items by order ID
 * Auto-detects platform from order ID
 */
export async function getOrderItems(orderId: string) {
  const platforms = await getOrderPlatforms()

  // Try to find order items in each platform
  for (const platform of platforms) {
    if (platform.tables.orderItems) {
      try {
        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
            order_id,
            order_number,
            product_title,
            variant_title,
            sku,
            quantity,
            price,
            total_discount,
            (price * quantity) as line_total
          FROM ${platform.tables.orderItems}
          WHERE order_id = '${orderId}'
        `)

        if (data && data.length > 0) {
          return data
        }
      } catch (err) {
        // Continue to next platform
        console.warn(`No order items found in ${platform.name}`)
      }
    }
  }

  return []
}

/**
 * Get revenue by product category across all platforms
 */
export async function getRevenueByCategory(days: number = 30) {
  const platforms = await getOrderPlatforms()

  const results: any[] = []

  for (const platform of platforms) {
    if (platform.tables.orderItems && platform.tables.orders && platform.tables.products) {
      try {
        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
            p.product_type,
            COUNT(DISTINCT oi.order_id) as order_count,
            SUM(oi.quantity) as total_quantity,
            SUM(oi.price * oi.quantity) as total_revenue
          FROM ${platform.tables.orderItems} oi
          JOIN ${platform.tables.orders} o ON oi.order_id = o.order_id
          JOIN ${platform.tables.products} p ON oi.product_id = p.product_id
          WHERE o.created_at >= NOW() - INTERVAL '${days} days'
            AND o.financial_status = 'paid'
          GROUP BY p.product_type
        `)
        results.push(...data)
      } catch (err) {
        console.warn(`Failed to fetch category data for ${platform.name}:`, err)
      }
    }
  }

  // Aggregate by category
  const categoryMap = new Map<string, any>()

  for (const item of results) {
    const key = item.product_type || 'Uncategorized'
    if (!categoryMap.has(key)) {
      categoryMap.set(key, {
        product_type: key,
        order_count: 0,
        total_quantity: 0,
        total_revenue: 0
      })
    }
    const category = categoryMap.get(key)!
    category.order_count += item.order_count || 0
    category.total_quantity += item.total_quantity || 0
    category.total_revenue += item.total_revenue || 0
  }

  return Array.from(categoryMap.values())
    .sort((a, b) => b.total_revenue - a.total_revenue)
}

/**
 * Get comprehensive data catalog with dynamic platform detection
 */
export async function getDataCatalog(): Promise<Record<string, string[]>> {
  const platforms = await detectAvailablePlatforms()
  const catalog: Record<string, string[]> = {}

  for (const platform of platforms) {
    const tables: string[] = []

    for (const [tableType, tableName] of Object.entries(platform.tables)) {
      if (tableName) {
        const prettyName = tableType
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase())
        tables.push(`${tableName} - ${prettyName}`)
      }
    }

    catalog[platform.name] = tables
  }

  // Always add Google Ads if available
  try {
    await runSelectQuery('SELECT 1 FROM semantic.dm_ads_campaigns_google LIMIT 1')
    catalog['Google Ads'] = [
      'semantic.dm_ads_campaigns_google - Campaign performance',
      'semantic.dm_ads_products_google - Product-level metrics',
      'semantic.dm_ads_keywords_google - Keyword performance',
      'semantic.dm_ads_search_terms_google - Search terms',
      'semantic.dm_ads_creatives_google - Creative performance'
    ]
  } catch {
    // Google Ads not available
  }

  return catalog
}

/**
 * Get a summary of all connected platforms
 */
export async function getConnectedPlatformsSummary() {
  const platforms = await detectAvailablePlatforms()

  return {
    totalPlatforms: platforms.length,
    platforms: platforms.map(p => ({
      name: p.name,
      hasOrders: p.hasOrders,
      hasProducts: p.hasProducts,
      hasCustomers: p.hasCustomers
    }))
  }
}

// ============================================
// Helper Functions
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

// Export all presets as an object
export const presets = {
  getShopInfo,
  getRecentOrders,
  getDailySalesSummary,
  getTopProductsByRevenue,
  getTopCustomers,
  getInventoryStatus,
  getGoogleAdsCampaigns,
  getOrderItems,
  getRevenueByCategory,
  getDataCatalog,
  getConnectedPlatformsSummary,
  formatCurrency,
  formatDate
}
