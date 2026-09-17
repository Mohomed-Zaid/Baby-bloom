import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PieChart, Printer, FileText, Calendar, TrendingUp, Wallet } from 'lucide-react'
import {
  fetchTrialBalance,
  fetchDayBook,
  fetchProfitLoss,
  fetchExpenseSummary,
} from '../services/accountingService'

export const FinancialReportsPage: React.FC = () => {
  const [activeReport, setActiveReport] = useState<'tb' | 'daybook' | 'pnl' | 'expense'>('tb')

  // Queries
  const { data: tb = [], isLoading: loadingTb } = useQuery({
    queryKey: ['report-trial-balance'],
    queryFn: fetchTrialBalance,
  })

  const { data: daybook = [], isLoading: loadingDaybook } = useQuery({
    queryKey: ['report-day-book'],
    queryFn: () => fetchDayBook(),
  })

  const { data: pnl = [], isLoading: loadingPnl } = useQuery({
    queryKey: ['report-profit-loss'],
    queryFn: fetchProfitLoss,
  })

  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ['report-expense-summary'],
    queryFn: () => fetchExpenseSummary(),
  })

  // Calculations for TB
  const totalTbDebit = tb.reduce((sum, item) => sum + (item.total_debit || 0), 0)
  const totalTbCredit = tb.reduce((sum, item) => sum + (item.total_credit || 0), 0)

  // Calculations for P&L
  const revenueTotal = pnl
    .filter((i) => i.account_type === 'revenue' || i.account_type === 'other_income')
    .reduce((sum, i) => sum + (i.net_amount || 0), 0)
  const cogsTotal = pnl
    .filter((i) => i.account_type === 'cost_of_goods_sold')
    .reduce((sum, i) => sum + (i.net_amount || 0), 0)
  const expenseTotal = pnl
    .filter((i) => i.account_type === 'expense')
    .reduce((sum, i) => sum + (i.net_amount || 0), 0)

  const grossProfit = revenueTotal - cogsTotal
  const netProfit = grossProfit - expenseTotal

  function handlePrint() {
    window.print()
  }

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100 no-print">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <PieChart className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Admin Financial Reports & Statements</h1>
            <p className="text-sm text-gray-500">Executive financial accounting reports: Trial Balance, Day Book, Profit & Loss & Expense Breakdown</p>
          </div>
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white font-medium text-sm rounded-lg shadow-sm"
        >
          <Printer className="w-4 h-4" /> Print / Export Report
        </button>
      </div>

      {/* Navigation Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 no-print">
        <button
          onClick={() => setActiveReport('tb')}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeReport === 'tb'
              ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <FileText className={`w-5 h-5 ${activeReport === 'tb' ? 'text-emerald-600' : 'text-gray-400'}`} />
            <span className="text-xs font-mono font-bold text-gray-400">TB</span>
          </div>
          <div className="font-bold text-gray-900 mt-2 text-sm">Trial Balance</div>
          <div className="text-xs text-gray-500 mt-0.5">Account ledger balance proof</div>
        </button>

        <button
          onClick={() => setActiveReport('daybook')}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeReport === 'daybook'
              ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <Calendar className={`w-5 h-5 ${activeReport === 'daybook' ? 'text-emerald-600' : 'text-gray-400'}`} />
            <span className="text-xs font-mono font-bold text-gray-400">DB</span>
          </div>
          <div className="font-bold text-gray-900 mt-2 text-sm">Day Book</div>
          <div className="text-xs text-gray-500 mt-0.5">Daily posted transaction audit</div>
        </button>

        <button
          onClick={() => setActiveReport('pnl')}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeReport === 'pnl'
              ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <TrendingUp className={`w-5 h-5 ${activeReport === 'pnl' ? 'text-emerald-600' : 'text-gray-400'}`} />
            <span className="text-xs font-mono font-bold text-gray-400">P&L</span>
          </div>
          <div className="font-bold text-gray-900 mt-2 text-sm">Profit & Loss</div>
          <div className="text-xs text-gray-500 mt-0.5">Income & expenditure statement</div>
        </button>

        <button
          onClick={() => setActiveReport('expense')}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeReport === 'expense'
              ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <Wallet className={`w-5 h-5 ${activeReport === 'expense' ? 'text-emerald-600' : 'text-gray-400'}`} />
            <span className="text-xs font-mono font-bold text-gray-400">EXP</span>
          </div>
          <div className="font-bold text-gray-900 mt-2 text-sm">Expense Summary</div>
          <div className="text-xs text-gray-500 mt-0.5">Branch category expenditure</div>
        </button>
      </div>

      {/* REPORT CONTENT VIEW */}
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 print:shadow-none print:border-none">
        {/* REPORT 1: TRIAL BALANCE */}
        {activeReport === 'tb' && (
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-lg font-bold text-gray-900">Trial Balance Statement</h2>
              <p className="text-xs text-gray-500">As of {new Date().toLocaleDateString()}</p>
            </div>

            {loadingTb ? (
              <p className="text-sm text-gray-500">Loading trial balance...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600 uppercase font-bold border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">Account Code</th>
                      <th className="px-4 py-3">Account Name</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">Total Debit (LKR)</th>
                      <th className="px-4 py-3 text-right">Total Credit (LKR)</th>
                      <th className="px-4 py-3 text-right">Net Balance (LKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tb.map((item) => (
                      <tr key={item.account_id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 font-mono font-bold text-indigo-600">{item.account_code}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{item.account_name}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 capitalize">{item.account_type}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-800">
                          {item.total_debit > 0 ? item.total_debit.toFixed(2) : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-800">
                          {item.total_credit > 0 ? item.total_credit.toFixed(2) : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                          {item.net_balance.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-900 text-white font-bold font-mono">
                      <td colSpan={3} className="px-4 py-3 text-right">TOTAL PROOF:</td>
                      <td className="px-4 py-3 text-right">{totalTbDebit.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{totalTbCredit.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-emerald-400">
                        {Math.abs(totalTbDebit - totalTbCredit) < 0.01 ? 'BALANCED ✓' : 'UNBALANCED'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* REPORT 2: DAY BOOK */}
        {activeReport === 'daybook' && (
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-lg font-bold text-gray-900">Daily Journal Day Book Audit</h2>
              <p className="text-xs text-gray-500">All posted entries by transaction date</p>
            </div>

            {loadingDaybook ? (
              <p className="text-sm text-gray-500">Loading day book...</p>
            ) : daybook.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">No posted transactions in day book.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600 uppercase font-bold border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Entry No</th>
                      <th className="px-4 py-3">Account Code & Name</th>
                      <th className="px-4 py-3">Particulars</th>
                      <th className="px-4 py-3 text-right">Debit (LKR)</th>
                      <th className="px-4 py-3 text-right">Credit (LKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {daybook.map((row) => (
                      <tr key={row.line_id} className="hover:bg-gray-50/50 text-xs">
                        <td className="px-4 py-2.5 font-mono text-gray-500">{row.entry_date}</td>
                        <td className="px-4 py-2.5 font-mono font-bold text-gray-900">{row.entry_number}</td>
                        <td className="px-4 py-2.5 font-medium">
                          <span className="font-mono text-indigo-600">{row.account_code}</span> - {row.account_name}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{row.line_description || row.entry_description}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                          {row.debit > 0 ? row.debit.toFixed(2) : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                          {row.credit > 0 ? row.credit.toFixed(2) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* REPORT 3: PROFIT & LOSS */}
        {activeReport === 'pnl' && (
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-lg font-bold text-gray-900">Profit & Loss Overview</h2>
              <p className="text-xs text-gray-500">Income, COGS, Operating Expenses and Net Profit</p>
            </div>

            {loadingPnl ? (
              <p className="text-sm text-gray-500">Loading profit and loss statement...</p>
            ) : (
              <div className="max-w-2xl space-y-6">
                {/* Revenue Section */}
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wider border-b border-emerald-200 pb-1">
                    Operating Revenue & Income
                  </h3>
                  {pnl
                    .filter((i) => i.account_type === 'revenue' || i.account_type === 'other_income')
                    .map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm py-1">
                        <span className="text-gray-700">{item.account_name}</span>
                        <span className="font-mono font-semibold text-gray-900">LKR {item.net_amount.toFixed(2)}</span>
                      </div>
                    ))}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t text-emerald-900">
                    <span>TOTAL REVENUE:</span>
                    <span className="font-mono">LKR {revenueTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* COGS Section */}
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wider border-b border-amber-200 pb-1">
                    Cost of Goods Sold (COGS)
                  </h3>
                  {pnl
                    .filter((i) => i.account_type === 'cost_of_goods_sold')
                    .map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm py-1">
                        <span className="text-gray-700">{item.account_name}</span>
                        <span className="font-mono font-semibold text-gray-900">LKR {item.net_amount.toFixed(2)}</span>
                      </div>
                    ))}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t text-amber-900">
                    <span>TOTAL COGS:</span>
                    <span className="font-mono">LKR {cogsTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Gross Profit Summary Box */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex justify-between items-center text-base font-bold">
                  <span>GROSS PROFIT:</span>
                  <span className="font-mono text-indigo-700">LKR {grossProfit.toFixed(2)}</span>
                </div>

                {/* Expenses Section */}
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-rose-800 uppercase tracking-wider border-b border-rose-200 pb-1">
                    Operating Expenses
                  </h3>
                  {pnl
                    .filter((i) => i.account_type === 'expense')
                    .map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm py-1">
                        <span className="text-gray-700">{item.account_name}</span>
                        <span className="font-mono font-semibold text-gray-900">LKR {item.net_amount.toFixed(2)}</span>
                      </div>
                    ))}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t text-rose-900">
                    <span>TOTAL EXPENSES:</span>
                    <span className="font-mono">LKR {expenseTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Net Profit Summary Box */}
                <div className={`p-5 rounded-xl border flex justify-between items-center text-lg font-bold ${
                  netProfit >= 0 ? 'bg-emerald-900 text-white' : 'bg-rose-900 text-white'
                }`}>
                  <span>NET OPERATING PROFIT / (LOSS):</span>
                  <span className="font-mono text-2xl">LKR {netProfit.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* REPORT 4: EXPENSE SUMMARY */}
        {activeReport === 'expense' && (
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-lg font-bold text-gray-900">Expense Breakdown Summary</h2>
              <p className="text-xs text-gray-500">Expenditures grouped by expense account category</p>
            </div>

            {loadingExpenses ? (
              <p className="text-sm text-gray-500">Loading expense breakdown...</p>
            ) : expenses.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">No expense records found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600 uppercase font-bold border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Account Code</th>
                      <th className="px-4 py-3">Expense Category</th>
                      <th className="px-4 py-3 text-right">Total Expense (LKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expenses.map((exp, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 text-gray-600 font-medium">{exp.branch_name}</td>
                        <td className="px-4 py-3 font-mono font-bold text-rose-600">{exp.account_code}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{exp.account_name}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                          {exp.total_expense.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
