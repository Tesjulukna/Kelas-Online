import { useEffect, useState } from 'react'
import ConfirmDialog from './components/ConfirmDialog'
import Icon from './components/Icon'
import ProfileEditor from './components/ProfileEditor'
import ProfileMenu from './components/ProfileMenu'
import AdminPage from './pages/AdminPage'
import CertificateVerifyPage from './pages/CertificateVerifyPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import MemberPage from './pages/MemberPage'
import { adminClasses as adminClassSeed } from './data/platformData'
import { cleanWebsiteSettings, defaultWebsiteSettings } from './data/websiteSettings'
import './App.css'

const sessionKey = 'ibnucreative.session.v1'
const classesKey = 'ibnucreative.classes.v2'
const websiteSettingsKey = 'ibnucreative.website-settings.v1'
const classesSyncKey = 'ibnucreative.classes.sync.v1'
const peopleSyncKey = 'ibnucreative.people.sync.v1'
const websiteSettingsSyncKey = 'ibnucreative.website-settings.sync.v1'
const pendingClassCheckoutKey = 'ibnucreative.pending-class-checkout.v1'
const classesApiPath = '/api/classes'
const digitalProductsApiPath = '/api/digital-products'
const membersApiPath = '/api/members'
const supportApiPath = '/api/support'
const submissionsApiPath = '/api/submissions'
const testimonialsApiPath = '/api/testimonials'
const certificatesApiPath = '/api/certificates'
const paymentsApiPath = '/api/payments'
const settingsApiPath = '/api/settings'
const backupApiPath = '/api/backup'
const tripayPaymentMethodsApiPath = '/api/tripay-payment-methods'
const tripayCheckoutApiPath = '/api/tripay-checkout'
const publicProductCheckoutApiPath = '/api/public-product-checkout'
const publicProductAccessApiPath = '/api/public-product-access'
const digitalProductReviewLikeApiPath = '/api/digital-product-review-like'
const publicActivityApiPath = '/api/public-activity'
const loginApiPath = '/api/login'
const googleAuthUrlApiPath = '/api/google-auth-url'
const googleLoginApiPath = '/api/google-login'
const logoutApiPath = '/api/logout'
const profileApiPath = '/api/profile'
const allowedRoles = ['member', 'admin']
const pagePaths = {
  home: '/',
  login: '/login',
  member: '/member',
  admin: '/admin',
  about: '/tentang-kami',
  contact: '/kontak-support',
  privacy: '/kebijakan-privasi',
  terms: '/ketentuan-layanan',
}
const publicInfoPages = ['about', 'contact', 'privacy', 'terms']
const notificationSeenKey = 'ibnucreative.notifications.seen.v1'

function getPageFromPath(pathname) {
  const cleanPath = pathname.replace(/\/+$/, '') || '/'

  if (cleanPath === '/login') {
    return 'login'
  }

  if (cleanPath === '/member') {
    return 'member'
  }

  if (cleanPath === '/admin') {
    return 'admin'
  }

  if (cleanPath === '/tentang-kami') {
    return 'about'
  }

  if (cleanPath === '/kontak-support') {
    return 'contact'
  }

  if (cleanPath === '/kebijakan-privasi') {
    return 'privacy'
  }

  if (cleanPath === '/ketentuan-layanan') {
    return 'terms'
  }

  return 'home'
}

function getPublicDetailFromPath(pathname) {
  const cleanPath = pathname.replace(/\/+$/, '') || '/'
  const [, type, id, action] = cleanPath.split('/')

  if (type === 'produk-akses' && id) {
    return {
      type,
      id: decodeURIComponent(id),
      action: '',
    }
  }

  if ((type === 'kelas' || type === 'produk') && id) {
    return {
      type,
      id: decodeURIComponent(id),
      action: action || '',
    }
  }

  return null
}

function getPublicCertificateIdFromPath(pathname) {
  const cleanPath = pathname.replace(/\/+$/, '') || '/'
  const [, type, id] = cleanPath.split('/')

  return type === 'sertifikat' && id ? decodeURIComponent(id) : ''
}

function getInitialPage(session) {
  if (typeof window === 'undefined') {
    return session?.role ?? 'home'
  }

  if (window.location.hash.includes('access_token=') || window.location.hash.includes('error=')) {
    return 'login'
  }

  const page = getPageFromPath(window.location.pathname)

  if (
    session?.role &&
    page !== session.role &&
    !publicInfoPages.includes(page) &&
    !getPublicDetailFromPath(window.location.pathname) &&
    !getPublicCertificateIdFromPath(window.location.pathname)
  ) {
    window.history.replaceState({}, '', pagePaths[session.role] ?? pagePaths.home)
    return session.role
  }

  return page
}

function getInitialSection() {
  if (typeof window === 'undefined') {
    return 'home'
  }

  return window.location.hash.replace('#', '') || 'home'
}

function getDashboardMenuFromUrl(role) {
  if (typeof window === 'undefined') {
    return 'overview'
  }

  const menuId = new URLSearchParams(window.location.search).get('menu')
  const allowedMenus = role === 'admin'
    ? [
        'overview',
        'manage-classes',
        'digital-products',
        'students',
        'payments',
        'submissions',
        'testimonials',
        'certificates',
        'support',
        'website-settings',
      ]
    : [
        'overview',
        'my-courses',
        'available-classes',
        'digital-products',
        'testimonials',
        'certificates',
        'support',
      ]

  return allowedMenus.includes(menuId) ? menuId : 'overview'
}

function readSeenNotifications(userId = '') {
  if (typeof window === 'undefined' || !userId) {
    return []
  }

  try {
    const saved = JSON.parse(window.localStorage.getItem(notificationSeenKey)) ?? {}
    return Array.isArray(saved[userId]) ? saved[userId] : []
  } catch {
    window.localStorage.removeItem(notificationSeenKey)
    return []
  }
}

function saveSeenNotifications(userId, ids) {
  if (typeof window === 'undefined' || !userId) {
    return
  }

  try {
    const saved = JSON.parse(window.localStorage.getItem(notificationSeenKey)) ?? {}
    window.localStorage.setItem(
      notificationSeenKey,
      JSON.stringify({ ...saved, [userId]: [...new Set(ids)] }),
    )
  } catch {
    // Notification read state is local-only and can fail silently.
  }
}

function scrollToSection(sectionId) {
  window.setTimeout(() => {
    if (sectionId === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    document
      .getElementById(sectionId)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 0)
}

function cleanText(value) {
  return String(value).trim().replace(/[<>]/g, '').slice(0, 60)
}

function cleanUsername(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9._-]/g, '')
}

function cleanEmail(value) {
  const email = cleanLongText(value, 120).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function cleanPhone(value) {
  return cleanLongText(value, 40).replace(/[^0-9+()\-\s.]/g, '')
}

function cleanSessionToken(value) {
  return String(value ?? '').replace(/[^a-f0-9]/gi, '').slice(0, 128)
}

function cleanLongText(value, maxLength = 260) {
  return String(value).trim().replace(/[<>]/g, '').slice(0, maxLength)
}

function cleanPromptText(value) {
  return String(value ?? '').split(String.fromCharCode(0)).join('')
}

function youtubeEmbedUrlFromText(value) {
  try {
    const url = new URL(String(value || '').trim())
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

function convertYoutubeLinesToEmbeds(value) {
  return String(value ?? '')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      const embedUrl = /^https?:\/\/\S+$/i.test(trimmed) ? youtubeEmbedUrlFromText(trimmed) : ''

      return embedUrl
        ? `<iframe src="${embedUrl}" title="Video YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
        : line
    })
    .join('\n')
}

function cleanRichHtml(value, maxLength = 6000) {
  const safeHtml = convertYoutubeLinesToEmbeds(value).slice(0, maxLength)

  if (typeof window === 'undefined' || !safeHtml) {
    return ''
  }

  const template = document.createElement('template')
  template.innerHTML = safeHtml
  const allowedTags = new Set([
    'P',
    'BR',
    'STRONG',
    'B',
    'EM',
    'I',
    'U',
    'UL',
    'OL',
    'LI',
    'SPAN',
    'DIV',
    'A',
    'IMG',
    'IFRAME',
    'H2',
    'H3',
    'H4',
  ])
  const allowedStyles = new Set(['color', 'text-align'])

  template.content.querySelectorAll('*').forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(document.createTextNode(node.textContent ?? ''))
      return
    }

    ;[...node.attributes].forEach((attribute) => {
      if (node.tagName === 'A' && attribute.name === 'href') {
        const href = node.getAttribute('href') || ''
        if (/^\s*javascript:/i.test(href)) {
          node.removeAttribute('href')
        }
        return
      }

      if (node.tagName === 'IMG' && attribute.name === 'src') {
        const src = node.getAttribute('src') || ''
        if (!/^https?:\/\//i.test(src) && !src.startsWith('data:image/')) {
          node.removeAttribute('src')
        }
        return
      }

      if (node.tagName === 'IMG' && ['alt', 'loading'].includes(attribute.name)) {
        return
      }

      if (node.tagName === 'IFRAME' && attribute.name === 'src') {
        const src = node.getAttribute('src') || ''
        try {
          const parsed = new URL(src)
          const host = parsed.hostname.replace(/^www\./, '')
          if (!['youtube.com', 'youtube-nocookie.com'].includes(host) || !parsed.pathname.startsWith('/embed/')) {
            node.replaceWith(document.createTextNode(''))
          }
        } catch {
          node.replaceWith(document.createTextNode(''))
        }
        return
      }

      if (node.tagName === 'IFRAME' && ['title', 'allow', 'allowfullscreen'].includes(attribute.name)) {
        return
      }

      if (node.tagName === 'A' && ['target', 'rel'].includes(attribute.name)) {
        return
      }

      if (attribute.name !== 'style') {
        node.removeAttribute(attribute.name)
        return
      }

      const nextStyle = []
      allowedStyles.forEach((styleName) => {
        const styleValue = node.style.getPropertyValue(styleName)
        if (styleValue) {
          nextStyle.push(`${styleName}: ${styleValue}`)
        }
      })

      if (nextStyle.length) {
        node.setAttribute('style', nextStyle.join('; '))
      } else {
        node.removeAttribute('style')
      }
    })

    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noreferrer')
    }

    if (node.tagName === 'IMG' && node.getAttribute('src')) {
      node.setAttribute('loading', 'lazy')
    }
  })

  return template.innerHTML
}

function cleanYoutubeUrl(value) {
  const safeValue = cleanLongText(value, 260)

  if (!safeValue) {
    return ''
  }

  try {
    const url = new URL(safeValue)
    const host = url.hostname.replace(/^www\./, '')
    const allowedHosts = ['youtube.com', 'm.youtube.com', 'youtu.be']

    return allowedHosts.includes(host) ? safeValue : ''
  } catch {
    return ''
  }
}

function cleanAvatar(value) {
  if (typeof value !== 'string') {
    return ''
  }

  if (
    value.startsWith('/uploads/profiles/') ||
    value.startsWith('/uploads/tugas/') ||
    value.startsWith('/uploads/gambar/')
  ) {
    return cleanLongText(value, 240)
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).href.slice(0, 600)
    } catch {
      return ''
    }
  }

  return value.startsWith('data:image/') && value.length <= 3_000_000 ? value : ''
}

function cleanPdfFile(value) {
  if (typeof value !== 'string') {
    return ''
  }

  if (value.startsWith('/uploads/dokumen/')) {
    return cleanLongText(value, 240)
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).href.slice(0, 600)
    } catch {
      return ''
    }
  }

  return value.startsWith('data:application/pdf') && value.length <= 8_000_000
    ? value
    : ''
}

function cleanExternalUrl(value) {
  const safeValue = cleanLongText(value, 360)

  if (!safeValue) {
    return ''
  }

  try {
    const url = new URL(
      /^https?:\/\//i.test(safeValue) ? safeValue : `https://${safeValue}`,
    )

    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

function cleanResourceLinks(value, materialId = 'material') {
  const source = Array.isArray(value) ? value : []

  return source
    .filter((item) => item?.url || item?.title)
    .map((item, index) => ({
      id: cleanText(item.id || `${materialId}-link-${index + 1}`),
      title: cleanLongText(item.title || `Link ${index + 1}`, 120),
      url: cleanExternalUrl(item.url || ''),
    }))
    .filter((item) => item.url)
}

function createSeedMaterials(item, index) {
  const title = cleanText(item.title || 'Kelas')
  const materialId = `admin-class-${index + 1}-material`

  return [
    {
      id: `${materialId}-1`,
      title: `Pengenalan ${title}`,
      description: '',
      videoUrl: 'https://www.youtube.com/watch?v=ysz5S6PUM-U',
      videoFile: '',
      videoName: '',
      videoType: '',
      imageFile: '',
      imageName: '',
      pdfFile: '',
      pdfName: '',
      requiresTask: false,
      allowTaskImage: true,
      requireTaskImage: false,
      taskPrompt: '',
      promptItems: [],
      resourceLinks: [],
    },
    {
      id: `${materialId}-2`,
      title: `Praktik ${title}`,
      description: '',
      videoUrl: 'https://www.youtube.com/shorts/aqz-KE-bpKQ',
      videoFile: '',
      videoName: '',
      videoType: '',
      imageFile: '',
      imageName: '',
      pdfFile: '',
      pdfName: '',
      requiresTask: true,
      allowTaskImage: true,
      requireTaskImage: false,
      taskPrompt: 'Kirim link hasil praktik atau catatan tugas dari materi ini.',
      promptItems: [],
      resourceLinks: [],
    },
  ]
}

function cleanMaterials(value, classId, fallbackTitle = 'Kelas') {
  const source = Array.isArray(value) ? value : []
  const materials = source
    .filter((item) => item?.title || item?.videoUrl || item?.videoFile || item?.imageFile)
    .map((item, index) => ({
      id: cleanText(item.id || `${classId}-material-${index + 1}`),
      title: cleanText(item.title || `Materi ${index + 1}`),
      description: cleanRichHtml(item.description || ''),
      videoUrl: cleanYoutubeUrl(item.videoUrl),
      videoFile: cleanLongText(item.videoFile || '', 180),
      videoName: cleanLongText(item.videoName || '', 160),
      videoType: cleanLongText(item.videoType || '', 80),
      imageFile: cleanAvatar(item.imageFile || ''),
      imageName: cleanLongText(item.imageName || '', 160),
      pdfFile: cleanPdfFile(item.pdfFile || ''),
      pdfName: cleanLongText(item.pdfName || '', 180),
      requiresTask: Boolean(item.requiresTask),
      allowTaskImage: item.allowTaskImage !== false,
      requireTaskImage: Boolean(item.requireTaskImage),
      taskPrompt: cleanLongText(
        item.taskPrompt || 'Kirim link tugas atau catatan praktik materi ini.',
        220,
      ),
      promptItems: cleanPromptItems(item.promptItems, `${classId}-material-${index + 1}`),
      resourceLinks: cleanResourceLinks(item.resourceLinks, `${classId}-material-${index + 1}`),
    }))

  if (materials.length) {
    return materials
  }

  return createSeedMaterials({ title: fallbackTitle }, 0).map((item, index) => ({
    ...item,
    id: `${classId}-material-${index + 1}`,
  }))
}

function cleanPromptItems(value, materialId = 'material') {
  const source = Array.isArray(value) ? value : []

  return source
    .filter((item) => item?.image || item?.prompt || item?.instruction)
    .map((item, index) => ({
      id: cleanText(item.id || `${materialId}-prompt-${index + 1}`),
      title: cleanText(item.title || `Prompt ${index + 1}`),
      image: cleanAvatar(item.image),
      instruction: cleanLongText(item.instruction || '', 1000),
      prompt: cleanPromptText(item.prompt),
    }))
}

function readSession() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawSession =
      window.localStorage.getItem(sessionKey) ??
      window.sessionStorage.getItem(sessionKey)
    const saved = JSON.parse(rawSession)

    if (
      !saved ||
      !allowedRoles.includes(saved.role) ||
      typeof saved.name !== 'string' ||
      typeof saved.username !== 'string' ||
      typeof saved.userId !== 'string'
    ) {
      clearSession()
      return null
    }

    const nextSession = {
      userId: cleanText(saved.userId || ''),
      name: cleanText(saved.name) || 'Sahabat Kreatif',
      username: cleanUsername(saved.username || saved.name || ''),
      email: cleanEmail(saved.email || ''),
      role: saved.role,
      avatar: cleanAvatar(saved.avatar),
      allowedClassIds: Array.isArray(saved.allowedClassIds)
        ? saved.allowedClassIds.map((classId) => cleanText(classId)).filter(Boolean)
        : null,
      token: cleanSessionToken(saved.token),
      signedInAt: saved.signedInAt,
    }

    saveSession(nextSession)

    return nextSession
  } catch {
    clearSession()
    return null
  }
}

function saveSession(nextSession) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(sessionKey, JSON.stringify(nextSession))
    window.sessionStorage.removeItem(sessionKey)
  } catch {
    try {
      window.sessionStorage.setItem(sessionKey, JSON.stringify(nextSession))
    } catch {
      // If browser storage is blocked, the in-memory React state still works for this page.
    }
  }
}

