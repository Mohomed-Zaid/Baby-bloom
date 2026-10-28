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
import { CurrentStockPage } from '../pages/CurrentStockPage'
import { StockMovementPage } from '../pages/StockMovementPage'
import { PurchaseEntryPage } from '../pages/PurchaseEntryPage'
import { PurchaseHistoryPage } from '../pages/PurchaseHistoryPage'
import { PurchaseReturnsPage } from '../pages/PurchaseReturnsPage'
import { SupplierAccountsPage } from '../pages/SupplierAccountsPage'
import { PosInvoicePage } from '../pages/PosInvoicePage'
import { SalesInvoicesPage } from '../pages/SalesInvoicesPage'
import { SecurityMatrixPage } from '../pages/SecurityMatrixPage'
import { CounterRegisterPage } from '../pages/CounterRegisterPage'
import { ChequeRegistryPage } from '../pages/ChequeRegistryPage'
import { JournalEntriesPage } from '../pages/JournalEntriesPage'
import { FinancialReportsPage } from '../pages/FinancialReportsPage'
import { BarcodeGeneratorPage } from '../pages/BarcodeGeneratorPage'
import { ShortcutKeysPage } from '../pages/ShortcutKeysPage'
import { PriceCheckPage } from '../pages/PriceCheckPage'
import { BackupAndRestorePage } from '../pages/BackupAndRestorePage'
import { SystemSettingsPage } from '../pages/SystemSettingsPage'
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
import { CustomersPage } from '../pages/CustomersPage'
import { VendorsPage } from '../pages/VendorsPage'
import { ProductBarcodesPage } from '../pages/ProductBarcodesPage'
import { CategoriesPage } from '../pages/CategoriesPage'
import { BrandsPage } from '../pages/BrandsPage'
import { WarehousesPage } from '../pages/WarehousesPage'
import { StockLocationsPage } from '../pages/StockLocationsPage'
import { BankingPage } from '../pages/BankingPage'
import { NumberSequencesPage } from '../pages/NumberSequencesPage'
import { GeneralLedgerPage } from '../pages/GeneralLedgerPage'
import { AdjustmentNotesPage } from '../pages/AdjustmentNotesPage'
import { RefundsPage } from '../pages/RefundsPage'
import { OpeningStockPage } from '../pages/OpeningStockPage'
import { StockTransferPage } from '../pages/StockTransferPage'
import { StockAdjustmentPage } from '../pages/StockAdjustmentPage'
import { DamagedStockPage } from '../pages/DamagedStockPage'
import { StockWriteOffPage } from '../pages/StockWriteOffPage'
import { CustomerBalancesPage } from '../pages/CustomerBalancesPage'

const masterPages: ReadonlyArray<readonly [string, string]> = []

