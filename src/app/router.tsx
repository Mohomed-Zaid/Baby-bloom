import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { ProtectedRoute } from '../components/common/ProtectedRoute'
import { moduleRoutes } from '../config/navigation'
import { DashboardPage } from '../pages/DashboardPage'
import { LoginPage } from '../pages/LoginPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { MasterDataPage } from '../pages/MasterDataPage'
import { ProductsPage } from '../pages/ProductsPage'
import { InventoryDocumentsPage } from '../pages/InventoryDocumentsPage'
import { CurrentStockPage } from '../pages/CurrentStockPage'
import { StockMovementPage } from '../pages/StockMovementPage'
import { PurchaseEntryPage } from '../pages/PurchaseEntryPage'
import { PurchaseHistoryPage } from '../pages/PurchaseHistoryPage'
import { PurchaseReturnsPage } from '../pages/PurchaseReturnsPage'
import { SupplierAccountsPage } from '../pages/SupplierAccountsPage'
import { SalesPOSPage } from '../pages/SalesPOSPage'
import { SalesInvoicesPage } from '../pages/SalesInvoicesPage'
import { SecurityMatrixPage } from '../pages/SecurityMatrixPage'
import { CounterRegisterPage } from '../pages/CounterRegisterPage'
import { ChequeRegistryPage } from '../pages/ChequeRegistryPage'
import { JournalEntriesPage } from '../pages/JournalEntriesPage'
import { FinancialReportsPage } from '../pages/FinancialReportsPage'
import { BarcodeGeneratorPage } from '../pages/BarcodeGeneratorPage'
import { ShortcutKeysPage } from '../pages/ShortcutKeysPage'
import { PriceCheckPage } from '../pages/PriceCheckPage'
import { PosShiftPage } from '../pages/PosShiftPage'
import { PettyCashPage } from '../pages/PettyCashPage'
import { AuditTrailPage } from '../pages/AuditTrailPage'
import { CustomerOrdersPage } from '../pages/CustomerOrdersPage'
import { NewCustomerOrderPage } from '../pages/NewCustomerOrderPage'
import { InTransitTransfersPage } from '../pages/InTransitTransfersPage'
import { ChartOfAccountsPage } from '../pages/ChartOfAccountsPage'
import { CustomerReceivablesPage } from '../pages/CustomerReceivablesPage'
import { VendorPayablesPage } from '../pages/VendorPayablesPage'
import { DirectIncomeExpensePage } from '../pages/DirectIncomeExpensePage'
import { CashBankBookPage } from '../pages/CashBankBookPage'
import { BankReconciliationPage } from '../pages/BankReconciliationPage'
import { StaffPage } from '../pages/StaffPage'
import { SalesReturnsPage } from '../pages/SalesReturnsPage'
import { NewSalesReturnPage } from '../pages/NewSalesReturnPage'

const masterPages = [
  ['customers','customers'],['vendors','vendors'],['categories','categories'],['brands','brands'],['units','units'],
  ['warehouses','warehouses'],['stock-locations','locations'],['banks','banks'],['bank-branches','bank-branches'],
  ['bank-accounts','bank-accounts'],['chart-of-accounts','accounts'],['account-mappings','mappings'],
  ['product-barcodes','barcodes'],['number-sequences','sequences'],
] as const

