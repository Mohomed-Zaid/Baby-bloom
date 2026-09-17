import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Keyboard,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Command,
  Zap,
  Tag,
} from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import {
  fetchPosShortcuts,
  savePosShortcut,
  deletePosShortcut,
  type PosShortcutKey,
  lookupPriceCheck,
  type PriceCheckResult,
} from '../services/extrasService'
import { listLookup } from '../services/masterData'
import { useBranchStore } from '../stores/branchStore'

const SYSTEM_COMMANDS = [
  { id: 'CMD_NEW_BILL', label: 'New POS Bill / Clear Cart', defaultKey: 'F2' },
  { id: 'CMD_FOCUS_SEARCH', label: 'Focus Product Search / Scanner', defaultKey: 'F3' },
  { id: 'CMD_HOLD_BILL', label: 'Hold Current Bill', defaultKey: 'F4' },
  { id: 'CMD_RECALL_HELD', label: 'Recall Held Bills', defaultKey: 'F5' },
  { id: 'CMD_CASH_TENDER', label: 'Quick Cash Payment & Settle', defaultKey: 'F6' },
  { id: 'CMD_CARD_TENDER', label: 'Quick Card Payment & Settle', defaultKey: 'F7' },
  { id: 'CMD_PRINT_LAST', label: 'Reprint Last Receipt', defaultKey: 'F8' },
  { id: 'CMD_DISCOUNT_MODAL', label: 'Apply Bill Discount', defaultKey: 'F9' },
  { id: 'CMD_CANCEL_BILL', label: 'Cancel Current Transaction', defaultKey: 'F10' },
]

