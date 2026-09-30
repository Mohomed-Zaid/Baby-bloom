/**
 * WooCommerce REST API v3 Integration Service
 * Enables bi-directional sync of products and catalog metadata.
 */

export interface WooCommerceConfig {
  storeUrl: string
  consumerKey: string
  consumerSecret: string
  autoSync: boolean
  syncPrices: boolean
  syncImages: boolean
  manageStock: boolean
}

const STORAGE_KEY = 'baby_bloom_woocommerce_config'

export function getWooCommerceConfig(): WooCommerceConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw) as WooCommerceConfig
    }
  } catch {
    // ignore parse error
  }
  return {
    storeUrl: '',
    consumerKey: '',
    consumerSecret: '',
    autoSync: false,
    syncPrices: true,
    syncImages: true,
    manageStock: true,
  }
}

export function saveWooCommerceConfig(cfg: WooCommerceConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

export interface WooProductPayload {
  name: string
  sku?: string
  regular_price?: string
  sale_price?: string
  description?: string
  short_description?: string
  categories?: Array<{ id?: number; name?: string }>
  images?: Array<{ src: string }>
  manage_stock?: boolean
  stock_quantity?: number
  status?: 'publish' | 'draft'
}

/**
 * Creates authentication headers or URL parameters for WooCommerce REST API.
 */
function getAuthUrl(baseUrl: string, endpoint: string, config: WooCommerceConfig): string {
  let cleanBase = baseUrl.trim().replace(/\/+$/, '')
  if (!cleanBase.startsWith('http://') && !cleanBase.startsWith('https://')) {
    cleanBase = `https://${cleanBase}`
  }

  const separator = endpoint.includes('?') ? '&' : '?'
  const authParams = `consumer_key=${encodeURIComponent(config.consumerKey.trim())}&consumer_secret=${encodeURIComponent(config.consumerSecret.trim())}`
  return `${cleanBase}/wp-json/wc/v3/${endpoint.replace(/^\/+/, '')}${separator}${authParams}`
}

/**
 * Test WooCommerce API credentials
 */
export async function testWooCommerceConnection(config?: WooCommerceConfig): Promise<{ success: boolean; message: string }> {
  const cfg = config || getWooCommerceConfig()
  if (!cfg.storeUrl || !cfg.consumerKey || !cfg.consumerSecret) {
    return { success: false, message: 'Please provide Store URL, Consumer Key, and Consumer Secret.' }
  }

  try {
    const url = getAuthUrl(cfg.storeUrl, 'system_status', cfg)
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (response.ok) {
      return { success: true, message: 'Successfully connected to WooCommerce store!' }
    }

    // Try fallback check via products endpoint
    const fallbackUrl = getAuthUrl(cfg.storeUrl, 'products?per_page=1', cfg)
    const fbResponse = await fetch(fallbackUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })

    if (fbResponse.ok) {
      return { success: true, message: 'Connected to WooCommerce product catalog!' }
    }

    const errJson = await response.json().catch(() => null)
    return {
      success: false,
      message: errJson?.message || `HTTP ${response.status}: ${response.statusText}`,
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Network error connecting to store.',
    }
  }
}

/**
 * Find existing product in WooCommerce by SKU
 */
export async function findWooProductBySku(sku: string, config?: WooCommerceConfig): Promise<{ id: number } | null> {
  const cfg = config || getWooCommerceConfig()
  if (!cfg.storeUrl || !sku) return null

  try {
    const url = getAuthUrl(cfg.storeUrl, `products?sku=${encodeURIComponent(sku)}`, cfg)
    const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } })
    if (!response.ok) return null
    const data = await response.json()
    if (Array.isArray(data) && data.length > 0 && data[0]?.id) {
      return { id: Number(data[0].id) }
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Create or Update a single product in WooCommerce
 */
export async function syncProductToWooCommerce(payload: WooProductPayload, config?: WooCommerceConfig): Promise<{ success: boolean; message: string; wooId?: number }> {
  const cfg = config || getWooCommerceConfig()
  if (!cfg.storeUrl || !cfg.consumerKey || !cfg.consumerSecret) {
    return { success: false, message: 'WooCommerce credentials not configured.' }
  }

  try {
    // Check if product exists by SKU
    let existingId: number | null = null
    if (payload.sku) {
      const match = await findWooProductBySku(payload.sku, cfg)
      if (match) existingId = match.id
    }

    const endpoint = existingId ? `products/${existingId}` : 'products'
    const method = existingId ? 'PUT' : 'POST'
    const url = getAuthUrl(cfg.storeUrl, endpoint, cfg)

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => null)
      return {
        success: false,
        message: err?.message || `Failed to sync (HTTP ${response.status})`,
      }
    }

    const data = await response.json()
    return {
      success: true,
      message: existingId ? `Updated product #${existingId} on website.` : `Created product #${data.id} on website.`,
      wooId: data.id,
    }
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Error synchronizing with website.',
    }
  }
}

/**
 * Bulk sync a list of products to WooCommerce
 */
export async function bulkSyncProductsToWooCommerce(
  products: WooProductPayload[],
  onProgress?: (current: number, total: number, lastMessage: string) => void,
  config?: WooCommerceConfig
): Promise<{ total: number; succeeded: number; failed: number; errors: string[] }> {
  const cfg = config || getWooCommerceConfig()
  let succeeded = 0
  let failed = 0
  const errors: string[] = []

  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    if (!p) continue
    onProgress?.(i + 1, products.length, `Syncing ${p.name}...`)

    const res = await syncProductToWooCommerce(p, cfg)
    if (res.success) {
      succeeded++
    } else {
      failed++
      errors.push(`${p.name}: ${res.message}`)
    }
  }

  return {
    total: products.length,
    succeeded,
    failed,
    errors,
  }
}
