const lkrFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  currencyDisplay: 'code',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const formatLkr = (amount: number): string =>
  lkrFormatter.format(amount).replace('LKR', 'Rs.')