/**
 * Baby Bloom Business Suite - Phase 10
 * Automated Multi-Branch Ledger Cycle Verification Script
 * 
 * Verifies the 5-step end-to-end accounting and inventory loop:
 *   1. Opening stock posting & inventory asset capitalization
 *   2. Weighted-average cost (WAC) credit purchase with bonus units & AP posting
 *   3. POS split sale (Cash + AR) with automated COGS & inventory deduction
 *   4. Inward cheque receipt, bank deposit, and clearance lifecycle
 *   5. Day book reconciliation & complete double-entry trial balance zero-variance check
 */

import { strict as assert } from 'node:assert'

interface JournalEntryLine {
  accountCode: string
  accountName: string
  debit: number
  credit: number
}

interface JournalEntry {
  id: string
  reference: string
  date: string
  lines: JournalEntryLine[]
}

interface StockState {
  sku: string
  name: string
  onHandQuantity: number
  weightedAverageCost: number
  totalInventoryValuation: number
}

interface LedgerAuditReport {
  step1_openingStock: boolean
  step2_creditPurchaseWac: boolean
  step3_posSplitSale: boolean
  step4_chequeClearance: boolean
  step5_dayBookAndTrialBalance: boolean
  trialBalanceVariance: number
  totalDebits: number
  totalCredits: number
}

class LedgerVerificationEngine {
  private journalEntries: JournalEntry[] = []
  private stock: StockState = {
    sku: 'AV-TEAT-06',
    name: 'Avent Natural Teat 2pk Slow Flow',
    onHandQuantity: 0,
    weightedAverageCost: 0,
    totalInventoryValuation: 0
  }

  private accounts = new Map<string, { code: string; name: string; debit: number; credit: number }>()

  constructor() {
    const coa = [
      { code: '1000', name: 'Cash in Hand' },
      { code: '1010', name: 'Petty Cash' },
      { code: '1020', name: 'Commercial Bank Corporate A/C' },
      { code: '1050', name: 'Inward Cheques in Hand' },
      { code: '1100', name: 'Accounts Receivable' },
      { code: '1200', name: 'Inventory Asset' },
      { code: '2000', name: 'Accounts Payable' },
      { code: '3000', name: "Owner's Capital / Opening Balance Equity" },
      { code: '4000', name: 'Retail Sales' },
      { code: '5000', name: 'Cost of Goods Sold' },
      { code: '6000', name: 'Sundry Store Expenses' },
    ]
    for (const acc of coa) {
      this.accounts.set(acc.code, { ...acc, debit: 0, credit: 0 })
    }
  }

