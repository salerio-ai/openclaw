#!/usr/bin/env tsx
import { runSelectQuery } from '../lib/supabase/client.js';

async function main() {
  console.log('Checking for tenants table...\n');

  const tables = await runSelectQuery(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'data'
      AND (table_name LIKE '%tenant%' OR table_name LIKE '%workspace%')
  `);

  console.log('Tenant-related tables:');
  tables.forEach((t: any) => {
    console.log(`  data.${t.table_name}`);
  });

  // Check if workspace_tenants table exists and has data
  const workspaceTenants = await runSelectQuery(`
    SELECT * FROM data.workspace_tenants
    WHERE workspace_id = '4b08d5fa-5ea9-490d-a5fb-a5b971ed34c2'
    LIMIT 1
  `);

  console.log('\nWorkspace tenant record:');
  console.log(JSON.stringify(workspaceTenants[0] || null, null, 2));
}

main().catch(console.error);
