/**
 * Get Available Tables
 *
 * This script retrieves all tables that can be queried by the agent.
 * It calls the Supabase RPC function: get_agent_available_tables
 *
 * Usage: npm run get_tables
 */

import { getAvailableTables, TableInfo } from '../lib/supabase_api'

export { getAvailableTables }

function formatTableInfo(tables: TableInfo[]): string {
  if (tables.length === 0) {
    return 'No tables available.'
  }

  const grouped: Record<string, TableInfo[]> = {}
  for (const table of tables) {
    const prefix = table.table_name.split('.')[0] || 'other'
    if (!grouped[prefix]) {
      grouped[prefix] = []
    }
    grouped[prefix].push(table)
  }

  let output = '\n📊 Available Tables:\n\n'
  
  for (const [prefix, tableList] of Object.entries(grouped)) {
    output += `📁 ${prefix.toUpperCase()}\n`
    for (const table of tableList) {
      const desc = table.description ? ` - ${table.description}` : ''
      output += `  • ${table.table_name}${desc}\n`
    }
    output += '\n'
  }

  return output
}

async function main() {
  try {
    console.log('🔍 Fetching available tables...\n')
    const tables = await getAvailableTables()
    console.log(formatTableInfo(tables))
    console.log(`Total: ${tables.length} tables`)
  } catch (err) {
    console.error('\n❌ Error fetching tables:', err)
    process.exit(1)
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`

if (isMainModule) {
  main()
}
