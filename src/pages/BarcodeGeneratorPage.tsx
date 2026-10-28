import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Barcode as BarcodeIcon,
  Printer,
  Search,
  Plus,
  Trash2,
  Sparkles,
  Layers,
  Settings2,
  CheckCircle2,
  Sliders,
  Calendar,
  PlusCircle,
  FileText,
  Tag,
  Check,
} from 'lucide-react'
import { generateBarcodeSvg } from '../lib/barcodeGenerator'
import { formatLkr } from '../lib/currency'
import {
  type BarcodeLabelTemplate,
  lookupPriceCheck,
  type PriceCheckResult,
} from '../services/extrasService'
import { listOpeningStockVariants } from '../services/inventory'
import { logSystemAction } from '../services/auditService'
import { useBranchStore } from '../stores/branchStore'

interface BatchItem {
  id: string
  product_name: string
  variant_name: string
  sku: string
  barcode: string
  retail_price: number
  copies: number
  mfg_date?: string
  exp_date?: string
  batch_number?: string
}

const PRESET_TEMPLATES: BarcodeLabelTemplate[] = [
  {
    template_name: 'Single Thermal 50mm × 25mm (Standard Retail)',
    paper_width_mm: 50,
    paper_height_mm: 25,
    columns: 1,
    show_barcode: true,
    show_price: true,
    show_mfg_date: false,
    show_exp_date: false,
    is_default: true,
  },
  {
    template_name: 'Single Thermal 40mm × 30mm (Baby Garment Tag)',
    paper_width_mm: 40,
    paper_height_mm: 30,
    columns: 1,
    show_barcode: true,
    show_price: true,
    show_mfg_date: false,
    show_exp_date: false,
    is_default: false,
  },
  {
    template_name: 'Single Thermal 38mm × 25mm (Compact Jewellery / Cosmetics)',
    paper_width_mm: 38,
    paper_height_mm: 25,
    columns: 1,
    show_barcode: true,
    show_price: true,
    show_mfg_date: false,
    show_exp_date: false,
    is_default: false,
  },
  {
    template_name: 'Warehouse / Shipping Carton 100mm × 50mm',
    paper_width_mm: 100,
    paper_height_mm: 50,
    columns: 1,
    show_barcode: true,
    show_price: false,
    show_mfg_date: true,
    show_exp_date: true,
    is_default: false,
  },
  {
    template_name: 'A4 Sheet 24-Up (3 Columns × 8 Rows, 70mm × 37mm)',
    paper_width_mm: 70,
    paper_height_mm: 37,
    columns: 3,
    show_barcode: true,
    show_price: true,
    show_mfg_date: true,
    show_exp_date: true,
    is_default: false,
  },
  {
    template_name: 'A4 Sheet 40-Up (4 Columns × 10 Rows, 52.5mm × 29.7mm)',
    paper_width_mm: 52.5,
    paper_height_mm: 29.7,
    columns: 4,
    show_barcode: true,
    show_price: true,
    show_mfg_date: false,
    show_exp_date: false,
    is_default: false,
  },
]

