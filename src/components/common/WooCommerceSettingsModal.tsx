import { useState } from 'react'
import { CheckCircle2, Globe, RefreshCw, X, AlertCircle } from 'lucide-react'
import {
  getWooCommerceConfig,
  saveWooCommerceConfig,
  testWooCommerceConnection,
  bulkSyncProductsToWooCommerce,
  type WooCommerceConfig,
  type WooProductPayload
} from '../../services/woocommerce'
import { requireSupabase, throwOnError } from '../../services/client'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function WooCommerceSettingsModal({ isOpen, onClose }: Props) {
  const [config, setConfig] = useState<WooCommerceConfig>(() => getWooCommerceConfig())
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [savedNotice, setSavedNotice] = useState(false)

  // Bulk sync state
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; message: string } | null>(null)
  const [syncSummary, setSyncSummary] = useState<{ succeeded: number; failed: number } | null>(null)

  if (!isOpen) return null

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const res = await testWooCommerceConnection(config)
    setTesting(false)
    setTestResult(res)
  }

  const handleSave = () => {
    saveWooCommerceConfig(config)
    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 3000)
  }

  const handleBulkSync = async () => {
    setSyncing(true)
    setSyncProgress({ current: 0, total: 0, message: 'Fetching active product catalog...' })
    setSyncSummary(null)

    try {
      const { data, error } = await requireSupabase()
        .from('products')
        .select(`
          id, product_code, name, description, image_url,
          category:categories(name),
          variants:product_variants(sku, retail_price, special_price, purchase_price, average_cost)
        `)
        .eq('product_status', 'active')

      throwOnError(error)

      const rawRows = (data ?? []) as unknown as Array<{
        id: string
        product_code: string
        name: string
        description: string | null
        image_url: string | null
        category?: { name: string } | null
        variants?: Array<{
          sku: string
          retail_price: number
          special_price: number
        }>
      }>

      const products: WooProductPayload[] = rawRows.map((row) => {
        const pVariant = row.variants?.[0]
        return {
          name: row.name,
          sku: pVariant?.sku || row.product_code,
          regular_price: pVariant?.retail_price ? String(pVariant.retail_price) : undefined,
          sale_price: pVariant?.special_price && pVariant.special_price > 0 ? String(pVariant.special_price) : undefined,
          description: row.description || '',
          categories: row.category?.name ? [{ name: row.category.name }] : undefined,
          images: row.image_url ? [{ src: row.image_url }] : undefined,
          manage_stock: config.manageStock,
          status: 'publish',
        }
      })

      const res = await bulkSyncProductsToWooCommerce(products, (current, total, message) => {
        setSyncProgress({ current, total, message })
      }, config)

      setSyncSummary({ succeeded: res.succeeded, failed: res.failed })
    } catch (err) {
      setSyncProgress({
        current: 0,
        total: 0,
        message: err instanceof Error ? err.message : 'Failed to fetch catalog.',
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          backgroundColor: '#072421',
          border: '1px solid #1a564f',
          borderRadius: '8px',
          padding: '24px',
          width: '540px',
          maxWidth: '92vw',
          color: '#ffffff',
          boxShadow: '0 20px 30px rgba(0,0,0,0.6)',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid #13453f', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={20} color="#00b4d8" />
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>WooCommerce Integration</h3>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>Connect POS &amp; Catalog directly to your WordPress Store</p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Form Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#5eead4', marginBottom: '4px' }}>
              STORE URL (HTTPS)
            </label>
            <input
              type="url"
              value={config.storeUrl}
              onChange={e => setConfig(p => ({ ...p, storeUrl: e.target.value }))}
              placeholder="https://yourbabystore.com"
              style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '4px', color: '#ffffff', padding: '8px 10px', fontSize: '13px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#5eead4', marginBottom: '4px' }}>
              CONSUMER KEY
            </label>
            <input
              type="text"
              value={config.consumerKey}
              onChange={e => setConfig(p => ({ ...p, consumerKey: e.target.value }))}
              placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '4px', color: '#ffffff', padding: '8px 10px', fontSize: '13px', fontFamily: 'monospace' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#5eead4', marginBottom: '4px' }}>
              CONSUMER SECRET
            </label>
            <input
              type="password"
              value={config.consumerSecret}
              onChange={e => setConfig(p => ({ ...p, consumerSecret: e.target.value }))}
              placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '4px', color: '#ffffff', padding: '8px 10px', fontSize: '13px', fontFamily: 'monospace' }}
            />
          </div>

          {/* Sync Preferences Checkboxes */}
          <div style={{ backgroundColor: 'rgba(2, 16, 15, 0.5)', border: '1px solid #13453f', borderRadius: '4px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.autoSync}
                onChange={e => setConfig(p => ({ ...p, autoSync: e.target.checked }))}
                style={{ accentColor: '#00b4d8' }}
              />
              <span style={{ fontWeight: 600 }}>Auto-sync products to website when created or edited</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.manageStock}
                onChange={e => setConfig(p => ({ ...p, manageStock: e.target.checked }))}
                style={{ accentColor: '#00b4d8' }}
              />
              <span>Enable WooCommerce stock management</span>
            </label>
          </div>

          {/* Test connection alert */}
          {testResult && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                backgroundColor: testResult.success ? '#064e3b' : '#7f1d1d',
                border: `1px solid ${testResult.success ? '#10b981' : '#ef4444'}`,
                color: '#ffffff',
              }}
            >
              {testResult.success ? <CheckCircle2 size={16} color="#34d399" /> : <AlertCircle size={16} color="#f87171" />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Bulk sync progress */}
          {syncProgress && (
            <div style={{ backgroundColor: '#041d1a', border: '1px solid #164e48', borderRadius: '4px', padding: '10px 12px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 600 }}>
                <span>{syncProgress.message}</span>
                {syncProgress.total > 0 && <span>{syncProgress.current} / {syncProgress.total}</span>}
              </div>
              {syncSummary && (
                <span style={{ color: '#34d399', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                  ✓ Finished! Succeeded: {syncSummary.succeeded}, Failed: {syncSummary.failed}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #13453f', paddingTop: '14px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              disabled={testing || syncing || !config.storeUrl}
              onClick={handleTest}
              style={{
                backgroundColor: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #334155',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: testing ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {testing ? <RefreshCw size={13} className="animate-spin" /> : null}
              {testing ? 'Testing...' : 'Test Connection'}
            </button>

            <button
              type="button"
              disabled={syncing || !config.storeUrl}
              onClick={handleBulkSync}
              style={{
                backgroundColor: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: syncing ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {syncing ? <RefreshCw size={13} className="animate-spin" /> : <Globe size={13} />}
              {syncing ? 'Syncing Catalog...' : 'Sync All to Web'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {savedNotice && (
              <span style={{ color: '#34d399', fontSize: '12px', fontWeight: 600 }}>Saved!</span>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{ backgroundColor: '#13453f', color: '#cbd5e1', border: 'none', borderRadius: '4px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer' }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                backgroundColor: '#00b4d8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 16px',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
