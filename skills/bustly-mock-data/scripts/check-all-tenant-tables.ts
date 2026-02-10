#!/usr/bin/env tsx
import { runSelectQuery } from '../lib/supabase/client.js';

async function main() {
  console.log('Checking all data schema tables...\n');

  const tables = await runSelectQuery(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'data'
    ORDER BY table_name
  `);

  console.log('All data schema tables:');
  tables.forEach((t: any) => {
    if (t.table_name.includes('tenant') || t.table_name.includes('workspace') || t.table_name.includes('account')) {
      console.log(`  *** data.${t.table_name}`);
    } else {
      console.log(`      data.${t.table_name}`);
    }
  });
}

main().catch(console.error);
