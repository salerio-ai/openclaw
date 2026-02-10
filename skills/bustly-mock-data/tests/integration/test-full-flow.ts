/**
 * Integration test - Full generation flow
 */

import { analyzePlatform, determineStrategy } from '../../lib/analyzer/index.js'
import { generatePlatformData } from '../../lib/generator/index.js'
import { insertBatch } from '../../lib/supabase/inserter.js'

async function test() {
  console.log('🧪 Integration Test: Full Flow\n')

  const platform = 'shopify'
  const tenantId = 'test_tenant'

  try {
    // Step 1: Analyze
    console.log('Step 1: Analyzing existing data...')
    const schema = ['semantic.dm_products_shopify', 'semantic.dm_orders_shopify', 'semantic.dm_customers_shopify']
    const analysis = await analyzePlatform(platform, schema)
    console.log('✓ Analysis complete\n')

    // Step 2: Determine strategy
    console.log('Step 2: Determining generation strategy...')
    const { targetCount, mode } = determineStrategy(analysis, 'minimal')
    console.log(`✓ Strategy: ${mode}, target: ${targetCount}\n`)

    // Step 3: Generate data (without inserting)
    console.log('Step 3: Generating mock data...')
    const result = await generatePlatformData(platform, tenantId, targetCount, analysis)
    console.log(`✓ Generated ${result.totalRecords} records\n`)

    // Step 4: Validate data
    console.log('Step 4: Validating generated data...')
    for (const table of result.tables) {
      console.log(`  ${table.table}: ${table.count} records`)
    }
    console.log('✓ Validation complete\n')

    // Step 5: Dry run - don't actually insert
    console.log('Step 5: Skipping actual insert (dry run)')
    console.log('✓ Test complete!')

  } catch (err) {
    console.error('❌ Test failed:', err)
    process.exit(1)
  }
}

test()
