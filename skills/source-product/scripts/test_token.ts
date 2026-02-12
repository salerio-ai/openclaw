#!/usr/bin/env tsx
/**
 * Test if access token is valid
 */

import { testAccessToken } from '../lib/aliexpress_api.js';

async function main() {
  try {
    const result = await testAccessToken();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