function clearSession() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(sessionKey)
    window.sessionStorage.removeItem(sessionKey)
  } catch {
    // Storage cleanup is best-effort.
  }
}

function seedClasses() {
  return adminClassSeed.map((item, index) => ({
    ...item,
    id: `admin-class-${index + 1}`,
    description: item.description ?? '',
    thumbnail: item.thumbnail ?? '',
    displayStudents: item.displayStudents ?? '',
    rating: item.rating ?? '',
    mentor: item.mentor ?? 'Ibnu Creative',
    progress: item.progress ?? [72, 46, 88][index] ?? 35,
    next: item.next ?? 'Lanjutkan modul berikutnya',
    liveAt: item.liveAt ?? 'Jumat, 29 Mei 2026, 20.00 WITA',
    lessons: item.lessons ?? `${16 + index * 4} materi`,
    purchaseButtonLabel: item.purchaseButtonLabel ?? 'Beli Sekarang',
    registerButtonLabel: item.registerButtonLabel ?? 'Daftar',
    showOnHomepage: item.showOnHomepage !== false,
    showOnMember: item.showOnMember !== false,
    highlighted: item.highlighted === true,
    materials: createSeedMaterials(item, index),
  }))
}

function cleanClasses(value) {
  if (!Array.isArray(value)) {
    return null
  }

  return value
    .filter((item) => item?.id && item?.title)
    .map((item) => {
      const classId = String(item.id)

      return {
        id: classId,
        title: cleanText(item.title),
        description: cleanRichHtml(item.description || ''),
        students: Math.max(0, Number(item.students) || 0),
        displayStudents:
          item.displayStudents === '' || item.displayStudents === null || item.displayStudents === undefined
            ? ''
            : Math.max(0, Math.round(Number(item.displayStudents) || 0)),
        rating:
          item.rating === '' || item.rating === null || item.rating === undefined
            ? ''
            : Math.min(5, Math.max(0, Number(item.rating) || 0)),
        status: cleanText(item.status || 'Draft'),
        revenue: cleanText(item.revenue || 'Rp 0'),
        price: Math.max(0, Math.round(Number(item.price) || 0)),
        salePrice:
          item.salePrice === '' || item.salePrice === null || item.salePrice === undefined
            ? ''
            : Math.max(0, Math.round(Number(item.salePrice) || 0)),
        purchaseButtonLabel: cleanText(item.purchaseButtonLabel || 'Beli Sekarang'),
        registerButtonLabel: cleanText(item.registerButtonLabel || 'Daftar'),
        lynkProductKey: cleanLongText(item.lynkProductKey || '', 160),
        tripayProductKey: cleanLongText(item.tripayProductKey || '', 160),
        thumbnail: cleanAvatar(item.thumbnail),
        mentor: cleanText(item.mentor || 'Ibnu Creative'),
        progress: Math.min(100, Math.max(0, Number(item.progress) || 0)),
        next: cleanText(item.next || 'Lanjutkan modul berikutnya'),
        liveAt: cleanText(item.liveAt || 'Jadwal menyusul'),
        lessons: cleanText(item.lessons || '12 materi'),
        showOnHomepage: item.showOnHomepage !== false,
        showOnMember: item.showOnMember !== false,
        highlighted: item.highlighted === true,
        materials: cleanMaterials(item.materials, classId, item.title),
      }
    })
}

function cleanDigitalProducts(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item?.id && item?.title)
    .map((item) => ({
      id: cleanText(item.id),
      title: cleanLongText(item.title, 160),
      description: cleanRichHtml(item.description || ''),
      price: Math.max(0, Math.round(Number(item.price) || 0)),
      displaySales:
        item.displaySales === '' || item.displaySales === null || item.displaySales === undefined
          ? ''
          : Math.max(0, Math.round(Number(item.displaySales) || 0)),
      rating:
        item.rating === '' || item.rating === null || item.rating === undefined
          ? ''
          : Math.min(5, Math.max(0, Number(item.rating) || 0)),
      status: cleanText(item.status || 'Draft'),
      thumbnail: cleanAvatar(item.thumbnail || ''),
      addVideo: item.addVideo === true,
      videoUrl: cleanLongText(item.videoUrl || '', 1000),
      fileUrl: cleanLongText(item.fileUrl || '', 1000),
      fileName: cleanLongText(item.fileName || '', 180),
      deliveryNote: cleanLongText(item.deliveryNote || '', 800),
      platformType: cleanText(item.platformType || 'upload'),
      payWhatYouWant: item.payWhatYouWant === true,
      salePrice: Math.max(0, Math.round(Number(item.salePrice) || 0)),
      itemQuantityEnabled: item.itemQuantityEnabled === true,
      itemQuantity: Math.max(0, Math.round(Number(item.itemQuantity) || 0)),
      limitQtyPerCheckout: item.limitQtyPerCheckout === true,
      purchaseButtonLabel: cleanText(item.purchaseButtonLabel || 'Buy Now'),
      releaseTimeEnabled: item.releaseTimeEnabled === true,
      releaseTime: cleanText(item.releaseTime || ''),
      whatsappNotification: item.whatsappNotification === true,
      customMessageEnabled: item.customMessageEnabled === true,
      customMessage: cleanLongText(item.customMessage || '', 800),
      reviews: Array.isArray(item.reviews)
        ? item.reviews.slice(0, 10).map((review, index) => ({
            id: cleanText(review.id || `review-${index + 1}`),
            name: cleanText(review.name || ''),
            instagram: cleanText(String(review.instagram || '').replace(/^@/, '')),
            avatar: cleanAvatar(review.avatar || ''),
            rating: Math.min(5, Math.max(1, Math.round(Number(review.rating) || 5))),
            date: cleanText(review.date || ''),
            time: cleanText(review.time || ''),
            likes: Math.max(0, Math.round(Number(review.likes) || 0)),
            message: cleanLongText(review.message || '', 500),
          })).filter((review) => review.name || review.message)
        : [],
      addOns: Array.isArray(item.addOns)
        ? item.addOns.slice(0, 20).map((addOn, index) => ({
            id: cleanText(addOn.id || `addon-${index + 1}`),
            title: cleanLongText(addOn.title || '', 120),
            price: Math.max(0, Math.round(Number(addOn.price) || 0)),
            description: cleanLongText(addOn.description || '', 300),
          })).filter((addOn) => addOn.title)
        : [],
      customerQuestions: Array.isArray(item.customerQuestions)
        ? item.customerQuestions.slice(0, 20).map((question, index) => ({
            id: cleanText(question.id || `question-${index + 1}`),
            label: cleanLongText(question.label || '', 160),
            required: question.required === true,
          })).filter((question) => question.label)
        : [],
      blockLayout: cleanText(item.blockLayout || 'default'),
      requireCustomerName: item.requireCustomerName === true,
      requireCustomerPhone: item.requireCustomerPhone === true,
      lynkProductKey: cleanLongText(item.lynkProductKey || '', 160),
      tripayProductKey: cleanLongText(item.tripayProductKey || '', 160),
      showOnHomepage: item.showOnHomepage !== false,
      showOnMember: item.showOnMember !== false,
      highlighted: item.highlighted === true,
      createdAt: cleanText(item.createdAt || ''),
      updatedAt: cleanText(item.updatedAt || ''),
    }))
}

