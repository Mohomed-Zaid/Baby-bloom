import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save,
  RotateCcw,
  CheckCircle2,
  Building2,
  Receipt,
  Barcode,
  Printer,
  ShieldCheck,
  X,
} from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import {
  getSystemSettings,
  saveSystemSettings,
  resetSystemSettings,
  type SystemSettings,
} from '../services/extrasService'

export const SystemSettingsPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'company' | 'pos' | 'inventory' | 'hardware' | 'security'>('company')
  const [formData, setFormData] = useState<SystemSettings | null>(null)
  const [saveNotice, setSaveNotice] = useState('')

  // Query
  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => getSystemSettings(),
  })

  // Sync form state when query resolves
  useEffect(() => {
    if (settings) {
      setFormData(settings)
    }
  }, [settings])

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: (newSettings: Partial<SystemSettings>) => saveSystemSettings(newSettings),
    onSuccess: (updated) => {
      setFormData(updated)
      void queryClient.invalidateQueries({ queryKey: ['system-settings'] })
      setSaveNotice('System settings successfully saved.')
      setTimeout(() => setSaveNotice(''), 4000)
    },
  })

  // Reset Mutation
  const resetMutation = useMutation({
    mutationFn: () => resetSystemSettings(),
    onSuccess: (defaults) => {
      setFormData(defaults)
      void queryClient.invalidateQueries({ queryKey: ['system-settings'] })
      setSaveNotice('Settings restored to system factory defaults.')
      setTimeout(() => setSaveNotice(''), 4000)
    },
  })

  if (isLoading || !formData) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-slate-400">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm">Loading system preferences and configuration...</p>
      </div>
    )
  }

  const handleChange = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setFormData((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData) {
      saveMutation.mutate(formData)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="System Settings & Store Preferences"
        description="Global company configuration, POS cashier behavior, barcode parameters, and peripheral hardware setup."
        breadcrumbs={[{ label: 'Extras' }, { label: 'System Settings' }]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="button secondary text-xs flex items-center gap-1.5"
              onClick={() => {
                if (window.confirm('Reset all settings to default values?')) {
                  resetMutation.mutate()
                }
              }}
            >
              <RotateCcw size={14} /> Restore Defaults
            </button>
            <button
              type="button"
              className="button primary text-xs flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
              disabled={saveMutation.isPending}
              onClick={handleSave}
            >
              <Save size={14} /> {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        }
      />

      {saveNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={16} className="text-emerald-600" />
            {saveNotice}
          </span>
          <button type="button" onClick={() => setSaveNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Settings Navigation & Content Panel */}
      <section className="content-panel p-0 overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 p-3.5 border-b border-[#164e48] bg-[#041917] overflow-x-auto">
          <button
            type="button"
            className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'company'
                ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-sm shadow-emerald-950/50 border border-teal-500/40'
                : 'bg-[#061e1c] text-[#8fa89e] border border-[#164e48] hover:bg-[#0c312e] hover:text-teal-200'
            }`}
            onClick={() => setActiveTab('company')}
          >
            <Building2 size={15} /> Company & Store Profile
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'pos'
                ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-sm shadow-emerald-950/50 border border-teal-500/40'
                : 'bg-[#061e1c] text-[#8fa89e] border border-[#164e48] hover:bg-[#0c312e] hover:text-teal-200'
            }`}
            onClick={() => setActiveTab('pos')}
          >
            <Receipt size={15} /> POS & Checkout Rules
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'inventory'
                ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-sm shadow-emerald-950/50 border border-teal-500/40'
                : 'bg-[#061e1c] text-[#8fa89e] border border-[#164e48] hover:bg-[#0c312e] hover:text-teal-200'
            }`}
            onClick={() => setActiveTab('inventory')}
          >
            <Barcode size={15} /> Inventory & Barcodes
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'hardware'
                ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-sm shadow-emerald-950/50 border border-teal-500/40'
                : 'bg-[#061e1c] text-[#8fa89e] border border-[#164e48] hover:bg-[#0c312e] hover:text-teal-200'
            }`}
            onClick={() => setActiveTab('hardware')}
          >
            <Printer size={15} /> Printers & Receipts
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-sm shadow-emerald-950/50 border border-teal-500/40'
                : 'bg-[#061e1c] text-[#8fa89e] border border-[#164e48] hover:bg-[#0c312e] hover:text-teal-200'
            }`}
            onClick={() => setActiveTab('security')}
          >
            <ShieldCheck size={15} /> Security & Auditing
          </button>
        </div>

        {/* Tab 1: Company Profile */}
        {activeTab === 'company' && (
          <form onSubmit={handleSave} className="p-6 space-y-5 text-xs max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Company Registered Name</label>
                <input
                  type="text"
                  className="text-input w-full text-xs"
                  value={formData.company_name}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Store Slogan / Tagline</label>
                <input
                  type="text"
                  className="text-input w-full text-xs"
                  value={formData.store_tagline}
                  onChange={(e) => handleChange('store_tagline', e.target.value)}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Business Registration (BRN)</label>
                <input
                  type="text"
                  className="text-input w-full text-xs"
                  value={formData.registration_number}
                  onChange={(e) => handleChange('registration_number', e.target.value)}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">VAT / SVAT TIN Number</label>
                <input
                  type="text"
                  className="text-input w-full text-xs"
                  value={formData.vat_tin_number}
                  onChange={(e) => handleChange('vat_tin_number', e.target.value)}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Currency Symbol & Code</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    className="text-input text-xs"
                    value={formData.currency_symbol}
                    onChange={(e) => handleChange('currency_symbol', e.target.value)}
                  />
                  <input
                    type="text"
                    className="text-input text-xs"
                    value={formData.currency_code}
                    onChange={(e) => handleChange('currency_code', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Timezone</label>
                <select
                  className="compact-select w-full text-xs"
                  value={formData.timezone}
                  onChange={(e) => handleChange('timezone', e.target.value)}
                >
                  <option value="Asia/Colombo">Asia/Colombo (Sri Lanka Standard Time UTC+05:30)</option>
                  <option value="UTC">UTC (Universal Coordinated Time)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Customer Care Phone</label>
                <input
                  type="text"
                  className="text-input w-full text-xs"
                  value={formData.contact_phone}
                  onChange={(e) => handleChange('contact_phone', e.target.value)}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Inquiry Email</label>
                <input
                  type="email"
                  className="text-input w-full text-xs"
                  value={formData.contact_email}
                  onChange={(e) => handleChange('contact_email', e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <label className="font-semibold text-slate-700 block mb-1">Store Physical Address</label>
                <input
                  type="text"
                  className="text-input w-full text-xs"
                  value={formData.address_line1}
                  onChange={(e) => handleChange('address_line1', e.target.value)}
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button type="submit" className="button primary text-xs bg-emerald-700 hover:bg-emerald-800 text-white">
                Save Company Profile
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: POS Rules */}
        {activeTab === 'pos' && (
          <form onSubmit={handleSave} className="p-6 space-y-5 text-xs max-w-4xl">
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <strong className="text-slate-900 block font-semibold">Bill Rounding Rule</strong>
                  <span className="text-slate-500">Apply cash denomination rounding on total invoice amounts.</span>
                </div>
                <select
                  className="compact-select text-xs w-48"
                  value={formData.pos_bill_rounding}
                  onChange={(e) => handleChange('pos_bill_rounding', e.target.value as any)}
                >
                  <option value="nearest_1.00">Round to Nearest Rs. 1.00</option>
                  <option value="nearest_0.50">Round to Nearest Rs. 0.50</option>
                  <option value="none">No Rounding (Exact Cents)</option>
                </select>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <strong className="text-slate-900 block font-semibold">Negative Stock Selling</strong>
                  <span className="text-slate-500">Allow billing when item system inventory reaches 0.</span>
                </div>
                <input
                  type="checkbox"
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  checked={formData.enable_negative_stock_sale}
                  onChange={(e) => handleChange('enable_negative_stock_sale', e.target.checked)}
                />
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <strong className="text-slate-900 block font-semibold">Prompt for Customer Phone</strong>
                  <span className="text-slate-500">Require cashier to enter mobile number for loyalty tracking.</span>
                </div>
                <input
                  type="checkbox"
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  checked={formData.require_customer_phone_pos}
                  onChange={(e) => handleChange('require_customer_phone_pos', e.target.checked)}
                />
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <strong className="text-slate-900 block font-semibold">Dual Copy for Card Payments</strong>
                  <span className="text-slate-500">Print merchant copy and customer copy on card settlement.</span>
                </div>
                <input
                  type="checkbox"
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  checked={formData.print_dual_copy_for_card}
                  onChange={(e) => handleChange('print_dual_copy_for_card', e.target.checked)}
                />
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <strong className="text-slate-900 block font-semibold">Cash Drawer Kick on Cash Settle</strong>
                  <span className="text-slate-500">Trigger electronic pulse to open till drawer on settlement.</span>
                </div>
                <input
                  type="checkbox"
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  checked={formData.cash_drawer_auto_kick}
                  onChange={(e) => handleChange('cash_drawer_auto_kick', e.target.checked)}
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button type="submit" className="button primary text-xs bg-emerald-700 hover:bg-emerald-800 text-white">
                Save POS Settings
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Inventory & Barcodes */}
        {activeTab === 'inventory' && (
          <form onSubmit={handleSave} className="p-6 space-y-5 text-xs max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Barcode Standard Format</label>
                <select
                  className="compact-select w-full text-xs"
                  value={formData.default_barcode_standard}
                  onChange={(e) => handleChange('default_barcode_standard', e.target.value as any)}
                >
                  <option value="CODE128">Code 128 (High Density Alphanumeric)</option>
                  <option value="EAN13">EAN-13 (Standard Retail 13-Digit)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Internal Barcode Prefix</label>
                <input
                  type="text"
                  className="text-input w-full text-xs"
                  value={formData.barcode_prefix}
                  onChange={(e) => handleChange('barcode_prefix', e.target.value)}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Default Low Stock Alert Threshold</label>
                <input
                  type="number"
                  className="text-input w-full text-xs"
                  value={formData.default_reorder_level_alert}
                  onChange={(e) => handleChange('default_reorder_level_alert', Number(e.target.value))}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg mt-5">
                <div>
                  <strong className="text-slate-900 block font-semibold">Enforce Batch & Expiry at Checkout</strong>
                  <span className="text-slate-500">Prevent cashier from billing expired baby formulas or medicines.</span>
                </div>
                <input
                  type="checkbox"
                  className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  checked={formData.enforce_batch_expiry_pos}
                  onChange={(e) => handleChange('enforce_batch_expiry_pos', e.target.checked)}
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button type="submit" className="button primary text-xs bg-emerald-700 hover:bg-emerald-800 text-white">
                Save Inventory Settings
              </button>
            </div>
          </form>
        )}

        {/* Tab 4: Hardware & Printers */}
        {activeTab === 'hardware' && (
          <form onSubmit={handleSave} className="p-6 space-y-5 text-xs max-w-4xl">
            <div className="space-y-4">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Thermal Receipt Printer Type</label>
                <select
                  className="compact-select w-full text-xs"
                  value={formData.receipt_printer_type}
                  onChange={(e) => handleChange('receipt_printer_type', e.target.value as any)}
                >
                  <option value="thermal_80mm">80mm Wide Thermal Roll (Epson / Citizen / Bixolon Standard)</option>
                  <option value="thermal_58mm">58mm Compact Thermal Roll</option>
                  <option value="laser_a4">Standard A4 / Letter Laser Printer</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Receipt Header Greeting Note</label>
                <textarea
                  className="text-input w-full text-xs h-20"
                  value={formData.receipt_header_text}
                  onChange={(e) => handleChange('receipt_header_text', e.target.value)}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Receipt Footer Exchange Policy</label>
                <textarea
                  className="text-input w-full text-xs h-24"
                  value={formData.receipt_footer_text}
                  onChange={(e) => handleChange('receipt_footer_text', e.target.value)}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Customer Pole Display Welcome Greeting</label>
                <input
                  type="text"
                  className="text-input w-full text-xs"
                  value={formData.customer_display_welcome}
                  onChange={(e) => handleChange('customer_display_welcome', e.target.value)}
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button type="submit" className="button primary text-xs bg-emerald-700 hover:bg-emerald-800 text-white">
                Save Hardware Preferences
              </button>
            </div>
          </form>
        )}

        {/* Tab 5: Security & Auditing */}
        {activeTab === 'security' && (
          <form onSubmit={handleSave} className="p-6 space-y-5 text-xs max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Cashier Idle Timeout (Minutes)</label>
                <input
                  type="number"
                  className="text-input w-full text-xs"
                  value={formData.session_idle_timeout_mins}
                  onChange={(e) => handleChange('session_idle_timeout_mins', Number(e.target.value))}
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">Locks screen automatically on inactivity</span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Maximum Failed PIN / Login Attempts</label>
                <input
                  type="number"
                  className="text-input w-full text-xs"
                  value={formData.max_failed_login_attempts}
                  onChange={(e) => handleChange('max_failed_login_attempts', Number(e.target.value))}
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">Temporarily locks terminal account</span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Audit Log Retention Period (Days)</label>
                <input
                  type="number"
                  className="text-input w-full text-xs"
                  value={formData.audit_trail_retention_days}
                  onChange={(e) => handleChange('audit_trail_retention_days', Number(e.target.value))}
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">Automated log lifecycle purge</span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Staff Password Expiry (Days)</label>
                <input
                  type="number"
                  className="text-input w-full text-xs"
                  value={formData.enforce_password_expiry_days}
                  onChange={(e) => handleChange('enforce_password_expiry_days', Number(e.target.value))}
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">Prompt users to rotate credentials</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button type="submit" className="button primary text-xs bg-emerald-700 hover:bg-emerald-800 text-white">
                Save Security Configuration
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
