import { Search, X } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onClear?: () => void
}

export function SearchInput({ value, onClear, className = '', ...props }: SearchInputProps) {
  return (
    <div className={`search-input ${className}`.trim()}>
      <Search aria-hidden="true" size={16} />
      <input type="search" value={value} {...props} />
      {value && onClear && (
        <button type="button" onClick={onClear} aria-label="Clear search"><X size={15} /></button>
      )}
    </div>
  )
}