function cleanDigitalProductAccess(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item?.id && item?.productId)
    .map((item) => ({
      id: cleanText(item.id),
      productId: cleanText(item.productId),
      productTitle: cleanLongText(item.productTitle || '', 160),
      memberId: cleanText(item.memberId || ''),
      buyerName: cleanText(item.buyerName || ''),
      buyerEmail: cleanEmail(item.buyerEmail || ''),
      source: cleanText(item.source || ''),
      orderId: cleanLongText(item.orderId || '', 180),
      status: cleanText(item.status || 'active'),
      downloadUrl: cleanLongText(item.downloadUrl || '', 1000),
      createdAt: cleanText(item.createdAt || ''),
    }))
}

function cleanLearningProgress(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item?.classId)
    .map((item) => ({
      classId: cleanText(item.classId),
      classTitle: cleanLongText(item.classTitle || 'Kelas', 160),
      materialId: cleanText(item.materialId || ''),
      materialTitle: cleanLongText(item.materialTitle || 'Materi', 160),
      materialIndex: Math.max(0, Number(item.materialIndex) || 0),
      materialCount: Math.max(0, Number(item.materialCount) || 0),
      progressPercent: Math.min(
        100,
        Math.max(0, Math.round(Number(item.progressPercent) || 0)),
      ),
      lastActivityAt: cleanText(item.lastActivityAt || ''),
    }))
}

function cleanMembers(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item?.id && item?.username)
    .map((item) => ({
      id: cleanText(item.id),
      name: cleanText(item.name || item.username) || 'Member',
      username: cleanUsername(item.username),
      email: cleanLongText(item.email || '', 120),
      phone: cleanPhone(item.phone || ''),
      status: cleanText(item.status || 'Aktif'),
      avatar: cleanAvatar(item.avatar),
      allowedClassIds: Array.isArray(item.allowedClassIds)
        ? item.allowedClassIds.map((classId) => cleanText(classId)).filter(Boolean)
        : null,
      joinedAt: cleanText(item.joinedAt || ''),
      lastSeenAt: cleanText(item.lastSeenAt || ''),
      isOnline: item.isOnline === true || item.isOnline === 1 || item.isOnline === '1',
      learningProgress: cleanLearningProgress(item.learningProgress),
    }))
}

function cleanSupportTickets(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item?.id && item?.message)
    .map((item) => ({
      id: cleanText(item.id),
      memberId: cleanText(item.memberId || ''),
      memberName: cleanText(item.memberName || 'Member'),
      subject: cleanLongText(item.subject || 'Bantuan mentor', 120),
      message: cleanLongText(item.message, 600),
      status: cleanText(item.status || 'Menunggu'),
      priority: cleanText(item.priority || 'Normal'),
      answer: cleanLongText(item.answer || '', 600),
      replies: cleanSupportReplies(item.replies, item),
      createdAt: cleanText(item.createdAt || ''),
    }))
}

function cleanSupportReplies(value, ticket = {}) {
  const replies = Array.isArray(value) ? value : []
  const cleanedReplies = replies
    .filter((item) => item?.message)
    .map((item, index) => ({
      id: cleanText(item.id || `${ticket.id || 'reply'}-${index}`),
      senderRole: item.senderRole === 'admin' ? 'admin' : 'member',
      senderName: cleanText(item.senderName || (item.senderRole === 'admin' ? 'Admin' : ticket.memberName || 'Member')),
      message: cleanLongText(item.message || '', 600),
      createdAt: cleanText(item.createdAt || ticket.createdAt || ''),
    }))

  if (cleanedReplies.length) {
    return cleanedReplies
  }

  const fallbackReplies = []

  if (ticket.message) {
    fallbackReplies.push({
      id: `${ticket.id || 'ticket'}-question`,
      senderRole: 'member',
      senderName: cleanText(ticket.memberName || 'Member'),
      message: cleanLongText(ticket.message, 600),
      createdAt: cleanText(ticket.createdAt || ''),
    })
  }

  if (ticket.answer) {
    fallbackReplies.push({
      id: `${ticket.id || 'ticket'}-answer`,
      senderRole: 'admin',
      senderName: 'Admin',
      message: cleanLongText(ticket.answer, 600),
      createdAt: cleanText(ticket.createdAt || ''),
    })
  }

  return fallbackReplies
}

function cleanSubmissions(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item?.id && item?.answer)
    .map((item) => ({
      id: cleanText(item.id),
      memberId: cleanText(item.memberId || ''),
      memberName: cleanText(item.memberName || 'Member'),
      classId: cleanText(item.classId || ''),
      classTitle: cleanLongText(item.classTitle || 'Kelas', 140),
      materialId: cleanText(item.materialId || ''),
      materialTitle: cleanLongText(item.materialTitle || 'Materi', 140),
      answer: cleanLongText(item.answer || '', 1200),
      attachmentUrl: cleanAvatar(item.attachmentUrl || ''),
      attachmentName: cleanLongText(item.attachmentName || '', 180),
      status: cleanText(item.status || 'Menunggu Review'),
      feedback: cleanLongText(item.feedback || '', 1200),
      rating: Math.min(5, Math.max(0, Math.round(Number(item.rating) || 0))),
      submittedAt: cleanText(item.submittedAt || ''),
    }))
}

function cleanTestimonials(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item?.id && item?.message)
    .map((item) => ({
      id: cleanText(item.id),
      memberId: cleanText(item.memberId || ''),
      memberName: cleanText(item.memberName || 'Member'),
      memberAvatar: cleanAvatar(item.memberAvatar || ''),
      classId: cleanText(item.classId || ''),
      classTitle: cleanLongText(item.classTitle || 'Kelas', 160),
      message: cleanLongText(item.message || '', 1200),
      status: cleanText(item.status || 'pending'),
      createdAt: cleanText(item.createdAt || ''),
      updatedAt: cleanText(item.updatedAt || ''),
    }))
}

function cleanCertificates(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item?.id && item?.certificateId)
    .map((item) => ({
      id: cleanText(item.id),
      certificateId: cleanLongText(item.certificateId || '', 80),
      memberId: cleanText(item.memberId || ''),
      memberName: cleanLongText(item.memberName || 'Member', 160),
      classId: cleanText(item.classId || ''),
      classTitle: cleanLongText(item.classTitle || 'Kelas', 180),
      mentorName: cleanLongText(item.mentorName || 'Ibnu Creative', 140),
      participantName: cleanLongText(item.participantName || item.memberName || 'Member', 160),
      templateId: cleanText(item.templateId || ''),
      templateSnapshot:
        item.templateSnapshot && typeof item.templateSnapshot === 'object'
          ? item.templateSnapshot
          : null,
      completedAt: cleanText(item.completedAt || ''),
      issuedAt: cleanText(item.issuedAt || ''),
      nameChangeUsed: item.nameChangeUsed === true,
      version: Math.max(1, Math.round(Number(item.version) || 1)),
      revokedAt: cleanText(item.revokedAt || ''),
      createdAt: cleanText(item.createdAt || ''),
      updatedAt: cleanText(item.updatedAt || ''),
    }))
}

function cleanCertificateNameChangeRequests(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item?.id)
    .map((item) => ({
      id: cleanText(item.id),
      certificateRowId: cleanText(item.certificateRowId || ''),
      publicCertificateId: cleanLongText(item.publicCertificateId || '', 80),
      memberId: cleanText(item.memberId || ''),
      memberName: cleanLongText(item.memberName || 'Member', 160),
      classId: cleanText(item.classId || ''),
      classTitle: cleanLongText(item.classTitle || 'Kelas', 180),
      oldName: cleanLongText(item.oldName || '', 160),
      newName: cleanLongText(item.newName || '', 160),
      reason: cleanLongText(item.reason || '', 700),
      status: cleanText(item.status || 'pending'),
      adminNote: cleanLongText(item.adminNote || '', 500),
      reviewedAt: cleanText(item.reviewedAt || ''),
      createdAt: cleanText(item.createdAt || ''),
      updatedAt: cleanText(item.updatedAt || ''),
    }))
}

function cleanCertificateTemplates(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item?.id && item?.classId)
    .map((item) => ({
      id: cleanText(item.id),
      classId: cleanText(item.classId || ''),
      name: cleanLongText(item.name || 'Template Sertifikat', 180),
      sizeType: cleanText(item.sizeType || 'a4Landscape'),
      width: Math.max(320, Math.min(2400, Math.round(Number(item.width) || 1123))),
      height: Math.max(320, Math.min(2400, Math.round(Number(item.height) || 794))),
      backgroundColor: cleanText(item.backgroundColor || '#f8fafc'),
      backgroundImage: cleanLongText(item.backgroundImage || '', 1200),
      snapToGrid: item.snapToGrid !== false,
      gridSize: Math.max(4, Math.min(80, Math.round(Number(item.gridSize) || 10))),
      elements: Array.isArray(item.elements) ? item.elements : [],
      createdAt: cleanText(item.createdAt || ''),
      updatedAt: cleanText(item.updatedAt || ''),
    }))
}

function cleanPayments(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item?.id)
    .map((item) => ({
      id: cleanText(item.id),
      source: cleanText(item.source || ''),
      sourceLabel: cleanText(item.sourceLabel || item.source || 'Pembayaran'),
      orderCode: cleanLongText(item.orderCode || '', 180),
      merchantRef: cleanLongText(item.merchantRef || '', 180),
      reference: cleanLongText(item.reference || '', 180),
      buyerName: cleanText(item.buyerName || 'Member'),
      buyerEmail: cleanEmail(item.buyerEmail || ''),
      memberId: cleanText(item.memberId || ''),
      classId: cleanText(item.classId || ''),
      itemType: cleanText(item.itemType || 'class'),
      productId: cleanText(item.productId || ''),
      productTitle: cleanLongText(item.productTitle || '', 180),
      classTitle: cleanLongText(item.classTitle || 'Kelas', 180),
      amount: Math.max(0, Math.round(Number(item.amount) || 0)),
      status: cleanText(item.status || 'pending'),
      paymentMethod: cleanText(item.paymentMethod || item.sourceLabel || '-'),
      checkoutUrl: cleanLongText(item.checkoutUrl || '', 1000),
      accessGranted: item.accessGranted === true,
      expiresAt: cleanText(item.expiresAt || ''),
      isExpired: item.isExpired === true,
      createdAt: cleanText(item.createdAt || ''),
      updatedAt: cleanText(item.updatedAt || ''),
    }))
}

function cleanPublicActivities(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item) => item?.id && item?.itemTitle)
    .map((item) => ({
      id: cleanText(item.id),
      name: cleanText(item.name || 'Pelanggan'),
      avatar: cleanAvatar(item.avatar || ''),
      actionText: cleanLongText(item.actionText || '', 180),
      itemTitle: cleanLongText(item.itemTitle || '', 180),
      type: cleanText(item.type || 'kelas'),
      createdAt: cleanText(item.createdAt || ''),
    }))
}

function readClasses() {
  if (typeof window === 'undefined') {
    return seedClasses()
  }

  try {
    return cleanClasses(JSON.parse(window.sessionStorage.getItem(classesKey))) ?? seedClasses()
  } catch {
    window.sessionStorage.removeItem(classesKey)
    return seedClasses()
  }
}

function readWebsiteSettings() {
  if (typeof window === 'undefined') {
    return defaultWebsiteSettings
  }

  try {
    const savedSettings = JSON.parse(window.sessionStorage.getItem(websiteSettingsKey))

    return cleanWebsiteSettings(savedSettings)
  } catch {
    window.sessionStorage.removeItem(websiteSettingsKey)
    return defaultWebsiteSettings
  }
}

function mergeClasses(remoteClasses, localClasses) {
  const classesById = new Map()

  remoteClasses.forEach((item) => classesById.set(item.id, item))
  localClasses.forEach((item) => classesById.set(item.id, item))

  return [...classesById.values()]
}

function areClassesEqual(currentClasses, nextClasses) {
  return JSON.stringify(currentClasses) === JSON.stringify(nextClasses)
}

function syncSessionWithMemberAccount(currentSession, memberAccount) {
  if (!currentSession || currentSession.role !== 'member' || !memberAccount) {
    return currentSession
  }

  return {
    ...currentSession,
    name: cleanText(memberAccount.name) || currentSession.name,
    username: cleanText(memberAccount.username) || currentSession.username,
    email: cleanEmail(memberAccount.email || currentSession.email || ''),
    avatar: cleanAvatar(memberAccount.avatar ?? currentSession.avatar),
    allowedClassIds: Array.isArray(memberAccount.allowedClassIds)
      ? memberAccount.allowedClassIds
      : null,
  }
}