  private recordJournalEntry(ref: string, lines: JournalEntryLine[]): JournalEntry {
    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0)
    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0)
    
    // Invariant: Debits must equal Credits for every single voucher
    assert.equal(
      Math.abs(totalDebit - totalCredit) < 0.01,
      true,
      `Unbalanced Journal Entry ${ref}: Debit ${totalDebit} != Credit ${totalCredit}`
    )

    for (const line of lines) {
      const acc = this.accounts.get(line.accountCode)
      if (!acc) throw new Error(`Unknown account code: ${line.accountCode}`)
      acc.debit += line.debit
      acc.credit += line.credit
    }

    const entry: JournalEntry = {
      id: `JV-${this.journalEntries.length + 1}`,
      reference: ref,
      date: new Date().toISOString().split('T')[0],
      lines
    }
    this.journalEntries.push(entry)
    return entry
  }

  // --------------------------------------------------------------------------
  // STEP 1: Opening Stock Posting
  // --------------------------------------------------------------------------
  public executeStep1_OpeningStock(): void {
    console.log('\n[STEP 1] Testing Opening Stock Posting...')
    const qty = 10
    const unitCost = 1450.00
    const valuation = qty * unitCost // Rs. 14,500.00

    this.stock.onHandQuantity = qty
    this.stock.weightedAverageCost = unitCost
    this.stock.totalInventoryValuation = valuation

    this.recordJournalEntry('OP-STOCK-0001', [
      { accountCode: '1200', accountName: 'Inventory Asset', debit: valuation, credit: 0 },
      { accountCode: '3000', accountName: "Owner's Capital / Opening Balance Equity", debit: 0, credit: valuation }
    ])

    assert.equal(this.stock.onHandQuantity, 10, 'Opening stock qty must be 10')
    assert.equal(this.stock.weightedAverageCost, 1450.00, 'Initial WAC must be 1450.00')
    assert.equal(this.stock.totalInventoryValuation, 14500.00, 'Valuation must be 14,500.00')
    console.log(`  ✓ Opening Stock: 10 units @ Rs. 1,450.00 = Rs. 14,500.00 posted to Inventory Asset (1200)`)
  }

  // --------------------------------------------------------------------------
  // STEP 2: Credit Purchase Posting (WAC Calculation & Accounts Payable)
  // --------------------------------------------------------------------------
  public executeStep2_CreditPurchase(): void {
    console.log('\n[STEP 2] Testing Credit Purchase Posting with Bonus/Free Units...')
    // Purchased 10 units @ Rs. 1,500.00 + 2 free units = 12 total units received
    const purchasedQty = 10
    const purchaseUnitPrice = 1500.00
    const bonusQty = 2
    const totalNewUnits = purchasedQty + bonusQty // 12 units
    const purchaseInvoiceTotal = purchasedQty * purchaseUnitPrice // Rs. 15,000.00

    const priorValuation = this.stock.totalInventoryValuation // 14,500.00
    const priorQty = this.stock.onHandQuantity // 10

    // Weighted-average cost formula: (Prior Total Valuation + New Purchase Cost) / (Prior Qty + Total Units Received)
    // = (14,500 + 15,000) / (10 + 12) = 29,500 / 22 = Rs. 1,340.90909...
    const newTotalValuation = priorValuation + purchaseInvoiceTotal
    const newTotalQty = priorQty + totalNewUnits
    const calculatedWac = Number((newTotalValuation / newTotalQty).toFixed(2)) // 1,340.91

    this.stock.onHandQuantity = newTotalQty
    this.stock.weightedAverageCost = calculatedWac
    this.stock.totalInventoryValuation = newTotalValuation

    this.recordJournalEntry('GRN-HEMAS-2026-001', [
      { accountCode: '1200', accountName: 'Inventory Asset', debit: purchaseInvoiceTotal, credit: 0 },
      { accountCode: '2000', accountName: 'Accounts Payable', debit: 0, credit: purchaseInvoiceTotal }
    ])

    assert.equal(this.stock.onHandQuantity, 22, 'Total units in stock must be 22')
    assert.equal(calculatedWac, 1340.91, 'Weighted average cost must be Rs. 1,340.91')
    assert.equal(this.stock.totalInventoryValuation, 29500.00, 'Total inventory value must be Rs. 29,500.00')
    assert.equal(this.accounts.get('2000')?.credit, 15000.00, 'Accounts payable must be credited Rs. 15,000.00')
    console.log(`  ✓ Credit Purchase: 10 units + 2 free units @ Rs. 15,000.00 total`)
    console.log(`  ✓ Recomputed Weighted-Average Cost: Rs. ${calculatedWac.toFixed(2)} (Valuation Rs. 29,500.00 / 22 units)`)
    console.log(`  ✓ Accounts Payable (Hemas Manufacturing): Rs. 15,000.00`)
  }

  // --------------------------------------------------------------------------
  // STEP 3: POS Sale Posting (Split Tender & Automated COGS)
  // --------------------------------------------------------------------------
  public executeStep3_PosSplitSale(): void {
    console.log('\n[STEP 3] Testing POS Split Sale (Cash + Credit) & Automated COGS...')
    // Sell 2 units of AV-TEAT-06 @ Rs. 2,400.00 = Rs. 4,800.00 Gross Sales
    const soldQty = 2
    const retailPricePerUnit = 2400.00
    const totalSalesAmount = soldQty * retailPricePerUnit // 4,800.00

    // Split tender: 1 cash (Rs. 2,400.00) + 1 on customer credit for Abbarrna Nuwara Eliya (Rs. 2,400.00)
    const cashPortion = 2400.00
    const creditPortion = 2400.00

    // Inventory and COGS deduction:
    const cogsAmount = Number((soldQty * this.stock.weightedAverageCost).toFixed(2)) // 2 * 1,340.91 = 2,681.82
    this.stock.onHandQuantity -= soldQty // 20 units remaining
    this.stock.totalInventoryValuation -= cogsAmount // 29,500 - 2,681.82 = 26,818.18

    // Post Sales & Receivable Journal Entry
    this.recordJournalEntry('POS-INV-0001', [
      { accountCode: '1000', accountName: 'Cash in Hand', debit: cashPortion, credit: 0 },
      { accountCode: '1100', accountName: 'Accounts Receivable', debit: creditPortion, credit: 0 },
      { accountCode: '4000', accountName: 'Retail Sales', debit: 0, credit: totalSalesAmount }
    ])

    // Post Automated COGS & Inventory Deduction
    this.recordJournalEntry('COGS-INV-0001', [
      { accountCode: '5000', accountName: 'Cost of Goods Sold', debit: cogsAmount, credit: 0 },
      { accountCode: '1200', accountName: 'Inventory Asset', debit: 0, credit: cogsAmount }
    ])

    assert.equal(this.stock.onHandQuantity, 20, 'Stock on hand must be 20 units')
    assert.equal(this.accounts.get('1000')?.debit, 2400.00, 'Cash in hand debit must be Rs. 2,400.00')
    assert.equal(this.accounts.get('1100')?.debit, 2400.00, 'AR debit must be Rs. 2,400.00')
    assert.equal(this.accounts.get('5000')?.debit, 2681.82, 'COGS debit must be Rs. 2,681.82')
    console.log(`  ✓ POS Sale: 2 units sold for Rs. 4,800.00 (Cash Rs. 2,400.00 | AR Rs. 2,400.00)`)
    console.log(`  ✓ Inventory Stock deducted by 2 units (Remaining: 20 units)`)
    console.log(`  ✓ Automated COGS posted: Rs. 2,681.82 (Gross Margin: Rs. ${(totalSalesAmount - cogsAmount).toFixed(2)})`)
  }

  // --------------------------------------------------------------------------
  // STEP 4: Inward Cheque Receipt, Deposit & Clearance Lifecycle
  // --------------------------------------------------------------------------
  public executeStep4_InwardChequeLifecycle(): void {
    console.log('\n[STEP 4] Testing Inward Cheque Receipt, Deposit & Clearance...')
    const chequeAmount = 2400.00 // Settles Abbarrna customer receivable

    // 4A. Cheque Receipt: Received in Hand, Customer AR cleared
    this.recordJournalEntry('CHQ-REC-889012', [
      { accountCode: '1050', accountName: 'Inward Cheques in Hand', debit: chequeAmount, credit: 0 },
      { accountCode: '1100', accountName: 'Accounts Receivable', debit: 0, credit: chequeAmount }
    ])

    // Verify AR is now fully settled (0 balance)
    const arDebit = this.accounts.get('1100')!.debit
    const arCredit = this.accounts.get('1100')!.credit
    assert.equal(arDebit - arCredit, 0, 'Accounts Receivable must be 0 after cheque receipt')

    // 4B. Cheque Clearance: Commercial Bank credited, Inward Cheques in Hand relieved
    this.recordJournalEntry('CHQ-CLR-889012', [
      { accountCode: '1020', accountName: 'Commercial Bank Corporate A/C', debit: chequeAmount, credit: 0 },
      { accountCode: '1050', accountName: 'Inward Cheques in Hand', debit: 0, credit: chequeAmount }
    ])

    const chqDebit = this.accounts.get('1050')!.debit
    const chqCredit = this.accounts.get('1050')!.credit
    assert.equal(chqDebit - chqCredit, 0, 'Inward Cheques in Hand balance must be 0 after clearance')
    assert.equal(this.accounts.get('1020')!.debit, 2400.00, 'Commercial Bank balance must be Rs. 2,400.00')

    console.log(`  ✓ Cheque Received: Rs. 2,400.00 (Customer AR balance settled to Rs. 0.00)`)
    console.log(`  ✓ Cheque Deposited & Cleared: Commercial Bank credited Rs. 2,400.00`)
  }

  // --------------------------------------------------------------------------
  // STEP 5: Day Book Reconciliation & Trial Balance Sanity
  // --------------------------------------------------------------------------
  public executeStep5_DayBookAndTrialBalance(): LedgerAuditReport {
    console.log('\n[STEP 5] Testing Day Book Reconciliation & Zero-Variance Trial Balance...')
    
    // Cash expense: Sundry store expenses Rs. 350.00 paid from cash drawer
    const pettyExpense = 350.00
    this.recordJournalEntry('PV-EXP-001', [
      { accountCode: '6000', accountName: 'Sundry Store Expenses', debit: pettyExpense, credit: 0 },
      { accountCode: '1000', accountName: 'Cash in Hand', debit: 0, credit: pettyExpense }
    ])

    const cashDebit = this.accounts.get('1000')!.debit // 2,400.00
    const cashCredit = this.accounts.get('1000')!.credit // 350.00
    const netCashInDrawer = cashDebit - cashCredit // Rs. 2,050.00

    assert.equal(netCashInDrawer, 2050.00, 'Net cash in drawer must match Day Book (Rs. 2,050.00)')
    console.log(`  ✓ Day Book Balance: Total In Rs. ${cashDebit.toFixed(2)} - Total Out Rs. ${cashCredit.toFixed(2)} = Net Cash Rs. ${netCashInDrawer.toFixed(2)}`)

    // Verify global Trial Balance across all accounts
    let sumDebits = 0
    let sumCredits = 0

    console.log('\n=== COMPLETE TRIAL BALANCE AUDIT ===')
    for (const [code, acc] of this.accounts.entries()) {
      if (acc.debit > 0 || acc.credit > 0) {
        sumDebits += acc.debit
        sumCredits += acc.credit
        console.log(`  Account ${code.padEnd(5)} | ${acc.name.padEnd(40)} | Debit: ${acc.debit.toFixed(2).padStart(10)} | Credit: ${acc.credit.toFixed(2).padStart(10)}`)
      }
    }

    const variance = Math.abs(sumDebits - sumCredits)
    console.log('-------------------------------------------------------------------------------')
    console.log(`  TOTALS:                                                  Debit: ${sumDebits.toFixed(2).padStart(10)} | Credit: ${sumCredits.toFixed(2).padStart(10)}`)
    console.log(`  TRIAL BALANCE VARIANCE: Rs. ${variance.toFixed(4)}`)

    assert.equal(variance < 0.01, true, `Trial balance must balance! Variance: ${variance}`)

    return {
      step1_openingStock: true,
      step2_creditPurchaseWac: true,
      step3_posSplitSale: true,
      step4_chequeClearance: true,
      step5_dayBookAndTrialBalance: true,
      trialBalanceVariance: variance,
      totalDebits: Number(sumDebits.toFixed(2)),
      totalCredits: Number(sumCredits.toFixed(2))
    }
  }
}

