/**
 * Dynamic Query Presets with Real-time Schema Detection
 *
 * This version queries DDL schema from Supabase in real-time,
 * then builds queries dynamically based on actual table structure.
 *
 * No hardcoded platform assumptions - works with any schema.
 */

import { runSelectQuery } from './supabase_api'
import { detectAvailablePlatforms } from './data-source-detector'
import {
  getTableSchemaCached,
  buildDynamicSelect,
  COLUMN_PATTERNS,
  clearSchemaCache as clearDynamicSchemaCache
} from './schema-manager'

// ============================================
// Dynamic Query Functions
// ============================================

/**
 * Get shop information from all available platforms
 * Uses real-time schema detection for each platform
 */
export async function getShopInfo() {
  const platforms = await detectAvailablePlatforms()
  const results: any[] = []

  for (const platform of platforms) {
    if (platform.tables.shopInfo) {
      try {
        const tableName = platform.tables.shopInfo
        const schema = await getTableSchemaCached(tableName)

        // Build SELECT dynamically based on actual columns
        const { selectClause } = buildDynamicSelect(tableName, {
          shopName: COLUMN_PATTERNS.shopName,
          shopDomain: COLUMN_PATTERNS.shopDomain,
          currency: COLUMN_PATTERNS.currency,
          timezone: COLUMN_PATTERNS.timezone,
          hasStorefront: COLUMN_PATTERNS.hasStorefront,
          // Add optional columns if they exist
          planName: COLUMN_PATTERNS.planName
        }, schema)

        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
    ${selectClause}
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
  const platforms = await detectAvailablePlatforms()

  if (platforms.length === 0) {
    throw new Error('No order tables found in any connected platform')
  }

  // Build dynamic queries for each platform
  const unionQueries: string[] = []

  for (const platform of platforms) {
    if (platform.tables.orders) {
      try {
        const tableName = platform.tables.orders
        const schema = await getTableSchemaCached(tableName)

        const { selectClause } = buildDynamicSelect(tableName, {
          orderId: COLUMN_PATTERNS.orderId,
          orderNumber: COLUMN_PATTERNS.orderNumber,
          totalPrice: COLUMN_PATTERNS.totalPrice,
          currency: COLUMN_PATTERNS.currency,
          financialStatus: COLUMN_PATTERNS.financialStatus,
          fulfillmentStatus: COLUMN_PATTERNS.fulfillmentStatus,
          createdAt: COLUMN_PATTERNS.createdAt
        }, schema)

        unionQueries.push(`
          SELECT
            '${platform.name}' as platform,
    ${selectClause}
  FROM ${tableName}
`)
      } catch (err) {
        console.warn(`Failed to query orders for ${platform.name}:`, err)
      }
    }
  }

  if (unionQueries.length === 0) {
    throw new Error('No order data available')
  }

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
  const platforms = await detectAvailablePlatforms()

  if (platforms.length === 0) {
    throw new Error('No order tables found in any connected platform')
  }

  const unionQueries: string[] = []

  for (const platform of platforms) {
    if (platform.tables.orders) {
      try {
        const tableName = platform.tables.orders
        const schema = await getTableSchemaCached(tableName)

        // Find required columns dynamically
        const dateCol = findColumnByPattern(schema, COLUMN_PATTERNS.createdAt)
        const priceCol = findColumnByPattern(schema, COLUMN_PATTERNS.totalPrice)
        const statusCol = findColumnByPattern(schema, COLUMN_PATTERNS.financialStatus)

        if (!dateCol || !priceCol) {
          console.warn(`Skipping ${platform.name}: missing required columns`)
          continue
        }

        const statusMatch = statusCol
          ? `${statusCol.actualColumn} IN ('paid', 'completed', 'success')`
          : '1=1'  // No status column, get all

        unionQueries.push(`
          SELECT
            ${dateCol.actualColumn} as created_at,
            ${priceCol.actualColumn} as total_price,
            currency,
            '${platform.name}' as platform
          FROM ${tableName}
          WHERE ${dateCol.actualColumn} >= NOW() - INTERVAL '${days} days
            AND ${statusMatch}
        `)
      } catch (err) {
        console.warn(`Failed to query sales for ${platform.name}:`, err)
      }
    }
  }

  if (unionQueries.length === 0) {
    throw new Error('No sales data available')
  }

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
  const platforms = await detectAvailablePlatforms()

  const queries: string[] = []

  for (const platform of platforms) {
    // Try to use order_items if available
    if (platform.tables.orderItems && platform.tables.orders) {
      try {
        const itemSchema = await getTableSchemaCached(platform.tables.orderItems)
        const orderSchema = await getTableSchemaCached(platform.tables.orders)

        // Find required columns
        const productName = findColumnByPattern(itemSchema, COLUMN_PATTERNS.productName)
        const sku = findColumnByPattern(itemSchema, COLUMN_PATTERNS.sku)
        const qty = findColumnByPattern(itemSchema, COLUMN_PATTERNS.quantity)
        const price = findColumnByPattern(itemSchema, COLUMN_PATTERNS.price)

        if (!productName || !qty || !price) {
          console.warn(`Skipping ${platform.name}: missing required columns`)
          continue
        }

        // Find JOIN columns
        const itemOrderId = findColumnByPattern(itemSchema, COLUMN_PATTERNS.orderId)
        const orderOrderId = findColumnByPattern(orderSchema, COLUMN_PATTERNS.orderId)
        const orderCreatedAt = findColumnByPattern(orderSchema, COLUMN_PATTERNS.createdAt)
        const orderStatus = findColumnByPattern(orderSchema, COLUMN_PATTERNS.financialStatus)

        if (!itemOrderId || !orderOrderId || !orderCreatedAt) {
          console.warn(`Skipping ${platform.name}: missing JOIN columns`)
          continue
        }

        const dateMatch = orderStatus
          ? `${orderStatus.actualColumn} IN ('paid', 'completed', 'success')`
          : '1=1'

        const selectParts = [
          `'${platform.name}' as platform`,
          `${productName.actualColumn} as product_title`,
          sku ? `${sku.actualColumn} as sku` : `'N/A' as sku`,
          'COUNT(*) as times_ordered',
          `${qty.actualColumn} as total_quantity`
        ]

        // Add optional columns
        const priceCol = price.actualColumn
        selectParts.push(`SUM(${priceCol} * ${qty.actualColumn}) as total_revenue`)

        const query = `
          SELECT
    ${selectParts.join(',\n    ')}
  FROM ${platform.tables.orderItems} oi
  JOIN ${platform.tables.orders} o ON oi.${itemOrderId.actualColumn} = o.${orderOrderId.actualColumn}
  WHERE o.${orderCreatedAt.actualColumn} >= NOW() - INTERVAL '${days} days'
    AND ${dateMatch}
  GROUP BY ${productName.actualColumn}
        `
        queries.push(query)
      } catch (err) {
        console.warn(`Failed to query products for ${platform.name}:`, err)
      }
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
        const tableName = platform.tables.customers
        const schema = await getTableSchemaCached(tableName)

        const { selectClause } = buildDynamicSelect(tableName, {
          customerId: COLUMN_PATTERNS.customerId,
          email: COLUMN_PATTERNS.email,
          ordersCount: COLUMN_PATTERNS.ordersCount,
          totalSpent: COLUMN_PATTERNS.totalSpent
        }, schema)

        // Handle name fields (may have first_name/last_name or just name)
        const hasFirst = findColumnByPattern(schema, COLUMN_PATTERNS.firstName)
        const hasLast = findColumnByPattern(schema, COLUMN_PATTERNS.lastName)

        let nameExpr = `'Unknown' as name`
        if (hasFirst && hasLast) {
          nameExpr = `COALESCE(${hasFirst.actualColumn} || ' ' || ${hasLast.actualColumn}, ${hasFirst.actualColumn}, ${hasLast.actualColumn})`
        } else if (hasFirst) {
          nameExpr = hasFirst.actualColumn
        } else if (hasLast) {
          nameExpr = hasLast.actualColumn
        }

        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
    ${selectClause},
    ${nameExpr}
  FROM ${tableName}
  WHERE ${COLUMN_PATTERNS.ordersCount[0]} > 0
  ORDER BY ${COLUMN_PATTERNS.totalSpent[0]} DESC
  LIMIT ${Math.ceil(Number(limit) / platforms.length)}
`)
        results.push(...data)
      } catch (err) {
        console.warn(`Failed to fetch customers for ${platform.name}:`, err)
      }
    }
  }

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
        const variantSchema = await getTableSchemaCached(platform.tables.variants)
        const productSchema = await getTableSchemaCached(platform.tables.products)

        // Build SELECT clause dynamically
        const variantSelect = buildDynamicSelect(platform.tables.variants, {
          sku: COLUMN_PATTERNS.sku,
          price: COLUMN_PATTERNS.price,
          title: COLUMN_PATTERNS.variantTitle
        }, variantSchema)

        // Find inventory column
        const invCol = findColumnByPattern(variantSchema, COLUMN_PATTERNS.inventoryQuantity)

        const selectParts = [
          `'${platform.name}' as platform`,
          variantSelect.selectClause,
          `${productSchema.title?.actualColumn || 'name'} as product_title`,
          productSchema.productType?.actualColumn || 'NULL' as product_type
        ]

        if (invCol) {
          selectParts.push(`${invCol.actualColumn} as inventory_quantity`)
        } else {
          selectParts.push('0 as inventory_quantity')
        }

        const data = await runSelectQuery(`
          SELECT
    ${selectParts.join(',\n    ')}
  FROM ${platform.tables.variants} v
  JOIN ${platform.tables.products} p ON v.${variantSchema.productId?.actualColumn || 'product_id'} = p.${productSchema.productId?.actualColumn || 'id'}
  ORDER BY ${invCol?.actualColumn || '0'} ASC
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
 */
export async function getOrderItems(orderId: string) {
  const platforms = await detectAvailablePlatforms()

  for (const platform of platforms) {
    if (platform.tables.orderItems) {
      try {
        const schema = await getTableSchemaCached(platform.tables.orderItems)

        // Build SELECT dynamically
        const { selectClause } = buildDynamicSelect(platform.tables.orderItems, {
          orderId: COLUMN_PATTERNS.orderId,
          productName: COLUMN_PATTERNS.productName,
          variantTitle: COLUMN_PATTERNS.variantTitle,
          sku: COLUMN_PATTERNS.sku,
          quantity: COLUMN_PATTERNS.quantity,
          price: COLUMN_PATTERNS.price,
          totalDiscount: COLUMN_PATTERNS.totalDiscount
        }, schema)

        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
    ${selectClause}
  FROM ${platform.tables.orderItems}
  WHERE ${COLUMN_PATTERNS.orderId[0]} = '${orderId}'
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
 * Get revenue by category across all platforms
 */
export async function getRevenueByCategory(days: number = 30) {
  const platforms = await detectAvailablePlatforms()
  const results: any[] = []

  for (const platform of platforms) {
    if (platform.tables.orderItems && platform.tables.orders && platform.tables.products) {
      try {
        const itemSchema = await getTableSchemaCached(platform.tables.orderItems)
        const productSchema = await getTableSchemaCached(platform.tables.products)
        const orderSchema = await getTableSchemaCached(platform.tables.orders)

        // Find required columns
        const productId = findColumnByPattern(itemSchema, COLUMN_PATTERNS.productId)
        const productType = productSchema.productType?.actualColumn
        const qty = findColumnByPattern(itemSchema, COLUMN_PATTERNS.quantity)
        const price = findColumnByPattern(itemSchema, COLUMN_PATTERNS.price)
        const itemOrderId = findColumnByPattern(itemSchema, COLUMN_PATTERNS.orderId)
        const orderOrderId = findColumnByPattern(orderSchema, COLUMN_PATTERNS.orderId)
        const orderCreatedAt = findColumnByPattern(orderSchema, COLUMN_PATTERNS.createdAt)
        const orderStatus = findColumnByPattern(orderSchema, COLUMN_PATTERNS.financialStatus)

        if (!productId || !qty || !price || !itemOrderId || !orderOrderId || !orderCreatedAt) {
          console.warn(`Skipping ${platform.name}: missing required columns`)
          continue
        }

        const dateMatch = orderStatus
          ? `${orderStatus.actualColumn} IN ('paid', 'completed', 'success')`
          : '1=1'

        const data = await runSelectQuery(`
          SELECT
            '${platform.name}' as platform,
            ${productType || 'NULL'} as product_type,
            COUNT(DISTINCT oi.${itemOrderId.actualColumn}) as order_count,
            SUM(${qty.actualColumn}) as total_quantity,
            SUM(${price.actualColumn} * ${qty.actualColumn}) as total_revenue
          FROM ${platform.tables.orderItems} oi
          JOIN ${platform.tables.orders} o ON oi.${itemOrderId.actualColumn} = o.${orderOrderId.actualColumn}
          JOIN ${platform.tables.products} p ON oi.${productId.actualColumn} = p.${productSchema.productId?.actualColumn || 'id'}
          WHERE o.${orderCreatedAt.actualColumn} >= NOW() - INTERVAL '${days} days'
            AND ${dateMatch}
          GROUP BY ${productType || 'NULL'}
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

/**
 * Clear schema cache (useful for testing or when schema changes)
 */
export function clearSchemaCache() {
  clearDynamicSchemaCache()
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
  clearSchemaCache,
  formatCurrency,
  formatDate
}
