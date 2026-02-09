/**
 * Google Ads platform rules and schema
 */

import type { PlatformSchema } from './types.js'

export const googleAdsSchema: PlatformSchema = {
  name: 'google_ads',
  type: 'ads',

  tables: [
    {
      name: 'semantic.dm_ads_campaigns_google',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        campaign_name: { type: 'text', nullable: false },
        status: { type: 'text', nullable: false, enum: ['enabled', 'paused', 'removed'] },
        campaign_budget: { type: 'numeric', nullable: false },
        impressions: { type: 'integer', nullable: true },
        clicks: { type: 'integer', nullable: true },
        cost: { type: 'numeric', nullable: true },
        conversions: { type: 'numeric', nullable: true },
        date_created: { type: 'timestamp', nullable: false },
        date_modified: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'campaign_name', 'status', 'campaign_budget', 'date_created', 'date_modified']
    },
    {
      name: 'semantic.dm_ads_products_google',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        product_id: { type: 'text', nullable: false },
        impressions: { type: 'integer', nullable: true },
        clicks: { type: 'integer', nullable: true },
        cost: { type: 'numeric', nullable: true },
        conversions: { type: 'numeric', nullable: true },
        revenue: { type: 'numeric', nullable: true },
        date_created: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'product_id', 'date_created']
    },
    {
      name: 'semantic.dm_ads_keywords_google',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        campaign_id: { type: 'text', nullable: false },
        keyword_text: { type: 'text', nullable: false },
        match_type: { type: 'text', nullable: false },
        impressions: { type: 'integer', nullable: true },
        clicks: { type: 'integer', nullable: true },
        cost: { type: 'numeric', nullable: true },
        conversions: { type: 'numeric', nullable: true },
        date_created: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'campaign_id', refTable: 'semantic.dm_ads_campaigns_google', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'campaign_id', 'keyword_text', 'match_type', 'date_created']
    },
    {
      name: 'semantic.dm_ads_search_terms_google',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        keyword_id: { type: 'text', nullable: false },
        search_term: { type: 'text', nullable: false },
        impressions: { type: 'integer', nullable: true },
        clicks: { type: 'integer', nullable: true },
        cost: { type: 'numeric', nullable: true },
        conversions: { type: 'numeric', nullable: true },
        date_created: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'keyword_id', refTable: 'semantic.dm_ads_keywords_google', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'keyword_id', 'search_term', 'date_created']
    },
    {
      name: 'semantic.dm_ads_creatives_google',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        campaign_id: { type: 'text', nullable: false },
        creative_name: { type: 'text', nullable: false },
        impressions: { type: 'integer', nullable: true },
        clicks: { type: 'integer', nullable: true },
        cost: { type: 'numeric', nullable: true },
        conversions: { type: 'numeric', nullable: true },
        date_created: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'campaign_id', refTable: 'semantic.dm_ads_campaigns_google', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'campaign_id', 'creative_name', 'date_created']
    }
  ],

  dependencies: {
    'semantic.dm_ads_products_google': [],
    'semantic.dm_ads_keywords_google': ['semantic.dm_ads_campaigns_google'],
    'semantic.dm_ads_search_terms_google': ['semantic.dm_ads_keywords_google'],
    'semantic.dm_ads_creatives_google': ['semantic.dm_ads_campaigns_google']
  },

  businessRules: [
    {
      description: 'Campaign budget must be >= 0',
      validate: (campaign) => campaign.campaign_budget >= 0
    },
    {
      description: 'Clicks cannot exceed impressions',
      validate: (data) => data.clicks <= data.impressions
    }
  ]
}
