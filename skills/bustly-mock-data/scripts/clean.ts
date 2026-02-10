#!/usr/bin/env tsx
/**
 * Clean mock data CLI
 */

import { deleteByTenantId } from '../lib/supabase/inserter.js'
import { getPlatformSchema, getDependencyOrder } from '../lib/rules/registry.js'

// Parse arguments
const args = process.argv.slice(2)
const platform = args[0] || 'shopify'
const confirm = args.includes('--confirm')

async function main() {
  console.log('🧹 Bustly Mock Data Cleaner\n')

  if (!confirm) {
    console.error('❌ This will delete ALL mock data for this platform!')
    console.error('   Add --confirm flag to proceed.')
    process.exit(1)
  }

  const schema = getPlatformSchema(platform)
  if (!schema) {
    console.error(`❌ Unknown platform: ${platform}`)
    process.exit(1)
  }

  const tenantId = process.env.SEARCH_DATA_WORKSPACE_ID || 'default'

  // Delete in reverse dependency order
  const depOrder = getDependencyOrder(platform).reverse()

  console.log(`Platform: ${platform}`)
  console.log(`Tenant: ${tenantId}`)
  console.log(`Tables to clean: ${depOrder.length}\n`)

  let totalDeleted = 0

  for (const table of depOrder) {
    try {
      const count = await deleteByTenantId(table, tenantId)
      totalDeleted += count
      console.log(`  ✓ Deleted ${count} records from ${table}`)
    } catch (err) {
      console.error(`  ✗ Failed to delete from ${table}:`, err)
    }
  }

  console.log(`\n✅ Deleted ${totalDeleted} total records`)
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
