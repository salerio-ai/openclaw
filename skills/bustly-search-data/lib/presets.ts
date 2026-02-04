/**
 * Query Presets
 * 
 * Pre-built query templates for common use cases.
 */

import { runSelectQuery, TableInfo, ColumnInfo } from './supabase_api'

// ============================================
// Common Query Templates
// ============================================

export async function getShopInfo() {
  return await runSelectQuery(`
    SELECT shop_name, shop_domain, currency, iana_timezone, 
           plan_display_name, money_with_currency_format, has_storefront
    FROM semantic.dm_shop_info_shopify 
    LIMIT 5
  `)
}

export async function getRecentOrders(limit: number = 10) {
  return await runSelectQuery(`
    SELECT order_id, order_number, total_price, currency, 
           financial_status, fulfillment_status, created_at
    FROM semantic.dm_orders_shopify 
    ORDER BY created_at DESC 
    LIMIT ${Number(limit)}
  `)
}

export async function getOrdersByStatus(status: string, limit: number = 50) {
  return await runSelectQuery(`
    SELECT order_id, order_number, total_price, currency, 
           financial_status, fulfillment_status, created_at
    FROM semantic.dm_orders_shopify 
    WHERE financial_status = '${status}'
    ORDER BY created_at DESC 
    LIMIT ${Number(limit)}
  `)
}

export async function getDailySalesSummary(days: number = 30) {
  return await runSelectQuery(`
    SELECT 
      DATE(created_at) as sale_date,
      COUNT(*) as order_count,
      SUM(total_price) as total_revenue,
      AVG(total_price) as avg_order_value
    FROM semantic.dm_orders_shopify 
    WHERE created_at >= NOW() - INTERVAL '${days} days'
      AND financial_status = 'paid'
    GROUP BY DATE(created_at)
    ORDER BY sale_date DESC
  `)
}

export async function getTopProductsByRevenue(limit: number = 10, days: number = 30) {
  return await runSelectQuery(`
    SELECT 
      oi.name as product_title,
      oi.sku,
      COUNT(*) as times_ordered,
      SUM(oi.quantity) as total_quantity,
      SUM(oi.total_discount) as total_discount,
      SUM(oi.price * oi.quantity) as total_revenue
    FROM semantic.dm_order_items_shopify oi
    JOIN semantic.dm_orders_shopify o ON oi.order_id = o.order_id
    WHERE o.created_at >= NOW() - INTERVAL '${days} days'
      AND o.financial_status = 'paid'
    GROUP BY oi.name, oi.sku
    ORDER BY total_revenue DESC
    LIMIT ${Number(limit)}
  `)
}

export async function getTopCustomers(limit: number = 10) {
  return await runSelectQuery(`
    SELECT 
      customer_id,
      email,
      first_name || ' ' || last_name as name,
      orders_count,
      total_spent,
      created_at as customer_since
    FROM semantic.dm_customers_shopify 
    WHERE orders_count > 0
    ORDER BY total_spent DESC
    LIMIT ${Number(limit)}
  `)
}

export async function getInventoryStatus(limit: number = 20) {
  return await runSelectQuery(`
    SELECT 
      v.sku,
      v.inventory_quantity,
      v.price,
      v.title as variant_title,
      p.title as product_title,
      p.product_type,
      p.vendor
    FROM semantic.dm_variants_shopify v
    JOIN semantic.dm_products_shopify p ON v.product_id = p.product_id
    ORDER BY v.inventory_quantity ASC
    LIMIT ${Number(limit)}
  `)
}

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

export async function getOrderItems(orderId: string) {
  return await runSelectQuery(`
    SELECT 
      order_id,
      order_number,
      product_title,
      variant_title,
      sku,
      quantity,
      price,
      total_discount,
      (price * quantity) as line_total
    FROM semantic.dm_order_items_shopify 
    WHERE order_id = '${orderId}'
  `)
}

export async function getRevenueByCategory(days: number = 30) {
  return await runSelectQuery(`
    SELECT 
      p.product_type,
      COUNT(DISTINCT oi.order_id) as order_count,
      SUM(oi.quantity) as total_quantity,
      SUM(oi.price * oi.quantity) as total_revenue
    FROM semantic.dm_order_items_shopify oi
    JOIN semantic.dm_orders_shopify o ON oi.order_id = o.order_id
    JOIN semantic.dm_products_shopify p ON oi.product_id = p.product_id
    WHERE o.created_at >= NOW() - INTERVAL '${days} days'
      AND o.financial_status = 'paid'
    GROUP BY p.product_type
    ORDER BY total_revenue DESC
  `)
}

// ============================================
// Helpers
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

export function getDataCatalog(): Record<string, string[]> {
  return {
    'Shopify': [
      'semantic.dm_shop_info_shopify - Shop metadata',
      'semantic.dm_orders_shopify - Orders',
      'semantic.dm_order_items_shopify - Order line items',
      'semantic.dm_products_shopify - Products',
      'semantic.dm_variants_shopify - Product variants',
      'semantic.dm_customers_shopify - Customers',
      'semantic.dm_shopify_pixel_events - Pixel tracking events'
    ],
    'Google Ads': [
      'semantic.dm_ads_campaigns_google - Campaign performance',
      'semantic.dm_ads_products_google - Product-level metrics',
      'semantic.dm_ads_keywords_google - Keyword performance',
      'semantic.dm_ads_search_terms_google - Search terms',
      'semantic.dm_ads_creatives_google - Creative performance'
    ],
    'BigCommerce': [
      'semantic.dm_shop_info_bigcommerce - Shop metadata',
      'semantic.dm_products_bigcommerce - Products',
      'semantic.dm_variants_bigcommerce - Variants',
      'semantic.dm_customers_bigcommerce - Customers',
      'semantic.dm_orders_bigcommerce - Orders',
      'semantic.dm_order_items_bigcommerce - Order items'
    ]
  }
}

export const presets = {
  getShopInfo,
  getRecentOrders,
  getOrdersByStatus,
  getDailySalesSummary,
  getTopProductsByRevenue,
  getTopCustomers,
  getInventoryStatus,
  getGoogleAdsCampaigns,
  getOrderItems,
  getRevenueByCategory,
  formatCurrency,
  formatDate,
  getDataCatalog
}
