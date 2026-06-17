import Icon from '../../components/Icon'

function getYoutubeEmbedUrl(value) {
  if (!value) {
    return ''
  }

  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, '')
    let videoId = ''

    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] || ''
    }

    if (['youtube.com', 'm.youtube.com'].includes(host)) {
      if (url.pathname.startsWith('/shorts/')) {
        videoId = url.pathname.split('/').filter(Boolean)[1] || ''
      } else if (url.pathname.startsWith('/embed/')) {
        videoId = url.pathname.split('/').filter(Boolean)[1] || ''
      } else {
        videoId = url.searchParams.get('v') || ''
      }
    }

    return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` : ''
  } catch {
    return ''
  }
}

function DetailProduk({
  product,
  priceLabel,
  wishlistCount = 0,
  onAddToWishlist,
  onBack,
  onBuy,
  onOpenWishlist,
  onShare,
}) {
  if (!product) {
    return null
  }

  const embedUrl = product.addVideo ? getYoutubeEmbedUrl(product.videoUrl) : ''
  const reviews = Array.isArray(product.reviews) ? product.reviews : []
  const addOns = Array.isArray(product.addOns) ? product.addOns : []
  const hasRichDescription = /<\/?[a-z][\s\S]*>/i.test(product.description || '')

  return (
    <section className="public-detail-page">
      <div className="public-detail-topbar">
        <button className="icon-action-button" type="button" onClick={onBack}>
          <Icon name="arrowLeft" />
        </button>
        <div className="public-detail-topbar-actions">
          <button className="icon-action-button cart-action-button" type="button" onClick={onOpenWishlist}>
            <Icon name="cart" />
            {wishlistCount > 0 && <span>{wishlistCount}</span>}
          </button>
          <button
            className="icon-action-button"
            type="button"
            onClick={() => onShare(product.title, product.description)}
          >
            <Icon name="share" />
          </button>
        </div>
      </div>
      <article className="public-detail-hero public-product-detail">
        <div className="public-detail-image">
          {product.thumbnail ? <img src={product.thumbnail} alt="" /> : <Icon name="download" />}
        </div>
        <div className="public-detail-copy">
          <p className="eyebrow">Produk digital</p>
          <h1>{product.title}</h1>
          {hasRichDescription ? (
            <div
              className="public-rich-description"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          ) : (
            <p>{product.description || 'Produk digital siap dikirim otomatis setelah pembayaran berhasil.'}</p>
          )}
          <div className="public-detail-meta">
            <span>{product.fileName || 'Digital delivery'}</span>
            <span>{priceLabel}</span>
            <span>Akses via email</span>
          </div>
        </div>
      </article>
      {embedUrl && (
        <section className="public-detail-section public-video-section">
          <iframe
            src={embedUrl}
            title={`Video ${product.title}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </section>
      )}
      {addOns.length > 0 && (
        <section className="public-detail-section">
          <p className="eyebrow">Add-on</p>
          <div className="public-addon-list">
            {addOns.map((addOn) => (
              <article className="public-addon-item" key={addOn.id}>
                <strong>{addOn.title}</strong>
                <span>{addOn.price ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(addOn.price) : 'Gratis'}</span>
                {addOn.description && <p>{addOn.description}</p>}
              </article>
            ))}
          </div>
        </section>
      )}
      {reviews.length > 0 && (
        <section className="public-detail-section">
          <p className="eyebrow">Review</p>
          <div className="public-review-list">
            {reviews.map((review) => (
              <article className="public-review-item" key={review.id}>
                <strong>{review.name || 'Pembeli'}</strong>
                <span>{Math.min(5, Math.max(1, Number(review.rating) || 5))}/5</span>
                {review.message && <p>{review.message}</p>}
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="public-sticky-actions">
        <button className="btn btn-secondary" type="button" onClick={onAddToWishlist}>
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
