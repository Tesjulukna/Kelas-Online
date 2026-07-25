import Icon from '../../components/Icon'

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(Number(value) || 0)))
}

function DetailBundle({ bundle, items = [], onBack, onChoose, onCustomChoose }) {
  if (!bundle) return null

  const isFixed = bundle.priceMode === 'fixed'

  return (
    <section className="bundle-detail-page">
      <header className="bundle-detail-topbar">
        <button type="button" onClick={onBack}><Icon name="arrowLeft" /> Kembali</button>
        <span><Icon name="bundle" /> Detail Bundling</span>
      </header>

      <div className="bundle-detail-hero">
        <span className="bundle-detail-cover">
          {bundle.thumbnail ? <img src={bundle.thumbnail} alt={bundle.title} /> : <Icon name="bundle" />}
          <small>{bundle.badge}</small>
        </span>
        <div className="bundle-detail-copy">
          <p className="eyebrow">{isFixed ? 'PAKET HARGA TETAP' : 'BUNDLING CUSTOM'}</p>
          <h1>{bundle.title}</h1>
          <p>{bundle.description}</p>
          <div className="bundle-detail-price">
            <span>
              <small>{isFixed ? 'Harga paket' : 'Potongan bundling'}</small>
              <strong>{isFixed ? formatRupiah(bundle.fixedPrice) : `${bundle.discountPercent}%`}</strong>
            </span>
            <span>
              <small>Isi tersedia</small>
              <strong>{items.length} item</strong>
            </span>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => (isFixed ? onChoose : onCustomChoose)(bundle.id)}
          >
            {isFixed ? 'Pilih Paket Ini' : 'Tentukan Pilihanmu'} <Icon name="arrowRight" />
          </button>
        </div>
      </div>

      <div className="bundle-detail-content">
        <div className="bundle-detail-heading">
          <span><Icon name="bundle" /></span>
          <div>
            <h2>Isi dalam bundling</h2>
            <p>{isFixed ? 'Semua item berikut termasuk dalam satu paket.' : `Pilih minimal ${bundle.minimumItems} item dari daftar berikut.`}</p>
          </div>
        </div>
        <div className="bundle-detail-items">
          {items.map((item) => (
            <article key={`${item.itemType}:${item.id}`}>
              <span>{item.thumbnail ? <img src={item.thumbnail} alt="" /> : <Icon name={item.itemType === 'class' ? 'bookOpen' : item.productType === 'prompt' ? 'spark' : 'download'} />}</span>
              <div>
                <small>{item.itemType === 'class' ? 'Kelas' : item.productType === 'prompt' ? 'Prompt' : 'Produk digital'}</small>
                <h3>{item.title}</h3>
                <strong>{formatRupiah(Number(item.salePrice) || Number(item.price) || 0)}</strong>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default DetailBundle
