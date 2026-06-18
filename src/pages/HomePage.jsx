import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { cleanWebsiteSettings, defaultWebsiteSettings } from '../data/websiteSettings'
import { withPublicCodes } from '../utils/publicCodes'
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

function notifyRouteChange() {
  window.dispatchEvent(new Event('ibnucreative-route-change'))
}

function plainTextFromHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
  onRequestClassCheckout = () => {},
  onPublicProductCheckout = async () => {},
  publicProductAccessApiPath = '/api/public-product-access',
  initialDetail = null,
  checkoutCustomer = null,
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
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('Semua')

  const homepageClasses = withPublicCodes(classes.filter(
    (course) => course.status === 'Aktif' && course.showOnHomepage !== false,
  ))
  const detailProducts = withPublicCodes(digitalProducts.filter((product) => product.status === 'Aktif'))
  const homepageProducts = detailProducts.filter((product) => product.showOnHomepage !== false)

  const getItemMockMetrics = (itemId) => {
    let code = 0
    const idStr = String(itemId || '')
    for (let i = 0; i < idStr.length; i++) {
      code += idStr.charCodeAt(i)
    }
    const rating = (4.7 + (code % 4) * 0.1).toFixed(1)
    const sales = 100 + (code % 89) * 9 + (code % 3)
    return { rating, sales }
  }

  const resolveRating = (item, fallbackRating) => {
    const rating = Number(item.rating)

    return item.rating === '' || item.rating === null || item.rating === undefined || Number.isNaN(rating)
      ? fallbackRating
      : Math.min(5, Math.max(0, rating)).toFixed(1)
  }

  const resolveCount = (value, fallbackCount) => {
    const count = Number(value)

    return value === '' || value === null || value === undefined || Number.isNaN(count)
      ? fallbackCount
      : Math.max(0, Math.round(count))
  }

  const catalogItems = [
    ...homepageClasses.map((course) => {
      const fallbackMetrics = getItemMockMetrics(course.id)
      const currentPrice = course.price ? formatRupiah(course.price) : 'Gratis'
      const originalPrice = course.price 
        ? formatRupiah(Math.round(course.price * 1.6 / 1000) * 1000)
        : null
      return {
        id: course.id,
        type: 'kelas',
        publicCode: course.publicCode,
        title: course.title,
        thumbnail: course.thumbnail,
        price: currentPrice,
        originalPrice,
        category: 'Kelas',
        description: plainTextFromHtml(course.description) || `${course.mentor} membimbing kelas ini dengan materi praktik yang mudah diikuti dari dashboard belajar.`,
        lessons: course.lessons,
        rating: resolveRating(course, fallbackMetrics.rating),
        sales: resolveCount(course.displayStudents, course.students || fallbackMetrics.sales),
        highlighted: course.highlighted === true,
      }
    }),
    ...homepageProducts.map((product) => {
      const fallbackMetrics = getItemMockMetrics(product.id)
      const salePrice = Math.max(0, Math.round(Number(product.salePrice) || 0))
      const normalPrice = Math.max(0, Math.round(Number(product.price) || 0))
      const currentPriceVal = salePrice || normalPrice
      const price = currentPriceVal ? formatRupiah(currentPriceVal) : 'Gratis'
      const originalPrice = (salePrice && normalPrice > salePrice)
        ? formatRupiah(normalPrice)
        : null
      return {
        id: product.id,
        type: 'produk',
        publicCode: product.publicCode,
        title: product.title,
        thumbnail: product.thumbnail,
        price,
        originalPrice,
        category: 'Produk Digital',
        description: plainTextFromHtml(product.description) || 'Produk digital siap diakses otomatis setelah pembayaran berhasil.',
        fileName: product.fileName || product.platformType || 'Produk digital',
        rating: resolveRating(product, fallbackMetrics.rating),
        sales: resolveCount(product.displaySales, fallbackMetrics.sales),
        highlighted: product.highlighted === true,
      }
    })
  ].sort((first, second) => Number(second.highlighted) - Number(first.highlighted))

  const filteredCatalogItems = catalogItems.filter((item) => {
    const matchesSearch =
      (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory =
      activeCategory === 'Semua' || item.category === activeCategory

    return matchesSearch && matchesCategory
  })

  const selectedClass = homepageClasses.find((course) => course.id === selectedClassId || course.publicCode === selectedClassId)
  const approvedTestimonials = testimonials.filter((testimonial) => testimonial.status === 'approved')
  const activeTestimonial = approvedTestimonials.length
    ? approvedTestimonials[testimonialIndex % approvedTestimonials.length]
    : null
  const selectedProduct = detailProducts.find((product) => product.id === selectedProductId || product.publicCode === selectedProductId)
  const checkoutProduct = detailProducts.find((product) => product.id === checkoutProductId || product.publicCode === checkoutProductId)
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
  const isMemberCheckout = checkoutCustomer?.isMember === true
  const memberCheckoutPhone = checkoutCustomer?.phone || ''
  const memberNeedsCheckoutPhone = isMemberCheckout && !memberCheckoutPhone

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
    window.history.pushState(
      { publicDetailFromApp: true },
      '',
      `/kelas/${encodeURIComponent(course?.publicCode || classId)}`,
    )
    notifyRouteChange()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openProductDetail = (productId) => {
    const product = detailProducts.find((item) => item.id === productId || item.publicCode === productId)

    setSelectedProductId(productId)
    setSelectedClassId('')
    setCheckoutProductId('')
    setIsPaymentPickerOpen(false)
    window.history.pushState(
      { publicDetailFromApp: true },
      '',
      `/produk/${encodeURIComponent(product?.publicCode || productId)}`,
    )
    notifyRouteChange()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closePublicDetail = () => {
    if (window.history.state?.publicDetailFromApp && window.history.length > 1) {
      window.history.back()
      return
    }

    if (window.history.state?.returnToMemberProducts) {
      setSelectedClassId('')
      setSelectedProductId('')
      setCheckoutProductId('')
      setAccessOrderCode('')
      setProductAccessState({ isLoading: false, data: null, error: '' })
      setIsWishlistOpen(false)
      setIsPaymentPickerOpen(false)
      window.history.pushState({}, '', '/member?menu=digital-products')
      window.dispatchEvent(new PopStateEvent('popstate'))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

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
    setIsWishlistOpen(true)
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
    setIsWishlistOpen(false)

    if (item.type === 'kelas') {
      openClassDetail(item.publicCode || item.id)
      return
    }

    openProductDetail(item.publicCode || item.id)
  }

  const openProductCheckout = (productId) => {
    const product = detailProducts.find((item) => item.id === productId || item.publicCode === productId)

    setCheckoutProductId(productId)
    setSelectedProductId('')
    setIsPaymentPickerOpen(false)
    window.history.pushState(
      { publicDetailFromApp: true },
      '',
      `/produk/${encodeURIComponent(product?.publicCode || productId)}/checkout`,
    )
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
        buyerName: isMemberCheckout
          ? checkoutCustomer?.name || publicCheckoutForm.buyerName || 'Member'
          : publicCheckoutForm.buyerName,
        buyerEmail: isMemberCheckout
          ? checkoutCustomer?.email || publicCheckoutForm.buyerEmail
          : publicCheckoutForm.buyerEmail,
        buyerPhone: isMemberCheckout
          ? memberCheckoutPhone || publicCheckoutForm.buyerPhone
          : publicCheckoutForm.buyerPhone,
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

  const selectPublicPaymentMethod = (paymentMethod) => {
    setPublicCheckoutForm((current) => ({
      ...current,
      paymentMethod,
    }))
  }

  const wishlistPopup = isWishlistOpen ? (
    <div
      className="public-wishlist-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setIsWishlistOpen(false)
        }
      }}
    >
      <article
        className="public-checkout-panel public-wishlist-panel public-wishlist-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-wishlist-title"
      >
        <div className="public-wishlist-modal-header">
          <div className="section-heading">
            <p className="eyebrow">Wishlist</p>
            <h2 id="public-wishlist-title">Keranjang pilihan</h2>
            <small>{wishlistCount} item tersimpan di browser pengunjung.</small>
          </div>
          <button
            className="icon-action-button"
            type="button"
            aria-label="Tutup keranjang"
            onClick={() => setIsWishlistOpen(false)}
          >
            <Icon name="x" />
          </button>
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
    </div>
  ) : null

  if (selectedClass) {
    return (
      <>
        <DetailKelas
          course={selectedClass}
          wishlistCount={wishlistCount}
          onBack={closePublicDetail}
          onBuy={onRequestClassCheckout}
          onAddToWishlist={() => addWishlistItem(selectedClass, 'kelas')}
          onOpenWishlist={openWishlist}
          onShare={shareItem}
          settings={websiteSettings}
        />
        {wishlistPopup}
      </>
    )
  }

  if (accessOrderCode) {
    return (
      <>
        <ProductAccessPage
          accessState={productAccessState}
          onBack={closePublicDetail}
          onRetry={() => {
            setProductAccessState((current) => ({ ...current, isLoading: true, error: '' }))
            setAccessRefreshKey((current) => current + 1)
          }}
        />
        {wishlistPopup}
      </>
    )
  }

  if (selectedProduct) {
    return (
      <>
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
        {wishlistPopup}
      </>
    )
  }

  if (checkoutProduct) {
    return (
      <>
        <CheckoutProduk
          product={checkoutProduct}
          form={publicCheckoutForm}
          checkoutCustomer={checkoutCustomer}
          isMemberCheckout={isMemberCheckout}
          memberNeedsPhone={memberNeedsCheckoutPhone}
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
        {wishlistPopup}
      </>
    )
  }

  return (
    <>
      <div id="courses" style={{ scrollMarginTop: '80px' }}></div>
      <div id="products" style={{ scrollMarginTop: '80px' }}></div>
      <section className="content-section modern-section catalog-section" id="catalog">
        <div className="section-heading reveal-panel centered">
          <p className="eyebrow">ASET DIGITAL & KELAS PREMIUM</p>
          <h2>Katalog Produk Pilihan</h2>
          <p className="section-subheading">Temukan tools, course, template, dan source code premium untuk melipatgandakan omset bisnis Anda.</p>
        </div>

        {/* Search Bar */}
        <div className="catalog-search-bar">
          <div className="search-input-wrapper">
            <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Cari aset digital, kelas, ebook..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search" onClick={() => setSearchQuery('')} aria-label="Hapus pencarian">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Category Tabs */}
        <div className="category-tabs-track">
          {['Semua', 'Kelas', 'Produk Digital'].map((cat) => {
            const count = cat === 'Semua'
              ? catalogItems.length
              : catalogItems.filter(item => item.category === cat).length
            return (
              <button
                key={cat}
                className={`category-tab-btn ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(cat)
                  const catalogElement = document.getElementById('catalog')
                  if (catalogElement) {
                    catalogElement.scrollIntoView({ behavior: 'smooth' })
                  }
                }}
              >
                {cat}
                <span className="tab-count">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Catalog Grid */}
        <div className="catalog-grid">
          {filteredCatalogItems.map((item, index) => (
            <article
              className={`catalog-card animated-card ${item.highlighted ? 'highlighted' : ''}`}
              key={`${item.type}-${item.id}`}
              style={{ '--card-delay': `${index * 0.08}s` }}
            >
              <div className="card-media">
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt={item.title} loading="lazy" />
                ) : (
                  <div className="media-placeholder">
                    <Icon name={item.type === 'kelas' ? 'bookOpen' : 'download'} />
                  </div>
                )}
                <span className={`card-badge badge-${item.category.toLowerCase().replace(/\s+/g, '-')}`}>
                  {item.category}
                </span>
              </div>
              <div className="card-content">
                <div className="card-rating-row">
                  <span className="rating-stars">
                    <svg className="star-icon-filled" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fbbc05" stroke="#fbbc05" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }}>
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                    {item.rating}
                  </span>
                  <span className="sales-count">
                    {item.sales} {item.type === 'kelas' ? 'peserta' : 'terjual'}
                  </span>
                </div>
                <h3 className="card-title">{item.title}</h3>
                <p className="card-desc">{item.description}</p>
                <div className="card-footer-info">
                  <span className="info-label">
                    <Icon name={item.type === 'kelas' ? 'user' : 'download'} />
                    {item.type === 'kelas' ? `${item.sales} peserta` : item.fileName}
                  </span>
                </div>
              </div>
              <div className="card-price-action">
                <div className="price-box">
                  {item.originalPrice && (
                    <span className="original-price">{item.originalPrice}</span>
                  )}
                  <span className="current-price">{item.price}</span>
                </div>
                <button
                  className="btn btn-primary card-action-btn"
                  type="button"
                  onClick={() => item.type === 'kelas' ? openClassDetail(item.id) : openProductDetail(item.id)}
                >
                  Detail
                  <Icon name="arrowRight" />
                </button>
              </div>
            </article>
          ))}
          {filteredCatalogItems.length === 0 && (
            <div className="catalog-empty-state">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="48" height="48" style={{ marginBottom: '16px', opacity: 0.5 }}>
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <h3>Produk Tidak Ditemukan</h3>
              <p>Coba gunakan kata kunci pencarian lain atau pilih kategori yang berbeda.</p>
            </div>
          )}
        </div>
      </section>

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
      )}    </>
  )
}

export default HomePage
