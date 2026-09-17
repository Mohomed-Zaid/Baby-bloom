import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Scan,
  Search,
  AlertCircle,
  CheckCircle2,
  ReceiptText,
  Printer,
  Building2,
  TrendingDown,
  Sparkles,
} from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { lookupPriceCheck, type PriceCheckResult } from '../services/extrasService'
import { generateBarcodeSvg } from '../lib/barcodeGenerator'
import { useBranchStore } from '../stores/branchStore'

export const PriceCheckPage: React.FC = () => {
  const navigate = useNavigate()
  const branchId = useBranchStore((state) => state.branchId)
  const branchName = useBranchStore((state) => state.branchName)

  const [inputVal, setInputVal] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [activeSelectionId, setActiveSelectionId] = useState<string | null>(null)
  const scannerInputRef = useRef<HTMLInputElement>(null)

  // Focus input automatically on mount
  useEffect(() => {
    scannerInputRef.current?.focus()
  }, [])

  // Live Query
  const { data: results = [], isLoading, isFetching } = useQuery({
    queryKey: ['price-check-lookup', activeQuery, branchId],
    queryFn: () => lookupPriceCheck(activeQuery, branchId || undefined),
    enabled: activeQuery.trim().length > 0,
  })

  // Selected item derived cleanly without synchronous setState inside effect
  const selectedResult: PriceCheckResult | null = useMemo(() => {
    if (!results || results.length === 0) return null
    if (activeSelectionId) {
      const found = results.find((r) => r.variant_id === activeSelectionId)
      if (found) return found
    }
    return results[0] || null
  }, [results, activeSelectionId])

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputVal.trim()) {
      setActiveSelectionId(null)
      setActiveQuery(inputVal.trim())
    }
  }

  const handleClear = () => {
    setInputVal('')
    setActiveQuery('')
    setActiveSelectionId(null)
    scannerInputRef.current?.focus()
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2,
    }).format(val).replace('LKR', 'Rs.')
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Floor Price Checker & Rapid Scanner"
        description="Instant barcode scanner terminal for retail floor staff to verify customer pricing and stock availability."
        breadcrumbs={[{ label: 'Extras' }, { label: 'Price Checker' }]}
        actions={
          <div className="branch-indicator-badge">
            <Building2 size={15} />
            <span>Branch: <strong>{branchName || 'All Branch Inventory'}</strong></span>
          </div>
        }
      />

      {/* SCANNER HIGH-SPEED INPUT BAR */}
      <section className="content-panel price-check-hero">
        <form onSubmit={handleScanSubmit} className="scanner-hero-form">
          <div className="scanner-hero-input-wrap">
            <Scan size={28} className="scanner-glow-icon animate-pulse" />
            <input
              ref={scannerInputRef}
              type="text"
              className="scanner-hero-input"
              placeholder="Scan barcode or type SKU / product name..."
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              autoFocus
            />
            {inputVal && (
              <button
                type="button"
                className="button secondary scanner-clear-btn"
                onClick={handleClear}
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              className="button primary scanner-lookup-btn"
              disabled={!inputVal.trim() || isFetching}
            >
              <Search size={16} /> Lookup
            </button>
          </div>
        </form>
      </section>

      {/* RESULT CARDS */}
      {isLoading ? (
        <div className="panel-state">
          <div className="spinner mb-2" />
          <span>Searching product price catalog...</span>
        </div>
      ) : activeQuery && results.length === 0 ? (
        <div className="content-panel empty-state p-6">
          <AlertCircle size={40} className="text-amber-600 mb-2 mx-auto" />
          <h3>No Product Found</h3>
          <p className="text-muted">
            No active product matched barcode or query <b>"{activeQuery}"</b>.
            Please verify the barcode or register it in Product Master.
          </p>
          <button
            className="button secondary mt-3"
            onClick={handleClear}
          >
            Scan Another Item
          </button>
        </div>
      ) : selectedResult ? (
        <div className="price-check-details-grid">
          {/* MAIN PRICE HERO PANEL */}
          <section className="content-panel price-display-main">
            <div className="price-main-header">
              <span className="price-category-tag">
                {selectedResult.category_name || 'General Inventory'} &bull; {selectedResult.brand_name || 'Baby Bloom'}
              </span>
              <h1 className="price-prod-name">{selectedResult.product_name}</h1>
              <div className="price-code-strip">
                <span>Code: <strong>{selectedResult.product_code}</strong></span>
                <span>SKU: <strong>{selectedResult.sku}</strong></span>
                {selectedResult.barcode && (
                  <span>Barcode: <code>{selectedResult.barcode}</code></span>
                )}
              </div>
            </div>

            {/* MULTI-MATCH PICKER IF MORE THAN 1 RESULT */}
            {results.length > 1 && (
              <div className="multi-variant-bar my-3">
                <span className="text-xs text-muted block mb-1">Multiple matches found:</span>
                <div className="flex flex-wrap gap-2">
                  {results.map((r) => (
                    <button
                      key={r.variant_id}
                      type="button"
                      className={`button extra-small-btn ${
                        r.variant_id === selectedResult.variant_id ? 'primary' : 'secondary'
                      }`}
                      onClick={() => setActiveSelectionId(r.variant_id)}
                    >
                      {r.sku} - Rs. {r.retail_price.toFixed(2)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* GIANT RETAIL PRICE BADGE */}
            <div className="giant-price-banner">
              <span className="price-badge-label">Retail Selling Price</span>
              <div className="giant-price-number">
                <small>Rs.</small>
                {selectedResult.retail_price.toFixed(2)}
              </div>
              <span className="price-vat-note">Inclusive of all standard retail taxes</span>
            </div>

            {/* SECONDARY TIERS */}
            <div className="price-tier-grid">
              <div className="tier-card">
                <span className="tier-label">Wholesale Price</span>
                <strong className="tier-val">{formatCurrency(selectedResult.wholesale_price)}</strong>
              </div>
              <div className="tier-card">
                <span className="tier-label">Special Offer Price</span>
                <strong className="tier-val">{formatCurrency(selectedResult.special_price)}</strong>
              </div>
              <div className="tier-card">
                <span className="tier-label">Minimum Selling Limit</span>
                <strong className="tier-val">{formatCurrency(selectedResult.minimum_price)}</strong>
              </div>
            </div>

            {/* QUICK ACTIONS */}
            <div className="price-actions-toolbar">
              <button
                className="button primary"
                onClick={() => navigate('/sales/pos')}
              >
                <ReceiptText size={16} /> Open POS Terminal
              </button>
              <button
                className="button secondary"
                onClick={() => navigate('/inventory/generate-barcode')}
              >
                <Printer size={16} /> Print Barcode Label
              </button>
            </div>
          </section>

          {/* SIDEBAR: STOCK & SPECS */}
          <section className="content-panel price-stock-sidebar">
            <div className="panel-heading-bar">
              <div>
                <span className="eyebrow">Inventory Status</span>
                <h2 className="panel-title">Current Branch Stock</h2>
              </div>
            </div>

            <div className="stock-level-card">
              <div className="stock-big-number">
                <strong>{selectedResult.current_stock.toFixed(2)}</strong>
                <span>Units in Stock</span>
              </div>

              {selectedResult.current_stock <= selectedResult.reorder_level ? (
                <div className="stock-alert-pill danger">
                  <TrendingDown size={14} /> Low Stock Alert (Reorder: {selectedResult.reorder_level})
                </div>
              ) : (
                <div className="stock-alert-pill safe">
                  <CheckCircle2 size={14} /> Adequate Branch Stock
                </div>
              )}
            </div>

            <div className="spec-info-list">
              <div className="spec-row">
                <span className="text-muted">Reorder Threshold</span>
                <strong>{selectedResult.reorder_level} units</strong>
              </div>
              <div className="spec-row">
                <span className="text-muted">Minimum Floor Stock</span>
                <strong>{selectedResult.minimum_stock} units</strong>
              </div>
              <div className="spec-row">
                <span className="text-muted">Standard Warranty</span>
                <strong>{selectedResult.warranty_days ? `${selectedResult.warranty_days} Days` : 'No Warranty'}</strong>
              </div>
              <div className="spec-row">
                <span className="text-muted">Status</span>
                <span className={`status-pill ${selectedResult.is_active ? 'ready' : 'inactive'}`}>
                  {selectedResult.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* VECTOR BARCODE PREVIEW */}
            <div className="sidebar-barcode-box">
              <span className="text-muted text-xs block mb-1">Scanned Barcode Stamp</span>
              <div
                dangerouslySetInnerHTML={{
                  __html: generateBarcodeSvg(selectedResult.barcode || selectedResult.sku, {
                    height: 42,
                    fontSize: 10,
                  }),
                }}
              />
            </div>
          </section>
        </div>
      ) : (
        /* INITIAL READY TO SCAN STATE */
        <div className="content-panel scanner-ready-state">
          <Sparkles size={48} className="text-emerald-700 mb-3 mx-auto" />
          <h2>Ready to Scan</h2>
          <p>Scan any barcode on a product box or tag to instantly view retail price, wholesale price, and current stock level.</p>
        </div>
      )}
    </div>
  )
}
