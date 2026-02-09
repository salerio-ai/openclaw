/**
 * Google Ads data generator
 */

import type { AnalysisReport } from '../analyzer/types.js'
import { generateId, generateRecentDate, pickRandom, pickRandomN } from './values.js'

/**
 * Generate Google Ads campaigns
 */
export function generateGoogleAdsCampaigns(
  count: number,
  tenantId: string
): any[] {
  const campaigns = []
  const statuses = ['enabled', 'enabled', 'paused', 'removed']

  for (let i = 0; i < count; i++) {
    const id = generateId('ga_campaign')
    const now = new Date()
    const createdAt = generateRecentDate(90)

    campaigns.push({
      id,
      tenant_id: tenantId,
      campaign_name: `Campaign ${i + 1} - ${new Date().getFullYear()}`,
      status: pickRandom(statuses),
      campaign_budget: Math.floor(Math.random() * 500 + 50) * 100,
      impressions: Math.floor(Math.random() * 100000),
      clicks: Math.floor(Math.random() * 5000),
      cost: Math.random() * 5000,
      conversions: Math.random() * 100,
      date_created: createdAt,
      date_modified: now
    })
  }

  return campaigns
}

/**
 * Generate Google Ads product performance
 */
export function generateGoogleAdsProducts(
  campaigns: any[],
  products: any[],
  tenantId: string
): any[] {
  const adsProducts = []

  for (const campaign of campaigns) {
    // Generate 5-10 product entries per campaign
    const productCount = Math.floor(Math.random() * 6) + 5

    for (let i = 0; i < productCount; i++) {
      const id = generateId('ga_product')
      const productId = pickRandom(products)?.id || generateId('product')

      adsProducts.push({
        id,
        tenant_id: tenantId,
        product_id: productId,
        impressions: Math.floor(Math.random() * 10000),
        clicks: Math.floor(Math.random() * 500),
        cost: Math.random() * 500,
        conversions: Math.random() * 10,
        revenue: Math.random() * 1000,
        date_created: campaign.date_created
      })
    }
  }

  return adsProducts
}

/**
 * Generate Google Ads keywords
 */
export function generateGoogleAdsKeywords(
  campaigns: any[],
  tenantId: string
): any[] {
  const keywords = []
  const matchTypes = ['broad', 'phrase', 'exact']

  for (const campaign of campaigns) {
    // Generate 10-20 keywords per campaign
    const keywordCount = Math.floor(Math.random() * 11) + 10

    for (let i = 0; i < keywordCount; i++) {
      const id = generateId('ga_keyword')

      keywords.push({
        id,
        tenant_id: tenantId,
        campaign_id: campaign.id,
        keyword_text: `keyword ${i + 1}`,
        match_type: pickRandom(matchTypes),
        impressions: Math.floor(Math.random() * 5000),
        clicks: Math.floor(Math.random() * 200),
        cost: Math.random() * 200,
        conversions: Math.random() * 5,
        date_created: campaign.date_created
      })
    }
  }

  return keywords
}

/**
 * Generate Google Ads search terms
 */
export function generateGoogleAdsSearchTerms(
  keywords: any[],
  tenantId: string
): any[] {
  const searchTerms = []

  for (const keyword of keywords) {
    // Generate 2-5 search terms per keyword
    const termCount = Math.floor(Math.random() * 4) + 2

    for (let i = 0; i < termCount; i++) {
      const id = generateId('ga_searchterm')

      searchTerms.push({
        id,
        tenant_id: tenantId,
        keyword_id: keyword.id,
        search_term: `${keyword.keyword_text} variant`,
        impressions: Math.floor(Math.random() * 1000),
        clicks: Math.floor(Math.random() * 50),
        cost: Math.random() * 50,
        conversions: Math.random() * 2,
        date_created: keyword.date_created
      })
    }
  }

  return searchTerms
}

/**
 * Generate Google Ads creatives
 */
export function generateGoogleAdsCreatives(
  campaigns: any[],
  tenantId: string
): any[] {
  const creatives = []

  for (const campaign of campaigns) {
    // Generate 2-5 creatives per campaign
    const creativeCount = Math.floor(Math.random() * 4) + 2

    for (let i = 0; i < creativeCount; i++) {
      const id = generateId('ga_creative')

      creatives.push({
        id,
        tenant_id: tenantId,
        campaign_id: campaign.id,
        creative_name: `Creative ${i + 1} - ${campaign.campaign_name}`,
        impressions: Math.floor(Math.random() * 10000),
        clicks: Math.floor(Math.random() * 500),
        cost: Math.random() * 500,
        conversions: Math.random() * 10,
        date_created: campaign.date_created
      })
    }
  }

  return creatives
}
