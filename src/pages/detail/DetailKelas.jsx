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
            onClick={() => onShare(course.title, course.title)}
          >
            <Icon name="share" />
          </button>
        </div>
      </div>
      <article className="public-detail-hero">
        <div className="public-detail-image">
          {course.thumbnail ? <img src={course.thumbnail} alt="" /> : <Icon name="bookOpen" />}
        </div>
        <div className="public-detail-copy">
          <p className="eyebrow">Detail kelas</p>
          <h1>{course.title}</h1>
          <p>{course.mentor} membimbing kelas ini dengan materi praktik yang mudah diikuti dari dashboard belajar.</p>
          <div className="public-detail-meta">
            <span>{course.lessons}</span>
            <span>{course.price ? formatRupiah(course.price) : 'Gratis'}</span>
            <span>{course.status}</span>
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
          Beli
        </button>
      </div>
    </section>
  )
}

export default DetailKelas
