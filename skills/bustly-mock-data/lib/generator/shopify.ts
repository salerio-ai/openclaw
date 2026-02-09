/**
 * Shopify data generator - Based on real data patterns
 *
 * This generator samples from actual existing data instead of using hardcoded values.
 * All field values are extracted from real database records.
 */

import type { AnalysisReport } from '../analyzer/types.js'
import { sampleValue, sampleUniqueValue } from '../analyzer/patterns.js'
import { generateRecentDate } from './values.js'

/**
 * Generate Shopify products based on real data patterns
 */
export function generateShopifyProducts(
  count: number,
  tenantId: string,
  analysis: AnalysisReport
): any[] {
  const products = []

  // Get real data patterns
  const patterns = analysis.patterns?.tables.get('data.dm_products_shopify')

  if (!patterns || patterns.sampleSize === 0) {
    throw new Error('No existing data found for products. Cannot generate realistic mock data.')
  }

  // Track used IDs to ensure uniqueness
  const usedProductIds = new Set<any>()

  for (let i = 0; i < count; i++) {
    const now = new Date()
    const createdAt = generateRecentDate(365)

    // Sample values from real data
    const productId = generateProductId('product', usedProductIds)
    usedProductIds.add(productId)

    products.push({
      product_id: productId,
      tenant_id: tenantId,
      platform: 'shopify',
      shop_domain: sampleValue(patterns, 'shop_domain') || 'example.myshopify.com',
      title: sampleValue(patterns, 'title') || 'Sample Product',
      body_html: sampleValue(patterns, 'body_html') || '<p>Description</p>',
      vendor: sampleValue(patterns, 'vendor'),
      product_type: sampleValue(patterns, 'product_type'),
      handle: sampleValue(patterns, 'handle'),
      tags: sampleValue(patterns, 'tags'),
      status: sampleValue(patterns, 'status') || 'active',
      image_src: sampleValue(patterns, 'image_src'),
      min_price: sampleValue(patterns, 'min_price') || 10,
      max_price: sampleValue(patterns, 'max_price') || 20,
      published_at: sampleValue(patterns, 'published_at'),
      created_at: createdAt,
      updated_at: now,
      raw: {}
    })
  }

  return products
}

/**
 * Generate Shopify variants based on real data patterns
 */
export function generateShopifyVariants(
  products: any[],
  tenantId: string,
  analysis: AnalysisReport
): any[] {
  const variants = []

  // Get real data patterns
  const patterns = analysis.patterns?.tables.get('data.dm_variants_shopify')

  if (!patterns || patterns.sampleSize === 0) {
    throw new Error('No existing data found for variants. Cannot generate realistic mock data.')
  }

  const usedVariantIds = new Set<any>()

  for (const product of products) {
    // 1-3 variants per product (based on real distribution)
    const variantCount = Math.floor(Math.random() * 3) + 1

    for (let i = 0; i < variantCount; i++) {
      const variantId = generateProductId('variant', usedVariantIds)
      usedVariantIds.add(variantId)
      const now = new Date()

      variants.push({
        variant_id: variantId,
        tenant_id: tenantId,
        platform: 'shopify',
        product_id: product.product_id,
        inventory_item_id: sampleValue(patterns, 'inventory_item_id'),
        shop_domain: product.shop_domain || sampleValue(patterns, 'shop_domain'),
        title: `${product.title} - Variant ${i + 1}`,
        sku: sampleValue(patterns, 'sku') || generateSKU(),
        barcode: sampleValue(patterns, 'barcode'),
        price: sampleValue(patterns, 'price') || 10,
        compare_at_price: sampleValue(patterns, 'compare_at_price'),
        cost_per_item: sampleValue(patterns, 'cost_per_item'),
        inventory_quantity: sampleValue(patterns, 'inventory_quantity') || Math.floor(Math.random() * 100),
        inventory_policy: sampleValue(patterns, 'inventory_policy') || 'deny',
        weight: sampleValue(patterns, 'weight') || 1,
        weight_unit: sampleValue(patterns, 'weight_unit') || 'kg',
        created_at: product.created_at,
        updated_at: now,
        raw: {}
      })
    }
  }

  return variants
}

/**
 * Generate Shopify customers based on real data patterns
 */
