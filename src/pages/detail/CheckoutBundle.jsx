import { useMemo, useState } from 'react'
import Icon from '../../components/Icon'
import { PaymentMethodLogo } from './CheckoutProduk'
import { getCheckoutEmailWarning } from '../../utils/emailValidation'
import { getCheckoutPhoneWarning, normalizeCheckoutPhone } from '../../utils/phoneValidation'
import { getPaypalCurrencyEstimate } from '../../utils/paymentMethods'

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
  const isMemberCheckout = checkoutCustomer?.isMember === true
  const selectedPaymentMethod = paymentMethods.find((method) => method.code === paymentMethod)
  const subtotal = useMemo(
    () => items.reduce((total, item) => total + Math.max(0, Number(item.salePrice) || Number(item.price) || 0), 0),
    [items],
  )
  const total = Math.max(0, Number(bundle?.fixedPrice) || 0)
  const discount = Math.max(0, subtotal - total)
  const serviceFee = getPaymentMethodFee(selectedPaymentMethod, total)
  const paymentTotal = total + serviceFee
  const paypalEstimate = getPaypalCurrencyEstimate(selectedPaymentMethod, paymentTotal)

  if (!bundle) return null

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
    if (!paymentMethod) {
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
    setIsSubmitting(true)
    setStatus('')
    try {
      const data = await onCheckout({
        bundle,
        items,
        paymentMethod,
        buyerName: String(buyerName).trim(),
        buyerEmail: String(buyerEmail).trim(),
        buyerPhone: normalizeCheckoutPhone(buyerPhone),
        acceptedTerms,
        acceptedMarketing,
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
            <div><p className="eyebrow">CHECKOUT BUNDLING</p><h1>{bundle.title}</h1><small>{items.length} item dalam paket</small></div>
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
                <label>Email<input type="email" value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} required /></label>
                <label>Nomor HP<input type="tel" inputMode="tel" placeholder="+628123456789" value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} required /></label>
              </div>
            </div>
          )}
          {isMemberCheckout && (!buyerPhone || getCheckoutPhoneWarning(buyerPhone)) && (
            <div className="bundle-checkout-customer compact">
              <div><label>Nomor HP untuk invoice<input type="tel" inputMode="tel" placeholder="+628123456789" value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} required /></label></div>
            </div>
          )}
          <div className="bundle-checkout-items">
            {items.map((item) => (
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
          <div><span>Subtotal</span><strong>{formatRupiah(subtotal)}</strong></div>
          <div className="discount"><span>Potongan paket</span><strong>-{formatRupiah(discount)}</strong></div>
          <div><span>Harga bundle</span><strong>{formatRupiah(total)}</strong></div>
          <div><span>Biaya layanan</span><strong>{selectedPaymentMethod ? formatRupiah(serviceFee) : 'Pilih metode'}</strong></div>
          <div className="total"><span>Total pembayaran</span><strong>{formatRupiah(paymentTotal)}</strong></div>
          {paypalEstimate && (
            <div className="total currency-total">
              <span>Total yang dikirim ke PayPal</span>
              <strong>{paypalEstimate.label}</strong>
            </div>
          )}
          <div className="bundle-checkout-methods">
            <span>Metode pembayaran</span>
            {selectedPaymentMethod ? (
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
          <button className="btn btn-primary" type="button" disabled={isSubmitting} onClick={submitCheckout}>
            {isSubmitting ? 'Memproses...' : 'Bayar Sekarang'} <Icon name="arrowRight" />
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
