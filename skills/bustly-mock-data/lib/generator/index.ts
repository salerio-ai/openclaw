/**
 * Main data generator coordinator
 */

import type { AnalysisReport } from '../analyzer/types.js'
import { getPlatformSchema, getDependencyOrder } from '../rules/registry.js'
import { generateId } from './values.js'
import * as ShopifyGenerator from './shopify.js'
import * as BigCommerceGenerator from './bigcommerce.js'
import * as WooCommerceGenerator from './woocommerce.js'
import * as MagentoGenerator from './magento.js'
import * as GoogleAdsGenerator from './google_ads.js'

/**
 * Generate mock data for a platform
 */
export async function generatePlatformData(
  platform: string,
  tenantId: string,
  targetCount: number,
  analysis: AnalysisReport
): Promise<GenerationResult> {
  console.log(`\n🎯 Generating ${platform} data (target: ${targetCount} orders)...`)

  const schema = getPlatformSchema(platform)
  if (!schema) {
    throw new Error(`Platform not found: ${platform}`)
  }

  const results: TableResult[] = []
  let totalRecords = 0

  // Get existing data for sampling
  // TODO: Query existing products, customers

  if (platform === 'shopify') {
    return await generateShopify(tenantId, targetCount, analysis)
  } else if (platform === 'bigcommerce') {
    return await generateBigCommerce(tenantId, targetCount, analysis)
  } else if (platform === 'woocommerce') {
    return await generateWooCommerce(tenantId, targetCount, analysis)
  } else if (platform === 'magento') {
    return await generateMagento(tenantId, targetCount, analysis)
  } else if (platform === 'google_ads') {
    return await generateGoogleAds(tenantId, targetCount)
  } else {
    throw new Error(`Platform ${platform} not yet implemented`)
  }
}

async function generateShopify(tenantId: string, targetCount: number, analysis: AnalysisReport): Promise<GenerationResult> {
  const results: TableResult[] = []
  let totalRecords = 0

  // 1. Products
  const productCount = Math.ceil(targetCount * 0.5)
  const products = ShopifyGenerator.generateShopifyProducts(productCount, tenantId, analysis)
  results.push({ table: 'data.dm_products_shopify', count: products.length, data: products })
  totalRecords += products.length

  // 2. Variants
  const variants = ShopifyGenerator.generateShopifyVariants(products, tenantId)
  results.push({ table: 'data.dm_variants_shopify', count: variants.length, data: variants })
  totalRecords += variants.length

  // 3. Customers
  const customerCount = Math.ceil(targetCount * 0.4)
  const customers = ShopifyGenerator.generateShopifyCustomers(customerCount, tenantId)
  results.push({ table: 'data.dm_customers_shopify', count: customers.length, data: customers })
  totalRecords += customers.length

  // 4. Orders
  const orders = ShopifyGenerator.generateShopifyOrders(targetCount, tenantId, customers, analysis)
  results.push({ table: 'data.dm_orders_shopify', count: orders.length, data: orders })
  totalRecords += orders.length

  // 5. Order items
  const orderItems = ShopifyGenerator.generateShopifyOrderItems(orders, variants, tenantId)
  results.push({ table: 'data.dm_order_items_shopify', count: orderItems.length, data: orderItems })
  totalRecords += orderItems.length

  // 6. Pixel events
  const pixelEvents = ShopifyGenerator.generateShopifyPixelEvents(orders, tenantId)
  results.push({ table: 'data.dm_shopify_pixel_events', count: pixelEvents.length, data: pixelEvents })
  totalRecords += pixelEvents.length

  console.log(`  ✓ Generated ${totalRecords} total records`)

  return { platform: 'shopify', tables: results, totalRecords, success: true }
}

async function generateBigCommerce(tenantId: string, targetCount: number, analysis: AnalysisReport): Promise<GenerationResult> {
  const results: TableResult[] = []
  let totalRecords = 0

  // 1. Products
  const productCount = Math.ceil(targetCount * 0.5)
  const products = BigCommerceGenerator.generateBigCommerceProducts(productCount, tenantId, analysis)
  results.push({ table: 'data.dm_products_bigcommerce', count: products.length, data: products })
  totalRecords += products.length

  // 2. Variants
  const variants = BigCommerceGenerator.generateBigCommerceVariants(products, tenantId)
  results.push({ table: 'data.dm_variants_bigcommerce', count: variants.length, data: variants })
  totalRecords += variants.length

  // 3. Customers
  const customerCount = Math.ceil(targetCount * 0.4)
  const customers = BigCommerceGenerator.generateBigCommerceCustomers(customerCount, tenantId)
  results.push({ table: 'data.dm_customers_bigcommerce', count: customers.length, data: customers })
  totalRecords += customers.length

  // 4. Orders
  const orders = BigCommerceGenerator.generateBigCommerceOrders(targetCount, tenantId, customers, analysis)
  results.push({ table: 'data.dm_orders_bigcommerce', count: orders.length, data: orders })
  totalRecords += orders.length

  // 5. Order items
  const orderItems = BigCommerceGenerator.generateBigCommerceOrderItems(orders, products, tenantId)
  results.push({ table: 'data.dm_order_items_bigcommerce', count: orderItems.length, data: orderItems })
  totalRecords += orderItems.length

  console.log(`  ✓ Generated ${totalRecords} total records`)

  return { platform: 'bigcommerce', tables: results, totalRecords, success: true }
}

