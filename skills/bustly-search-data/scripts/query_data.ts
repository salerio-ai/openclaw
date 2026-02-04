/**
 * Query Data
 *
 * This script executes a SELECT query using Supabase RPC function.
 * It calls the Supabase RPC function: run_select_ws
 *
 * IMPORTANT: This only allows SELECT queries for security reasons.
 *
 * Usage: npm run query -- "<sql_query>"
 * Example: npm run query -- "SELECT * FROM users LIMIT 10"
 *
 * Environment Variables:
 *   FORMAT=json   - Output as JSON (default)
 *   FORMAT=table  - Output as ASCII table
 *   FORMAT=csv    - Output as CSV
 */

import { runSelectQuery } from '../lib/supabase_api'

export { runSelectQuery }

function formatAsTable(data: any[]): string {
  if (data.length === 0) {
    return 'No data returned.'
  }

  const keys = Object.keys(data[0])
  const colWidths: Record<string, number> = {}
  
  for (const row of data) {
    for (const key of keys) {
      const value = String(row[key] ?? '')
      colWidths[key] = Math.max(colWidths[key] || key.length, value.length)
    }
  }

  let output = '\n📊 Query Results:\n\n'
  output += '┌' + keys.map(k => '─'.repeat(colWidths[k] + 2)).join('┬') + '┐\n'
  output += '│' + keys.map(k => ` ${k.padEnd(colWidths[k])} `).join('│') + '│\n'
  output += '├' + keys.map(k => '─'.repeat(colWidths[k] + 2)).join('┼') + '┤\n'

  for (const row of data.slice(0, 50)) {
    output += '│' + keys.map(k => ` ${String(row[k] ?? '').padEnd(colWidths[k])} `).join('│') + '│\n'
  }

  if (data.length > 50) {
    output += '│ ... and ' + (data.length - 50) + ' more rows ...\n'
  }

  output += '└' + keys.map(k => '─'.repeat(colWidths[k] + 2)).join('┴') + '┘\n'
  return output
}

function formatAsCSV(data: any[]): string {
  if (data.length === 0) return ''

  const keys = Object.keys(data[0])
  const lines: string[] = []
  lines.push(keys.join(','))

  for (const row of data) {
    const values = keys.map(k => {
      const val = String(row[k] ?? '')
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    })
    lines.push(values.join(','))
  }
  
  return lines.join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  let query = args.find(arg => !arg.startsWith('-')) || process.argv[2]
  const format = process.env.FORMAT || 'json'

  if (!query) {
    console.error('\n❌ Usage: npm run query -- "<sql_query>"')
    console.error('   Example: npm run query -- "SELECT * FROM users LIMIT 10"')
    console.error('\n📝 Environment Variables:')
    console.error('   FORMAT=json   - Output as JSON (default)')
    console.error('   FORMAT=table  - Output as ASCII table')
    console.error('   FORMAT=csv    - Output as CSV')
    process.exit(1)
  }

  query = query.replace(/^--\s*/, '')

  try {
    console.log('\n🔍 Executing query...\n')
    const data = await runSelectQuery(query)
    
    console.log(`✅ Query returned ${data.length} rows\n`)

    switch (format) {
      case 'table':
        console.log(formatAsTable(data))
        break
      case 'csv':
        console.log(formatAsCSV(data))
        break
      default:
        console.log(JSON.stringify(data, null, 2))
    }
  } catch (err) {
    console.error('\n❌ Query error:', err)
    process.exit(1)
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`

if (isMainModule) {
  main()
}
