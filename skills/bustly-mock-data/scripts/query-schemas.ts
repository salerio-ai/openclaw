#!/usr/bin/env tsx
import { runSelectQuery } from '../lib/supabase/client.js';

async function main() {
  console.log('Querying table schemas...\n');

  const tables = await runSelectQuery(`
    SELECT 
      table_schema, 
      table_name 
    FROM information_schema.tables 
    WHERE table_schema IN ('data', 'semantic') 
      AND table_name LIKE '%shopify%'
    ORDER BY table_schema, table_name
    LIMIT 50
  `);

  console.log('Tables in data and semantic schemas:');
  tables.forEach((t: any) => {
    console.log(`  ${t.table_schema}.${t.table_name}`);
  });
}

main().catch(console.error);