const implementedPrefixes = [
  '/products','/purchases','/purchase-returns','/supplier-payments','/suppliers',
  '/inventory/products','/inventory/current-stock','/inventory/opening-stock','/inventory/stock-transfer',
  '/inventory/stock-adjustment','/inventory/damaged-stock','/inventory/stock-write-off',
  '/inventory/low-stock','/inventory/stock-movement','/inventory/valuation','/inventory/generate-barcode',
  '/sales/pos','/sales/invoices','/sales/held','/sales/returns','/sales/new-return',
  '/sales/orders','/sales/new-order',
  '/admin/staff','/create/staff',
  '/inventory/customer-orders','/inventory/order-delivery','/inventory/transfers/in-transit',
  '/pos/shift','/invoice/shift-and-cash-drawer',
  '/finance/petty-cash','/finance/petty-cash-vouchers',
  '/finance/chart-of-accounts','/finance/receivables','/finance/receive-payments','/finance/payables',
  '/finance/income','/finance/expenses','/finance/cash-book','/finance/bank-book','/finance/bank-reconciliation',
  '/admin/audit-trail','/extras/activity-log','/extras/security-audit-trail',
  '/admin/security','/admin/counters','/banking/cheques','/finance/journals','/finance/reports',
  '/create/user-privilege','/create/branch-details','/create/cheque-book-and-card','/create/journal',
  '/finance/journal-entry','/finance/cheque-administration','/finance/credit-and-debit-note',
  '/reports/finance-reports','/reports/accounting-reports',
  '/extras/shortcut-keys','/extras/price-check','/extras/barcode-labels','/extras/price-change',
  ...masterPages.map(([path]) => `/${path}`),
]

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'products/:id?', element: <ProductsPage /> },
      { path: 'inventory/products', element: <ProductsPage /> },
      { path: 'inventory/current-stock', element: <CurrentStockPage /> },
      { path: 'inventory/opening-stock', element: <InventoryDocumentsPage kind="opening_stock" /> },
      { path: 'inventory/beginning-stock', element: <Navigate to="/inventory/opening-stock" replace /> },
      { path: 'inventory/stock-transfer', element: <InventoryDocumentsPage kind="stock_transfer" /> },
      { path: 'inventory/transfers/in-transit', element: <InTransitTransfersPage /> },
      { path: 'inventory/customer-orders', element: <CustomerOrdersPage /> },
      { path: 'inventory/order-delivery', element: <CustomerOrdersPage /> },
      { path: 'inventory/stock-adjustment', element: <InventoryDocumentsPage kind="stock_adjustment_in" /> },
      { path: 'inventory/damaged-stock', element: <InventoryDocumentsPage kind="damaged_stock" /> },
      { path: 'inventory/stock-write-off', element: <InventoryDocumentsPage kind="stock_write_off" /> },
      { path: 'inventory/low-stock', element: <CurrentStockPage mode="low" /> },
      { path: 'inventory/valuation', element: <CurrentStockPage mode="valuation" /> },
      { path: 'inventory/stock-movement', element: <StockMovementPage /> },
      { path: 'purchases/new', element: <PurchaseEntryPage /> },
      { path: 'purchases/:id', element: <PurchaseHistoryPage /> },
      { path: 'purchases', element: <PurchaseHistoryPage /> },
      { path: 'purchase-returns', element: <PurchaseReturnsPage /> },
      { path: 'supplier-payments', element: <SupplierAccountsPage mode='payments' /> },
      { path: 'suppliers/balances', element: <SupplierAccountsPage mode='balances' /> },
      { path: 'suppliers/statement', element: <SupplierAccountsPage mode='statement' /> },
      // Sales routes
      { path: 'sales/pos', element: <SalesPOSPage /> },
      { path: 'sales/orders', element: <CustomerOrdersPage /> },
      { path: 'sales/new-order', element: <NewCustomerOrderPage /> },
      { path: 'pos/shift', element: <PosShiftPage /> },
      { path: 'invoice/shift-and-cash-drawer', element: <PosShiftPage /> },
      { path: 'sales/invoices/:id', element: <SalesInvoicesPage /> },
      { path: 'sales/invoices', element: <SalesInvoicesPage /> },
      { path: 'sales/held', element: <SalesPOSPage /> },
      { path: 'sales/returns', element: <SalesReturnsPage /> },
      { path: 'sales/new-return', element: <NewSalesReturnPage /> },
      { path: 'admin/staff', element: <StaffPage /> },
      { path: 'create/staff', element: <StaffPage /> },
      // Phase 7 Admin, Banking & Finance routes
      { path: 'admin/security', element: <SecurityMatrixPage /> },
      { path: 'create/user-privilege', element: <SecurityMatrixPage /> },
      { path: 'admin/counters', element: <CounterRegisterPage /> },
      { path: 'create/branch-details', element: <CounterRegisterPage /> },
      { path: 'banking/cheques', element: <ChequeRegistryPage /> },
      { path: 'create/cheque-book-and-card', element: <ChequeRegistryPage /> },
      { path: 'finance/cheque-administration', element: <ChequeRegistryPage /> },
      { path: 'finance/petty-cash', element: <PettyCashPage /> },
      { path: 'finance/petty-cash-vouchers', element: <PettyCashPage /> },
      { path: 'finance/journals', element: <JournalEntriesPage /> },
      { path: 'create/journal', element: <JournalEntriesPage /> },
      { path: 'finance/journal-entry', element: <JournalEntriesPage /> },
      { path: 'finance/credit-and-debit-note', element: <JournalEntriesPage /> },
      { path: 'finance/reports', element: <FinancialReportsPage /> },
      { path: 'reports/finance-reports', element: <FinancialReportsPage /> },
      { path: 'reports/accounting-reports', element: <FinancialReportsPage /> },
      // Phase 13 Core Financial Engine & Subledgers
      { path: 'finance/chart-of-accounts', element: <ChartOfAccountsPage /> },
      { path: 'finance/receivables', element: <CustomerReceivablesPage /> },
      { path: 'finance/receive-payments', element: <CustomerReceivablesPage /> },
      { path: 'finance/payables', element: <VendorPayablesPage /> },
      { path: 'finance/income', element: <DirectIncomeExpensePage /> },
      { path: 'finance/expenses', element: <DirectIncomeExpensePage /> },
      { path: 'finance/cash-book', element: <CashBankBookPage /> },
      { path: 'finance/bank-book', element: <CashBankBookPage /> },
      { path: 'finance/bank-reconciliation', element: <BankReconciliationPage /> },
      { path: 'admin/audit-trail', element: <AuditTrailPage /> },
      { path: 'extras/activity-log', element: <AuditTrailPage /> },
      { path: 'extras/security-audit-trail', element: <AuditTrailPage /> },

      // Phase 9 Barcode & POS Extras routes
      { path: 'inventory/generate-barcode', element: <BarcodeGeneratorPage /> },
      { path: 'extras/barcode-labels', element: <BarcodeGeneratorPage /> },
      { path: 'extras/shortcut-keys', element: <ShortcutKeysPage /> },
      { path: 'extras/price-check', element: <PriceCheckPage /> },
      { path: 'extras/price-change', element: <PriceCheckPage /> },
      { path: 'create/generate-barcode', element: <BarcodeGeneratorPage /> },
      { path: 'create/add-barcode', element: <BarcodeGeneratorPage /> },

      // Redirects
      { path: 'inventory/purchase', element: <Navigate to='/purchases/new' replace /> },
      { path: 'inventory/purchase-return', element: <Navigate to='/purchase-returns' replace /> },
      { path: 'finance/supplier-payment', element: <Navigate to='/supplier-payments' replace /> },
      { path: 'invoice/new-invoice', element: <Navigate to='/sales/pos' replace /> },
      { path: 'invoice/invoice-history', element: <Navigate to='/sales/invoices' replace /> },
      { path: 'invoice/held-bills', element: <Navigate to='/sales/held' replace /> },
      { path: 'invoice/sales-return', element: <Navigate to='/sales/returns' replace /> },
      ...masterPages.map(([path,moduleKey]) => ({ path:`${path}/:id?`,element:<MasterDataPage moduleKey={moduleKey} basePath={`/${path}`} /> })),
      ...moduleRoutes.filter((route) => !implementedPrefixes.some((prefix) => route.path === prefix || route.path.startsWith(`${prefix}/`))).map((route) => ({
        path: route.path.slice(1),
        element: <PlaceholderPage title={route.title} section={route.section} permission={route.permission} />,
      })),
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
