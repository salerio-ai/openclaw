#!/usr/bin/env tsx
/**
 * Preview generated data without inserting to database
 */

import { analyzePlatform, determineStrategy } from '../lib/analyzer/index.js'
import { generateShopifyProducts, generateShopifyVariants, generateShopifyCustomers, generateShopifyOrders, generateShopifyOrderItems, generateShopifyPixelEvents } from '../lib/generator/shopify.js'

// Parse arguments
const platform = process.argv[2] || 'shopify'

async function previewShopify() {
  console.log('🔍 Preview Mode: Shopify Data Generation\n')

  // 模拟 minimal 模式
  const targetCount = 10

  // 模拟分析（使用默认分布）
  const analysis = {
    platform: 'shopify',
    timestamp: new Date(),
    scales: {},
    distributions: {
      price: {
        min: 10, max: 100, mean: 50, median: 45,
        p25: 30, p75: 70, p90: 85
      }
    }
  }

  const tenantId = 'preview_tenant'

  console.log(`Target: ${targetCount} orders\n`)

  // 1. Generate Products
  console.log('1️⃣ Products:')
  const products = generateShopifyProducts(5, tenantId, analysis)
  console.log(`   Generated: ${products.length} products`)
  if (products.length > 0) {
    console.log(`   Sample:`, JSON.stringify(products[0], null, 2))
  }
  console.log()

  // 2. Generate Variants
  console.log('2️⃣ Variants:')
  const variants = generateShopifyVariants(products, tenantId)
  console.log(`   Generated: ${variants.length} variants`)
  if (variants.length > 0) {
    console.log(`   Sample:`, JSON.stringify(variants[0], null, 2))
  }
  console.log()

  // 3. Generate Customers
  console.log('3️⃣ Customers:')
  const customers = generateShopifyCustomers(4, tenantId)
  console.log(`   Generated: ${customers.length} customers`)
  if (customers.length > 0) {
    console.log(`   Sample:`, JSON.stringify(customers[0], null, 2))
  }
  console.log()

  // 4. Generate Orders
  console.log('4️⃣ Orders:')
  const orders = generateShopifyOrders(10, tenantId, customers, analysis)
  console.log(`   Generated: ${orders.length} orders`)
  if (orders.length > 0) {
    console.log(`   Sample:`, JSON.stringify(orders[0], null, 2))
    console.log(`   Financial Status Distribution:`)
    const statusCounts = orders.reduce((acc, o) => {
      acc[o.financial_status] = (acc[o.financial_status] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    console.log('   ', JSON.stringify(statusCounts, null, 2))
  }
  console.log()

  // 5. Generate Order Items
  console.log('5️⃣ Order Items:')
  const orderItems = generateShopifyOrderItems(orders, variants, tenantId)
  console.log(`   Generated: ${orderItems.length} order items`)
  if (orderItems.length > 0) {
    console.log(`   Sample:`, JSON.stringify(orderItems[0], null, 2))
    // 显示数量分布
    const quantities = orderItems.map(item => item.quantity)
    const qtyStats = {
      min: Math.min(...quantities),
      max: Math.max(...quantities),
      avg: (quantities.reduce((a, b) => a + b, 0) / quantities.length).toFixed(1)
    }
    console.log(`   Quantity Stats:`, JSON.stringify(qtyStats))
  }
  console.log()

  // 6. Generate Pixel Events
  console.log('6️⃣ Pixel Events:')
  const pixelEvents = generateShopifyPixelEvents(orders, tenantId)
  console.log(`   Generated: ${pixelEvents.length} pixel events`)

  // 分析 pixel events 漏斗
  const eventCounts = pixelEvents.reduce((acc, pe) => {
    acc[pe.event_name] = (acc[pe.event_name] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  console.log('   Event Distribution:')
  console.log('   ', JSON.stringify(eventCounts, null, 2))

  // 计算漏斗比例
  if (eventCounts.page_view && eventCounts.purchase) {
    console.log(`   Funnel Ratios:`)
    console.log(`     page_view : purchase = ${eventCounts.page_view} : ${eventCounts.purchase} = ${(eventCounts.page_view / eventCounts.purchase).toFixed(2)} : 1`)
  }
  if (eventCounts.add_to_cart && eventCounts.purchase) {
    console.log(`     add_to_cart : purchase = ${eventCounts.add_to_cart} : ${eventCounts.purchase} = ${(eventCounts.add_to_cart / eventCounts.purchase).toFixed(2)} : 1`)
  }

  // 显示 pixel event 样本
  if (pixelEvents.length > 0) {
    console.log()
    console.log('   Sample Page View:', JSON.stringify(pixelEvents[0], null, 2))
    const addToCart = pixelEvents.find(e => e.event_name === 'add_to_cart')
    if (addToCart) {
      console.log('   Sample Add to Cart:', JSON.stringify(addToCart, null, 2))
    }
    const purchase = pixelEvents.find(e => e.event_name === 'purchase')
    if (purchase) {
      console.log('   Sample Purchase:', JSON.stringify(purchase, null, 2))
    }
  }

  console.log(`\n✅ Total Records Generated: ${products.length + customers.length + orders.length + orderItems.length + pixelEvents.length + variants.length}`)
}

previewShopify().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
