#!/usr/bin/env tsx
/**
 * Generate mock data CLI
 */

import { analyzePlatform, determineStrategy } from '../lib/analyzer/index.js'
import { generatePlatformData } from '../lib/generator/index.js'
import { getPlatformSchema, getDependencyOrder } from '../lib/rules/registry.js'
import { insertBatch } from '../lib/supabase/inserter.js'
import { config } from '../lib/config.js'

// Parse arguments
const args = process.argv.slice(2)
const platform = args[0] || 'shopify'
const strategy = (args[1] || 'smart') as 'smart' | 'minimal' | 'comprehensive'
const forceCount = args.includes('--count') ? parseInt(args[args.indexOf('--count') + 1]) : undefined

async function main() {
  console.log('🚀 Bustly Mock Data Generator\n')

  // Validate platform
  if (!getPlatformSchema(platform)) {
    console.error(`❌ Unknown platform: ${platform}`)
    console.error(`   Available: ${['shopify', 'bigcommerce', 'woocommerce', 'magento', 'google_ads'].join(', ')}`)
    process.exit(1)
  }

  // Get schema
  const schema = getPlatformSchema(platform)!
  const depOrder = getDependencyOrder(platform)
  console.log(`Platform: ${platform}`)
  console.log(`Tables: ${depOrder.join(', ')}\n`)

  // Analyze existing data
  const analysis = await analyzePlatform(platform, depOrder)

  // Determine strategy
  const { targetCount, mode } = determineStrategy(analysis, strategy, forceCount)
  console.log(`Strategy: ${strategy} (${mode})`)
  console.log(`Target: ${targetCount} orders\n`)

  // Get tenant_id from config (workspace_id)
  const tenantId = config.workspaceId
  console.log(`Tenant ID: ${tenantId}\n`)

  // Generate data
  const startTime = Date.now()
  const generationResult = await generatePlatformData(platform, tenantId, targetCount, analysis)

  // Insert data (in dependency order)
  console.log(`\n💾 Inserting data...`)

  let insertedCount = 0
  let failedCount = 0

  // Insert tables in dependency order
  for (const tableName of depOrder) {
    const tableResult = generationResult.tables.find(t => t.table === tableName)
    if (!tableResult || tableResult.data.length === 0) {
      console.log(`   ⏭️  Skipping ${tableName} (no data)`)
      continue
    }

    try {
      console.log(`   📥 Inserting ${tableResult.data.length} records into ${tableName}...`)
      const result = await insertBatch(tableName, tableResult.data)
      insertedCount += result.inserted
      failedCount += result.failed
      if (result.errors.length > 0) {
        console.log(`      ⚠️  ${result.errors.length} batches had errors`)
        for (const err of result.errors) {
          console.log(`         - ${err}`)
        }
      }
      if (result.inserted > 0) {
        console.log(`      ✅ ${result.inserted} rows inserted`)
      }
    } catch (err) {
      console.error(`      ❌ Error inserting into ${tableName}:`, err)
      failedCount += tableResult.data.length
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)

  console.log(`\n✅ Generation complete!`)
  console.log(`   Platform: ${generationResult.platform}`)
  console.log(`   Tables: ${generationResult.tables.length}`)
  console.log(`   Generated: ${generationResult.totalRecords} records`)
  console.log(`   Inserted: ${insertedCount} records`)
  if (failedCount > 0) {
    console.log(`   Failed: ${failedCount} records`)
  }
  console.log(`   Time: ${elapsed}s`)

  // Summary
  console.log(`\n📊 Summary:`)
  for (const table of generationResult.tables) {
    console.log(`   ${table.table}: ${table.count} records`)
  }
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
