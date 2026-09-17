import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Printer,
  Search,
  CheckCircle,
  Sparkles,
} from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { branding } from '../config/branding'
import { generateBarcodeSvg } from '../lib/barcodeGenerator'
import {
  fetchBarcodeTemplates,
  type BarcodeLabelTemplate,
  lookupPriceCheck,
  type PriceCheckResult,
} from '../services/extrasService'
import { useBranchStore } from '../stores/branchStore'

export const BarcodeGeneratorPage: React.FC = () => {
  const branchId = useBranchStore((state) => state.branchId)

  // Search & Selection
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<PriceCheckResult | null>(null)
  const [customBarcode, setCustomBarcode] = useState('')
  const [customTitle, setCustomTitle] = useState('')
  const [customPrice, setCustomPrice] = useState<number | ''>('')
  const [mfgDate, setMfgDate] = useState('')
  const [expDate, setExpDate] = useState('')
  const [copies, setCopies] = useState<number>(1)

  // Options
  const [showPrice, setShowPrice] = useState(true)
  const [showBarcode, setShowBarcode] = useState(true)
  const [showMfgExp, setShowMfgExp] = useState(false)
  const [showCompany, setShowCompany] = useState(true)
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0)

  // Templates
  const { data: templates = [] } = useQuery({
    queryKey: ['barcode-templates'],
    queryFn: () => fetchBarcodeTemplates(),
  })

  const currentTemplate: BarcodeLabelTemplate = templates[selectedTemplateIndex] || {
    template_name: 'Single Thermal 50mm x 25mm',
    paper_width_mm: 50,
    paper_height_mm: 25,
    columns: 1,
    show_barcode: true,
    show_price: true,
    show_mfg_date: false,
    show_exp_date: false,
    is_default: true,
  }

  // Live product search
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ['barcode-product-search', searchQuery, branchId],
    queryFn: () => lookupPriceCheck(searchQuery, branchId || undefined),
    enabled: searchQuery.trim().length > 1,
  })

  // Set initial product or custom values
  const handleSelectProduct = (prod: PriceCheckResult) => {
    setSelectedProduct(prod)
    setCustomTitle(prod.product_name)
    setCustomBarcode(prod.barcode || prod.sku)
    setCustomPrice(prod.retail_price)
    setSearchQuery('')
  }

  // Active barcode string
  const activeBarcode = useMemo(() => {
    if (customBarcode.trim()) return customBarcode.trim()
    if (selectedProduct) return selectedProduct.barcode || selectedProduct.sku
    return 'BABY-00129'
  }, [customBarcode, selectedProduct])

  // Active Title
  const activeTitle = useMemo(() => {
    if (customTitle.trim()) return customTitle.trim()
    if (selectedProduct) return selectedProduct.product_name
    return 'Baby Bloom Premium Product'
  }, [customTitle, selectedProduct])

  // Active Price
  const activePrice = useMemo(() => {
    if (customPrice !== '') return Number(customPrice)
    if (selectedProduct) return selectedProduct.retail_price
    return 1450
  }, [customPrice, selectedProduct])

  // Barcode SVG markup
  const svgMarkup = useMemo(() => {
    return generateBarcodeSvg(activeBarcode, {
      height: 48,
      fontSize: 10,
      showText: true,
    })
  }, [activeBarcode])

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="page-stack">
      <div className="no-print">
        <PageHeader
          title="Barcode Generator & Batch Label Designer"
          description="Design and print thermal roll labels and A4 sticky barcode sheets for retail scanning."
          breadcrumbs={[{ label: 'Inventory' }, { label: 'Barcode Generator' }]}
          actions={
            <button className="button primary" onClick={handlePrint}>
              <Printer size={15} /> Print {copies} {copies === 1 ? 'Label' : 'Labels'}
            </button>
          }
        />
      </div>

      <div className="barcode-layout-grid no-print">
        {/* LEFT COLUMN: PRODUCT PICKER & CONFIGURATION */}
        <section className="content-panel barcode-config-panel">
          <div className="panel-heading-bar">
            <div>
              <span className="eyebrow">Label Source & Parameters</span>
              <h2 className="panel-title">Product & Content Settings</h2>
            </div>
          </div>

          {/* Product Search Box */}
          <div className="barcode-search-box">
            <label className="field-label">Search Product by Name, SKU or Barcode</label>
            <div className="search-input-wrap">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="text-input"
                placeholder="Type product name or scan existing barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Search Dropdown Results */}
            {searchQuery.trim().length > 1 && (
              <div className="product-search-dropdown">
                {isSearching ? (
                  <div className="dropdown-item muted-text">Searching inventory...</div>
                ) : searchResults.length === 0 ? (
                  <div className="dropdown-item muted-text">No matching products found.</div>
                ) : (
                  searchResults.map((prod) => (
                    <div
                      key={prod.variant_id}
                      className="dropdown-item product-search-item"
                      onClick={() => handleSelectProduct(prod)}
                    >
                      <div className="prod-meta">
                        <strong>{prod.product_name}</strong>
                        <small>
                          SKU: {prod.sku} {prod.barcode ? `| Barcode: ${prod.barcode}` : ''}
                        </small>
                      </div>
                      <div className="prod-price-badge">
                        Rs. {prod.retail_price.toFixed(2)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedProduct && (
            <div className="selected-product-alert">
              <CheckCircle size={16} className="text-emerald-600" />
              <div className="flex-1">
                <strong>{selectedProduct.product_name}</strong>
                <span>
                  SKU: {selectedProduct.sku} &bull; Retail: Rs. {selectedProduct.retail_price.toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                className="button secondary extra-small-btn"
                onClick={() => setSelectedProduct(null)}
              >
                Clear
              </button>
            </div>
          )}

          {/* Form Fields */}
          <div className="barcode-form-grid">
            <div className="form-group field-wide">
              <label className="field-label">Product Label Title</label>
              <input
                type="text"
                className="text-input"
                value={customTitle}
                placeholder="Product name on label"
                onChange={(e) => setCustomTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="field-label">Barcode Value (CODE128)</label>
              <input
                type="text"
                className="text-input font-mono"
                value={customBarcode}
                placeholder="e.g. 890123456789"
                onChange={(e) => setCustomBarcode(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="field-label">Price Tag (Rs.)</label>
              <input
                type="number"
                step="0.01"
                className="text-input"
                value={customPrice}
                placeholder="0.00"
                onChange={(e) => setCustomPrice(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label className="field-label">Manufacture Date (MFD)</label>
              <input
                type="date"
                className="text-input"
                value={mfgDate}
                onChange={(e) => setMfgDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="field-label">Expiry Date (EXP)</label>
              <input
                type="date"
                className="text-input"
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="field-label">Number of Copies</label>
              <input
                type="number"
                min="1"
                max="500"
                className="text-input"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>

            <div className="form-group">
              <label className="field-label">Label Paper / Sheet Template</label>
              <select
                className="text-input compact-select"
                value={selectedTemplateIndex}
                onChange={(e) => setSelectedTemplateIndex(parseInt(e.target.value, 10))}
              >
                {templates.map((t, idx) => (
                  <option key={t.template_name} value={idx}>
                    {t.template_name} ({t.paper_width_mm}x{t.paper_height_mm}mm)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Visibility Toggles */}
          <div className="label-toggles-grid">
            <label className="check-label">
              <input
                type="checkbox"
                checked={showCompany}
                onChange={(e) => setShowCompany(e.target.checked)}
              />
              <span>Show Store Header ({branding.name})</span>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={showBarcode}
                onChange={(e) => setShowBarcode(e.target.checked)}
              />
              <span>Show Barcode Lines</span>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={showPrice}
                onChange={(e) => setShowPrice(e.target.checked)}
              />
              <span>Show Retail Price in Rs.</span>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={showMfgExp}
                onChange={(e) => setShowMfgExp(e.target.checked)}
              />
              <span>Show MFD / EXP Dates</span>
            </label>
          </div>
        </section>

        {/* RIGHT COLUMN: LIVE REAL-TIME PREVIEW & PRINT SPECS */}
        <section className="content-panel barcode-preview-panel">
          <div className="panel-heading-bar">
            <div>
              <span className="eyebrow">Real-Time Canvas</span>
              <h2 className="panel-title">Label Design Preview</h2>
            </div>
            <span className="badge-spec">
              {currentTemplate.paper_width_mm}mm &times; {currentTemplate.paper_height_mm}mm
            </span>
          </div>

          {/* SINGLE THERMAL LABEL PREVIEW CARD */}
          <div className="preview-stage-wrap">
            <div
              className="thermal-label-canvas"
              style={{
                width: `${Math.max(220, currentTemplate.paper_width_mm * 4.5)}px`,
                minHeight: `${Math.max(120, currentTemplate.paper_height_mm * 4.5)}px`,
              }}
            >
              {showCompany && (
                <div className="label-company-header">{branding.name}</div>
              )}
              <div className="label-prod-title">{activeTitle}</div>

              {showBarcode && (
                <div
                  className="label-barcode-svg-wrap"
                  dangerouslySetInnerHTML={{ __html: svgMarkup }}
                />
              )}

              <div className="label-bottom-row">
                {showMfgExp && (mfgDate || expDate) ? (
                  <div className="label-dates">
                    {mfgDate && <span>MFD: {mfgDate}</span>}
                    {expDate && <span>EXP: {expDate}</span>}
                  </div>
                ) : (
                  <span className="label-meta-sku">SKU: {activeBarcode}</span>
                )}

                {showPrice && (
                  <div className="label-price-tag">
                    <small>Rs.</small> {activePrice.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="print-tips-card">
            <Sparkles size={16} className="text-emerald-700" />
            <div>
              <strong>Thermal Roll & Sheet Ready</strong>
              <p>
                Click <b>Print</b> to trigger thermal barcode printing or multi-label grid output.
                Printer margins are preset for seamless roll feeding without clipping.
              </p>
            </div>
          </div>

          <button className="button primary full-width-btn" onClick={handlePrint}>
            <Printer size={16} /> Print {copies} {copies === 1 ? 'Label' : 'Labels'} Now
          </button>
        </section>
      </div>

      {/* PRINT-ONLY CONTAINER (Triggered on window.print()) */}
      <div className="barcode-print-sheet">
        {Array.from({ length: copies }).map((_, i) => (
          <div
            key={i}
            className="print-single-label"
            style={{
              width: `${currentTemplate.paper_width_mm}mm`,
              height: `${currentTemplate.paper_height_mm}mm`,
            }}
          >
            {showCompany && <div className="p-store">{branding.name}</div>}
            <div className="p-title">{activeTitle}</div>
            {showBarcode && (
              <div
                className="p-barcode"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            )}
            <div className="p-footer">
              {showMfgExp && (mfgDate || expDate) ? (
                <div className="p-dates">
                  {mfgDate && <span>M:{mfgDate}</span>}
                  {expDate && <span>E:{expDate}</span>}
                </div>
              ) : (
                <span className="p-sku">{activeBarcode}</span>
              )}
              {showPrice && (
                <div className="p-price">Rs.{activePrice.toFixed(2)}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
