import { useState } from 'react'
import Icon from '../../components/Icon'
import './Detail.css'

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
  // State reviews lists
  const [reviewsList, setReviewsList] = useState(() => {
    const initialReviews = product && Array.isArray(product.reviews) ? product.reviews : []
    if (product?.useSampleReviews === true && initialReviews.length === 0) {
      return [
        {
          id: 'rev-1',
          name: 'Rian Hidayat',
          instagram: 'rian_design',
          avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80',
          rating: 5,
          message: 'Gokil sih materinya! Penjelasan mentornya detail banget dan gampang dipahami buat pemula. Langsung bisa dipraktekkin! 🔥',
          date: '2026-06-18',
          time: '09:30',
          likes: 12,
          isLiked: false,
        },
        {
          id: 'rev-2',
          name: 'Siti Aminah',
          instagram: 'amnh.siti',
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80',
          rating: 5,
          message: 'Sangat recommended untuk yang mau mulai belajar. Template add-ons nya juga ngebantu banget mempercepat kerjaan. Sukses terus! 🙌',
          date: '2026-06-17',
          time: '14:15',
          likes: 8,
          isLiked: false,
        },
        {
          id: 'rev-3',
          name: 'David Pratama',
          instagram: 'davidprtm_',
          avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&h=150&q=80',
          rating: 4,
          message: 'Materi digital assetnya mantap. Penjelasannya pelan-pelan jadi gampang diikutin. Ditunggu rilis template lainnya min!',
          date: '2026-06-16',
          time: '18:45',
          likes: 5,
          isLiked: false,
        }
      ]
    }
    return initialReviews.map((rev, index) => ({
      id: rev.id || `rev-initial-${index}`,
      name: rev.name || 'Pembeli Terverifikasi',
      instagram: rev.instagram || rev.name?.toLowerCase().replace(/\s+/g, '_') || 'buyer_verified',
      avatar: rev.avatar || '',
      rating: Math.min(5, Math.max(1, Number(rev.rating) || 5)),
      message: rev.message || '',
      date: rev.date || new Date().toISOString().slice(0, 10),
      time: rev.time || '10:00',
      likes: Math.max(0, Math.round(Number(rev.likes) || 0)),
      isLiked: false,
    }))
  })

  if (!product) {
    return null
  }

  const embedUrl = product.addVideo ? getYoutubeEmbedUrl(product.videoUrl) : ''
  const addOns = Array.isArray(product.addOns) ? product.addOns : []
  const hasRichDescription = /<\/?[a-z][\s\S]*>/i.test(product.description || '')
  
  const salePrice = Math.max(0, Math.round(Number(product.salePrice) || 0))
  const normalPrice = Math.max(0, Math.round(Number(product.price) || 0))
  const originalPrice = (salePrice && normalPrice > salePrice)
    ? formatRupiah(normalPrice)
    : null

  // Handlers
  const handleToggleLike = (id) => {
    setReviewsList((current) =>
      current.map((rev) =>
        rev.id === id
          ? {
              ...rev,
              isLiked: !rev.isLiked,
              likes: rev.isLiked ? rev.likes - 1 : rev.likes + 1,
            }
          : rev
      )
    )
  }

  // Calculate Average Rating
  const averageRating = reviewsList.length
    ? (reviewsList.reduce((sum, item) => sum + item.rating, 0) / reviewsList.length).toFixed(1)
    : '0.0'

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

      {/* Instagram-Style Reviews Section */}
      <section className="public-detail-section">
        <p className="eyebrow">ULASAN PEMBELI</p>
        <div className="ig-reviews-container">
          <div className="ig-reviews-header">
            <div className="ig-reviews-summary">
              <div className="ig-summary-stars">
                <svg className="star-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fbbc05" stroke="#fbbc05" width="16" height="16">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
              </div>
              <span className="ig-summary-text">{averageRating} / 5.0</span>
              <span className="ig-summary-count">({reviewsList.length} Ulasan)</span>
            </div>
          </div>

          <div className="ig-comments-list">
            {reviewsList.slice(0, 3).map((review) => (
              <article className="ig-comment-item" key={review.id}>
                <div className="ig-comment-avatar-wrapper">
                  {review.avatar ? (
                    <img className="ig-comment-avatar" src={review.avatar} alt={review.name} />
                  ) : (
                    <span className="ig-comment-avatar ig-comment-avatar-fallback" aria-hidden="true">
                      {(review.name || 'P').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="ig-comment-body">
                  <div className="ig-comment-username-row">
                    <span className="ig-comment-username">
                      @{review.instagram}
                    </span>
                    <span className="ig-comment-badge-verified">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                    </span>
                    <div className="ig-comment-stars">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <svg
                          key={i}
                          className="star-icon"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill={i < review.rating ? '#fbbc05' : '#e2e8f0'}
                          stroke={i < review.rating ? '#fbbc05' : '#cbd5e1'}
                          strokeWidth="2"
                          width="10"
                          height="10"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                      ))}
                    </div>
                  </div>
                  <p className="ig-comment-text">
                    {review.message}
                  </p>
                  <div className="ig-comment-meta-row">
                    <span>{review.date} {review.time}</span>
                    <span className="ig-comment-likes-count" onClick={() => handleToggleLike(review.id)}>
                      {review.likes} likes
                    </span>
                    <button className="ig-meta-action-btn" onClick={() => handleToggleLike(review.id)}>
                      {review.isLiked ? 'Batal Suka' : 'Suka'}
                    </button>
                  </div>
                </div>
                <button 
                  className={`ig-comment-heart-btn ${review.isLiked ? 'liked' : ''}`}
                  onClick={() => handleToggleLike(review.id)}
                  aria-label="Suka ulasan"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={review.isLiked ? '#ed4956' : 'none'} stroke={review.isLiked ? '#ed4956' : '#94a3b8'} strokeWidth="2.5" width="14" height="14" className="icon">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
                  </svg>
                </button>
              </article>
            ))}
            {!reviewsList.length && (
              <div className="public-access-message">
                <Icon name="message" />
                <h3>Belum ada ulasan</h3>
                <p>Ulasan produk akan ditampilkan setelah admin menambahkannya.</p>
              </div>
            )}
          </div>
        </div>
      </section>

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
