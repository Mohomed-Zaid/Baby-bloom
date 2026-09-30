export { PosInvoicePage, PosInvoicePage as SalesPOSPage } from './PosInvoicePage'

export interface PosReceiptData {
  number: string
  date: string
  branchName: string
  customerName: string
  items: Array<{
    name: string
    variant?: string
    qty: number
    price: number
    total: number
  }>
  subtotal: number
  discount: number
  grandTotal: number
  tendered: number
  paid: number
  change: number
  balance: number
  paymentMethod: string
}