function announceClassesSync() {
  try {
    window.localStorage.setItem(classesSyncKey, String(Date.now()))
  } catch {
    // Cross-tab sync is best-effort. Data is still persisted in data.json.
  }
}

function announcePeopleSync() {
  try {
    window.localStorage.setItem(peopleSyncKey, String(Date.now()))
  } catch {
    // Cross-tab sync is best-effort. Data is still persisted in data.json.
  }
}

function announceWebsiteSettingsSync() {
  try {
    window.localStorage.setItem(websiteSettingsSyncKey, String(Date.now()))
  } catch {
    // Cross-tab sync is best-effort. Settings remain available in this tab.
  }
}

async function requestJson(path, options = {}) {
  const sessionToken = readSession()?.token
  const response = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
      ...(options.headers ?? {}),
    },
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.message || 'Permintaan tidak bisa diproses.')
  }

  return data
}

async function fetchStoredClasses({ mergeLocal = false } = {}) {
  const response = await fetch(classesApiPath, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('Data JSON tidak tersedia.')
  }

  const data = await response.json()
  const remoteClasses = cleanClasses(data.classes) ?? []

  return data.updatedAt || !mergeLocal
    ? remoteClasses
    : mergeClasses(remoteClasses, readClasses())
}

async function fetchStoredWebsiteSettings() {
  const response = await fetch(settingsApiPath, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('Pengaturan website tidak tersedia.')
  }

  const data = await response.json()

  return cleanWebsiteSettings(data.settings)
}

async function fetchStoredMembers() {
  const data = await requestJson(membersApiPath)

  return cleanMembers(data.members)
}

async function fetchStoredDigitalProducts(currentSession) {
  if (currentSession && !['admin', 'member'].includes(currentSession.role)) {
    return { digitalProducts: [], digitalProductAccess: [] }
  }

  const data = await requestJson(digitalProductsApiPath)

  return {
    digitalProducts: cleanDigitalProducts(data.digitalProducts),
    digitalProductAccess: cleanDigitalProductAccess(data.digitalProductAccess),
  }
}

async function fetchStoredSupportTickets(currentSession) {
  const params = new URLSearchParams()

  if (currentSession?.role) {
    params.set('role', currentSession.role)
  }

  if (currentSession?.userId) {
    params.set('userId', currentSession.userId)
  }

  const data = await requestJson(
    params.size ? `${supportApiPath}?${params.toString()}` : supportApiPath,
  )

  return cleanSupportTickets(data.supportTickets)
}

async function fetchStoredSubmissions(currentSession) {
  if (!currentSession) {
    return []
  }

  const params = new URLSearchParams()

  if (currentSession.role) {
    params.set('role', currentSession.role)
  }

  if (currentSession.userId) {
    params.set('userId', currentSession.userId)
  }

  const data = await requestJson(
    params.size ? `${submissionsApiPath}?${params.toString()}` : submissionsApiPath,
  )

  return cleanSubmissions(data.submissions)
}

async function fetchStoredTestimonials(currentSession) {
  const data = await requestJson(testimonialsApiPath, {
    headers: currentSession?.token ? { 'X-Session-Token': currentSession.token } : {},
  })

  return cleanTestimonials(data.testimonials)
}

async function fetchStoredCertificates(currentSession) {
  if (!currentSession || !['admin', 'member'].includes(currentSession.role)) {
    return {
      certificates: [],
      certificateNameChangeRequests: [],
      certificateTemplates: [],
    }
  }

  const data = await requestJson(certificatesApiPath).catch(() => ({
    certificates: [],
    certificateNameChangeRequests: [],
    certificateTemplates: [],
  }))

  return {
    certificates: cleanCertificates(data.certificates),
    certificateNameChangeRequests: cleanCertificateNameChangeRequests(
      data.certificateNameChangeRequests,
    ),
    certificateTemplates: cleanCertificateTemplates(data.certificateTemplates),
  }
}

async function fetchStoredPayments(currentSession) {
  if (!currentSession || !['admin', 'member'].includes(currentSession.role)) {
    return []
  }

  const data = await requestJson(paymentsApiPath)

  return cleanPayments(data.payments)
}

async function fetchPublicActivities() {
  const data = await requestJson(publicActivityApiPath)

  return cleanPublicActivities(data.activities)
}

