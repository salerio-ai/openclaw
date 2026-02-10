#!/usr/bin/env tsx
/**
 * Test Platform Detection
 *
 * This script tests the multi-platform detection functionality.
 * Run with: npm run test:platforms
 */

import {
  detectAvailablePlatforms,
  getPrimaryPlatform,
  getOrderPlatforms,
  getTableName
} from '../lib/data-source-detector.js'

import {
  getConnectedPlatformsSummary,
  getDataCatalog,
  getShopInfo,
  getRecentOrders
} from '../lib/presets-v2.js'

async function testPlatformDetection() {
  console.log('\n=== Testing Multi-Platform Detection ===\n')

  try {
    // Test 1: Detect available platforms
    console.log('1. Detecting available platforms...')
    const platforms = await detectAvailablePlatforms()
    console.log(`   Found ${platforms.length} platforms:`)
    for (const platform of platforms) {
      console.log(`   - ${platform.name}`)
      console.log(`     Orders: ${platform.hasOrders ? '✓' : '✗'}`)
      console.log(`     Products: ${platform.hasProducts ? '✓' : '✗'}`)
      console.log(`     Customers: ${platform.hasCustomers ? '✓' : '✗'}`)
    }

    // Test 2: Get primary platform
    console.log('\n2. Getting primary platform...')
    const primary = await getPrimaryPlatform()
    console.log(`   Primary: ${primary?.name || 'None'}`)

    // Test 3: Get order platforms
    console.log('\n3. Getting order platforms...')
    const orderPlatforms = await getOrderPlatforms()
    console.log(`   Platforms with orders: ${orderPlatforms.map(p => p.name).join(', ')}`)

    // Test 4: Get table name
    console.log('\n4. Getting table names...')
    const ordersTable = await getTableName('orders')
    console.log(`   Orders table: ${ordersTable}`)

    // Test 5: Get connected platforms summary
    console.log('\n5. Getting connected platforms summary...')
    const summary = await getConnectedPlatformsSummary()
    console.log(`   Total platforms: ${summary.totalPlatforms}`)

    // Test 6: Get data catalog
    console.log('\n6. Getting data catalog...')
    const catalog = await getDataCatalog()
    for (const [platform, tables] of Object.entries(catalog)) {
      console.log(`   ${platform}: ${tables.length} tables`)
    }

    // Test 7: Get shop info
    console.log('\n7. Getting shop info...')
    const shopInfo = await getShopInfo()
    console.log(`   Found ${shopInfo.length} shop(s)`)
    for (const shop of shopInfo) {
      console.log(`   - [${shop.platform}] ${shop.shop_name} (${shop.shop_domain})`)
    }

    // Test 8: Get recent orders (limited)
    console.log('\n8. Getting recent orders (limited to 5)...')
    const orders = await getRecentOrders(5)
    console.log(`   Found ${orders.length} orders`)
    if (orders.length > 0) {
      console.log('   Sample order:', {
        platform: orders[0].platform,
        order_number: orders[0].order_number,
        total_price: orders[0].total_price,
        created_at: orders[0].created_at
      })
    }

    console.log('\n✅ All tests passed!\n')

  } catch (err) {
    console.error('\n❌ Test failed:', err)
    process.exit(1)
  }
}

// Run tests
testPlatformDetection()