const implementedPrefixes = [
  '/customers/balances','/customers/statement','/finance/customer-balances',
  '/suppliers/balances','/suppliers/statement','/finance/supplier-balances',
  '/number-sequences',
  '/chart-of-accounts','/account-mappings',
  '/banks','/bank-branches','/bank-accounts','/create/bank-account',
  '/vendors','/create/vendor',
  '/categories','/create/category',
  '/brands','/create/brand',
  '/warehouses','/create/warehouse',
  '/stock-locations','/create/stock-location','/inventory/stock-locations',
  '/product-barcodes',
  '/products','/purchases','/purchase-returns','/supplier-payments','/suppliers',
  '/inventory/products','/inventory/current-stock','/inventory/opening-stock','/inventory/stock-transfer',
  '/inventory/stock-adjustment','/inventory/damaged-stock','/inventory/stock-write-off',
  '/inventory/low-stock','/inventory/stock-movement','/inventory/valuation','/inventory/generate-barcode',
  '/sales/pos','/sales/new-create','/sales/invoices','/sales/held','/sales/returns','/sales/new-return','/sales/refunds','/invoice/refunds',
  '/sales/orders','/sales/new-order',
  '/admin/staff','/create/staff',
  '/inventory/customer-orders','/inventory/order-delivery','/inventory/transfers/in-transit',
  '/pos/shift','/invoice/shift-and-cash-drawer',
  '/finance/petty-cash','/finance/petty-cash-vouchers',
  '/finance/chart-of-accounts','/finance/receivables','/finance/receive-payments','/finance/payables',
  '/finance/income','/finance/expenses','/finance/cash-book','/finance/bank-book','/finance/bank-reconciliation',
  '/admin/audit-trail','/extras/activity-log','/extras/security-audit-trail',
  '/admin/security','/admin/counters','/banking/cheques','/finance/journals','/finance/reports',
  '/finance/general-ledger','/general-ledger',
  '/finance/adjustment-notes','/adjustment-notes',
  '/create/user-privilege','/create/branch-details','/create/cheque-book-and-card','/create/journal',
  '/finance/journal-entry','/finance/cheque-administration','/finance/credit-and-debit-note',
  '/reports/finance-reports','/reports/accounting-reports',
  '/extras/shortcut-keys','/extras/price-check','/extras/barcode-labels','/extras/price-change',
  '/extras/backup-and-restore','/extras/system-settings',
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
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/balances', element: <CustomerBalancesPage mode="balances" /> },
      { path: 'customers/statement', element: <CustomerBalancesPage mode="statement" /> },
      { path: 'finance/customer-balances', element: <CustomerBalancesPage mode="balances" /> },
      { path: 'vendors/:id?', element: <VendorsPage /> },
      { path: 'create/vendor', element: <VendorsPage /> },
      { path: 'products/:id?', element: <ProductsPage /> },
      { path: 'product-details/:id?', element: <ProductsPage /> },
      { path: 'product-barcodes', element: <ProductBarcodesPage /> },
      { path: 'categories/:id?', element: <CategoriesPage /> },
      { path: 'create/category', element: <CategoriesPage /> },
      { path: 'brands/:id?', element: <BrandsPage /> },
      { path: 'create/brand', element: <BrandsPage /> },
      { path: 'warehouses/:id?', element: <WarehousesPage /> },
      { path: 'create/warehouse', element: <WarehousesPage /> },
      { path: 'stock-locations/:id?', element: <StockLocationsPage /> },
      { path: 'stock-location-details/:id?', element: <StockLocationsPage /> },
      { path: 'create/stock-location', element: <StockLocationsPage /> },
      { path: 'inventory/stock-locations', element: <StockLocationsPage /> },
      { path: 'inventory/stock-location-details', element: <StockLocationsPage /> },
      { path: 'inventory/products/:id?', element: <ProductsPage /> },
       { path: 'inventory/product-details/:id?', element: <ProductsPage /> },
      { path: 'inventory/current-stock', element: <CurrentStockPage /> },
      { path: 'inventory/current-stock-details', element: <CurrentStockPage /> },
      { path: 'current-stock', element: <CurrentStockPage /> },
      { path: 'current-stock-details', element: <CurrentStockPage /> },
      { path: 'inventory/opening-stock', element: <OpeningStockPage /> },
      { path: 'inventory/opening-stock-batch-valuation', element: <OpeningStockPage /> },
      { path: 'inventory/opening-stock-valuation', element: <OpeningStockPage /> },
      { path: 'opening-stock', element: <OpeningStockPage /> },
      { path: 'opening-stock-batch-valuation', element: <OpeningStockPage /> },
      { path: 'inventory/beginning-stock', element: <Navigate to="/inventory/opening-stock" replace /> },
      { path: 'inventory/stock-transfer', element: <StockTransferPage /> },
      { path: 'inventory/stock-transfer-movement', element: <StockTransferPage /> },
      { path: 'inventory/inter-location-movement', element: <StockTransferPage /> },
      { path: 'stock-transfer', element: <StockTransferPage /> },
      { path: 'stock-transfer-movement', element: <StockTransferPage /> },
      { path: 'inter-location-movement', element: <StockTransferPage /> },
      { path: 'inventory/transfers/in-transit', element: <InTransitTransfersPage /> },
      { path: 'inventory/in-transit-transfers', element: <InTransitTransfersPage /> },
      { path: 'inventory/inter-branch-transfers', element: <InTransitTransfersPage /> },
      { path: 'inventory/in-transit', element: <InTransitTransfersPage /> },
      { path: 'in-transit-transfers', element: <InTransitTransfersPage /> },
      { path: 'inter-branch-in-transit', element: <InTransitTransfersPage /> },
      { path: 'in-transit', element: <InTransitTransfersPage /> },
      { path: 'inventory/customer-orders', element: <CustomerOrdersPage /> },
      { path: 'inventory/order-delivery', element: <CustomerOrdersPage /> },
      { path: 'inventory/stock-adjustment', element: <StockAdjustmentPage /> },
      { path: 'inventory/stock-adjustments', element: <StockAdjustmentPage /> },
      { path: 'inventory/count-reconciliation', element: <StockAdjustmentPage /> },
      { path: 'inventory/stock-reconciliation', element: <StockAdjustmentPage /> },
      { path: 'inventory/stock-adjustments-and-count-reconciliation', element: <StockAdjustmentPage /> },
      { path: 'stock-adjustment', element: <StockAdjustmentPage /> },
      { path: 'stock-adjustments', element: <StockAdjustmentPage /> },
      { path: 'count-reconciliation', element: <StockAdjustmentPage /> },
      { path: 'inventory/damaged-stock', element: <DamagedStockPage /> },
      { path: 'inventory/damaged-and-defective-stock', element: <DamagedStockPage /> },
      { path: 'inventory/defective-stock', element: <DamagedStockPage /> },
      { path: 'damaged-stock', element: <DamagedStockPage /> },
      { path: 'defective-stock', element: <DamagedStockPage /> },
      { path: 'damaged-and-defective-stock', element: <DamagedStockPage /> },
      { path: 'inventory/stock-write-off', element: <StockWriteOffPage /> },
      { path: 'inventory/stock-write-offs', element: <StockWriteOffPage /> },
      { path: 'inventory/write-off', element: <StockWriteOffPage /> },
      { path: 'inventory/write-offs', element: <StockWriteOffPage /> },
      { path: 'inventory/stock-writeoff', element: <StockWriteOffPage /> },
      { path: 'inventory/stock-writeoffs', element: <StockWriteOffPage /> },
      { path: 'stock-write-off', element: <StockWriteOffPage /> },
      { path: 'stock-write-offs', element: <StockWriteOffPage /> },
      { path: 'stock-writeoff', element: <StockWriteOffPage /> },
      { path: 'stock-writeoffs', element: <StockWriteOffPage /> },
      { path: 'write-off', element: <StockWriteOffPage /> },
      { path: 'inventory/low-stock', element: <CurrentStockPage mode="low" /> },
      { path: 'inventory/valuation', element: <CurrentStockPage mode="valuation" /> },
      { path: 'inventory/stock-movement', element: <StockMovementPage /> },
      { path: 'inventory/stock-movement-history', element: <StockMovementPage /> },
      { path: 'inventory/stock-movements', element: <StockMovementPage /> },
      { path: 'inventory/movement-history', element: <StockMovementPage /> },
      { path: 'stock-movement', element: <StockMovementPage /> },
      { path: 'stock-movement-history', element: <StockMovementPage /> },
      { path: 'stock-movements', element: <StockMovementPage /> },
      { path: 'movement-history', element: <StockMovementPage /> },
      { path: 'purchases/new', element: <PurchaseEntryPage /> },
      { path: 'purchases/:id', element: <PurchaseHistoryPage /> },
      { path: 'purchases', element: <PurchaseHistoryPage /> },
      { path: 'purchase-returns', element: <PurchaseReturnsPage /> },
      { path: 'supplier-payments', element: <SupplierAccountsPage mode='payments' /> },
      { path: 'suppliers/balances', element: <SupplierAccountsPage mode='balances' /> },
      { path: 'suppliers/statement', element: <SupplierAccountsPage mode='statement' /> },
      { path: 'finance/supplier-balances', element: <SupplierAccountsPage mode='balances' /> },
      { path: 'finance/supplier-statement', element: <SupplierAccountsPage mode='statement' /> },
      // Sales routes
      { path: 'sales/pos', element: <PosInvoicePage /> },
      { path: 'sales/new-create', element: <PosInvoicePage /> },
      { path: 'sales/orders', element: <CustomerOrdersPage /> },
      { path: 'sales/new-order', element: <NewCustomerOrderPage /> },
      { path: 'pos/shift', element: <PosShiftPage /> },
      { path: 'invoice/shift-and-cash-drawer', element: <PosShiftPage /> },
      { path: 'sales/invoices/:id', element: <SalesInvoicesPage /> },
      { path: 'sales/invoices', element: <SalesInvoicesPage /> },
      { path: 'invoice/billing-register', element: <SalesInvoicesPage /> },
      { path: 'sales/billing-register', element: <SalesInvoicesPage /> },
      { path: 'invoice/sales-invoices', element: <SalesInvoicesPage /> },
      { path: 'sales/held', element: <PosInvoicePage /> },
      { path: 'sales/returns', element: <SalesReturnsPage /> },
      { path: 'sales/credit-notes', element: <SalesReturnsPage /> },
      { path: 'sales/returns-register', element: <SalesReturnsPage /> },
      { path: 'invoice/sales-returns', element: <SalesReturnsPage /> },
      { path: 'invoice/credit-notes', element: <SalesReturnsPage /> },
      { path: 'invoice/returns-register', element: <SalesReturnsPage /> },
      { path: 'sales/new-return', element: <NewSalesReturnPage /> },
      { path: 'sales/process-return', element: <NewSalesReturnPage /> },
      { path: 'sales/process-sales-return', element: <NewSalesReturnPage /> },
      { path: 'invoice/process-sales-return', element: <NewSalesReturnPage /> },
      { path: 'sales/refunds', element: <RefundsPage /> },
      { path: 'sales/customer-refunds', element: <RefundsPage /> },
      { path: 'sales/disbursements', element: <RefundsPage /> },
      { path: 'sales/refunds-register', element: <RefundsPage /> },
      { path: 'invoice/refunds', element: <RefundsPage /> },
      { path: 'invoice/customer-refunds', element: <RefundsPage /> },
      { path: 'invoice/disbursements', element: <RefundsPage /> },
      { path: 'staff', element: <StaffPage /> },
      { path: 'admin/staff', element: <StaffPage /> },
      { path: 'create/staff', element: <StaffPage /> },
      // Phase 7 Admin, Banking & Finance routes
      { path: 'admin/security', element: <SecurityMatrixPage /> },
      { path: 'create/user-privilege', element: <SecurityMatrixPage /> },
      { path: 'admin/counters', element: <CounterRegisterPage /> },
      { path: 'create/branch-details', element: <CounterRegisterPage /> },
      // Banking module routes
      { path: 'bank-accounts', element: <BankingPage /> },
      { path: 'banks', element: <BankingPage /> },
      { path: 'bank-branches', element: <BankingPage /> },
      { path: 'create/bank-account', element: <BankingPage /> },
      { path: 'banking/cheques', element: <ChequeRegistryPage /> },
      { path: 'create/cheque-book-and-card', element: <ChequeRegistryPage /> },
      { path: 'finance/cheque-administration', element: <ChequeRegistryPage /> },
      { path: 'finance/petty-cash', element: <PettyCashPage /> },
      { path: 'finance/petty-cash-vouchers', element: <PettyCashPage /> },
      { path: 'finance/general-ledger', element: <GeneralLedgerPage /> },
      { path: 'general-ledger', element: <GeneralLedgerPage /> },
      { path: 'finance/adjustment-notes', element: <AdjustmentNotesPage /> },
      { path: 'adjustment-notes', element: <AdjustmentNotesPage /> },
      { path: 'create/adjustment-note', element: <AdjustmentNotesPage /> },
      { path: 'finance/credit-and-debit-note', element: <AdjustmentNotesPage /> },
      { path: 'finance/journals', element: <JournalEntriesPage /> },
      { path: 'create/journal', element: <JournalEntriesPage /> },
      { path: 'finance/journal-entry', element: <JournalEntriesPage /> },
      { path: 'finance/reports', element: <FinancialReportsPage /> },
      { path: 'reports/finance-reports', element: <FinancialReportsPage /> },
      { path: 'reports/accounting-reports', element: <FinancialReportsPage /> },
      // Document Number Sequences
      { path: 'number-sequences', element: <NumberSequencesPage /> },
      // Phase 13 Core Financial Engine & Subledgers
      { path: 'chart-of-accounts', element: <ChartOfAccountsPage /> },
      { path: 'account-mappings', element: <ChartOfAccountsPage /> },
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
      { path: 'inventory/barcode-generator', element: <BarcodeGeneratorPage /> },
      { path: 'inventory/barcode-designer', element: <BarcodeGeneratorPage /> },
      { path: 'inventory/batch-label-designer', element: <BarcodeGeneratorPage /> },
      { path: 'inventory/batch-labels', element: <BarcodeGeneratorPage /> },
      { path: 'inventory/labels', element: <BarcodeGeneratorPage /> },
      { path: 'barcode-generator', element: <BarcodeGeneratorPage /> },
      { path: 'batch-label-designer', element: <BarcodeGeneratorPage /> },
      { path: 'extras/barcode-labels', element: <BarcodeGeneratorPage /> },
      { path: 'extras/shortcut-keys', element: <ShortcutKeysPage /> },
      { path: 'extras/price-check', element: <PriceCheckPage /> },
      { path: 'extras/price-change', element: <PriceCheckPage /> },
      { path: 'extras/backup-and-restore', element: <BackupAndRestorePage /> },
      { path: 'extras/system-settings', element: <SystemSettingsPage /> },
      { path: 'create/generate-barcode', element: <BarcodeGeneratorPage /> },
      { path: 'create/add-barcode', element: <BarcodeGeneratorPage /> },

      // Redirects
      { path: 'inventory/purchase', element: <Navigate to='/purchases/new' replace /> },
      { path: 'inventory/purchase-return', element: <Navigate to='/purchase-returns' replace /> },
      { path: 'finance/supplier-payment', element: <Navigate to='/supplier-payments' replace /> },
      { path: 'invoice/new-invoice', element: <Navigate to='/sales/new-create' replace /> },
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
