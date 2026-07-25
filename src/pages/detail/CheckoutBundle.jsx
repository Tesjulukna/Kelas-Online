import { useMemo, useState } from 'react'
import Icon from '../../components/Icon'

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(Number(value) || 0)))
}

function CheckoutBundle({
  bundle,
  items = [],
  paymentMethods = [],
  onBack,
  onCheckout,
}) {
  const [paymentMethod, setPaymentMethod] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const subtotal = useMemo(
    () => items.reduce((total, item) => total + Math.max(0, Number(item.salePrice) || Number(item.price) || 0), 0),
    [items],
  )
  const total = Math.max(0, Number(bundle?.fixedPrice) || 0)
  const discount = Math.max(0, subtotal - total)

  if (!bundle) return null

  const submitCheckout = async () => {
    if (!paymentMethod) {
      setStatus('Pilih metode pembayaran terlebih dahulu.')
      return
    }
    if (!acceptedTerms) {
      setStatus('Centang persetujuan syarat penggunaan terlebih dahulu.')
      return
    }
    setIsSubmitting(true)
    setStatus('')
    try {
      await onCheckout({ bundle, items, paymentMethod })
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
          <div className="total"><span>Total</span><strong>{formatRupiah(total)}</strong></div>
          <div className="bundle-checkout-methods">
            <span>Metode pembayaran</span>
            <div>
              {paymentMethods.map((method) => (
                <button
                  className={paymentMethod === method.code ? 'active' : ''}
                  key={method.code}
                  type="button"
                  onClick={() => setPaymentMethod(method.code)}
                >
                  <strong>{method.label || method.code}</strong>
                </button>
              ))}
              {!paymentMethods.length && <small>Metode pembayaran belum tersedia.</small>}
            </div>
          </div>
          <label className="bundle-checkout-terms">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
            <span>Saya menyetujui syarat penggunaan dan kebijakan pembayaran.</span>
          </label>
          {status && <p className="bundle-checkout-status">{status}</p>}
          <button className="btn btn-primary" type="button" disabled={isSubmitting} onClick={submitCheckout}>
            {isSubmitting ? 'Memproses...' : 'Bayar Sekarang'} <Icon name="arrowRight" />
          </button>
        </aside>
      </div>
    </section>
  )
}

export default CheckoutBundle
