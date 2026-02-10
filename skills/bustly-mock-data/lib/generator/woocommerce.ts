/**
 * WooCommerce data generator
 */

import type { AnalysisReport } from '../analyzer/types.js'
import { generateId, generateEmail, generatePrice, generateRecentDate, pickRandom, pickRandomN } from './values.js'

/**
 * Generate WooCommerce products
 */
export function generateWooCommerceProducts(
  count: number,
  tenantId: string,
  analysis: AnalysisReport
): any[] {
  const products = []
  const priceDist = analysis.distributions['price']

  const categories = ['Electronics', 'Clothing', 'Home', 'Sports', 'Books']
  const tags = ['new', 'featured', 'sale']

  for (let i = 0; i < count; i++) {
    const id = generateId('wc_product')
    const now = new Date()

    products.push({
      id,
      tenant_id: tenantId,
      name: `WC Product ${i + 1} - ${pickRandom(categories)}`,
      regular_price: generatePrice(priceDist),
      sku: `WC-SKU-${Math.floor(Math.random() * 10000)}`,
      stock_quantity: Math.floor(Math.random() * 100),
      date_created: generateRecentDate(365),
      date_modified: now
    })
  }

  return products
}

/**
 * Generate WooCommerce variants
 */
export function generateWooCommerceVariants(
  products: any[],
  tenantId: string
): any[] {
  const variants = []

  for (const product of products) {
    // 1-3 variants per product
    const variantCount = Math.floor(Math.random() * 3) + 1

    for (let i = 0; i < variantCount; i++) {
      const id = generateId('wc_variant')

      variants.push({
        id,
        tenant_id: tenantId,
        product_id: product.id,
        sku: `WC-VAR-${Math.floor(Math.random() * 10000)}`,
        price: generatePrice(),
        stock_quantity: Math.floor(Math.random() * 100),
        date_created: product.date_created
      })
    }
  }

  return variants
}

/**
 * Generate WooCommerce customers
 */
export function generateWooCommerceCustomers(
  count: number,
  tenantId: string
): any[] {
  const customers = []
  const firstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey']
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones']

  for (let i = 0; i < count; i++) {
    const id = generateId('wc_customer')
    const firstName = pickRandom(firstNames)
    const lastName = pickRandom(lastNames)
    const now = new Date()

    customers.push({
      id,
      tenant_id: tenantId,
      email: generateEmail(firstName, lastName),
      first_name: firstName,
      last_name: lastName,
      order_count: 0,
      total_spent: 0,
      date_created: generateRecentDate(365),
      date_modified: now
    })
  }

  return customers
}

/**
 * Generate WooCommerce orders
 */
export function generateWooCommerceOrders(
  count: number,
  tenantId: string,
  customers: any[],
  analysis: AnalysisReport
): any[] {
  const orders = []
  const statuses = ['pending', 'processing', 'on-hold', 'completed', 'refunded']

  for (let i = 0; i < count; i++) {
    const id = generateId('wc_order')
    const customer = pickRandom(customers)
    const now = new Date()
    const createdAt = generateRecentDate(90)

    const total = generatePrice() * (Math.floor(Math.random() * 3) + 1)

    orders.push({
      id,
      tenant_id: tenantId,
      customer_id: customer.id,
      status: pickRandom(statuses),
      total,
      subtotal: total * 0.9,
      date_created: createdAt,
      date_modified: now
    })
  }

  return orders
}

/**
 * Generate WooCommerce order items
 */
export function generateWooCommerceOrderItems(
  orders: any[],
  products: any[],
  tenantId: string
): any[] {
  const orderItems = []

  for (const order of orders) {
    // 1-3 items per order
    const itemCount = Math.floor(Math.random() * 3) + 1
    const selectedProducts = pickRandomN(products, itemCount)

    for (const product of selectedProducts) {
      const id = generateId('wc_order_item')
      const quantity = Math.floor(Math.random() * 3) + 1

      orderItems.push({
        id,
        tenant_id: tenantId,
        order_id: order.id,
        product_id: product.id,
        quantity,
        price: product.regular_price,
        date_created: order.date_created
      })
    }
  }

  return orderItems
}
