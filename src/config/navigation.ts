import type { LucideIcon } from 'lucide-react'
import {
  BadgeDollarSign,
  Boxes,
  CirclePlus,
  Gauge,
  LogOut,
  Megaphone,
  PackageOpen,
  ReceiptText,
  Settings2,
  Database,
} from 'lucide-react'
import { permissions, type PermissionKey } from './permissions'

export interface NavigationItem {
  title: string
  path?: string
  icon?: LucideIcon
  permission?: PermissionKey
  children?: NavigationItem[]
}

const children = (base: string, permission: PermissionKey, titles: string[]): NavigationItem[] =>
  titles.map((title) => ({
    title,
    path: `/${base}/${title.toLowerCase().replaceAll('&', 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
    permission,
  }))

export const navigation: NavigationItem[] = [
  { title: 'Dashboard', path: '/dashboard', icon: Gauge, permission: permissions.dashboardView },
  {
    title: 'Master Data', icon: Database,
    children: [
      { title:'Customers',path:'/customers',permission:permissions.customersView },
      { title:'Staff',path:'/staff',permission:permissions.staffView },
      { title:'Vendors',path:'/vendors',permission:permissions.vendorsView },
      { title:'Products',path:'/products',permission:permissions.productsView },
      { title:'Product Barcodes',path:'/product-barcodes',permission:permissions.productsView },
      { title:'Categories',path:'/categories',permission:permissions.productsView },
      { title:'Brands',path:'/brands',permission:permissions.productsView },
      { title:'Warehouses',path:'/warehouses',permission:permissions.inventoryView },
      { title:'Stock Locations',path:'/stock-locations',permission:permissions.inventoryView },
      { title:'Banks',path:'/banks',permission:permissions.bankingView },
      { title:'Bank Branches',path:'/bank-branches',permission:permissions.bankingView },
      { title:'Bank Accounts',path:'/bank-accounts',permission:permissions.bankingView },
      { title:'Chart of Accounts',path:'/chart-of-accounts',permission:permissions.accountingView },
      { title:'Account Mappings',path:'/account-mappings',permission:permissions.accountingView },
      { title:'Number Sequences',path:'/number-sequences',permission:permissions.settingsView },
    ],
  },
  {
    title: 'Create New',
    icon: CirclePlus,
    children: [
      { title: 'Purchase', path: '/purchases/new', permission: permissions.purchasesCreate },
      { title: 'Purchase Return', path: '/purchase-returns', permission: permissions.purchaseReturnsCreate },
      { title: 'Stock Location', path: '/create/stock-location', permission: permissions.inventoryManage },
      { title: 'Adjustment Note', path: '/finance/adjustment-notes', permission: permissions.accountingManage },
      ...children('create', permissions.accountingManage, ['Journal', 'Cheque Book & Card']),
      ...children('create', permissions.staffManage, ['Staff', 'User Privilege']),
      ...children('create', permissions.settingsManage, ['Branch Details']),
    ],
  },
  {
    title: 'Invoice',
    icon: ReceiptText,
    children: [
      { title: 'New Invoice', path: '/sales/pos', permission: permissions.salesCreate },
      { title: 'New Customer Order', path: '/sales/new-order', permission: permissions.ordersCreate },
      { title: 'Customer Orders', path: '/sales/orders', permission: permissions.ordersView },
      { title: 'Shift & Cash Drawer', path: '/pos/shift', permission: permissions.shiftsView },
      { title: 'Invoice History', path: '/sales/invoices', permission: permissions.salesView },
      { title: 'New Sales Return', path: '/sales/new-return', permission: permissions.salesReturnsCreate },
      { title: 'Sales Returns', path: '/sales/returns', permission: permissions.salesReturnsView },
      ...children('invoice', permissions.invoicesManage, ['Refunds']),
    ],
  },
  {
    title: 'Inventory',
    icon: Boxes,
    children: [
      { title:'Products',path:'/inventory/products',permission:permissions.inventoryView },
      { title:'Current Stock',path:'/inventory/current-stock',permission:permissions.inventoryView },
      { title:'Stock Locations',path:'/inventory/stock-locations',permission:permissions.inventoryView },
      { title:'Opening Stock',path:'/inventory/opening-stock',permission:permissions.inventoryView },
      { title:'Stock Transfer',path:'/inventory/stock-transfer',permission:permissions.inventoryView },
      { title:'In-Transit Transfers',path:'/inventory/transfers/in-transit',permission:permissions.inventoryView },
      { title:'Stock Adjustment',path:'/inventory/stock-adjustment',permission:permissions.inventoryView },
      { title:'Damaged Stock',path:'/inventory/damaged-stock',permission:permissions.inventoryView },
      { title:'Stock Write-off',path:'/inventory/stock-write-off',permission:permissions.inventoryView },
      { title:'Low Stock',path:'/inventory/low-stock',permission:permissions.inventoryView },
      { title:'Stock Movement',path:'/inventory/stock-movement',permission:permissions.inventoryView },
      { title:'Inventory Valuation',path:'/inventory/valuation',permission:permissions.inventoryView },
      { title:'Generate Barcode',path:'/inventory/generate-barcode',permission:permissions.productsView },
      { title:'New Purchase',path:'/purchases/new',permission:permissions.purchasesCreate },
      { title:'Purchase History',path:'/purchases',permission:permissions.purchasesView },
      { title:'Purchase Returns',path:'/purchase-returns',permission:permissions.purchaseReturnsView },
      { title:'Customer Orders',path:'/inventory/customer-orders',permission:permissions.ordersView },
      { title:'Order Delivery',path:'/inventory/order-delivery',permission:permissions.ordersView },
    ],
  },
  {
    title: 'Finance',
    icon: BadgeDollarSign,
    children: [
      { title:'Customer Balances',path:'/customers/balances',permission:permissions.customerStatementsView },
      { title:'Customer Statement',path:'/customers/statement',permission:permissions.customerStatementsView },
      { title:'Supplier Balances',path:'/suppliers/balances',permission:permissions.vendorStatementsView },
      { title:'Supplier Statement',path:'/suppliers/statement',permission:permissions.vendorStatementsView },
      { title:'Supplier Payments',path:'/supplier-payments',permission:permissions.supplierPaymentsCreate },
      { title:'Petty Cash Vouchers',path:'/finance/petty-cash',permission:permissions.pettyCashView },
      { title:'General Ledger',path:'/finance/general-ledger',permission:permissions.accountingView },
      { title:'Journal Entry',path:'/finance/journals',permission:permissions.accountingView },
      { title:'Adjustment Notes',path:'/finance/adjustment-notes',permission:permissions.accountingView },
      { title:'Cheque Administration',path:'/banking/cheques',permission:permissions.bankingView },
      { title:'Credit & Debit Note',path:'/finance/adjustment-notes',permission:permissions.accountingView },
      { title:'Receivables',path:'/finance/receivables',permission:permissions.receivablesView },
      { title:'Receive Payment',path:'/finance/receivables',permission:permissions.receivablesReceive },
      { title:'Payables',path:'/finance/payables',permission:permissions.payablesView },
      { title:'Income',path:'/finance/income',permission:permissions.incomeExpenseView },
      { title:'Expenses',path:'/finance/expenses',permission:permissions.incomeExpenseView },
      { title:'Cash Book',path:'/finance/cash-book',permission:permissions.cashBankBookView },
      { title:'Bank Book',path:'/finance/bank-book',permission:permissions.cashBankBookView },
      { title:'Bank Reconciliation',path:'/finance/bank-reconciliation',permission:permissions.bankReconView },
      { title:'Chart of Accounts',path:'/finance/chart-of-accounts',permission:permissions.accountingView },
      { title:'User Privilege Matrix',path:'/admin/security',permission:permissions.settingsManage },
      { title:'Staff Directory',path:'/admin/staff',permission:permissions.staffManage },
      { title:'Counter & Shift Admin',path:'/admin/counters',permission:permissions.settingsManage },
      { title:'Security Audit Trail',path:'/admin/audit-trail',permission:permissions.auditView },
    ],
  },
  {
    title: 'Reports',
    icon: PackageOpen,
    children: [
      { title:'Finance Reports',path:'/finance/reports',permission:permissions.reportsView },
      { title:'Accounting Reports',path:'/finance/reports',permission:permissions.reportsView },
      ...children('reports', permissions.reportsView, [
        'Sales Reports', 'Purchase Reports', 'Inventory Reports', 'Profit Reports',
        'Customer Reports', 'Supplier Reports', 'Staff Reports', 'Audit Reports',
      ]),
    ],
  },
  {
    title: 'Communication',
    icon: Megaphone,
    children: children('communication', permissions.communicationManage, ['SMS Templates', 'Send SMS', 'SMS History']),
  },
  {
    title: 'Extras',
    icon: Settings2,
    children: [
      { title: 'Price Check', path: '/extras/price-check', permission: permissions.productsView },
      { title: 'Shortcut Keys', path: '/extras/shortcut-keys', permission: permissions.settingsManage },
      { title: 'Barcode Labels', path: '/extras/barcode-labels', permission: permissions.productsView },
      { title: 'Security Audit Trail', path: '/admin/audit-trail', permission: permissions.auditView },
      ...children('extras', permissions.settingsManage, [
        'Backup & Restore', 'System Settings',
      ]),
    ],
  },
  { title: 'Logout', path: '/login', icon: LogOut },
]

export interface RouteMetadata {
  path: string
  title: string
  section: string
  permission?: PermissionKey
}

export const moduleRoutes: RouteMetadata[] = navigation.flatMap((section) =>
  section.children?.map((item) => ({
    path: item.path as string,
    title: item.title,
    section: section.title,
    permission: item.permission,
  })) ?? [],
)
