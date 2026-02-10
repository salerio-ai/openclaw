/**
 * Shopify platform rules and schema
 */

import type { PlatformSchema } from './types.js'

export const shopifySchema: PlatformSchema = {
  name: 'shopify',
  type: 'ecommerce',

  tables: [
    {
      name: 'data.dm_products_shopify',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        title: { type: 'text', nullable: false },
        status: { type: 'text', nullable: false, enum: ['active', 'archived', 'draft'] },
        vendor: { type: 'text', nullable: true },
        product_type: { type: 'text', nullable: true },
        created_at: { type: 'timestamp', nullable: false },
        updated_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'title', 'status', 'created_at', 'updated_at']
    },
    {
      name: 'data.dm_variants_shopify',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        product_id: { type: 'text', nullable: false },
        price: { type: 'numeric', nullable: false },
        compare_at_price: { type: 'numeric', nullable: true },
        inventory_quantity: { type: 'integer', nullable: true },
        created_at: { type: 'timestamp', nullable: false },
        updated_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'product_id', refTable: 'data.dm_products_shopify', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'product_id', 'price', 'created_at', 'updated_at']
    },
    {
      name: 'data.dm_customers_shopify',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        email: { type: 'text', nullable: false },
        first_name: { type: 'text', nullable: true },
        last_name: { type: 'text', nullable: true },
        orders_count: { type: 'integer', nullable: true },
        total_spent: { type: 'numeric', nullable: true },
        created_at: { type: 'timestamp', nullable: false },
        updated_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'email', 'created_at', 'updated_at']
    },
    {
      name: 'data.dm_orders_shopify',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        customer_id: { type: 'text', nullable: false },
        financial_status: { type: 'text', nullable: false, enum: ['paid', 'pending', 'refunded', 'partially_paid', 'voided'] },
        fulfillment_status: { type: 'text', nullable: true },
        total_price: { type: 'numeric', nullable: false },
        subtotal_price: { type: 'numeric', nullable: false },
        created_at: { type: 'timestamp', nullable: false },
        updated_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'customer_id', refTable: 'data.dm_customers_shopify', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'customer_id', 'financial_status', 'total_price', 'created_at', 'updated_at']
    },
    {
      name: 'data.dm_order_items_shopify',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        order_id: { type: 'text', nullable: false },
        product_id: { type: 'text', nullable: false },
        variant_id: { type: 'text', nullable: false },
        quantity: { type: 'integer', nullable: false },
        price: { type: 'numeric', nullable: false },
        created_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'order_id', refTable: 'data.dm_orders_shopify', refColumn: 'id' },
        { column: 'product_id', refTable: 'data.dm_products_shopify', refColumn: 'id' },
        { column: 'variant_id', refTable: 'data.dm_variants_shopify', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'order_id', 'product_id', 'variant_id', 'quantity', 'price', 'created_at']
    },
    {
      name: 'data.dm_shopify_pixel_events',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        event_name: { type: 'text', nullable: false, enum: ['page_view', 'add_to_cart', 'purchase'] },
        user_id: { type: 'text', nullable: true },
        session_id: { type: 'text', nullable: false },
        event_time: { type: 'timestamp', nullable: false },
        created_at: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'event_name', 'session_id', 'event_time', 'created_at']
    }
  ],

  dependencies: {
    'data.dm_orders_shopify': ['data.dm_products_shopify', 'data.dm_customers_shopify'],
    'data.dm_order_items_shopify': ['data.dm_orders_shopify', 'data.dm_products_shopify', 'data.dm_variants_shopify'],
    'data.dm_shopify_pixel_events': ['data.dm_orders_shopify']
  },

  businessRules: [
    {
      description: 'Order financial status must be valid enum',
      validate: (order) => ['paid', 'pending', 'refunded', 'partially_paid', 'voided'].includes(order.financial_status)
    },
    {
      description: 'Order total must be >= 0',
      validate: (order) => order.total_price >= 0
    }
  ]
}
