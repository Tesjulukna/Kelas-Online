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

function formatRupiah(value) {
  const amount = Math.max(0, Math.round(Number(value) || 0))

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
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
  
  const salePrice = Math.max(0, Math.round(Number(product.salePrice) || 0))
  const normalPrice = Math.max(0, Math.round(Number(product.price) || 0))
  const originalPrice = (salePrice && normalPrice > salePrice)
    ? formatRupiah(normalPrice)
    : null

  return (
    <section className="public-detail-page">
      <div className="public-detail-topbar">
        <button className="icon-action-button" type="button" onClick={onBack} aria-label="Kembali">
          <Icon name="arrowLeft" />
        </button>
        <div className="public-detail-topbar-actions">
          <button className="icon-action-button cart-action-button" type="button" onClick={onOpenWishlist} aria-label="Keranjang">
            <Icon name="cart" />
            {wishlistCount > 0 && <span>{wishlistCount}</span>}
          </button>
          <button
            className="icon-action-button"
            type="button"
            onClick={() => onShare(product.title, product.description)}
            aria-label="Bagikan"
          >
            <Icon name="share" />
          </button>
        </div>
      </div>

      <article className="public-detail-hero public-product-detail">
        <div className={`public-detail-image ${product.thumbnail ? 'has-image' : ''}`}>
          {product.thumbnail ? (
            <img src={product.thumbnail} alt={product.title} />
          ) : (
            <Icon name="download" />
          )}
        </div>

        <div className="public-detail-copy">
          <span className="card-badge badge-produk-digital" style={{ position: 'static', display: 'inline-block', marginBottom: '8px' }}>
            Produk Digital
          </span>
          <h1>{product.title}</h1>
          {hasRichDescription ? (
            <div
              className="public-rich-description"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          ) : (
            <p>{product.description || 'Produk digital siap diakses otomatis setelah pembayaran berhasil.'}</p>
          )}

          <div className="public-detail-meta">
            <span>
              <Icon name="download" style={{ marginRight: '4px', width: '12px' }} />
              {product.fileName || 'Digital Delivery'}
            </span>
            <span>Akses Instant via Email</span>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {originalPrice && (
              <span style={{ fontSize: '0.86rem', color: '#94a3b8', textDecoration: 'line-through' }}>
                {originalPrice}
              </span>
            )}
            <strong style={{ fontSize: '1.8rem', color: '#0f172a', fontWeight: '800' }}>
              {priceLabel}
            </strong>
          </div>
        </div>
      </article>

      {embedUrl && (
        <section className="public-video-section">
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
          <p className="eyebrow">ADD-ONS TERSEDIA</p>
          <div className="public-addon-list">
            {addOns.map((addOn) => (
              <article className="public-addon-item" key={addOn.id}>
                <strong>{addOn.title}</strong>
                <span>{addOn.price ? formatRupiah(addOn.price) : 'Gratis'}</span>
                {addOn.description && <p>{addOn.description}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="public-detail-section">
          <p className="eyebrow">ULASAN PEMBELI</p>
          <div className="public-review-list">
            {reviews.map((review) => {
              const rating = Math.min(5, Math.max(1, Number(review.rating) || 5))
              return (
                <article className="public-review-item" key={review.id}>
                  <div className="review-rating-row">
                    <strong>{review.name || 'Pembeli Terverifikasi'}</strong>
                    <div className="stars" aria-label={`Rating ${rating} dari 5 bintang`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <svg
                          key={i}
                          className="star-icon"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill={i < rating ? '#fbbc05' : '#e2e8f0'}
                          stroke={i < rating ? '#fbbc05' : '#cbd5e1'}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          width="12"
                          height="12"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                      ))}
                    </div>
                  </div>
                  {review.message && <p>{review.message}</p>}
                </article>
              )
            })}
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
          Beli Sekarang
        </button>
      </div>
    </section>
  )
}

export default DetailProduk
