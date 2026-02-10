/**
 * BigCommerce platform rules and schema
 */

import type { PlatformSchema } from './types.js'

export const bigcommerceSchema: PlatformSchema = {
  name: 'bigcommerce',
  type: 'ecommerce',

  tables: [
    {
      name: 'data.dm_products_bigcommerce',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        name: { type: 'text', nullable: false },
        price: { type: 'numeric', nullable: false },
        sku: { type: 'text', nullable: true },
        inventory_level: { type: 'integer', nullable: true },
        date_created: { type: 'timestamp', nullable: false },
        date_modified: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'name', 'price', 'date_created', 'date_modified']
    },
    {
      name: 'data.dm_variants_bigcommerce',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        product_id: { type: 'text', nullable: false },
        sku: { type: 'text', nullable: true },
        price: { type: 'numeric', nullable: false },
        inventory_level: { type: 'integer', nullable: true },
        date_created: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'product_id', refTable: 'data.dm_products_bigcommerce', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'product_id', 'price', 'date_created']
    },
    {
      name: 'data.dm_customers_bigcommerce',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        email: { type: 'text', nullable: false },
        first_name: { type: 'text', nullable: true },
        last_name: { type: 'text', nullable: true },
        orders_count: { type: 'integer', nullable: true },
        total_spent: { type: 'numeric', nullable: true },
        date_created: { type: 'timestamp', nullable: false },
        date_modified: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [],
      requiredFields: ['id', 'tenant_id', 'email', 'date_created', 'date_modified']
    },
    {
      name: 'data.dm_orders_bigcommerce',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        customer_id: { type: 'text', nullable: false },
        status_id: { type: 'integer', nullable: false },
        total_inc_tax: { type: 'numeric', nullable: false },
        subtotal_ex_tax: { type: 'numeric', nullable: false },
        date_created: { type: 'timestamp', nullable: false },
        date_modified: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'customer_id', refTable: 'data.dm_customers_bigcommerce', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'customer_id', 'status_id', 'total_inc_tax', 'date_created', 'date_modified']
    },
    {
      name: 'data.dm_order_items_bigcommerce',
      columns: {
        id: { type: 'text', nullable: false },
        tenant_id: { type: 'text', nullable: false },
        order_id: { type: 'text', nullable: false },
        product_id: { type: 'text', nullable: false },
        variant_id: { type: 'text', nullable: true },
        quantity: { type: 'integer', nullable: false },
        price: { type: 'numeric', nullable: false },
        date_created: { type: 'timestamp', nullable: false }
      },
      primaryKeys: ['id'],
      foreignKeys: [
        { column: 'order_id', refTable: 'data.dm_orders_bigcommerce', refColumn: 'id' },
        { column: 'product_id', refTable: 'data.dm_products_bigcommerce', refColumn: 'id' }
      ],
      requiredFields: ['id', 'tenant_id', 'order_id', 'product_id', 'quantity', 'price', 'date_created']
    }
  ],

  dependencies: {
    'data.dm_orders_bigcommerce': ['data.dm_products_bigcommerce', 'data.dm_customers_bigcommerce'],
    'data.dm_order_items_bigcommerce': ['data.dm_orders_bigcommerce', 'data.dm_products_bigcommerce']
  },

  businessRules: [
    {
      description: 'Order total must be >= 0',
      validate: (order) => order.total_inc_tax >= 0
    }
  ]
}
