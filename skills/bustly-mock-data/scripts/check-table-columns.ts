#!/usr/bin/env tsx
import { runSelectQuery } from '../lib/supabase/client.js';

async function main() {
  console.log('Checking table column structure...\n');

  const tables = [
    'data.dm_products_shopify',
    'data.dm_customers_shopify',
    'data.dm_orders_shopify',
    'data.dm_variants_shopify',
    'data.dm_order_items_shopify',
    'data.dm_shopify_pixel_events'
  ];

  for (const table of tables) {
    const columns = await runSelectQuery(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'data'
        AND table_name = '${table.split('.')[1]}'
      ORDER BY ordinal_position
    `);

    console.log(`\n${table}:`);
    columns.forEach((c: any) => {
      console.log(`  ${c.column_name}: ${c.data_type} ${c.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
  }
}

main().catch(console.error);
