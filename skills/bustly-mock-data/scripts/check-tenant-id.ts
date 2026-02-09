#!/usr/bin/env tsx
import { runSelectQuery } from '../lib/supabase/client.js';

async function main() {
  console.log('Checking tenant_id format...\n');

  const products = await runSelectQuery(`
    SELECT DISTINCT tenant_id
    FROM data.dm_products_shopify
    LIMIT 5
  `);

  console.log('Sample tenant_id values from products:');
  products.forEach((p: any) => {
    console.log(`  ${p.tenant_id} (type: ${typeof p.tenant_id})`);
  });
}

main().catch(console.error);
