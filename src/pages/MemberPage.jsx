import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CertificateTemplateCanvas from '../components/CertificateTemplateCanvas'
import DashboardShell from '../components/DashboardShell'
import Icon from '../components/Icon'
import MetricCard from '../components/MetricCard'
import { memberMenuItems } from '../data/platformData'
import { cleanWebsiteSettings, defaultWebsiteSettings } from '../data/websiteSettings'
import { createCertificateData } from '../lib/certificateTemplate'
import { downloadCertificatePdf } from '../lib/certificatePdf'
import { createQrMatrix, getCertificateVerificationUrl } from '../lib/qrCode'
import { uploadStorageFile } from '../lib/storageUpload'
import { withPublicCodes } from '../utils/publicCodes'

const taskStorageKey = 'ibnucreative.memberTasks.v1'
const courseProgressStorageKey = 'ibnucreative.memberCourseProgress.v1'
const expiredPaymentNoticeKey = 'ibnucreative.expiredPaymentNotices.v1'
const uploadFileApiPath = '/api/upload-file'
const testimonialMaxLength = 280

function scopedStorageKey(baseKey, userId = '') {
  return userId ? `${baseKey}.${userId}` : baseKey
}

function parsePaymentTime(value) {
  if (!value) {
    return 0
  }

  if (typeof value === 'number') {
    if (value > 1000000000000) {
      return value
    }

    return value > 1000000000 ? value * 1000 : 0
  }

  const rawValue = String(value).trim()

  if (/^\d+$/.test(rawValue)) {
    return parsePaymentTime(Number(rawValue))
  }

  const normalized = rawValue.replace(' ', 'T')
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
  const timeValue = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(normalized) && !hasTimezone
    ? `${normalized}Z`
    : normalized
  const time = Date.parse(timeValue)

  return Number.isNaN(time) ? 0 : time
}

function readSubmittedTasks(userId = '') {
  if (typeof window === 'undefined') {
    return {}
  }

  const storageKey = scopedStorageKey(taskStorageKey, userId)

  try {
    return JSON.parse(window.sessionStorage.getItem(storageKey)) ?? {}
  } catch {
    window.sessionStorage.removeItem(storageKey)
    return {}
  }
}

function readCourseProgress(userId = '') {
  if (typeof window === 'undefined') {
    return {}
  }

  const storageKey = scopedStorageKey(courseProgressStorageKey, userId)

  try {
    return JSON.parse(window.localStorage.getItem(storageKey)) ?? {}
  } catch {
    window.localStorage.removeItem(storageKey)
    return {}
  }
}

function getTaskKey(courseId, materialId) {
  return `${courseId}:${materialId}`
}

function getYoutubeEmbedUrl(value) {
  if (!value) {
    return ''
  }

  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, '')
    let videoId = ''

    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? ''
    } else if (host === 'youtube.com' || host === 'm.youtube.com') {
      const pathParts = url.pathname.split('/').filter(Boolean)

      if (pathParts[0] === 'shorts' || pathParts[0] === 'embed') {
        videoId = pathParts[1] ?? ''
      } else {
        videoId = url.searchParams.get('v') ?? ''
      }
    }

    return videoId ? `https://www.youtube.com/embed/${videoId}` : ''
  } catch {
    return ''
  }
}

function getProtectedVideoUrl(material, sessionToken = '') {
  const file = material?.videoFile

  if (!file) {
    return ''
  }

  if (file.startsWith('blob:') || file.startsWith('data:video/')) {
    return file
  }

  const params = new URLSearchParams({ file })

  if (sessionToken) {
    params.set('token', sessionToken)
  }

  return `/api/video?${params.toString()}`
}

const memberAboutFrameStyle = `<style>
  html { scroll-behavior: smooth; }
  img, video, iframe { max-width: 100%; }
  * { box-sizing: border-box; }
</style>`

function stripExecutableMemberAboutHtml(value) {
  const cleanHtml = String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')

  if (typeof document === 'undefined') {
    return cleanHtml
  }

  const template = document.createElement('template')
  template.innerHTML = cleanHtml
  template.content.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.removeAttribute('target')
    link.removeAttribute('rel')
  })

  return template.innerHTML
}

function enhanceMemberAboutSrcDoc(value) {
  let content = stripExecutableMemberAboutHtml(value)

  if (/<head[\s>]/i.test(content)) {
    content = content.replace(/<head([^>]*)>/i, `<head$1>${memberAboutFrameStyle}`)
  }

  return content
}

