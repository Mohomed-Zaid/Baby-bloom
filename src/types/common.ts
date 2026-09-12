export type EntityId = string
export type RecordStatus = 'active' | 'inactive' | 'draft' | 'archived'

export interface SelectOption<T extends string = string> {
  label: string
  value: T
}

export interface PaginatedResult<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
}