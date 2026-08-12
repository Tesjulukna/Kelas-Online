const voucherValidateApiPath = '/api/voucher-validate'

export function normalizeVoucherCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, 64)
}

function readVoucherAmount(value) {
  return Math.max(0, Math.round(Number(value) || 0))
}

export function resolveVoucherCheckoutPricing(localAmount, result) {
  const normalizedLocalAmount = readVoucherAmount(localAmount)

  if (result?.valid !== true) {
    return {
      baseAmount: normalizedLocalAmount,
      discountAmount: 0,
      finalAmount: normalizedLocalAmount,
      isAdjusted: false,
    }
  }

  const baseAmount = result.subtotal === undefined || result.subtotal === null
    ? normalizedLocalAmount
    : readVoucherAmount(result.subtotal)

  return {
    baseAmount,
    discountAmount: readVoucherAmount(result.discountAmount),
    finalAmount: readVoucherAmount(result.finalAmount),
    isAdjusted: baseAmount !== normalizedLocalAmount,
  }
}

export async function validateVoucher({
  code,
  itemType = '',
  itemId = '',
  bundleProgramId = '',
  bundleItems = [],
  buyerEmail = '',
  sessionToken = '',
  signal,
} = {}) {
  const normalizedCode = normalizeVoucherCode(code)

  if (!normalizedCode) {
    throw new Error('Masukkan kode voucher terlebih dahulu.')
  }

  const response = await fetch(voucherValidateApiPath, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
    },
    body: JSON.stringify({
      code: normalizedCode,
      itemType: String(itemType || ''),
      itemId: String(itemId || ''),
      bundleProgramId: String(bundleProgramId || ''),
      bundleItems: Array.isArray(bundleItems) ? bundleItems : [],
      buyerEmail: String(buyerEmail || '').trim().toLowerCase(),
    }),
  })

  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json')
    ? await response.json()
    : { message: await response.text() }

  if (!response.ok) {
    throw new Error(data?.message || 'Voucher belum bisa diperiksa. Coba lagi.')
  }

  return {
    ...data,
    valid: data?.valid === true,
    message: String(data?.message || ''),
    subtotal: readVoucherAmount(data?.subtotal),
    discountAmount: readVoucherAmount(data?.discountAmount),
    finalAmount: readVoucherAmount(data?.finalAmount),
  }
}
