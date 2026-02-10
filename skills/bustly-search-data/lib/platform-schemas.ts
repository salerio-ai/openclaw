/**
 * Platform Schema Definitions
 *
 * Defines the table structure differences across platforms.
 * Each platform has different column names for similar concepts.
 */

export interface PlatformSchema {
  // Shop info table column mappings
  shopInfo: {
    shopName: string
    shopDomain?: string
    planName?: string
    currency: string
    timezone: string
    hasStorefront?: string
  }

  // Orders table column mappings
  orders: {
    orderId: string
    orderNumber?: string
    totalPrice: string
    currency: string
    financialStatus?: string
    fulfillmentStatus?: string
    createdAt: string
  }

  // Order items table column mappings
  orderItems: {
    orderId: string
    orderNumber?: string
    productName: string
    variantTitle?: string
    sku?: string
    quantity: string
    price: string
    totalDiscount?: string
  }

  // Products table column mappings
  products: {
    productId: string
    title: string
    productType?: string
    vendor?: string
  }

  // Variants table column mappings
  variants: {
    variantId: string
    productId: string
    sku?: string
    price?: string
    inventoryQuantity?: string
    title?: string
  }

  // Customers table column mappings
  customers: {
    customerId: string
    email?: string
    firstName?: string
    lastName?: string
    ordersCount?: string
    totalSpent?: string
    createdAt?: string
  }
}