async function generateWooCommerce(tenantId: string, targetCount: number, analysis: AnalysisReport): Promise<GenerationResult> {
  const results: TableResult[] = []
  let totalRecords = 0

  // 1. Products
  const productCount = Math.ceil(targetCount * 0.5)
  const products = WooCommerceGenerator.generateWooCommerceProducts(productCount, tenantId, analysis)
  results.push({ table: 'data.dm_products_woocommerce', count: products.length, data: products })
  totalRecords += products.length

  // 2. Variants
  const variants = WooCommerceGenerator.generateWooCommerceVariants(products, tenantId)
  results.push({ table: 'data.dm_variants_woocommerce', count: variants.length, data: variants })
  totalRecords += variants.length

  // 3. Customers
  const customerCount = Math.ceil(targetCount * 0.4)
  const customers = WooCommerceGenerator.generateWooCommerceCustomers(customerCount, tenantId)
  results.push({ table: 'data.dm_customers_woocommerce', count: customers.length, data: customers })
  totalRecords += customers.length

  // 4. Orders
  const orders = WooCommerceGenerator.generateWooCommerceOrders(targetCount, tenantId, customers, analysis)
  results.push({ table: 'data.dm_orders_woocommerce', count: orders.length, data: orders })
  totalRecords += orders.length

  // 5. Order items
  const orderItems = WooCommerceGenerator.generateWooCommerceOrderItems(orders, products, tenantId)
  results.push({ table: 'data.dm_order_items_woocommerce', count: orderItems.length, data: orderItems })
  totalRecords += orderItems.length

  console.log(`  ✓ Generated ${totalRecords} total records`)

  return { platform: 'woocommerce', tables: results, totalRecords, success: true }
}

async function generateMagento(tenantId: string, targetCount: number, analysis: AnalysisReport): Promise<GenerationResult> {
  const results: TableResult[] = []
  let totalRecords = 0

  // 1. Products
  const productCount = Math.ceil(targetCount * 0.5)
  const products = MagentoGenerator.generateMagentoProducts(productCount, tenantId, analysis)
  results.push({ table: 'data.dm_products_magento', count: products.length, data: products })
  totalRecords += products.length

  // 2. Variants
  const variants = MagentoGenerator.generateMagentoVariants(products, tenantId)
  results.push({ table: 'data.dm_variants_magento', count: variants.length, data: variants })
  totalRecords += variants.length

  // 3. Customers
  const customerCount = Math.ceil(targetCount * 0.4)
  const customers = MagentoGenerator.generateMagentoCustomers(customerCount, tenantId)
  results.push({ table: 'data.dm_customers_magento', count: customers.length, data: customers })
  totalRecords += customers.length

  // 4. Orders
  const orders = MagentoGenerator.generateMagentoOrders(targetCount, tenantId, customers, analysis)
  results.push({ table: 'data.dm_orders_magento', count: orders.length, data: orders })
  totalRecords += orders.length

  // 5. Order items
  const orderItems = MagentoGenerator.generateMagentoOrderItems(orders, products, tenantId)
  results.push({ table: 'data.dm_order_items_magento', count: orderItems.length, data: orderItems })
  totalRecords += orderItems.length

  console.log(`  ✓ Generated ${totalRecords} total records`)

  return { platform: 'magento', tables: results, totalRecords, success: true }
}

async function generateGoogleAds(tenantId: string, targetCount: number): Promise<GenerationResult> {
  const results: TableResult[] = []
  let totalRecords = 0

  // 1. Campaigns
  const campaignCount = Math.max(1, Math.ceil(targetCount / 20))
  const campaigns = GoogleAdsGenerator.generateGoogleAdsCampaigns(campaignCount, tenantId)
  results.push({ table: 'data.dm_ads_campaigns_google', count: campaigns.length, data: campaigns })
  totalRecords += campaigns.length

  // 2. Keywords
  const keywords = GoogleAdsGenerator.generateGoogleAdsKeywords(campaigns, tenantId)
  results.push({ table: 'data.dm_ads_keywords_google', count: keywords.length, data: keywords })
  totalRecords += keywords.length

  // 3. Search terms
  const searchTerms = GoogleAdsGenerator.generateGoogleAdsSearchTerms(keywords, tenantId)
  results.push({ table: 'data.dm_ads_search_terms_google', count: searchTerms.length, data: searchTerms })
  totalRecords += searchTerms.length

  // 4. Creatives
  const creatives = GoogleAdsGenerator.generateGoogleAdsCreatives(campaigns, tenantId)
  results.push({ table: 'data.dm_ads_creatives_google', count: creatives.length, data: creatives })
  totalRecords += creatives.length

  // 5. Product ads (no real products, generate mock)
  const products = campaigns.map(c => ({ id: generateId('product') }))
  const adsProducts = GoogleAdsGenerator.generateGoogleAdsProducts(campaigns, products, tenantId)
  results.push({ table: 'data.dm_ads_products_google', count: adsProducts.length, data: adsProducts })
  totalRecords += adsProducts.length

  console.log(`  ✓ Generated ${totalRecords} total records`)

  return { platform: 'google_ads', tables: results, totalRecords, success: true }
}

/**
 * Type definitions
 */
export interface TableResult {
  table: string
  count: number
  data: any[]
}

export interface GenerationResult {
  platform: string
  tables: TableResult[]
  totalRecords: number
  success: boolean
  errors?: string[]
}
