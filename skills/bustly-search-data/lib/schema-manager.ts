/**
 * Dynamic Schema Manager
 *
 * Real-time DDL schema fetching from Supabase.
 * Caches table schemas to avoid repeated calls.
 * Provides intelligent column mapping based on column names.
 */

import { getTableSchema, type ColumnInfo } from './supabase_api'

// Schema cache
const schemaCache = new Map<string, ColumnInfo[]>()

/**
 * Get table schema with caching
 */
export async function getTableSchemaCached(tableName: string): Promise<ColumnInfo[]> {
  if (schemaCache.has(tableName)) {
    return schemaCache.get(tableName)!
  }

  const schema = await getTableSchema(tableName)
  schemaCache.set(tableName, schema)
  return schema
}

/**
 * Clear schema cache
 */
export function clearSchemaCache(): void {
  schemaCache.clear()
}

/**
 * Find a column by searching for common patterns
 * Maps various possible column names to actual column names
 */
export interface ColumnMapping {
  actualColumn: string
  dataType: string
}

/**
 * Generic column finder - searches for a column by pattern
 * Returns the first matching column
 */
export function findColumnByPattern(
  schema: ColumnInfo[],
  patterns: string[]
): ColumnMapping | null {
  const lowerPatterns = patterns.map(p => p.toLowerCase())

  for (const pattern of lowerPatterns) {
    const match = schema.find(col => {
      const colName = col.column_name.toLowerCase()
      // Direct match
      if (colName === pattern) {
        return true
      }
      // Contains match
      if (colName.includes(pattern)) {
        return true
      }
      return false
    })

    if (match) {
      return {
        actualColumn: match.column_name,
        dataType: match.data_type
      }
    }
  }

  return null
}

/**
 * Generic column name patterns for common concepts
 */
export const COLUMN_PATTERNS = {
  shopName: ['shop_name', 'store_name', 'site_name', 'store', 'name'],
  shopDomain: ['shop_domain', 'domain', 'store_url', 'url'],
  currency: ['currency', 'currency_code'],
  timezone: ['iana_timezone', 'timezone', 'tz', 'time_zone'],
  planName: ['plan_display_name', 'plan_name', 'plan', 'subscription'],
  hasStorefront: ['has_storefront', 'storefront_enabled'],

  // Orders
  orderId: ['order_id', 'id', 'order_id'],
  orderNumber: ['order_number', 'number', 'increment_id', 'order_key'],
  totalPrice: ['total_price', 'total', 'total_inc_tax', 'grand_total', 'amount'],
  currency: ['currency', 'currency_code'],
  financialStatus: ['financial_status', 'status', 'payment_status'],
  fulfillmentStatus: ['fulfillment_status', 'fulfillment', 'ship_status'],
  createdAt: ['created_at', 'date_created', 'order_date', 'created'],

  // Order Items
  productName: ['name', 'product_name', 'product', 'title'],
  variantTitle: ['title', 'variant_title', 'variant', 'option_title'],
  sku: ['sku', 'sku_code', 'product_code'],
  quantity: ['quantity', 'qty', 'quantity_ordered'],
  price: ['price', 'unit_price', 'product_price'],
  totalDiscount: ['total_discount', 'discount_amount'],

  // Products
  productId: ['product_id', 'id', 'product_id'],
  productType: ['product_type', 'type', 'category'],
  title: ['title', 'name', 'product_name'],
  vendor: ['vendor', 'manufacturer', 'brand'],

  // Variants
  variantId: ['variant_id', 'id'],
  inventoryQuantity: ['inventory_quantity', 'stock', 'qty', 'quantity'],

  // Customers
  customerId: ['customer_id', 'id', 'user_id'],
  email: ['email'],
  firstName: ['first_name', 'firstname', 'fname'],
  lastName: ['last_name', 'lastname', 'lname'],
  ordersCount: ['orders_count', 'order_count', 'total_orders'],
  totalSpent: ['total_spent', 'lifetime_value', 'total_revenue'],
}

/**
 * Build a SELECT clause dynamically based on available columns
 */
export function buildDynamicSelect(
  tableName: string,
  requestedColumns: Record<string, string>,
  schema: ColumnInfo[]
): { selectClause: string; columnMappings: Record<string, string> } {
  const mappings: Record<string, string> = {}
  const selectParts: string[] = []

  for (const [alias, patterns] of Object.entries(requestedColumns)) {
    // Parse patterns (could be array or single string)
    const patternList = Array.isArray(patterns) ? patterns : [patterns]

    const mapping = findColumnByPattern(schema, patternList)

    if (mapping) {
      mappings[alias] = mapping.actualColumn
      selectParts.push(`${mapping.actualColumn} as ${alias}`)
    } else {
      // Column doesn't exist, use NULL
      mappings[alias] = 'NULL'
      selectParts.push(`NULL as ${alias}`)
    }
  }

  return {
    selectClause: selectParts.join(',\n    '),
    columnMappings: mappings
  }
}

/**
 * Check if a table has specific columns
 */
export function hasColumns(tableName: string, columnPatterns: string[]): Promise<boolean> {
  return getTableSchemaCached(tableName).then(schema => {
    return columnPatterns.some(pattern => {
      const lowerPattern = pattern.toLowerCase()
      return schema.some(col => col.column_name.toLowerCase().includes(lowerPattern))
    })
  })
}

/**
 * Get all available column names from a table
 */
export async function getColumnNames(tableName: string): Promise<string[]> {
  const schema = await getTableSchemaCached(tableName)
  return schema.map(col => col.column_name)
}
