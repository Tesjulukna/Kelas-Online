import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { benefits, courseHighlights } from '../data/platformData'
import { cleanWebsiteSettings, defaultWebsiteSettings } from '../data/websiteSettings'
import CheckoutProduk from './detail/CheckoutProduk'
import DetailKelas from './detail/DetailKelas'
import DetailProduk from './detail/DetailProduk'
import ProductAccessPage from './detail/ProductAccessPage'

function formatRupiah(value) {
  const amount = Math.max(0, Math.round(Number(value) || 0))

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function getPaymentMethodFee(method, amount) {
  if (!method) {
    return 0
  }

  const flatFee = Math.max(0, Math.round(Number(method.feeFlat) || 0))
  const percentFee = Math.max(0, Number(method.feePercent) || 0)

  return flatFee + Math.max(0, Math.round((Math.max(0, amount) * percentFee) / 100))
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

function notifyRouteChange() {
  window.dispatchEvent(new Event('ibnucreative-route-change'))
}

const publicWishlistKey = 'ibnucreative.public-wishlist.v1'

function readPublicWishlist() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const saved = JSON.parse(window.localStorage.getItem(publicWishlistKey) || '[]')

    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function writePublicWishlist(items) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(publicWishlistKey, JSON.stringify(items))
}

function HomePage({
  isLoggedIn,
  onLogin,
  onExplore,
  onRequestClassCheckout = () => {},
  onPublicProductCheckout = async () => {},
  publicProductAccessApiPath = '/api/public-product-access',
  initialDetail = null,
  classes = [],
  digitalProducts = [],
  testimonials = [],
  settings = defaultWebsiteSettings,
}) {
  const websiteSettings = cleanWebsiteSettings(settings)
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [checkoutProductId, setCheckoutProductId] = useState('')
  const [isPaymentPickerOpen, setIsPaymentPickerOpen] = useState(false)
  const [isWishlistOpen, setIsWishlistOpen] = useState(false)
  const [wishlistItems, setWishlistItems] = useState(() => readPublicWishlist())
  const [accessOrderCode, setAccessOrderCode] = useState('')
  const [accessRefreshKey, setAccessRefreshKey] = useState(0)
  const [productAccessState, setProductAccessState] = useState({
    isLoading: false,
    data: null,
    error: '',
  })
  const [testimonialIndex, setTestimonialIndex] = useState(0)
  const [publicCheckoutForm, setPublicCheckoutForm] = useState({
    buyerName: '',
    buyerEmail: '',
    buyerPhone: '',
    paymentMethod: '',
    acceptedTerms: false,
    acceptedMarketing: false,
    customAnswers: {},
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
        blockLayout: product.blockLayout || 'default',
        description: product.description || 'Produk digital siap diakses otomatis setelah pembayaran berhasil.',
      }
    })
  const selectedClass = homepageClasses.find((course) => course.id === selectedClassId || course.publicCode === selectedClassId)
  const approvedTestimonials = testimonials.filter((testimonial) => testimonial.status === 'approved')
  const activeTestimonial = approvedTestimonials.length
    ? approvedTestimonials[testimonialIndex % approvedTestimonials.length]
    : null
  const selectedProduct = homepageProducts.find((product) => product.id === selectedProductId || product.publicCode === selectedProductId)
  const checkoutProduct = homepageProducts.find((product) => product.id === checkoutProductId || product.publicCode === checkoutProductId)
  const activeCheckoutProduct = checkoutProduct || selectedProduct
  const selectedProductSalePrice = Math.max(0, Math.round(Number(activeCheckoutProduct?.salePrice) || 0))
  const selectedProductNormalPrice = Math.max(0, Math.round(Number(activeCheckoutProduct?.price) || 0))
  const selectedProductPrice = selectedProductSalePrice || selectedProductNormalPrice
  const isPublicProductFree = selectedProductPrice <= 0
  const paymentMethods = websiteSettings.paymentMethods || []
  const selectedPublicPaymentMethod = paymentMethods.find(
    (method) => method.code === publicCheckoutForm.paymentMethod,
  )
  const publicCheckoutFee = getPaymentMethodFee(selectedPublicPaymentMethod, selectedProductPrice)
  const publicCheckoutTotal = selectedProductPrice + publicCheckoutFee
  const initialDetailType = initialDetail?.type || ''
  const initialDetailId = initialDetail?.id || ''
  const initialDetailAction = initialDetail?.action || ''
  const wishlistCount = wishlistItems.length

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!initialDetailId) {
        setSelectedClassId('')
        setSelectedProductId('')
        setCheckoutProductId('')
        setAccessOrderCode('')
        setProductAccessState({ isLoading: false, data: null, error: '' })
        setIsPaymentPickerOpen(false)
        return
      }

      if (initialDetailType === 'produk-akses') {
        setProductAccessState({ isLoading: true, data: null, error: '' })
        setAccessOrderCode(initialDetailId)
        setSelectedClassId('')
        setSelectedProductId('')
        setCheckoutProductId('')
        setIsWishlistOpen(false)
        setIsPaymentPickerOpen(false)
        return
      }

      if (initialDetailType === 'kelas') {
        setSelectedClassId(initialDetailId)
        setSelectedProductId('')
        setCheckoutProductId('')
        setAccessOrderCode('')
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
        setAccessOrderCode('')
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
        notifyRouteChange()
      }
    }

    if (selectedProduct?.publicCode && window.location.pathname.startsWith('/produk/')) {
      const nextPath = `/produk/${encodeURIComponent(selectedProduct.publicCode)}`

      if (window.location.pathname !== nextPath) {
        window.history.replaceState({}, '', nextPath)
        notifyRouteChange()
      }
    }

    if (checkoutProduct?.publicCode && window.location.pathname.startsWith('/produk/')) {
      const nextPath = `/produk/${encodeURIComponent(checkoutProduct.publicCode)}/checkout`

      if (window.location.pathname !== nextPath) {
        window.history.replaceState({}, '', nextPath)
        notifyRouteChange()
      }
    }
  }, [checkoutProduct?.publicCode, selectedClass?.publicCode, selectedProduct?.publicCode])

  useEffect(() => {
    writePublicWishlist(wishlistItems)
  }, [wishlistItems])

  useEffect(() => {
    if (approvedTestimonials.length <= 1) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setTestimonialIndex((current) => (current + 1) % approvedTestimonials.length)
    }, 5200)

    return () => window.clearInterval(timer)
  }, [approvedTestimonials.length])

  useEffect(() => {
    if (!accessOrderCode) {
      return undefined
    }

    let isCurrent = true
    fetch(`${publicProductAccessApiPath}?order=${encodeURIComponent(accessOrderCode)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.message || 'Akses produk belum bisa dibuka.')
        }

        return data
      })
      .then((data) => {
        if (isCurrent) {
          setProductAccessState({ isLoading: false, data, error: '' })
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setProductAccessState({
            isLoading: false,
            data: null,
            error: error.message || 'Akses produk belum bisa dibuka.',
          })
        }
      })

    return () => {
      isCurrent = false
    }
  }, [accessOrderCode, accessRefreshKey, publicProductAccessApiPath])

  const openClassDetail = (classId) => {
    const course = homepageClasses.find((item) => item.id === classId || item.publicCode === classId)

    setSelectedClassId(classId)
    setSelectedProductId('')
    setCheckoutProductId('')
    window.history.pushState({}, '', `/kelas/${encodeURIComponent(course?.publicCode || classId)}`)
    notifyRouteChange()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openProductDetail = (productId) => {
    const product = homepageProducts.find((item) => item.id === productId || item.publicCode === productId)

    setSelectedProductId(productId)
    setSelectedClassId('')
    setCheckoutProductId('')
    setIsPaymentPickerOpen(false)
    window.history.pushState({}, '', `/produk/${encodeURIComponent(product?.publicCode || productId)}`)
    notifyRouteChange()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closePublicDetail = () => {
    setSelectedClassId('')
    setSelectedProductId('')
    setCheckoutProductId('')
    setAccessOrderCode('')
    setProductAccessState({ isLoading: false, data: null, error: '' })
    setIsWishlistOpen(false)
    setIsPaymentPickerOpen(false)
    window.history.pushState({}, '', '/')
    notifyRouteChange()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openWishlist = () => {
    setSelectedClassId('')
    setSelectedProductId('')
    setCheckoutProductId('')
    setAccessOrderCode('')
    setIsWishlistOpen(true)
    setIsPaymentPickerOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const addWishlistItem = (item, type) => {
    const isClass = type === 'kelas'
    const normalPrice = Math.max(0, Math.round(Number(item.price) || 0))
    const salePrice = Math.max(0, Math.round(Number(item.salePrice) || 0))
    const price = isClass ? normalPrice : salePrice || normalPrice
    const nextItem = {
      id: item.id,
      publicCode: item.publicCode,
      type,
      title: item.title,
      thumbnail: item.thumbnail || '',
      label: isClass ? 'Kelas' : 'Produk digital',
      priceLabel: price ? formatRupiah(price) : 'Gratis',
    }

    setWishlistItems((current) => {
      const key = `${type}:${item.id}`
      const exists = current.some((wishlistItem) => `${wishlistItem.type}:${wishlistItem.id}` === key)

      return exists ? current : [nextItem, ...current].slice(0, 40)
    })
  }

  const removeWishlistItem = (item) => {
    setWishlistItems((current) =>
      current.filter((wishlistItem) => `${wishlistItem.type}:${wishlistItem.id}` !== `${item.type}:${item.id}`),
    )
  }

  const openWishlistItem = (item) => {
    if (item.type === 'kelas') {
      openClassDetail(item.publicCode || item.id)
      return
    }

    openProductDetail(item.publicCode || item.id)
  }

  const openProductCheckout = (productId) => {
    const product = homepageProducts.find((item) => item.id === productId || item.publicCode === productId)

    setCheckoutProductId(productId)
    setSelectedProductId('')
    setIsPaymentPickerOpen(false)
    window.history.pushState({}, '', `/produk/${encodeURIComponent(product?.publicCode || productId)}/checkout`)
    notifyRouteChange()
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

  const handlePublicCheckoutAnswerChange = (questionId, value) => {
    setPublicCheckoutForm((current) => ({
      ...current,
      customAnswers: {
        ...(current.customAnswers || {}),
        [questionId]: value,
      },
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
      } else if (data?.accessUrl) {
        window.location.assign(data.accessUrl)
      } else {
        setPublicCheckoutStatus(data?.message || 'Produk berhasil diproses.')
      }
    } catch (error) {
      setPublicCheckoutStatus(error.message || 'Checkout produk belum bisa dibuat.')
    }
  }

  if (selectedClass) {
    return (
      <DetailKelas
        course={selectedClass}
        wishlistCount={wishlistCount}
        onBack={closePublicDetail}
        onBuy={onRequestClassCheckout}
        onAddToWishlist={() => addWishlistItem(selectedClass, 'kelas')}
        onOpenWishlist={openWishlist}
        onShare={shareItem}
      />
    )
  }

  const selectPublicPaymentMethod = (paymentMethod) => {
    setPublicCheckoutForm((current) => ({
      ...current,
      paymentMethod,
    }))
  }

  if (accessOrderCode) {
    return (
      <ProductAccessPage
        accessState={productAccessState}
        onBack={closePublicDetail}
        onRetry={() => {
          setProductAccessState((current) => ({ ...current, isLoading: true, error: '' }))
          setAccessRefreshKey((current) => current + 1)
        }}
      />
    )
  }

  if (isWishlistOpen) {
    return (
      <section className="public-detail-page public-wishlist-page">
        <div className="public-detail-topbar">
          <button className="icon-action-button" type="button" onClick={closePublicDetail}>
            <Icon name="arrowLeft" />
          </button>
        </div>
        <article className="public-checkout-panel public-wishlist-panel">
          <div className="section-heading">
            <p className="eyebrow">Wishlist</p>
            <h2>Keranjang pilihan</h2>
            <small>{wishlistCount} item tersimpan di browser pengunjung.</small>
          </div>
          <div className="public-wishlist-list">
            {wishlistItems.map((item) => (
              <article className="public-wishlist-item" key={`${item.type}:${item.id}`}>
                <span className="public-wishlist-image">
                  {item.thumbnail ? <img src={item.thumbnail} alt="" /> : <Icon name={item.type === 'kelas' ? 'bookOpen' : 'download'} />}
                </span>
                <div>
                  <small>{item.label}</small>
                  <strong>{item.title}</strong>
                  <span>{item.priceLabel}</span>
                </div>
                <button className="btn btn-secondary" type="button" onClick={() => openWishlistItem(item)}>
                  Detail
                </button>
                <button className="icon-action-button" type="button" onClick={() => removeWishlistItem(item)}>
                  <Icon name="x" />
                </button>
              </article>
            ))}
            {!wishlistItems.length && (
              <div className="public-access-message">
                <Icon name="cart" />
                <h3>Belum ada wishlist</h3>
                <p>Tambahkan kelas atau produk dari halaman detail.</p>
              </div>
            )}
          </div>
        </article>
      </section>
    )
  }

  if (selectedProduct) {
    return (
      <DetailProduk
        product={selectedProduct}
        priceLabel={selectedProductPrice ? formatRupiah(selectedProductPrice) : 'Gratis'}
        wishlistCount={wishlistCount}
        onBack={closePublicDetail}
        onAddToWishlist={() => addWishlistItem(selectedProduct, 'produk')}
        onBuy={openProductCheckout}
        onOpenWishlist={openWishlist}
        onShare={shareItem}
      />
    )
  }

  if (checkoutProduct) {
    return (
      <CheckoutProduk
        product={checkoutProduct}
        form={publicCheckoutForm}
        isFree={isPublicProductFree}
        isPaymentPickerOpen={isPaymentPickerOpen}
        paymentMethods={paymentMethods}
        paymentAmount={selectedProductPrice}
        paymentFee={publicCheckoutFee}
        paymentTotal={publicCheckoutTotal}
        priceLabel={selectedProductPrice ? formatRupiah(selectedProductPrice) : 'Gratis'}
        status={publicCheckoutStatus}
        onBack={() => openProductDetail(checkoutProduct.id)}
        onChange={handlePublicCheckoutChange}
        onAnswerChange={handlePublicCheckoutAnswerChange}
        onPaymentPickerToggle={() => setIsPaymentPickerOpen((current) => !current)}
        onPaymentMethodSelect={selectPublicPaymentMethod}
        onShare={shareItem}
        onSubmit={submitPublicProductCheckout}
      />
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
                className={`course-card homepage-course-card homepage-product-card product-layout-${product.blockLayout || 'default'} animated-card ${
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

      {activeTestimonial && (
        <section className="content-section modern-section homepage-testimonials-section" id="testimonials">
          <div className="section-heading reveal-panel">
            <p className="eyebrow">Testimoni peserta</p>
            <h2>Cerita setelah menyelesaikan kelas</h2>
          </div>
          <article className="testimonial-comment-card" key={activeTestimonial.id}>
            <span className="testimonial-avatar" aria-hidden="true">
              {activeTestimonial.memberAvatar ? (
                <img src={activeTestimonial.memberAvatar} alt="" />
              ) : (
                <Icon name="user" />
              )}
            </span>
            <div className="testimonial-comment-body">
              <div className="testimonial-comment-heading">
                <strong>{activeTestimonial.memberName}</strong>
                <small>{activeTestimonial.classTitle}</small>
              </div>
              <p>{activeTestimonial.message}</p>
              <div className="testimonial-dots" aria-label="Navigasi testimoni">
                {approvedTestimonials.map((testimonial, index) => (
                  <button
                    className={testimonial.id === activeTestimonial.id ? 'active' : ''}
                    type="button"
                    key={testimonial.id}
                    aria-label={`Lihat testimoni ${index + 1}`}
                    onClick={() => setTestimonialIndex(index)}
                  />
                ))}
              </div>
            </div>
          </article>
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