export const ShortcutKeysPage: React.FC = () => {
  const queryClient = useQueryClient()
  const branchId = useBranchStore((state) => state.branchId)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingShortcut, setEditingShortcut] = useState<PosShortcutKey | null>(null)

  // Modal Form State
  const [keyCombo, setKeyCombo] = useState('F2')
  const [targetType, setTargetType] = useState<'product' | 'command'>('command')
  const [commandId, setCommandId] = useState(SYSTEM_COMMANDS[0]?.id || 'CMD_NEW_BILL')
  const [description, setDescription] = useState('')
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [isCapturingKey, setIsCapturingKey] = useState(false)

  // Product search in modal
  const [productQuery, setProductQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<PriceCheckResult | null>(null)

  // Queries
  const { data: shortcuts = [], isLoading } = useQuery({
    queryKey: ['pos-shortcuts', branchId],
    queryFn: () => fetchPosShortcuts(branchId || undefined),
  })

  const { data: branchList = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: async () => (await listLookup('branches', 'name')) || [],
  })

  const { data: productSearchResults = [] } = useQuery({
    queryKey: ['shortcut-prod-search', productQuery],
    queryFn: () => lookupPriceCheck(productQuery),
    enabled: productQuery.trim().length > 1,
  })

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: (payload: PosShortcutKey) => savePosShortcut(payload),
    onSuccess: () => {
      setModalOpen(false)
      setEditingShortcut(null)
      void queryClient.invalidateQueries({ queryKey: ['pos-shortcuts'] })
    },
  })

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePosShortcut(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pos-shortcuts'] })
    },
  })

  // Key combination listener hook
  useEffect(() => {
    if (!isCapturingKey) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Ignore pure modifier presses
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        return
      }

      const parts: string[] = []
      if (e.ctrlKey) parts.push('CTRL')
      if (e.altKey) parts.push('ALT')
      if (e.shiftKey) parts.push('SHIFT')

      let keyName = e.key.toUpperCase()
      if (keyName === ' ') keyName = 'SPACE'
      parts.push(keyName)

      setKeyCombo(parts.join('+'))
      setIsCapturingKey(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isCapturingKey])

  const openNewModal = () => {
    const firstCmd = SYSTEM_COMMANDS[0] || { id: 'CMD_NEW_BILL', label: 'New POS Bill', defaultKey: 'F2' }
    setEditingShortcut(null)
    setKeyCombo('F2')
    setTargetType('command')
    setCommandId(firstCmd.id)
    setDescription(firstCmd.label)
    setSelectedBranch(branchId || '')
    setSelectedProduct(null)
    setProductQuery('')
    setIsCapturingKey(false)
    setModalOpen(true)
  }

  const openEditModal = (item: PosShortcutKey) => {
    setEditingShortcut(item)
    setKeyCombo(item.key_combination)
    setTargetType(item.target_type)
    setSelectedBranch(item.branch_id || '')
    setDescription(item.description || '')
    if (item.target_type === 'command') {
      setCommandId(item.function_or_product_id)
    } else {
      setCommandId('')
      setProductQuery('')
    }
    setIsCapturingKey(false)
    setModalOpen(true)
  }

  const handleSave = () => {
    const function_or_product_id =
      targetType === 'command'
        ? commandId
        : selectedProduct
        ? selectedProduct.variant_id
        : editingShortcut?.function_or_product_id || ''

    const desc =
      description.trim() ||
      (targetType === 'command'
        ? SYSTEM_COMMANDS.find((c) => c.id === commandId)?.label || ''
        : selectedProduct
        ? selectedProduct.product_name
        : '')

    saveMutation.mutate({
      id: editingShortcut?.id,
      branch_id: selectedBranch || null,
      function_or_product_id,
      key_combination: keyCombo,
      target_type: targetType,
      description: desc,
    })
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="POS Shortcut Keys Manager"
        description="Configure custom function keys and express product hotkeys for high-speed cashier checkout."
        breadcrumbs={[{ label: 'Extras' }, { label: 'Shortcut Keys' }]}
        actions={
          <button className="button primary" onClick={openNewModal}>
            <Plus size={15} /> Add Shortcut Key
          </button>
        }
      />

      <section className="content-panel shortcut-panel">
        <div className="panel-heading-bar">
          <div>
            <span className="eyebrow">Key Mappings</span>
            <h2 className="panel-title">Active POS Function & Express Keys</h2>
          </div>
          <span className="badge-count">{shortcuts.length} Configured</span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '180px' }}>Key Combination</th>
                <th>Type</th>
                <th>Target Action / Express Item</th>
                <th>Scope</th>
                <th className="align-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="panel-state">
                    Loading shortcut mappings...
                  </td>
                </tr>
              ) : shortcuts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="panel-state">
                    No custom shortcut keys configured yet. Click <b>Add Shortcut Key</b> or use default F2-F10 keys.
                  </td>
                </tr>
              ) : (
                shortcuts.map((sc) => {
                  const isCommand = sc.target_type === 'command'
                  return (
                    <tr key={sc.id || sc.key_combination}>
                      <td>
                        <kbd className="shortcut-key-badge">
                          <Keyboard size={13} className="key-icon" />
                          {sc.key_combination}
                        </kbd>
                      </td>
                      <td>
                        <span
                          className={`status-pill ${
                            isCommand ? 'status-command' : 'status-product'
                          }`}
                        >
                          {isCommand ? 'Command / Workflow' : 'Express Product'}
                        </span>
                      </td>
                      <td>
                        <strong>{sc.description || sc.function_or_product_id}</strong>
                      </td>
                      <td>
                        <span className="text-muted">
                          {sc.branch_id
                            ? branchList.find((b) => b.value === sc.branch_id)?.label ||
                              'Branch Specific'
                            : 'All Branches (Global)'}
                        </span>
                      </td>
                      <td className="align-right">
                        <div className="table-actions-inline">
                          <button
                            className="table-action"
                            onClick={() => openEditModal(sc)}
                            title="Edit shortcut"
                          >
                            <Edit2 size={14} />
                          </button>
                          {sc.id && (
                            <button
                              className="table-action text-danger"
                              onClick={() => deleteMutation.mutate(sc.id!)}
                              title="Delete shortcut"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODAL: SHORTCUT CONFIGURATION & KEY CAPTURE */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-box shortcut-modal-box">
            <div className="modal-header">
              <h3>{editingShortcut ? 'Edit POS Shortcut' : 'Create POS Shortcut Key'}</h3>
              <button className="modal-close" onClick={() => setModalOpen(false)}>
                &times;
              </button>
            </div>

            <div className="shortcut-modal-body">
              {/* KEY COMBINATION CAPTURE BOX */}
              <div className="key-capture-card">
                <div className="key-capture-display">
                  <span className="text-muted">Mapped Hotkey</span>
                  <div className="key-combo-current">
                    <kbd className="giant-key-badge">{keyCombo || 'None'}</kbd>
                  </div>
                </div>

                <button
                  type="button"
                  className={`button ${isCapturingKey ? 'danger' : 'secondary'}`}
                  onClick={() => setIsCapturingKey(!isCapturingKey)}
                >
                  <Command size={14} />
                  {isCapturingKey ? 'Press any key on keyboard...' : 'Capture Hotkey'}
                </button>
              </div>

              {isCapturingKey && (
                <div className="capturing-pulse-banner">
                  <Zap size={15} className="animate-bounce" />
                  <span>Listening... Press your desired key combination now (e.g. F3, Ctrl+1, Alt+S).</span>
                </div>
              )}

              {/* TARGET TYPE SELECTOR */}
              <div className="form-group mt-3">
                <label className="field-label">Action Category</label>
                <div className="radio-pill-group">
                  <label className={`radio-pill ${targetType === 'command' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="targetType"
                      checked={targetType === 'command'}
                      onChange={() => setTargetType('command')}
                    />
                    <span>System Command (e.g. New Bill, Settle)</span>
                  </label>
                  <label className={`radio-pill ${targetType === 'product' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="targetType"
                      checked={targetType === 'product'}
                      onChange={() => setTargetType('product')}
                    />
                    <span>Express Fast-Moving Product</span>
                  </label>
                </div>
              </div>

              {targetType === 'command' ? (
                <div className="form-group">
                  <label className="field-label">Select System Command</label>
                  <select
                    className="text-input"
                    value={commandId}
                    onChange={(e) => {
                      const cmd = SYSTEM_COMMANDS.find((c) => c.id === e.target.value)
                      setCommandId(e.target.value)
                      if (cmd) {
                        setDescription(cmd.label)
                        if (!editingShortcut) setKeyCombo(cmd.defaultKey)
                      }
                    }}
                  >
                    {SYSTEM_COMMANDS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} (Default: {c.defaultKey})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label className="field-label">Search Express Product</label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="Search product name or SKU..."
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                  />

                  {productQuery.trim().length > 1 && (
                    <div className="product-search-dropdown">
                      {productSearchResults.map((p) => (
                        <div
                          key={p.variant_id}
                          className="dropdown-item"
                          onClick={() => {
                            setSelectedProduct(p)
                            setDescription(`${p.product_name} (Rs. ${p.retail_price.toFixed(2)})`)
                            setProductQuery('')
                          }}
                        >
                          <strong>{p.product_name}</strong> &bull; SKU: {p.sku} &bull; Rs. {p.retail_price.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedProduct && (
                    <div className="selected-product-alert mt-2">
                      <Tag size={15} />
                      <span className="flex-1 font-semibold">{selectedProduct.product_name}</span>
                      <span className="text-emerald-700 font-bold">
                        Rs. {selectedProduct.retail_price.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="form-group">
                <label className="field-label">Label / Description</label>
                <input
                  type="text"
                  className="text-input"
                  value={description}
                  placeholder="e.g. Quick Cash Tender"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="field-label">Branch Scope</label>
                <select
                  className="text-input"
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                >
                  <option value="">All Branches (Company Global)</option>
                  {branchList.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="dialog-actions mt-4">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={saveMutation.isPending}
                  onClick={handleSave}
                >
                  <CheckCircle2 size={15} />
                  {saveMutation.isPending ? 'Saving...' : 'Save Shortcut'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