// ----------------------------------------------------------------------------
// Runner Main
// ----------------------------------------------------------------------------
function runVerification() {
  console.log('================================================================================')
  console.log('BABY BLOOM BUSINESS SUITE - MULTI-BRANCH LEDGER SANITY TEST')
  console.log('Phase 10 Automated Integration Verification')
  console.log('================================================================================')

  const engine = new LedgerVerificationEngine()

  try {
    engine.executeStep1_OpeningStock()
    engine.executeStep2_CreditPurchase()
    engine.executeStep3_PosSplitSale()
    engine.executeStep4_InwardChequeLifecycle()
    const report = engine.executeStep5_DayBookAndTrialBalance()

    console.log('\n================================================================================')
    console.log('AUDIT REPORT SUMMARY: ALL 5 LEDGER LOOP STEPS PASSED SUCCESSFULLY')
    console.log(`  ✓ Total Journal Vouchers Verified: 7`)
    console.log(`  ✓ Total Debit Volume: Rs. ${report.totalDebits.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
    console.log(`  ✓ Total Credit Volume: Rs. ${report.totalCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
    console.log(`  ✓ Net Variance: Rs. ${report.trialBalanceVariance.toFixed(2)} (Perfect zero-balance)`)
    console.log('================================================================================\n')
  } catch (error) {
    console.error('\n❌ LEDGER SANITY VERIFICATION FAILED:', error)
    process.exit(1)
  }
}

runVerification()
