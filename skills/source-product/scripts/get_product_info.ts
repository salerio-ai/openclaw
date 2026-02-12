#!/usr/bin/env tsx
/**
 * Get AliExpress product detailed information
 *
 * Usage:
 *   npm run get:product -- --url "https://www.aliexpress.com/item/1234567890.html"
 *   npm run get:product -- --product-id "1234567890"
 *   npm run get:product -- --product-id "1234567890" --country "GB" --currency "GBP"
 */

import { getProductInfo, parseAliExpressProductId } from '../lib/aliexpress_api.js';
import type { GetProductInfoParams } from '../lib/aliexpress_api.js';

function displayRawProductInfo(result: {
  success: boolean;
  source: string;
  product_id: string;
  data: any;
  raw_response: any;
}): void {
  console.log('=== AliExpress Product Raw Data ===\n');

  console.log(`Success: ${result.success}`);
  console.log(`Source: ${result.source}`);
  console.log(`Product ID: ${result.product_id}`);

  if (result.data) {
    // Extract commonly needed fields for quick reference
    const aeItem = result.data.ae_item_base_info_dto || {};
    const subject = aeItem.subject || 'N/A';
    const detail = aeItem.detail || 'N/A';

    console.log(`\n=== Quick Reference ===`);
    console.log(`Title: ${subject}`);

    // Show image URLs if available
    const multimedia = result.data.ae_multimedia_info_dto || {};
    if (multimedia.image_urls) {
      const images = multimedia.image_urls.split(';').filter((url: string) => url.trim());
      console.log(`\nImages (${images.length}):`);
      images.slice(0, 5).forEach((url: string, index: number) => {
        console.log(`  ${index + 1}. ${url}`);
      });
      if (images.length > 5) {
        console.log(`  ... and ${images.length - 5} more`);
      }
    }

    // Show description preview
    if (detail && detail !== 'N/A') {
      const preview = detail.length > 500 ? detail.substring(0, 500) + '...' : detail;
      console.log(`\nDescription Preview:\n${preview}`);
    }

    // Show SKU info count if available
    const skuInfo = result.data.ae_item_sku_info_dtos;
    if (skuInfo && skuInfo.ae_item_sku_info_d_t_o && Array.isArray(skuInfo.ae_item_sku_info_d_t_o)) {
      console.log(`\nSKU Variants: ${skuInfo.ae_item_sku_info_d_t_o.length}`);
    }

    console.log(`\n=== Full Raw Data (JSON) ===`);
    console.log(JSON.stringify(result.data, null, 2));
  }

  // Optionally show raw API response structure
  if (process.argv.includes('--raw-response')) {
    console.log(`\n=== Complete API Response ===`);
    console.log(JSON.stringify(result.raw_response, null, 2));
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage:');
    console.error('  npm run get:product -- --url "<aliexpress_product_url>"');
    console.error('  npm run get:product -- --product-id "<product_id>"');
    console.error('');
    console.error('Options:');
    console.error('  --url <url>              AliExpress product URL');
    console.error('  --product-id <id>         AliExpress product ID');
    console.error('  --country <code>          Ship to country code (default: US)');
    console.error('  --currency <code>         Target currency (default: USD)');
    console.error('  --language <code>         Target language (default: en)');
    console.error('  --raw-response            Show complete API response');
    console.error('');
    console.error('Examples:');
    console.error('  npm run get:product -- --url "https://www.aliexpress.com/item/1234567890.html"');
    console.error('  npm run get:product -- --product-id "1234567890"');
    console.error('  npm run get:product -- --product-id "1234567890" --country "GB" --currency "GBP"');
    process.exit(1);
  }

  const params: GetProductInfoParams = {
    ship_to_country: 'US',
    target_currency: 'USD',
    target_language: 'en',
  };

  // Parse arguments
  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (!arg?.startsWith('--')) {
      i++;
      continue;
    }

    const key = arg.replace(/^--/, '');
    const value = args[i + 1];

    // Handle flags without values (like --raw-response)
    if (key === 'raw-response') {
      i++;
      continue;
    }

    // Skip if no value provided or value is another flag
    if (!value || value.startsWith('--')) {
      console.warn(`Warning: ${arg} requires a value, skipping`);
      i++;
      continue;
    }

    switch (key) {
      case 'url':
        params.url = value;
        i += 2;
        break;
      case 'product-id':
        params.product_id = value;
        i += 2;
        break;
      case 'country':
        params.ship_to_country = value;
        i += 2;
        break;
      case 'currency':
        params.target_currency = value;
        i += 2;
        break;
      case 'language':
        params.target_language = value;
        i += 2;
        break;
      default:
        console.warn(`Warning: Unknown parameter ${arg}, skipping`);
        i += 2;
        break;
    }
  }

  // Validate that either url or product_id is provided
  if (!params.url && !params.product_id) {
    console.error('Error: Either --url or --product-id is required');
    process.exit(1);
  }

  try {
    // Show what we're fetching
    if (params.url) {
      try {
        const productId = parseAliExpressProductId(params.url);
        console.log(`Fetching product info for AliExpress URL (Product ID: ${productId})...\n`);
      } catch {
        console.log(`Fetching product info for AliExpress URL...\n`);
      }
    } else {
      console.log(`Fetching product info for Product ID: ${params.product_id}...\n`);
    }

    const result = await getProductInfo(params);
    displayRawProductInfo(result);

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