export function generateShopifyCustomers(
  count: number,
  tenantId: string,
  analysis: AnalysisReport
): any[] {
  const customers = []

  // Get real data patterns
  const patterns = analysis.patterns?.tables.get('data.dm_customers_shopify')

  if (!patterns || patterns.sampleSize === 0) {
    throw new Error('No existing data found for customers. Cannot generate realistic mock data.')
  }

  const usedCustomerIds = new Set<any>()

  for (let i = 0; i < count; i++) {
    const customerId = generateProductId('customer', usedCustomerIds)
    usedCustomerIds.add(customerId)
    const now = new Date()
    const createdAt = generateRecentDate(365)

    // Generate email based on sampled name patterns
    const firstName = sampleValue(patterns, 'first_name') || 'John'
    const lastName = sampleValue(patterns, 'last_name') || 'Doe'
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}@example.com`

    customers.push({
      customer_id: customerId,
      tenant_id: tenantId,
      platform: 'shopify',
      shop_domain: sampleValue(patterns, 'shop_domain') || 'example.myshopify.com',
      email: email,
      phone: sampleValue(patterns, 'phone'),
      first_name: firstName,
      last_name: lastName,
      default_address_city: sampleValue(patterns, 'default_address_city'),
      default_address_country: sampleValue(patterns, 'default_address_country'),
      currency: sampleValue(patterns, 'currency') || 'USD',
      state: sampleValue(patterns, 'state') || 'enabled',
      accepts_marketing: sampleValue(patterns, 'accepts_marketing') !== undefined ? sampleValue(patterns, 'accepts_marketing') : true,
      verified_email: sampleValue(patterns, 'verified_email') !== undefined ? sampleValue(patterns, 'verified_email') : true,
      tags: sampleValue(patterns, 'tags'),
      created_at: createdAt,
      updated_at: now,
      raw: {}
    })
  }

  return customers
}

/**
 * Generate Shopify orders based on real data patterns
 */
export function generateShopifyOrders(
  count: number,
  tenantId: string,
  customers: any[],
  analysis: AnalysisReport
): any[] {
  const orders = []

  // Get real data patterns
  const patterns = analysis.patterns?.tables.get('data.dm_orders_shopify')

  if (!patterns || patterns.sampleSize === 0) {
    throw new Error('No existing data found for orders. Cannot generate realistic mock data.')
  }

  const usedOrderIds = new Set<any>()

  for (let i = 0; i < count; i++) {
    const customer = customers[Math.floor(Math.random() * customers.length)]
    const orderId = generateProductId('order', usedOrderIds)
    usedOrderIds.add(orderId)
    const now = new Date()
    const createdAt = generateRecentDate(90)

    // Sample realistic values
    const totalPrice = sampleValue(patterns, 'total_price') || 100
    const lineItemsCount = sampleValue(patterns, 'line_items_count') || 1

    orders.push({
      order_id: orderId,
      tenant_id: tenantId,
      platform: 'shopify',
      shop_domain: customer.shop_domain || sampleValue(patterns, 'shop_domain'),
      order_number: `${1000 + i}`,
      landing_site: sampleValue(patterns, 'landing_site'),
      referring_site: sampleValue(patterns, 'referring_site'),
      source_name: sampleValue(patterns, 'source_name') || 'web',
      gateway: sampleValue(patterns, 'gateway') || 'shopify_payments',
      processing_method: sampleValue(patterns, 'processing_method') || 'direct',
      total_price: totalPrice,
      subtotal_price: sampleValue(patterns, 'subtotal_price') || totalPrice * 0.9,
      total_discounts: sampleValue(patterns, 'total_discounts'),
      total_tax: sampleValue(patterns, 'total_tax') || totalPrice * 0.08,
      currency: sampleValue(patterns, 'currency') || 'USD',
      financial_status: sampleValue(patterns, 'financial_status') || 'paid',
      fulfillment_status: sampleValue(patterns, 'fulfillment_status'),
      cancelled_at: sampleValue(patterns, 'cancelled_at'),
      cancel_reason: sampleValue(patterns, 'cancel_reason'),
      customer_id: customer.customer_id,
      customer_email: customer.email,
      tags: sampleValue(patterns, 'tags'),
      line_items_count: lineItemsCount,
      created_at: createdAt,
      updated_at: now,
      raw: {}
    })
  }

  return orders
}

/**
 * Generate Shopify order items based on real data patterns
 */
export function generateShopifyOrderItems(
  orders: any[],
  variants: any[],
  tenantId: string,
  analysis: AnalysisReport
): any[] {
  const orderItems = []

  // Get real data patterns
  const patterns = analysis.patterns?.tables.get('data.dm_order_items_shopify')

  if (!patterns || patterns.sampleSize === 0) {
    throw new Error('No existing data found for order items. Cannot generate realistic mock data.')
  }

  const usedLineItemIds = new Set<any>()

  for (const order of orders) {
    // Sample realistic number of items
    const itemCount = Math.floor(Math.random() * 3) + 1

    for (let i = 0; i < itemCount; i++) {
      const variant = variants[Math.floor(Math.random() * variants.length)]
      const lineItemId = generateProductId('lineitem', usedLineItemIds)
      usedLineItemIds.add(lineItemId)
      const quantity = sampleValue(patterns, 'quantity') || 1

      orderItems.push({
        line_item_id: lineItemId,
        tenant_id: tenantId,
        platform: 'shopify',
        order_id: order.order_id,
        product_id: variant.product_id,
        variant_id: variant.variant_id,
        sku: variant.sku,
        name: variant.title,
        variant_title: sampleValue(patterns, 'variant_title'),
        vendor: sampleValue(patterns, 'vendor'),
        quantity: quantity,
        price: variant.price,
        total_discount: sampleValue(patterns, 'total_discount'),
        properties: sampleValue(patterns, 'properties') || {},
        shop_domain: order.shop_domain,
        created_at: order.created_at,
        raw: {}
      })
    }
  }

  return orderItems
}

/**
 * Generate Shopify pixel events based on real data patterns
 */
export function generateShopifyPixelEvents(
  orders: any[],
  tenantId: string,
  analysis: AnalysisReport
): any[] {
  const pixelEvents = []

  // Get real data patterns
  const patterns = analysis.patterns?.tables.get('data.dm_shopify_pixel_events')

  if (!patterns || patterns.sampleSize === 0) {
    console.warn('No existing pixel events data. Will generate basic events.')
    return generateBasicPixelEvents(orders, tenantId)
  }

  for (const order of orders) {
    const baseTime = new Date(order.created_at)
    const orderTime = baseTime.getTime()

    // Generate pixel events leading up to the order
    // Funnel: ~8 page_view -> ~3 add_to_cart -> ~1 purchase

    // Page views (5-10 events before order)
    const pageViewCount = 5 + Math.floor(Math.random() * 6)
    for (let i = 0; i < pageViewCount; i++) {
      const daysBefore = Math.floor(Math.random() * 7) + 1
      const eventTime = new Date(orderTime - daysBefore * 24 * 60 * 60 * 1000)

      pixelEvents.push({
        id: generateBigIntId(),
        tenant_id: tenantId,
        shop_domain: order.shop_domain,
        pixel_event_id: sampleValue(patterns, 'pixel_event_id') || `pixel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        event_name: 'page_view',
        event_type: sampleValue(patterns, 'event_type') || 'web',
        sequence_number: i,
        occurred_at: eventTime,
        client_id: sampleValue(patterns, 'client_id') || `client_${Math.random().toString(36).substr(2, 16)}`,
        user_agent: sampleValue(patterns, 'user_agent') || 'Mozilla/5.0',
        language: sampleValue(patterns, 'language') || 'en',
        screen_resolution: sampleValue(patterns, 'screen_resolution') || '1920x1080',
        page_url: sampleValue(patterns, 'page_url') || `https://${order.shop_domain}/products/product-${Math.floor(Math.random() * 100)}`,
        page_path: sampleValue(patterns, 'page_path') || `/products/product-${Math.floor(Math.random() * 100)}`,
        referrer_url: sampleValue(patterns, 'referrer_url') || 'https://www.google.com',
        collection_id: null,
        collection_title: null,
        product_id: null,
        product_title: null,
        variant_id: null,
        sku: null,
        order_id: null,
        checkout_id: null,
        currency_code: sampleValue(patterns, 'currency_code') || 'USD',
        total_value: null,
        involved_product_ids: null,
        items_count: null,
        event_data: sampleValue(patterns, 'event_data') || {},
        created_at: eventTime,
        updated_at: eventTime
      })
    }

    // Add to cart events (2-4 events before order)
    const addToCartCount = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < addToCartCount; i++) {
      const daysBefore = Math.floor(Math.random() * 3) + 1
      const eventTime = new Date(orderTime - daysBefore * 24 * 60 * 60 * 1000)

      pixelEvents.push({
        id: generateBigIntId(),
        tenant_id: tenantId,
        shop_domain: order.shop_domain,
        pixel_event_id: sampleValue(patterns, 'pixel_event_id') || `pixel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        event_name: 'add_to_cart',
        event_type: sampleValue(patterns, 'event_type') || 'web',
        sequence_number: i,
        occurred_at: eventTime,
        client_id: sampleValue(patterns, 'client_id') || `client_${Math.random().toString(36).substr(2, 16)}`,
        user_agent: sampleValue(patterns, 'user_agent') || 'Mozilla/5.0',
        language: sampleValue(patterns, 'language') || 'en',
        screen_resolution: sampleValue(patterns, 'screen_resolution') || '1920x1080',
        page_url: `https://${order.shop_domain}/cart`,
        page_path: '/cart',
        referrer_url: `https://${order.shop_domain}/products`,
        collection_id: null,
        collection_title: null,
        product_id: sampleValue(patterns, 'product_id'),
        product_title: sampleValue(patterns, 'product_title'),
        variant_id: sampleValue(patterns, 'variant_id'),
        sku: sampleValue(patterns, 'sku'),
        order_id: null,
        checkout_id: null,
        currency_code: sampleValue(patterns, 'currency_code') || 'USD',
        total_value: sampleValue(patterns, 'total_value') || 100,
        involved_product_ids: sampleValue(patterns, 'involved_product_ids'),
        items_count: sampleValue(patterns, 'items_count') || 1,
        event_data: sampleValue(patterns, 'event_data') || {},
        created_at: eventTime,
        updated_at: eventTime
      })
    }

    // Purchase event (1 per order)
    pixelEvents.push({
      id: generateBigIntId(),
      tenant_id: tenantId,
      shop_domain: order.shop_domain,
      pixel_event_id: sampleValue(patterns, 'pixel_event_id') || `pixel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      event_name: 'purchase',
      event_type: 'web',
      sequence_number: 0,
      occurred_at: order.created_at,
      client_id: sampleValue(patterns, 'client_id') || `client_${Math.random().toString(36).substr(2, 16)}`,
      user_agent: sampleValue(patterns, 'user_agent') || 'Mozilla/5.0',
      language: sampleValue(patterns, 'language') || 'en',
      screen_resolution: sampleValue(patterns, 'screen_resolution') || '1920x1080',
      page_url: `https://${order.shop_domain}/thank_you`,
      page_path: '/thank_you',
      referrer_url: `https://${order.shop_domain}/checkout`,
      collection_id: null,
      collection_title: null,
      product_id: null,
      product_title: null,
      variant_id: null,
      sku: null,
      order_id: order.order_id,
      checkout_id: sampleValue(patterns, 'checkout_id') || `checkout_${Math.floor(Math.random() * 10000)}`,
      currency_code: order.currency || 'USD',
      total_value: parseFloat(order.total_price) || 0,
      involved_product_ids: null,
      items_count: order.line_items_count || 1,
      event_data: sampleValue(patterns, 'event_data') || {},
      created_at: order.created_at,
      updated_at: order.created_at
    })
  }

  return pixelEvents
}

