import Icon from '../../components/Icon'

function DetailProduk({
  product,
  priceLabel,
  onBack,
  onBuy,
  onShare,
}) {
  if (!product) {
    return null
  }

  return (
    <section className="public-detail-page">
      <div className="public-detail-topbar">
        <button className="icon-action-button" type="button" onClick={onBack}>
          <Icon name="arrowLeft" />
        </button>
        <button
          className="icon-action-button"
          type="button"
          onClick={() => onShare(product.title, product.description)}
        >
          <Icon name="share" />
        </button>
      </div>
      <article className="public-detail-hero public-product-detail">
        <div className="public-detail-image">
          {product.thumbnail ? <img src={product.thumbnail} alt="" /> : <Icon name="download" />}
        </div>
        <div className="public-detail-copy">
          <p className="eyebrow">Produk digital</p>
          <h1>{product.title}</h1>
          <p>{product.description || 'Produk digital siap dikirim otomatis setelah pembayaran berhasil.'}</p>
          <div className="public-detail-meta">
            <span>{product.fileName || 'Digital delivery'}</span>
            <span>{priceLabel}</span>
            <span>Akses via email</span>
          </div>
        </div>
      </article>
      <div className="public-sticky-actions">
        <button className="btn btn-secondary" type="button">
          <Icon name="cart" />
          Keranjang
        </button>
        <button className="btn btn-primary" type="button" onClick={() => onBuy(product.id)}>
          <Icon name="wallet" />
          Beli
        </button>
      </div>
    </section>
  )
}

export default DetailProduk