function App() {
  const [currentPath, setCurrentPath] = useState(() =>
    typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}${window.location.hash}`,
  )
  const [session, setSession] = useState(() => readSession())
  const [page, setPage] = useState(() => getInitialPage(readSession()))
  const [activeSection, setActiveSection] = useState(() => getInitialSection())
  const [loginUsername, setLoginUsername] = useState(
    () => readSession()?.username ?? '',
  )
  const [loginPassword, setLoginPassword] = useState('')
  const [isGoogleLoginLoading, setIsGoogleLoginLoading] = useState(false)
  const [activeMemberMenu, setActiveMemberMenu] = useState(() =>
    getDashboardMenuFromUrl('member'),
  )
  const [activeAdminMenu, setActiveAdminMenu] = useState(() =>
    getDashboardMenuFromUrl('admin'),
  )
  const [classes, setClasses] = useState(() => readClasses())
  const [websiteSettings, setWebsiteSettings] = useState(() => readWebsiteSettings())
  const [members, setMembers] = useState([])
  const [digitalProducts, setDigitalProducts] = useState([])
  const [digitalProductAccess, setDigitalProductAccess] = useState([])
  const [supportTickets, setSupportTickets] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [testimonials, setTestimonials] = useState([])
  const [certificates, setCertificates] = useState([])
  const [certificateNameChangeRequests, setCertificateNameChangeRequests] = useState([])
  const [certificateTemplates, setCertificateTemplates] = useState([])
  const [payments, setPayments] = useState([])
  const [publicActivities, setPublicActivities] = useState([])
  const [isClassesLoaded, setIsClassesLoaded] = useState(false)
  const [isPublicProductsLoaded, setIsPublicProductsLoaded] = useState(false)
  const [isWebsiteSettingsLoaded, setIsWebsiteSettingsLoaded] = useState(false)
  const [isDashboardMenuOpen, setIsDashboardMenuOpen] = useState(false)
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false)
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [memberFocusTarget, setMemberFocusTarget] = useState(null)
  const [pendingCheckoutClassId, setPendingCheckoutClassId] = useState(() => {
    if (typeof window === 'undefined') {
      return ''
    }

    return window.sessionStorage.getItem(pendingClassCheckoutKey) || ''
  })
  const [seenNotificationIds, setSeenNotificationIds] = useState(() =>
    readSeenNotifications(readSession()?.userId),
  )

  useEffect(() => {
    if (!notice) {
      return undefined
    }

    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const updateCurrentPath = () => {
      setCurrentPath(`${window.location.pathname}${window.location.search}${window.location.hash}`)
    }

    const handlePopState = () => {
      updateCurrentPath()
      const currentSession = readSession()
      let nextPage = getPageFromPath(window.location.pathname)

      if (
        currentSession?.role &&
        nextPage !== currentSession.role &&
        !publicInfoPages.includes(nextPage) &&
        !getPublicDetailFromPath(window.location.pathname) &&
        !getPublicCertificateIdFromPath(window.location.pathname)
      ) {
        nextPage = currentSession.role
        window.history.replaceState({}, '', pagePaths[currentSession.role] ?? pagePaths.home)
      }

      setPage(nextPage)
      setActiveSection(nextPage === 'home' ? getInitialSection() : 'home')
      if (nextPage === 'member') {
        setActiveMemberMenu(getDashboardMenuFromUrl('member'))
      }
      if (nextPage === 'admin') {
        setActiveAdminMenu(getDashboardMenuFromUrl('admin'))
      }

      if (nextPage === 'home') {
        scrollToSection(getInitialSection())
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }

    window.addEventListener('popstate', handlePopState)
    window.addEventListener('ibnucreative-route-change', updateCurrentPath)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('ibnucreative-route-change', updateCurrentPath)
    }
  }, [])

  useEffect(() => {
    let isCurrent = true

    fetchStoredClasses({ mergeLocal: true })
      .then((nextClasses) => {
        if (!isCurrent) {
          return
        }

        setClasses((current) =>
          areClassesEqual(current, nextClasses) ? current : nextClasses,
        )
        window.sessionStorage.setItem(classesKey, JSON.stringify(nextClasses))
      })
      .catch(() => {
        // Local fallback remains available if the production API is unreachable.
      })
      .finally(() => {
        if (isCurrent) {
          setIsClassesLoaded(true)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    let isCurrent = true

    fetchStoredWebsiteSettings()
      .then((nextSettings) => {
        if (!isCurrent) {
          return
        }

        setWebsiteSettings(nextSettings)
        window.sessionStorage.setItem(websiteSettingsKey, JSON.stringify(nextSettings))
      })
      .catch(() => {
        // Default settings keep the public website usable if the API is not installed yet.
      })
      .finally(() => {
        if (isCurrent) {
          setIsWebsiteSettingsLoaded(true)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    const safeSettings = cleanWebsiteSettings(websiteSettings)

    document.title = safeSettings.siteTitle || safeSettings.siteName

    let favicon = document.querySelector("link[rel='icon']")

    if (!favicon) {
      favicon = document.createElement('link')
      favicon.rel = 'icon'
      document.head.append(favicon)
    }

    favicon.href = safeSettings.faviconUrl || '/favicon.svg'

    let description = document.querySelector("meta[name='description']")

    if (!description) {
      description = document.createElement('meta')
      description.name = 'description'
      document.head.append(description)
    }

    description.content = safeSettings.siteDescription
  }, [websiteSettings])

  useEffect(() => {
    if (!isClassesLoaded) {
      return undefined
    }

    window.sessionStorage.setItem(
      classesKey,
      JSON.stringify(cleanClasses(classes) ?? []),
    )

    return undefined
  }, [classes, isClassesLoaded])

  useEffect(() => {
    if (!isWebsiteSettingsLoaded) {
      return undefined
    }

    window.sessionStorage.setItem(
      websiteSettingsKey,
      JSON.stringify(cleanWebsiteSettings(websiteSettings)),
    )

    return undefined
  }, [websiteSettings, isWebsiteSettingsLoaded])

  useEffect(() => {
    if (!isClassesLoaded) {
      return undefined
    }

    let isCurrent = true

    const syncFromJsonStore = () => {
      fetchStoredClasses()
        .then((nextClasses) => {
          if (!isCurrent) {
            return
          }

          setClasses((current) => {
            if (areClassesEqual(current, nextClasses)) {
              return current
            }

            window.sessionStorage.setItem(
              classesKey,
              JSON.stringify(nextClasses),
            )
            return nextClasses
          })
        })
        .catch(() => {
          // Keep the latest in-memory data if the remote store is unavailable.
        })
    }

    const handleStorage = (event) => {
      if (event.key === classesSyncKey) {
        syncFromJsonStore()
      }
    }

    const handleVisibility = () => {
      if (!document.hidden) {
        syncFromJsonStore()
      }
    }

    const interval = window.setInterval(syncFromJsonStore, 2000)

    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', syncFromJsonStore)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      isCurrent = false
      window.clearInterval(interval)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', syncFromJsonStore)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [isClassesLoaded])

  useEffect(() => {
    if (!isWebsiteSettingsLoaded) {
      return undefined
    }

    let isCurrent = true

    const syncWebsiteSettings = () => {
      fetchStoredWebsiteSettings()
        .then((nextSettings) => {
          if (!isCurrent) {
            return
          }

          setWebsiteSettings((current) => {
            if (JSON.stringify(cleanWebsiteSettings(current)) === JSON.stringify(nextSettings)) {
              return current
            }

            window.sessionStorage.setItem(websiteSettingsKey, JSON.stringify(nextSettings))
            return nextSettings
          })
        })
        .catch(() => {
          // Keep the latest in-memory settings if the remote store is unavailable.
        })
    }

    const handleStorage = (event) => {
      if (event.key === websiteSettingsSyncKey) {
        syncWebsiteSettings()
      }
    }

    const handleVisibility = () => {
      if (!document.hidden) {
        syncWebsiteSettings()
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', syncWebsiteSettings)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      isCurrent = false
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', syncWebsiteSettings)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [isWebsiteSettingsLoaded])

  useEffect(() => {
    let isCurrent = true

    fetchStoredTestimonials(session)
      .then((nextTestimonials) => {
        if (isCurrent) {
          setTestimonials(nextTestimonials)
        }
      })
      .catch(() => {
        if (isCurrent) {
          setTestimonials((current) => current)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [session])

  useEffect(() => {
    if (!session) {
      return undefined
    }

    let isCurrent = true

    const syncPeopleData = () => {
      const requests = Promise.all([
        fetchStoredMembers(),
        fetchStoredDigitalProducts(session),
        fetchStoredSupportTickets(session),
        fetchStoredSubmissions(session),
        fetchStoredTestimonials(session),
        fetchStoredCertificates(session),
        fetchStoredPayments(session),
      ])

      requests
        .then(([
          nextMembers,
          productData,
          nextSupportTickets,
          nextSubmissions,
          nextTestimonials,
          certificateData,
          nextPayments,
        ]) => {
          if (!isCurrent) {
            return
          }

          setMembers(nextMembers)
          setDigitalProducts(productData.digitalProducts)
          setDigitalProductAccess(productData.digitalProductAccess)
          if (session.role === 'member') {
            const memberAccount = nextMembers.find((member) => member.id === session.userId)
            const nextSession = syncSessionWithMemberAccount(session, memberAccount)

            if (JSON.stringify(nextSession) !== JSON.stringify(session)) {
              saveSession(nextSession)
              setSession(nextSession)
            }
          }
          setSupportTickets(nextSupportTickets)
          setSubmissions(nextSubmissions)
          setTestimonials(nextTestimonials)
          setCertificates(certificateData.certificates)
          setCertificateNameChangeRequests(certificateData.certificateNameChangeRequests)
          setCertificateTemplates(certificateData.certificateTemplates)
          setPayments(nextPayments)
        })
        .catch(() => {
          if (isCurrent) {
            setMembers((current) => current)
            setDigitalProducts((current) => current)
            setDigitalProductAccess((current) => current)
            setSupportTickets((current) => current)
            setSubmissions((current) => current)
            setTestimonials((current) => current)
            setCertificates((current) => current)
            setCertificateNameChangeRequests((current) => current)
            setCertificateTemplates((current) => current)
            setPayments((current) => current)
          }
        })
    }

    const handleStorage = (event) => {
      if (event.key === peopleSyncKey) {
        syncPeopleData()
      }
    }

    const handleVisibility = () => {
      if (!document.hidden) {
        syncPeopleData()
      }
    }

    syncPeopleData()
    const interval = window.setInterval(syncPeopleData, 2500)

    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', syncPeopleData)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      isCurrent = false
      window.clearInterval(interval)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', syncPeopleData)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [session])

  const showNotice = (message) => {
    setNotice(message)
  }

  const navigateToPage = (nextPage, { replace = false, sectionId = '' } = {}) => {
    const path = pagePaths[nextPage] ?? pagePaths.home
    const hash = nextPage === 'home' && sectionId && sectionId !== 'home'
      ? `#${sectionId}`
      : ''
    const nextUrl = `${path}${hash}`

    setPage(nextPage)

    if (window.location.pathname + window.location.hash !== nextUrl) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', nextUrl)
    }
  }

  const navigateToDashboardMenu = (role, menuId, { replace = false } = {}) => {
    const path = pagePaths[role] ?? pagePaths.home
    const query = menuId && menuId !== 'overview' ? `?menu=${menuId}` : ''
    const nextUrl = `${path}${query}`

    setPage(role)
    if (role === 'admin') {
      setActiveAdminMenu(menuId)
    } else {
      setActiveMemberMenu(menuId)
    }

    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', nextUrl)
    }

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goToHomeSection = (sectionId = 'home') => {
    setActiveSection(sectionId)
    navigateToPage('home', { sectionId })
    scrollToSection(sectionId)
  }

  const goToLogin = () => {
    setActiveSection('home')
    navigateToPage('login')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goToPublicInfoPage = (nextPage) => {
    setActiveSection('home')
    navigateToPage(nextPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goToDashboard = () => {
    if (!session) {
      goToLogin()
      return
    }

    navigateToPage(session.role)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openPublicProductDetail = (product) => {
    const productCode = product?.publicCode || product?.id

    if (!productCode) {
      showNotice('Detail produk belum bisa dibuka.')
      return
    }

    const nextPath = `/produk/${encodeURIComponent(productCode)}`

    setActiveSection('home')
    setPage('home')
    setCurrentPath(nextPath)
    window.history.pushState({ publicDetailFromApp: true }, '', nextPath)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const applyLoginSession = (nextSession, message) => {
    if (!nextSession || !allowedRoles.includes(nextSession.role)) {
      throw new Error('Session login tidak valid.')
    }

    saveSession(nextSession)
    setSession(nextSession)
    setSeenNotificationIds(readSeenNotifications(nextSession.userId))
    setLoginUsername(nextSession.username)
    setLoginPassword('')
    setActiveSection('home')
    setIsDashboardMenuOpen(false)
    const pendingClassId =
      nextSession.role === 'member'
        ? pendingCheckoutClassId ||
          (typeof window !== 'undefined'
            ? window.sessionStorage.getItem(pendingClassCheckoutKey) || ''
            : '')
        : ''

    if (pendingClassId) {
      setPendingCheckoutClassId(pendingClassId)
      navigateToDashboardMenu(nextSession.role, 'available-classes', { replace: true })
    } else {
      navigateToDashboardMenu(nextSession.role, 'overview', { replace: true })
    }
    showNotice(message || `Berhasil masuk sebagai ${nextSession.role}.`)
  }

  const requestPublicClassCheckout = (classId) => {
    const nextClassId = cleanText(classId || '')

    if (!nextClassId) {
      return
    }

    setPendingCheckoutClassId(nextClassId)
    window.sessionStorage.setItem(pendingClassCheckoutKey, nextClassId)

    if (session?.role === 'member') {
      navigateToDashboardMenu('member', 'available-classes')
      return
    }

    goToLogin()
    showNotice('Silakan login dulu untuk melanjutkan pembayaran kelas.')
  }

  const clearPendingClassCheckout = () => {
    setPendingCheckoutClassId('')
    window.sessionStorage.removeItem(pendingClassCheckoutKey)
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setIsGoogleLoginLoading(false)

    try {
      const data = await requestJson(loginApiPath, {
        method: 'POST',
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      })
      const nextSession = data.session

      applyLoginSession(nextSession, `Berhasil masuk sebagai ${nextSession.role}.`)
    } catch (error) {
      showNotice(error.message || 'Login gagal.')
    }
  }

  const handleGoogleLogin = async () => {
    setIsGoogleLoginLoading(true)

    try {
      const data = await requestJson(googleAuthUrlApiPath)

      if (!data.url) {
        throw new Error('URL login Google tidak tersedia.')
      }

      window.location.href = data.url
      window.setTimeout(() => {
        if (!document.hidden) {
          setIsGoogleLoginLoading(false)
        }
      }, 2500)
    } catch (error) {
      setIsGoogleLoginLoading(false)
      showNotice(error.message || 'Login Google belum bisa dibuka.')
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const resetStaleGoogleLoading = () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const hasOauthResponse =
        hashParams.has('access_token') ||
        hashParams.has('error') ||
        hashParams.has('error_description')

      if (!hasOauthResponse && getPageFromPath(window.location.pathname) === 'login') {
        setIsGoogleLoginLoading(false)
      }
    }

    window.addEventListener('pageshow', resetStaleGoogleLoading)
    window.addEventListener('focus', resetStaleGoogleLoading)
    document.addEventListener('visibilitychange', resetStaleGoogleLoading)

    return () => {
      window.removeEventListener('pageshow', resetStaleGoogleLoading)
      window.removeEventListener('focus', resetStaleGoogleLoading)
      document.removeEventListener('visibilitychange', resetStaleGoogleLoading)
    }
  }, [])

  useEffect(() => {
    let isCurrent = true

    Promise.allSettled([
      fetchStoredDigitalProducts(null),
      fetchStoredMembers(),
      fetchPublicActivities(),
    ])
      .then(([productResult, memberResult, publicActivityResult]) => {
        if (!isCurrent) {
          return
        }

        if (productResult.status === 'fulfilled') {
          setDigitalProducts(productResult.value.digitalProducts)
          setDigitalProductAccess(productResult.value.digitalProductAccess)
        }

        if (memberResult.status === 'fulfilled') {
          setMembers(memberResult.value)
        }

        if (publicActivityResult.status === 'fulfilled') {
          setPublicActivities(publicActivityResult.value)
        }
      })
      .catch(() => {
        // Homepage remains usable if public activity data is temporarily unavailable.
      })
      .finally(() => {
        if (isCurrent) {
          setIsPublicProductsLoaded(true)
        }
      })

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    const accessToken = params.get('access_token')
    const errorMessage =
      params.get('error_description') ||
      params.get('error') ||
      query.get('error_description') ||
      query.get('error')

    if (
      window.location.pathname !== '/auth/google/callback' &&
      !accessToken &&
      !errorMessage
    ) {
      return
    }

    const backToLogin = (message) => {
      window.history.replaceState({}, '', pagePaths.login)
      window.setTimeout(() => {
        setIsGoogleLoginLoading(false)
        setPage('login')
        showNotice(message)
      }, 0)
    }

    if (errorMessage) {
      backToLogin(errorMessage)
      return
    }

    if (!accessToken) {
      backToLogin('Token login Google tidak ditemukan.')
      return
    }

    let isCurrent = true
    window.history.replaceState({}, '', pagePaths.login)

    Promise.resolve()
      .then(() => {
        if (isCurrent) {
          setIsGoogleLoginLoading(true)
        }

        return requestJson(googleLoginApiPath, {
          method: 'POST',
          body: JSON.stringify({ accessToken }),
        })
      })
      .then((data) => {
        if (!isCurrent) {
          return
        }

        applyLoginSession(data.session, 'Berhasil masuk dengan akun Google.')
      })
      .catch((error) => {
        if (!isCurrent) {
          return
        }

        window.history.replaceState({}, '', pagePaths.login)
        setPage('login')
        showNotice(error.message || 'Login Google gagal.')
      })
      .finally(() => {
        if (isCurrent) {
          setIsGoogleLoginLoading(false)
        }
      })

    return () => {
      isCurrent = false
    }
    // Callback OAuth hanya perlu diproses sekali saat halaman dibuka dari Google.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const requestLogout = () => {
    setIsLogoutConfirmOpen(true)
  }

  const handleLogout = () => {
    fetch(logoutApiPath, {
      method: 'POST',
      cache: 'no-store',
      headers: session?.token ? { 'X-Session-Token': session.token } : {},
    }).catch(() => {
      // Local preview may not have a PHP session; browser session cleanup still happens.
    })
    clearSession()
    setSession(null)
    setSeenNotificationIds([])
    setIsDashboardMenuOpen(false)
    setIsLogoutConfirmOpen(false)
    navigateToPage('home', { replace: true })
    showNotice('Anda sudah logout. Session browser dibersihkan.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const notifications = session
    ? buildNotifications(session, supportTickets, submissions)
    : []
  const unreadNotificationCount = notifications.filter(
    (item) => !seenNotificationIds.includes(item.id),
  ).length

  const openNotificationTarget = (notification) => {
    if (!session || !notification?.menuId) {
      return
    }

    const nextSeen = [...new Set([...seenNotificationIds, notification.id])]
    setSeenNotificationIds(nextSeen)
    saveSeenNotifications(session.userId, nextSeen)
    if (session.role === 'member' && notification.target) {
      setMemberFocusTarget({
        ...notification.target,
        openedAt: Date.now(),
      })
    }
    navigateToDashboardMenu(session.role, notification.menuId)
  }

  const handleSaveProfile = ({ name, avatar, email, currentPassword, password }) => {
    if (!session) {
      return
    }
    const nextSession = {
      ...session,
      name: cleanText(name) || 'Sahabat Kreatif',
      email: session.role === 'admin' ? cleanEmail(email || session.email || '') : session.email,
      avatar: cleanAvatar(avatar),
    }

    requestJson(profileApiPath, {
      method: 'PUT',
      body: JSON.stringify({
        userId: session.userId,
        role: session.role,
        username: session.username,
        name: nextSession.name,
        email: nextSession.email,
        currentPassword,
        password,
        avatar: nextSession.avatar,
      }),
    })
      .then((data) => {
        const savedSession = {
          ...nextSession,
          ...(data.session ?? {}),
          avatar: cleanAvatar(data.session?.avatar ?? nextSession.avatar),
          email: cleanEmail(data.session?.email ?? nextSession.email ?? ''),
        }

        saveSession(savedSession)
        setSession(savedSession)
        setIsProfileEditorOpen(false)
        announcePeopleSync()
        showNotice('Profil berhasil diperbarui.')
      })
      .catch((error) => {
        showNotice(error.message || 'Profil tidak bisa disimpan.')
      })
  }

  const applyMembersResponse = (data) => {
    const nextMembers = cleanMembers(data.members)

    setMembers(nextMembers)
    announcePeopleSync()
    return nextMembers
  }

  const applyDigitalProductsResponse = (data) => {
    const nextProducts = cleanDigitalProducts(data.digitalProducts)
    const nextAccess = cleanDigitalProductAccess(data.digitalProductAccess)

    setDigitalProducts(nextProducts)
    setDigitalProductAccess(nextAccess)
    return nextProducts
  }

  const applySupportResponse = (data) => {
    const nextSupportTickets = cleanSupportTickets(data.supportTickets)

    setSupportTickets(nextSupportTickets)
    announcePeopleSync()
    return nextSupportTickets
  }

  const applySubmissionsResponse = (data) => {
    const nextSubmissions = cleanSubmissions(data.submissions)

    setSubmissions(nextSubmissions)
    announcePeopleSync()
    return nextSubmissions
  }

  const applyTestimonialsResponse = (data) => {
    const nextTestimonials = cleanTestimonials(data.testimonials)

    setTestimonials(nextTestimonials)
    announcePeopleSync()
    return nextTestimonials
  }

  const applyCertificatesResponse = (data) => {
    const nextCertificates = cleanCertificates(data.certificates)
    const nextRequests = cleanCertificateNameChangeRequests(
      data.certificateNameChangeRequests,
    )
    const nextTemplates = cleanCertificateTemplates(data.certificateTemplates)

    setCertificates(nextCertificates)
    setCertificateNameChangeRequests(nextRequests)
    setCertificateTemplates(nextTemplates)
    announcePeopleSync()
    return {
      certificates: nextCertificates,
      certificateNameChangeRequests: nextRequests,
      certificateTemplates: nextTemplates,
      certificate: data.certificate ? cleanCertificates([data.certificate])[0] : null,
      template: data.template ? cleanCertificateTemplates([data.template])[0] : null,
      message: data.message || '',
    }
  }

  const handleClassesChange = async (updater) => {
    if (session?.role !== 'admin') {
      throw new Error('Silakan login admin ulang untuk menyimpan kelas.')
    }

    const rawClasses = typeof updater === 'function' ? updater(classes) : updater
    const safeClasses = cleanClasses(rawClasses) ?? []
    const data = await requestJson(classesApiPath, {
      method: 'PUT',
      body: JSON.stringify({ classes: safeClasses }),
    })
    const nextClasses = cleanClasses(data.classes) ?? safeClasses

    setClasses(nextClasses)
    window.sessionStorage.setItem(classesKey, JSON.stringify(nextClasses))
    announceClassesSync()
    return nextClasses
  }

  const handleDigitalProductsChange = async (updater) => {
    if (session?.role !== 'admin') {
      throw new Error('Silakan login admin ulang untuk menyimpan produk digital.')
    }

    const rawProducts = typeof updater === 'function' ? updater(digitalProducts) : updater
    const safeProducts = cleanDigitalProducts(rawProducts)
    const data = await requestJson(digitalProductsApiPath, {
      method: 'PUT',
      body: JSON.stringify({ digitalProducts: safeProducts }),
    })

    return applyDigitalProductsResponse(data)
  }

  const handleDigitalProductReviewLike = async ({ productId, reviewId, liked }) => {
    const data = await requestJson(digitalProductReviewLikeApiPath, {
      method: 'POST',
      body: JSON.stringify({ productId, reviewId, liked }),
    })

    return applyDigitalProductsResponse(data)
  }

  const handleWebsiteSettingsChange = async (nextSettings) => {
    if (session?.role !== 'admin') {
      throw new Error('Silakan login admin ulang untuk menyimpan pengaturan.')
    }

    const safeSettings = cleanWebsiteSettings(nextSettings)
    const data = await requestJson(settingsApiPath, {
      method: 'PUT',
      body: JSON.stringify({ settings: safeSettings }),
    })
    const savedSettings = cleanWebsiteSettings(data.settings || safeSettings)

    setWebsiteSettings(savedSettings)
    window.sessionStorage.setItem(websiteSettingsKey, JSON.stringify(savedSettings))
    announceWebsiteSettingsSync()

    return savedSettings
  }

  const handleSyncTripayPaymentMethods = async () => {
    if (session?.role !== 'admin') {
      throw new Error('Silakan login admin ulang untuk sinkron metode pembayaran.')
    }

    const data = await requestJson(tripayPaymentMethodsApiPath)
    const paymentMethods = Array.isArray(data.paymentMethods) ? data.paymentMethods : []

    if (!paymentMethods.length) {
      throw new Error('Metode pembayaran aktif dari Tripay belum bisa dibaca.')
    }

    const syncedSettings = cleanWebsiteSettings({
      ...websiteSettings,
      paymentMethods,
    })

    setWebsiteSettings(syncedSettings)
    window.sessionStorage.setItem(websiteSettingsKey, JSON.stringify(syncedSettings))
    announceWebsiteSettingsSync()

    return syncedSettings.paymentMethods
  }

  const refreshDataAfterRestore = async () => {
    const [
      nextClasses,
      nextMembers,
      productData,
      nextSupportTickets,
      nextSubmissions,
      nextTestimonials,
      nextPayments,
      nextSettings,
    ] = await Promise.all([
      fetchStoredClasses(),
      fetchStoredMembers(),
      fetchStoredDigitalProducts(session),
      fetchStoredSupportTickets(session),
      fetchStoredSubmissions(session),
      fetchStoredTestimonials(session),
      fetchStoredPayments(session),
      fetchStoredWebsiteSettings(),
    ])

    setClasses(nextClasses)
    setMembers(nextMembers)
    setDigitalProducts(productData.digitalProducts)
    setDigitalProductAccess(productData.digitalProductAccess)
    setSupportTickets(nextSupportTickets)
    setSubmissions(nextSubmissions)
    setTestimonials(nextTestimonials)
    setPayments(nextPayments)
    setWebsiteSettings(nextSettings)
    window.sessionStorage.setItem(classesKey, JSON.stringify(nextClasses))
    window.sessionStorage.setItem(websiteSettingsKey, JSON.stringify(nextSettings))
    announceClassesSync()
    announcePeopleSync()
    announceWebsiteSettingsSync()

    return nextSettings
  }

  const handleDownloadBackup = async () => {
    if (session?.role !== 'admin') {
      throw new Error('Silakan login admin ulang untuk backup data.')
    }

    const response = await fetch(backupApiPath, {
      cache: 'no-store',
      headers: {
        ...(session.token ? { 'X-Session-Token': session.token } : {}),
      },
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.message || 'Backup tidak bisa dibuat.')
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const fallbackName = `backup-ibnucreative-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    const disposition = response.headers.get('Content-Disposition') || ''
    const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i)

    link.href = url
    link.download = fileNameMatch?.[1] || fallbackName
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    showNotice('Backup data berhasil didownload.')
  }

  const handleRestoreBackup = async (backupData) => {
    if (session?.role !== 'admin') {
      throw new Error('Silakan login admin ulang untuk restore data.')
    }

    await requestJson(backupApiPath, {
      method: 'POST',
      body: JSON.stringify({ backup: backupData }),
    })

    return refreshDataAfterRestore()
  }

  const handleCreateMember = async (memberData) => {
    const data = await requestJson(membersApiPath, {
      method: 'POST',
      body: JSON.stringify(memberData),
    })

    return applyMembersResponse(data)
  }

  const handleUpdateMember = async (memberData) => {
    const data = await requestJson(membersApiPath, {
      method: 'PUT',
      body: JSON.stringify(memberData),
    })

    return applyMembersResponse(data)
  }

  const handleDeleteMember = async (memberId) => {
    const data = await requestJson(
      `${membersApiPath}?id=${encodeURIComponent(memberId)}`,
      {
        method: 'DELETE',
      },
    )

    return applyMembersResponse(data)
  }

  const handleCreateSupportTicket = async ({ message, subject }) => {
    if (!session) {
      throw new Error('Silakan login ulang untuk mengirim bantuan.')
    }

    const data = await requestJson(supportApiPath, {
      method: 'POST',
      body: JSON.stringify({
        memberId: session.userId,
        memberName: session.name,
        subject,
        message,
      }),
    })

    return applySupportResponse(data)
  }

  const handleReplySupportTicket = async ({ id, message, status }) => {
    if (!session) {
      throw new Error('Silakan login ulang untuk membalas bantuan.')
    }

    const data = await requestJson(supportApiPath, {
      method: 'PUT',
      body: JSON.stringify({
        id,
        message,
        status,
        senderRole: session.role,
        senderName: session.name,
        memberId: session.userId,
      }),
    })

    return applySupportResponse(data)
  }

  const handleCreateSubmission = async (submissionData) => {
    if (!session) {
      throw new Error('Silakan login ulang untuk mengirim tugas.')
    }

    const data = await requestJson(submissionsApiPath, {
      method: 'POST',
      body: JSON.stringify({
        ...submissionData,
        memberId: session.userId,
        memberName: session.name,
      }),
    })

    return applySubmissionsResponse(data)
  }

  const handleTrackProgress = async (progressData) => {
    if (session?.role !== 'member') {
      return { ok: false }
    }

    return requestJson('/api/progress', {
      method: 'POST',
      body: JSON.stringify(progressData),
    })
  }

  const handleUpdateSubmission = async (submissionData) => {
    const data = await requestJson(submissionsApiPath, {
      method: 'PUT',
      body: JSON.stringify(submissionData),
    })

    return applySubmissionsResponse(data)
  }

  const handleCreateTestimonial = async (testimonialData) => {
    if (!session) {
      throw new Error('Silakan login ulang untuk mengirim testimoni.')
    }

    const data = await requestJson(testimonialsApiPath, {
      method: 'POST',
      body: JSON.stringify(testimonialData),
    })

    return applyTestimonialsResponse(data)
  }

  const handleUpdateTestimonial = async (testimonialData) => {
    const data = await requestJson(testimonialsApiPath, {
      method: 'PUT',
      body: JSON.stringify(testimonialData),
    })

    return applyTestimonialsResponse(data)
  }

  const handleDeleteTestimonial = async (testimonialId) => {
    const data = await requestJson(
      `${testimonialsApiPath}?id=${encodeURIComponent(testimonialId)}`,
      { method: 'DELETE' },
    )

    return applyTestimonialsResponse(data)
  }

  const handleCreateCertificate = async (certificateData) => {
    if (!session) {
      throw new Error('Silakan login ulang untuk membuat sertifikat.')
    }

    const data = await requestJson(certificatesApiPath, {
      method: 'POST',
      body: JSON.stringify({
        action: 'create',
        ...certificateData,
      }),
    })

    return applyCertificatesResponse(data)
  }

  const handleRequestCertificateNameChange = async (requestData) => {
    if (!session) {
      throw new Error('Silakan login ulang untuk mengajukan perubahan nama.')
    }

    const data = await requestJson(certificatesApiPath, {
      method: 'POST',
      body: JSON.stringify({
        action: 'request_name_change',
        ...requestData,
      }),
    })

    return applyCertificatesResponse(data)
  }

  const handleReviewCertificateNameChange = async (requestData) => {
    if (session?.role !== 'admin') {
      throw new Error('Silakan login admin ulang untuk meninjau sertifikat.')
    }

    const data = await requestJson(certificatesApiPath, {
      method: 'PUT',
      body: JSON.stringify(requestData),
    })

    return applyCertificatesResponse(data)
  }

  const handleSaveCertificateTemplate = async (templateData) => {
    if (session?.role !== 'admin') {
      throw new Error('Silakan login admin ulang untuk menyimpan template.')
    }

    const data = await requestJson(certificatesApiPath, {
      method: 'POST',
      body: JSON.stringify({
        action: 'save_template',
        template: templateData,
      }),
    })

    return applyCertificatesResponse(data)
  }

  const handleDuplicateCertificateTemplate = async (templateData) => {
    if (session?.role !== 'admin') {
      throw new Error('Silakan login admin ulang untuk duplicate template.')
    }

    const data = await requestJson(certificatesApiPath, {
      method: 'POST',
      body: JSON.stringify({
        action: 'duplicate_template',
        ...templateData,
      }),
    })

    return applyCertificatesResponse(data)
  }

  const handleDeleteCertificateTemplate = async (templateId) => {
    if (session?.role !== 'admin') {
      throw new Error('Silakan login admin ulang untuk menghapus template.')
    }

    const data = await requestJson(
      `${certificatesApiPath}?templateId=${encodeURIComponent(templateId)}`,
      { method: 'DELETE' },
    )

    return applyCertificatesResponse(data)
  }

  const handleUpdateSupportTicket = async (ticketData) => {
    const data = await requestJson(supportApiPath, {
      method: 'PUT',
      body: JSON.stringify({
        ...ticketData,
        senderRole: session?.role,
        senderName: session?.name,
      }),
    })

    return applySupportResponse(data)
  }

  const handleDeleteSupportTicket = async (ticketId) => {
    const data = await requestJson(
      `${supportApiPath}?id=${encodeURIComponent(ticketId)}`,
      {
        method: 'DELETE',
      },
    )

    return applySupportResponse(data)
  }

  const handleCreateTripayCheckout = async (item, paymentMethod = '', options = {}) => {
    if (session?.role !== 'member') {
      throw new Error('Silakan login member untuk membeli.')
    }

    const data = await requestJson(tripayCheckoutApiPath, {
      method: 'POST',
      body: JSON.stringify({
        classId: options.itemType === 'digital_product' ? '' : item.id,
        productId: options.itemType === 'digital_product' ? item.id : '',
        memberId: session.userId,
        paymentMethod,
        forceNewPayment: options.forceNewPayment === true,
      }),
    })

    if (data.alreadyHasAccess || data.freeAccessGranted) {
      const [nextMembers, productData] = await Promise.all([
        fetchStoredMembers(),
        fetchStoredDigitalProducts(session),
      ])

      setMembers(nextMembers)
      setDigitalProducts(productData.digitalProducts)
      setDigitalProductAccess(productData.digitalProductAccess)
      announcePeopleSync()
      return data
    }

    if (!data.checkoutUrl) {
      throw new Error('Link pembayaran Tripay belum tersedia.')
    }

    window.location.assign(data.checkoutUrl)

    return data
  }

  const handlePublicProductCheckout = async (payload) => {
    const data = await requestJson(publicProductCheckoutApiPath, {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    showNotice(data.message || 'Checkout produk digital berhasil dibuat.')
    return data
  }

  const currentMember = session?.role === 'member'
    ? members.find((member) => member.id === session.userId)
    : null
  const currentMemberAccess = session?.role === 'member'
    ? currentMember
      ? currentMember.allowedClassIds
      : session.allowedClassIds
    : null
  const checkoutCustomer = session?.role === 'member'
    ? {
        isMember: true,
        name: currentMember?.name || session.name || 'Member',
        email: currentMember?.email || session.email || '',
        phone: currentMember?.phone || '',
      }
    : null
  const memberClasses = session?.role === 'member' && Array.isArray(currentMemberAccess)
    ? classes.filter((course) => currentMemberAccess.includes(course.id))
    : classes
  const publicDetailTarget = typeof window === 'undefined'
    ? null
    : getPublicDetailFromPath(currentPath.split(/[?#]/)[0] || '/')
  const publicCertificateId = typeof window === 'undefined'
    ? ''
    : getPublicCertificateIdFromPath(currentPath.split(/[?#]/)[0] || '/')
  const isPublicDetailPath = typeof window !== 'undefined' && /^\/(kelas|produk|produk-akses)\//.test(currentPath.split(/[?#]/)[0] || '/')
  const isPublicCertificatePath = Boolean(publicCertificateId)
  const shouldShowSiteFooter = !isPublicDetailPath && !isPublicCertificatePath && (publicInfoPages.includes(page) || (page === 'home' && !publicDetailTarget))

  return (
    <div className="app-shell">
      <Header
        activePage={page}
        activeSection={activeSection}
        session={session}
        settings={websiteSettings}
        showDashboardMenu={Boolean(session && page === session.role)}
        onToggleDashboardMenu={() => setIsDashboardMenuOpen(true)}
        onHomeSection={goToHomeSection}
        onLogin={goToLogin}
        onEditProfile={() => setIsProfileEditorOpen(true)}
        onLogout={requestLogout}
        notifications={notifications}
        unreadNotificationCount={unreadNotificationCount}
        onOpenNotification={openNotificationTarget}
      />
      <main>
        {page === 'home' && publicCertificateId && (
          <CertificateVerifyPage
            certificateId={publicCertificateId}
            apiPath={certificatesApiPath}
            settings={websiteSettings}
          />
        )}
        {page === 'home' && !publicCertificateId && (
          <HomePage
            isLoggedIn={Boolean(session)}
            onLogin={goToDashboard}
            onExplore={goToHomeSection}
            onRequestClassCheckout={requestPublicClassCheckout}
            onPublicProductCheckout={handlePublicProductCheckout}
            publicProductAccessApiPath={publicProductAccessApiPath}
            initialDetail={publicDetailTarget}
            isClassesLoaded={isClassesLoaded}
            isProductsLoaded={isPublicProductsLoaded}
            checkoutCustomer={checkoutCustomer}
            classes={classes}
            digitalProducts={digitalProducts}
            testimonials={testimonials}
            settings={websiteSettings}
            members={members}
            payments={payments}
            digitalProductAccess={digitalProductAccess}
            publicActivities={publicActivities}
            onDigitalProductReviewLike={handleDigitalProductReviewLike}
          />
        )}
        {page === 'login' && (
          <LoginPage
            username={loginUsername}
            onUsernameChange={setLoginUsername}
            password={loginPassword}
            onPasswordChange={setLoginPassword}
            onSubmit={handleLogin}
            onGoogleLogin={handleGoogleLogin}
            isGoogleLoading={isGoogleLoginLoading}
          />
        )}
        {publicInfoPages.includes(page) && (
          <PublicInfoPage page={page} settings={websiteSettings} onLogin={goToLogin} />
        )}
        {page === 'member' &&
          (session?.role === 'member' ? (
            <MemberPage
              key={session.userId}
              userId={session.userId}
              loginName={session.name}
              avatar={session.avatar}
              sessionToken={session.token}
              classes={memberClasses}
              allClasses={classes}
              digitalProducts={digitalProducts}
              digitalProductAccess={digitalProductAccess}
              allowedClassIds={currentMemberAccess}
              supportTickets={supportTickets}
              submissions={submissions}
              testimonials={testimonials}
              certificates={certificates}
              certificateNameChangeRequests={certificateNameChangeRequests}
              certificateTemplates={certificateTemplates}
              payments={payments}
              focusTarget={memberFocusTarget}
              checkoutClassRequestId={pendingCheckoutClassId}
              websiteSettings={websiteSettings}
              activeMenu={activeMemberMenu}
              onMenuChange={(menuId) => navigateToDashboardMenu('member', menuId)}
              isMenuOpen={isDashboardMenuOpen}
              onCloseMenu={() => setIsDashboardMenuOpen(false)}
              onNotify={showNotice}
              onCreateSupportTicket={handleCreateSupportTicket}
              onReplySupportTicket={handleReplySupportTicket}
              onCreateSubmission={handleCreateSubmission}
              onTrackProgress={handleTrackProgress}
              onCreateTestimonial={handleCreateTestimonial}
              onCreateCertificate={handleCreateCertificate}
              onRequestCertificateNameChange={handleRequestCertificateNameChange}
              onCreateTripayCheckout={handleCreateTripayCheckout}
              onOpenPublicProductDetail={openPublicProductDetail}
              onCheckoutClassRequestHandled={clearPendingClassCheckout}
            />
          ) : (
            <LoginPage
              username={loginUsername}
              onUsernameChange={setLoginUsername}
              password={loginPassword}
              onPasswordChange={setLoginPassword}
              onSubmit={handleLogin}
              onGoogleLogin={handleGoogleLogin}
              isGoogleLoading={isGoogleLoginLoading}
            />
          ))}
        {page === 'admin' &&
          (session?.role === 'admin' ? (
            <AdminPage
              loginName={session.name}
              avatar={session.avatar}
              sessionToken={session.token}
              classes={classes}
              digitalProducts={digitalProducts}
              digitalProductAccess={digitalProductAccess}
              members={members}
              supportTickets={supportTickets}
              submissions={submissions}
              testimonials={testimonials}
              certificates={certificates}
              certificateNameChangeRequests={certificateNameChangeRequests}
              certificateTemplates={certificateTemplates}
              payments={payments}
              publicActivities={publicActivities}
              websiteSettings={websiteSettings}
              onClassesChange={handleClassesChange}
              onDigitalProductsChange={handleDigitalProductsChange}
              onWebsiteSettingsChange={handleWebsiteSettingsChange}
              onSyncTripayPaymentMethods={handleSyncTripayPaymentMethods}
              onDownloadBackup={handleDownloadBackup}
              onRestoreBackup={handleRestoreBackup}
              onCreateMember={handleCreateMember}
              onUpdateMember={handleUpdateMember}
              onDeleteMember={handleDeleteMember}
              onUpdateSupportTicket={handleUpdateSupportTicket}
              onDeleteSupportTicket={handleDeleteSupportTicket}
              onUpdateSubmission={handleUpdateSubmission}
              onUpdateTestimonial={handleUpdateTestimonial}
              onDeleteTestimonial={handleDeleteTestimonial}
              onReviewCertificateNameChange={handleReviewCertificateNameChange}
              onSaveCertificateTemplate={handleSaveCertificateTemplate}
              onDuplicateCertificateTemplate={handleDuplicateCertificateTemplate}
              onDeleteCertificateTemplate={handleDeleteCertificateTemplate}
              activeMenu={activeAdminMenu}
              onMenuChange={(menuId) => navigateToDashboardMenu('admin', menuId)}
              isMenuOpen={isDashboardMenuOpen}
              onCloseMenu={() => setIsDashboardMenuOpen(false)}
              onNotify={showNotice}
            />
          ) : (
            <LoginPage
              username={loginUsername}
              onUsernameChange={setLoginUsername}
              password={loginPassword}
              onPasswordChange={setLoginPassword}
              onSubmit={handleLogin}
              onGoogleLogin={handleGoogleLogin}
              isGoogleLoading={isGoogleLoginLoading}
            />
          ))}
      </main>
      {shouldShowSiteFooter && (
        <SiteFooter
          onHomeSection={goToHomeSection}
          onInfoPage={goToPublicInfoPage}
          settings={websiteSettings}
        />
      )}
      {notice && (
        <div className="app-toast" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      {session && isProfileEditorOpen && (
        <ProfileEditor
          session={session}
          onClose={() => setIsProfileEditorOpen(false)}
          onSave={handleSaveProfile}
          onNotify={showNotice}
        />
      )}
      {isLogoutConfirmOpen && (
        <ConfirmDialog
          title="Yakin ingin logout?"
          message="Session akun akan dibersihkan dari browser ini. Anda perlu login ulang untuk masuk ke dashboard."
          confirmLabel="Ya, Logout"
          cancelLabel="Tetap Masuk"
          onCancel={() => setIsLogoutConfirmOpen(false)}
          onConfirm={handleLogout}
        />
      )}
    </div>
  )
}

function BrandMark({ settings }) {
  const safeSettings = cleanWebsiteSettings(settings)

  return (
    <span className="brand-mark" aria-hidden="true">
      {safeSettings.brandLogo ? (
        <img src={safeSettings.brandLogo} alt="" />
      ) : (
        <Icon name={safeSettings.brandIcon} />
      )}
    </span>
  )
}

function PublicInfoPage({ page, settings, onLogin }) {
  const safeSettings = cleanWebsiteSettings(settings)
  const pages = {
    about: {
      eyebrow: 'Tentang Kami',
      title: `Tentang ${safeSettings.siteName}`,
      description:
        `${safeSettings.siteName} adalah platform kelas online kreatif yang membantu member belajar desain, video, konten digital, dan strategi jualan melalui materi praktik, tugas, dan arahan mentor.`,
      sections: [
        {
          title: 'Fokus layanan',
          items: [
            'Menyediakan akses kelas online berbasis materi digital.',
            'Membantu member belajar melalui modul, tugas praktik, dan feedback.',
            'Mengelola akses kelas gratis maupun berbayar secara digital.',
          ],
        },
        {
          title: 'Cara belajar',
          items: [
            'Member login ke dashboard untuk membuka kelas yang sudah dimiliki.',
            'Materi bisa berupa video, teks, gambar referensi, dan instruksi tugas.',
            'Member dapat mengirim tugas dan menerima balasan mentor dari dashboard.',
          ],
        },
      ],
    },
    contact: {
      eyebrow: 'Kontak Support',
      title: 'Kontak Support',
      description:
        'Jika mengalami kendala login, akses kelas, pembayaran, atau materi belajar, member dapat menghubungi support melalui dashboard member atau kanal kontak resmi yang tersedia di website.',
      sections: [
        {
          title: 'Bantuan member',
          items: [
            'Login ke dashboard member.',
            'Buka menu Bantuan Mentor atau Support.',
            'Kirim pertanyaan dengan detail kendala agar tim dapat menindaklanjuti.',
          ],
        },
        {
          title: 'Informasi yang perlu disiapkan',
          items: [
            'Nama akun atau username member.',
            'Judul kelas yang bermasalah.',
            'Bukti pembayaran jika kendala terkait transaksi.',
          ],
        },
      ],
      actionLabel: 'Login untuk Support',
    },
    privacy: {
      eyebrow: 'Kebijakan Privasi',
      title: 'Kebijakan Privasi',
      description:
        `Kebijakan ini menjelaskan bagaimana ${safeSettings.siteName} mengelola data pengguna saat menggunakan website, dashboard member, dan layanan kelas online.`,
      sections: [
        {
          title: 'Data yang dikumpulkan',
          items: [
            'Nama, username, email, dan informasi profil yang diberikan saat pendaftaran.',
            'Data akses kelas, progress belajar, tugas, dan komunikasi support.',
            'Data transaksi yang diperlukan untuk memproses pembayaran dan membuka akses kelas.',
          ],
        },
        {
          title: 'Penggunaan data',
          items: [
            'Memproses login dan menjaga keamanan akun.',
            'Memberikan akses kelas, menyimpan progress belajar, dan mengelola tugas.',
            'Mengirim informasi terkait akun, akses belajar, transaksi, dan bantuan support.',
          ],
        },
        {
          title: 'Perlindungan data',
          items: [
            'Data akun dan sesi disimpan untuk kebutuhan operasional layanan.',
            'Akses admin digunakan hanya untuk pengelolaan kelas, member, transaksi, dan support.',
            'Kami tidak menjual data pribadi member kepada pihak lain.',
          ],
        },
      ],
    },
    terms: {
      eyebrow: 'Ketentuan Layanan',
      title: 'Ketentuan Layanan',
      description:
        `Dengan menggunakan ${safeSettings.siteName}, pengguna menyetujui ketentuan layanan kelas online, akses materi, pembayaran, dan penggunaan dashboard.`,
      sections: [
        {
          title: 'Akses kelas',
          items: [
            'Kelas gratis dapat langsung dibuka setelah member memilih akses gratis.',
            'Kelas berbayar akan terbuka setelah pembayaran berhasil diverifikasi.',
            'Akses kelas berlaku untuk akun member yang melakukan pembelian atau diberi akses.',
          ],
        },
        {
          title: 'Pembayaran',
          items: [
            'Pembayaran kelas berbayar diproses melalui penyedia pembayaran yang tersedia di website.',
            'Akses kelas akan aktif otomatis setelah status pembayaran dinyatakan sukses.',
            'Member wajib memastikan data email dan akun yang digunakan sudah benar.',
          ],
        },
        {
          title: 'Penggunaan materi',
          items: [
            'Materi kelas digunakan untuk pembelajaran pribadi member.',
            'Member tidak diperbolehkan membagikan ulang materi berbayar tanpa izin.',
            'Pelanggaran penggunaan dapat menyebabkan pembatasan akses akun.',
          ],
        },
      ],
    },
  }
  const content = pages[page] ?? pages.about

  return (
    <section className="public-info-page">
      <div className="public-info-hero">
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p>{content.description}</p>
        <small>Terakhir diperbarui: 16 Juni 2026</small>
      </div>

      <div className="public-info-grid">
        {content.sections.map((section) => (
          <article className="public-info-card" key={section.title}>
            <h2>{section.title}</h2>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      {content.actionLabel && (
        <div className="public-info-action">
          <button className="btn btn-primary" type="button" onClick={onLogin}>
            <Icon name="logIn" />
            {content.actionLabel}
          </button>
        </div>
      )}
    </section>
  )
}

function SiteFooter({ onHomeSection, onInfoPage, settings }) {
  const year = new Date().getFullYear()
  const safeSettings = cleanWebsiteSettings(settings)

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand-block">
          <button
            className="footer-brand"
            type="button"
            onClick={() => onHomeSection('home')}
            aria-label={`${safeSettings.siteTitle} beranda`}
          >
            <BrandMark settings={safeSettings} />
            <span>{safeSettings.siteName}</span>
          </button>
          <p>{safeSettings.footer.description}</p>
          <div className="footer-socials" aria-label={`Sosial media ${safeSettings.siteName}`}>
            {safeSettings.footer.socialLinks
              .filter((item) => item.url)
              .map((item) => (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={item.label}
                  key={item.id}
                >
                  <Icon name={item.icon} />
                </a>
              ))}
          </div>
        </div>

        <div className="footer-nav-col">
          <h4 className="footer-col-title">Informasi</h4>
          <nav className="footer-links" aria-label="Navigasi informasi footer">
            <button type="button" onClick={() => onInfoPage('about')}>
              Tentang Kami
            </button>
            <button type="button" onClick={() => onInfoPage('contact')}>
              Kontak Support
            </button>
          </nav>
        </div>

        <div className="footer-nav-col">
          <h4 className="footer-col-title">Kebijakan</h4>
          <nav className="footer-links" aria-label="Navigasi kebijakan footer">
            <button type="button" onClick={() => onInfoPage('privacy')}>
              Kebijakan Privasi
            </button>
            <button type="button" onClick={() => onInfoPage('terms')}>
              Ketentuan Layanan
            </button>
          </nav>
        </div>

        <div className="footer-contact-col">
          <h4 className="footer-col-title">Bantuan & Layanan</h4>
          <div className="footer-contact">
            {safeSettings.footer.contactItems.map((item, index) => (
              <span key={`${item.text}-${index}`}>
                <Icon name={item.icon} />
                {item.text}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>© {year} {safeSettings.footer.copyright}</span>
        <span>{safeSettings.footer.bottomText}</span>
      </div>
    </footer>
  )
}

function buildNotifications(session, supportTickets, submissions) {
  if (session.role === 'admin') {
    return [
      ...supportTickets
        .filter((ticket) => ticket.status !== 'Selesai')
        .map((ticket) => ({
          id: `support:${ticket.id}:${ticket.replies?.length ?? 0}:${ticket.status}`,
          title: 'Bantuan masuk',
          message: `${ticket.memberName}: ${ticket.subject}`,
          menuId: 'support',
        })),
      ...submissions
        .filter((submission) => submission.status === 'Menunggu Review')
        .map((submission) => ({
          id: `submission:${submission.id}:${submission.status}`,
          title: 'Tugas baru',
          message: `${submission.memberName}: ${submission.materialTitle}`,
          menuId: 'submissions',
        })),
    ]
  }

  return [
    ...submissions
      .filter((submission) => submission.feedback || submission.status !== 'Menunggu Review')
      .map((submission) => ({
        id: `submission-feedback:${submission.id}:${submission.status}:${submission.feedback}`,
        title: 'Feedback tugas',
        message: `${submission.materialTitle}: ${submission.status}`,
        menuId: 'my-courses',
        target: {
          classId: submission.classId,
          materialId: submission.materialId,
          submissionId: submission.id,
        },
      })),
    ...supportTickets
      .filter((ticket) =>
        (ticket.replies ?? []).some((reply) => reply.senderRole === 'admin') ||
        ticket.answer,
      )
      .map((ticket) => ({
        id: `support-reply:${ticket.id}:${ticket.replies?.length ?? 0}:${ticket.status}`,
        title: 'Bantuan dibalas',
        message: ticket.subject,
        menuId: 'support',
      })),
  ]
}

function Header({
  activePage,
  activeSection,
  session,
  settings,
  showDashboardMenu,
  onToggleDashboardMenu,
  onHomeSection,
  onLogin,
  onEditProfile,
  onLogout,
  notifications = [],
  unreadNotificationCount = 0,
  onOpenNotification,
}) {
  const [isPublicMenuOpen, setIsPublicMenuOpen] = useState(false)
  const safeSettings = cleanWebsiteSettings(settings)

  const handlePublicNavClick = (sectionId) => {
    setIsPublicMenuOpen(false)
    onHomeSection(sectionId)
  }

  return (
    <header
      className={
        session
          ? `site-header logged-in ${showDashboardMenu ? 'dashboard-header' : 'public-header'}`
          : `site-header public-header public-site-header ${activePage === 'login' ? 'login-header' : 'home-header'}`
      }
    >
      {showDashboardMenu && (
        <button
          className="dashboard-header-toggle"
          type="button"
          aria-label="Buka menu dashboard"
          onClick={onToggleDashboardMenu}
        >
          <Icon name="menu" />
        </button>
      )}

      {session ? (
        <div className="brand brand-static" aria-label={safeSettings.siteTitle}>
          <BrandMark settings={safeSettings} />
          <span>{safeSettings.siteName}</span>
        </div>
      ) : (
        <button
          className="brand"
          type="button"
          onClick={() => onHomeSection('home')}
          aria-label={`${safeSettings.siteTitle} beranda`}
        >
          <BrandMark settings={safeSettings} />
          <span>{safeSettings.siteName}</span>
        </button>
      )}

      {session ? (
        <div className="header-actions">
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadNotificationCount}
            onOpenNotification={onOpenNotification}
          />
          <ProfileMenu
            session={session}
            onEditProfile={onEditProfile}
            onLogout={onLogout}
          />
        </div>
      ) : (
        <>
          <button
            className="public-menu-toggle"
            type="button"
            aria-expanded={isPublicMenuOpen}
            aria-label="Buka menu navigasi"
            onClick={() => setIsPublicMenuOpen((current) => !current)}
          >
            <Icon name={isPublicMenuOpen ? 'x' : 'menu'} />
          </button>

          <nav
            className={isPublicMenuOpen ? 'site-nav open' : 'site-nav'}
            aria-label="Navigasi utama"
          >
            {safeSettings.header.navItems.map((item) => (
              <button
                key={item.id}
                className={
                  activePage === 'home' && activeSection === item.sectionId
                    ? 'nav-link active'
                    : 'nav-link'
                }
                type="button"
                onClick={() => handlePublicNavClick(item.sectionId)}
              >
                {item.label}
              </button>
            ))}
            <button
              className={activePage === 'login' ? 'nav-link active' : 'nav-link'}
              type="button"
              onClick={() => {
                setIsPublicMenuOpen(false)
                onLogin()
              }}
            >
              <Icon name="logIn" />
              {safeSettings.header.loginLabel}
            </button>
          </nav>
        </>
      )}
    </header>
  )
}

function NotificationBell({ notifications, unreadCount, onOpenNotification }) {
  const [isOpen, setIsOpen] = useState(false)

  const handleOpenNotification = (notification) => {
    setIsOpen(false)
    onOpenNotification(notification)
  }

  return (
    <div className="notification-menu">
      <button
        className="notification-trigger"
        type="button"
        aria-expanded={isOpen}
        aria-label="Buka notifikasi"
        onClick={() => setIsOpen((current) => !current)}
      >
        <Icon name="bell" />
        {unreadCount > 0 && <span>{Math.min(99, unreadCount)}</span>}
      </button>
      {isOpen && (
        <div className="notification-dropdown" role="menu">
          <div className="notification-heading">
            <strong>Notifikasi</strong>
            <small>{unreadCount} baru</small>
          </div>
          {notifications.length > 0 && (
            <div className="notification-list" role="none">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleOpenNotification(notification)}
                >
                  <strong>{notification.title}</strong>
                  <span>{notification.message}</span>
                </button>
              ))}
            </div>
          )}
          {!notifications.length && (
            <p className="notification-empty">Belum ada notifikasi.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default App
