/**
 * BigCommerce data generator
 */

import type { AnalysisReport } from '../analyzer/types.js'
import { generateId, generateEmail, generatePrice, generateRecentDate, pickRandom, pickRandomN } from './values.js'

/**
 * Generate BigCommerce products
 */
export function generateBigCommerceProducts(
  count: number,
  tenantId: string,
  analysis: AnalysisReport
): any[] {
  const products = []
  const priceDist = analysis.distributions['price']

  const categories = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Toys']
  const brands = ['BrandA', 'BrandB', 'BrandC', 'BrandD']

  for (let i = 0; i < count; i++) {
    const id = generateId('bc_product')
    const now = new Date()

    products.push({
      id,
      tenant_id: tenantId,
      name: `BC Product ${i + 1} - ${pickRandom(categories)}`,
      price: generatePrice(priceDist),
      sku: `BC-SKU-${Math.floor(Math.random() * 10000)}`,
      inventory_level: Math.floor(Math.random() * 100),
      date_created: generateRecentDate(365),
      date_modified: now
    })
  }

  return products
}

/**
 * Generate BigCommerce variants
 */
export function generateBigCommerceVariants(
  products: any[],
  tenantId: string
): any[] {
  const variants = []

  for (const product of products) {
    // 1-3 variants per product
    const variantCount = Math.floor(Math.random() * 3) + 1

    for (let i = 0; i < variantCount; i++) {
      const id = generateId('bc_variant')

      variants.push({
        id,
        tenant_id: tenantId,
        product_id: product.id,
        sku: `BC-VAR-${Math.floor(Math.random() * 10000)}`,
        price: generatePrice(),
        inventory_level: Math.floor(Math.random() * 100),
        date_created: product.date_created
      })
    }
  }

  return variants
}

/**
 * Generate BigCommerce customers
 */
export function generateBigCommerceCustomers(
  count: number,
  tenantId: string
): any[] {
  const customers = []
  const firstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley']
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis']

  for (let i = 0; i < count; i++) {
    const id = generateId('bc_customer')
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
      date_created: generateRecentDate(365),
      date_modified: now
    })
  }

  return customers
}

/**
 * Generate BigCommerce orders
 */
export function generateBigCommerceOrders(
  count: number,
  tenantId: string,
  customers: any[],
  analysis: AnalysisReport
): any[] {
  const orders = []
  const statuses = ['Incomplete', 'Pending', 'Shipped', 'Delivered', 'Refunded']

  for (let i = 0; i < count; i++) {
    const id = generateId('bc_order')
    const customer = pickRandom(customers)
    const now = new Date()
    const createdAt = generateRecentDate(90)

    const totalPrice = generatePrice() * (Math.floor(Math.random() * 3) + 1)

    orders.push({
      id,
      tenant_id: tenantId,
      customer_id: customer.id,
      status_id: Math.floor(Math.random() * 5) + 1,
      total_inc_tax: totalPrice,
      subtotal_ex_tax: totalPrice * 0.9,
      date_created: createdAt,
      date_modified: now
    })
  }

  return orders
}

/**
 * Generate BigCommerce order items
 */
export function generateBigCommerceOrderItems(
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
      const id = generateId('bc_order_item')
      const quantity = Math.floor(Math.random() * 3) + 1

      orderItems.push({
        id,
        tenant_id: tenantId,
        order_id: order.id,
        product_id: product.id,
        variant_id: null,
        quantity,
        price: product.price,
        date_created: order.date_created
      })
    }
  }

  return orderItems
}
