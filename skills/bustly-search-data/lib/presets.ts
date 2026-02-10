/**
 * Dynamic Query Presets (Multi-Platform with Schema Support)
 *
 * Pre-built query templates that automatically adapt to available data sources.
 * Supports Shopify, BigCommerce, WooCommerce, Magento, and Google Ads.
 *
 * Uses platform-schemas.ts to handle column name differences across platforms.
 */

import { runSelectQuery } from './supabase_api'
import {
  detectAvailablePlatforms,
  getPrimaryPlatform,
  getOrderPlatforms
} from './data-source-detector'
import { buildSelectClause, getPlatformSchema } from './platform-schemas'

// ============================================
// Platform-Agnostic Query Functions
// ============================================

/**
 * Get shop information from all available platforms
 * Handles column name differences across platforms
 */
export async function getShopInfo() {
  const platforms = await detectAvailablePlatforms()
  const results: any[] = []

  for (const platform of platforms) {
    if (platform.tables.shopInfo) {
      try {
        const schema = getPlatformSchema(platform.name)
        const tableName = platform.tables.shopInfo

        // Build platform-specific SELECT clause
        const selectClause = buildSelectClause(platform.name, 'shopInfo', [
          'shopName',
          'shopDomain',
          'currency',
          'timezone',
          'hasStorefront'
        ])

        // Add optional columns that exist for Shopify but not others
        const optionalCols: string[] = []
        if (schema.shopInfo.planName) {
          optionalCols.push(`${schema.shopInfo.planName} as planName`)
        }
        if (schema.shopInfo.moneyFormat) {
          optionalCols.push(`money_with_currency_format as moneyFormat`)
        }

        const finalSelect = optionalCols.length > 0
          ? `${selectClause},\n    ${optionalCols.join(',\n    ')}`
          : selectClause

        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
    ${finalSelect}
  FROM ${tableName}
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

  // Build platform-specific SELECT clauses
  const unionQueries = await Promise.all(
    platforms.map(async (platform) => {
      const schema = getPlatformSchema(platform.name)
      const tableName = platform.tables.orders!

      const selectClause = buildSelectClause(platform.name, 'orders', [
        'orderId',
        'orderNumber',
        'totalPrice',
        'currency',
        'financialStatus',
        'fulfillmentStatus',
        'createdAt'
      ])

      return `
        SELECT
          '${platform.name}' as platform,
    ${selectClause}
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
    const schema = getPlatformSchema(platform.name)
    const tableName = platform.tables.orders!

    // Use platform-specific column names
    const priceCol = schema.orders.totalPrice
    const statusCol = schema.orders.financialStatus || 'status'
    const dateCol = schema.orders.createdAt

    return `
      SELECT
        ${dateCol} as created_at,
        ${priceCol} as total_price,
        currency,
        '${platform.name}' as platform
      FROM ${tableName}
      WHERE ${dateCol} >= NOW() - INTERVAL '${days} days'
        AND ${statusCol} IN ('paid', 'completed')
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

  const queries: string[] = []

  for (const platform of platforms) {
    if (platform.tables.orderItems && platform.tables.orders) {
      // Platform has order_items table (preferred)
      const orderSchema = getPlatformSchema(platform.name)
      const itemSchema = orderSchema.orderItems

      const priceCol = itemSchema.price || 'price'
      const qtyCol = itemSchema.quantity || 'quantity'
      const discountCol = itemSchema.totalDiscount
      const nameCol = itemSchema.productName || 'name'
      const skuCol = itemSchema.sku || 'sku'

      const optionalCols = []
      if (discountCol) {
        optionalCols.push(`SUM(${discountCol}) as total_discount`)
      }

      const query = `
        SELECT
          '${platform.name}' as platform,
          ${nameCol} as product_title,
          ${skuCol} as sku,
          COUNT(*) as times_ordered,
          SUM(${qtyCol}) as total_quantity
          ${optionalCols.length > 0 ? ',\n    ' + optionalCols.join(',\n    ') : ''}
        FROM ${platform.tables.orderItems} oi
        JOIN ${platform.tables.orders} o ON oi.${orderSchema.orderItems.orderId} = o.${orderSchema.orders.orderId}
        WHERE o.${orderSchema.orders.createdAt} >= NOW() - INTERVAL '${days} days'
          AND o.${orderSchema.orders.financialStatus || 'status'} IN ('paid', 'completed')
        GROUP BY ${nameCol}, ${skuCol}
      `
      queries.push(query)
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
      SUM(total_revenue) as total_revenue
    FROM (
      SELECT
        product_title,
        sku,
        times_ordered,
        total_quantity,
        ${queries.length > 0 ? 'COALESCE(total_discount, 0)' : '0'} as total_discount,
        (CASE WHEN total_discount IS NOT NULL THEN (price * quantity - total_discount) ELSE (price * quantity) END) as total_revenue
      FROM all_products
    ) grouped
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
        const schema = getPlatformSchema(platform.name)
        const tableName = platform.tables.customers

        const selectClause = buildSelectClause(platform.name, 'customers', [
          'customerId',
          'email',
          'ordersCount',
          'totalSpent'
        ])

        // Handle name fields (may have first_name/last_name or just name)
        const hasFirstLast = schema.customers.firstName && schema.customers.lastName
        const nameExpr = hasFirstLast
          ? `COALESCE(${schema.customers.firstName} || ' ' || ${schema.customers.lastName}, ${schema.customers.firstName}, ${schema.customers.lastName}, 'Unknown') as name`
          : `'Unknown' as name`

        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
    ${selectClause},
    ${nameExpr}
  FROM ${tableName}
  WHERE ${schema.customers.ordersCount || '0'} > 0
  ORDER BY ${schema.customers.totalSpent || '0'} DESC
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
    .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
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
        const schema = getPlatformSchema(platform.name)
        const variantSchema = schema.variants
        const productSchema = schema.products

        const selectClause = buildSelectClause(platform.name, 'variants', [
          'sku',
          'price',
          'title'
        ])

        const qtyCol = variantSchema.inventoryQuantity

        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
    ${selectClause},
    ${productSchema.title} as product_title,
    ${productSchema.productType || 'NULL'} as product_type,
    ${qtyCol} as inventory_quantity
  FROM ${platform.tables.variants} v
  JOIN ${platform.tables.products} p ON v.${variantSchema.productId} = p.${productSchema.productId}
  ORDER BY ${qtyCol || '0'} ASC
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
        const schema = getPlatformSchema(platform.name)

        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
            ${schema.orderItems.orderId} as order_id,
            ${schema.orderItems.productName || 'name'} as product_title,
            ${schema.orderItems.variantTitle || 'title'} as variant_title,
            ${schema.orderItems.sku} as sku,
            ${schema.orderItems.quantity} as quantity,
            ${schema.orderItems.price} as price,
            ${schema.orderItems.totalDiscount || '0'} as total_discount
          FROM ${platform.tables.orderItems}
          WHERE ${schema.orderItems.orderId} = '${orderId}'
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
        const schema = getPlatformSchema(platform.name)

        const priceCol = schema.orderItems.price
        const qtyCol = schema.orderItems.quantity
        const typeCol = schema.products.productType

        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
            ${typeCol || 'NULL'} as product_type,
            COUNT(DISTINCT oi.${schema.orderItems.orderId}) as order_count,
            SUM(${qtyCol}) as total_quantity,
            SUM(${priceCol} * ${qtyCol}) as total_revenue
          FROM ${platform.tables.orderItems} oi
          JOIN ${platform.tables.orders} o ON oi.${schema.orderItems.orderId} = o.${schema.orders.orderId}
          JOIN ${platform.tables.products} p ON oi.${schema.orderItems.productId} = p.${schema.products.productId}
          WHERE o.${schema.orders.createdAt} >= NOW() - INTERVAL '${days} days'
            AND o.${schema.orders.financialStatus || 'status'} IN ('paid', 'completed')
          GROUP BY ${typeCol || 'NULL'}
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
