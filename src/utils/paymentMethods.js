export function isPaypalPaymentMethod(method) {
  return method?.provider === 'paypal' || method?.code === 'PAYPAL' || method?.brand === 'paypal'
}

export function getPaypalCurrencyEstimate(method, amount) {
  if (!isPaypalPaymentMethod(method)) {
    return null
  }

  const exchangeRate = Math.max(0, Number(method?.exchangeRate) || 0)

  if (!exchangeRate) {
    return null
  }

  const value = Math.ceil((Math.max(0, Number(amount) || 0) / exchangeRate) * 100) / 100
  const currency = String(method?.currency || 'USD').toUpperCase()

  return {
    currency,
    value,
    label: new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value),
  }
}
