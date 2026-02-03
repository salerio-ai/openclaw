/**
 * Get Table Schema
 *
 * This script retrieves the schema information for a specific table.
 * It calls the Supabase RPC function: get_agent_table_schema
 *
 * Usage: npm run get_schema -- <table_name>
 * Example: npm run get_schema -- users
 */

import { getTableSchema, ColumnInfo } from '../lib/supabase_api'

export { getTableSchema }

function formatColumnInfo(columns: ColumnInfo[]): string {
  if (columns.length === 0) {
    return 'No columns found.'
  }

  let output = '\n📋 Table Schema:\n\n'
  output += `┌─────────────────────────┬──────────────┬──────────┬────────────────────┐\n`
  output += `│ Column Name             │ Type         │ Nullable │ Description        │\n`
  output += `├─────────────────────────┼──────────────┼──────────┼────────────────────┤\n`

  for (const col of columns) {
    const name = col.column_name.padEnd(23).slice(0, 23)
    const type = col.data_type.padEnd(12).slice(0, 12)
    const nullable = col.is_nullable ? 'YES' : 'NO'
    const desc = (col.description || '-').padEnd(20).slice(0, 20)
    output += `│ ${name} │ ${type} │ ${nullable} │ ${desc} │\n`
  }

  output += `└─────────────────────────┴──────────────┴──────────┴────────────────────┘\n`
  return output
}

async function main() {
  const args = process.argv.slice(2)
  let tableName = args.find(arg => !arg.startsWith('-')) || process.argv[2]

  if (!tableName) {
    console.error('\n❌ Usage: npm run get_schema -- <table_name>')
    console.error('   Example: npm run get_schema -- users')
    console.error('   Example: npm run get_schema -- "semantic.dm_orders_shopify"')
    process.exit(1)
  }

  try {
    console.log(`\n🔍 Fetching schema for table: ${tableName}\n`)
    const schema = await getTableSchema(tableName)
    console.log(formatColumnInfo(schema))
    console.log(`Total: ${schema.length} columns`)
  } catch (err) {
    console.error(`\n❌ Error fetching schema for "${tableName}":`, err)
    process.exit(1)
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`

if (isMainModule) {
  main()
}