// Platform-specific schema definitions
export const PLATFORM_SCHEMAS: Record<string, PlatformSchema> = {
  shopify: {
    shopInfo: {
      shopName: 'shop_name',
      shopDomain: 'shop_domain',
      planName: 'plan_display_name',
      currency: 'currency',
      timezone: 'iana_timezone',
      hasStorefront: 'has_storefront'
    },
    orders: {
      orderId: 'order_id',
      orderNumber: 'order_number',
      totalPrice: 'total_price',
      currency: 'currency',
      financialStatus: 'financial_status',
      fulfillmentStatus: 'fulfillment_status',
      createdAt: 'created_at'
    },
    orderItems: {
      orderId: 'order_id',
      orderNumber: 'order_number',
      productName: 'name',
      variantTitle: 'title',
      sku: 'sku',
      quantity: 'quantity',
      price: 'price',
      totalDiscount: 'total_discount'
    },
    products: {
      productId: 'product_id',
      title: 'title',
      productType: 'product_type',
      vendor: 'vendor'
    },
    variants: {
      variantId: 'variant_id',
      productId: 'product_id',
      sku: 'sku',
      price: 'price',
      inventoryQuantity: 'inventory_quantity',
      title: 'title'
    },
    customers: {
      customerId: 'customer_id',
      email: 'email',
      firstName: 'first_name',
      lastName: 'last_name',
      ordersCount: 'orders_count',
      totalSpent: 'total_spent',
      createdAt: 'created_at'
    }
  },

  bigcommerce: {
    shopInfo: {
      shopName: 'store_name',  // Different from Shopify
      shopDomain: 'domain',
      planName: undefined,      // BigCommerce may not have this
      currency: 'currency',
      timezone: 'timezone',
      hasStorefront: undefined
    },
    orders: {
      orderId: 'order_id',
      orderNumber: 'order_number',
      totalPrice: 'total_inc_tax',  // Different column name
      currency: 'currency_code',
      financialStatus: 'status',
      fulfillmentStatus: undefined,
      createdAt: 'date_created'
    },
    orderItems: {
      orderId: 'order_id',
      productName: 'name',
      variantTitle: undefined,
      sku: 'sku',
      quantity: 'quantity',
      price: 'price',
      totalDiscount: undefined
    },
    products: {
      productId: 'product_id',
      title: 'name',
      productType: 'product_type',
      vendor: undefined
    },
    variants: {
      variantId: 'variant_id',
      productId: 'product_id',
      sku: 'sku',
      price: 'price',
      inventoryQuantity: 'inventory_level',
      title: undefined
    },
    customers: {
      customerId: 'customer_id',
      email: 'email',
      firstName: 'first_name',
      lastName: 'last_name',
      ordersCount: 'orders_count',
      totalSpent: 'total_spent',
      createdAt: 'date_created'
    }
  },

  woocommerce: {
    shopInfo: {
      shopName: 'site_name',  // WooCommerce uses site_name
      shopDomain: 'domain',
      planName: undefined,
      currency: 'currency',
      timezone: 'timezone',
      hasStorefront: undefined
    },
    orders: {
      orderId: 'order_id',
      orderNumber: 'order_number',
      totalPrice: 'total',
      currency: 'currency',
      financialStatus: 'status',
      fulfillmentStatus: undefined,
      createdAt: 'date_created'
    },
    orderItems: {
      orderId: 'order_id',
      productName: 'product_name',
      variantTitle: undefined,
      sku: 'sku',
      quantity: 'quantity',
      price: 'price',
      totalDiscount: undefined
    },
    products: {
      productId: 'product_id',
      title: 'product_name',
      productType: 'product_type',
      vendor: undefined
    },
    variants: {
      variantId: 'variation_id',
      productId: 'product_id',
      sku: 'sku',
      price: 'price',
      inventoryQuantity: 'stock_quantity',
      title: undefined
    },
    customers: {
      customerId: 'customer_id',
      email: 'email',
      firstName: 'first_name',
      lastName: 'last_name',
      ordersCount: 'orders_count',
      totalSpent: 'total_spent',
      createdAt: 'date_created'
    }
  },

  magento: {
    shopInfo: {
      shopName: 'store_name',  // Magento uses store_name
      shopDomain: 'domain',
      planName: undefined,
      currency: 'currency',
      timezone: 'timezone',
      hasStorefront: undefined
    },
    orders: {
      orderId: 'order_id',
      orderNumber: 'increment_id',
      totalPrice: 'grand_total',
      currency: 'order_currency',
      financialStatus: 'status',
      fulfillmentStatus: undefined,
      createdAt: 'created_at'
    },
    orderItems: {
      orderId: 'order_id',
      productName: 'product_name',
      variantTitle: undefined,
      sku: 'sku',
      quantity: 'qty_ordered',
      price: 'price',
      totalDiscount: undefined
    },
    products: {
      productId: 'entity_id',
      title: 'name',
      productType: 'type_id',
      vendor: undefined
    },
    variants: {
      variantId: 'variation_id',
      productId: 'product_id',
      sku: 'sku',
      price: 'price',
      inventoryQuantity: 'qty',
      title: undefined
    },
    customers: {
      customerId: 'entity_id',
      email: 'email',
      firstName: 'firstname',
      lastName: 'lastname',
      ordersCount: undefined,
      totalSpent: undefined,
      createdAt: 'created_at'
    }
  }
}

/**
 * Get the schema for a specific platform
 * Falls back to Shopify schema if platform not found
 */
export function getPlatformSchema(platformName: string): PlatformSchema {
  const key = platformName.toLowerCase()
  return PLATFORM_SCHEMAS[key] || PLATFORM_SCHEMAS.shopify
}

/**
 * Build a SELECT clause with proper column names for a platform
 */
export function buildSelectClause(
  platformName: string,
  tableType: 'shopInfo' | 'orders' | 'orderItems' | 'products' | 'variants' | 'customers',
  columns: string[]
): string {
  const schema = getPlatformSchema(platformName)
  const tableSchema = schema[tableType]

  return columns.map(col => {
    // Map generic column names to platform-specific column names
    const platformCol = (tableSchema as any)[col]
    if (platformCol) {
      return `${platformCol} as ${col}`
    }
    // Column might not exist for this platform, use NULL as fallback
    return `NULL as ${col}`
  }).join(',\n    ')
}
