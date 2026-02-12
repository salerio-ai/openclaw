#!/usr/bin/env tsx
/**
 * Get AliExpress accounts for current workspace
 */

import { getAliExpressAccounts } from '../lib/aliexpress_api.js';

async function main() {
  try {
    const result = await getAliExpressAccounts();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
