import Icon from '../../components/Icon'

function formatRupiah(value) {
  const amount = Math.max(0, Math.round(Number(value) || 0))

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function DetailKelas({
  course,
  wishlistCount = 0,
  onAddToWishlist,
  onBack,
  onBuy,
  onOpenWishlist,
  onShare,
}) {
  if (!course) {
    return null
  }

  const originalPrice = course.price 
    ? formatRupiah(Math.round(course.price * 1.6 / 1000) * 1000)
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
            onClick={() => onShare(course.title, course.title)}
            aria-label="Bagikan"
          >
            <Icon name="share" />
          </button>
        </div>
      </div>

      <article className="public-detail-hero">
        <div className="public-detail-image">
          {course.thumbnail ? (
            <img src={course.thumbnail} alt={course.title} />
          ) : (
            <Icon name="bookOpen" />
          )}
          <div className="play-button-overlay" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff" width="24" height="24" style={{ display: 'block' }}>
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
        </div>

        <div className="public-detail-copy">
          <span className="card-badge badge-kelas" style={{ position: 'static', display: 'inline-block', marginBottom: '8px' }}>
            Kelas Premium
          </span>
          <h1>{course.title}</h1>
          <p>{course.description || `${course.mentor} membimbing kelas ini dengan materi praktik yang mudah diikuti dari dashboard belajar.`}</p>
          
          <div className="public-detail-meta">
            <span>
              <Icon name="user" style={{ marginRight: '4px', width: '12px' }} />
              {course.mentor || 'Mentor Profesional'}
            </span>
            <span>
              <Icon name="bookOpen" style={{ marginRight: '4px', width: '12px' }} />
              {String(course.lessons || '').toLowerCase().includes('materi')
                ? course.lessons
                : `${course.lessons} Materi`}
            </span>
            <span>Akses Selamanya</span>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {originalPrice && (
              <span style={{ fontSize: '0.86rem', color: '#94a3b8', textDecoration: 'line-through' }}>
                {originalPrice}
              </span>
            )}
            <strong style={{ fontSize: '1.8rem', color: '#0f172a', fontWeight: '800' }}>
              {course.price ? formatRupiah(course.price) : 'Gratis'}
            </strong>
          </div>
        </div>
      </article>

      <div className="public-sticky-actions">
        <button className="btn btn-secondary" type="button" onClick={onAddToWishlist}>
          <Icon name="cart" />
          Keranjang
        </button>
        <button className="btn btn-primary" type="button" onClick={() => onBuy(course.id)}>
          <Icon name="wallet" />
          Beli Sekarang
        </button>
      </div>
    </section>
  )
}

export default DetailKelas
