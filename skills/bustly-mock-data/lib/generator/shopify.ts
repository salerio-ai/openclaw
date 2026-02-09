/**
 * Shopify data generator
 */

import type { AnalysisReport } from '../analyzer/types.js'
import type { PlatformSchema } from '../rules/types.js'
import { generateId, generateEmail, generatePrice, generateRecentDate, pickRandom, pickRandomN } from './values.js'

/**
 * Generate Shopify products
 */
export function generateShopifyProducts(
  count: number,
  tenantId: string,
  analysis: AnalysisReport
): any[] {
  const products = []
  const priceDist = analysis.distributions['price']

  const productTypes = ['Clothing', 'Electronics', 'Home', 'Accessories', 'Books']
  const vendors = ['Acme Corp', 'Global Traders', 'Quality Goods', 'Value Brands']
  const statuses = ['active', 'active', 'active', 'archived', 'draft']

  for (let i = 0; i < count; i++) {
    const id = generateId('product')
    const now = new Date()

    products.push({
      id,
      tenant_id: tenantId,
      title: `Product ${i + 1} - ${pickRandom(productTypes)}`,
      status: pickRandom(statuses),
      vendor: pickRandom(vendors),
      product_type: pickRandom(productTypes),
      created_at: generateRecentDate(365),
      updated_at: now
    })
  }

  return products
}

/**
 * Generate Shopify variants
 */
export function generateShopifyVariants(
  products: any[],
  tenantId: string
): any[] {
  const variants = []

  for (const product of products) {
    // 1-3 variants per product
    const variantCount = Math.floor(Math.random() * 3) + 1

    for (let i = 0; i < variantCount; i++) {
      const id = generateId('variant')
      const now = new Date()

      variants.push({
        id,
        tenant_id: tenantId,
        product_id: product.id,
        price: generatePrice(),
        compare_at_price: Math.random() > 0.5 ? generatePrice() * 1.2 : null,
        inventory_quantity: Math.floor(Math.random() * 100),
        created_at: product.created_at,
        updated_at: now
      })
    }
  }

  return variants
}

/**
 * Generate Shopify customers
 */
export function generateShopifyCustomers(
  count: number,
  tenantId: string
): any[] {
  const customers = []
  const firstNames = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana', 'Eve', 'Frank']
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis']

  for (let i = 0; i < count; i++) {
    const id = generateId('customer')
    const firstName = pickRandom(firstNames)
    const lastName = pickRandom(lastNames)
    const now = new Date()

    customers.push({
      id,
      tenant_id: tenantId,
      email: generateEmail(firstName, lastName),
      first_name: firstName,
      last_name: lastName,
      orders_count: 0,
      total_spent: 0,
      created_at: generateRecentDate(365),
      updated_at: now
    })
  }

  return customers
}

/**
 * Generate Shopify orders
 */
export function generateShopifyOrders(
  count: number,
  tenantId: string,
  customers: any[],
  analysis: AnalysisReport
): any[] {
  const orders = []
  const financialStatuses = ['paid', 'paid', 'paid', 'pending', 'refunded']

  for (let i = 0; i < count; i++) {
    const id = generateId('order')
    const customer = pickRandom(customers)
    const now = new Date()
    const createdAt = generateRecentDate(90)

    // Calculate total price (will be adjusted when order items are added)
    const totalPrice = generatePrice() * (Math.floor(Math.random() * 3) + 1)

    orders.push({
      id,
      tenant_id: tenantId,
      customer_id: customer.id,
      financial_status: pickRandom(financialStatuses),
      fulfillment_status: Math.random() > 0.3 ? 'fulfilled' : null,
      total_price: totalPrice,
      subtotal_price: totalPrice,
      created_at: createdAt,
      updated_at: now
    })
  }

  return orders
}

/**
 * Generate Shopify order items
 */
export function generateShopifyOrderItems(
  orders: any[],
  variants: any[],
  tenantId: string
): any[] {
  const orderItems = []

  for (const order of orders) {
    // 1-3 items per order
    const itemCount = Math.floor(Math.random() * 3) + 1
    const selectedVariants = pickRandomN(variants, itemCount)

    for (const variant of selectedVariants) {
      const id = generateId('order_item')
      const quantity = Math.floor(Math.random() * 3) + 1

      orderItems.push({
        id,
        tenant_id: tenantId,
        order_id: order.id,
        product_id: variant.product_id,
        variant_id: variant.id,
        quantity,
        price: variant.price,
        created_at: order.created_at
      })
    }
  }

  return orderItems
}

/**
 * Generate Shopify pixel events
 */
export function generateShopifyPixelEvents(
  orders: any[],
  tenantId: string
): any[] {
  const pixelEvents = []

  for (const order of orders) {
    const sessionId = generateId('session')

    // Page views: 5-10 per order, spread over 1-7 days before
    const viewCount = Math.floor(Math.random() * 6) + 5
    for (let i = 0; i < viewCount; i++) {
      const daysBefore = Math.random() * 7
      const eventTime = new Date(order.created_at.getTime() - daysBefore * 24 * 60 * 60 * 1000)

      pixelEvents.push({
        id: generateId('pixel'),
        tenant_id: tenantId,
        event_name: 'page_view',
        user_id: order.customer_id,
        session_id: sessionId,
        event_time: eventTime,
        created_at: eventTime
      })
    }

    // Add to carts: 2-4 per order, 1-3 days before
    const cartCount = Math.floor(Math.random() * 3) + 2
    for (let i = 0; i < cartCount; i++) {
      const daysBefore = Math.random() * 3
      const eventTime = new Date(order.created_at.getTime() - daysBefore * 24 * 60 * 60 * 1000)

      pixelEvents.push({
        id: generateId('pixel'),
        tenant_id: tenantId,
        event_name: 'add_to_cart',
        user_id: order.customer_id,
        session_id: sessionId,
        event_time: eventTime,
        created_at: eventTime
      })
    }

    // Purchase: 1 per order
    pixelEvents.push({
      id: generateId('pixel'),
      tenant_id: tenantId,
      event_name: 'purchase',
      user_id: order.customer_id,
      session_id: sessionId,
      event_time: order.created_at,
      created_at: order.created_at
    })
  }

  return pixelEvents
}