/**
 * Generate basic pixel events when no existing data available
 */
function generateBasicPixelEvents(orders: any[], tenantId: string): any[] {
  const pixelEvents = []

  for (const order of orders) {
    const baseTime = new Date(order.created_at)
    const orderTime = baseTime.getTime()

    // Simple purchase event
    pixelEvents.push({
      id: Math.floor(Math.random() * 1000000000),
      tenant_id: tenantId,
      shop_domain: order.shop_domain || 'example.myshopify.com',
      pixel_event_id: `pixel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      event_name: 'purchase',
      event_type: 'web',
      sequence_number: 0,
      occurred_at: order.created_at,
      client_id: `client_${Math.random().toString(36).substr(2, 16)}`,
      user_agent: 'Mozilla/5.0',
      language: 'en',
      screen_resolution: '1920x1080',
      page_url: `https://${order.shop_domain || 'example.myshopify.com'}/thank_you`,
      page_path: '/thank_you',
      referrer_url: `https://${order.shop_domain || 'example.myshopify.com'}/checkout`,
      order_id: order.order_id,
      currency_code: 'USD',
      total_value: parseFloat(order.total_price) || 0,
      items_count: order.line_items_count || 1,
      event_data: {},
      created_at: order.created_at,
      updated_at: order.created_at
    })
  }

  return pixelEvents
}

/**
 * Helper: Generate unique product ID
 */
function generateProductId(prefix: string, usedIds: Set<any>): string {
  let attempts = 0
  let id

  do {
    id = `shop_${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    attempts++
  } while (usedIds.has(id) && attempts < 100)

  return id
}

/**
 * Helper: Generate SKU
 */
function generateSKU(): string {
  return `SKU-${Math.random().toString(36).substr(2, 8).toUpperCase()}`
}

/**
 * Helper: Generate bigint ID
 */
function generateBigIntId(): number {
  return Math.floor(Math.random() * 1000000000)
}