function buildMemberAboutSrcDoc(html = '', title = 'Tentang') {
  const trimmedHtml = String(html || '').trim()
  const safeTitle = String(title || 'Tentang')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const content = trimmedHtml || `
    <section style="min-height:100vh;display:grid;place-items:center;padding:48px 20px;background:#f8fafc;color:#0f172a;font-family:Inter,Arial,sans-serif;text-align:center">
      <div style="max-width:680px">
        <p style="margin:0 0 10px;color:#2563eb;font-weight:800;letter-spacing:.08em;text-transform:uppercase">Tentang</p>
        <h1 style="margin:0 0 14px;font-size:clamp(32px,7vw,64px);line-height:1.05">${safeTitle}</h1>
        <p style="margin:0;color:#64748b;font-size:18px;line-height:1.7">Halaman ini belum diatur admin. Konten HTML bisa ditambahkan dari menu Pengaturan Website.</p>
      </div>
    </section>
  `

  if (/<html[\s>]/i.test(content) || /<!doctype/i.test(content)) {
    return enhanceMemberAboutSrcDoc(content)
  }

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <style>
      html { scroll-behavior: smooth; }
      html, body { margin: 0; min-height: 100%; }
      body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #ffffff; color: #0f172a; }
      * { box-sizing: border-box; }
      img, video, iframe { max-width: 100%; }
    </style>
  </head>
  <body>${stripExecutableMemberAboutHtml(content)}</body>
</html>`
}

function handleMemberAboutFrameLoad(event) {
  const frame = event.currentTarget
  const frameDocument = frame?.contentDocument

  if (!frameDocument) {
    return
  }

  const normalizeInternalAnchors = () => {
    frameDocument.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.removeAttribute('target')
      link.removeAttribute('rel')
    })
  }

  const scrollToHash = (hash) => {
    if (!hash || hash.length < 2 || hash === '#') {
      return
    }

    let targetId = hash.slice(1)

    try {
      targetId = decodeURIComponent(targetId)
    } catch {
      targetId = hash.slice(1)
    }

    const namedTargets = frameDocument.getElementsByName
      ? frameDocument.getElementsByName(targetId)
      : []
    const target = frameDocument.getElementById(targetId) || namedTargets[0]

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleInternalAnchorClick = (clickEvent) => {
    const clickedElement = clickEvent.target && clickEvent.target.nodeType === 1
      ? clickEvent.target
      : clickEvent.target?.parentElement
    const link = clickedElement?.closest?.('a[href^="#"]')

    if (!link) {
      return
    }

    clickEvent.preventDefault()
    clickEvent.stopPropagation()
    scrollToHash(link.getAttribute('href') || '')
  }

  normalizeInternalAnchors()
  if (frame.__ibnuAboutAnchorHandler) {
    frameDocument.removeEventListener('click', frame.__ibnuAboutAnchorHandler, true)
    frameDocument.removeEventListener('auxclick', frame.__ibnuAboutAnchorHandler, true)
  }
  frame.__ibnuAboutAnchorHandler = handleInternalAnchorClick
  frameDocument.addEventListener('click', handleInternalAnchorClick, true)
  frameDocument.addEventListener('auxclick', handleInternalAnchorClick, true)
}

function formatRupiah(value) {
  const amount = Math.max(0, Math.round(Number(value) || 0))

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function getProductStock(product) {
  return Math.max(0, Math.round(Number(product?.itemQuantity) || 0))
}

function isProductStockManaged(product) {
  return product?.itemQuantityEnabled === true
}

function isProductSoldOut(product) {
  return isProductStockManaged(product) && getProductStock(product) <= 0
}

function getProductStockLabel(product) {
  if (!isProductStockManaged(product)) {
    return 'Stok tersedia'
  }

  const stock = getProductStock(product)

  return stock > 0 ? `Stok ${stock}` : 'Stok habis'
}

function formatCertificateDate(value) {
  const time = Date.parse(value || '')

  if (!time) {
    return new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(time))
}

function VerificationMark({ certificateId }) {
  const qr = createQrMatrix(getCertificateVerificationUrl({ certificateId }))

  return (
    <span
      className="certificate-qr"
      aria-hidden="true"
      style={{ gridTemplateColumns: `repeat(${qr.size}, 1fr)` }}
    >
      {qr.modules.flatMap((row, rowIndex) =>
        row.map((isDark, colIndex) => (
          <i className={isDark ? 'active' : ''} key={`${rowIndex}-${colIndex}`}></i>
        )),
      )}
    </span>
  )
}

function useElementWidth() {
  const elementRef = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = elementRef.current

    if (!element) {
      return undefined
    }

    const updateWidth = () => {
      setWidth(element.clientWidth || 0)
    }

    updateWidth()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateWidth)
      observer.observe(element)

      return () => observer.disconnect()
    }

    window.addEventListener('resize', updateWidth)

    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  return [elementRef, width]
}

function CertificatePreview({ certificate, siteName = 'Ibnu Creative', brandLogo = '', brandIcon = 'spark', template = null }) {
  const [templatePreviewRef, templatePreviewWidth] = useElementWidth()

  if (template) {
    const templateWidth = Math.max(1, Number(template.width) || 1123)
    const templateHeight = Math.max(1, Number(template.height) || 794)
    const availableWidth = templatePreviewWidth ? Math.max(220, templatePreviewWidth - 20) : 720
    const zoom = Math.min(0.72, availableWidth / templateWidth)

    return (
      <div
        className="member-template-certificate-preview"
        ref={templatePreviewRef}
        style={{ '--certificate-template-ratio': `${templateWidth} / ${templateHeight}` }}
      >
        <CertificateTemplateCanvas
          template={template}
          data={createCertificateData(certificate, { siteName })}
          zoom={zoom}
        />
      </div>
    )
  }

  const mentorName = certificate.mentorName || 'Ramdialta Ibnu Sajara, S.Pd'
  return (
    <div className="certificate-preview" aria-label={`Preview sertifikat ${certificate.classTitle}`}>
      <div className="certificate-preview-topline">
        <div className="certificate-logo-group">
          {brandLogo ? (
            <img className="certificate-logo-img" src={brandLogo} alt={siteName} />
          ) : (
            <div className="certificate-logo-fallback">
              <Icon name={brandIcon || 'spark'} />
              <span>{siteName}</span>
            </div>
          )}
        </div>
        <span className="certificate-badge-title">Certificate of Completion</span>
      </div>
      <div className="certificate-preview-body">
        <p className="eyebrow">Sertifikat kelulusan</p>
        <h3>{certificate.participantName}</h3>
        <p className="certificate-preview-copy">
          telah menyelesaikan seluruh materi dan persyaratan kelas
        </p>
        <h4>{certificate.classTitle}</h4>
      </div>
      <div className="certificate-preview-meta">
        <span>
          <small>Tanggal selesai</small>
          <strong>{formatCertificateDate(certificate.completedAt)}</strong>
        </span>
        <span>
          <small>Mentor</small>
          <div className="certificate-esign-container">
            <svg viewBox="0 0 120 48" className="certificate-esign-svg" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 12 32 C 18 12, 28 8, 32 26 C 36 38, 42 34, 46 22 C 50 10, 54 12, 58 28 C 62 38, 70 18, 78 26 C 84 32, 90 28, 98 22 C 104 18, 108 24, 102 28 C 96 32, 85 30, 75 30 C 65 30, 45 30, 20 30" />
            </svg>
            <strong>{mentorName}</strong>
          </div>
        </span>
      </div>
      <div className="certificate-preview-footer">
        <div>
          <small>ID Sertifikat</small>
          <strong>{certificate.certificateId}</strong>
        </div>
        <VerificationMark certificateId={certificate.certificateId} />
      </div>
    </div>
  )
}

function readDismissedExpiredPaymentNotices(userId = '') {
  if (typeof window === 'undefined') {
    return []
  }

  const storageKey = scopedStorageKey(expiredPaymentNoticeKey, userId)

  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey))

    return Array.isArray(value) ? value : []
  } catch {
    window.localStorage.removeItem(storageKey)
    return []
  }
}

function saveDismissedExpiredPaymentNotices(userId = '', value = []) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    scopedStorageKey(expiredPaymentNoticeKey, userId),
    JSON.stringify([...new Set(value)]),
  )
}

function getExpiredPaymentDismissKey(payment) {
  if (!payment?.id) {
    return ''
  }

  return [
    payment.id,
    payment.status || 'expired',
    payment.expiresAt || payment.createdAt || '',
  ].filter(Boolean).join(':')
}

function PaymentMethodLogo({ method }) {
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

function getPaymentMethodFee(method, amount) {
  if (!method) {
    return 0
  }

  const flatFee = Math.max(0, Math.round(Number(method.feeFlat) || 0))
  const percentFee = Math.max(0, Number(method.feePercent) || 0)

  return flatFee + Math.max(0, Math.round((Math.max(0, amount) * percentFee) / 100))
}

async function compressImageFile(file, { maxSize = 1800, quality = 0.9 } = {}) {
  if (!file.type.startsWith('image/')) {
    return file
  }

  const imageUrl = URL.createObjectURL(file)
  const image = new Image()

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = imageUrl
    })

    const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')

    if (!context) {
      return file
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const outputType = file.type === 'image/png' ? 'image/webp' : file.type
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, outputType, quality),
    )

    if (!blob || blob.size >= file.size) {
      return file
    }

    const extension = outputType === 'image/webp' ? 'webp' : 'jpg'
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'task-image'

    return new File([blob], `${baseName}.${extension}`, { type: outputType })
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function MemberPage({
  userId = '',
  loginName,
  avatar,
  sessionToken = '',
  classes = [],
  allClasses = classes,
  digitalProducts = [],
  digitalProductAccess = [],
  allowedClassIds = null,
  supportTickets = [],
  classDiscussions = [],
  submissions = [],
  testimonials = [],
  certificates = [],
  certificateNameChangeRequests = [],
  certificateTemplates = [],
  payments = [],
  checkoutClassRequestId = '',
  activeMenu,
  onMenuChange,
  isMenuOpen,
  onCloseMenu,
  onNotify = () => {},
  onCreateSupportTicket = async () => {},
  onReplySupportTicket = async () => {},
  onCreateClassDiscussionMessage = async () => {},
  onCreateSubmission = async () => {},
  onUpdateSubmission = async () => {},
  onTrackProgress = async () => {},
  onCreateTestimonial = async () => {},
  onCreateCertificate = async () => {},
  onRequestCertificateNameChange = async () => {},
  onCreateTripayCheckout = async () => {},
  onOpenPublicProductDetail = null,
  onCheckoutClassRequestHandled = () => {},
  focusTarget = null,
  websiteSettings = defaultWebsiteSettings,
}) {
  const safeWebsiteSettings = cleanWebsiteSettings(websiteSettings)
  const tripayPaymentMethods = safeWebsiteSettings.paymentMethods
  const memberDashboardMenuItems = memberMenuItems.map((item) =>
    item.id === 'about'
      ? {
          ...item,
          label: safeWebsiteSettings.memberAbout.menuLabel || item.label,
        }
      : item,
  )
  const courses = classes.filter((course) => course.status === 'Aktif')
  const allActiveCourses = allClasses.filter((course) => course.status === 'Aktif')
  const memberVisibleCourses = allActiveCourses.filter((course) => course.showOnMember !== false)
  const activeSellableProducts = withPublicCodes(digitalProducts.filter(
    (product) => product.status === 'Aktif' && product.showOnMember !== false,
  ))
  const activeDigitalProducts = activeSellableProducts.filter((product) => product.productType !== 'prompt')
  const activePromptProducts = activeSellableProducts.filter((product) => product.productType === 'prompt')
  const accessibleClassIds = Array.isArray(allowedClassIds)
    ? new Set(allowedClassIds)
    : new Set()
  const availableCourses = memberVisibleCourses.filter((course) => !accessibleClassIds.has(course.id))
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [selectedDigitalProductId, setSelectedDigitalProductId] = useState(null)
  const [digitalProductLibraryView, setDigitalProductLibraryView] = useState('available')
  const [digitalProductSearchQuery, setDigitalProductSearchQuery] = useState('')
  const [digitalProductPriceFilter, setDigitalProductPriceFilter] = useState('all')
  const [digitalProductCartIds, setDigitalProductCartIds] = useState([])
  const [activeMaterialIndex, setActiveMaterialIndex] = useState(0)
  const [taskDraft, setTaskDraft] = useState('')
  const [taskAttachment, setTaskAttachment] = useState(null)
  const [editingSubmissionId, setEditingSubmissionId] = useState('')
  const [submittedTasks, setSubmittedTasks] = useState(() => readSubmittedTasks(userId))
  const [courseProgress, setCourseProgress] = useState(() => readCourseProgress(userId))
  const [supportMessage, setSupportMessage] = useState('')
  const [supportSubject, setSupportSubject] = useState('')
  const [supportDraft, setSupportDraft] = useState('')
  const [supportReplyDrafts, setSupportReplyDrafts] = useState({})
  const [isDiscussionOpen, setIsDiscussionOpen] = useState(false)
  const [discussionDraft, setDiscussionDraft] = useState('')
  const [discussionStatus, setDiscussionStatus] = useState('')
  const [testimonialDrafts, setTestimonialDrafts] = useState({})
  const [previewImage, setPreviewImage] = useState(null)
  const [activePromptInstruction, setActivePromptInstruction] = useState(null)
  const [certificateTestimonialPrompt, setCertificateTestimonialPrompt] = useState(null)
  const [checkoutClassId, setCheckoutClassId] = useState('')
  const [paymentMethodCourse, setPaymentMethodCourse] = useState(null)
  const [selectedPaymentMethodCode, setSelectedPaymentMethodCode] = useState('')
  const [isPaymentTermsAccepted, setIsPaymentTermsAccepted] = useState(false)
  const [isChangingPaymentMethod, setIsChangingPaymentMethod] = useState(false)
  const [certificateNameDrafts, setCertificateNameDrafts] = useState({})
  const [certificateChangeDrafts, setCertificateChangeDrafts] = useState({})
  const [selectedCertificateId, setSelectedCertificateId] = useState('')
  const [dismissedExpiredPayments, setDismissedExpiredPayments] = useState(() =>
    readDismissedExpiredPaymentNotices(userId),
  )
  const [paymentExpiryTick, setPaymentExpiryTick] = useState(() => Date.now())
  const handledCheckoutRequestRef = useRef('')
  const discussionListRef = useRef(null)
  const coursesRef = useRef(courses)
  const onTrackProgressRef = useRef(onTrackProgress)
  const completedCourses = courses.filter((course) => getCourseProgress(course) >= 100)
  const selectedCourse = courses.find((course) => course.id === selectedCourseId)
  const selectedCourseDiscussions = useMemo(
    () => selectedCourse
      ? classDiscussions.filter((message) => message.classId === selectedCourse.id)
      : [],
    [classDiscussions, selectedCourse],
  )
  const selectedDigitalProduct = activeSellableProducts.find(
    (product) => product.id === selectedDigitalProductId,
  )
  const activeDigitalProductAccess = useMemo(
    () => digitalProductAccess.filter((access) =>
      String(access.status || 'active').toLowerCase() === 'active',
    ),
    [digitalProductAccess],
  )
  const digitalProductAccessByProduct = useMemo(
    () => new Map(activeDigitalProductAccess.map((access) => [access.productId, access])),
    [activeDigitalProductAccess],
  )
  const paidDigitalProductOrdersByProduct = useMemo(() => {
    const map = new Map()
    const paidStatuses = new Set(['processed', 'paid', 'success', 'settlement', 'capture'])

    payments.forEach((payment) => {
      const isProductPayment = payment.itemType === 'digital_product' || Boolean(payment.productId)
      const productId = payment.productId || String(payment.classId || '').replace(/^product:/, '')
      const status = String(payment.status || '').toLowerCase()
      const hasAccess = payment.accessGranted === true || paidStatuses.has(status)
      const orderCode = payment.orderCode || payment.merchantRef || payment.reference || ''

      if (!isProductPayment || !productId || !hasAccess || !orderCode) {
        return
      }

      const current = map.get(productId)

      if (
        !current ||
        Date.parse(payment.updatedAt || payment.createdAt || '') >
          Date.parse(current.updatedAt || current.createdAt || '')
      ) {
        map.set(productId, {
          ...payment,
          accessOrderId: orderCode,
        })
      }
    })

    return map
  }, [payments])
  const ownedDigitalProductIds = useMemo(() => {
    const ids = new Set(activeDigitalProductAccess.map((access) => access.productId))

    paidDigitalProductOrdersByProduct.forEach((payment, productId) => {
      if (payment?.accessOrderId) {
        ids.add(productId)
      }
    })

    return ids
  }, [activeDigitalProductAccess, paidDigitalProductOrdersByProduct])
  const certificatesByClass = useMemo(
    () => new Map(certificates.map((certificate) => [certificate.classId, certificate])),
    [certificates],
  )
  const certificateRequestsByRow = useMemo(
    () => new Map(
      certificateNameChangeRequests.map((request) => [request.certificateRowId, request]),
    ),
    [certificateNameChangeRequests],
  )
  const certificateTemplatesById = useMemo(
    () => new Map(certificateTemplates.map((template) => [template.id, template])),
    [certificateTemplates],
  )
  const certificateTemplatesByClass = useMemo(() => {
    const map = new Map()

    certificateTemplates.forEach((template) => {
      if (!map.has(template.classId)) {
        map.set(template.classId, template)
      }
    })

    return map
  }, [certificateTemplates])
  const materials = selectedCourse?.materials ?? []
  const currentMaterialIndex = Math.min(
    activeMaterialIndex,
    Math.max(0, materials.length - 1),
  )
  const activeMaterial = materials[currentMaterialIndex]
  const activeTaskKey =
    selectedCourse && activeMaterial
      ? getTaskKey(selectedCourse.id, activeMaterial.id)
      : ''
  const activeServerSubmission = submissions.find(
    (item) =>
      item.classId === selectedCourse?.id && item.materialId === activeMaterial?.id,
  )
  const activeSubmissionStatus = activeServerSubmission?.status || ''
  const isActiveSubmissionRevision = activeSubmissionStatus === 'Perlu Revisi'
  const hasActiveSubmissionFeedback = Boolean(
    activeServerSubmission?.feedback || Number(activeServerSubmission?.rating) > 0,
  )
  const canEditActiveSubmission = Boolean(
    activeServerSubmission &&
      activeSubmissionStatus === 'Menunggu Review' &&
      !hasActiveSubmissionFeedback,
  )
  const canReviseActiveSubmission = Boolean(
    activeServerSubmission && isActiveSubmissionRevision,
  )
  const isEditingActiveSubmission = Boolean(
    activeServerSubmission && editingSubmissionId === activeServerSubmission.id,
  )
  const isTaskFormOpen =
    !activeServerSubmission || isEditingActiveSubmission || canReviseActiveSubmission
  const isActiveTaskSubmitted =
    !isActiveSubmissionRevision &&
    (Boolean(submittedTasks[activeTaskKey]) || Boolean(activeServerSubmission))
  const hasPreviousMaterial = currentMaterialIndex > 0
  const hasNextMaterial = currentMaterialIndex < materials.length - 1
  const canOpenNextMaterial =
    Boolean(activeMaterial) &&
    hasNextMaterial &&
    (!activeMaterial.requiresTask || isActiveTaskSubmitted)
  const activeEmbedUrl = getYoutubeEmbedUrl(activeMaterial?.videoUrl)
  const activeProtectedVideoUrl = getProtectedVideoUrl(activeMaterial, sessionToken)
  const activeMaterialImageUrl = activeMaterial?.imageFile || ''
  const hasActiveMaterialMedia =
    Boolean(activeProtectedVideoUrl) || Boolean(activeEmbedUrl) || Boolean(activeMaterialImageUrl)
  const promptItems = activeMaterial?.promptItems ?? []
  const resourceLinks = (activeMaterial?.resourceLinks ?? []).filter((link) => link.url)
  const isTaskImageAllowed = activeMaterial?.allowTaskImage !== false
  const isTaskImageRequired = Boolean(activeMaterial?.requireTaskImage)
  const getCheckoutAmount = (item) => {
    if (!item) {
      return 0
    }

    const normalPrice = Math.max(0, Math.round(Number(item.price) || 0))
    const salePrice = Math.max(0, Math.round(Number(item.salePrice) || 0))

    return salePrice > 0 ? salePrice : normalPrice
  }
  const selectedPaymentMethod = tripayPaymentMethods.find(
    (method) => method.code === selectedPaymentMethodCode,
  )
  const paymentModalAmount = getCheckoutAmount(paymentMethodCourse)
  const paymentModalFee = getPaymentMethodFee(selectedPaymentMethod, paymentModalAmount)
  const paymentModalTotal = paymentModalAmount + paymentModalFee
  const {
    activePaymentsByClass,
    expiredPaymentsByClass,
    activePaymentsByProduct,
    expiredPaymentsByProduct,
  } = useMemo(() => {
    const nextActivePaymentsByClass = new Map()
    const nextExpiredPaymentsByClass = new Map()
    const nextActivePaymentsByProduct = new Map()
    const nextExpiredPaymentsByProduct = new Map()

    payments
      .filter((payment) => payment.source === 'tripay')
      .forEach((payment) => {
        const status = String(payment.status || '').toLowerCase()
        const isProductPayment = payment.itemType === 'digital_product' || Boolean(payment.productId)
        const productId = payment.productId || String(payment.classId || '').replace(/^product:/, '')
        const pendingStatuses = ['pending', 'unpaid', 'waiting', 'callback']
        const isPendingStatus = pendingStatuses.includes(status)
        const expiresAtTime = parsePaymentTime(payment.expiresAtTimestamp || payment.expiresAt)
        const isExpired =
          payment.isExpired === true ||
          status === 'expired' ||
          (isPendingStatus && expiresAtTime > 0 && expiresAtTime <= paymentExpiryTick)
        const pendingMap = isProductPayment ? nextActivePaymentsByProduct : nextActivePaymentsByClass
        const expiredMap = isProductPayment ? nextExpiredPaymentsByProduct : nextExpiredPaymentsByClass
        const key = isProductPayment ? productId : payment.classId
        const currentPending = pendingMap.get(key)
        const currentExpired = expiredMap.get(key)

        if (isPendingStatus && payment.checkoutUrl && !isExpired) {
          if (
            !currentPending ||
            Date.parse(payment.createdAt || '') > Date.parse(currentPending.createdAt || '')
          ) {
            pendingMap.set(key, payment)
          }
        }

        if (isExpired) {
          if (
            !currentExpired ||
            Date.parse(payment.createdAt || '') > Date.parse(currentExpired.createdAt || '')
          ) {
            expiredMap.set(key, payment)
          }
        }
      })

    return {
      activePaymentsByClass: nextActivePaymentsByClass,
      expiredPaymentsByClass: nextExpiredPaymentsByClass,
      activePaymentsByProduct: nextActivePaymentsByProduct,
      expiredPaymentsByProduct: nextExpiredPaymentsByProduct,
    }
  }, [paymentExpiryTick, payments])

  useEffect(() => {
    coursesRef.current = courses
  }, [courses])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPaymentExpiryTick(Date.now())
    }, 30000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    onTrackProgressRef.current = onTrackProgress
  }, [onTrackProgress])

  useEffect(() => {
    setIsDiscussionOpen(false)
    setDiscussionDraft('')
    setDiscussionStatus('')
  }, [selectedCourseId])

  useEffect(() => {
    if (!isDiscussionOpen) {
      return
    }

    window.setTimeout(() => {
      if (discussionListRef.current) {
        discussionListRef.current.scrollTop = discussionListRef.current.scrollHeight
      }
    }, 0)
  }, [isDiscussionOpen, selectedCourseDiscussions.length])

  const rememberCoursePosition = useCallback((courseId, materialIndex) => {
    const course = coursesRef.current.find((item) => item.id === courseId)
    const material = course?.materials?.[materialIndex]

    setCourseProgress((current) => ({
      ...current,
      [courseId]: Math.max(Number(current[courseId]) || 0, materialIndex),
    }))

    if (course && material) {
      onTrackProgressRef.current({
        classId: course.id,
        classTitle: course.title,
        materialId: material.id,
        materialTitle: material.title,
        materialIndex,
        materialCount: course.materials?.length || 1,
      }).catch(() => {
        // Local progress remains available even if the network drops.
      })
    }
  }, [])

  useEffect(() => {
    window.sessionStorage.setItem(
      scopedStorageKey(taskStorageKey, userId),
      JSON.stringify(submittedTasks),
    )
  }, [submittedTasks, userId])

  useEffect(() => {
    window.localStorage.setItem(
      scopedStorageKey(courseProgressStorageKey, userId),
      JSON.stringify(courseProgress),
    )
  }, [courseProgress, userId])

  useEffect(() => {
    if (!focusTarget?.classId || !focusTarget?.materialId || activeMenu !== 'my-courses') {
      return
    }

    const targetCourse = classes.find((course) => course.id === focusTarget.classId)
    const targetMaterialIndex = targetCourse?.materials?.findIndex(
      (material) => material.id === focusTarget.materialId,
    )

    if (!targetCourse || !Number.isInteger(targetMaterialIndex) || targetMaterialIndex < 0) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      setSelectedCourseId(targetCourse.id)
      setActiveMaterialIndex(targetMaterialIndex)
      rememberCoursePosition(targetCourse.id, targetMaterialIndex)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [focusTarget, activeMenu, classes, rememberCoursePosition])

  function getCourseProgress(course) {
    const requiredMaterials = (course.materials ?? []).filter(
      (material) => material.requiresTask,
    )
    const requiredCount = requiredMaterials.length

    if (!requiredCount) {
      const materialCount = Math.max(0, course.materials?.length || 0)
      const lastViewedIndex = Math.max(0, Number(courseProgress[course.id]) || 0)

      if (!materialCount) {
        return 0
      }

      return Math.min(
        100,
        Math.round(((lastViewedIndex + 1) / materialCount) * 100),
      )
    }

    const submittedRequiredIds = new Set(
      submissions
      .filter((submission) =>
        submission.classId === course.id && submission.status !== 'Perlu Revisi',
      )
      .map((submission) => submission.materialId)
      .filter((materialId) =>
        requiredMaterials.some((material) => material.id === materialId),
      ),
    )

    return Math.min(100, Math.round((submittedRequiredIds.size / requiredCount) * 100))
  }

  const selectedCourseProgress = selectedCourse ? getCourseProgress(selectedCourse) : 0
  const isLastMaterial = Boolean(selectedCourse && materials.length && currentMaterialIndex === materials.length - 1)
  const selectedCourseHasRequiredTask = materials.some((material) => material.requiresTask)
  const isSelectedCourseComplete = selectedCourseProgress >= 100 || (isLastMaterial && !selectedCourseHasRequiredTask)
  function getMemberTestimonialForCourse(classId) {
    return testimonials.find((testimonial) =>
      testimonial.memberId === userId && testimonial.classId === classId,
    )
  }

  function hasSubmittedCertificateTestimonial(classId) {
    const testimonial = getMemberTestimonialForCourse(classId)

    return Boolean(testimonial && testimonial.status !== 'rejected')
  }

  function openCertificateTestimonialPrompt(course, action = 'download') {
    setCertificateTestimonialPrompt({
      action,
      courseId: course?.id || course?.classId || '',
      classTitle: course?.title || course?.classTitle || 'kelas ini',
    })
  }

  const selectedCourseTestimonial = selectedCourse
    ? getMemberTestimonialForCourse(selectedCourse.id)
    : null
  const canSendSelectedCourseTestimonial = Boolean(
      selectedCourse &&
      isSelectedCourseComplete &&
      isLastMaterial &&
      (!selectedCourseTestimonial || selectedCourseTestimonial.status === 'rejected'),
  )

  const getTestimonialStatusLabel = (status = '') => {
    if (status === 'approved') {
      return 'Sudah tampil di homepage'
    }

    if (status === 'rejected') {
      return 'Perlu dikirim ulang'
    }

    if (status === 'hidden') {
      return 'Disembunyikan admin'
    }

    return 'Menunggu persetujuan admin'
  }

  const handleTestimonialDraftChange = (classId, value) => {
    setTestimonialDrafts((current) => ({
      ...current,
      [classId]: value.slice(0, testimonialMaxLength),
    }))
  }

  const handleSubmitTestimonial = async (course) => {
    const targetCourse = course || selectedCourse
    const nextTestimonial = String(testimonialDrafts[targetCourse?.id] || '').trim()

    if (!targetCourse || !nextTestimonial) {
      onNotify('Isi testimoni dulu.')
      return
    }

    if (getCourseProgress(targetCourse) < 100) {
      onNotify('Testimoni bisa dikirim setelah progress kelas 100%.')
      return
    }

    if (nextTestimonial.length > testimonialMaxLength) {
      onNotify(`Testimoni maksimal ${testimonialMaxLength} karakter.`)
      return
    }

    const existingTestimonial = getMemberTestimonialForCourse(targetCourse.id)

    if (existingTestimonial && existingTestimonial.status !== 'rejected') {
      onNotify('Testimoni kelas ini sudah terkirim.')
      return
    }

    try {
      await onCreateTestimonial({
        classId: targetCourse.id,
        classTitle: targetCourse.title,
        message: nextTestimonial,
      })
      setTestimonialDrafts((current) => ({
        ...current,
        [targetCourse.id]: '',
      }))
      onNotify('Testimoni terkirim dan menunggu persetujuan admin.')
    } catch (error) {
      onNotify(error.message || 'Testimoni belum bisa dikirim.')
    }
  }

  const handleDashboardMenuChange = useCallback((menuId) => {
    if (menuId !== 'my-courses') {
      setSelectedCourseId(null)
      setActiveMaterialIndex(0)
    }

    if (menuId !== 'digital-products' && menuId !== 'prompts') {
      setSelectedDigitalProductId(null)
    }

    onMenuChange(menuId)
  }, [onMenuChange])

  const handleOpenCertificateTestimonialForm = useCallback(() => {
    const targetCourseId = certificateTestimonialPrompt?.courseId || ''

    setCertificateTestimonialPrompt(null)
    handleDashboardMenuChange('testimonials')

    window.setTimeout(() => {
      if (!targetCourseId) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      const targetCard = Array.from(
        document.querySelectorAll('[data-testimonial-course-id]'),
      ).find((element) => element.dataset.testimonialCourseId === targetCourseId)

      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }, 80)
  }, [certificateTestimonialPrompt, handleDashboardMenuChange, setCertificateTestimonialPrompt])

  const handleOpenDigitalProductDetail = (product) => {
    if (onOpenPublicProductDetail) {
      onOpenPublicProductDetail(product)
      return
    }

    setSelectedDigitalProductId(product.id)
    handleDashboardMenuChange(product.productType === 'prompt' ? 'prompts' : 'digital-products')
    onNotify(`Membuka detail ${product.title}.`)
  }

  const handleBackToDigitalProducts = () => {
    setSelectedDigitalProductId(null)
  }

  const handleShareDigitalProduct = async (product) => {
    const detailPath = product.productType === 'prompt' ? 'prompt' : 'produk'
    const shareUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/${detailPath}/${encodeURIComponent(product.publicCode || product.id)}`
      : ''
    const shareData = {
      title: product.title,
      text: product.description || `Lihat produk digital ${product.title}`,
      url: shareUrl,
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }

      if (navigator.clipboard && shareUrl) {
        await navigator.clipboard.writeText(shareUrl)
        onNotify('Link produk berhasil disalin.')
        return
      }

      onNotify('Fitur share belum tersedia di browser ini.')
    } catch (error) {
      if (error?.name !== 'AbortError') {
        onNotify('Produk belum bisa dibagikan.')
      }
    }
  }

  const handleToggleDigitalProductCart = (product) => {
    setDigitalProductCartIds((current) => {
      const isInCart = current.includes(product.id)
      onNotify(isInCart ? 'Produk dihapus dari keranjang.' : 'Produk ditambahkan ke keranjang.')

      return isInCart
        ? current.filter((itemId) => itemId !== product.id)
        : [...current, product.id]
    })
  }

  const isMaterialUnlocked = (index) => {
    if (!selectedCourse) {
      return false
    }

    return materials.slice(0, index).every((material) => {
      if (!material.requiresTask) {
        return true
      }

      const serverSubmission = submissions.find(
        (item) => item.classId === selectedCourse.id && item.materialId === material.id,
      )

      if (serverSubmission) {
        return serverSubmission.status !== 'Perlu Revisi'
      }

      return Boolean(
        submittedTasks[getTaskKey(selectedCourse.id, material.id)] ||
          submissions.find(
            (item) =>
              item.classId === selectedCourse.id &&
              item.materialId === material.id &&
              item.status !== 'Perlu Revisi',
          ),
      )
    })
  }

  const handleOpenCourse = (course) => {
    setSelectedCourseId(course.id)
    setActiveMaterialIndex(0)
    setTaskDraft('')
    setTaskAttachment(null)
    setEditingSubmissionId('')
    rememberCoursePosition(course.id, 0)
    onNotify(`Membuka materi ${course.title}.`)
  }

  const handleOpenMaterial = (index) => {
    if (!isMaterialUnlocked(index)) {
      onNotify('Kirim tugas materi sebelumnya dulu untuk membuka materi ini.')
      return
    }

    setActiveMaterialIndex(index)
    setTaskDraft('')
    setTaskAttachment(null)
    setEditingSubmissionId('')
    if (selectedCourse) {
      rememberCoursePosition(selectedCourse.id, index)
    }
  }

  const handleSubmitTask = async () => {
    if (!selectedCourse || !activeMaterial) {
      return
    }

    if (isTaskImageRequired && !taskAttachment?.url) {
      onNotify('Upload gambar tugas dulu karena materi ini mewajibkannya.')
      return
    }

    if (!taskDraft.trim() && !(isTaskImageAllowed && taskAttachment?.url)) {
      onNotify('Isi link, catatan, atau upload gambar tugas dulu.')
      return
    }

    try {
      const submissionPayload = {
        ...(activeServerSubmission ? { id: activeServerSubmission.id } : {}),
        classId: selectedCourse.id,
        classTitle: selectedCourse.title,
        materialId: activeMaterial.id,
        materialTitle: activeMaterial.title,
        materialIndex: currentMaterialIndex,
        materialCount: materials.length,
        answer: taskDraft.trim() || `Upload gambar tugas: ${taskAttachment.name}`,
        attachmentUrl: isTaskImageAllowed ? (taskAttachment?.url ?? '') : '',
        attachmentName: isTaskImageAllowed ? (taskAttachment?.name ?? '') : '',
      }

      if (activeServerSubmission && (canEditActiveSubmission || canReviseActiveSubmission)) {
        await onUpdateSubmission(submissionPayload)
      } else {
        await onCreateSubmission(submissionPayload)
      }

      setSubmittedTasks((current) => ({
        ...current,
        [getTaskKey(selectedCourse.id, activeMaterial.id)]: {
          text: taskDraft.trim(),
          submittedAt: new Date().toISOString(),
        },
      }))
      rememberCoursePosition(
        selectedCourse.id,
        Math.min(materials.length - 1, currentMaterialIndex + 1),
      )
      setTaskDraft('')
      setTaskAttachment(null)
      setEditingSubmissionId('')
      onNotify(
        activeServerSubmission
          ? 'Tugas berhasil diperbarui dan menunggu review ulang.'
          : 'Tugas terkirim. Materi berikutnya sudah terbuka.',
      )
    } catch (error) {
      onNotify(error.message || 'Tugas tidak bisa dikirim.')
    }
  }

  const handleEditActiveSubmission = () => {
    if (!activeServerSubmission || !canEditActiveSubmission) {
      return
    }

    setTaskDraft(activeServerSubmission.answer || '')
    setEditingSubmissionId(activeServerSubmission.id)
    setTaskAttachment(
      activeServerSubmission.attachmentUrl
        ? {
            url: activeServerSubmission.attachmentUrl,
            name: activeServerSubmission.attachmentName || 'Gambar tugas',
          }
        : null,
    )
  }

  const handlePreviousMaterial = () => {
    if (!hasPreviousMaterial) {
      return
    }

    setActiveMaterialIndex(currentMaterialIndex - 1)
    setTaskDraft('')
    setTaskAttachment(null)
    setEditingSubmissionId('')
  }

  const handleNextMaterial = () => {
    if (!canOpenNextMaterial) {
      onNotify('Materi berikutnya terkunci sampai tugas wajib dikirim.')
      return
    }

    setActiveMaterialIndex(currentMaterialIndex + 1)
    if (selectedCourse) {
      rememberCoursePosition(selectedCourse.id, currentMaterialIndex + 1)
    }
    setTaskDraft('')
    setTaskAttachment(null)
    setEditingSubmissionId('')
  }

  const handleTaskImageChange = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      onNotify('Gambar tugas harus JPG, PNG, atau WebP.')
      event.target.value = ''
      return
    }

    try {
      const compressedFile = await compressImageFile(file)
      const data = await uploadStorageFile({
        endpoint: uploadFileApiPath,
        file: compressedFile,
        type: 'task',
        sessionToken,
      })

      setTaskAttachment({
        url: data.url,
        name: data.name || compressedFile.name,
      })
      onNotify('Gambar tugas berhasil diupload.')
    } catch (error) {
      onNotify(error.message || 'Gambar tugas tidak bisa diupload.')
    } finally {
      event.target.value = ''
    }
  }

  const handleCertificateNameDraftChange = (courseId, value) => {
    setCertificateNameDrafts((current) => ({
      ...current,
      [courseId]: value.slice(0, 120),
    }))
  }

  const handleCertificateChangeDraftChange = (certificateId, field, value) => {
    setCertificateChangeDrafts((current) => ({
      ...current,
      [certificateId]: {
        ...(current[certificateId] || {}),
        [field]: field === 'reason' ? value.slice(0, 600) : value.slice(0, 120),
      },
    }))
  }

  const handleGenerateCertificate = async (course) => {
    const progress = getCourseProgress(course)
    const participantName = String(
      certificateNameDrafts[course.id] || loginName || '',
    ).trim()

    if (progress < 100) {
      onNotify('Sertifikat baru bisa dibuat setelah progress kelas 100%.')
      return
    }

    if (!hasSubmittedCertificateTestimonial(course.id)) {
      openCertificateTestimonialPrompt(course, 'create')
      return
    }

    if (participantName.length < 3) {
      onNotify('Isi nama lengkap untuk sertifikat minimal 3 karakter.')
      return
    }

    try {
      const data = await onCreateCertificate({
        classId: course.id,
        participantName,
      })
      const certificate = data.certificate || data.certificates?.find((item) => item.classId === course.id)

      if (certificate) {
        setSelectedCertificateId(certificate.id)
      }
      onNotify(data.message || 'Sertifikat berhasil dibuat.')
    } catch (error) {
      onNotify(error.message || 'Sertifikat belum bisa dibuat.')
    }
  }

  const handleDownloadCertificate = (certificate) => {
    if (!certificate?.certificateId) {
      onNotify('Sertifikat belum tersedia.')
      return
    }

    if (!hasSubmittedCertificateTestimonial(certificate.classId)) {
      openCertificateTestimonialPrompt({
        id: certificate.classId,
        title: certificate.classTitle,
      }, 'download')
      return
    }

    const verificationUrl = `${window.location.origin}/sertifikat/${encodeURIComponent(certificate.certificateId)}`
    const certificateTemplate =
      certificate.templateSnapshot ||
      certificateTemplatesById.get(certificate.templateId) ||
      certificateTemplatesByClass.get(certificate.classId) ||
      null

    downloadCertificatePdf({
      certificate,
      siteName: safeWebsiteSettings.siteName,
      brandLogo: safeWebsiteSettings.brandLogo,
      brandIcon: safeWebsiteSettings.brandIcon,
      verificationUrl,
      template: certificateTemplate,
    })
    onNotify('Sertifikat PDF mulai diunduh.')
  }

  const handleOpenCertificateVerification = (certificate) => {
    if (!certificate?.certificateId) {
      return
    }

    window.open(`/sertifikat/${encodeURIComponent(certificate.certificateId)}`, '_blank', 'noopener,noreferrer')
  }

  const handleSubmitCertificateNameChange = async (certificate) => {
    const draft = certificateChangeDrafts[certificate.id] || {}
    const newName = String(draft.newName || '').trim()
    const reason = String(draft.reason || '').trim()

    if (!newName || !reason) {
      onNotify('Isi nama baru dan alasan perubahan.')
      return
    }

    try {
      const data = await onRequestCertificateNameChange({
        certificateId: certificate.id,
        oldName: certificate.participantName,
        newName,
        reason,
      })

      setCertificateChangeDrafts((current) => ({
        ...current,
        [certificate.id]: {},
      }))
      onNotify(data.message || 'Permintaan ubah nama berhasil dikirim.')
    } catch (error) {
      onNotify(error.message || 'Permintaan ubah nama belum bisa dikirim.')
    }
  }

  const openDigitalProductAccessPage = useCallback((product, data = null) => {
    const accessOrderId =
      data?.accessOrderId ||
      digitalProductAccessByProduct.get(product.id)?.orderId ||
      paidDigitalProductOrdersByProduct.get(product.id)?.accessOrderId ||
      ''
    const accessPath = product.productType === 'prompt' ? 'prompt-akses' : 'produk-akses'
    const accessUrl = data?.accessUrl || (accessOrderId
      ? `/${accessPath}/${encodeURIComponent(accessOrderId)}`
      : '')

    if (accessUrl) {
      const nextUrl = new URL(accessUrl, window.location.origin)

      window.history.pushState(
        {
          publicDetailFromApp: true,
          returnToMemberProducts: true,
        },
        '',
        nextUrl.pathname + nextUrl.search + nextUrl.hash,
      )
      window.dispatchEvent(new PopStateEvent('popstate'))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return true
    }

    if (product.fileUrl) {
      window.open(product.fileUrl, '_blank', 'noopener,noreferrer')
      return true
    }

    onNotify('Akses produk belum punya link. Hubungi admin.')
    return false
  }, [digitalProductAccessByProduct, onNotify, paidDigitalProductOrdersByProduct])

  const handleStartCheckout = useCallback(async (item, paymentMethod = '', { forceNewPayment = false, itemType = 'class' } = {}) => {
    const price = getCheckoutAmount({ ...item, itemType })
    const productMenu = itemType === 'digital_product' && item.productType === 'prompt'
      ? 'prompts'
      : 'digital-products'

    setCheckoutClassId(`${itemType}:${item.id}`)

    try {
      const data = await onCreateTripayCheckout(item, price ? paymentMethod : '', {
        forceNewPayment,
        itemType,
      })

      if (data.freeAccessGranted) {
        onNotify(itemType === 'digital_product'
          ? 'Produk digital gratis sudah aktif.'
          : 'Akses kelas gratis sudah aktif. Silakan buka Kelas Saya.')
        if (itemType === 'digital_product' && openDigitalProductAccessPage(item, data)) {
          return
        }
        handleDashboardMenuChange(itemType === 'digital_product' ? productMenu : 'my-courses')
        return
      }

      if (data.alreadyHasAccess) {
        onNotify(itemType === 'digital_product'
          ? 'Produk digital sudah dimiliki.'
          : 'Akses kelas sudah aktif. Silakan buka Kelas Saya.')
        if (itemType === 'digital_product' && openDigitalProductAccessPage(item, data)) {
          return
        }
        handleDashboardMenuChange(itemType === 'digital_product' ? productMenu : 'my-courses')
        return
      }

      if (price) {
        onNotify(
          data.existingPayment
            ? 'Invoice sebelumnya dibuka kembali.'
            : data.emailSent
              ? forceNewPayment
                ? 'Invoice baru dibuat dan instruksi pembayaran dikirim ke email.'
                : 'Invoice Tripay dibuat dan instruksi pembayaran dikirim ke email.'
              : forceNewPayment
                ? 'Invoice baru dibuat. Email belum terkirim, silakan lanjut dari halaman pembayaran.'
                : 'Invoice Tripay dibuat. Email belum terkirim, silakan lanjut dari halaman pembayaran.',
        )
      }
    } catch (error) {
      onNotify(error.message || 'Checkout Tripay tidak bisa dibuat.')
    } finally {
      setCheckoutClassId('')
    }
  }, [handleDashboardMenuChange, onCreateTripayCheckout, onNotify, openDigitalProductAccessPage])

  const openPaymentMethodPopup = useCallback((item, { forceNewPayment = false, itemType = 'class' } = {}) => {
    const price = getCheckoutAmount({ ...item, itemType })
    const pendingPayment = itemType === 'digital_product'
      ? activePaymentsByProduct.get(item.id)
      : activePaymentsByClass.get(item.id)

    if (itemType === 'digital_product' && isProductSoldOut(item)) {
      onNotify('Stok produk habis. Silakan tunggu admin menambah stok lagi.')
      return
    }

    if (!price) {
      handleStartCheckout(item, '', { itemType })
      return
    }

    if (pendingPayment?.checkoutUrl && !forceNewPayment) {
      window.location.assign(pendingPayment.checkoutUrl)
      return
    }

    setPaymentMethodCourse({ ...item, itemType })
    setSelectedPaymentMethodCode('')
    setIsPaymentTermsAccepted(false)
    setIsChangingPaymentMethod(forceNewPayment)
  }, [activePaymentsByClass, activePaymentsByProduct, handleStartCheckout])

  const dismissExpiredPaymentNotice = (paymentId) => {
    const nextDismissed = [...new Set([...dismissedExpiredPayments, paymentId])]

    setDismissedExpiredPayments(nextDismissed)
    saveDismissedExpiredPaymentNotices(userId, nextDismissed)
  }

  const handleCreateSelectedPayment = () => {
    if (!paymentMethodCourse) {
      return
    }

    if (!selectedPaymentMethod) {
      onNotify('Pilih metode pembayaran dulu.')
      return
    }

    if (!isPaymentTermsAccepted) {
      onNotify('Centang persetujuan syarat penggunaan dulu.')
      return
    }

    const item = paymentMethodCourse
    const itemType = paymentMethodCourse.itemType || 'class'

    setPaymentMethodCourse(null)
    setSelectedPaymentMethodCode('')
    setIsPaymentTermsAccepted(false)
    setIsChangingPaymentMethod(false)
    handleStartCheckout(item, selectedPaymentMethod.code, {
      forceNewPayment: isChangingPaymentMethod,
      itemType,
    })
  }

  useEffect(() => {
    if (
      !checkoutClassRequestId ||
      activeMenu !== 'available-classes' ||
      handledCheckoutRequestRef.current === checkoutClassRequestId
    ) {
      return
    }

    const targetCourse = availableCourses.find((course) => course.id === checkoutClassRequestId)

    if (!targetCourse) {
      return
    }

    handledCheckoutRequestRef.current = checkoutClassRequestId
    const timer = window.setTimeout(() => {
      openPaymentMethodPopup(targetCourse)
      onCheckoutClassRequestHandled()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [
    checkoutClassRequestId,
    activeMenu,
    availableCourses,
    openPaymentMethodPopup,
    onCheckoutClassRequestHandled,
  ])

  const handleSendSupport = async () => {
    if (!supportDraft.trim()) {
      onNotify('Tulis pertanyaan dulu sebelum dikirim.')
      return
    }

    try {
      await onCreateSupportTicket({
        subject: supportSubject.trim() || 'Pertanyaan belajar',
        message: supportDraft.trim(),
      })
      setSupportSubject('')
      setSupportDraft('')
      setSupportMessage('Tiket bantuan Anda berhasil dibuat.')
      onNotify('Pesan bantuan terkirim ke mentor.')
    } catch (error) {
      onNotify(error.message || 'Pesan bantuan tidak bisa dikirim.')
    }
  }

  const handleReplySupport = async (ticket) => {
    const message = supportReplyDrafts[ticket.id]?.trim()

    if (!message) {
      onNotify('Tulis balasan dulu sebelum dikirim.')
      return
    }

    try {
      await onReplySupportTicket({
        id: ticket.id,
        message,
        status: 'Menunggu',
      })
      setSupportReplyDrafts((current) => ({ ...current, [ticket.id]: '' }))
      onNotify('Balasan bantuan terkirim.')
    } catch (error) {
      onNotify(error.message || 'Balasan tidak bisa dikirim.')
    }
  }

  const handleSendDiscussionMessage = async (event) => {
    event.preventDefault()

    if (!selectedCourse) {
      return
    }

    const message = discussionDraft.trim()

    if (!message) {
      setDiscussionStatus('Tulis pesan diskusi terlebih dahulu.')
      return
    }

    setDiscussionStatus('Mengirim pesan...')

    try {
      await onCreateClassDiscussionMessage({
        classId: selectedCourse.id,
        classTitle: selectedCourse.title,
        message,
      })
      setDiscussionDraft('')
      setDiscussionStatus('')
    } catch (error) {
      setDiscussionStatus(error.message || 'Pesan diskusi belum bisa dikirim.')
    }
  }

  const handleCopyPrompt = async (prompt) => {
    try {
      await navigator.clipboard.writeText(prompt)
      onNotify('Prompt berhasil disalin.')
    } catch {
      onNotify('Browser tidak mengizinkan copy otomatis.')
    }
  }

  const handleDownloadPromptImage = (item) => {
    if (!item.image) {
      return
    }

    const link = document.createElement('a')
    link.href = item.image
    link.download = `${item.title || 'prompt-image'}.png`
    document.body.append(link)
    link.click()
    link.remove()
  }

  return (
    <DashboardShell
      role="member"
      loginName={loginName}
      avatar={avatar}
      menuItems={memberDashboardMenuItems}
      activeMenu={activeMenu}
      onMenuChange={handleDashboardMenuChange}
      isMenuOpen={isMenuOpen}
      onCloseMenu={onCloseMenu}
    >
      {activeMenu === 'overview' && (
        <>
          <section className="summary-grid member-summary">
            <MetricCard icon="bookOpen" label="Kelas aktif" value={courses.length} />
            <MetricCard
              icon="certificate"
              label="Sertifikat"
              value={completedCourses.length}
            />
            <MetricCard
              icon="checkCircle"
              label="Rata-rata progress"
              value={`${Math.round(
                courses.reduce((total, course) => total + getCourseProgress(course), 0) /
                  Math.max(1, courses.length),
              )}%`}
            />
            <MetricCard
              icon="wallet"
              label="Kelas tersedia"
              value={availableCourses.length}
            />
          </section>
          <section className="panel member-quick-actions">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Akses cepat</p>
                <h2>Lanjutkan aktivitas belajar</h2>
              </div>
            </div>
            <div className="quick-action-grid">
              <button
                className="action-card"
                type="button"
                onClick={() => handleDashboardMenuChange('my-courses')}
              >
                <Icon name="bookOpen" />
                <h3>Kelas Saya</h3>
                <p>Lanjutkan materi dan pantau progress kelas.</p>
              </button>
              <button
                className="action-card"
                type="button"
                onClick={() => handleDashboardMenuChange('available-classes')}
              >
                <Icon name="wallet" />
                <h3>Kelas Tersedia</h3>
                <p>Pilih kelas baru dan lanjutkan pembayaran Tripay.</p>
              </button>
              <button
                className="action-card"
                type="button"
                onClick={() => handleDashboardMenuChange('certificates')}
              >
                <Icon name="certificate" />
                <h3>Sertifikat</h3>
                <p>Lihat sertifikat yang siap diunduh.</p>
              </button>
              <button
                className="action-card"
                type="button"
                onClick={() => handleDashboardMenuChange('support')}
              >
                <Icon name="message" />
                <h3>Bantuan Mentor</h3>
                <p>Buka tiket dan balasan mentor.</p>
              </button>
            </div>
          </section>
        </>
      )}

      {activeMenu === 'my-courses' && selectedCourse && (
        <section className="panel course-room">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Ruang belajar</p>
              <h2>{selectedCourse.title}</h2>
            </div>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setSelectedCourseId(null)
                setActiveMaterialIndex(0)
              }}
            >
              <Icon name="arrowRight" />
              Daftar Kelas
            </button>
          </div>

          {materials.length ? (
            <div className="course-room-grid">
              <article className="material-viewer">
                {hasActiveMaterialMedia && (
                  <div className="material-media-stack">
                    {(activeProtectedVideoUrl || activeEmbedUrl) && (
                      <div className="video-frame">
                        {activeProtectedVideoUrl ? (
                          <>
                            <video
                              src={activeProtectedVideoUrl}
                              title={activeMaterial.title}
                              controls
                              controlsList="nodownload noplaybackrate"
                              disablePictureInPicture
                              onContextMenu={(event) => event.preventDefault()}
                              preload="metadata"
                            >
                              Browser Anda belum mendukung pemutar video.
                            </video>
                            <span className="video-watermark">{loginName}</span>
                          </>
                        ) : (
                          <iframe
                            src={activeEmbedUrl}
                            title={activeMaterial.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          ></iframe>
                        )}
                      </div>
                    )}
                    {activeMaterialImageUrl && (
                      <figure className="material-image-frame">
                        <img
                          src={activeMaterialImageUrl}
                          alt={activeMaterial.imageName || activeMaterial.title}
                        />
                      </figure>
                    )}
                  </div>
                )}

                {activeMaterial.description && (
                  <section className="material-description-section">
                    <div>
                      <p className="eyebrow">Deskripsi materi</p>
                      <h3>Catatan pembelajaran</h3>
                    </div>
                    <div
                      className="material-description"
                      dangerouslySetInnerHTML={{ __html: activeMaterial.description }}
                    />
                  </section>
                )}

                {(activeMaterial.pdfFile || resourceLinks.length > 0) && (
                  <section className="material-resources" aria-label="Materi pendukung">
                    <div>
                      <p className="eyebrow">Materi pendukung</p>
                      <h3>File dan link referensi</h3>
                    </div>
                    <div className="material-resource-actions">
                      {activeMaterial.pdfFile && (
                        <a
                          className="btn btn-secondary"
                          href={activeMaterial.pdfFile}
                          download={activeMaterial.pdfName || `${activeMaterial.title}.pdf`}
                        >
                          <Icon name="fileText" />
                          Download PDF
                        </a>
                      )}
                      {resourceLinks.map((link) => (
                        <a
                          className="btn btn-secondary"
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          key={link.id}
                        >
                          <Icon name="arrowRight" />
                          {link.title}
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                <div className="material-content">
                  <p className="eyebrow">
                    Materi {currentMaterialIndex + 1} dari {materials.length}
                  </p>
                  <h3>{activeMaterial.title}</h3>
                  {promptItems.length > 0 && (
                    <section className="prompt-gallery" aria-label="Gambar dan prompt materi">
                      <div className="prompt-gallery-heading">
                        <div>
                          <p className="eyebrow">Asset prompt</p>
                          <h3>Gambar referensi dan prompt</h3>
                        </div>
                        <p className="scroll-hint">Geser kartu untuk melihat gambar dan prompt lainnya.</p>
                      </div>
                      <div className="prompt-gallery-track">
                        {promptItems.map((item) => (
                          <article
                            className={item.image ? 'prompt-card' : 'prompt-card text-only'}
                            key={item.id}
                          >
                            {item.image && (
                              <button
                                className="prompt-card-image"
                                type="button"
                                onClick={() => setPreviewImage(item)}
                                aria-label={`Preview ${item.title}`}
                              >
                                <img src={item.image} alt={item.title} />
                              </button>
                            )}
                            <div className="prompt-card-body">
                              <h3>{item.title}</h3>
                              {item.prompt && <p className="prompt-card-text">{item.prompt}</p>}
                              {(item.prompt || item.instruction || item.image) && (
                                <div className="prompt-actions">
                                  {item.prompt && (
                                    <button
                                      className="btn btn-secondary"
                                      type="button"
                                      onClick={() => handleCopyPrompt(item.prompt)}
                                    >
                                      <Icon name="fileText" />
                                      Copy
                                    </button>
                                  )}
                                  {item.instruction && (
                                    <button
                                      className="btn btn-secondary"
                                      type="button"
                                      onClick={() => setActivePromptInstruction(item)}
                                    >
                                      <Icon name="fileText" />
                                      Petunjuk
                                    </button>
                                  )}
                                  {item.image && (
                                    <>
                                      <button
                                        className="btn btn-secondary"
                                        type="button"
                                        onClick={() => setPreviewImage(item)}
                                      >
                                        <Icon name="image" />
                                        Preview
                                      </button>
                                      <button
                                        className="btn btn-secondary"
                                        type="button"
                                        onClick={() => handleDownloadPromptImage(item)}
                                      >
                                        <Icon name="arrowRight" />
                                        Download
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                  {activeMaterial.requiresTask ? (
                    <div className="task-box">
                      <h3>Tugas materi</h3>
                      <p>{activeMaterial.taskPrompt}</p>
                      {activeServerSubmission && !isTaskFormOpen ? (
                        <div className="submitted-task-state">
                          <p className="action-feedback">
                            Tugas sudah terkirim. Materi berikutnya terbuka.
                          </p>
                          {activeServerSubmission?.answer && (
                            <div className="submission-answer">
                              <small>Kiriman Anda</small>
                              <p>{activeServerSubmission.answer}</p>
                              {activeServerSubmission.attachmentUrl && (
                                <a
                                  className="submission-attachment-link"
                                  href={activeServerSubmission.attachmentUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Icon name="image" />
                                  {activeServerSubmission.attachmentName || 'Lihat gambar tugas'}
                                </a>
                              )}
                            </div>
                          )}
                          {activeServerSubmission?.feedback || activeServerSubmission?.rating > 0 ? (
                            <div className="mentor-answer">
                              <small>Feedback mentor</small>
                              {activeServerSubmission.feedback && (
                                <p>{activeServerSubmission.feedback}</p>
                              )}
                              {activeServerSubmission.rating > 0 && (
                                <span className="submission-rating-view">
                                  {'★'.repeat(activeServerSubmission.rating)}
                                  {'☆'.repeat(5 - activeServerSubmission.rating)}
                                </span>
                              )}
                              <mark>{activeServerSubmission.status}</mark>
                            </div>
                          ) : (
                            <small className="muted-note">
                              Feedback mentor akan muncul di sini setelah tugas direview.
                            </small>
                          )}
                          {canEditActiveSubmission && (
                            <button
                              className="btn btn-secondary"
                              type="button"
                              onClick={handleEditActiveSubmission}
                            >
                              <Icon name="fileText" />
                              Ubah Tugas
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          {canReviseActiveSubmission && activeServerSubmission?.feedback && (
                            <div className="mentor-answer revision-feedback">
                              <small>Feedback revisi dari admin</small>
                              <p>{activeServerSubmission.feedback}</p>
                              <mark>{activeServerSubmission.status}</mark>
                            </div>
                          )}
                          <label>
                          Link atau catatan tugas
                          <textarea
                            value={taskDraft}
                            onChange={(event) => setTaskDraft(event.target.value)}
                            placeholder="Tempel link Google Drive, YouTube, Instagram, atau tulis catatan tugas..."
                            rows="4"
                          ></textarea>
                          </label>
                          {isTaskImageAllowed && (
                          <div className="task-upload-box">
                            <label className="upload-control">
                              <Icon name="image" />
                              {isTaskImageRequired
                                ? 'Upload gambar tugas wajib'
                                : 'Upload gambar tugas'}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleTaskImageChange}
                              />
                            </label>
                            <div>
                              <strong>
                                {taskAttachment?.name || 'Belum ada gambar tugas'}
                              </strong>
                              <small>
                                Gambar tugas akan tersimpan di Supabase Storage.
                              </small>
                            </div>
                            {taskAttachment && (
                              <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={() => setTaskAttachment(null)}
                              >
                                <Icon name="x" />
                                Hapus
                              </button>
                            )}
                          </div>
                          )}
                        </>
                      )}
                      <div className="task-actions">
                        {hasPreviousMaterial && (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={handlePreviousMaterial}
                          >
                            <Icon name="arrowRight" className="icon-left" />
                            Materi Sebelumnya
                          </button>
                        )}
                        {isTaskFormOpen && (
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={handleSubmitTask}
                          >
                            <Icon name="message" />
                            {canReviseActiveSubmission
                              ? 'Kirim Revisi'
                              : isEditingActiveSubmission
                                ? 'Simpan Perubahan'
                                : 'Kirim Tugas'}
                          </button>
                        )}
                        {hasNextMaterial && (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={handleNextMaterial}
                            disabled={!canOpenNextMaterial}
                          >
                            <Icon name="arrowRight" />
                            Materi Berikutnya
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="task-box">
                      <h3>Tanpa tugas</h3>
                      <p>Materi ini bisa langsung dilanjutkan ke materi berikutnya.</p>
                      <div className="task-actions">
                        {hasPreviousMaterial && (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={handlePreviousMaterial}
                          >
                            <Icon name="arrowRight" className="icon-left" />
                            Materi Sebelumnya
                          </button>
                        )}
                        {hasNextMaterial && (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={handleNextMaterial}
                          >
                            <Icon name="arrowRight" />
                            Materi Berikutnya
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {isSelectedCourseComplete && isLastMaterial && (
                    <div className="testimonial-submit-box">
                      <div>
                        <p className="eyebrow">Testimoni peserta</p>
                        <h3>
                          {selectedCourseTestimonial
                            ? 'Testimoni sudah dikirim'
                            : 'Bagikan pengalamanmu'}
                        </h3>
                        <p>
                          {selectedCourseTestimonial
                            ? selectedCourseTestimonial.status === 'approved'
                              ? 'Terima kasih. Testimoni kamu sudah tampil di homepage.'
                              : selectedCourseTestimonial.status === 'rejected'
                                ? 'Testimoni sebelumnya belum disetujui. Kirim ulang dari menu Testimoni.'
                                : 'Testimoni kamu sedang menunggu persetujuan admin.'
                            : 'Kamu sudah menyelesaikan kelas ini. Kirim pengalamanmu dari menu Testimoni.'}
                        </p>
                      </div>
                      {canSendSelectedCourseTestimonial && (
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() => handleDashboardMenuChange('testimonials')}
                        >
                          <Icon name="send" />
                          Buka Menu Testimoni
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>

              <aside className="material-sidebar" aria-label="Daftar materi">
                <div className="material-list-heading">
                  <p className="eyebrow">Daftar materi</p>
                  <h3>{materials.length} materi tersedia</h3>
                </div>
                {materials.map((material, index) => {
                  const unlocked = isMaterialUnlocked(index)
                  const submitted = Boolean(
                    submittedTasks[getTaskKey(selectedCourse.id, material.id)] ||
                      submissions.find(
                        (item) =>
                          item.classId === selectedCourse.id &&
                          item.materialId === material.id,
                      ),
                  )

                  return (
                    <button
                      className={
                        currentMaterialIndex === index
                          ? 'material-nav active'
                          : 'material-nav'
                      }
                      type="button"
                      key={material.id}
                      onClick={() => handleOpenMaterial(index)}
                      disabled={!unlocked}
                    >
                      <span>{index + 1}</span>
                      <strong>{material.title}</strong>
                      <small>
                        {!unlocked
                          ? 'Terkunci'
                          : material.requiresTask
                            ? submitted
                              ? 'Tugas terkirim'
                              : 'Wajib tugas'
                            : 'Tanpa tugas'}
                      </small>
                    </button>
                  )
                })}
              </aside>
            </div>
          ) : (
            <article className="empty-state">
              <Icon name="video" />
              <h3>Materi belum tersedia</h3>
              <p>Admin bisa menambahkan link YouTube dari menu kelola kelas.</p>
            </article>
          )}

          <button
            className="class-discussion-floating-button"
            type="button"
            onClick={() => setIsDiscussionOpen(true)}
            aria-label="Buka diskusi kelas"
          >
            <Icon name="message" />
            <span>Diskusi</span>
            {selectedCourseDiscussions.length > 0 && (
              <strong>{selectedCourseDiscussions.length > 99 ? '99+' : selectedCourseDiscussions.length}</strong>
            )}
          </button>

          {isDiscussionOpen && (
            <div className="class-discussion-backdrop" role="presentation">
              <section
                className="class-discussion-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="class-discussion-title"
              >
                <header className="class-discussion-header">
                  <div>
                    <p className="eyebrow">Diskusi kelas</p>
                    <h3 id="class-discussion-title">{selectedCourse.title}</h3>
                    <small>{selectedCourseDiscussions.length} pesan diskusi</small>
                  </div>
                  <button
                    className="icon-action-button"
                    type="button"
                    onClick={() => setIsDiscussionOpen(false)}
                    aria-label="Tutup diskusi kelas"
                  >
                    <Icon name="x" />
                  </button>
                </header>

                <div className="class-discussion-thread" ref={discussionListRef}>
                  {selectedCourseDiscussions.map((message) => {
                    const isOwnMessage = message.senderRole === 'member' && message.senderId === userId
                    const isAdminMessage = message.senderRole === 'admin'

                    return (
                      <article
                        className={[
                          'class-discussion-message',
                          isOwnMessage ? 'is-own' : '',
                          isAdminMessage ? 'is-admin' : '',
                        ].filter(Boolean).join(' ')}
                        key={message.id}
                      >
                        <span className="discussion-avatar" aria-hidden="true">
                          {message.senderAvatar ? (
                            <img src={message.senderAvatar} alt="" />
                          ) : (
                            <Icon name={isAdminMessage ? 'shield' : 'user'} />
                          )}
                        </span>
                        <div className="discussion-bubble">
                          <div className="discussion-meta">
                            <strong>{message.senderName}</strong>
                            <small>
                              {message.createdAt
                                ? new Date(message.createdAt).toLocaleString('id-ID', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })
                                : ''}
                            </small>
                          </div>
                          <p>{message.message}</p>
                        </div>
                      </article>
                    )
                  })}

                  {!selectedCourseDiscussions.length && (
                    <div className="class-discussion-empty">
                      <Icon name="message" />
                      <h3>Belum ada diskusi</h3>
                      <p>Mulai tanya jawab pertama untuk kelas ini.</p>
                    </div>
                  )}
                </div>

                <form className="class-discussion-form" onSubmit={handleSendDiscussionMessage}>
                  <label>
                    <span>Tulis diskusi</span>
                    <textarea
                      value={discussionDraft}
                      onChange={(event) => setDiscussionDraft(event.target.value)}
                      placeholder="Tulis pertanyaan, kendala, atau insight belajar..."
                      rows="3"
                      maxLength={1200}
                    />
                  </label>
                  <div className="class-discussion-form-actions">
                    {discussionStatus && <small>{discussionStatus}</small>}
                    <button className="btn btn-primary" type="submit">
                      <Icon name="send" />
                      Kirim
                    </button>
                  </div>
                </form>
              </section>
            </div>
          )}
        </section>
      )}

      {activeMenu === 'my-courses' && !selectedCourse && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Progress</p>
              <h2>Kelas saya</h2>
            </div>
          </div>
          <div className="learning-list">
            {courses.map((course) => {
              const progress = getCourseProgress(course)

              return (
              <button
                className="member-class-card"
                type="button"
                key={course.id}
                onClick={() => handleOpenCourse(course)}
              >
                <span className="member-class-visual" aria-hidden="true">
                  {course.thumbnail ? (
                    <img src={course.thumbnail} alt="" />
                  ) : (
                    <Icon name="image" />
                  )}
                  <span>{course.status}</span>
                </span>
                <span className="member-class-body">
                  <h3>{course.title}</h3>
                  <p>
                    {course.mentor}
                  </p>
                  <span className="member-class-next">{course.next}</span>
                </span>
                <span className="member-class-progress">
                  <span className="progress-ring" style={{ '--progress': progress }}>
                    <strong>{progress}%</strong>
                  </span>
                  <span className="progress-block">
                    <span className="progress-meta">
                      <span>Progress realtime</span>
                      <span>{progress}% selesai</span>
                    </span>
                    <span className="progress-track">
                      <span style={{ width: `${progress}%` }}></span>
                    </span>
                  </span>
                </span>
                <span className="btn btn-primary member-class-button">
                  <Icon name="bookOpen" />
                  Masuk Kelas
                </span>
              </button>
              )
            })}
            {!courses.length && (
              <article className="empty-state">
                <Icon name="bookOpen" />
                <h3>Belum ada akses kelas</h3>
                <p>Kelas akan muncul di sini setelah admin memberikan akses belajar.</p>
              </article>
            )}
          </div>
        </section>
      )}

      {activeMenu === 'available-classes' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Katalog member</p>
              <h2>Kelas tersedia</h2>
            </div>
          </div>
          <div className="learning-list">
            {availableCourses.map((course) => {
              const normalPrice = Math.max(0, Math.round(Number(course.price) || 0))
              const salePrice = Math.max(0, Math.round(Number(course.salePrice) || 0))
              const price = salePrice || normalPrice
              const isCheckingOut = checkoutClassId === course.id
              const pendingPayment = activePaymentsByClass.get(course.id)
              const expiredPayment = expiredPaymentsByClass.get(course.id)
              const expiredNoticeKey = getExpiredPaymentDismissKey(expiredPayment)
              const showExpiredNotice =
                Boolean(expiredPayment && expiredNoticeKey && !dismissedExpiredPayments.includes(expiredNoticeKey))
              const accessNote = price
                ? 'Akses materi dibuka otomatis setelah pembayaran sukses.'
                : 'Kelas gratis bisa langsung dibuka dari akun member.'
              let checkoutButtonLabel = pendingPayment
                ? 'Selesaikan Pembayaran'
                : price
                  ? 'Bayar & Buka Akses'
                  : 'Masuk Gratis'

              if (isCheckingOut) {
                checkoutButtonLabel = price ? 'Membuat invoice...' : 'Membuka akses...'
              }

              return (
                <article className="member-class-card available-class-card" key={course.id}>
                  <span className="member-class-visual">
                    {course.thumbnail ? (
                      <img src={course.thumbnail} alt="" />
                    ) : (
                      <Icon name="bookOpen" />
                    )}
                    <span>{course.status}</span>
                  </span>
                  <span className="member-class-body">
                    <h3>{course.title}</h3>
                    <p>
                      {course.mentor}
                    </p>
                    <span className="member-class-next">{accessNote}</span>
                  </span>
                  <span className="available-class-price">
                    <small>{price ? 'Harga kelas' : 'Kelas gratis'}</small>
                    <strong>{price ? formatRupiah(price) : 'Gratis'}</strong>
                    {salePrice > 0 && normalPrice > salePrice && (
                      <small className="struck-price" style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '0.85em', marginLeft: '6px' }}>
                        {formatRupiah(normalPrice)}
                      </small>
                    )}
                  </span>
                  <span className="available-payment-action">
                    {showExpiredNotice && (
                      <span className="expired-payment-notice">
                        <span>Pembayaran sebelumnya expired.</span>
                        <button
                          type="button"
                          aria-label="Tutup pemberitahuan pembayaran expired"
                          onClick={() => dismissExpiredPaymentNotice(expiredNoticeKey)}
                        >
                          <Icon name="x" />
                        </button>
                      </span>
                    )}
                    <button
                      className="btn btn-primary member-class-button"
                      type="button"
                      disabled={isCheckingOut}
                      onClick={() => openPaymentMethodPopup(course)}
                    >
                      <Icon name="wallet" />
                      {checkoutButtonLabel}
                    </button>
                    {pendingPayment && (
                      <button
                        className="btn btn-secondary member-class-button change-payment-method-button"
                        type="button"
                        disabled={isCheckingOut}
                        onClick={() => openPaymentMethodPopup(course, { forceNewPayment: true })}
                      >
                        Ganti Metode
                      </button>
                    )}
                  </span>
                </article>
              )
            })}
            {!availableCourses.length && (
              <article className="empty-state">
                <Icon name="checkCircle" />
                <h3>Semua kelas aktif sudah terbuka</h3>
                <p>Kelas baru akan muncul di sini saat admin menambah kelas aktif.</p>
              </article>
            )}
          </div>
        </section>
      )}

      {paymentMethodCourse && (
        <div className="payment-method-modal-backdrop" role="presentation">
          <section
            className="payment-method-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-method-title"
          >
            <div className="payment-method-modal-heading">
              <div>
                <p className="eyebrow">Pembayaran Tripay</p>
                <h2 id="payment-method-title">
                  {isChangingPaymentMethod ? 'Ganti metode pembayaran' : 'Pilih metode pembayaran'}
                </h2>
                <p>{paymentMethodCourse.title}</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Tutup pilihan metode pembayaran"
                onClick={() => {
                  setPaymentMethodCourse(null)
                  setSelectedPaymentMethodCode('')
                  setIsPaymentTermsAccepted(false)
                  setIsChangingPaymentMethod(false)
                }}
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="payment-method-grid" aria-label="Daftar metode pembayaran">
              {tripayPaymentMethods.map((method) => (
                <button
                  className={`payment-method-option ${
                    selectedPaymentMethodCode === method.code ? 'selected' : ''
                  }`}
                  type="button"
                  key={method.code}
                  title={method.label}
                  aria-label={method.label}
                  aria-pressed={selectedPaymentMethodCode === method.code}
                  onClick={() => setSelectedPaymentMethodCode(method.code)}
                >
                  <PaymentMethodLogo method={method} />
                </button>
              ))}
            </div>
            {isChangingPaymentMethod && (
              <p className="payment-method-note">
                Invoice lama tetap bisa dibayar sampai kedaluwarsa. Jika memakai metode baru,
                lanjutkan pembayaran dari invoice terbaru.
              </p>
            )}
            <div className="payment-breakdown" aria-live="polite">
              <span>
                <small>{paymentMethodCourse.itemType === 'digital_product' ? 'Harga produk' : 'Harga kelas'}</small>
                <strong>{formatRupiah(paymentModalAmount)}</strong>
              </span>
              <span>
                <small>Biaya layanan</small>
                <strong>{paymentModalFee ? formatRupiah(paymentModalFee) : 'Gratis'}</strong>
              </span>
              <span className="payment-breakdown-total">
                <small>Total pembayaran</small>
                <strong>{formatRupiah(paymentModalTotal)}</strong>
              </span>
            </div>
            <div className="secure-payment-note">
              <span className="secure-payment-icon" aria-hidden="true">
                <Icon name="lock" />
              </span>
              <div>
                <small>secure</small>
                <strong>Secure Payment</strong>
                <p>
                  Pembayaran diproses melalui kanal resmi Tripay dan dilindungi enkripsi RSA.
                  Mitra pembayaran berada dalam ekosistem yang diawasi oleh Otoritas Jasa Keuangan (OJK) Republik Indonesia.
                </p>
              </div>
            </div>
            <label className="payment-terms-check">
              <input
                type="checkbox"
                checked={isPaymentTermsAccepted}
                onChange={(event) => setIsPaymentTermsAccepted(event.target.checked)}
              />
              <span>
                Saya menyetujui ketentuan penggunaan dan memahami akses aktif otomatis setelah pembayaran sukses.
              </span>
            </label>
            <div className="payment-method-modal-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setPaymentMethodCourse(null)
                  setSelectedPaymentMethodCode('')
                  setIsPaymentTermsAccepted(false)
                  setIsChangingPaymentMethod(false)
                }}
              >
                Batal
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={!selectedPaymentMethodCode || !isPaymentTermsAccepted}
                onClick={handleCreateSelectedPayment}
              >
                <Icon name="bookOpen" />
                Buat Pembayaran
              </button>
            </div>
          </section>
        </div>
      )}

      {(activeMenu === 'digital-products' || activeMenu === 'prompts') && (
        selectedDigitalProduct ? (
          <section className="digital-product-detail-page">
            {(() => {
              const product = selectedDigitalProduct
              const isPrompt = product.productType === 'prompt'
              const normalPrice = Math.max(0, Math.round(Number(product.price) || 0))
              const salePrice = Math.max(0, Math.round(Number(product.salePrice) || 0))
              const price = salePrice || normalPrice
              const isOwned = ownedDigitalProductIds.has(product.id)
              const canRepeatPurchase = product.allowRepeatPurchase === true
              const productSoldOut = isProductSoldOut(product)
              const blockNewPurchase = productSoldOut && !(isOwned && !canRepeatPurchase)
              const pendingPayment = activePaymentsByProduct.get(product.id)
              const expiredPayment = expiredPaymentsByProduct.get(product.id)
              const expiredNoticeKey = getExpiredPaymentDismissKey(expiredPayment)
              const showExpiredNotice =
                Boolean(expiredPayment && expiredNoticeKey && !dismissedExpiredPayments.includes(expiredNoticeKey))
              const isCheckingOut = checkoutClassId === `digital_product:${product.id}`
              const isInCart = digitalProductCartIds.includes(product.id)
              let buttonLabel = blockNewPurchase
                ? 'Stok Habis'
                : isOwned
                ? canRepeatPurchase
                  ? 'Beli Lagi'
                  : 'Lihat Akses'
                : pendingPayment
                  ? 'Selesaikan Pembayaran'
                  : price
                    ? product.purchaseButtonLabel || (isPrompt ? 'Beli Prompt' : 'Beli Produk')
                    : (isPrompt ? 'Ambil Prompt' : 'Ambil Gratis')

              if (isCheckingOut) {
                buttonLabel = price ? 'Membuat invoice...' : 'Membuka akses...'
              }

              return (
                <>
                  <div className="digital-product-detail-topbar">
                    <button
                      className="icon-action-button"
                      type="button"
                      aria-label="Kembali ke produk digital"
                      onClick={handleBackToDigitalProducts}
                    >
                      <Icon name="arrowLeft" />
                    </button>
                    <button
                      className="icon-action-button"
                      type="button"
                      aria-label="Bagikan produk"
                      onClick={() => handleShareDigitalProduct(product)}
                    >
                      <Icon name="share" />
                    </button>
                  </div>

                  <article className="digital-product-detail-hero">
                    <div className="digital-product-detail-image">
                      {product.thumbnail ? (
                        <img src={product.thumbnail} alt="" />
                      ) : (
                        <Icon name={isPrompt ? 'spark' : 'download'} />
                      )}
                      <span>{product.status}</span>
                    </div>
                    <div className="digital-product-detail-copy">
                      <div className="digital-product-seller">
                        <span className="digital-product-seller-logo" aria-hidden="true">
                          {safeWebsiteSettings.brandLogo ? (
                            <img src={safeWebsiteSettings.brandLogo} alt="" />
                          ) : (
                            <Icon name={safeWebsiteSettings.brandIcon || 'spark'} />
                          )}
                        </span>
                        <span>
                          <small>Produk dari</small>
                          <strong>{safeWebsiteSettings.siteTitle || safeWebsiteSettings.siteName}</strong>
                        </span>
                      </div>
                      <p className="eyebrow">{isPrompt ? 'Prompt AI' : 'Produk digital'}</p>
                      <h2>{product.title}</h2>
                      <p>{product.description || (isPrompt ? 'Prompt dikirim otomatis setelah pembayaran sukses.' : 'Akses produk dikirim otomatis setelah pembayaran sukses.')}</p>
                      <div className="digital-product-detail-tags" aria-label="Info produk digital">
                        <span>Akses otomatis</span>
                        <span>Delivery email</span>
                        <span>{isPrompt ? 'Copy prompt' : (product.platformType || 'Digital file')}</span>
                        <span>{getProductStockLabel(product)}</span>
                      </div>
                      <div className="digital-product-detail-price">
                        <small>{price ? 'Harga produk' : 'Produk gratis'}</small>
                        <strong>{price ? formatRupiah(price) : 'Gratis'}</strong>
                        {salePrice > 0 && normalPrice > salePrice && (
                          <small className="struck-price">{formatRupiah(normalPrice)}</small>
                        )}
                      </div>
                    </div>
                  </article>

                  <div className="digital-product-detail-grid">
                    <article className="panel digital-product-detail-panel">
                      <h3>Isi produk</h3>
                      <dl>
                        <div>
                          <dt>{isPrompt ? 'Format' : 'File'}</dt>
                          <dd>{isPrompt ? 'Prompt siap copy' : (product.fileName || 'Link akses produk')}</dd>
                        </div>
                        <div>
                          <dt>{isPrompt ? 'Lisensi' : 'Platform'}</dt>
                          <dd>{isPrompt ? (product.promptLicense || 'Personal & commercial use') : (product.platformType || 'Digital delivery')}</dd>
                        </div>
                        <div>
                          <dt>Akses</dt>
                          <dd>{isOwned ? 'Sudah aktif di akun Anda' : 'Aktif otomatis setelah pembayaran sukses'}</dd>
                        </div>
                      </dl>
                    </article>

                    {!isPrompt && (
                      <article className="panel digital-product-detail-panel">
                        <h3>Catatan</h3>
                        <p>{product.deliveryNote || product.customMessage || 'Instruksi akses akan dikirim ke email setelah pembayaran berhasil.'}</p>
                      </article>
                    )}
                  </div>

                  <div className="digital-product-sticky-actions">
                    {showExpiredNotice && (
                      <span className="expired-payment-notice">
                        <span>Pembayaran sebelumnya expired.</span>
                        <button
                          type="button"
                          aria-label="Tutup pemberitahuan pembayaran expired"
                          onClick={() => dismissExpiredPaymentNotice(expiredNoticeKey)}
                        >
                          <Icon name="x" />
                        </button>
                      </span>
                    )}
                    <button
                      className={`btn btn-secondary digital-cart-button ${isInCart ? 'active' : ''}`}
                      type="button"
                      disabled={blockNewPurchase}
                      onClick={() => handleToggleDigitalProductCart(product)}
                    >
                      <Icon name="cart" />
                      {isInCart ? 'Di Keranjang' : 'Keranjang'}
                    </button>
                    <button
                      className={`btn ${blockNewPurchase ? 'btn-secondary' : 'btn-primary'} digital-buy-button`}
                      type="button"
                      disabled={isCheckingOut || blockNewPurchase}
                      onClick={() => {
                        if (blockNewPurchase) {
                          return
                        }

                        if (isOwned && !canRepeatPurchase) {
                          openDigitalProductAccessPage(product)
                          return
                        }

                        openPaymentMethodPopup(product, { itemType: 'digital_product' })
                      }}
                    >
                      <Icon name={isOwned && !canRepeatPurchase ? 'download' : 'wallet'} />
                      {buttonLabel}
                    </button>
                    {pendingPayment && !isOwned && (
                      <button
                        className="btn btn-secondary change-payment-method-button"
                        type="button"
                        onClick={() => openPaymentMethodPopup(product, {
                          forceNewPayment: true,
                          itemType: 'digital_product',
                        })}
                      >
                        Ganti metode
                      </button>
                    )}
                  </div>
                </>
              )
            })()}
          </section>
        ) : (
          <section className="panel">
            {(() => {
              const isPromptMenu = activeMenu === 'prompts'
              const sourceProducts = isPromptMenu ? activePromptProducts : activeDigitalProducts
              const ownedProducts = sourceProducts.filter((product) => ownedDigitalProductIds.has(product.id))
              const availableProducts = sourceProducts.filter((product) => !ownedDigitalProductIds.has(product.id))
              const searchQuery = digitalProductSearchQuery.trim().toLowerCase()
              const baseProducts = digitalProductLibraryView === 'owned' ? ownedProducts : availableProducts
              const visibleProducts = baseProducts.filter((product) => {
                const normalPrice = Math.max(0, Math.round(Number(product.price) || 0))
                const salePrice = Math.max(0, Math.round(Number(product.salePrice) || 0))
                const price = salePrice || normalPrice
                const hasPendingPayment = activePaymentsByProduct.has(product.id)
                const matchesSearch = !searchQuery || [
                  product.title,
                  product.description,
                  product.fileName,
                  product.platformType,
                  product.promptLicense,
                ].some((value) => String(value || '').toLowerCase().includes(searchQuery))
                const matchesPriceFilter =
                  digitalProductPriceFilter === 'all' ||
                  (digitalProductPriceFilter === 'free' && price <= 0) ||
                  (digitalProductPriceFilter === 'paid' && price > 0) ||
                  (digitalProductPriceFilter === 'pending' && hasPendingPayment)

                return matchesSearch && matchesPriceFilter
              })
              const isFiltered = Boolean(searchQuery || digitalProductPriceFilter !== 'all')

              return (
                <>
                  <div className="panel-heading member-product-library-heading">
                    <div>
                      <p className="eyebrow">{isPromptMenu ? 'Prompt' : 'Produk digital'}</p>
                      <h2>{isPromptMenu ? 'Prompt' : 'Produk digital'}</h2>
                    </div>
                  </div>
                  <div className="member-product-library-toolbar">
                    <div className="member-product-library-tabs" role="tablist" aria-label="Status produk member">
                      <button
                        className={digitalProductLibraryView === 'available' ? 'active' : ''}
                        type="button"
                        role="tab"
                        aria-selected={digitalProductLibraryView === 'available'}
                        onClick={() => setDigitalProductLibraryView('available')}
                      >
                        Tersedia
                        <span>{availableProducts.length}</span>
                      </button>
                      <button
                        className={digitalProductLibraryView === 'owned' ? 'active' : ''}
                        type="button"
                        role="tab"
                        aria-selected={digitalProductLibraryView === 'owned'}
                        onClick={() => setDigitalProductLibraryView('owned')}
                      >
                        Terbeli
                        <span>{ownedProducts.length}</span>
                      </button>
                    </div>

                    <label className="member-product-library-search">
                      <span>Cari</span>
                      <input
                        type="search"
                        value={digitalProductSearchQuery}
                        onChange={(event) => setDigitalProductSearchQuery(event.target.value)}
                        placeholder={isPromptMenu ? 'Cari prompt...' : 'Cari produk digital...'}
                      />
                    </label>

                    <label className="member-product-library-filter">
                      <span>Filter</span>
                      <select
                        value={digitalProductPriceFilter}
                        onChange={(event) => setDigitalProductPriceFilter(event.target.value)}
                      >
                        <option value="all">Semua</option>
                        <option value="paid">Berbayar</option>
                        <option value="free">Gratis</option>
                        <option value="pending">Menunggu bayar</option>
                      </select>
                    </label>
                  </div>
            <div className="learning-list">
              {visibleProducts.map((product) => {
                const isPrompt = product.productType === 'prompt'
                const normalPrice = Math.max(0, Math.round(Number(product.price) || 0))
                const salePrice = Math.max(0, Math.round(Number(product.salePrice) || 0))
                const price = salePrice || normalPrice
                const isOwned = ownedDigitalProductIds.has(product.id)
                const canRepeatPurchase = product.allowRepeatPurchase === true
                const productSoldOut = isProductSoldOut(product)
                const blockNewPurchase = productSoldOut && !(isOwned && !canRepeatPurchase)
                const pendingPayment = activePaymentsByProduct.get(product.id)
                const expiredPayment = expiredPaymentsByProduct.get(product.id)
                const expiredNoticeKey = getExpiredPaymentDismissKey(expiredPayment)
                const showExpiredNotice =
                  Boolean(expiredPayment && expiredNoticeKey && !dismissedExpiredPayments.includes(expiredNoticeKey))
                const isCheckingOut = checkoutClassId === `digital_product:${product.id}`
                let buttonLabel = blockNewPurchase
                  ? 'Stok Habis'
                  : isOwned
                  ? canRepeatPurchase
                    ? 'Beli Lagi'
                    : 'Lihat Akses'
                  : pendingPayment
                    ? 'Selesaikan Pembayaran'
                    : price
                      ? product.purchaseButtonLabel || (isPrompt ? 'Beli Prompt' : 'Beli Produk')
                      : (isPrompt ? 'Ambil Prompt' : 'Ambil Gratis')

                if (isCheckingOut) {
                  buttonLabel = price ? 'Membuat invoice...' : 'Membuka akses...'
                }

                return (
                  <article
                    className={`member-class-card available-class-card digital-product-card product-layout-${product.blockLayout || 'default'}`}
                    key={product.id}
                  >
                    <span className="member-class-visual">
                      {product.thumbnail ? (
                        <img src={product.thumbnail} alt="" />
                      ) : (
                        <Icon name={isPrompt ? 'spark' : 'download'} />
                      )}
                    </span>
                    <span className="member-class-body">
                      <h3>{product.title}</h3>
                    </span>
                    <span className="available-class-price">
                      <small>{isOwned ? 'Status akses' : price ? (isPrompt ? 'Harga prompt' : 'Harga produk') : (isPrompt ? 'Prompt gratis' : 'Produk gratis')}</small>
                      <strong>{isOwned ? 'Terbeli' : price ? formatRupiah(price) : 'Gratis'}</strong>
                      {!isOwned && salePrice > 0 && normalPrice > salePrice && (
                        <small className="struck-price">{formatRupiah(normalPrice)}</small>
                      )}
                      <small className={productSoldOut ? 'stock-status is-sold-out' : 'stock-status'}>
                        {getProductStockLabel(product)}
                      </small>
                    </span>
                    <span className="available-payment-action">
                      {showExpiredNotice && (
                        <span className="expired-payment-notice">
                          <span>Pembayaran sebelumnya expired.</span>
                          <button
                            type="button"
                            aria-label="Tutup pemberitahuan pembayaran expired"
                            onClick={() => dismissExpiredPaymentNotice(expiredNoticeKey)}
                          >
                            <Icon name="x" />
                          </button>
                        </span>
                      )}
                      <button
                        className="btn btn-secondary member-class-button"
                        type="button"
                        onClick={() => handleOpenDigitalProductDetail(product)}
                      >
                        Detail
                      </button>
                      <button
                        className={`btn ${blockNewPurchase ? 'btn-secondary' : 'btn-primary'} member-class-button`}
                        type="button"
                        disabled={isCheckingOut || blockNewPurchase}
                        onClick={() => {
                          if (blockNewPurchase) {
                            return
                          }

                          if (isOwned && !canRepeatPurchase) {
                            openDigitalProductAccessPage(product)
                            return
                          }

                          openPaymentMethodPopup(product, { itemType: 'digital_product' })
                        }}
                      >
                        <Icon name={isOwned && !canRepeatPurchase ? 'download' : 'wallet'} />
                        {buttonLabel}
                      </button>
                      {pendingPayment && !isOwned && (
                        <button
                          className="btn btn-secondary member-class-button change-payment-method-button"
                          type="button"
                          onClick={() => openPaymentMethodPopup(product, {
                            forceNewPayment: true,
                            itemType: 'digital_product',
                          })}
                        >
                          Ganti metode
                        </button>
                      )}
                    </span>
                  </article>
                )
              })}
              {!visibleProducts.length && (
                <article className="empty-state">
                  <Icon name={isPromptMenu ? 'spark' : 'download'} />
                  <h3>
                    {digitalProductLibraryView === 'owned'
                      ? isPromptMenu ? 'Belum ada prompt terbeli' : 'Belum ada produk terbeli'
                      : isPromptMenu ? 'Belum ada prompt tersedia' : 'Belum ada produk tersedia'}
                  </h3>
                  <p>
                    {isFiltered
                      ? 'Coba ubah kata pencarian atau filter yang dipilih.'
                      : digitalProductLibraryView === 'owned'
                        ? 'Item yang sudah dibeli akan muncul di sini.'
                        : isPromptMenu
                          ? 'Prompt akan muncul setelah admin mengaktifkannya.'
                          : 'Produk digital akan muncul setelah admin mengaktifkannya.'}
                  </p>
                </article>
              )}
            </div>
                </>
              )
            })()}
          </section>
        )
      )}

      {activeMenu === 'testimonials' && (
        <section className="panel member-testimonial-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Testimoni member</p>
              <h2>Kirim testimoni kelas</h2>
              <small>
                Form testimoni hanya terbuka untuk kelas yang sudah mencapai progress 100%.
              </small>
            </div>
          </div>

          <div className="member-testimonial-grid">
            {courses.map((course) => {
              const progress = getCourseProgress(course)
              const testimonial = getMemberTestimonialForCourse(course.id)
              const canSubmit = progress >= 100 && (!testimonial || testimonial.status === 'rejected')
              const draft = testimonialDrafts[course.id] || ''

              return (
                <article
                  className={`member-testimonial-card ${
                    progress >= 100 ? 'is-complete' : 'is-locked'
                  }`}
                  data-testimonial-course-id={course.id}
                  key={course.id}
                >
                  <div className="member-testimonial-card-header">
                    <span className="member-testimonial-visual" aria-hidden="true">
                      {course.thumbnail ? (
                        <img src={course.thumbnail} alt="" />
                      ) : (
                        <Icon name="bookOpen" />
                      )}
                    </span>
                    <div className="member-testimonial-title">
                      <small>{progress >= 100 ? 'Kelas selesai' : 'Belum selesai'}</small>
                      <h3>{course.title}</h3>
                      <span>{course.mentor || 'Ibnu Creative'}</span>
                    </div>
                  </div>

                  <div className="member-testimonial-progress">
                    <span>
                      <small>Progress</small>
                      <strong>{progress}%</strong>
                    </span>
                    <span className="progress-track">
                      <span style={{ width: `${progress}%` }}></span>
                    </span>
                  </div>

                  {testimonial && (
                    <div className="member-testimonial-existing">
                      <span>{getTestimonialStatusLabel(testimonial.status)}</span>
                      <p>{testimonial.message}</p>
                    </div>
                  )}

                  {canSubmit ? (
                    <div className="member-testimonial-form">
                      <label>
                        Tulis testimoni
                        <textarea
                          value={draft}
                          maxLength={testimonialMaxLength}
                          onChange={(event) =>
                            handleTestimonialDraftChange(course.id, event.target.value)
                          }
                          placeholder="Ceritakan hasil atau pengalamanmu setelah mengikuti kelas ini."
                          rows={4}
                        />
                      </label>
                      <div className="member-testimonial-actions">
                        <small className="testimonial-character-count">
                          {draft.length}/{testimonialMaxLength} karakter
                        </small>
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() => handleSubmitTestimonial(course)}
                          disabled={!draft.trim()}
                        >
                          <Icon name="send" />
                          Kirim Testimoni
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="member-testimonial-locked">
                      <Icon name={progress >= 100 ? 'checkCircle' : 'lock'} />
                      <span>
                        {progress >= 100
                          ? 'Testimoni kelas ini sudah tercatat.'
                          : 'Selesaikan progress kelas sampai 100% untuk membuka form testimoni.'}
                      </span>
                    </div>
                  )}
                </article>
              )
            })}

            {!courses.length && (
              <article className="empty-state">
                <Icon name="message" />
                <h3>Belum ada kelas untuk diberi testimoni</h3>
                <p>Kelas yang kamu akses akan muncul di sini.</p>
              </article>
            )}
          </div>
        </section>
      )}

      {activeMenu === 'certificates' && (
        <section className="panel certificate-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Sertifikat</p>
              <h2>Sertifikat kelulusan kelas</h2>
              <small>
                Sertifikat bisa dibuat setelah progress kelas mencapai 100%.
              </small>
            </div>
          </div>
          <div className="certificate-summary-grid">
            <article>
              <Icon name="checkCircle" />
              <strong>{completedCourses.length}</strong>
              <span>Kelas selesai</span>
            </article>
            <article>
              <Icon name="certificate" />
              <strong>{certificates.length}</strong>
              <span>Sertifikat dibuat</span>
            </article>
            <article>
              <Icon name="clock" />
              <strong>
                {certificateNameChangeRequests.filter((request) => request.status === 'pending').length}
              </strong>
              <span>Menunggu admin</span>
            </article>
          </div>
          <div className="certificate-course-list">
            {courses.map((course) => {
              const progress = getCourseProgress(course)
              const certificate = certificatesByClass.get(course.id)
              const request = certificate ? certificateRequestsByRow.get(certificate.id) : null
              const nameDraft = certificateNameDrafts[course.id] ?? loginName ?? ''
              const changeDraft = certificate ? certificateChangeDrafts[certificate.id] || {} : {}
              const isSelected = selectedCertificateId === certificate?.id
              const canCreate = progress >= 100
              const hasCertificateTestimonial = hasSubmittedCertificateTestimonial(course.id)
              const needsCertificateTestimonial = canCreate && !hasCertificateTestimonial
              const certificateTemplate = certificate
                ? certificate.templateSnapshot ||
                  certificateTemplatesById.get(certificate.templateId) ||
                  certificateTemplatesByClass.get(certificate.classId) ||
                  null
                : null

              return (
                <article
                  className={`certificate-course-card ${certificate ? 'has-certificate' : ''}`}
                  key={course.id}
                >
                  <div className="certificate-course-media">
                    {course.thumbnail ? (
                      <img src={course.thumbnail} alt="" loading="lazy" />
                    ) : (
                      <Icon name="bookOpen" />
                    )}
                  </div>
                  <div className="certificate-course-content">
                    <div className="certificate-course-heading">
                      <div>
                        <p className="eyebrow">{course.mentor || 'Ibnu Creative'}</p>
                        <h3>{course.title}</h3>
                      </div>
                      <span className={canCreate ? 'status-pill success' : 'status-pill'}>
                        {progress}% selesai
                      </span>
                    </div>

                    {!certificate && (
                      <div className="certificate-create-box">
                        {canCreate ? (
                          <>
                            <label>
                              Nama lengkap pada sertifikat
                              <input
                                type="text"
                                value={nameDraft}
                                onChange={(event) =>
                                  handleCertificateNameDraftChange(course.id, event.target.value)
                                }
                                placeholder="Contoh: Ramdilata Ibnu Sajara"
                              />
                            </label>
                            <button
                              className="btn btn-primary"
                              type="button"
                              onClick={() => handleGenerateCertificate(course)}
                            >
                              <Icon name="certificate" />
                              Buat Sertifikat
                            </button>
                            {needsCertificateTestimonial && (
                              <div className="certificate-testimonial-required-note">
                                <Icon name="message" />
                                <span>Isi testimoni kelas dulu sebelum membuat sertifikat.</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="certificate-locked-note">
                            <Icon name="lock" />
                            <span>Selesaikan semua tugas wajib sampai 100% untuk membuka sertifikat.</span>
                          </div>
                        )}
                      </div>
                    )}

                    {certificate && (
                      <div className="certificate-issued-box">
                        <CertificatePreview
                          certificate={certificate}
                          siteName={safeWebsiteSettings.siteName}
                          brandLogo={safeWebsiteSettings.brandLogo}
                          brandIcon={safeWebsiteSettings.brandIcon}
                          template={certificateTemplate}
                        />
                        <div className="certificate-actions">
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() => handleDownloadCertificate(certificate)}
                          >
                            <Icon name="download" />
                            Download PDF
                          </button>
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => handleOpenCertificateVerification(certificate)}
                          >
                            <Icon name="shield" />
                            Verifikasi
                          </button>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => setSelectedCertificateId(isSelected ? '' : certificate.id)}
                          >
                            <Icon name="userPen" />
                            Buat Ulang Nama
                          </button>
                        </div>
                        {needsCertificateTestimonial && (
                          <div className="certificate-testimonial-required-note">
                            <Icon name="message" />
                            <span>Isi testimoni kelas dulu sebelum mendownload sertifikat.</span>
                          </div>
                        )}

                        {!request && !certificate.nameChangeUsed && (
                          <div className={`certificate-regenerate-box ${isSelected ? 'active' : ''}`.trim()}>
                            <Icon name="userPen" />
                            <div>
                              <strong>Buat ulang nama sertifikat</strong>
                              <span>
                                Kalau nama di sertifikat salah, kamu bisa mengajukan perubahan 1 kali dan menunggu persetujuan admin.
                              </span>
                            </div>
                            <button
                              className="btn btn-secondary"
                              type="button"
                              onClick={() => setSelectedCertificateId(isSelected ? '' : certificate.id)}
                            >
                              {isSelected ? 'Tutup Form' : 'Ajukan Nama Baru'}
                            </button>
                          </div>
                        )}

                        {request && (
                          <div className={`certificate-request-status status-${request.status}`}>
                            <strong>
                              {request.status === 'approved'
                                ? 'Perubahan nama disetujui'
                                : request.status === 'rejected'
                                  ? 'Perubahan nama ditolak'
                                  : 'Menunggu persetujuan admin'}
                            </strong>
                            <span>
                              {request.oldName} ke {request.newName}
                            </span>
                            {request.adminNote && <small>Catatan admin: {request.adminNote}</small>}
                          </div>
                        )}

                        {isSelected && !request && !certificate.nameChangeUsed && (
                          <div className="certificate-change-form">
                            <label>
                              Nama lama
                              <input type="text" value={certificate.participantName} disabled />
                            </label>
                            <label>
                              Nama baru
                              <input
                                type="text"
                                value={changeDraft.newName || ''}
                                onChange={(event) =>
                                  handleCertificateChangeDraftChange(
                                    certificate.id,
                                    'newName',
                                    event.target.value,
                                  )
                                }
                                placeholder="Nama baru sesuai identitas"
                              />
                            </label>
                            <label className="wide">
                              Alasan perubahan
                              <textarea
                                value={changeDraft.reason || ''}
                                onChange={(event) =>
                                  handleCertificateChangeDraftChange(
                                    certificate.id,
                                    'reason',
                                    event.target.value,
                                  )
                                }
                                rows="3"
                                placeholder="Contoh: Ada kesalahan penulisan nama."
                              ></textarea>
                            </label>
                            <p>
                              Kesempatan ubah nama hanya 1 kali dan akan menunggu persetujuan admin.
                            </p>
                            <button
                              className="btn btn-primary"
                              type="button"
                              onClick={() => handleSubmitCertificateNameChange(certificate)}
                            >
                              <Icon name="send" />
                              Kirim Pengajuan Buat Ulang
                            </button>
                          </div>
                        )}

                        {isSelected && !request && certificate.nameChangeUsed && (
                          <div className="certificate-locked-note">
                            <Icon name="lock" />
                            <span>Kesempatan ubah nama sertifikat sudah digunakan.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
            {!courses.length && (
              <article className="empty-state">
                <Icon name="certificate" />
                <h3>Sertifikat belum tersedia</h3>
                <p>Sertifikat akan muncul setelah member menyelesaikan kelas aktif.</p>
              </article>
            )}
          </div>
        </section>
      )}

      {activeMenu === 'support' && (
        <section className="panel support-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Bantuan mentor</p>
              <h2>Tiket bantuan</h2>
            </div>
          </div>
          <div className="ticket-form">
            <label>
              Subjek
              <input
                type="text"
                value={supportSubject}
                onChange={(event) => setSupportSubject(event.target.value)}
                placeholder="Contoh: Tugas materi 2 belum terbuka"
              />
            </label>
            <label>
              Detail kendala
              <textarea
                value={supportDraft}
                onChange={(event) => setSupportDraft(event.target.value)}
                placeholder="Tulis kendala belajar Anda dengan jelas..."
                rows="5"
              ></textarea>
            </label>
            <button className="btn btn-primary" type="button" onClick={handleSendSupport}>
              <Icon name="message" />
              Buat Tiket
            </button>
          </div>
          {supportMessage && <p className="action-feedback">{supportMessage}</p>}
          <div className="support-replies ticket-list">
            <div>
              <p className="eyebrow">Riwayat bantuan</p>
              <h3>Status tiket</h3>
            </div>
            {supportTickets.map((ticket) => (
              <article className="support-reply-card ticket-card" key={ticket.id}>
                <div className="ticket-header">
                  <span>
                    <small>Tiket #{ticket.id.slice(-6).toUpperCase()}</small>
                    <strong>{ticket.subject}</strong>
                  </span>
                  <mark>{ticket.status}</mark>
                </div>
                <div className="ticket-thread">
                  {(ticket.replies ?? []).map((reply) => (
                    <div
                      className={
                        reply.senderRole === 'admin'
                          ? 'ticket-bubble mentor'
                          : 'ticket-bubble member'
                      }
                      key={reply.id}
                    >
                      <small>{reply.senderRole === 'admin' ? 'Admin' : 'Anda'}</small>
                      <p>{reply.message}</p>
                    </div>
                  ))}
                </div>
                {ticket.status === 'Selesai' ? (
                  <small>Tiket sudah selesai.</small>
                ) : (
                  <div className="ticket-inline-reply">
                    <textarea
                      value={supportReplyDrafts[ticket.id] ?? ''}
                      onChange={(event) =>
                        setSupportReplyDrafts((current) => ({
                          ...current,
                          [ticket.id]: event.target.value,
                        }))
                      }
                      placeholder="Balas tiket ini kalau masalah belum selesai..."
                      rows="3"
                    ></textarea>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => handleReplySupport(ticket)}
                    >
                      <Icon name="message" />
                      Balas Tiket
                    </button>
                  </div>
                )}
              </article>
            ))}
            {!supportTickets.length && (
              <article className="empty-state">
                <Icon name="message" />
                <h3>Belum ada pertanyaan</h3>
                <p>Riwayat dan balasan admin akan muncul di sini.</p>
              </article>
            )}
          </div>
        </section>
      )}

      {activeMenu === 'about' && (
        <section className="member-about-page">
          <div className="member-about-frame-wrap">
            <iframe
              title={safeWebsiteSettings.memberAbout.title || 'Tentang member'}
              onLoad={handleMemberAboutFrameLoad}
              srcDoc={buildMemberAboutSrcDoc(
                safeWebsiteSettings.memberAbout.html,
                safeWebsiteSettings.memberAbout.title || 'Tentang',
              )}
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            />
          </div>
        </section>
      )}

      {certificateTestimonialPrompt && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="certificate-testimonial-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="certificate-testimonial-title"
          >
            <button
              className="certificate-testimonial-modal-close"
              type="button"
              aria-label="Tutup pemberitahuan"
              onClick={() => setCertificateTestimonialPrompt(null)}
            >
              <Icon name="x" />
            </button>
            <span className="certificate-testimonial-modal-icon" aria-hidden="true">
              <Icon name="message" />
            </span>
            <div>
              <p className="eyebrow">Testimoni dibutuhkan</p>
              <h2 id="certificate-testimonial-title">Isi testimoni kelas dulu</h2>
              <p>
                Sebelum {certificateTestimonialPrompt.action === 'create' ? 'membuat' : 'mendownload'} sertifikat,
                silakan isi testimoni untuk kelas <strong>{certificateTestimonialPrompt.classTitle}</strong>.
              </p>
            </div>
            <div className="certificate-testimonial-modal-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setCertificateTestimonialPrompt(null)}
              >
                Nanti dulu
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleOpenCertificateTestimonialForm}
              >
                <Icon name="message" />
                Menu Testimoni
              </button>
            </div>
          </section>
        </div>
      )}

      {previewImage && (
        <div className="modal-backdrop" role="presentation">
          <div className="image-preview-modal">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Preview gambar</p>
                <h2>{previewImage.title}</h2>
              </div>
              <button
                type="button"
                aria-label="Tutup preview gambar"
                onClick={() => setPreviewImage(null)}
              >
                <Icon name="x" />
              </button>
            </div>
            <img src={previewImage.image} alt={previewImage.title} />
          </div>
        </div>
      )}
      {activePromptInstruction && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="prompt-instruction-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-instruction-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Petunjuk prompt</p>
                <h2 id="prompt-instruction-title">{activePromptInstruction.title}</h2>
              </div>
              <button
                type="button"
                aria-label="Tutup petunjuk prompt"
                onClick={() => setActivePromptInstruction(null)}
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="prompt-instruction-content">
              <p>{activePromptInstruction.instruction}</p>
            </div>
          </section>
        </div>
      )}
    </DashboardShell>
  )
}

export default MemberPage
