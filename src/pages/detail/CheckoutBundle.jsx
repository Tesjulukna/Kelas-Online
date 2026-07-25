import Icon from '../../components/Icon'

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(Number(value) || 0)))
}

function CheckoutBundle({ bundle, items = [], onBack, onContinue }) {
  const isFixed = bundle?.priceMode === 'fixed'
  const subtotal = items.reduce(
    (total, item) => total + Math.max(0, Number(item.salePrice) || Number(item.price) || 0),
    0,
  )
  const discount = isFixed
    ? Math.max(0, subtotal - Number(bundle?.fixedPrice || 0))
    : Math.round(subtotal * Number(bundle?.discountPercent || 0) / 100)
  const total = isFixed ? Number(bundle?.fixedPrice || 0) : Math.max(0, subtotal - discount)

  if (!bundle) return null

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
          <p><Icon name="shield" /> Akses diberikan otomatis setelah pembayaran berhasil.</p>
          <button className="btn btn-primary" type="button" onClick={() => onContinue(bundle.id)}>
            Lanjutkan Pembayaran <Icon name="arrowRight" />
          </button>
        </aside>
      </div>
    </section>
  )
}

export default CheckoutBundle
