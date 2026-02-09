#!/usr/bin/env tsx
/**
 * Check data status CLI
 */

import { getAvailableTables } from '../lib/supabase/client.js'
import { getTableCount } from '../lib/analyzer/scale.js'

async function main() {
  console.log('📊 Bustly Mock Data Status\n')

  const tables = await getAvailableTables()
  const shopifyTables = tables.filter(t => t.table_name.includes('shopify'))

  console.log('Shopify Tables:')
  for (const table of shopifyTables) {
    const count = await getTableCount(table.table_name)
    console.log(`  ${table.table_name}: ${count} records`)
  }
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
