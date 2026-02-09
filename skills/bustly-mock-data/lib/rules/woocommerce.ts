/**
 * WooCommerce platform rules and schema
 */

import type { PlatformSchema } from './types.js'

export const woocommerceSchema: PlatformSchema = {
  name: 'woocommerce',
  type: 'ecommerce',

  tables: [
    {
      name: 'data.dm_products_woocommerce',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        name: { type: 'text', nullable: false },
        regular_price: { type: 'numeric', nullable: false },
        sku: { type: 'text', nullable: true },
        stock_quantity: { type: 'integer', nullable: true },
        date_created: { type: 'timestamp', nullable: false },
        date_modified: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'name', 'regular_price', 'date_created', 'date_modified']
    },
    {
      name: 'data.dm_variants_woocommerce',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        product_id: { type: 'text', nullable: false },
        sku: { type: 'text', nullable: true },
        price: { type: 'numeric', nullable: false },
        stock_quantity: { type: 'integer', nullable: true },
        date_created: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'product_id', refTable: 'data.dm_products_woocommerce', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'product_id', 'price', 'date_created']
    },
    {
      name: 'data.dm_customers_woocommerce',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        email: { type: 'text', nullable: false },
        first_name: { type: 'text', nullable: true },
        last_name: { type: 'text', nullable: true },
        order_count: { type: 'integer', nullable: true },
        total_spent: { type: 'numeric', nullable: true },
        date_created: { type: 'timestamp', nullable: false },
        date_modified: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'email', 'date_created', 'date_modified']
    },
    {
      name: 'data.dm_orders_woocommerce',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        customer_id: { type: 'text', nullable: false },
        status: { type: 'text', nullable: false },
        total: { type: 'numeric', nullable: false },
        subtotal: { type: 'numeric', nullable: false },
        date_created: { type: 'timestamp', nullable: false },
        date_modified: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'customer_id', refTable: 'data.dm_customers_woocommerce', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'customer_id', 'status', 'total', 'date_created', 'date_modified']
    },
    {
      name: 'data.dm_order_items_woocommerce',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        order_id: { type: 'text', nullable: false },
        product_id: { type: 'text', nullable: false },
        quantity: { type: 'integer', nullable: false },
        price: { type: 'numeric', nullable: false },
        date_created: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'order_id', refTable: 'data.dm_orders_woocommerce', refColumn: 'id' },
        { column: 'product_id', refTable: 'data.dm_products_woocommerce', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'order_id', 'product_id', 'quantity', 'price', 'date_created']
    }
  ],

  dependencies: {
    'data.dm_orders_woocommerce': ['data.dm_products_woocommerce', 'data.dm_customers_woocommerce'],
    'data.dm_order_items_woocommerce': ['data.dm_orders_woocommerce', 'data.dm_products_woocommerce']
  },

  businessRules: [
    {
      description: 'Order total must be >= 0',
      validate: (order) => order.total >= 0
    }
  ]
}
