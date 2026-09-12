import type { ReactNode } from 'react'
import { EmptyState } from './EmptyState'

export interface DataTableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'center' | 'right'
}

interface DataTableProps<T> {
  rows: T[]
  columns: DataTableColumn<T>[]
  rowKey: (row: T) => string
  caption?: string
  emptyTitle?: string
  emptyDescription?: string
}

export function DataTable<T>({ rows, columns, rowKey, caption, emptyTitle = 'No records found', emptyDescription = 'Records will appear here when they are available.' }: DataTableProps<T>) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />

  return (
    <div className="table-wrap">
      <table className="data-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead><tr>{columns.map((column) => <th key={column.key} className={`align-${column.align ?? 'left'}`}>{column.header}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key} className={`align-${column.align ?? 'left'}`}>{column.render(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}