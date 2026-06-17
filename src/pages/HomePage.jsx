import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { benefits, courseHighlights } from '../data/platformData'
import { cleanWebsiteSettings, defaultWebsiteSettings } from '../data/websiteSettings'

function formatRupiah(value) {
  const amount = Math.max(0, Math.round(Number(value) || 0))

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function publicCodeFromId(id, takenCodes = new Set()) {
  const source = String(id || 'item')
  let hash = 0x811c9dc5

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  for (let salt = 0; salt < 100; salt += 1) {
    const code = String(10000 + ((hash + salt * 9973) % 90000)).padStart(5, '0')

    if (!takenCodes.has(code)) {
      takenCodes.add(code)
      return code
    }
  }

  return String(10000 + (hash % 90000)).padStart(5, '0')
}

function withPublicCodes(items) {
  const takenCodes = new Set()

  return items.map((item) => ({
    ...item,
    publicCode: publicCodeFromId(item.id, takenCodes),
  }))
}

function PublicPaymentMethodLogo({ method }) {
  if (method.logoUrl) {
    return (
      <span className="payment-method-logo custom-logo" aria-hidden="true">
        <img src={method.logoUrl} alt="" />
      </span>
    )
  }

  if (method.brand === 'qris') {
    return (
      <span className="payment-method-logo qris-logo" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </span>
    )
  }

  if (['alfamart', 'indomaret', 'alfamidi'].includes(method.brand)) {
    return (
      <span className={`payment-method-logo store-logo ${method.brand}`} aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </span>
    )
  }

  if (['ovo', 'shopeepay'].includes(method.brand)) {
    return (
      <span className={`payment-method-logo wallet-logo ${method.brand}`} aria-hidden="true">
        <span></span>
      </span>
    )
  }

  return (
    <span className={`payment-method-logo bank-logo ${method.brand}`} aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </span>
  )
}

function HomePage({
  isLoggedIn,
  onLogin,
  onExplore,
  onRequestClassCheckout = () => {},
  onPublicProductCheckout = async () => {},
  initialDetail = null,
  classes = [],
  digitalProducts = [],
  settings = defaultWebsiteSettings,
}) {
  const websiteSettings = cleanWebsiteSettings(settings)
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [checkoutProductId, setCheckoutProductId] = useState('')
  const [isPaymentPickerOpen, setIsPaymentPickerOpen] = useState(false)
  const [publicCheckoutForm, setPublicCheckoutForm] = useState({
    buyerName: '',
    buyerEmail: '',
    buyerPhone: '',
    paymentMethod: '',
    acceptedTerms: false,
    acceptedMarketing: false,
  })
  const [publicCheckoutStatus, setPublicCheckoutStatus] = useState('')
  const heroStyle = websiteSettings.hero.backgroundImage
    ? { backgroundImage: `url(${JSON.stringify(websiteSettings.hero.backgroundImage)})` }
    : undefined
  const homepageClasses = withPublicCodes(classes.filter(
    (course) => course.status === 'Aktif' && course.showOnHomepage !== false,
  ))
  const homepageProducts = withPublicCodes(digitalProducts.filter(
    (product) => product.status === 'Aktif' && product.showOnHomepage !== false,
  )
  )
  const publicCourses = classes.length
    ? homepageClasses
        .slice()
        .sort((first, second) => Number(second.highlighted) - Number(first.highlighted))
        .map((course) => ({
        id: course.id,
        publicCode: course.publicCode,
        title: course.title,
        level: course.status,
        lessons: course.lessons,
        icon: 'bookOpen',
        thumbnail: course.thumbnail,
        mentor: course.mentor,
        price: course.price ? formatRupiah(course.price) : 'Gratis',
        highlighted: course.highlighted === true,
        description: `${course.mentor} membimbing kelas ini dengan materi praktik yang mudah diikuti dari dashboard belajar.`,
      }))
    : courseHighlights.map((course) => ({
        ...course,
        thumbnail: '',
        mentor: websiteSettings.courses.fallbackMentor,
        price: websiteSettings.courses.fallbackPrice,
      }))
  const publicProducts = homepageProducts
    .slice()
    .sort((first, second) => Number(second.highlighted) - Number(first.highlighted))
    .map((product) => {
      const salePrice = Math.max(0, Math.round(Number(product.salePrice) || 0))
      const normalPrice = Math.max(0, Math.round(Number(product.price) || 0))
      const price = salePrice || normalPrice

      return {
        id: product.id,
        publicCode: product.publicCode,
        title: product.title,
        thumbnail: product.thumbnail,
        price: price ? formatRupiah(price) : 'Gratis',
        fileName: product.fileName || product.platformType || 'Produk digital',
        highlighted: product.highlighted === true,
        description: product.description || 'Produk digital siap diakses otomatis setelah pembayaran berhasil.',
      }
    })
  const selectedClass = homepageClasses.find((course) => course.id === selectedClassId || course.publicCode === selectedClassId)
  const selectedProduct = homepageProducts.find((product) => product.id === selectedProductId || product.publicCode === selectedProductId)
  const checkoutProduct = homepageProducts.find((product) => product.id === checkoutProductId || product.publicCode === checkoutProductId)
  const activeCheckoutProduct = checkoutProduct || selectedProduct
  const selectedProductSalePrice = Math.max(0, Math.round(Number(activeCheckoutProduct?.salePrice) || 0))
  const selectedProductNormalPrice = Math.max(0, Math.round(Number(activeCheckoutProduct?.price) || 0))
  const selectedProductPrice = selectedProductSalePrice || selectedProductNormalPrice
  const isPublicProductFree = selectedProductPrice <= 0
  const paymentMethods = websiteSettings.paymentMethods || []
  const initialDetailType = initialDetail?.type || ''
  const initialDetailId = initialDetail?.id || ''
  const initialDetailAction = initialDetail?.action || ''

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!initialDetailId) {
        setSelectedClassId('')
        setSelectedProductId('')
        setCheckoutProductId('')
        setIsPaymentPickerOpen(false)
        return
      }

      if (initialDetailType === 'kelas') {
        setSelectedClassId(initialDetailId)
        setSelectedProductId('')
        setCheckoutProductId('')
      }

      if (initialDetailType === 'produk') {
        if (initialDetailAction === 'checkout') {
          setCheckoutProductId(initialDetailId)
          setSelectedProductId('')
        } else {
          setSelectedProductId(initialDetailId)
          setCheckoutProductId('')
        }
        setSelectedClassId('')
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [initialDetailAction, initialDetailId, initialDetailType])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (selectedClass?.publicCode && window.location.pathname.startsWith('/kelas/')) {
      const nextPath = `/kelas/${encodeURIComponent(selectedClass.publicCode)}`

      if (window.location.pathname !== nextPath) {
        window.history.replaceState({}, '', nextPath)
      }
    }

    if (selectedProduct?.publicCode && window.location.pathname.startsWith('/produk/')) {
      const nextPath = `/produk/${encodeURIComponent(selectedProduct.publicCode)}`

      if (window.location.pathname !== nextPath) {
        window.history.replaceState({}, '', nextPath)
      }
    }

    if (checkoutProduct?.publicCode && window.location.pathname.startsWith('/produk/')) {
      const nextPath = `/produk/${encodeURIComponent(checkoutProduct.publicCode)}/checkout`

      if (window.location.pathname !== nextPath) {
        window.history.replaceState({}, '', nextPath)
      }
    }
  }, [checkoutProduct?.publicCode, selectedClass?.publicCode, selectedProduct?.publicCode])

  const openClassDetail = (classId) => {
    const course = homepageClasses.find((item) => item.id === classId || item.publicCode === classId)

    setSelectedClassId(classId)
    setSelectedProductId('')
    setCheckoutProductId('')
    window.history.pushState({}, '', `/kelas/${encodeURIComponent(course?.publicCode || classId)}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openProductDetail = (productId) => {
    const product = homepageProducts.find((item) => item.id === productId || item.publicCode === productId)

    setSelectedProductId(productId)
    setSelectedClassId('')
    setCheckoutProductId('')
    setIsPaymentPickerOpen(false)
    window.history.pushState({}, '', `/produk/${encodeURIComponent(product?.publicCode || productId)}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closePublicDetail = () => {
    setSelectedClassId('')
    setSelectedProductId('')
    setCheckoutProductId('')
    setIsPaymentPickerOpen(false)
    window.history.pushState({}, '', '/')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openProductCheckout = (productId) => {
    const product = homepageProducts.find((item) => item.id === productId || item.publicCode === productId)

    setCheckoutProductId(productId)
    setSelectedProductId('')
    setIsPaymentPickerOpen(false)
    window.history.pushState({}, '', `/produk/${encodeURIComponent(product?.publicCode || productId)}/checkout`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const shareItem = async (title, text) => {
    const url = typeof window !== 'undefined' ? window.location.href : ''

    try {
      if (navigator.share) {
        await navigator.share({ title, text, url })
        return
      }

      if (navigator.clipboard && url) {
        await navigator.clipboard.writeText(url)
      }
    } catch {
      // Sharing is optional; cancelled share sheets should stay quiet.
    }
  }

  const handlePublicCheckoutChange = (event) => {
    const { name, type, checked, value } = event.target

    setPublicCheckoutForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const submitPublicProductCheckout = async (event) => {
    event.preventDefault()

    if (!activeCheckoutProduct) {
      return
    }

    setPublicCheckoutStatus(isPublicProductFree ? 'Memproses produk gratis...' : 'Membuat invoice...')

    try {
      const data = await onPublicProductCheckout({
        productId: activeCheckoutProduct.id,
        ...publicCheckoutForm,
        paymentMethod: isPublicProductFree ? '' : publicCheckoutForm.paymentMethod,
      })

      if (data?.checkoutUrl) {
        window.location.assign(data.checkoutUrl)
      } else {
        setPublicCheckoutStatus(data?.message || 'Produk berhasil diproses.')
      }
    } catch (error) {
      setPublicCheckoutStatus(error.message || 'Checkout produk belum bisa dibuat.')
    }
  }

  if (selectedClass) {
    return (
      <section className="public-detail-page">
        <div className="public-detail-topbar">
          <button className="icon-action-button" type="button" onClick={closePublicDetail}>
            <Icon name="arrowLeft" />
          </button>
          <button
            className="icon-action-button"
            type="button"
            onClick={() => shareItem(selectedClass.title, selectedClass.title)}
          >
            <Icon name="share" />
          </button>
        </div>
        <article className="public-detail-hero">
          <div className="public-detail-image">
            {selectedClass.thumbnail ? <img src={selectedClass.thumbnail} alt="" /> : <Icon name="bookOpen" />}
          </div>
          <div className="public-detail-copy">
            <p className="eyebrow">Detail kelas</p>
            <h1>{selectedClass.title}</h1>
            <p>{selectedClass.mentor} membimbing kelas ini dengan materi praktik yang mudah diikuti dari dashboard belajar.</p>
            <div className="public-detail-meta">
              <span>{selectedClass.lessons}</span>
              <span>{selectedClass.price ? formatRupiah(selectedClass.price) : 'Gratis'}</span>
              <span>{selectedClass.status}</span>
            </div>
          </div>
        </article>
        <div className="public-sticky-actions">
          <button className="btn btn-secondary" type="button">
            <Icon name="cart" />
            Keranjang
          </button>
          <button className="btn btn-primary" type="button" onClick={() => onRequestClassCheckout(selectedClass.id)}>
            <Icon name="wallet" />
            Beli
          </button>
        </div>
      </section>
    )
  }

  if (selectedProduct) {
    return (
      <section className="public-detail-page">
        <div className="public-detail-topbar">
          <button className="icon-action-button" type="button" onClick={closePublicDetail}>
            <Icon name="arrowLeft" />
          </button>
          <button
            className="icon-action-button"
            type="button"
            onClick={() => shareItem(selectedProduct.title, selectedProduct.description)}
          >
            <Icon name="share" />
          </button>
        </div>
        <article className="public-detail-hero public-product-detail">
          <div className="public-detail-image">
            {selectedProduct.thumbnail ? <img src={selectedProduct.thumbnail} alt="" /> : <Icon name="download" />}
          </div>
          <div className="public-detail-copy">
            <p className="eyebrow">Produk digital</p>
            <h1>{selectedProduct.title}</h1>
            <p>{selectedProduct.description || 'Produk digital siap dikirim otomatis setelah pembayaran berhasil.'}</p>
            <div className="public-detail-meta">
              <span>{selectedProduct.fileName || 'Digital delivery'}</span>
              <span>{selectedProductPrice ? formatRupiah(selectedProductPrice) : 'Gratis'}</span>
              <span>Akses via email</span>
            </div>
          </div>
        </article>
        <div className="public-sticky-actions">
          <button className="btn btn-secondary" type="button">
            <Icon name="cart" />
            Keranjang
          </button>
          <button className="btn btn-primary" type="button" onClick={() => openProductCheckout(selectedProduct.id)}>
            <Icon name="wallet" />
            Beli
          </button>
        </div>
      </section>
    )
  }

  if (checkoutProduct) {
    return (
      <section className="public-detail-page public-checkout-page">
        <div className="public-detail-topbar">
          <button className="icon-action-button" type="button" onClick={() => openProductDetail(checkoutProduct.id)}>
            <Icon name="arrowLeft" />
          </button>
          <button
            className="icon-action-button"
            type="button"
            onClick={() => shareItem(checkoutProduct.title, checkoutProduct.description)}
          >
            <Icon name="share" />
          </button>
        </div>
        <form className="public-checkout-panel" onSubmit={submitPublicProductCheckout}>
          <div className="section-heading">
            <p className="eyebrow">Checkout produk</p>
            <h2>{checkoutProduct.title}</h2>
            <small>{selectedProductPrice ? formatRupiah(selectedProductPrice) : 'Gratis'}</small>
          </div>
          <div className="public-checkout-grid">
            <label>
              Nama
              <input name="buyerName" value={publicCheckoutForm.buyerName} onChange={handlePublicCheckoutChange} required />
            </label>
            <label>
              Email
              <input name="buyerEmail" type="email" value={publicCheckoutForm.buyerEmail} onChange={handlePublicCheckoutChange} required />
            </label>
            <label>
              Nomor HP
              <input name="buyerPhone" value={publicCheckoutForm.buyerPhone} onChange={handlePublicCheckoutChange} required />
            </label>
          </div>
          {!isPublicProductFree ? (
            <>
              <button
                className="btn btn-secondary public-payment-picker-toggle"
                type="button"
                onClick={() => setIsPaymentPickerOpen((current) => !current)}
              >
                Pilih Metode Pembayaran
                <Icon name="wallet" />
              </button>
              {isPaymentPickerOpen && (
                <div className="payment-method-grid public-payment-method-grid" aria-label="Daftar metode pembayaran">
                  {paymentMethods.map((method) => (
                    <button
                      className={`payment-method-option ${
                        publicCheckoutForm.paymentMethod === method.code ? 'selected' : ''
                      }`}
                      key={method.code}
                      type="button"
                      title={method.label}
                      aria-label={method.label}
                      aria-pressed={publicCheckoutForm.paymentMethod === method.code}
                      onClick={() =>
                        setPublicCheckoutForm((current) => ({
                          ...current,
                          paymentMethod: method.code,
                        }))
                      }
                    >
                      <PublicPaymentMethodLogo method={method} />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="public-checkout-free-note">Produk ini gratis. Isi data penerima, lalu ambil produk tanpa memilih metode pembayaran.</p>
          )}
          {!isPublicProductFree && publicCheckoutForm.paymentMethod && (
            <p className="public-checkout-status">
              Metode dipilih: {paymentMethods.find((method) => method.code === publicCheckoutForm.paymentMethod)?.label || publicCheckoutForm.paymentMethod}
            </p>
          )}
          <label className="public-checkout-check">
            <input
              type="checkbox"
              name="acceptedTerms"
              checked={publicCheckoutForm.acceptedTerms}
              onChange={handlePublicCheckoutChange}
            />
            <span>Saya menyetujui ketentuan penggunaan.</span>
          </label>
          <label className="public-checkout-check">
            <input
              type="checkbox"
              name="acceptedMarketing"
              checked={publicCheckoutForm.acceptedMarketing}
              onChange={handlePublicCheckoutChange}
            />
            <span>Saya setuju alamat email dan nomor telepon digunakan untuk menerima produk atau pesan pemasaran.</span>
          </label>
          {publicCheckoutStatus && <p className="public-checkout-status">{publicCheckoutStatus}</p>}
          <button
            className="btn btn-primary public-checkout-button"
            type="submit"
            disabled={(!isPublicProductFree && !publicCheckoutForm.paymentMethod) || !publicCheckoutForm.acceptedTerms || !publicCheckoutForm.acceptedMarketing}
          >
            {isPublicProductFree ? 'Ambil Produk' : 'Buat Pembayaran'}
            <Icon name="arrowRight" />
          </button>
        </form>
      </section>
    )
  }

  return (
    <>
      <section className="home-hero modern-hero image-hero" id="home" style={heroStyle}>
        <div className="home-hero__overlay modern-hero__overlay image-hero__overlay">
          <div className="home-hero__content modern-hero__content image-hero__content">
            <p className="eyebrow">{websiteSettings.hero.eyebrow}</p>
            <h1 className="hero-title-modern">{websiteSettings.hero.title}</h1>
            <p className="hero-copy">{websiteSettings.hero.description}</p>
            <div className="hero-actions">
              <button className="btn btn-primary" type="button" onClick={onLogin}>
                <Icon name="layoutDashboard" />
                {isLoggedIn
                  ? websiteSettings.hero.dashboardButton
                  : websiteSettings.hero.primaryButton}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => onExplore('courses')}
              >
                <Icon name="play" />
                {websiteSettings.hero.secondaryButton}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-band modern-stats" aria-label="Statistik kelas">
        {websiteSettings.stats.map((stat, index) => (
          <div key={`${stat.label}-${index}`}>
            <Icon name={stat.icon} />
            <strong>{index === 1 && classes.length ? Math.max(classes.length, Number(stat.value) || 0) : stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </section>

      {publicCourses.length > 0 && (
        <section className="content-section modern-section" id="courses">
          <div className="section-heading reveal-panel">
            <p className="eyebrow">{websiteSettings.courses.eyebrow}</p>
            <h2>{websiteSettings.courses.title}</h2>
          </div>
          <div className="course-grid">
            {publicCourses.map((course, index) => (
              <article
                className={`course-card homepage-course-card animated-card ${
                  course.highlighted ? 'homepage-card-highlighted' : ''
                }`}
                key={course.id || course.title}
              >
                <div className="homepage-course-visual">
                  {course.thumbnail ? (
                    <img src={course.thumbnail} alt="" />
                  ) : (
                    <Icon name={course.icon || 'bookOpen'} />
                  )}
                </div>
                <div className="homepage-course-body">
                  <h3>{course.title}</h3>
                  <span className="homepage-course-mentor">
                    <Icon name="user" />
                    {course.mentor}
                  </span>
                  <p>{course.description}</p>
                </div>
                <div className="course-meta">
                  <span>{course.level}</span>
                  <span>{course.price}</span>
                </div>
                {course.highlighted && <span className="homepage-card-badge">Highlight</span>}
                <button
                  className="btn btn-primary homepage-course-button"
                  type="button"
                  onClick={() => openClassDetail(course.id)}
                >
                  Detail Kelas
                  <Icon name="arrowRight" />
                </button>
                <i style={{ '--card-delay': `${index * 0.12}s` }}></i>
              </article>
            ))}
          </div>
        </section>
      )}

      {publicProducts.length > 0 && (
        <section className="content-section modern-section homepage-products-section" id="products">
          <div className="section-heading reveal-panel">
            <p className="eyebrow">Produk digital</p>
            <h2>Produk digital pilihan</h2>
          </div>
          <div className="course-grid homepage-product-grid">
            {publicProducts.map((product, index) => (
              <article
                className={`course-card homepage-course-card homepage-product-card animated-card ${
                  product.highlighted ? 'homepage-card-highlighted' : ''
                }`}
                key={product.id || product.title}
              >
                <div className="homepage-course-visual">
                  {product.thumbnail ? (
                    <img src={product.thumbnail} alt="" />
                  ) : (
                    <Icon name="download" />
                  )}
                </div>
                <div className="homepage-course-body">
                  <h3>{product.title}</h3>
                  <span className="homepage-course-mentor">
                    <Icon name="download" />
                    {product.fileName}
                  </span>
                  <p>{product.description}</p>
                </div>
                <div className="course-meta">
                  <span>Produk digital</span>
                  <span>{product.price}</span>
                </div>
                {product.highlighted && <span className="homepage-card-badge">Highlight</span>}
                <button
                  className="btn btn-primary homepage-course-button"
                  type="button"
                  onClick={() => openProductDetail(product.id)}
                >
                  Detail Produk
                  <Icon name="arrowRight" />
                </button>
                <i style={{ '--card-delay': `${index * 0.12}s` }}></i>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="content-section split-section modern-section" id="benefits">
        <div className="section-heading reveal-panel">
          <p className="eyebrow">{websiteSettings.benefits.eyebrow}</p>
          <h2>{websiteSettings.benefits.title}</h2>
        </div>
        <div className="benefit-list">
          {(websiteSettings.benefits.items.length
            ? websiteSettings.benefits.items
            : benefits
          ).map((benefit) => (
            <article className="benefit-item animated-card" key={benefit.title}>
              <Icon name={benefit.icon} />
              <div>
                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="content-section schedule-section modern-section" id="schedule">
        <div className="schedule-copy reveal-panel">
          <p className="eyebrow">{websiteSettings.schedule.eyebrow}</p>
          <h2>{websiteSettings.schedule.title}</h2>
          <p>{websiteSettings.schedule.description}</p>
        </div>
        <article className="schedule-board animated-card">
          {websiteSettings.schedule.steps.map((step, index) => (
            <div key={`${step.title}-${index}`}>
              <Icon name={step.icon} />
              <span>{step.label}</span>
              <strong>{step.title}</strong>
            </div>
          ))}
          <button className="btn btn-primary" type="button" onClick={onLogin}>
            <Icon name="layoutDashboard" />
            {isLoggedIn
              ? websiteSettings.schedule.dashboardButton
              : websiteSettings.schedule.loginButton}
          </button>
        </article>
      </section>
    </>
  )
}

export default HomePage