export const BarcodeGeneratorPage: React.FC = () => {
  const branchId = useBranchStore((state) => state.branchId)

  // ── Navigation Tabs ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'single' | 'batch' | 'templates'>('single')

  // ── Pre-filled Form Values (prevents blank/overlapping defaults) ─────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<PriceCheckResult | null>(null)
  const [customTitle, setCustomTitle] = useState('Baby Bloom Premium Baby Romper')
  const [customBarcode, setCustomBarcode] = useState('2001094821')
  const [customPrice, setCustomPrice] = useState<number | ''>(1450)
  const [mfgDate, setMfgDate] = useState('')
  const [expDate, setExpDate] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [singleCopies, setSingleCopies] = useState<number>(1)

  // ── Label Layout & Elements Options ──────────────────────────────────────────
  const [storeHeader, setStoreHeader] = useState('BABY BLOOM')
  const [showCompany, setShowCompany] = useState(true)
  const [showBarcode] = useState(true)
  const [showPrice, setShowPrice] = useState(true)
  const [showMfgExp, setShowMfgExp] = useState(false)
  const [showBatch, setShowBatch] = useState(false)
  const [showHumanReadable, setShowHumanReadable] = useState(true)
  const [barcodeHeight] = useState<number>(44)
  const [previewScale, setPreviewScale] = useState<number>(1.0)

  // ── Template State ───────────────────────────────────────────────────────────
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0)
  const [customWidthMm, setCustomWidthMm] = useState<number>(50)
  const [customHeightMm, setCustomHeightMm] = useState<number>(25)
  const [customColumns, setCustomColumns] = useState<number>(1)
  const [isCustomTemplate, setIsCustomTemplate] = useState(false)

  // ── Batch Queue State ────────────────────────────────────────────────────────
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([])
  const [batchSearchSelected, setBatchSearchSelected] = useState('')
  const [batchInitialCopies, setBatchInitialCopies] = useState<number>(5)

  // ── Notifications / Toast ────────────────────────────────────────────────────
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null)
  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 3500)
  }

  // ── Active Template Calculation ──────────────────────────────────────────────
  const currentTemplate: BarcodeLabelTemplate = useMemo(() => {
    if (isCustomTemplate) {
      return {
        template_name: `Custom ${customWidthMm}mm × ${customHeightMm}mm`,
        paper_width_mm: customWidthMm,
        paper_height_mm: customHeightMm,
        columns: customColumns,
        show_barcode: showBarcode,
        show_price: showPrice,
        show_mfg_date: showMfgExp,
        show_exp_date: showMfgExp,
        is_default: false,
      }
    }
    return (PRESET_TEMPLATES[selectedPresetIndex] ?? PRESET_TEMPLATES[0])!
  }, [isCustomTemplate, customWidthMm, customHeightMm, customColumns, showBarcode, showPrice, showMfgExp, selectedPresetIndex])

  // ── Product Searches ─────────────────────────────────────────────────────────
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ['barcode-live-search', searchQuery, branchId],
    queryFn: () => lookupPriceCheck(searchQuery, branchId || undefined),
    enabled: searchQuery.trim().length > 1,
  })

  const { data: allCatalogVariants = [] } = useQuery({
    queryKey: ['barcode-catalog-variants'],
    queryFn: () => listOpeningStockVariants(),
  })

  // Set selected product from live search
  const handleSelectProduct = (prod: PriceCheckResult) => {
    setSelectedProduct(prod)
    setCustomTitle(prod.product_name)
    setCustomBarcode(prod.barcode || prod.sku)
    setCustomPrice(prod.retail_price)
    setSearchQuery('')
    showToast(`Loaded "${prod.product_name}" (${prod.sku})`, 'info')
  }

  // Generate unique barcode number
  const handleGenerateRandomBarcode = () => {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000)
    const gen = `200${randomSuffix}`
    setCustomBarcode(gen)
    showToast(`Generated Barcode: ${gen}`, 'info')
  }

  // Active Barcode & Title & Price
  const activeBarcode = useMemo(() => {
    if (customBarcode.trim()) return customBarcode.trim()
    if (selectedProduct) return selectedProduct.barcode || selectedProduct.sku
    return '2001094821'
  }, [customBarcode, selectedProduct])

  const activeTitle = useMemo(() => {
    if (customTitle.trim()) return customTitle.trim()
    if (selectedProduct) return selectedProduct.product_name
    return 'Baby Bloom Premium Baby Romper'
  }, [customTitle, selectedProduct])

  const activePrice = useMemo(() => {
    if (customPrice !== '') return Number(customPrice)
    if (selectedProduct) return selectedProduct.retail_price
    return 1450
  }, [customPrice, selectedProduct])

  // Single SVG generation - Clean height and readable font
  const singleSvgMarkup = useMemo(() => {
    return generateBarcodeSvg(activeBarcode, {
      height: barcodeHeight,
      fontSize: 10,
      showText: showHumanReadable,
      margin: 2,
    })
  }, [activeBarcode, barcodeHeight, showHumanReadable])

  // ── Batch Operations ─────────────────────────────────────────────────────────
  const handleAddToBatch = (prod?: PriceCheckResult | null, copiesCount: number = singleCopies) => {
    const title = prod ? prod.product_name : activeTitle
    const sku = prod ? prod.sku : selectedProduct?.sku || activeBarcode
    const barcode = prod ? prod.barcode || prod.sku : activeBarcode
    const price = prod ? prod.retail_price : activePrice

    const existingIdx = batchQueue.findIndex((b) => b.sku === sku && b.barcode === barcode)
    if (existingIdx >= 0) {
      setBatchQueue((prev) =>
        prev.map((item, idx) => (idx === existingIdx ? { ...item, copies: item.copies + copiesCount } : item))
      )
      showToast(`Updated batch copies for ${sku} (+${copiesCount})`, 'info')
    } else {
      const newItem: BatchItem = {
        id: crypto.randomUUID(),
        product_name: title,
        variant_name: '',
        sku,
        barcode,
        retail_price: price,
        copies: copiesCount,
        mfg_date: mfgDate || undefined,
        exp_date: expDate || undefined,
        batch_number: batchNo || undefined,
      }
      setBatchQueue((prev) => [...prev, newItem])
      showToast(`Added ${sku} to Batch Queue (${copiesCount} copies)`, 'success')
    }
  }

  const handleAddCatalogVariantToBatch = (variantId: string, copiesCount: number) => {
    const found = allCatalogVariants.find((v) => v.id === variantId)
    if (!found) return
    const newItem: BatchItem = {
      id: crypto.randomUUID(),
      product_name: found.product_name,
      variant_name: found.variant_name,
      sku: found.sku,
      barcode: found.barcode || found.sku,
      retail_price: found.retail_price,
      copies: copiesCount,
    }
    setBatchQueue((prev) => [...prev, newItem])
    setBatchSearchSelected('')
    showToast(`Added ${found.sku} (${copiesCount} labels) to queue`, 'success')
  }

  const handleUpdateBatchCopies = (id: string, copies: number) => {
    if (copies <= 0) {
      setBatchQueue((prev) => prev.filter((b) => b.id !== id))
    } else {
      setBatchQueue((prev) => prev.map((b) => (b.id === id ? { ...b, copies } : b)))
    }
  }

  const handleRemoveBatchItem = (id: string) => {
    setBatchQueue((prev) => prev.filter((b) => b.id !== id))
  }

  // Total batch labels count
  const totalBatchLabelsCount = useMemo(() => {
    return batchQueue.reduce((acc, it) => acc + it.copies, 0)
  }, [batchQueue])

  // Calculated Sheet requirement for multi-column layouts
  const calculatedSheets = useMemo(() => {
    if (currentTemplate.columns <= 1) return null
    const labelsPerSheet = currentTemplate.columns * (currentTemplate.columns === 3 ? 8 : 10)
    const sheets = Math.ceil(totalBatchLabelsCount / labelsPerSheet)
    return { labelsPerSheet, sheets }
  }, [totalBatchLabelsCount, currentTemplate])

  // ── Print Triggers ───────────────────────────────────────────────────────────
  const [printMode, setPrintMode] = useState<'single' | 'batch'>('single')

  const handlePrintSingle = () => {
    setPrintMode('single')
    void logSystemAction({
      branchId: branchId || undefined,
      eventType: 'other',
      severity: 'info',
      targetTable: 'product_barcodes',
      action: 'barcode_single_printed',
      title: `Barcode Label Printed (${singleCopies} copies)`,
      details: {
        barcode: customBarcode,
        product: customTitle,
        variant: (selectedProduct as { variant_name?: string } | null)?.variant_name || '',
        price: customPrice || 0,
        copies: singleCopies,
        template: currentTemplate.template_name,
      },
    })
    setTimeout(() => {
      window.print()
    }, 150)
  }

  const handlePrintBatch = () => {
    if (batchQueue.length === 0) {
      showToast('Batch queue is empty. Please add products first.', 'error')
      return
    }
    setPrintMode('batch')
    void logSystemAction({
      branchId: branchId || undefined,
      eventType: 'other',
      severity: 'info',
      targetTable: 'product_barcodes',
      action: 'barcode_batch_printed',
      title: `Batch Barcodes Printed (${totalBatchLabelsCount} labels)`,
      details: {
        total_labels: totalBatchLabelsCount,
        products_count: batchQueue.length,
        template: currentTemplate.template_name,
      },
    })
    setTimeout(() => {
      window.print()
    }, 150)
  }

  // Calculate proportional preview dimensions (crisp, high-DPI display size)
  const previewCardStyle = useMemo(() => {
    const baseWidth = 320
    const ratio = currentTemplate.paper_height_mm / currentTemplate.paper_width_mm
    const calculatedHeight = Math.round(baseWidth * ratio)
    // Constrain height within comfortable viewing limits
    const height = Math.max(145, Math.min(260, calculatedHeight))
    return {
      width: `${baseWidth}px`,
      minHeight: `${height}px`,
    }
  }, [currentTemplate])

  return (
    <div
      className="min-h-screen text-slate-100 p-4 md:p-6"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 backdrop-blur-md transition-all duration-300 ${
            toastMessage.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              : toastMessage.type === 'info'
              ? 'bg-cyan-950/90 border-cyan-500/50 text-cyan-200'
              : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
          }`}
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage.text}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Main Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-teal-900/40 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-500/30 rounded-2xl shadow-lg shadow-teal-950/30">
              <BarcodeIcon className="w-8 h-8 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Barcode Generator &amp; Batch Label Designer
                </h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300">
                  Thermal &amp; A4 Multi-Sheet Ready
                </span>
              </div>
              <p className="text-sm text-teal-200/70 mt-0.5">
                Generate high-density Code-128 vector barcodes, customize label dimensions, and batch-print sticker rolls.
              </p>
            </div>
          </div>

          {/* Sub-nav pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/inventory/current-stock"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Current Stock
            </Link>
            <Link
              to="/inventory/stock-movement"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Stock Movement
            </Link>
            <Link
              to="/inventory/stock-adjustment"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Adjustment
            </Link>
            <Link
              to="/product-barcodes"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/40 border border-teal-800/40 hover:bg-teal-900/50 hover:text-white transition"
            >
              Product Barcodes
            </Link>
            <div className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-teal-800/60 border border-teal-500/40 shadow-sm">
              Label Designer
            </div>
          </div>
        </div>

        {/* ── KPI Summary Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Active Template Spec */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300/80 uppercase tracking-wider">
                Active Label Spec
              </span>
              <div className="p-2 bg-teal-500/10 rounded-xl border border-teal-500/20 text-teal-400">
                <Tag className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold text-white mt-2 truncate">
              {currentTemplate.paper_width_mm}mm × {currentTemplate.paper_height_mm}mm
            </div>
            <div className="text-xs text-teal-300/60 mt-1 truncate">
              {currentTemplate.columns > 1 ? `${currentTemplate.columns} Columns Sheet` : 'Continuous Thermal Roll'}
            </div>
          </div>

          {/* Card 2: Batch Queue Count */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-300/80 uppercase tracking-wider">
                Staged Batch Labels
              </span>
              <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-300 mt-2">
              {totalBatchLabelsCount}
            </div>
            <div className="text-xs text-emerald-400/70 mt-1 flex items-center gap-1">
              <span>{batchQueue.length} unique products staged</span>
            </div>
          </div>

          {/* Card 3: Catalog Variants Ready */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-300/80 uppercase tracking-wider">
                Catalog Ready SKUs
              </span>
              <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
                <BarcodeIcon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-cyan-300 mt-2">
              {allCatalogVariants.length}
            </div>
            <div className="text-xs text-cyan-300/60 mt-1">
              <span>Variants available with barcode</span>
            </div>
          </div>

          {/* Card 4: Output Destination Mode */}
          <div className="bg-gradient-to-br from-[#123834]/60 to-[#0a2321]/80 border border-teal-800/40 rounded-2xl p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300/80 uppercase tracking-wider">
                Print Mode
              </span>
              <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400">
                <Printer className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold text-amber-300 mt-2 truncate">
              {currentTemplate.columns > 1 ? 'A4 Multi-Column Grid' : 'Thermal Label Roll'}
            </div>
            <div className="text-xs text-amber-300/60 mt-1">
              <span>Zero-margin vector SVG fidelity</span>
            </div>
          </div>
        </div>

        {/* ── Mode Navigation Tabs ────────────────────────────────────────────── */}
        <div className="flex border-b border-teal-900/60 gap-2">
          <button
            onClick={() => setActiveTab('single')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'single'
                ? 'border-teal-400 text-teal-300 bg-teal-500/10 rounded-t-xl'
                : 'border-transparent text-teal-300/60 hover:text-white hover:bg-teal-900/20 rounded-t-xl'
            }`}
          >
            <Tag className="w-4 h-4" />
            Single Label Studio &amp; Quick Print
          </button>

          <button
            onClick={() => setActiveTab('batch')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'batch'
                ? 'border-teal-400 text-teal-300 bg-teal-500/10 rounded-t-xl'
                : 'border-transparent text-teal-300/60 hover:text-white hover:bg-teal-900/20 rounded-t-xl'
            }`}
          >
            <Layers className="w-4 h-4" />
            Batch Printing Queue
            {totalBatchLabelsCount > 0 && (
              <span className="px-2 py-0.5 text-xs bg-emerald-600 rounded-full text-white font-bold animate-pulse">
                {totalBatchLabelsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`px-5 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'templates'
                ? 'border-teal-400 text-teal-300 bg-teal-500/10 rounded-t-xl'
                : 'border-transparent text-teal-300/60 hover:text-white hover:bg-teal-900/20 rounded-t-xl'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            Label Format &amp; Template Standards
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 1: SINGLE LABEL STUDIO & QUICK GENERATOR
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'single' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Form Controls (7 cols) */}
            <div className="lg:col-span-7 space-y-5">
              {/* Product Live Search Card */}
              <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-3">
                <div className="flex items-center justify-between border-b border-teal-900/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Search className="w-5 h-5 text-teal-400" />
                    <h3 className="font-bold text-white text-base">Lookup Product from Inventory</h3>
                  </div>
                  <span className="text-xs text-teal-300/60">Type SKU, barcode or name</span>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-400/60" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by product name, barcode (e.g. 200...), or SKU..."
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white placeholder-teal-400/40 focus:outline-none focus:border-teal-400 transition"
                  />

                  {/* Search Results Dropdown */}
                  {searchQuery.trim().length > 1 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-[#0a2321] border border-teal-700/60 rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-teal-900/50">
                      {isSearching ? (
                        <div className="p-3 text-center text-xs text-teal-300/60">
                          Searching catalog...
                        </div>
                      ) : searchResults.length === 0 ? (
                        <div className="p-3 text-center text-xs text-teal-400/60">
                          No matching products found.
                        </div>
                      ) : (
                        searchResults.map((prod) => (
                          <button
                            key={prod.variant_id}
                            type="button"
                            onClick={() => handleSelectProduct(prod)}
                            className="w-full text-left p-3 hover:bg-teal-900/40 flex items-center justify-between transition"
                          >
                            <div>
                              <div className="text-sm font-semibold text-white">{prod.product_name}</div>
                              <div className="text-xs text-teal-300/70 font-mono">
                                SKU: {prod.sku} {prod.barcode ? `· Barcode: ${prod.barcode}` : ''}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-emerald-300 font-mono">
                                {formatLkr(prod.retail_price)}
                              </div>
                              <div className="text-[11px] text-teal-400/60">
                                Stock: {prod.current_stock}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Quick select chips for catalog variants */}
                {allCatalogVariants.length > 0 && !searchQuery && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1">
                    <span className="text-[11px] text-teal-400/60 whitespace-nowrap mr-1">Quick Picks:</span>
                    {allCatalogVariants.slice(0, 4).map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => {
                          setCustomTitle(variant.product_name)
                          setCustomBarcode(variant.barcode || variant.sku)
                          setCustomPrice(variant.retail_price)
                          showToast(`Selected ${variant.sku}`, 'info')
                        }}
                        className="px-2 py-0.5 rounded-lg bg-teal-950/60 border border-teal-800/60 text-[11px] text-teal-300 hover:text-white hover:bg-teal-900 transition whitespace-nowrap"
                      >
                        {variant.sku}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Label Content Form */}
              <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
                <div className="flex items-center justify-between border-b border-teal-900/60 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-teal-400" />
                    <h3 className="font-bold text-white text-base">Label Content &amp; Attributes</h3>
                  </div>
                  {selectedProduct && (
                    <button
                      onClick={() => {
                        setSelectedProduct(null)
                        setCustomTitle('Baby Bloom Premium Baby Romper')
                        setCustomBarcode('2001094821')
                        setCustomPrice(1450)
                      }}
                      className="text-xs text-teal-400 hover:text-white"
                    >
                      Reset to Default
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {/* Product Title */}
                  <div>
                    <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                      Label Product Title *
                    </label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="e.g. Baby Bloom Organic Cotton Baby Romper"
                      className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white placeholder-teal-400/40 focus:outline-none focus:border-teal-400 transition"
                    />
                  </div>

                  {/* Barcode & Auto Generate */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-8">
                      <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                        Barcode Encoded String (Code 128) *
                      </label>
                      <input
                        type="text"
                        value={customBarcode}
                        onChange={(e) => setCustomBarcode(e.target.value)}
                        placeholder="e.g. 2004819284 or SKU-BABY-001"
                        className="w-full px-3 py-2 text-sm font-mono bg-teal-950/70 border border-teal-800/70 rounded-xl text-white placeholder-teal-400/40 focus:outline-none focus:border-teal-400 transition"
                      />
                    </div>
                    <div className="sm:col-span-4 flex items-end">
                      <button
                        type="button"
                        onClick={handleGenerateRandomBarcode}
                        className="w-full px-3 py-2 bg-teal-800/50 hover:bg-teal-700/60 border border-teal-600/50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        Auto Generate
                      </button>
                    </div>
                  </div>

                  {/* Price & Copies */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                        Retail Price (Rs.)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="1450.00"
                        className="w-full px-3 py-2 text-sm font-mono font-bold bg-teal-950/70 border border-teal-800/70 rounded-xl text-white placeholder-teal-400/40 focus:outline-none focus:border-teal-400 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                        Batch / Lot Number
                      </label>
                      <input
                        type="text"
                        value={batchNo}
                        onChange={(e) => setBatchNo(e.target.value)}
                        placeholder="e.g. LOT-26B"
                        className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white placeholder-teal-400/40 focus:outline-none focus:border-teal-400 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                        Copies to Print
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={singleCopies}
                        onChange={(e) => setSingleCopies(Math.max(1, Number(e.target.value)))}
                        className="w-full px-3 py-2 text-sm font-bold bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-teal-400 transition"
                      />
                    </div>
                  </div>

                  {/* Traceability: MFD & EXP */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-teal-300/80 mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-teal-400" />
                        Manufacturing Date (MFD)
                      </label>
                      <input
                        type="date"
                        value={mfgDate}
                        onChange={(e) => setMfgDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-teal-400 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-teal-300/80 mb-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-teal-400" />
                        Expiry Date (EXP)
                      </label>
                      <input
                        type="date"
                        value={expDate}
                        onChange={(e) => setExpDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-teal-400 transition"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Design Toggles Card */}
              <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
                <div className="flex items-center justify-between border-b border-teal-900/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-teal-400" />
                    <h3 className="font-bold text-white text-base">Visual Layout Customizer</h3>
                  </div>
                  <span className="text-xs text-teal-300/70">Element switches</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-teal-950/40 border border-teal-800/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCompany}
                      onChange={(e) => setShowCompany(e.target.checked)}
                      className="w-4 h-4 rounded text-teal-500 bg-teal-950 border-teal-700"
                    />
                    <span className="text-xs font-medium text-teal-200">Show Brand Header</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-teal-950/40 border border-teal-800/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showPrice}
                      onChange={(e) => setShowPrice(e.target.checked)}
                      className="w-4 h-4 rounded text-teal-500 bg-teal-950 border-teal-700"
                    />
                    <span className="text-xs font-medium text-teal-200">Show Retail Price</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-teal-950/40 border border-teal-800/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showHumanReadable}
                      onChange={(e) => setShowHumanReadable(e.target.checked)}
                      className="w-4 h-4 rounded text-teal-500 bg-teal-950 border-teal-700"
                    />
                    <span className="text-xs font-medium text-teal-200">Barcode Text Digits</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-teal-950/40 border border-teal-800/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showMfgExp}
                      onChange={(e) => setShowMfgExp(e.target.checked)}
                      className="w-4 h-4 rounded text-teal-500 bg-teal-950 border-teal-700"
                    />
                    <span className="text-xs font-medium text-teal-200">Show MFD / EXP Dates</span>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-teal-950/40 border border-teal-800/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showBatch}
                      onChange={(e) => setShowBatch(e.target.checked)}
                      className="w-4 h-4 rounded text-teal-500 bg-teal-950 border-teal-700"
                    />
                    <span className="text-xs font-medium text-teal-200">Show Batch / Lot #</span>
                  </label>
                </div>

                {/* Custom Brand Header Text */}
                {showCompany && (
                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                      Header Branding Text
                    </label>
                    <input
                      type="text"
                      value={storeHeader}
                      onChange={(e) => setStoreHeader(e.target.value)}
                      placeholder="BABY BLOOM"
                      className="w-full px-3 py-1.5 text-xs bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-teal-400"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Live WYSIWYG Canvas Preview (5 cols) */}
            <div className="lg:col-span-5 space-y-5">
              <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4 sticky top-6">
                <div className="flex items-center justify-between border-b border-teal-900/60 pb-3">
                  <div>
                    <h3 className="font-bold text-white text-base">Real-Time Canvas Preview</h3>
                    <p className="text-xs text-teal-300/60">
                      Standard Dimension: {currentTemplate.paper_width_mm}mm × {currentTemplate.paper_height_mm}mm
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-950 border border-teal-700 text-teal-300">
                    WYSIWYG
                  </span>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center justify-between text-xs text-teal-300/70 px-1">
                  <span>Preview Zoom:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewScale((s) => Math.max(0.7, Number((s - 0.1).toFixed(1))))}
                      className="px-2.5 py-0.5 bg-teal-950 border border-teal-800 rounded text-teal-300 hover:text-white"
                    >
                      -
                    </button>
                    <span className="font-mono w-12 text-center">{Math.round(previewScale * 100)}%</span>
                    <button
                      onClick={() => setPreviewScale((s) => Math.min(1.5, Number((s + 0.1).toFixed(1))))}
                      className="px-2.5 py-0.5 bg-teal-950 border border-teal-800 rounded text-teal-300 hover:text-white"
                    >
                      +
                    </button>
                    <button
                      onClick={() => setPreviewScale(1.0)}
                      className="text-[11px] text-teal-400 hover:text-white underline ml-1"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* THE PHYSICAL LABEL CANVAS CONTAINER */}
                <div className="p-6 bg-slate-950/80 rounded-2xl border border-teal-900/80 flex items-center justify-center overflow-hidden min-h-[220px]">
                  <div
                    style={{
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'center center',
                      transition: 'transform 0.15s ease-out',
                    }}
                  >
                    {/* The Label Element: Proportional, Crisp, Zero Clipping */}
                    <div
                      className="bg-white text-slate-900 shadow-2xl rounded-md p-3.5 flex flex-col justify-between select-none border border-slate-300"
                      style={{
                        ...previewCardStyle,
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* Top Header */}
                      {showCompany && (
                        <div className="text-center font-extrabold text-[11px] tracking-widest uppercase text-slate-800 border-b border-slate-200 pb-1 mb-1">
                          {storeHeader}
                        </div>
                      )}

                      {/* Product Title */}
                      <div className="text-center font-bold text-xs leading-snug text-slate-950 line-clamp-1 px-1 my-1">
                        {activeTitle}
                      </div>

                      {/* Barcode SVG */}
                      {showBarcode && (
                        <div
                          className="w-full flex justify-center my-1.5"
                          dangerouslySetInnerHTML={{ __html: singleSvgMarkup }}
                        />
                      )}

                      {/* Bottom Info Row */}
                      <div className="mt-auto pt-1.5 border-t border-slate-300 flex items-center justify-between text-xs">
                        <div className="truncate max-w-[65%]">
                          {showMfgExp && (mfgDate || expDate) ? (
                            <div className="text-[9px] text-slate-700 leading-tight">
                              {mfgDate && <div>MFD: {mfgDate}</div>}
                              {expDate && <div>EXP: {expDate}</div>}
                            </div>
                          ) : showBatch && batchNo ? (
                            <div className="text-[10px] text-slate-700 font-mono">
                              LOT: {batchNo}
                            </div>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-600 font-semibold tracking-wider">
                              AUTHENTIC
                            </span>
                          )}
                        </div>

                        {showPrice && (
                          <div className="text-right font-black text-sm text-slate-950 font-mono whitespace-nowrap">
                            <span className="text-[10px] font-semibold mr-0.5">Rs.</span>
                            {activePrice.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Print & Queue Buttons */}
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={handlePrintSingle}
                    className="w-full py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-xl text-sm font-bold shadow-xl shadow-teal-950/60 flex items-center justify-center gap-2 transition"
                  >
                    <Printer className="w-4 h-4" />
                    Print {singleCopies} {singleCopies === 1 ? 'Label' : 'Labels'} Now
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddToBatch()}
                    className="w-full py-2.5 bg-teal-900/60 hover:bg-teal-800/80 border border-teal-700/60 text-teal-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <PlusCircle className="w-4 h-4 text-teal-400" />
                    Add {singleCopies} {singleCopies === 1 ? 'Copy' : 'Copies'} to Batch Queue
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 2: BATCH LABEL PRINTING QUEUE
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'batch' && (
          <div className="space-y-6">
            {/* Quick Catalog Adder Bar */}
            <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between border-b border-teal-900/60 pb-3">
                <div className="flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-teal-400" />
                  <h3 className="font-bold text-white text-base">Stage Products into Batch Queue</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-teal-300/80">Default Copies per SKU:</span>
                  <input
                    type="number"
                    min={1}
                    value={batchInitialCopies}
                    onChange={(e) => setBatchInitialCopies(Math.max(1, Number(e.target.value)))}
                    className="w-16 px-2 py-1 text-xs bg-teal-950 border border-teal-700 rounded-lg text-white font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-8">
                  <select
                    value={batchSearchSelected}
                    onChange={(e) => setBatchSearchSelected(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white focus:outline-none focus:border-teal-400 transition"
                  >
                    <option value="">-- Choose Product from Catalog to Add to Batch --</option>
                    {allCatalogVariants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.sku} · {v.product_name} ({v.variant_name}) — Rs. {v.retail_price.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (batchSearchSelected) {
                        handleAddCatalogVariantToBatch(batchSearchSelected, batchInitialCopies)
                      }
                    }}
                    disabled={!batchSearchSelected}
                    className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-teal-950/50 flex items-center justify-center gap-1.5 disabled:opacity-40 transition"
                  >
                    <Plus className="w-4 h-4" />
                    Add Product to Batch
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedProduct) {
                        handleAddToBatch(selectedProduct, batchInitialCopies)
                      } else {
                        handleAddToBatch(null, batchInitialCopies)
                      }
                    }}
                    className="px-3 py-2.5 bg-teal-900/60 hover:bg-teal-800/80 border border-teal-700/60 text-teal-200 rounded-xl text-xs font-semibold whitespace-nowrap transition"
                    title="Add current Single Studio product"
                  >
                    Add Studio Item
                  </button>
                </div>
              </div>
            </div>

            {/* Batch Table & Sheet Calculation */}
            <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden">
              <div className="p-4 border-b border-teal-900/60 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-teal-400" />
                  <h3 className="font-bold text-white text-base">
                    Queued Labels ({batchQueue.length} Products · {totalBatchLabelsCount} Total Stickers)
                  </h3>
                </div>

                <div className="flex items-center gap-3">
                  {batchQueue.length > 0 && (
                    <button
                      onClick={() => setBatchQueue([])}
                      className="text-xs text-rose-300 hover:text-rose-100 flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear Queue
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handlePrintBatch}
                    disabled={batchQueue.length === 0}
                    className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-xl shadow-teal-950/60 flex items-center gap-2 disabled:opacity-40 transition"
                  >
                    <Printer className="w-4 h-4" />
                    Print Entire Batch ({totalBatchLabelsCount} Labels)
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-teal-950/80 text-teal-300/80 uppercase text-xs tracking-wider border-b border-teal-800/50">
                    <tr>
                      <th className="px-4 py-3">Product Name &amp; SKU</th>
                      <th className="px-4 py-3">Barcode String</th>
                      <th className="px-4 py-3 text-right">Retail Price</th>
                      <th className="px-4 py-3 text-center">Copies to Print</th>
                      <th className="px-4 py-3 text-center">Preview Barcode</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-900/40 text-slate-200">
                    {batchQueue.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-teal-400/60">
                          <Layers className="w-10 h-10 mx-auto mb-2 text-teal-700/60" />
                          Batch queue is empty. Choose products above or click &quot;Add to Batch Queue&quot; from the Single Studio tab.
                        </td>
                      </tr>
                    ) : (
                      batchQueue.map((item) => {
                        const svg = generateBarcodeSvg(item.barcode, {
                          height: 32,
                          fontSize: 9,
                          showText: false,
                          margin: 1,
                        })

                        return (
                          <tr key={item.id} className="hover:bg-teal-900/20 transition">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-white">{item.product_name}</div>
                              <div className="text-xs text-cyan-300 font-mono">{item.sku}</div>
                            </td>

                            <td className="px-4 py-3 font-mono text-xs text-teal-200">
                              {item.barcode}
                            </td>

                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-300 text-xs">
                              {formatLkr(item.retail_price)}
                            </td>

                            <td className="px-4 py-3 text-center">
                              <div className="inline-flex items-center gap-1.5 bg-teal-950/80 px-2 py-1 rounded-xl border border-teal-800/60">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateBatchCopies(item.id, item.copies - 1)}
                                  className="w-5 h-5 flex items-center justify-center text-teal-400 hover:text-white font-bold"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  value={item.copies}
                                  onChange={(e) =>
                                    handleUpdateBatchCopies(item.id, Math.max(1, Number(e.target.value)))
                                  }
                                  className="w-12 text-center bg-transparent text-white font-bold text-xs focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateBatchCopies(item.id, item.copies + 1)}
                                  className="w-5 h-5 flex items-center justify-center text-teal-400 hover:text-white font-bold"
                                >
                                  +
                                </button>
                              </div>
                            </td>

                            <td className="px-4 py-3 text-center">
                              <div
                                className="max-w-[120px] mx-auto opacity-80"
                                dangerouslySetInnerHTML={{ __html: svg }}
                              />
                            </td>

                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleRemoveBatchItem(item.id)}
                                className="p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-900/60 transition"
                                title="Remove from batch"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Batch Info & Sheet Calculation */}
              {batchQueue.length > 0 && (
                <div className="p-4 bg-teal-950/90 border-t border-teal-800/60 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-teal-400/60">Selected Spec:</span>{' '}
                      <strong className="text-white">
                        {currentTemplate.paper_width_mm}mm × {currentTemplate.paper_height_mm}mm
                      </strong>
                    </div>

                    <div>
                      <span className="text-teal-400/60">Total Stickers to Print:</span>{' '}
                      <strong className="text-emerald-300 font-bold text-sm">
                        {totalBatchLabelsCount} Labels
                      </strong>
                    </div>

                    {calculatedSheets && (
                      <div>
                        <span className="text-teal-400/60">Sheet Estimation:</span>{' '}
                        <strong className="text-cyan-300 font-bold text-sm">
                          {calculatedSheets.sheets} A4 Pages ({calculatedSheets.labelsPerSheet} labels/sheet)
                        </strong>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handlePrintBatch}
                    className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-xl shadow-teal-950/60 flex items-center gap-2 transition"
                  >
                    <Printer className="w-4 h-4" />
                    Print All {totalBatchLabelsCount} Labels
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 3: LABEL TEMPLATE DESIGNER & STANDARDS
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'templates' && (
          <div className="space-y-6">
            {/* Presets Grid */}
            <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between border-b border-teal-900/60 pb-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-5 h-5 text-teal-400" />
                  <h3 className="font-bold text-white text-base">Standard Label Presets</h3>
                </div>
                <span className="text-xs text-teal-300/60">Choose thermal roll or sheet template</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PRESET_TEMPLATES.map((preset, idx) => {
                  const isSelected = !isCustomTemplate && selectedPresetIndex === idx
                  return (
                    <button
                      key={preset.template_name}
                      type="button"
                      onClick={() => {
                        setSelectedPresetIndex(idx)
                        setIsCustomTemplate(false)
                        showToast(`Activated template: ${preset.template_name}`, 'info')
                      }}
                      className={`text-left p-4 rounded-xl border transition ${
                        isSelected
                          ? 'bg-teal-500/20 border-teal-400 text-white shadow-lg shadow-teal-950/60 font-semibold'
                          : 'bg-teal-950/40 border-teal-800/40 text-teal-200/80 hover:bg-teal-900/40 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-teal-300">
                          {preset.columns > 1 ? `Multi-Column (${preset.columns}-Up)` : 'Direct Thermal Roll'}
                        </span>
                        {isSelected && <Check className="w-4 h-4 text-teal-300" />}
                      </div>

                      <div className="text-sm font-bold text-white mt-1">
                        {preset.template_name}
                      </div>

                      <div className="text-xs text-teal-300/60 mt-2 font-mono">
                        Dimensions: {preset.paper_width_mm}mm × {preset.paper_height_mm}mm
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Custom Dimension Designer */}
            <div className="bg-[#0b2926]/70 border border-teal-800/40 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between border-b border-teal-900/60 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-teal-400" />
                  <h3 className="font-bold text-white text-base">Custom Dimension Designer</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setIsCustomTemplate(true)
                      showToast('Switched to Custom Label Dimension Builder', 'info')
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      isCustomTemplate
                        ? 'bg-teal-500 text-slate-950'
                        : 'bg-teal-950 border border-teal-800 text-teal-300'
                    }`}
                  >
                    {isCustomTemplate ? 'Custom Active' : 'Enable Custom'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Label Width (mm)
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={210}
                    value={customWidthMm}
                    onChange={(e) => {
                      setCustomWidthMm(Number(e.target.value))
                      setIsCustomTemplate(true)
                    }}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Label Height (mm)
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={297}
                    value={customHeightMm}
                    onChange={(e) => {
                      setCustomHeightMm(Number(e.target.value))
                      setIsCustomTemplate(true)
                    }}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-teal-300/80 mb-1">
                    Columns per Page (1 for Roll, 2-5 for Sheet)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={customColumns}
                    onChange={(e) => {
                      setCustomColumns(Number(e.target.value))
                      setIsCustomTemplate(true)
                    }}
                    className="w-full px-3 py-2 text-sm bg-teal-950/70 border border-teal-800/70 rounded-xl text-white font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          PRINT-ONLY RENDER CONTAINER (Triggered on window.print())
         ══════════════════════════════════════════════════════════════════════════ */}
      <div
        className="barcode-print-sheet"
        style={{
          display: 'none',
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body {
              background: #fff !important;
              color: #000 !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .no-print, header, aside, nav, .app-header, .sidebar, .app-footer, .page-stack > header {
              display: none !important;
            }
            .barcode-print-sheet {
              display: flex !important;
              flex-wrap: wrap !important;
              gap: 1.5mm !important;
              margin: 0 !important;
              padding: 0 !important;
              justify-content: flex-start !important;
              align-items: flex-start !important;
            }
            .print-single-label {
              box-sizing: border-box !important;
              border: 0.5px dashed #ccc !important;
              padding: 1.5mm 2mm !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              overflow: hidden !important;
              font-family: Arial, Helvetica, sans-serif !important;
              background: #fff !important;
              color: #000 !important;
            }
            .p-store {
              font-size: 7pt !important;
              font-weight: 900 !important;
              text-align: center !important;
              text-transform: uppercase !important;
              line-height: 1 !important;
              margin-bottom: 0.5mm !important;
            }
            .p-title {
              font-size: 7.5pt !important;
              font-weight: bold !important;
              text-align: center !important;
              line-height: 1.1 !important;
              max-height: 4.5mm !important;
              overflow: hidden !important;
            }
            .p-barcode {
              width: 100% !important;
              text-align: center !important;
              margin: 0.5mm 0 !important;
            }
            .p-barcode svg {
              width: 100% !important;
              height: auto !important;
              max-height: 12mm !important;
            }
            .p-footer {
              display: flex !important;
              justify-content: space-between !important;
              align-items: center !important;
              border-top: 0.5px solid #000 !important;
              padding-top: 0.5mm !important;
              line-height: 1 !important;
            }
            .p-dates {
              font-size: 5.5pt !important;
              font-weight: bold !important;
            }
            .p-sku {
              font-size: 6pt !important;
              font-weight: bold !important;
              font-family: 'Courier New', monospace !important;
            }
            .p-price {
              font-size: 9pt !important;
              font-weight: 900 !important;
            }
          }
        ` }} />

        {/* PRINT MODE 1: SINGLE ITEM COPIES */}
        {printMode === 'single' &&
          Array.from({ length: singleCopies }).map((_, i) => (
            <div
              key={`single-print-${i}`}
              className="print-single-label"
              style={{
                width: `${currentTemplate.paper_width_mm}mm`,
                height: `${currentTemplate.paper_height_mm}mm`,
              }}
            >
              {showCompany && <div className="p-store">{storeHeader}</div>}
              <div className="p-title">{activeTitle}</div>
              {showBarcode && (
                <div
                  className="p-barcode"
                  dangerouslySetInnerHTML={{ __html: singleSvgMarkup }}
                />
              )}
              <div className="p-footer">
                {showMfgExp && (mfgDate || expDate) ? (
                  <div className="p-dates">
                    {mfgDate && <div>M:{mfgDate}</div>}
                    {expDate && <div>E:{expDate}</div>}
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

        {/* PRINT MODE 2: BATCH QUEUE ITEMS */}
        {printMode === 'batch' &&
          batchQueue.flatMap((item) => {
            const svg = generateBarcodeSvg(item.barcode, {
              height: barcodeHeight,
              fontSize: 10,
              showText: showHumanReadable,
              margin: 2,
            })

            return Array.from({ length: item.copies }).map((_, i) => (
              <div
                key={`batch-print-${item.id}-${i}`}
                className="print-single-label"
                style={{
                  width: `${currentTemplate.paper_width_mm}mm`,
                  height: `${currentTemplate.paper_height_mm}mm`,
                }}
              >
                {showCompany && <div className="p-store">{storeHeader}</div>}
                <div className="p-title">{item.product_name}</div>
                {showBarcode && (
                  <div
                    className="p-barcode"
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                )}
                <div className="p-footer">
                  {showMfgExp && (item.mfg_date || item.exp_date) ? (
                    <div className="p-dates">
                      {item.mfg_date && <div>M:{item.mfg_date}</div>}
                      {item.exp_date && <div>E:{item.exp_date}</div>}
                    </div>
                  ) : (
                    <span className="p-sku">{item.sku || item.barcode}</span>
                  )}
                  {showPrice && (
                    <div className="p-price">Rs.{item.retail_price.toFixed(2)}</div>
                  )}
                </div>
              </div>
            ))
          })}
      </div>
    </div>
  )
}
export default BarcodeGeneratorPage
