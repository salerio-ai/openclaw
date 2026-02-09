/**
 * Magento data generator
 */

import type { AnalysisReport } from '../analyzer/types.js'
import { generateId, generateEmail, generatePrice, generateRecentDate, pickRandom, pickRandomN } from './values.js'

/**
 * Generate Magento products
 */
export function generateMagentoProducts(
  count: number,
  tenantId: string,
  analysis: AnalysisReport
): any[] {
  const products = []
  const priceDist = analysis.distributions['price']

  const attributeSets = ['Default', 'Clothing', 'Electronics']
  const types = ['simple', 'configurable', 'grouped', 'bundle']

  for (let i = 0; i < count; i++) {
    const id = generateId('magento_product')
    const now = new Date()

    products.push({
      id,
      tenant_id: tenantId,
      name: `Magento Product ${i + 1}`,
      price: generatePrice(priceDist),
      sku: `MAG-${Math.floor(Math.random() * 10000)}`,
      quantity: Math.floor(Math.random() * 100),
      created_at: generateRecentDate(365),
      updated_at: now
    })
  }

  return products
}

/**
 * Generate Magento variants
 */
export function generateMagentoVariants(
  products: any[],
  tenantId: string
): any[] {
  const variants = []

  for (const product of products) {
    // 1-3 variants per product
    const variantCount = Math.floor(Math.random() * 3) + 1

    for (let i = 0; i < variantCount; i++) {
      const id = generateId('magento_variant')

      variants.push({
        id,
        tenant_id: tenantId,
        product_id: product.id,
        sku: `MAG-VAR-${Math.floor(Math.random() * 10000)}`,
        price: generatePrice(),
        quantity: Math.floor(Math.random() * 100),
        created_at: product.created_at
      })
    }
  }

  return variants
}

/**
 * Generate Magento customers
 */
export function generateMagentoCustomers(
  count: number,
  tenantId: string
): any[] {
  const customers = []
  const firstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley']
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis']

  for (let i = 0; i < count; i++) {
    const id = generateId('magento_customer')
    const firstName = pickRandom(firstNames)
    const lastName = pickRandom(lastNames)
    const now = new Date()

    customers.push({
      id,
      tenant_id: tenantId,
      email: generateEmail(firstName, lastName),
      firstname: firstName,
      lastname: lastName,
      orders_count: 0,
      total_spent: 0,
      created_at: generateRecentDate(365),
      updated_at: now
    })
  }

  return customers
}

/**
 * Generate Magento orders
 */
export function generateMagentoOrders(
  count: number,
  tenantId: string,
  customers: any[],
  analysis: AnalysisReport
): any[] {
  const orders = []
  const statuses = ['pending', 'processing', 'complete', 'closed', 'canceled']

  for (let i = 0; i < count; i++) {
    const id = generateId('magento_order')
    const customer = pickRandom(customers)
    const now = new Date()
    const createdAt = generateRecentDate(90)

    const grandTotal = generatePrice() * (Math.floor(Math.random() * 3) + 1)

    orders.push({
      id,
      tenant_id: tenantId,
      customer_id: customer.id,
      status: pickRandom(statuses),
      grand_total: grandTotal,
      subtotal: grandTotal * 0.9,
      created_at: createdAt,
      updated_at: now
    })
  }

  return orders
}

/**
 * Generate Magento order items
 */
export function generateMagentoOrderItems(
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
      const id = generateId('magento_order_item')
      const quantity = Math.floor(Math.random() * 3) + 1

      orderItems.push({
        id,
        tenant_id: tenantId,
        order_id: order.id,
        product_id: product.id,
        qty_ordered: quantity,
        price: product.price,
        created_at: order.created_at
      })
    }
  }

  return orderItems
}
