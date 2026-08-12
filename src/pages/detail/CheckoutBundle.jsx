import { useMemo, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import VoucherCodeField from '../../components/VoucherCodeField'
import { normalizeVoucherCode, resolveVoucherCheckoutPricing, validateVoucher } from '../../lib/vouchers'
import { PaymentMethodLogo } from './CheckoutProduk'
import { getCheckoutEmailWarning } from '../../utils/emailValidation'
import { getCheckoutPhoneWarning, normalizeCheckoutPhone } from '../../utils/phoneValidation'

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(Number(value) || 0)))
}

function getPaymentMethodFee(method, amount) {
  if (!method) return 0

  const flatFee = Math.max(0, Math.round(Number(method.feeFlat) || 0))
  const percentFee = Math.max(0, Number(method.feePercent) || 0)

  return flatFee + Math.max(0, Math.round((Math.max(0, amount) * percentFee) / 100))
}

function CheckoutBundle({
  bundle,
  items = [],
  paymentMethods = [],
  checkoutCustomer = null,
  sessionToken = '',
  onBack,
  onCheckout,
}) {
  const [paymentMethod, setPaymentMethod] = useState('')
  const [isPaymentPickerOpen, setIsPaymentPickerOpen] = useState(false)
  const [buyerName, setBuyerName] = useState(checkoutCustomer?.name || '')
  const [buyerEmail, setBuyerEmail] = useState(checkoutCustomer?.email || '')
  const [buyerPhone, setBuyerPhone] = useState(checkoutCustomer?.phone || '')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acceptedMarketing, setAcceptedMarketing] = useState(false)
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherResult, setVoucherResult] = useState(null)
  const [voucherStatus, setVoucherStatus] = useState('')
  const [isVoucherLoading, setIsVoucherLoading] = useState(false)
  const voucherRequestRef = useRef(0)
  const isMemberCheckout = checkoutCustomer?.isMember === true
  const selectedPaymentMethod = paymentMethods.find((method) => method.code === paymentMethod)
  const checkoutItems = useMemo(() => {
    if (!isMemberCheckout) return items
    const ownedClassIds = new Set(checkoutCustomer?.allowedClassIds || [])
    const ownedProductIds = new Set(checkoutCustomer?.ownedProductIds || [])
    return items.filter((item) => item.itemType === 'class'
      ? !ownedClassIds.has(item.id)
      : item.allowRepeatPurchase === true || !ownedProductIds.has(item.id))
  }, [checkoutCustomer?.allowedClassIds, checkoutCustomer?.ownedProductIds, isMemberCheckout, items])
  const excludedOwnedItems = Math.max(0, items.length - checkoutItems.length)
  const subtotal = useMemo(
    () => checkoutItems.reduce((total, item) => total + Math.max(0, Number(item.salePrice) || Number(item.price) || 0), 0),
    [checkoutItems],
  )
  const configuredFixedPrice = Math.max(0, Number(bundle?.fixedPrice) || 0)
  const rawPackageDiscount = Math.max(0, subtotal - configuredFixedPrice)
  const maximumPackageDiscount = Math.max(0, Number(bundle?.maximumDiscount) || 0)
  const discount = maximumPackageDiscount > 0
    ? Math.min(rawPackageDiscount, maximumPackageDiscount)
    : rawPackageDiscount
  const total = Math.max(0, subtotal - discount)
  const voucherPricing = resolveVoucherCheckoutPricing(total, voucherResult)
  const voucherDiscount = voucherPricing.discountAmount
  const payableAmount = voucherPricing.finalAmount
  const isVoucherFree = voucherResult?.valid === true && payableAmount === 0
  const serviceFee = isVoucherFree ? 0 : getPaymentMethodFee(selectedPaymentMethod, payableAmount)
  const paymentTotal = payableAmount + serviceFee

  if (!bundle) return null

  if (isMemberCheckout && checkoutItems.length === 0) {
    return (
      <section className="bundle-checkout-page">
        <header>
          <button type="button" onClick={onBack}><Icon name="arrowLeft" /> Kembali ke detail</button>
          <span><Icon name="checkCircle" /> Akses sudah aktif</span>
        </header>
        <div className="bundle-checkout-owned-state">
          <span aria-hidden="true"><Icon name="checkCircle" /></span>
          <p className="eyebrow">PAKET SUDAH DIMILIKI</p>
          <h1>Semua isi paket sudah dimiliki</h1>
          <p>Kelas, produk digital, dan prompt dalam <strong>{bundle.title}</strong> sudah tersedia di akun Anda. Tidak ada pembayaran yang perlu dibuat.</p>
          <div>
            <button className="btn btn-secondary" type="button" onClick={onBack}>Kembali ke detail</button>
            <a className="btn btn-primary" href="/member?menu=overview">Buka Dashboard <Icon name="arrowRight" /></a>
          </div>
        </div>
      </section>
    )
  }

  const clearVoucher = () => {
    voucherRequestRef.current += 1
    setVoucherCode('')
    setVoucherResult(null)
    setVoucherStatus('')
    setIsVoucherLoading(false)
  }

  const changeVoucherCode = (value) => {
    setVoucherCode(value)
    setVoucherResult(null)
    setVoucherStatus('')
  }

  const changeBuyerEmail = (value) => {
    setBuyerEmail(value)
    if (voucherResult || isVoucherLoading) {
      voucherRequestRef.current += 1
      setVoucherResult(null)
      setIsVoucherLoading(false)
      setVoucherStatus('Masukkan kembali voucher setelah mengubah email pembeli.')
    }
  }

  const applyVoucher = async () => {
    const normalizedCode = normalizeVoucherCode(voucherCode)
    const emailWarning = getCheckoutEmailWarning(buyerEmail)

    if (!String(buyerEmail || '').trim() || emailWarning) {
      setVoucherStatus(emailWarning || 'Isi email pembeli sebelum menggunakan voucher.')
      return
    }

    setIsVoucherLoading(true)
    setVoucherStatus('')
    const requestId = voucherRequestRef.current + 1
    voucherRequestRef.current = requestId

    try {
      const result = await validateVoucher({
        code: normalizedCode,
        itemType: 'bundle',
        itemId: `fixed-${bundle.id}`,
        bundleProgramId: bundle.id,
        bundleItems: checkoutItems.map((item) => ({ type: item.itemType, id: item.id })),
        buyerEmail,
        sessionToken: sessionToken || checkoutCustomer?.sessionToken || '',
      })

      if (voucherRequestRef.current !== requestId) return

      setVoucherCode(normalizedCode)
      setVoucherResult(result.valid ? result : null)
      setVoucherStatus(result.message || (result.valid
        ? 'Voucher berhasil digunakan.'
        : 'Voucher tidak berlaku untuk bundling ini.'))
    } catch (error) {
      if (voucherRequestRef.current !== requestId) return
      setVoucherResult(null)
      setVoucherStatus(error.message || 'Voucher belum bisa diperiksa.')
    } finally {
      if (voucherRequestRef.current === requestId) {
        setIsVoucherLoading(false)
      }
    }
  }

  const submitCheckout = async () => {
    const emailWarning = getCheckoutEmailWarning(buyerEmail)
    const phoneWarning = getCheckoutPhoneWarning(buyerPhone)

    if (!String(buyerName || '').trim()) {
      setStatus('Nama pembeli wajib diisi.')
      return
    }
    if (!String(buyerEmail || '').trim() || emailWarning) {
      setStatus(emailWarning || 'Email wajib diisi agar invoice dan akun bisa dikirim.')
      return
    }
    if (!String(buyerPhone || '').trim() || phoneWarning) {
      setStatus(phoneWarning || 'Nomor HP wajib diisi untuk membuat pembayaran.')
      return
    }
    if (!paymentMethod && !isVoucherFree) {
      setStatus('Pilih metode pembayaran terlebih dahulu.')
      return
    }
    if (!acceptedTerms) {
      setStatus('Centang persetujuan syarat penggunaan terlebih dahulu.')
      return
    }
    if (!acceptedMarketing) {
      setStatus('Centang persetujuan penggunaan email dan nomor telepon terlebih dahulu.')
      return
    }
    if (!checkoutItems.length) {
      setStatus('Semua isi paket ini sudah tersedia di akun Anda.')
      return
    }
    setIsSubmitting(true)
    setStatus('')
    try {
      const data = await onCheckout({
        bundle,
        items: checkoutItems,
        paymentMethod: isVoucherFree ? '' : paymentMethod,
        buyerName: String(buyerName).trim(),
        buyerEmail: String(buyerEmail).trim(),
        buyerPhone: normalizeCheckoutPhone(buyerPhone),
        acceptedTerms,
        acceptedMarketing,
        voucherCode: voucherResult?.valid
          ? normalizeVoucherCode(voucherResult?.voucher?.code || voucherCode)
          : '',
      })

      if (data?.checkoutUrl) {
        window.location.assign(data.checkoutUrl)
        return
      }

      setStatus(data?.message || 'Checkout bundle berhasil diproses.')
      setIsSubmitting(false)
    } catch (error) {
      setStatus(error.message || 'Checkout bundle belum bisa dibuat.')
      setIsSubmitting(false)
    }
  }

  return (
    <section className="bundle-checkout-page">
      <header>
        <button type="button" onClick={onBack}><Icon name="arrowLeft" /> Kembali ke detail</button>
        <span><Icon name="lock" /> Checkout aman</span>
      </header>
      <div className="bundle-checkout-layout">
        <main>
          <div className="bundle-checkout-title">
            <span><Icon name="bundle" /></span>
            <div><p className="eyebrow">CHECKOUT BUNDLING</p><h1>{bundle.title}</h1><small>{checkoutItems.length} item dibeli{excludedOwnedItems > 0 ? ` · ${excludedOwnedItems} item yang sudah dimiliki tidak ditagihkan` : ''}</small></div>
          </div>
          {isMemberCheckout ? (
            <div className="bundle-checkout-account">
              <span><Icon name="user" /></span>
              <div>
                <small>Checkout menggunakan akun member</small>
                <strong>{buyerName || 'Member'}</strong>
                <p>{buyerEmail}</p>
              </div>
            </div>
          ) : (
            <div className="bundle-checkout-customer">
              <h2>Data pembeli</h2>
              <p>Akun belajar akan dibuat otomatis setelah pembayaran berhasil.</p>
              <div>
                <label>Nama<input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} required /></label>
                <label>Email<input type="email" value={buyerEmail} onChange={(event) => changeBuyerEmail(event.target.value)} required /></label>
                <label>Nomor HP<input type="tel" inputMode="tel" placeholder="+628123456789" value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} required /></label>
              </div>
              <p className="bundle-checkout-owned-note"><Icon name="shield" /> Jika email sudah terdaftar, item yang telah dimiliki otomatis tidak ditagihkan dan harga akhir akan disesuaikan.</p>
            </div>
          )}
          {isMemberCheckout && (!buyerPhone || getCheckoutPhoneWarning(buyerPhone)) && (
            <div className="bundle-checkout-customer compact">
              <div><label>Nomor HP untuk invoice<input type="tel" inputMode="tel" placeholder="+628123456789" value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} required /></label></div>
            </div>
          )}
          <div className="bundle-checkout-items">
            {checkoutItems.map((item) => (
              <article key={`${item.itemType}:${item.id}`}>
                <span>{item.thumbnail ? <img src={item.thumbnail} alt="" /> : <Icon name={item.itemType === 'class' ? 'bookOpen' : item.productType === 'prompt' ? 'spark' : 'download'} />}</span>
                <div><small>{item.itemType === 'class' ? 'Kelas' : item.productType === 'prompt' ? 'Prompt' : 'Produk digital'}</small><strong>{item.title}</strong></div>
                <b>{formatRupiah(Number(item.salePrice) || Number(item.price) || 0)}</b>
              </article>
            ))}
          </div>
        </main>
        <aside>
          <h2>Ringkasan pembayaran</h2>
          {!voucherPricing.isAdjusted && <div><span>Subtotal</span><strong>{formatRupiah(subtotal)}</strong></div>}
          {!voucherPricing.isAdjusted && <div className="discount"><span>Potongan paket</span><strong>-{formatRupiah(discount)}</strong></div>}
          <div><span>{voucherPricing.isAdjusted ? 'Harga item yang ditagihkan' : 'Harga bundle'}</span><strong>{formatRupiah(voucherPricing.baseAmount)}</strong></div>
          {voucherPricing.isAdjusted && <p className="bundle-checkout-price-note"><Icon name="shield" /> Harga disesuaikan karena sebagian isi paket sudah tersedia pada akun dengan email tersebut.</p>}
          {voucherResult?.valid && voucherDiscount > 0 && (
            <div className="discount"><span>Potongan voucher</span><strong>-{formatRupiah(voucherDiscount)}</strong></div>
          )}
          <section className="bundle-checkout-voucher">
            <VoucherCodeField
              id={`bundle-${bundle.id}-voucher`}
              code={voucherCode}
              result={voucherResult}
              status={voucherStatus}
              isLoading={isVoucherLoading}
              disabled={isSubmitting}
              onCodeChange={changeVoucherCode}
              onApply={applyVoucher}
              onRemove={clearVoucher}
            />
          </section>
          <div><span>Biaya layanan</span><strong>{isVoucherFree ? 'Gratis' : selectedPaymentMethod ? formatRupiah(serviceFee) : 'Pilih metode'}</strong></div>
          <div className="total"><span>Total pembayaran</span><strong>{formatRupiah(paymentTotal)}</strong></div>
          <div className="bundle-checkout-methods">
            <span>Metode pembayaran</span>
            {isVoucherFree ? (
              <p className="bundle-voucher-free-note">Voucher menanggung seluruh harga. Metode pembayaran tidak diperlukan.</p>
            ) : selectedPaymentMethod ? (
              <div className="bundle-selected-payment">
                <PaymentMethodLogo method={selectedPaymentMethod} />
                <button type="button" onClick={() => setIsPaymentPickerOpen(true)}>Ganti</button>
              </div>
            ) : (
              <button className="bundle-payment-picker-button" type="button" onClick={() => setIsPaymentPickerOpen(true)}>
                Pilih metode pembayaran <Icon name="wallet" />
              </button>
            )}
          </div>
          <label className="bundle-checkout-terms">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
            <span>Saya menyetujui syarat penggunaan dan kebijakan pembayaran.</span>
          </label>
          <label className="bundle-checkout-terms">
            <input type="checkbox" checked={acceptedMarketing} onChange={(event) => setAcceptedMarketing(event.target.checked)} />
            <span>Saya setuju email dan nomor telepon digunakan untuk invoice, akses bundling, dan informasi layanan.</span>
          </label>
          {status && <p className="bundle-checkout-status">{status}</p>}
          <button className="btn btn-primary" type="button" disabled={isSubmitting || isVoucherLoading} onClick={submitCheckout}>
            {isSubmitting ? 'Memproses...' : isVoucherFree ? 'Selesaikan Pesanan' : 'Bayar Sekarang'} <Icon name="arrowRight" />
          </button>
        </aside>
      </div>
      {isPaymentPickerOpen && (
        <div
          className="bundle-payment-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsPaymentPickerOpen(false)
          }}
        >
          <div className="bundle-payment-modal" role="dialog" aria-modal="true" aria-label="Pilih metode pembayaran">
            <header>
              <div><small>PEMBAYARAN</small><h2>Pilih metode pembayaran</h2><p>Pilih satu metode untuk melanjutkan checkout.</p></div>
              <button type="button" aria-label="Tutup" onClick={() => setIsPaymentPickerOpen(false)}><Icon name="x" /></button>
            </header>
            <div className="payment-method-grid">
              {paymentMethods.map((method) => (
                <button
                  className={`payment-method-option ${paymentMethod === method.code ? 'selected' : ''}`}
                  key={method.code}
                  type="button"
                  aria-pressed={paymentMethod === method.code}
                  onClick={() => {
                    setPaymentMethod(method.code)
                    setStatus('')
                    setIsPaymentPickerOpen(false)
                  }}
                >
                  <PaymentMethodLogo method={method} />
                  <span className="payment-method-name">{method.label || method.code}</span>
                </button>
              ))}
              {!paymentMethods.length && <p>Metode pembayaran belum tersedia.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default CheckoutBundle
