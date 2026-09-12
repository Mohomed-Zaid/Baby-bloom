import { formatLkr } from '../../lib/currency'

interface CurrencyDisplayProps { amount: number; className?: string }
export function CurrencyDisplay({ amount, className }: CurrencyDisplayProps) {
  return <span className={className}>{formatLkr(amount)}</span>
}