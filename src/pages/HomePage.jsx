import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { cleanWebsiteSettings, defaultWebsiteSettings } from '../data/websiteSettings'
import { withPublicCodes } from '../utils/publicCodes'
import CheckoutProduk from './detail/CheckoutProduk'
import DetailKelas from './detail/DetailKelas'
import DetailProduk from './detail/DetailProduk'
import ProductAccessPage from './detail/ProductAccessPage'

function CatalogCardMedia({ item }) {
  const [isSquare, setIsSquare] = useState(false)

  const handleLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target
    if (naturalWidth && naturalHeight) {
      const ratio = naturalWidth / naturalHeight
      if (Math.abs(ratio - 1) < 0.15) {
        setIsSquare(true)
      }
    }
  }

  return (
    <div className={`card-media ${isSquare ? 'is-square' : ''}`}>
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt={item.title}
          loading="lazy"
          onLoad={handleLoad}
        />
      ) : (
        <div className="media-placeholder">
          <Icon name={item.type === 'kelas' ? 'bookOpen' : 'download'} />
        </div>
      )}
      <span className={`card-badge badge-${item.category.toLowerCase().replace(/\s+/g, '-')}`}>
        {item.category}
      </span>
    </div>
  )
}

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

function formatIndonesianDate(value) {
  if (!value) {
    return 'Tanggal belum tersedia'
  }

  const matches = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (matches) {
    const year = matches[1]
    const monthIndex = parseInt(matches[2], 10) - 1
    const day = parseInt(matches[3], 10)
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ]
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${day} ${months[monthIndex]} ${year}`
    }
  }

  const time = Date.parse(value)
  if (!time) {
    return 'Tanggal belum tersedia'
  }

  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(time))
  } catch {
    return 'Tanggal belum tersedia'
  }
}

function getActivityTime(value, prefix) {
  const dateText = formatIndonesianDate(value)

  return dateText === 'Tanggal belum tersedia' ? dateText : `${prefix} ${dateText}`
}

function shuffleItems(items) {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[randomIndex]
    shuffled[randomIndex] = current
  }

  return shuffled
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

function getInitialDetailState(initialDetail) {
  const type = initialDetail?.type || ''
  const id = initialDetail?.id || ''
  const action = initialDetail?.action || ''

  return {
    selectedClassId: type === 'kelas' ? id : '',
    selectedProductId: type === 'produk' && action !== 'checkout' ? id : '',
    checkoutProductId: type === 'produk' && action === 'checkout' ? id : '',
    accessOrderCode: type === 'produk-akses' ? id : '',
  }
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
  members = [],
  payments = [],
  digitalProductAccess = [],
  publicActivities = [],
}) {
  const websiteSettings = cleanWebsiteSettings(settings)
  const initialState = getInitialDetailState(initialDetail)
  const [selectedClassId, setSelectedClassId] = useState(initialState.selectedClassId)
  const [selectedProductId, setSelectedProductId] = useState(initialState.selectedProductId)
  const [checkoutProductId, setCheckoutProductId] = useState(initialState.checkoutProductId)
  const [isPaymentPickerOpen, setIsPaymentPickerOpen] = useState(false)
  const [isWishlistOpen, setIsWishlistOpen] = useState(false)
  const [wishlistItems, setWishlistItems] = useState(() => readPublicWishlist())
  const [accessOrderCode, setAccessOrderCode] = useState(initialState.accessOrderCode)
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

  const [activeNotification, setActiveNotification] = useState(null)
  const [showNotification, setShowNotification] = useState(false)
  const notificationSettingsSignature = JSON.stringify(websiteSettings.homepageNotifications || {})

  const classesRef = useRef(classes)
  const productsRef = useRef(digitalProducts)
  const membersRef = useRef(members)
  const paymentsRef = useRef(payments)
  const productAccessRef = useRef(digitalProductAccess)
  const publicActivitiesRef = useRef(publicActivities)

  useEffect(() => {
    classesRef.current = classes
    productsRef.current = digitalProducts
    membersRef.current = members
    paymentsRef.current = payments
    productAccessRef.current = digitalProductAccess
    publicActivitiesRef.current = publicActivities
  }, [classes, digitalProducts, members, payments, digitalProductAccess, publicActivities])

  useEffect(() => {
    let currentIndex = 0
    let hideTimer = null
    let intervalTimer = null

    const getRandomPastDate = (daysAgoMax = 30) => {
      const date = new Date()
      const daysAgo = Math.floor(Math.random() * daysAgoMax) + 1
      date.setDate(date.getDate() - daysAgo)
      return date.toISOString().slice(0, 10)
    }

    const showNextNotification = () => {
      const currentClasses = classesRef.current || []
      const currentProducts = productsRef.current || []
      const currentMembers = membersRef.current || []
      const currentPayments = paymentsRef.current || []
      const currentProductAccess = productAccessRef.current || []
      const currentPublicActivities = publicActivitiesRef.current || []
      const notificationSettings = JSON.parse(notificationSettingsSignature)

      if (notificationSettings.enabled === false) {
        setActiveNotification(null)
        setShowNotification(false)
        return
      }

      const visibleClasses = currentClasses.filter((c) => c.status === 'Aktif')
      const visibleProducts = currentProducts.filter((p) => p.status === 'Aktif')

      if (visibleClasses.length === 0 && visibleProducts.length === 0 && currentPublicActivities.length === 0) {
        intervalTimer = setTimeout(showNextNotification, 3000)
        return
      }

      const membersById = new Map(currentMembers.map((member) => [member.id, member]))
      const membersByEmail = new Map(
        currentMembers
          .filter((member) => member.email)
          .map((member) => [String(member.email).toLowerCase(), member]),
      )
      const realActivities = []

      currentPayments
        .filter((payment) => {
          const status = String(payment.status || '').toLowerCase()
          return payment.accessGranted || ['paid', 'success', 'settlement', 'capture'].includes(status)
        })
        .forEach((payment) => {
          const member = membersById.get(payment.memberId) || membersByEmail.get(String(payment.buyerEmail || '').toLowerCase())
          const isProduct = payment.itemType === 'digital_product' || Boolean(payment.productId)
          const product = visibleProducts.find((item) => item.id === payment.productId)
          const course = visibleClasses.find((item) => item.id === payment.classId)
          const itemTitle = isProduct
            ? payment.productTitle || product?.title
            : payment.classTitle || course?.title

          if (!itemTitle) {
            return
          }

          const createdAt = payment.updatedAt || payment.createdAt
          realActivities.push({
            id: `payment:${payment.id}`,
            name: member?.name || payment.buyerName || 'Pelanggan',
            avatar: member?.avatar || '',
            actionText: isProduct ? 'membeli produk digital' : 'mendaftar kelas',
            itemTitle,
            type: isProduct ? 'produk' : 'kelas',
            createdAt,
            timeText: isProduct
              ? `Membeli pada ${formatIndonesianDate(createdAt)}`
              : `Terdaftar pada ${formatIndonesianDate(createdAt)}`,
          })
        })

      currentProductAccess.forEach((access) => {
        const product = visibleProducts.find((item) => item.id === access.productId)
        const member = membersById.get(access.memberId) || membersByEmail.get(String(access.buyerEmail || '').toLowerCase())
        const itemTitle = access.productTitle || product?.title

        if (!itemTitle) {
          return
        }

        realActivities.push({
          id: `access:${access.id}`,
          name: member?.name || access.buyerName || 'Pelanggan',
          avatar: member?.avatar || '',
          actionText: 'mengakses produk digital',
          itemTitle,
          type: 'produk',
          createdAt: access.createdAt,
          timeText: `Membeli pada ${formatIndonesianDate(access.createdAt)}`,
        })
      })

      currentMembers.forEach((member) => {
        if (!Array.isArray(member.allowedClassIds) || !member.allowedClassIds.length) {
          return
        }

        member.allowedClassIds.forEach((classId) => {
          const course = visibleClasses.find((item) => item.id === classId)
          const isAlreadyFromPayment = realActivities.some(
            (activity) => activity.type === 'kelas' && activity.itemTitle === course?.title && activity.name === member.name,
          )

          if (!course || isAlreadyFromPayment) {
            return
          }

          realActivities.push({
            id: `member-class:${member.id}:${classId}`,
            name: member.name || 'Member',
            avatar: member.avatar || '',
            actionText: 'mengakses kelas',
            itemTitle: course.title,
            type: 'kelas',
            createdAt: member.joinedAt,
            timeText: `Terdaftar pada ${formatIndonesianDate(member.joinedAt)}`,
          })
        })
      })

      const uniqueActivities = new Map()
      const selectedActivityIds = new Set(notificationSettings.selectedActivityIds || [])
      const allowedPublicActivities = notificationSettings.mode === 'selected'
        ? currentPublicActivities.filter((activity) => selectedActivityIds.has(activity.id))
        : currentPublicActivities

      allowedPublicActivities.forEach((activity) => {
        uniqueActivities.set(activity.id, {
          ...activity,
          timeText: getActivityTime(
            activity.createdAt,
            activity.type === 'produk'
              ? activity.actionText.includes('akses') ? 'Akses' : 'Beli'
              : 'Daftar',
          ),
        })
      })
      realActivities.forEach((activity) => {
        const key = activity.id || `${activity.type}:${activity.name}:${activity.itemTitle}:${activity.createdAt}`
        if (!uniqueActivities.has(key)) {
          uniqueActivities.set(key, activity)
        }
      })

      let allActivities = [...uniqueActivities.values()]

      if (allActivities.length === 0 && notificationSettings.mode !== 'selected') {
        const simulatedNames = [
          'Budi Santoso', 'Dewi Lestari', 'Joko Widodo', 'Siti Aminah',
          'Rian Hidayat', 'Andi Wijaya', 'Sari Wijaya', 'Eko Prasetyo',
          'Rina Rahmawati', 'Deni Setiawan', 'Aditya Nugraha', 'Mega Utami',
          'Fajar Siddiq', 'Indah Permatasari', 'Yusuf Habibie'
        ]

        const itemsPool = [
          ...visibleClasses.map(c => ({ item: c, type: 'kelas' })),
          ...visibleProducts.map(p => ({ item: p, type: 'produk' }))
        ]

        if (itemsPool.length > 0) {
          for (let i = 0; i < 15; i++) {
            const name = simulatedNames[i % simulatedNames.length]
            const poolItem = itemsPool[(i * 3 + 7) % itemsPool.length]
            const date = getRandomPastDate(30)
            const isProduct = poolItem.type === 'produk'

            allActivities.push({
              id: `simulated:${i}:${poolItem.item.id}`,
              name,
              avatar: '',
              actionText: isProduct ? 'membeli produk digital' : 'mendaftar kelas',
              itemTitle: poolItem.item.title,
              type: poolItem.type,
              createdAt: date,
              timeText: isProduct
                ? `Membeli pada ${formatIndonesianDate(date)}`
                : `Terdaftar pada ${formatIndonesianDate(date)}`,
            })
          }
        }
      }

      allActivities = shuffleItems(
        allActivities
          .sort((first, second) => (Date.parse(second.createdAt || '') || 0) - (Date.parse(first.createdAt || '') || 0))
          .slice(0, 30),
      )

      if (allActivities.length === 0) {
        intervalTimer = setTimeout(showNextNotification, 12000)
        return
      }

      const activity = allActivities[currentIndex % allActivities.length]
      if (!activity) return

      setActiveNotification(activity)
      setShowNotification(true)

      hideTimer = setTimeout(() => {
        setShowNotification(false)
      }, 6000)

      currentIndex = (currentIndex + 1) % allActivities.length

      const nextDelay = 18000 + Math.random() * 10000
      intervalTimer = setTimeout(showNextNotification, nextDelay)
    }

    const initialTimer = setTimeout(() => {
      showNextNotification()
    }, 2500)

    return () => {
      clearTimeout(initialTimer)
      clearTimeout(hideTimer)
      clearTimeout(intervalTimer)
    }
  }, [
    classes.length,
    digitalProducts.length,
    members.length,
    payments.length,
    digitalProductAccess.length,
    publicActivities.length,
    notificationSettingsSignature,
  ])

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
      const salePrice = Math.max(0, Math.round(Number(course.salePrice) || 0))
      const normalPrice = Math.max(0, Math.round(Number(course.price) || 0))
      const currentPriceVal = salePrice || normalPrice
      const currentPrice = currentPriceVal ? formatRupiah(currentPriceVal) : 'Gratis'
      const originalPrice = (salePrice && normalPrice > salePrice)
        ? formatRupiah(normalPrice)
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

  const navigateBackFromProductCheckout = (productId) => {
    const product = detailProducts.find((item) => item.id === productId || item.publicCode === productId)

    if (window.history.state?.checkoutFromProductDetail && window.history.length > 1) {
      window.history.back()
      return
    }

    setSelectedProductId(productId)
    setSelectedClassId('')
    setCheckoutProductId('')
    setIsPaymentPickerOpen(false)
    window.history.replaceState(
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
      { publicDetailFromApp: true, checkoutFromProductDetail: true },
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
          onBack={() => navigateBackFromProductCheckout(checkoutProduct.id)}
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
              className={`catalog-card animated-card card-type-${item.type} ${item.highlighted ? 'highlighted' : ''}`}
              key={`${item.type}-${item.id}`}
              style={{ '--card-delay': `${index * 0.08}s` }}
            >
              <CatalogCardMedia item={item} />
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
      )}
      {activeNotification && (
        <div className={`purchase-notification-toast ${showNotification ? 'show' : ''}`} role="status">
          <div className="purchase-notification-avatar">
            {activeNotification.avatar ? (
              <img src={activeNotification.avatar} alt="" />
            ) : (
              <div className="avatar-initials">
                {activeNotification.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
              </div>
            )}
            <div className={`purchase-notification-badge type-${activeNotification.type}`}>
              <Icon name={activeNotification.type === 'kelas' ? 'bookOpen' : 'cart'} />
            </div>
          </div>
          <div className="purchase-notification-content">
            <strong className="purchase-notification-name">{activeNotification.name}</strong>
            <span className="purchase-notification-desc">
              {activeNotification.actionText} <span className="purchase-notification-item">{activeNotification.itemTitle}</span>
            </span>
            <span className="purchase-notification-time">{activeNotification.timeText}</span>
          </div>
          <button 
            className="purchase-notification-close" 
            type="button" 
            onClick={() => setShowNotification(false)}
            aria-label="Tutup notifikasi"
          >
            <Icon name="x" />
          </button>
        </div>
      )}
    </>
  )
}

export default HomePage
