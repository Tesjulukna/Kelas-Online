import { useEffect, useRef, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
import DashboardShell from '../components/DashboardShell'
import Icon from '../components/Icon'
import MetricCard from '../components/MetricCard'
import WebsiteSettingsPanel from '../components/WebsiteSettingsPanel'
import { adminMenuItems } from '../data/platformData'
import {
  buildSignedUploadBody,
  requestStorageUpload,
  uploadStorageFile,
} from '../lib/storageUpload'

function createEmptyMaterial() {
  return {
    id: `material-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: '',
    description: '',
    videoUrl: '',
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
  }
}

const richTextTools = [
  { command: 'bold', icon: 'bold', title: 'Bold' },
  { command: 'italic', icon: 'italic', title: 'Miring' },
  { command: 'insertUnorderedList', icon: 'list', title: 'Bullet list' },
  { command: 'insertOrderedList', icon: 'orderedList', title: 'Numbering' },
  { command: 'justifyLeft', icon: 'alignLeft', title: 'Rata kiri' },
  { command: 'justifyCenter', icon: 'alignCenter', title: 'Rata tengah' },
  { command: 'justifyRight', icon: 'alignRight', title: 'Rata kanan' },
  { command: 'justifyFull', icon: 'alignJustify', title: 'Justify' },
]

const richTextColors = ['#111827', '#2563eb', '#059669', '#dc2626', '#7c3aed']

const classCtaButtonOptions = [
  'Beli Sekarang',
  'Daftar',
  'Gabung Kelas',
  'Ambil Kelas',
  'Mulai Belajar',
]

function RichTextToolIcon({ name }) {
  const paths = {
    bold: (
      <>
        <path d="M8 5h5.2a3 3 0 0 1 0 6H8z" />
        <path d="M8 11h6a3.5 3.5 0 0 1 0 7H8z" />
        <path d="M8 5v13" />
      </>
    ),
    italic: (
      <>
        <path d="M10 5h7" />
        <path d="M7 19h7" />
        <path d="m14 5-4 14" />
      </>
    ),
    list: (
      <>
        <path d="M9 7h11" />
        <path d="M9 12h11" />
        <path d="M9 17h11" />
        <circle cx="4.5" cy="7" r="1" />
        <circle cx="4.5" cy="12" r="1" />
        <circle cx="4.5" cy="17" r="1" />
      </>
    ),
    orderedList: (
      <>
        <path d="M10 7h10" />
        <path d="M10 12h10" />
        <path d="M10 17h10" />
        <path d="M4 6h1v3" />
        <path d="M3.8 14h2.4l-2.4 3h2.4" />
      </>
    ),
    alignLeft: (
      <>
        <path d="M4 6h16" />
        <path d="M4 10h11" />
        <path d="M4 14h16" />
        <path d="M4 18h11" />
      </>
    ),
    alignCenter: (
      <>
        <path d="M4 6h16" />
        <path d="M7 10h10" />
        <path d="M4 14h16" />
        <path d="M7 18h10" />
      </>
    ),
    alignRight: (
      <>
        <path d="M4 6h16" />
        <path d="M9 10h11" />
        <path d="M4 14h16" />
        <path d="M9 18h11" />
      </>
    ),
    alignJustify: (
      <>
        <path d="M4 6h16" />
        <path d="M4 10h16" />
        <path d="M4 14h16" />
        <path d="M4 18h16" />
      </>
    ),
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

const uploadVideoApiPath = '/api/upload-video'
const uploadFileApiPath = '/api/upload-file'
const allowedVideoTypes = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-m4v',
]

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
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'

    return new File([blob], `${baseName}.${extension}`, { type: outputType })
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

async function uploadClassImage(file, sessionToken = '') {
  const compressedFile = await compressImageFile(file)

  const data = await uploadStorageFile({
    endpoint: uploadFileApiPath,
    file: compressedFile,
    type: 'class-image',
    sessionToken,
  })

  return data.url
}

function formatRupiah(value) {
  const number = Math.max(0, Number(String(value ?? '').replace(/[^\d]/g, '')) || 0)

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(number)
}

function formatClassPrice(value) {
  const number = Math.max(0, Number(String(value ?? '').replace(/[^\d]/g, '')) || 0)

  return number > 0 ? formatRupiah(number) : 'Gratis'
}

function parseRupiahValue(value) {
  const text = String(value ?? '').trim().toLowerCase()

  if (!text) {
    return '0'
  }

  const decimalText = text.replace(',', '.')
  const amountMatch = decimalText.match(/\d+(?:\.\d+)?/)

  if (amountMatch && /\b(jt|juta)\b/.test(decimalText)) {
    return String(Math.round(Number(amountMatch[0]) * 1000000))
  }

  if (amountMatch && /\b(rb|ribu)\b/.test(decimalText)) {
    return String(Math.round(Number(amountMatch[0]) * 1000))
  }

  return text.replace(/[^\d]/g, '') || '0'
}

function createEmptyPromptItem() {
  return {
    id: `prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: '',
    image: '',
    instruction: '',
    prompt: '',
  }
}

function createEmptyResourceLink() {
  return {
    id: `resource-link-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: '',
    url: '',
  }
}

function createEmptyClassForm() {
  return {
    id: `admin-class-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: '',
    description: '',
    students: 0,
    displayStudents: '',
    rating: '',
    status: 'Aktif',
    price: '0',
    salePrice: '0',
    purchaseButtonLabel: 'Beli Sekarang',
    registerButtonLabel: 'Beli Sekarang',
    lynkProductKey: '',
    tripayProductKey: '',
    thumbnail: '',
    mentor: '',
    progress: 0,
    next: '',
    liveAt: '',
    lessons: '',
    showOnHomepage: true,
    showOnMember: true,
    highlighted: false,
    materials: [createEmptyMaterial()],
  }
}

function createEmptyMemberForm() {
  return {
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    status: 'Aktif',
    classAccessMode: 'all',
    allowedClassIds: [],
  }
}

function createEmptyDigitalProductForm() {
  return {
    id: '',
    title: '',
    description: '',
    price: '0',
    displaySales: '',
    rating: '',
    status: 'Aktif',
    thumbnail: '',
    addVideo: false,
    videoUrl: '',
    fileUrl: '',
    fileName: '',
    deliveryNote: '',
    platformType: 'upload',
    payWhatYouWant: false,
    salePrice: '0',
    itemQuantityEnabled: false,
    itemQuantity: '0',
    limitQtyPerCheckout: false,
    purchaseButtonLabel: 'Buy Now',
    releaseTimeEnabled: false,
    releaseTime: '',
    whatsappNotification: false,
    customMessageEnabled: false,
    customMessage: '',
    reviews: [],
    addOns: [],
    blockLayout: 'default',
    requireCustomerName: false,
    requireCustomerPhone: false,
    customerQuestions: [],
    lynkProductKey: '',
    tripayProductKey: '',
    showOnHomepage: true,
    showOnMember: true,
    highlighted: false,
  }
}

function createEmptyDigitalProductReview() {
  const now = new Date()

  return {
    id: `review-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: '',
    instagram: '',
    avatar: '',
    rating: 5,
    date: now.toISOString().slice(0, 10),
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    likes: '0',
    message: '',
  }
}

function createEmptyDigitalProductAddOn() {
  return {
    id: `addon-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: '',
    price: '0',
    description: '',
  }
}

function createEmptyDigitalProductQuestion() {
  return {
    id: `question-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label: '',
    required: false,
  }
}

const digitalProductPlatformOptions = [
  { id: 'upload', label: 'Upload' },
  { id: 'dropbox', label: 'Dropbox' },
  { id: 'gdrive', label: 'Gdrive' },
  { id: 'other', label: 'Other' },
]

const digitalProductLayoutOptions = [
  { id: 'default', label: 'Default' },
  { id: 'grid', label: 'Grid' },
  { id: 'large', label: 'Large Image' },
  { id: 'compact', label: 'Compact' },
]

function createEmptySupportForm() {
  return {
    id: '',
    memberName: '',
    subject: '',
    message: '',
    status: 'Menunggu',
    answer: '',
    replyDraft: '',
    replies: [],
  }
}

function isYoutubeUrl(value) {
  if (!value) {
    return true
  }

  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, '')

    return ['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)
  } catch {
    return false
  }
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

function getYoutubeEmbedsFromText(value) {
  const seen = new Set()

  return String(value || '')
    .split(/\s+/)
    .map((chunk) => chunk.trim().replace(/[),.;]+$/, ''))
    .map((chunk) => getYoutubeEmbedUrl(chunk))
    .filter((embedUrl) => {
      if (!embedUrl || seen.has(embedUrl)) {
        return false
      }

      seen.add(embedUrl)
      return true
    })
}

function DescriptionVideoPreview({ value }) {
  const embedUrls = getYoutubeEmbedsFromText(value)

  if (!embedUrls.length) {
    return null
  }

  return (
    <div className="description-video-preview">
      {embedUrls.map((embedUrl) => (
        <iframe
          key={embedUrl}
          src={embedUrl}
          title="Preview video YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ))}
    </div>
  )
}

function cleanEditorUrl(value) {
  try {
    const url = new URL(value)

    if (!['http:', 'https:'].includes(url.protocol)) {
      return ''
    }

    return url.toString().replace(/"/g, '%22')
  } catch {
    return ''
  }
}

function cleanHtmlAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function toCsvValue(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function getTimeValue(value) {
  const time = Date.parse(value || '')

  return Number.isNaN(time) ? 0 : time
}

function formatRelativeActivity(value) {
  const time = getTimeValue(value)

  if (!time) {
    return 'Belum pernah aktif'
  }

  const diff = Math.max(0, Date.now() - time)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) {
    return 'Baru saja'
  }

  if (diff < hour) {
    return `${Math.floor(diff / minute)} menit lalu`
  }

  if (diff < day) {
    return `${Math.floor(diff / hour)} jam lalu`
  }

  return new Date(time).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getMemberAccessibleClasses(member, classes) {
  const activeClasses = classes.filter((course) => course.status === 'Aktif')

  if (Array.isArray(member.allowedClassIds)) {
    return activeClasses.filter((course) => member.allowedClassIds.includes(course.id))
  }

  return activeClasses
}

function getMemberProgressSummary(member, classes, submissions) {
  const accessibleClasses = getMemberAccessibleClasses(member, classes)
  const memberSubmissions = submissions.filter((item) => item.memberId === member.id)

  if (!accessibleClasses.length) {
    return {
      percent: 0,
      title: 'Belum ada akses kelas',
      detail: 'Atur akses kelas dari tombol Edit.',
      tasksLabel: '0 tugas',
      lastActivityAt: '',
    }
  }

  let totalPercent = 0
  let latest = null
  let submittedTaskCount = 0
  let requiredTaskCount = 0

  accessibleClasses.forEach((course) => {
    const materials = course.materials ?? []
    const requiredMaterials = materials.filter((material) => material.requiresTask)
    const requiredCount = requiredMaterials.length
    const courseSubmissions = memberSubmissions.filter(
      (item) => item.classId === course.id,
    )
    const submittedMaterialIds = new Set(
      courseSubmissions.map((item) => item.materialId).filter(Boolean),
    )
    const submittedRequiredIds = new Set(
      requiredMaterials
        .map((material) => material.id)
        .filter((materialId) => submittedMaterialIds.has(materialId)),
    )
    const percent = requiredCount
      ? Math.round((submittedRequiredIds.size / requiredCount) * 100)
      : 0
    let materialIndex = -1
    let materialTitle = ''
    let activityAt = ''

    submittedTaskCount += submittedMaterialIds.size
    requiredTaskCount += requiredCount

    courseSubmissions.forEach((submission) => {
      const submissionIndex = materials.findIndex(
        (material) => material.id === submission.materialId,
      )

      if (submissionIndex >= 0) {
        materialIndex = Math.max(materialIndex, submissionIndex)
      }

      if (getTimeValue(submission.submittedAt) > getTimeValue(activityAt)) {
        activityAt = submission.submittedAt
      }
    })

    if (materialIndex >= 0 && !materialTitle) {
      materialTitle = materials[materialIndex]?.title || `Materi ${materialIndex + 1}`
    }

    totalPercent += Math.min(100, Math.max(0, percent))

    const candidate = {
      classTitle: course.title,
      materialTitle,
      materialIndex,
      materialCount: materials.length,
      lastActivityAt: activityAt,
    }

    if (
      candidate.lastActivityAt &&
      (!latest || getTimeValue(candidate.lastActivityAt) >= getTimeValue(latest.lastActivityAt))
    ) {
      latest = candidate
    }
  })

  const percent = Math.round(totalPercent / Math.max(1, accessibleClasses.length))
  const tasksLabel = requiredTaskCount
    ? `${submittedTaskCount}/${requiredTaskCount} tugas wajib`
    : `${submittedTaskCount} tugas`

  if (!latest) {
    return {
      percent,
      title: 'Belum mulai belajar',
      detail: `${accessibleClasses.length} kelas bisa diakses.`,
      tasksLabel,
      lastActivityAt: '',
    }
  }

  return {
    percent,
    title: latest.classTitle,
    detail:
      latest.materialIndex >= 0
        ? `Materi ${latest.materialIndex + 1}/${Math.max(1, latest.materialCount)}: ${
            latest.materialTitle || 'Belum ada judul'
          }`
        : 'Belum ada materi yang dibuka.',
    tasksLabel,
    lastActivityAt: latest.lastActivityAt,
  }
}

function AdminPage({
  loginName,
  avatar,
  sessionToken = '',
  classes,
  digitalProducts = [],
  digitalProductAccess = [],
  members = [],
  supportTickets = [],
  submissions = [],
  testimonials = [],
  certificates = [],
  certificateNameChangeRequests = [],
  payments = [],
  publicActivities = [],
  websiteSettings,
  onClassesChange,
  onDigitalProductsChange = async () => {},
  onWebsiteSettingsChange = async () => {},
  onSyncTripayPaymentMethods = async () => [],
  onDownloadBackup = async () => {},
  onRestoreBackup = async () => {},
  onCreateMember = async () => {},
  onUpdateMember = async () => {},
  onDeleteMember = async () => {},
  onUpdateSupportTicket = async () => {},
  onDeleteSupportTicket = async () => {},
  onUpdateSubmission = async () => {},
  onUpdateTestimonial = async () => {},
  onDeleteTestimonial = async () => {},
  onReviewCertificateNameChange = async () => {},
  activeMenu,
  onMenuChange,
  isMenuOpen,
  onCloseMenu,
  onNotify = () => {},
}) {
  const [classForm, setClassForm] = useState(() => createEmptyClassForm())
  const [editingClassId, setEditingClassId] = useState(null)
  const [isClassModalOpen, setIsClassModalOpen] = useState(false)
  const [pendingDeleteClass, setPendingDeleteClass] = useState(null)
  const [digitalProductForm, setDigitalProductForm] = useState(() =>
    createEmptyDigitalProductForm(),
  )
  const [editingDigitalProductId, setEditingDigitalProductId] = useState(null)
  const [isDigitalProductBuilderOpen, setIsDigitalProductBuilderOpen] = useState(false)
  const [isDigitalReviewManagerOpen, setIsDigitalReviewManagerOpen] = useState(false)
  const [digitalReviewDraft, setDigitalReviewDraft] = useState(() => createEmptyDigitalProductReview())
  const [memberForm, setMemberForm] = useState(() => createEmptyMemberForm())
  const [editingMemberId, setEditingMemberId] = useState(null)
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false)
  const [pendingDeleteMember, setPendingDeleteMember] = useState(null)
  const [memberPageSize, setMemberPageSize] = useState(10)
  const [memberPage, setMemberPage] = useState(1)
  const [memberSearchTerm, setMemberSearchTerm] = useState('')
  const [memberStatusFilter, setMemberStatusFilter] = useState('all')
  const [memberClassFilter, setMemberClassFilter] = useState('all')
  const [memberActivityFilter, setMemberActivityFilter] = useState('all')
  const [isMemberFilterOpen, setIsMemberFilterOpen] = useState(false)
  const [submissionPageSize, setSubmissionPageSize] = useState(10)
  const [submissionPage, setSubmissionPage] = useState(1)
  const [submissionSearchTerm, setSubmissionSearchTerm] = useState('')
  const [submissionListStatusFilter, setSubmissionListStatusFilter] = useState('all')
  const [submissionListClassFilter, setSubmissionListClassFilter] = useState('all')
  const [isSubmissionFilterOpen, setIsSubmissionFilterOpen] = useState(false)
  const [paymentSearchTerm, setPaymentSearchTerm] = useState('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all')
  const [paymentSourceFilter, setPaymentSourceFilter] = useState('all')
  const [paymentStartDate, setPaymentStartDate] = useState('')
  const [paymentEndDate, setPaymentEndDate] = useState('')
  const [paymentPageSize, setPaymentPageSize] = useState(10)
  const [paymentPage, setPaymentPage] = useState(1)
  const [supportForm, setSupportForm] = useState(() => createEmptySupportForm())
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false)
  const [pendingDeleteSupport, setPendingDeleteSupport] = useState(null)
  const [viewingSubmission, setViewingSubmission] = useState(null)
  const [submissionFeedback, setSubmissionFeedback] = useState('')
  const [submissionRating, setSubmissionRating] = useState(0)
  const [selectedSubmissionMemberId, setSelectedSubmissionMemberId] = useState('')
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState('all')
  const [submissionClassFilter, setSubmissionClassFilter] = useState('all')
  const [actionStatus, setActionStatus] = useState('')
  const [videoUploads, setVideoUploads] = useState({})
  const [activeMaterialEditorId, setActiveMaterialEditorId] = useState(null)
  const [promptEditorState, setPromptEditorState] = useState(null)
  const [draggingMaterialId, setDraggingMaterialId] = useState(null)
  const materialDescriptionRef = useRef(null)
  const materialDescriptionEditorMaterialIdRef = useRef(null)
  const descriptionSelectionRef = useRef(null)
  const digitalDescriptionImageInputRef = useRef(null)
  const lastMaterialDragTargetRef = useRef('')

  const onlineMembers = members.filter((item) => item.isOnline)
  const waitingSupportCount = supportTickets.filter(
    (item) => item.status === 'Menunggu',
  ).length
  const pendingSubmissions = submissions.filter(
    (item) => item.status === 'Menunggu Review',
  ).length
  const pendingTestimonials = testimonials.filter((item) => item.status === 'pending').length
  const approvedTestimonials = testimonials.filter((item) => item.status === 'approved').length
  const pendingCertificateNameRequests = certificateNameChangeRequests.filter(
    (request) => request.status === 'pending',
  )
  const reviewedCertificateNameRequests = certificateNameChangeRequests.filter(
    (request) => request.status !== 'pending',
  )
  const handleReviewCertificateNameChange = async (request, status) => {
    try {
      const data = await onReviewCertificateNameChange({
        id: request.id,
        status,
        adminNote: status === 'approved'
          ? 'Perubahan nama disetujui admin.'
          : 'Perubahan nama ditolak admin.',
      })

      onNotify(data.message || 'Permintaan perubahan nama ditinjau.')
    } catch (error) {
      onNotify(error.message || 'Permintaan perubahan nama belum bisa ditinjau.')
    }
  }
  const handleModerateTestimonial = async (testimonial, status) => {
    try {
      await onUpdateTestimonial({ id: testimonial.id, status })
      onNotify(status === 'approved'
        ? 'Testimoni ditampilkan di homepage.'
        : status === 'hidden'
          ? 'Testimoni disembunyikan dari homepage.'
          : 'Testimoni ditolak.')
    } catch (error) {
      onNotify(error.message || 'Status testimoni belum bisa diubah.')
    }
  }

  const handleToggleTestimonialVisibility = (testimonial) => {
    handleModerateTestimonial(
      testimonial,
      testimonial.status === 'approved' ? 'hidden' : 'approved',
    )
  }

  const handleRemoveTestimonial = async (testimonial) => {
    try {
      await onDeleteTestimonial(testimonial.id)
      onNotify('Testimoni dihapus.')
    } catch (error) {
      onNotify(error.message || 'Testimoni belum bisa dihapus.')
    }
  }
  const paymentSearchQuery = paymentSearchTerm.trim().toLowerCase()
  const paidPaymentStatuses = ['paid', 'processed', 'success', 'settlement']
  const pendingPaymentStatuses = ['pending', 'unpaid', 'waiting', 'callback']
  const failedPaymentStatuses = ['failed', 'expired', 'cancelled', 'canceled']
  const isPaidPayment = (payment) =>
    paidPaymentStatuses.includes(String(payment.status).toLowerCase()) || payment.accessGranted
  const isPendingPayment = (payment) =>
    pendingPaymentStatuses.includes(String(payment.status).toLowerCase()) && !payment.accessGranted
  const isFailedPayment = (payment) =>
    failedPaymentStatuses.includes(String(payment.status).toLowerCase())
  const getPaymentTime = (payment) => getTimeValue(payment.createdAt || payment.updatedAt)
  const paymentStartTime = paymentStartDate
    ? new Date(`${paymentStartDate}T00:00:00`).getTime()
    : 0
  const paymentEndTime = paymentEndDate
    ? new Date(`${paymentEndDate}T23:59:59`).getTime()
    : 0
  const paymentMatchesDateRange = (payment) => {
    const paymentTime = getPaymentTime(payment)

    if (!paymentTime) {
      return !paymentStartTime && !paymentEndTime
    }

    return (
      (!paymentStartTime || paymentTime >= paymentStartTime) &&
      (!paymentEndTime || paymentTime <= paymentEndTime)
    )
  }
  const reportPayments = payments.filter(paymentMatchesDateRange)
  const paidPayments = reportPayments.filter(isPaidPayment)
  const pendingPayments = reportPayments.filter(isPendingPayment)
  const expiredPayments = reportPayments.filter(
    (payment) => String(payment.status).toLowerCase() === 'expired' || payment.isExpired,
  )
  const totalPaidRevenue = paidPayments.reduce((total, payment) => total + payment.amount, 0)
  const tripayRevenue = paidPayments
    .filter((payment) => payment.source === 'tripay')
    .reduce((total, payment) => total + payment.amount, 0)
  const revenueByDate = paidPayments.reduce((items, payment) => {
    const time = getPaymentTime(payment)

    if (!time) {
      return items
    }

    const dateKey = new Date(time).toISOString().slice(0, 10)
    const current = items.get(dateKey) || { dateKey, total: 0, count: 0 }

    items.set(dateKey, {
      dateKey,
      total: current.total + payment.amount,
      count: current.count + 1,
    })

    return items
  }, new Map())
  const revenueChartItems = [...revenueByDate.values()].sort((first, second) =>
    first.dateKey.localeCompare(second.dateKey),
  )
  const highestRevenueChartValue = Math.max(
    1,
    ...revenueChartItems.map((item) => item.total),
  )
  const paymentSourceOptions = [
    ...new Set(payments.map((payment) => payment.sourceLabel).filter(Boolean)),
  ]
  const paymentStatusOptions = [
    ...new Set(payments.map((payment) => payment.status).filter(Boolean)),
  ]
  const filteredPayments = payments.filter((payment) => {
    const searchMatches =
      !paymentSearchQuery ||
      [
        payment.buyerName,
        payment.buyerEmail,
        payment.classTitle,
        payment.orderCode,
        payment.reference,
        payment.merchantRef,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(paymentSearchQuery))
    const statusMatches =
      paymentStatusFilter === 'all' || payment.status === paymentStatusFilter
    const sourceMatches =
      paymentSourceFilter === 'all' || payment.sourceLabel === paymentSourceFilter
    const dateMatches = paymentMatchesDateRange(payment)

    return searchMatches && statusMatches && sourceMatches && dateMatches
  })
  const paymentPageCount = Math.max(1, Math.ceil(filteredPayments.length / paymentPageSize))
  const safePaymentPage = Math.min(paymentPage, paymentPageCount)
  const paymentPageStart = filteredPayments.length ? (safePaymentPage - 1) * paymentPageSize : 0
  const paymentPageEnd = Math.min(filteredPayments.length, paymentPageStart + paymentPageSize)
  const visiblePayments = filteredPayments.slice(paymentPageStart, paymentPageEnd)
  const paymentPageNumbers = Array.from({ length: paymentPageCount }, (_, index) => index + 1).filter(
    (pageNumber) =>
      pageNumber === 1 ||
      pageNumber === paymentPageCount ||
      Math.abs(pageNumber - safePaymentPage) <= 2,
  )
  const memberSearchQuery = memberSearchTerm.trim().toLowerCase()
  const memberStatusOptions = [
    ...new Set(members.map((member) => member.status).filter(Boolean)),
  ]
  const memberClassOptions = classes.filter((course) => course.status === 'Aktif')
  const filteredMembers = members.filter((member) => {
    const searchMatches =
      !memberSearchQuery ||
      [member.name, member.email, member.phone, member.username]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(memberSearchQuery))
    const statusMatches =
      memberStatusFilter === 'all' || member.status === memberStatusFilter
    const activityMatches =
      memberActivityFilter === 'all' ||
      (memberActivityFilter === 'online' && member.isOnline) ||
      (memberActivityFilter === 'offline' && !member.isOnline)
    const accessibleClasses = getMemberAccessibleClasses(member, classes)
    const classMatches =
      memberClassFilter === 'all' ||
      (memberClassFilter === 'all-access' && !Array.isArray(member.allowedClassIds)) ||
      (memberClassFilter === 'no-access' && !accessibleClasses.length) ||
      accessibleClasses.some((course) => course.id === memberClassFilter)

    return searchMatches && statusMatches && activityMatches && classMatches
  })
  const hasMemberFilter =
    Boolean(memberSearchQuery) ||
    memberStatusFilter !== 'all' ||
    memberClassFilter !== 'all' ||
    memberActivityFilter !== 'all'
  const memberPageCount = Math.max(1, Math.ceil(filteredMembers.length / memberPageSize))
  const safeMemberPage = Math.min(memberPage, memberPageCount)
  const memberPageStart = filteredMembers.length ? (safeMemberPage - 1) * memberPageSize : 0
  const memberPageEnd = Math.min(filteredMembers.length, memberPageStart + memberPageSize)
  const visibleMembers = filteredMembers.slice(memberPageStart, memberPageEnd)
  const memberPageNumbers = Array.from({ length: memberPageCount }, (_, index) => index + 1).filter(
    (pageNumber) =>
      pageNumber === 1 ||
      pageNumber === memberPageCount ||
      Math.abs(pageNumber - safeMemberPage) <= 2,
  )
  const activeMaterialEditor = classForm.materials.find(
    (material) => material.id === activeMaterialEditorId,
  )
  const activeMaterialEditorIndex = classForm.materials.findIndex(
    (material) => material.id === activeMaterialEditorId,
  )
  const submissionMembers = members
    .map((member) => {
      const memberSubmissions = submissions.filter(
        (submission) => submission.memberId === member.id,
      )
      const latestSubmission = memberSubmissions
        .slice()
        .sort((first, second) => getTimeValue(second.submittedAt) - getTimeValue(first.submittedAt))[0]
      const submissionStatuses = [
        ...new Set(memberSubmissions.map((submission) => submission.status).filter(Boolean)),
      ]
      const submissionClassIds = [
        ...new Set(memberSubmissions.map((submission) => submission.classId).filter(Boolean)),
      ]

      return {
        ...member,
        submissionCount: memberSubmissions.length,
        pendingSubmissionCount: memberSubmissions.filter(
          (submission) => submission.status === 'Menunggu Review',
        ).length,
        submissionStatuses,
        submissionClassIds,
        latestSubmissionAt: latestSubmission?.submittedAt || '',
      }
    })
    .filter((member) => member.submissionCount > 0)
    .sort((first, second) => getTimeValue(second.latestSubmissionAt) - getTimeValue(first.latestSubmissionAt))
  const submissionClassOptions = [
    ...new Map(
      submissions.map((submission) => [
        submission.classId,
        submission.classTitle || 'Kelas',
      ]),
    ).entries(),
  ].filter(([classId]) => classId)
  const normalizedSubmissionSearch = submissionSearchTerm.trim().toLowerCase()
  const filteredSubmissionMembers = submissionMembers.filter((member) => {
    const searchMatches =
      !normalizedSubmissionSearch ||
      [member.name, member.email, member.username]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedSubmissionSearch))
    const statusMatches =
      submissionListStatusFilter === 'all' ||
      member.submissionStatuses.includes(submissionListStatusFilter)
    const classMatches =
      submissionListClassFilter === 'all' ||
      member.submissionClassIds.includes(submissionListClassFilter)

    return searchMatches && statusMatches && classMatches
  })
  const hasSubmissionListFilter =
    normalizedSubmissionSearch ||
    submissionListStatusFilter !== 'all' ||
    submissionListClassFilter !== 'all'
  const submissionPageCount = Math.max(
    1,
    Math.ceil(filteredSubmissionMembers.length / submissionPageSize),
  )
  const safeSubmissionPage = Math.min(submissionPage, submissionPageCount)
  const submissionPageStart = filteredSubmissionMembers.length
    ? (safeSubmissionPage - 1) * submissionPageSize
    : 0
  const submissionPageEnd = Math.min(
    filteredSubmissionMembers.length,
    submissionPageStart + submissionPageSize,
  )
  const visibleSubmissionMembers = filteredSubmissionMembers.slice(
    submissionPageStart,
    submissionPageEnd,
  )
  const submissionPageNumbers = Array.from(
    { length: submissionPageCount },
    (_, index) => index + 1,
  ).filter(
    (pageNumber) =>
      pageNumber === 1 ||
      pageNumber === submissionPageCount ||
      Math.abs(pageNumber - safeSubmissionPage) <= 2,
  )
  const selectedSubmissionMember = selectedSubmissionMemberId
    ? submissionMembers.find((member) => member.id === selectedSubmissionMemberId) || null
    : null
  const selectedMemberSubmissions = selectedSubmissionMember
    ? submissions.filter((submission) => submission.memberId === selectedSubmissionMember.id)
    : []
  const visibleMemberSubmissions = selectedMemberSubmissions.filter((submission) => {
    const statusMatches =
      submissionStatusFilter === 'all' ||
      submission.status === submissionStatusFilter
    const classMatches =
      submissionClassFilter === 'all' ||
      submission.classId === submissionClassFilter

    return statusMatches && classMatches
  })
  const selectedMemberClassOptions = [
    ...new Map(
      selectedMemberSubmissions.map((submission) => [
        submission.classId,
        submission.classTitle || 'Kelas',
      ]),
    ).entries(),
  ].filter(([classId]) => classId)
  const submissionStatusOptions = [
    { id: 'all', label: 'Semua' },
    { id: 'Menunggu Review', label: 'Menunggu' },
    { id: 'Direview', label: 'Direview' },
    { id: 'Disetujui', label: 'Disetujui' },
    { id: 'Perlu Revisi', label: 'Revisi' },
  ]

  useEffect(() => {
    const editor = materialDescriptionRef.current

    if (!editor || !activeMaterialEditor) {
      materialDescriptionEditorMaterialIdRef.current = null
      descriptionSelectionRef.current = null
      return
    }

    const materialChanged =
      materialDescriptionEditorMaterialIdRef.current !== activeMaterialEditor.id
    const isEditing = document.activeElement === editor
    const nextDescription = activeMaterialEditor.description || ''

    if ((materialChanged || !isEditing) && editor.innerHTML !== nextDescription) {
      editor.innerHTML = nextDescription
    }

    if (materialChanged) {
      materialDescriptionEditorMaterialIdRef.current = activeMaterialEditor.id
      descriptionSelectionRef.current = null
    }
  }, [activeMaterialEditor])

  const resetClassForm = () => {
    setClassForm(createEmptyClassForm())
    setEditingClassId(null)
    setActiveMaterialEditorId(null)
    setPromptEditorState(null)
    setDraggingMaterialId(null)
    lastMaterialDragTargetRef.current = ''
  }

  const resetDigitalProductForm = () => {
    setDigitalProductForm(createEmptyDigitalProductForm())
    setEditingDigitalProductId(null)
    setIsDigitalReviewManagerOpen(false)
    setDigitalReviewDraft(createEmptyDigitalProductReview())
  }

  const handleDigitalProductFormChange = (event) => {
    const { name, type, checked, value } = event.target
    const nextValue = type === 'checkbox' ? checked : value

    setDigitalProductForm((current) => ({
      ...current,
      [name]: ['price', 'salePrice', 'itemQuantity'].includes(name)
        ? parseRupiahValue(nextValue)
        : nextValue,
    }))
  }

  const insertClassDescriptionHtml = (html) => {
    const textarea = document.querySelector('[data-class-description-editor="true"]')
    const description = classForm.description || ''
    const start = textarea?.selectionStart ?? description.length
    const end = textarea?.selectionEnd ?? description.length
    const nextDescription = `${description.slice(0, start)}${html}${description.slice(end)}`

    setClassForm((current) => ({ ...current, description: nextDescription }))
    window.setTimeout(() => {
      textarea?.focus()
      textarea?.setSelectionRange(start + html.length, start + html.length)
    }, 0)
  }

  const applyClassDescriptionTool = (tool) => {
    const textarea = document.querySelector('[data-class-description-editor="true"]')
    const description = classForm.description || ''
    const start = textarea?.selectionStart ?? description.length
    const end = textarea?.selectionEnd ?? description.length
    const selected = description.slice(start, end)
    const content = selected || 'Teks'
    const wrappers = {
      bold: [`<strong>`, `</strong>`],
      underline: [`<u>`, `</u>`],
      heading: [`<h3>`, `</h3>`],
      'align-left': [`<p style="text-align:left">`, `</p>`],
      'align-center': [`<p style="text-align:center">`, `</p>`],
      'align-justify': [`<p style="text-align:justify">`, `</p>`],
      list: [`<ul><li>`, `</li></ul>`],
      link: [`<a href="https://">`, `</a>`],
    }
    const [prefix, suffix] = wrappers[tool] || ['', '']

    if (tool === 'youtube') {
      const url = window.prompt('Masukkan link YouTube atau Shorts')
      const embedUrl = getYoutubeEmbedUrl(url)

      if (!embedUrl) {
        onNotify('Link video harus dari YouTube, YouTube Shorts, atau youtu.be.')
        return
      }

      insertClassDescriptionHtml(`\n${url.trim()}\n`)
      return
    }

    insertClassDescriptionHtml(`${prefix}${content}${suffix}`)
  }

  const insertDigitalDescriptionHtml = (html) => {
    const textarea = document.querySelector('[data-digital-description-editor="true"]')
    const description = digitalProductForm.description || ''
    const start = textarea?.selectionStart ?? description.length
    const end = textarea?.selectionEnd ?? description.length
    const nextDescription = `${description.slice(0, start)}${html}${description.slice(end)}`

    setDigitalProductForm((current) => ({ ...current, description: nextDescription }))
    window.setTimeout(() => {
      textarea?.focus()
      const nextCursor = start + html.length
      textarea?.setSelectionRange(nextCursor, nextCursor)
    }, 0)
  }

  const applyDigitalDescriptionTool = (tool) => {
    const textarea = document.querySelector('[data-digital-description-editor="true"]')
    const description = digitalProductForm.description || ''
    const start = textarea?.selectionStart ?? description.length
    const end = textarea?.selectionEnd ?? description.length
    const selected = description.slice(start, end)
    const fallback = selected || 'Tulis teks di sini'
    let replacement = fallback

    if (tool === 'bold') replacement = `<strong>${fallback}</strong>`
    if (tool === 'underline') replacement = `<u>${fallback}</u>`
    if (tool === 'heading') replacement = `<h3>${fallback}</h3>`
    if (tool === 'align-left') replacement = `<div style="text-align: left">${fallback}</div>`
    if (tool === 'align-center') replacement = `<div style="text-align: center">${fallback}</div>`
    if (tool === 'align-justify') replacement = `<div style="text-align: justify">${fallback}</div>`
    if (tool === 'list') {
      const rows = fallback
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => `<li>${item}</li>`)
        .join('')
      replacement = `<ul>${rows || '<li>Item</li>'}</ul>`
    }
    if (tool === 'link') {
      const url = window.prompt('Masukkan link')
      if (!url) return
      const safeUrl = cleanEditorUrl(url)
      if (!safeUrl) {
        onNotify('Link harus diawali http:// atau https://.')
        return
      }
      replacement = `<a href="${safeUrl}" target="_blank" rel="noreferrer">${fallback}</a>`
    }
    if (tool === 'youtube') {
      const url = window.prompt('Masukkan link YouTube atau Shorts')
      const embedUrl = getYoutubeEmbedUrl(url)

      if (!embedUrl) {
        onNotify('Link video harus dari YouTube, YouTube Shorts, atau youtu.be.')
        return
      }

      replacement = `\n${url.trim()}\n`
    }

    insertDigitalDescriptionHtml(replacement)
  }

  const handleDigitalDescriptionImageChange = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      onNotify('Gambar deskripsi harus berupa file gambar.')
      event.target.value = ''
      return
    }

    try {
      onNotify('Mengupload gambar deskripsi...')
      const imageUrl = await uploadClassImage(file, sessionToken)
      const altText = cleanHtmlAttribute(file.name.replace(/\.[^.]+$/, '') || 'Gambar produk')
      insertDigitalDescriptionHtml(`<p><img src="${imageUrl}" alt="${altText}" loading="lazy"></p>`)
      onNotify('Gambar berhasil ditambahkan ke deskripsi.')
    } catch (error) {
      onNotify(error.message || 'Gambar deskripsi tidak bisa diupload.')
    } finally {
      event.target.value = ''
    }
  }

  const updateDigitalProductReview = (reviewId, field, value) => {
    setDigitalProductForm((current) => ({
      ...current,
      reviews: (current.reviews || []).map((review) =>
        review.id === reviewId ? { ...review, [field]: value } : review,
      ),
    }))
  }

  const updateDigitalReviewDraft = (field, value) => {
    setDigitalReviewDraft((current) => ({
      ...current,
      [field]: field === 'likes' ? parseRupiahValue(value) : value,
    }))
  }

  const openDigitalReviewManager = () => {
    setDigitalReviewDraft(createEmptyDigitalProductReview())
    setIsDigitalReviewManagerOpen(true)
  }

  const addDigitalProductReview = () => {
    const name = digitalReviewDraft.name.trim()
    const message = digitalReviewDraft.message.trim()

    if (!name || !message) {
      onNotify('Nama reviewer dan isi ulasan wajib diisi.')
      return
    }

    setDigitalProductForm((current) => ({
      ...current,
      reviews: [
        {
          ...digitalReviewDraft,
          id: digitalReviewDraft.id || `review-${Date.now()}`,
          name,
          instagram: digitalReviewDraft.instagram.trim().replace(/^@/, ''),
          avatar: digitalReviewDraft.avatar.trim(),
          rating: Math.min(5, Math.max(1, Math.round(Number(digitalReviewDraft.rating) || 5))),
          date: digitalReviewDraft.date || new Date().toISOString().slice(0, 10),
          time: digitalReviewDraft.time || '10:00',
          likes: Math.max(0, Math.round(Number(digitalReviewDraft.likes) || 0)),
          message,
        },
        ...(current.reviews || []),
      ].slice(0, 10),
    }))
    setDigitalReviewDraft(createEmptyDigitalProductReview())
  }

  const removeDigitalProductReview = (reviewId) => {
    setDigitalProductForm((current) => ({
      ...current,
      reviews: (current.reviews || []).filter((item) => item.id !== reviewId),
    }))
  }

  const updateDigitalProductAddOn = (addOnId, field, value) => {
    setDigitalProductForm((current) => ({
      ...current,
      addOns: (current.addOns || []).map((addOn) =>
        addOn.id === addOnId
          ? {
              ...addOn,
              [field]: field === 'price' ? parseRupiahValue(value) : value,
            }
          : addOn,
      ),
    }))
  }

  const updateDigitalProductQuestion = (questionId, field, value) => {
    setDigitalProductForm((current) => ({
      ...current,
      customerQuestions: (current.customerQuestions || []).map((question) =>
        question.id === questionId ? { ...question, [field]: value } : question,
      ),
    }))
  }

  const handleDigitalProductThumbnailChange = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      onNotify('Thumbnail produk harus berupa gambar.')
      event.target.value = ''
      return
    }

    try {
      onNotify('Mengupload thumbnail produk...')
      const imageUrl = await uploadClassImage(file, sessionToken)
      setDigitalProductForm((current) => ({ ...current, thumbnail: imageUrl }))
      onNotify('Thumbnail produk berhasil diupload.')
    } catch (error) {
      onNotify(error.message || 'Thumbnail produk tidak bisa diupload.')
    } finally {
      event.target.value = ''
    }
  }

  const handleSubmitDigitalProduct = async (event) => {
    event.preventDefault()

    const payload = {
      ...digitalProductForm,
      id:
        editingDigitalProductId ||
        digitalProductForm.id ||
        `digital-product-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: digitalProductForm.title.trim(),
      price: Math.max(0, Math.round(Number(digitalProductForm.price) || 0)),
      displaySales:
        digitalProductForm.displaySales === ''
          ? ''
          : Math.max(0, Math.round(Number(digitalProductForm.displaySales) || 0)),
      rating:
        digitalProductForm.rating === ''
          ? ''
          : Math.min(5, Math.max(0, Number(digitalProductForm.rating) || 0)),
      salePrice: Math.max(0, Math.round(Number(digitalProductForm.salePrice) || 0)),
      itemQuantity: Math.max(0, Math.round(Number(digitalProductForm.itemQuantity) || 0)),
      reviews: (digitalProductForm.reviews || [])
        .map((review) => ({
          ...review,
          name: String(review.name || '').trim(),
          instagram: String(review.instagram || '').trim().replace(/^@/, ''),
          avatar: String(review.avatar || '').trim(),
          rating: Math.min(5, Math.max(1, Math.round(Number(review.rating) || 5))),
          date: String(review.date || '').trim(),
          time: String(review.time || '').trim(),
          likes: Math.max(0, Math.round(Number(review.likes) || 0)),
          message: String(review.message || '').trim(),
        }))
        .filter((review) => review.name || review.message),
      addOns: (digitalProductForm.addOns || [])
        .map((addOn) => ({
          ...addOn,
          price: Math.max(0, Math.round(Number(addOn.price) || 0)),
        }))
        .filter((addOn) => addOn.title),
      customerQuestions: (digitalProductForm.customerQuestions || [])
        .map((question) => ({
          ...question,
          label: String(question.label || '').trim(),
          required: question.required === true,
        }))
        .filter((question) => question.label),
    }

    if (!payload.title) {
      onNotify('Nama produk digital wajib diisi.')
      return
    }

    if (payload.addVideo && payload.videoUrl && !isYoutubeUrl(payload.videoUrl)) {
      onNotify('Link video produk harus dari YouTube, YouTube Shorts, atau youtu.be.')
      return
    }

    try {
      await onDigitalProductsChange((current) => {
        const existing = current.some((item) => item.id === payload.id)

        return existing
          ? current.map((item) => (item.id === payload.id ? payload : item))
          : [payload, ...current]
      })
      resetDigitalProductForm()
      setIsDigitalProductBuilderOpen(false)
      onNotify(editingDigitalProductId ? 'Produk digital diperbarui.' : 'Produk digital ditambahkan.')
    } catch (error) {
      onNotify(error.message || 'Produk digital tidak bisa disimpan.')
    }
  }

  const handleEditDigitalProduct = (product) => {
    setDigitalProductForm({
      id: product.id,
      title: product.title,
      description: product.description || '',
      price: product.price || '0',
      displaySales: product.displaySales ?? '',
      rating: product.rating ?? '',
      status: product.status || 'Aktif',
      thumbnail: product.thumbnail || '',
      addVideo: product.addVideo === true,
      videoUrl: product.videoUrl || '',
      fileUrl: product.fileUrl || '',
      fileName: product.fileName || '',
      deliveryNote: product.deliveryNote || '',
      platformType: product.platformType || 'upload',
      payWhatYouWant: product.payWhatYouWant === true,
      salePrice: product.salePrice || '0',
      itemQuantityEnabled: product.itemQuantityEnabled === true,
      itemQuantity: product.itemQuantity || '0',
      limitQtyPerCheckout: product.limitQtyPerCheckout === true,
      purchaseButtonLabel: product.purchaseButtonLabel || 'Buy Now',
      releaseTimeEnabled: product.releaseTimeEnabled === true,
      releaseTime: product.releaseTime || '',
      whatsappNotification: product.whatsappNotification === true,
      customMessageEnabled: product.customMessageEnabled === true,
      customMessage: product.customMessage || '',
      reviews: Array.isArray(product.reviews) ? product.reviews : [],
      addOns: Array.isArray(product.addOns) ? product.addOns : [],
      blockLayout: product.blockLayout || 'default',
      requireCustomerName: product.requireCustomerName === true,
      requireCustomerPhone: product.requireCustomerPhone === true,
      customerQuestions: Array.isArray(product.customerQuestions) ? product.customerQuestions : [],
      lynkProductKey: product.lynkProductKey || '',
      tripayProductKey: product.tripayProductKey || '',
      showOnHomepage: product.showOnHomepage !== false,
      showOnMember: product.showOnMember !== false,
      highlighted: product.highlighted === true,
    })
    setEditingDigitalProductId(product.id)
    setIsDigitalProductBuilderOpen(true)
    onMenuChange('digital-products')
  }

  const openCreateDigitalProduct = () => {
    resetDigitalProductForm()
    setIsDigitalProductBuilderOpen(true)
    onMenuChange('digital-products')
  }

  const closeDigitalProductBuilder = () => {
    resetDigitalProductForm()
    setIsDigitalProductBuilderOpen(false)
  }

  const handleDeleteDigitalProduct = async (productId) => {
    try {
      await onDigitalProductsChange((current) => current.filter((item) => item.id !== productId))
      if (editingDigitalProductId === productId) {
        resetDigitalProductForm()
      }
      onNotify('Produk digital dihapus.')
    } catch (error) {
      onNotify(error.message || 'Produk digital tidak bisa dihapus.')
    }
  }

  const updateDigitalProductQuickAction = async (productId, changes, message) => {
    try {
      await onDigitalProductsChange((current) =>
        current.map((item) => (item.id === productId ? { ...item, ...changes } : item)),
      )
      onNotify(message)
    } catch (error) {
      onNotify(error.message || 'Produk digital tidak bisa diperbarui.')
    }
  }

  const duplicateDigitalProduct = async (product) => {
    try {
      const copy = {
        ...product,
        id: `digital-product-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: `${product.title} Copy`,
        status: 'Draft',
        showOnHomepage: false,
        showOnMember: false,
        highlighted: false,
      }

      await onDigitalProductsChange((current) => [copy, ...current])
      onNotify('Produk digital berhasil diduplikat sebagai draft.')
    } catch (error) {
      onNotify(error.message || 'Produk digital tidak bisa diduplikat.')
    }
  }

  const showDigitalProductAnalysis = (product, accessCount) => {
    const homepageLabel = product.showOnHomepage !== false ? 'tampil di homepage' : 'disembunyikan dari homepage'
    const memberLabel = product.showOnMember !== false ? 'tampil di member' : 'disembunyikan dari member'
    const statusLabel = product.status || 'Draft'

    onNotify(`${product.title}: ${accessCount} pembeli, status ${statusLabel}, ${homepageLabel}, ${memberLabel}.`)
  }

  const openCreateClass = () => {
    resetClassForm()
    onMenuChange('manage-classes')
    setIsClassModalOpen(true)
  }

  const handleClassFormChange = (event) => {
    const { name, type, checked, value } = event.target
    setClassForm((current) => ({
      ...current,
      [name]:
        type === 'checkbox'
          ? checked
          : ['displayStudents', 'rating'].includes(name)
            ? value
          : name === 'students' || name === 'progress'
          ? Number(value)
          : name === 'price'
            ? parseRupiahValue(value)
            : value,
    }))
  }

  const handleThumbnailChange = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      onNotify('Thumbnail harus berupa gambar.')
      event.target.value = ''
      return
    }

    try {
      onNotify('Mengupload dan mengompres thumbnail...')
      const imageUrl = await uploadClassImage(file, sessionToken)
      setClassForm((current) => ({
        ...current,
        thumbnail: imageUrl,
      }))
      onNotify('Thumbnail berhasil diupload.')
    } catch (error) {
      onNotify(error.message || 'Thumbnail tidak bisa diupload.')
    } finally {
      event.target.value = ''
    }
  }

  const handleMaterialChange = (materialId, field, value) => {
    setClassForm((current) => ({
      ...current,
      materials: current.materials.map((material) =>
        material.id === materialId
          ? {
              ...material,
              [field]: ['requiresTask', 'allowTaskImage', 'requireTaskImage'].includes(field)
                ? Boolean(value)
                : value,
            }
          : material,
      ),
    }))
  }

  const handleMaterialDescriptionInput = (materialId) => {
    rememberMaterialDescriptionSelection()
    handleMaterialChange(materialId, 'description', normalizeMaterialDescriptionEditor())
  }

  const rememberMaterialDescriptionSelection = () => {
    const editor = materialDescriptionRef.current
    const selection = window.getSelection()

    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) {
      return
    }

    descriptionSelectionRef.current = selection.getRangeAt(0).cloneRange()
  }

  const restoreMaterialDescriptionSelection = () => {
    const selection = window.getSelection()
    const range = descriptionSelectionRef.current

    if (!selection || !range) {
      materialDescriptionRef.current?.focus()
      return
    }

    selection.removeAllRanges()
    selection.addRange(range)
  }

  const normalizeMaterialDescriptionEditor = () => {
    const editor = materialDescriptionRef.current

    if (!editor) {
      return ''
    }

    editor.querySelectorAll('font[color]').forEach((fontNode) => {
      const span = document.createElement('span')
      span.style.color = fontNode.getAttribute('color') || ''
      span.innerHTML = fontNode.innerHTML
      fontNode.replaceWith(span)
    })

    return editor.innerHTML
  }

  const syncActiveMaterialDescription = () => {
    if (!activeMaterialEditorId || !materialDescriptionRef.current) {
      return
    }

    handleMaterialChange(
      activeMaterialEditorId,
      'description',
      normalizeMaterialDescriptionEditor(),
    )
  }

  const applyMaterialRichCommand = (materialId, command, value = null) => {
    restoreMaterialDescriptionSelection()
    document.execCommand(command, false, value)
    const editor = materialDescriptionRef.current

    if (editor) {
      handleMaterialChange(materialId, 'description', normalizeMaterialDescriptionEditor())
      rememberMaterialDescriptionSelection()
      editor.focus()
    }
  }

  const openPromptEditor = (materialId, promptItem = null) => {
    setPromptEditorState({
      materialId,
      promptId: promptItem?.id || null,
      draft: promptItem ? { ...createEmptyPromptItem(), ...promptItem } : createEmptyPromptItem(),
    })
  }

  const closePromptEditor = () => {
    setPromptEditorState(null)
  }

  const handlePromptDraftChange = (field, value) => {
    setPromptEditorState((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              [field]: value,
            },
          }
        : current,
    )
  }

  const savePromptEditor = () => {
    if (!promptEditorState) {
      return
    }

    const draft = {
      ...promptEditorState.draft,
      title: promptEditorState.draft.title.trim(),
      instruction: promptEditorState.draft.instruction?.trim() || '',
      prompt: promptEditorState.draft.prompt?.trim() || '',
    }

    if (!draft.image && !draft.prompt && !draft.instruction) {
      onNotify('Isi prompt, gambar, atau petunjuk dulu sebelum menyimpan.')
      return
    }

    setClassForm((current) => ({
      ...current,
      materials: current.materials.map((material) => {
        if (material.id !== promptEditorState.materialId) {
          return material
        }

        const promptItems = material.promptItems ?? []
        const promptIndex = promptItems.findIndex(
          (item) => item.id === promptEditorState.promptId,
        )
        const nextPrompt = {
          ...draft,
          title:
            draft.title ||
            `Prompt ${
              promptIndex >= 0 ? promptIndex + 1 : promptItems.length + 1
            }`,
        }

        return {
          ...material,
          promptItems:
            promptIndex >= 0
              ? promptItems.map((item) =>
                  item.id === promptEditorState.promptId ? nextPrompt : item,
                )
              : [...promptItems, nextPrompt],
        }
      }),
    }))
    setPromptEditorState(null)
    onNotify(promptEditorState.promptId ? 'Prompt diperbarui.' : 'Prompt ditambahkan.')
  }

  const removePromptItem = (materialId, promptId) => {
    setClassForm((current) => ({
      ...current,
      materials: current.materials.map((material) =>
        material.id === materialId
          ? {
              ...material,
              promptItems: (material.promptItems ?? []).filter(
                (item) => item.id !== promptId,
              ),
            }
          : material,
      ),
    }))
    if (promptEditorState?.promptId === promptId) {
      setPromptEditorState(null)
    }
  }

  const handleResourceLinkChange = (materialId, linkId, field, value) => {
    setClassForm((current) => ({
      ...current,
      materials: current.materials.map((material) =>
        material.id === materialId
          ? {
              ...material,
              resourceLinks: (material.resourceLinks ?? []).map((link) =>
                link.id === linkId ? { ...link, [field]: value } : link,
              ),
            }
          : material,
      ),
    }))
  }

  const addResourceLink = (materialId) => {
    setClassForm((current) => ({
      ...current,
      materials: current.materials.map((material) =>
        material.id === materialId
          ? {
              ...material,
              resourceLinks: [
                ...(material.resourceLinks ?? []),
                createEmptyResourceLink(),
              ],
            }
          : material,
      ),
    }))
  }

  const removeResourceLink = (materialId, linkId) => {
    setClassForm((current) => ({
      ...current,
      materials: current.materials.map((material) =>
        material.id === materialId
          ? {
              ...material,
              resourceLinks: (material.resourceLinks ?? []).filter(
                (link) => link.id !== linkId,
              ),
            }
          : material,
      ),
    }))
  }

  const handlePromptDraftImageChange = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      onNotify('Gambar prompt harus berupa file gambar.')
      event.target.value = ''
      return
    }

    try {
      onNotify('Mengupload dan mengompres gambar prompt...')
      const imageUrl = await uploadClassImage(file, sessionToken)
      handlePromptDraftChange('image', imageUrl)
      onNotify('Gambar prompt berhasil diupload.')
    } catch (error) {
      onNotify(error.message || 'Gambar prompt tidak bisa diupload.')
    } finally {
      event.target.value = ''
    }
  }

  const handleMaterialImageChange = async (materialId, event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      onNotify('Foto materi harus berupa file gambar.')
      event.target.value = ''
      return
    }

    try {
      onNotify('Mengupload dan mengompres foto materi...')
      const imageUrl = await uploadClassImage(file, sessionToken)
      setClassForm((current) => ({
        ...current,
        materials: current.materials.map((material) =>
          material.id === materialId
            ? {
                ...material,
                imageFile: imageUrl,
                imageName: file.name,
              }
            : material,
        ),
      }))
      onNotify('Foto materi berhasil diupload. Klik Simpan Kelas agar muncul di materi.')
    } catch (error) {
      onNotify(error.message || 'Foto materi tidak bisa diupload.')
    } finally {
      event.target.value = ''
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

  const handleMaterialPdfChange = async (materialId, event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (file.type !== 'application/pdf') {
      onNotify('File materi pendukung harus berformat PDF.')
      event.target.value = ''
      return
    }

    if (file.size > 12 * 1024 * 1024) {
      onNotify('Ukuran PDF maksimal 12 MB.')
      event.target.value = ''
      return
    }

    try {
      onNotify('Mengupload PDF materi...')
      const data = await uploadStorageFile({
        endpoint: uploadFileApiPath,
        file,
        type: 'document',
        sessionToken,
      })

      setClassForm((current) => ({
        ...current,
        materials: current.materials.map((material) =>
          material.id === materialId
            ? {
                ...material,
                pdfFile: data.url,
                pdfName: data.name || file.name,
              }
            : material,
        ),
      }))
      onNotify('PDF berhasil diupload. Klik Simpan Kelas agar muncul di materi.')
    } catch (error) {
      onNotify(error.message || 'PDF tidak bisa diupload.')
    } finally {
      event.target.value = ''
    }
  }

  const handleMaterialVideoUpload = (materialId, event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!allowedVideoTypes.includes(file.type)) {
      onNotify('Format video harus MP4, WebM, OGG, MOV, atau M4V.')
      event.target.value = ''
      return
    }

    if (file.size > 80 * 1024 * 1024) {
      onNotify('Ukuran video maksimal 80 MB. Jika gagal, kompres ke MP4 H.264.')
      event.target.value = ''
      return
    }

    setVideoUploads((current) => ({
      ...current,
      [materialId]: {
        fileName: file.name,
        percent: 0,
        status: 'uploading',
      },
    }))
    onNotify('Menyiapkan upload video...')

    requestStorageUpload({
      endpoint: uploadVideoApiPath,
      file,
      type: 'video',
      sessionToken,
    })
      .then((upload) => {
        const xhr = new XMLHttpRequest()

        xhr.open('PUT', upload.signedUrl)
        xhr.setRequestHeader('x-upsert', 'false')
        xhr.responseType = 'json'
        xhr.upload.onprogress = (progressEvent) => {
          if (!progressEvent.lengthComputable) {
            return
          }

          setVideoUploads((current) => ({
            ...current,
            [materialId]: {
              ...(current[materialId] ?? {}),
              percent: Math.round((progressEvent.loaded / progressEvent.total) * 100),
              status: 'uploading',
            },
          }))
        }
        xhr.onload = () => {
          let data = typeof xhr.response === 'object' && xhr.response ? xhr.response : {}

          if (!Object.keys(data).length && xhr.responseText) {
            try {
              data = JSON.parse(xhr.responseText)
            } catch {
              data = {}
            }
          }

          if (xhr.status < 200 || xhr.status >= 300) {
            setVideoUploads((current) => ({
              ...current,
              [materialId]: {
                ...(current[materialId] ?? {}),
                percent: 0,
                status: 'error',
              },
            }))
            onNotify(data.message || 'Video tidak bisa diupload.')
            event.target.value = ''
            return
          }

          setClassForm((current) => ({
            ...current,
            materials: current.materials.map((material) =>
              material.id === materialId
                ? {
                    ...material,
                    videoFile: upload.file || upload.path || '',
                    videoName: upload.name || file.name,
                    videoType: upload.type || file.type,
                  }
                : material,
            ),
          }))
          setVideoUploads((current) => ({
            ...current,
            [materialId]: {
              fileName: upload.name || file.name,
              percent: 100,
              status: 'done',
            },
          }))
          onNotify('Video berhasil diupload. Klik Simpan Kelas agar masuk ke materi.')
          event.target.value = ''
        }
        xhr.onerror = () => {
          setVideoUploads((current) => ({
            ...current,
            [materialId]: {
              ...(current[materialId] ?? {}),
              percent: 0,
              status: 'error',
            },
          }))
          onNotify('Upload video gagal. Periksa koneksi dan pengaturan Supabase Storage.')
          event.target.value = ''
        }
        xhr.send(buildSignedUploadBody(file))
      })
      .catch((error) => {
        setVideoUploads((current) => ({
          ...current,
          [materialId]: {
            ...(current[materialId] ?? {}),
            percent: 0,
            status: 'error',
          },
        }))
        onNotify(error.message || 'Video tidak bisa diupload.')
        event.target.value = ''
      })
  }

  const addMaterial = () => {
    const nextMaterial = createEmptyMaterial()

    setClassForm((current) => ({
      ...current,
      materials: [...current.materials, nextMaterial],
    }))
    setActiveMaterialEditorId(nextMaterial.id)
  }

  const removeMaterial = (materialId) => {
    setClassForm((current) => ({
      ...current,
      materials:
        current.materials.length > 1
          ? current.materials.filter((material) => material.id !== materialId)
          : current.materials,
    }))
    if (activeMaterialEditorId === materialId) {
      setActiveMaterialEditorId(null)
    }
  }

  const moveMaterialByIndex = (fromIndex, toIndex) => {
    setClassForm((current) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.materials.length ||
        toIndex >= current.materials.length ||
        fromIndex === toIndex
      ) {
        return current
      }

      const nextMaterials = [...current.materials]
      const [movedMaterial] = nextMaterials.splice(fromIndex, 1)
      nextMaterials.splice(toIndex, 0, movedMaterial)

      return {
        ...current,
        materials: nextMaterials,
      }
    })
  }

  const moveMaterialToTarget = (draggedMaterialId, targetMaterialId) => {
    if (!draggedMaterialId || draggedMaterialId === targetMaterialId) {
      return
    }

    setClassForm((current) => {
      const fromIndex = current.materials.findIndex(
        (material) => material.id === draggedMaterialId,
      )
      const toIndex = current.materials.findIndex(
        (material) => material.id === targetMaterialId,
      )

      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return current
      }

      const nextMaterials = [...current.materials]
      const [movedMaterial] = nextMaterials.splice(fromIndex, 1)
      nextMaterials.splice(toIndex, 0, movedMaterial)

      return {
        ...current,
        materials: nextMaterials,
      }
    })
  }

  const handleMaterialDragStart = (event, materialId) => {
    setDraggingMaterialId(materialId)
    lastMaterialDragTargetRef.current = ''
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', materialId)
  }

  const handleMaterialDragEnter = (event, targetMaterialId) => {
    event.preventDefault()
    if (lastMaterialDragTargetRef.current === targetMaterialId) {
      return
    }

    lastMaterialDragTargetRef.current = targetMaterialId
    moveMaterialToTarget(
      draggingMaterialId || event.dataTransfer.getData('text/plain'),
      targetMaterialId,
    )
  }

  const handleMaterialDragOver = (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleMaterialDragEnd = () => {
    setDraggingMaterialId(null)
    lastMaterialDragTargetRef.current = ''
  }

  const handleSubmitClass = async (event) => {
    event.preventDefault()

    const materials = classForm.materials.map((material, index) => {
      const liveDescription =
        activeMaterialEditorId === material.id && materialDescriptionRef.current
          ? normalizeMaterialDescriptionEditor()
          : material.description

      return {
        id: material.id || `material-${Date.now()}-${index}`,
        title: material.title.trim() || `Materi ${index + 1}`,
        description: liveDescription ?? '',
        videoUrl: material.videoUrl.trim(),
        videoFile: material.videoFile ?? '',
        videoName: material.videoName ?? '',
        videoType: material.videoType ?? '',
        imageFile: material.imageFile ?? '',
        imageName: material.imageName ?? '',
        pdfFile: material.pdfFile ?? '',
        pdfName: material.pdfName ?? '',
        requiresTask: Boolean(material.requiresTask),
        allowTaskImage: material.allowTaskImage !== false,
        requireTaskImage: Boolean(material.requireTaskImage),
        taskPrompt:
          material.taskPrompt.trim() ||
          'Kirim link tugas atau catatan praktik materi ini.',
        promptItems: (material.promptItems ?? [])
          .filter((item) => item.image || item.prompt || item.instruction)
          .map((item, promptIndex) => ({
            id: item.id || `prompt-${Date.now()}-${index}-${promptIndex}`,
            title: item.title.trim() || `Prompt ${promptIndex + 1}`,
            image: item.image,
            instruction: item.instruction?.trim() || '',
            prompt: item.prompt,
          })),
        resourceLinks: (material.resourceLinks ?? [])
          .filter((link) => link.url)
          .map((link, linkIndex) => ({
            id: link.id || `resource-link-${Date.now()}-${index}-${linkIndex}`,
            title: link.title.trim() || `Link ${linkIndex + 1}`,
            url: link.url.trim(),
          })),
      }
    })
    const invalidMaterial = materials.find(
      (material) =>
        material.videoUrl && !material.videoFile && !isYoutubeUrl(material.videoUrl),
    )

    if (invalidMaterial) {
      onNotify('Link video harus dari YouTube, YouTube Shorts, atau youtu.be.')
      return
    }

    const existingClass = classes.find((item) => item.id === editingClassId)
    const nextClass = {
      id: editingClassId ?? classForm.id,
      title: classForm.title.trim(),
      description: classForm.description || '',
      students: existingClass?.students ?? 0,
      displayStudents:
        classForm.displayStudents === ''
          ? ''
          : Math.max(0, Math.round(Number(classForm.displayStudents) || 0)),
      rating:
        classForm.rating === ''
          ? ''
          : Math.min(5, Math.max(0, Number(classForm.rating) || 0)),
      status: classForm.status,
      price: Math.max(0, Number(classForm.price) || 0),
      salePrice:
        classForm.salePrice === ''
          ? ''
          : Math.max(0, Number(classForm.salePrice) || 0),
      purchaseButtonLabel: classForm.purchaseButtonLabel.trim() || 'Beli Sekarang',
      registerButtonLabel: classForm.purchaseButtonLabel.trim() || 'Beli Sekarang',
      lynkProductKey: classForm.lynkProductKey.trim(),
      tripayProductKey: classForm.tripayProductKey.trim(),
      thumbnail: classForm.thumbnail,
      mentor: classForm.mentor.trim() || 'Ibnu Creative',
      progress: existingClass?.progress ?? 0,
      next: existingClass?.next ?? 'Mulai materi pertama',
      liveAt: existingClass?.liveAt ?? '',
      lessons: `${materials.length} materi`,
      showOnHomepage: classForm.showOnHomepage !== false,
      showOnMember: classForm.showOnMember !== false,
      highlighted: classForm.highlighted === true,
      materials,
    }

    if (!nextClass.title) {
      onNotify('Nama kelas wajib diisi.')
      return
    }

    try {
      await onClassesChange((current) =>
        editingClassId
          ? current.map((item) => (item.id === editingClassId ? nextClass : item))
          : [nextClass, ...current],
      )
      setActionStatus(
        editingClassId
          ? 'Data kelas berhasil diperbarui.'
          : 'Kelas baru berhasil ditambahkan.',
      )
      onNotify(editingClassId ? 'Kelas diperbarui.' : 'Kelas baru ditambahkan.')
      resetClassForm()
      setIsClassModalOpen(false)
    } catch (error) {
      onNotify(error.message || 'Kelas tidak bisa disimpan ke hosting.')
    }
  }

  const handleEditClass = (item) => {
    setClassForm({
      id: item.id,
      title: item.title,
      description: item.description ?? '',
      students: item.students,
      displayStudents: item.displayStudents ?? '',
      rating: item.rating ?? '',
      status: item.status,
      price: parseRupiahValue(item.price),
      salePrice: parseRupiahValue(item.salePrice),
      purchaseButtonLabel: item.purchaseButtonLabel || item.registerButtonLabel || 'Beli Sekarang',
      registerButtonLabel: item.registerButtonLabel || item.purchaseButtonLabel || 'Beli Sekarang',
      lynkProductKey: item.lynkProductKey ?? '',
      tripayProductKey: item.tripayProductKey ?? '',
      thumbnail: item.thumbnail ?? '',
      mentor: item.mentor ?? '',
      progress: item.progress ?? 0,
      next: item.next ?? '',
      liveAt: item.liveAt ?? '',
      lessons: item.lessons ?? '',
      showOnHomepage: item.showOnHomepage !== false,
      showOnMember: item.showOnMember !== false,
      highlighted: item.highlighted === true,
      materials: item.materials?.length
        ? item.materials.map((material) => ({
            ...material,
            description: material.description ?? '',
            videoFile: material.videoFile ?? '',
            videoName: material.videoName ?? '',
            videoType: material.videoType ?? '',
            imageFile: material.imageFile ?? '',
            imageName: material.imageName ?? '',
            pdfFile: material.pdfFile ?? '',
            pdfName: material.pdfName ?? '',
            allowTaskImage: material.allowTaskImage !== false,
            requireTaskImage: Boolean(material.requireTaskImage),
            promptItems: material.promptItems ?? [],
            resourceLinks: material.resourceLinks ?? [],
          }))
        : [createEmptyMaterial()],
    })
    setEditingClassId(item.id)
    setIsClassModalOpen(true)
    setActionStatus(`Sedang mengedit ${item.title}.`)
  }

  const updateClassQuickAction = async (classId, changes, message) => {
    try {
      await onClassesChange((current) =>
        current.map((item) => (item.id === classId ? { ...item, ...changes } : item)),
      )
      onNotify(message)
    } catch (error) {
      onNotify(error.message || 'Kelas tidak bisa diperbarui.')
    }
  }

  const duplicateClass = async (item) => {
    try {
      const copy = {
        ...item,
        id: `admin-class-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: `${item.title} Copy`,
        students: 0,
        status: 'Draft',
        showOnHomepage: false,
        showOnMember: false,
        highlighted: false,
        materials: (item.materials || []).map((material, index) => ({
          ...material,
          id: `material-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
        })),
      }

      await onClassesChange((current) => [copy, ...current])
      onNotify('Kelas berhasil diduplikat sebagai draft.')
    } catch (error) {
      onNotify(error.message || 'Kelas tidak bisa diduplikat.')
    }
  }

  const showClassAnalysis = (item) => {
    const homepageLabel = item.showOnHomepage !== false ? 'tampil di homepage' : 'disembunyikan dari homepage'
    const memberLabel = item.showOnMember !== false ? 'tampil di member' : 'disembunyikan dari member'
    const statusLabel = item.status || 'Draft'

    onNotify(`${item.title}: ${item.students || 0} peserta, status ${statusLabel}, ${homepageLabel}, ${memberLabel}.`)
  }

  const confirmDeleteClass = async () => {
    const classId = pendingDeleteClass?.id

    if (!classId) {
      return
    }

    try {
      await onClassesChange((current) => current.filter((item) => item.id !== classId))
      if (editingClassId === classId) {
        resetClassForm()
      }
      setPendingDeleteClass(null)
      setActionStatus('Kelas berhasil dihapus.')
      onNotify('Kelas dihapus.')
    } catch (error) {
      onNotify(error.message || 'Kelas tidak bisa dihapus dari hosting.')
    }
  }

  const resetMemberForm = () => {
    setMemberForm(createEmptyMemberForm())
    setEditingMemberId(null)
  }

  const openCreateMember = () => {
    resetMemberForm()
    onMenuChange('students')
    setIsMemberModalOpen(true)
  }

  const handleMemberFormChange = (event) => {
    const { name, value } = event.target

    setMemberForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleMemberAccessModeChange = (event) => {
    const { value } = event.target

    setMemberForm((current) => ({
      ...current,
      classAccessMode: value,
      allowedClassIds: value === 'all' || value === 'none' ? [] : current.allowedClassIds,
    }))
  }

  const handleToggleMemberClassAccess = (classId) => {
    setMemberForm((current) => {
      const allowedClassIds = current.allowedClassIds.includes(classId)
        ? current.allowedClassIds.filter((id) => id !== classId)
        : [...current.allowedClassIds, classId]

      return {
        ...current,
        allowedClassIds,
      }
    })
  }

  const handleSubmitMember = async (event) => {
    event.preventDefault()

    const payload = {
      id: editingMemberId,
      name: memberForm.name.trim(),
      username: memberForm.username.trim(),
      email: memberForm.email.trim(),
      phone: memberForm.phone.trim(),
      password: memberForm.password,
      status: memberForm.status,
      allowedClassIds:
        memberForm.classAccessMode === 'all'
          ? null
          : memberForm.classAccessMode === 'none'
            ? []
            : memberForm.allowedClassIds,
    }

    if (
      !payload.username ||
      (!editingMemberId && payload.password.length < 6) ||
      (editingMemberId && payload.password && payload.password.length < 6)
    ) {
      onNotify('Username dan password minimal 6 karakter wajib diisi.')
      return
    }

    try {
      if (editingMemberId) {
        await onUpdateMember(payload)
      } else {
        await onCreateMember(payload)
      }

      setActionStatus(
        editingMemberId
          ? 'Data member berhasil diperbarui.'
          : 'Member baru berhasil ditambahkan.',
      )
      onNotify(editingMemberId ? 'Member diperbarui.' : 'Member ditambahkan.')
      resetMemberForm()
      setIsMemberModalOpen(false)
    } catch (error) {
      onNotify(error.message || 'Data member tidak bisa disimpan.')
    }
  }

  const handleEditMember = (member) => {
    setMemberForm({
      name: member.name,
      username: member.username,
      email: member.email ?? '',
      phone: member.phone ?? '',
      password: '',
      status: member.status ?? 'Aktif',
      classAccessMode: Array.isArray(member.allowedClassIds)
        ? member.allowedClassIds.length
          ? 'custom'
          : 'none'
        : 'all',
      allowedClassIds: Array.isArray(member.allowedClassIds)
        ? member.allowedClassIds
        : [],
    })
    setEditingMemberId(member.id)
    setIsMemberModalOpen(true)
    setActionStatus(`Sedang mengedit member ${member.name}.`)
  }

  const confirmDeleteMember = async () => {
    if (!pendingDeleteMember?.id) {
      return
    }

    try {
      await onDeleteMember(pendingDeleteMember.id)
      setPendingDeleteMember(null)
      setActionStatus('Member berhasil dihapus.')
      onNotify('Member dihapus.')
    } catch (error) {
      onNotify(error.message || 'Member tidak bisa dihapus.')
    }
  }

  const handleOpenSupport = (ticket) => {
    setSupportForm({
      id: ticket.id,
      memberName: ticket.memberName,
      subject: ticket.subject,
      message: ticket.message,
        status: ticket.status === 'Menunggu' ? 'Dibalas' : ticket.status,
        answer: ticket.answer ?? '',
        replyDraft: '',
        replies: ticket.replies ?? [],
    })
    setIsSupportModalOpen(true)
  }

  const handleSupportFormChange = (event) => {
    const { name, value } = event.target

    setSupportForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleSubmitSupport = async (event) => {
    event.preventDefault()

    try {
      await onUpdateSupportTicket({
        id: supportForm.id,
        status: supportForm.status,
        message: supportForm.replyDraft.trim(),
      })
      setIsSupportModalOpen(false)
      setSupportForm(createEmptySupportForm())
      setActionStatus('Tiket bantuan berhasil diperbarui.')
      onNotify('Balasan bantuan disimpan.')
    } catch (error) {
      onNotify(error.message || 'Tiket bantuan tidak bisa disimpan.')
    }
  }

  const confirmDeleteSupport = async () => {
    if (!pendingDeleteSupport?.id) {
      return
    }

    try {
      await onDeleteSupportTicket(pendingDeleteSupport.id)
      setPendingDeleteSupport(null)
      setActionStatus('Tiket bantuan berhasil dihapus.')
      onNotify('Tiket bantuan dihapus.')
    } catch (error) {
      onNotify(error.message || 'Tiket bantuan tidak bisa dihapus.')
    }
  }

  const handleExportData = () => {
    const csv = [
      [
        'Kelas',
        'Peserta',
        'Status',
        'Harga',
        'Mentor',
        'Jadwal Live',
        'Jumlah Materi',
        'Materi Wajib Tugas',
      ]
        .map(toCsvValue)
        .join(','),
      ...classes.map((item) =>
        [
          item.title,
          item.students,
          item.status,
          formatClassPrice(item.price),
          item.mentor,
          item.liveAt,
          item.materials?.length ?? 0,
          item.materials?.filter((material) => material.requiresTask).length ?? 0,
        ]
          .map(toCsvValue)
          .join(','),
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = 'data-kelas-ibnucreative.csv'
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setActionStatus('Data kelas diekspor sebagai file CSV.')
    onNotify('File CSV data kelas dibuat.')
  }

  const handleWebsiteImageUpload = (file) => uploadClassImage(file, sessionToken)

  const openSubmissionReview = (submission) => {
    setViewingSubmission(submission)
    setSubmissionFeedback(submission.feedback ?? '')
    setSubmissionRating(Number(submission.rating) || 0)
  }

  const handleReviewSubmission = async (status = 'Direview') => {
    if (!viewingSubmission?.id) {
      return
    }

    try {
      await onUpdateSubmission({
        id: viewingSubmission.id,
        status,
        feedback: submissionFeedback.trim(),
        rating: submissionRating,
      })
      setViewingSubmission(null)
      setSubmissionFeedback('')
      setSubmissionRating(0)
      setActionStatus(`Tugas ${viewingSubmission.memberName} diperbarui.`)
      onNotify('Status tugas peserta diperbarui.')
    } catch (error) {
      onNotify(error.message || 'Tugas tidak bisa diperbarui.')
    }
  }

  return (
    <DashboardShell
      role="admin"
      loginName={loginName}
      avatar={avatar}
      menuItems={adminMenuItems}
      activeMenu={activeMenu}
      onMenuChange={onMenuChange}
      isMenuOpen={isMenuOpen}
      onCloseMenu={onCloseMenu}
    >
      {activeMenu === 'overview' && (
        <>
          <section className="summary-grid admin-summary">
            <MetricCard icon="users" label="Sedang aktif" value={onlineMembers.length} />
            <MetricCard icon="message" label="Bantuan masuk" value={waitingSupportCount} />
            <MetricCard icon="fileText" label="Tugas masuk" value={pendingSubmissions} />
            <MetricCard icon="wallet" label="Omzet terbayar" value={formatRupiah(totalPaidRevenue)} />
          </section>

          <section className="admin-actions">
            <article className="action-card">
              <Icon name="bookOpen" />
              <h3>Tambah kelas</h3>
              <p>Buat draft kelas baru untuk batch berikutnya.</p>
              <button className="btn btn-secondary" type="button" onClick={openCreateClass}>
                <Icon name="arrowRight" />
                Tambah Kelas
              </button>
            </article>
            <article className="action-card">
              <Icon name="wallet" />
              <h3>Laporan cepat</h3>
              <p>Ekspor data kelas aktif ke CSV.</p>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={handleExportData}
              >
                <Icon name="arrowRight" />
                Ekspor Data
              </button>
            </article>
            <article className="action-card">
              <Icon name="fileText" />
              <h3>Lihat tugas peserta</h3>
              <p>Review kiriman tugas member dari setiap materi kelas.</p>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => onMenuChange('submissions')}
              >
                <Icon name="arrowRight" />
                Lihat Tugas
              </button>
            </article>
          </section>
        </>
      )}

      {activeMenu === 'manage-classes' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Operasional</p>
              <h2>Kelola kelas</h2>
            </div>
            <div className="button-row">
              <button className="btn btn-secondary" type="button" onClick={handleExportData}>
                <Icon name="arrowRight" />
                Ekspor
              </button>
              <button className="btn btn-primary" type="button" onClick={openCreateClass}>
                <Icon name="bookOpen" />
                Tambah
              </button>
            </div>
          </div>
          <div className="admin-table" role="table" aria-label="Data kelas">
            <div className="table-row table-head" role="row">
              <span role="columnheader">Kelas</span>
              <span role="columnheader">Peserta</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Harga</span>
              <span role="columnheader">Aksi</span>
            </div>
            {classes.map((item) => (
              <div className="table-row" role="row" key={item.id}>
                <span className="class-cell" data-label="Kelas" role="cell">
                  <span className="class-thumb" aria-hidden="true">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" />
                    ) : (
                      <Icon name="image" />
                    )}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.materials?.length ?? 0} materi / {item.lessons}
                    </small>
                    <span className="admin-inline-badges">
                      <mark className={item.showOnHomepage === false ? 'muted-mark' : ''}>
                        {item.showOnHomepage === false ? 'Hidden home' : 'Show home'}
                      </mark>
                      <mark className={item.showOnMember === false ? 'muted-mark' : ''}>
                        {item.showOnMember === false ? 'Hidden member' : 'Show member'}
                      </mark>
                      {item.highlighted && <mark>Highlight</mark>}
                    </span>
                  </span>
                </span>
                <span data-label="Peserta" role="cell">
                  {item.students}
                </span>
                <span data-label="Status" role="cell">
                  <mark>{item.status}</mark>
                </span>
                <span data-label="Harga" role="cell">
                  {formatClassPrice(item.price)}
                </span>
                <span className="row-actions" data-label="Aksi" role="cell">
                  <button type="button" onClick={() => handleEditClass(item)}>
                    Edit
                  </button>
                  <details className="row-action-menu">
                    <summary aria-label={`Buka aksi kelas ${item.title}`}>
                      <Icon name="moreVertical" />
                    </summary>
                    <div className="row-action-menu-panel">
                      <button
                        type="button"
                        onClick={() =>
                          updateClassQuickAction(
                            item.id,
                            { showOnHomepage: item.showOnHomepage === false },
                            item.showOnHomepage === false
                              ? 'Kelas ditampilkan di homepage.'
                              : 'Kelas disembunyikan dari homepage.',
                          )
                        }
                          >
                            {item.showOnHomepage === false ? 'Show homepage' : 'Hide homepage'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateClassQuickAction(
                                item.id,
                                { showOnMember: item.showOnMember === false },
                                item.showOnMember === false
                                  ? 'Kelas ditampilkan di Kelas Tersedia member.'
                                  : 'Kelas disembunyikan dari Kelas Tersedia member.',
                              )
                            }
                          >
                            {item.showOnMember === false ? 'Show member' : 'Hide member'}
                          </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateClassQuickAction(
                            item.id,
                            { status: 'Aktif' },
                            'Kelas dipublish.',
                          )
                        }
                      >
                        Publish
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateClassQuickAction(
                            item.id,
                            { highlighted: !item.highlighted },
                            item.highlighted
                              ? 'Highlight kelas dimatikan.'
                              : 'Kelas dijadikan highlight.',
                          )
                        }
                      >
                        {item.highlighted ? 'Unhighlight' : 'Highlight'}
                      </button>
                      <button type="button" onClick={() => showClassAnalysis(item)}>
                        Analisis
                      </button>
                      <button type="button" onClick={() => duplicateClass(item)}>
                        Duplicat
                      </button>
                      <button
                        className="danger-action"
                        type="button"
                        onClick={() => setPendingDeleteClass(item)}
                      >
                        Delete
                      </button>
                    </div>
                  </details>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeMenu === 'digital-products' && (
        isDigitalProductBuilderOpen ? (
          <form className="digital-product-builder-page" onSubmit={handleSubmitDigitalProduct}>
            <div className="digital-builder-topbar">
              <div>
                <p className="eyebrow">Produk digital</p>
                <h2>{editingDigitalProductId ? 'Edit produk digital' : 'Tambah produk digital'}</h2>
                <small>Atur detail produk, harga, link delivery, checkout, dan pertanyaan pembeli dalam satu halaman.</small>
              </div>
              <div className="button-row">
                <button className="btn btn-secondary" type="button" onClick={closeDigitalProductBuilder}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit">
                  <Icon name="download" />
                  {editingDigitalProductId ? 'Save Digital' : 'Add Digital'}
                </button>
              </div>
            </div>

            <div className="digital-builder-grid">
              <div className="digital-builder-column">
                <section className="digital-builder-card">
                  <div className="digital-builder-card-heading">
                    <h3>Details</h3>
                  </div>

                  <label className="digital-upload-field">
                    Image
                    <span className="digital-image-upload">
                      {digitalProductForm.thumbnail ? (
                        <img src={digitalProductForm.thumbnail} alt="" />
                      ) : (
                        <>
                          <Icon name="image" />
                          <small>Add Image</small>
                        </>
                      )}
                      <input type="file" accept="image/*" onChange={handleDigitalProductThumbnailChange} />
                    </span>
                  </label>
                  {digitalProductForm.thumbnail && (
                    <button
                      className="text-action"
                      type="button"
                      onClick={() => setDigitalProductForm((current) => ({ ...current, thumbnail: '' }))}
                    >
                      Hapus gambar
                    </button>
                  )}

                  <label className="digital-toggle-row">
                    <span>
                      Add video
                      <small>Tambahkan video preview produk.</small>
                    </span>
                    <input
                      name="addVideo"
                      type="checkbox"
                      checked={digitalProductForm.addVideo}
                      onChange={handleDigitalProductFormChange}
                    />
                  </label>
                  {digitalProductForm.addVideo && (
                    <label>
                      Link video
                      <input
                        name="videoUrl"
                        type="url"
                        value={digitalProductForm.videoUrl}
                        onChange={handleDigitalProductFormChange}
                        placeholder="https://youtube.com/..."
                      />
                    </label>
                  )}

                  <label>
                    Title
                    <input
                      name="title"
                      type="text"
                      value={digitalProductForm.title}
                      onChange={handleDigitalProductFormChange}
                      placeholder="Title"
                      required
                    />
                  </label>

                  <div className="digital-metric-grid">
                    <label>
                      Produk terjual tampilan
                      <input
                        name="displaySales"
                        type="number"
                        min="0"
                        value={digitalProductForm.displaySales}
                        onChange={handleDigitalProductFormChange}
                        placeholder="Kosong = jumlah asli"
                      />
                    </label>
                    <label>
                      Rating tampilan
                      <input
                        name="rating"
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        value={digitalProductForm.rating}
                        onChange={handleDigitalProductFormChange}
                        placeholder="Kosong = otomatis"
                      />
                    </label>
                  </div>

                  <label>
                    Description
                    <span className="digital-rich-toolbar">
                      <button type="button" onClick={() => applyDigitalDescriptionTool('bold')}>B</button>
                      <button type="button" onClick={() => applyDigitalDescriptionTool('underline')}>U</button>
                      <button type="button" onClick={() => applyDigitalDescriptionTool('heading')}>H</button>
                      <button type="button" onClick={() => applyDigitalDescriptionTool('align-left')} title="Rata kiri">L</button>
                      <button type="button" onClick={() => applyDigitalDescriptionTool('align-center')} title="Rata tengah">C</button>
                      <button type="button" onClick={() => applyDigitalDescriptionTool('align-justify')} title="Justify">J</button>
                      <button
                        type="button"
                        onClick={() => digitalDescriptionImageInputRef.current?.click()}
                        title="Tambah gambar"
                      >
                        <Icon name="image" />
                      </button>
                      <button type="button" onClick={() => applyDigitalDescriptionTool('youtube')} title="Tambah video YouTube">
                        <Icon name="youtube" />
                      </button>
                      <button type="button" onClick={() => applyDigitalDescriptionTool('list')}><Icon name="menu" /></button>
                      <button type="button" onClick={() => applyDigitalDescriptionTool('link')}><Icon name="link" /></button>
                    </span>
                    <textarea
                      className="digital-description-editor"
                      data-digital-description-editor="true"
                      name="description"
                      value={digitalProductForm.description}
                      onChange={handleDigitalProductFormChange}
                      placeholder="Jelaskan isi produk, manfaat, bonus, dan cara aksesnya."
                      rows={9}
                    />
                    <DescriptionVideoPreview value={digitalProductForm.description} />
                    <input
                      ref={digitalDescriptionImageInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      tabIndex={-1}
                      onChange={handleDigitalDescriptionImageChange}
                    />
                  </label>

                  <div className="digital-platform-box">
                    <div className="digital-builder-card-heading compact">
                      <h3>Platform</h3>
                      <small>Tempat file atau akses produk disimpan.</small>
                    </div>
                    <div className="platform-pill-row" role="group" aria-label="Platform produk">
                      {digitalProductPlatformOptions.map((option) => (
                        <button
                          className={`platform-pill ${digitalProductForm.platformType === option.id ? 'active' : ''}`}
                          key={option.id}
                          type="button"
                          onClick={() => setDigitalProductForm((current) => ({ ...current, platformType: option.id }))}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <input
                      className="digital-platform-url"
                      name="fileUrl"
                      type="url"
                      value={digitalProductForm.fileUrl}
                      onChange={handleDigitalProductFormChange}
                      placeholder="drive.google.com/file/..."
                    />
                    <input
                      name="fileName"
                      type="text"
                      value={digitalProductForm.fileName}
                      onChange={handleDigitalProductFormChange}
                      placeholder="Nama file, contoh: template-canva.zip"
                    />
                  </div>
                </section>

                <section className="digital-builder-card">
                  <div className="digital-builder-card-heading">
                    <h3>Pricing</h3>
                  </div>

                  <label className="digital-toggle-row">
                    <span>
                      Allow customer to pay what they want
                      <small>Pembeli bisa menambah nominal sendiri.</small>
                    </span>
                    <input
                      name="payWhatYouWant"
                      type="checkbox"
                      checked={digitalProductForm.payWhatYouWant}
                      onChange={handleDigitalProductFormChange}
                    />
                  </label>

                  <div className="digital-price-row">
                    <label>
                      Price
                      <input
                        name="price"
                        type="text"
                        inputMode="numeric"
                        value={digitalProductForm.price}
                        onChange={handleDigitalProductFormChange}
                        placeholder="0"
                      />
                    </label>
                    <label>
                      Currency
                      <select defaultValue="IDR" disabled>
                        <option>IDR</option>
                      </select>
                    </label>
                  </div>

                  <label>
                    Sale Price (Optional)
                    <input
                      name="salePrice"
                      type="text"
                      inputMode="numeric"
                      value={digitalProductForm.salePrice}
                      onChange={handleDigitalProductFormChange}
                      placeholder="0"
                    />
                  </label>

                  <label className="digital-toggle-row">
                    <span>
                      Item Quantity
                      <small>{digitalProductForm.itemQuantityEnabled ? 'Jumlah stok dibatasi.' : 'Unlimited'}</small>
                    </span>
                    <input
                      name="itemQuantityEnabled"
                      type="checkbox"
                      checked={digitalProductForm.itemQuantityEnabled}
                      onChange={handleDigitalProductFormChange}
                    />
                  </label>
                  {digitalProductForm.itemQuantityEnabled && (
                    <label>
                      Jumlah stok
                      <input
                        name="itemQuantity"
                        type="text"
                        inputMode="numeric"
                        value={digitalProductForm.itemQuantity}
                        onChange={handleDigitalProductFormChange}
                        placeholder="100"
                      />
                    </label>
                  )}

                  <label className="digital-toggle-row">
                    <span>
                      Limit qty per checkout
                      <small>Batasi pembelian dalam satu transaksi.</small>
                    </span>
                    <input
                      name="limitQtyPerCheckout"
                      type="checkbox"
                      checked={digitalProductForm.limitQtyPerCheckout}
                      onChange={handleDigitalProductFormChange}
                    />
                  </label>

                  <label>
                    Purchase Button
                    <select
                      name="purchaseButtonLabel"
                      value={digitalProductForm.purchaseButtonLabel}
                      onChange={handleDigitalProductFormChange}
                    >
                      <option>Buy Now</option>
                      <option>Beli Sekarang</option>
                      <option>Dapatkan Akses</option>
                      <option>Download Sekarang</option>
                    </select>
                  </label>

                  <label>
                    Status
                    <select name="status" value={digitalProductForm.status} onChange={handleDigitalProductFormChange}>
                      <option>Aktif</option>
                      <option>Draft</option>
                      <option>Nonaktif</option>
                    </select>
                  </label>

                  <label className="digital-toggle-row">
                    <span>
                      Tampilkan di homepage
                      <small>Produk muncul di landing page publik.</small>
                    </span>
                    <input
                      name="showOnHomepage"
                      type="checkbox"
                      checked={digitalProductForm.showOnHomepage !== false}
                      onChange={handleDigitalProductFormChange}
                    />
                  </label>

                  <label className="digital-toggle-row">
                    <span>
                      Tampilkan di Produk Digital member
                      <small>Produk muncul di menu Produk Digital setelah member login.</small>
                    </span>
                    <input
                      name="showOnMember"
                      type="checkbox"
                      checked={digitalProductForm.showOnMember !== false}
                      onChange={handleDigitalProductFormChange}
                    />
                  </label>
                </section>

                <section className="digital-builder-card">
                  <div className="digital-builder-card-heading compact">
                    <h3>Add On</h3>
                    <button
                      type="button"
                      onClick={() =>
                        setDigitalProductForm((current) => ({
                          ...current,
                          addOns: [...(current.addOns || []), createEmptyDigitalProductAddOn()],
                        }))
                      }
                    >
                      + Add New
                    </button>
                  </div>
                  <div className="digital-repeat-list">
                    {(digitalProductForm.addOns || []).map((addOn) => (
                      <div className="digital-repeat-item" key={addOn.id}>
                        <input
                          value={addOn.title}
                          onChange={(event) => updateDigitalProductAddOn(addOn.id, 'title', event.target.value)}
                          placeholder="Nama add-on"
                        />
                        <input
                          value={addOn.price}
                          inputMode="numeric"
                          onChange={(event) => updateDigitalProductAddOn(addOn.id, 'price', event.target.value)}
                          placeholder="Harga"
                        />
                        <textarea
                          value={addOn.description}
                          onChange={(event) => updateDigitalProductAddOn(addOn.id, 'description', event.target.value)}
                          placeholder="Deskripsi add-on"
                          rows={2}
                        />
                        <button
                          className="text-action"
                          type="button"
                          onClick={() =>
                            setDigitalProductForm((current) => ({
                              ...current,
                              addOns: (current.addOns || []).filter((item) => item.id !== addOn.id),
                            }))
                          }
                        >
                          Hapus add-on
                        </button>
                      </div>
                    ))}
                    {!digitalProductForm.addOns?.length && <small>Belum ada add-on.</small>}
                  </div>
                </section>
              </div>

              <div className="digital-builder-column">
                <section className="digital-builder-card">
                  <div className="digital-builder-card-heading compact">
                    <h3>Review ({digitalProductForm.reviews?.length || 0}/10)</h3>
                    <button
                      type="button"
                      onClick={openDigitalReviewManager}
                    >
                      + Add Review
                    </button>
                  </div>
                  <div className="digital-review-admin-summary">
                    {(digitalProductForm.reviews || []).slice(0, 3).map((review) => (
                      <span key={review.id}>
                        <strong>{review.name || 'Reviewer'}</strong>
                        <small>{review.rating || 5} bintang</small>
                      </span>
                    ))}
                    {!digitalProductForm.reviews?.length && <small>Belum ada review.</small>}
                  </div>
                </section>

                <section className="digital-builder-card">
                  <div className="digital-builder-card-heading">
                    <h3>Advance Option</h3>
                  </div>

                  <label className="digital-toggle-row">
                    <span>
                      Release Time
                      <small>Set Release Time</small>
                    </span>
                    <input
                      name="releaseTimeEnabled"
                      type="checkbox"
                      checked={digitalProductForm.releaseTimeEnabled}
                      onChange={handleDigitalProductFormChange}
                    />
                  </label>
                  {digitalProductForm.releaseTimeEnabled && (
                    <label>
                      Jadwal rilis
                      <input
                        name="releaseTime"
                        type="datetime-local"
                        value={digitalProductForm.releaseTime}
                        onChange={handleDigitalProductFormChange}
                      />
                    </label>
                  )}

                  <label>
                    Catatan delivery
                    <textarea
                      name="deliveryNote"
                      value={digitalProductForm.deliveryNote}
                      onChange={handleDigitalProductFormChange}
                      placeholder="Instruksi khusus, password file, atau panduan akses."
                      rows={4}
                    />
                  </label>

                  <div className="digital-layout-section">
                    <strong>Block Layout</strong>
                    <div className="digital-layout-options">
                      {digitalProductLayoutOptions.map((option) => (
                        <button
                          className={`digital-layout-option ${digitalProductForm.blockLayout === option.id ? 'active' : ''}`}
                          key={option.id}
                          type="button"
                          onClick={() => setDigitalProductForm((current) => ({ ...current, blockLayout: option.id }))}
                        >
                          <span className={`layout-preview ${option.id}`} aria-hidden="true">
                            <i />
                            <i />
                            <i />
                            <i />
                          </span>
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="digital-builder-card">
                  <div className="digital-builder-card-heading">
                    <h3>Question for Customer</h3>
                  </div>
                  <small>Custom field for your customer to fill in during checkout.</small>

                  <div className="digital-question-row heading">
                    <span>Main Question</span>
                    <span>Required</span>
                  </div>
                  <label className="digital-question-row">
                    <span>
                      <input
                        name="requireCustomerName"
                        type="checkbox"
                        checked={digitalProductForm.requireCustomerName}
                        onChange={handleDigitalProductFormChange}
                      />
                      Name
                    </span>
                    <input
                      name="requireCustomerName"
                      type="checkbox"
                      checked={digitalProductForm.requireCustomerName}
                      onChange={handleDigitalProductFormChange}
                    />
                  </label>
                  <label className="digital-question-row">
                    <span>
                      <input
                        name="requireCustomerPhone"
                        type="checkbox"
                        checked={digitalProductForm.requireCustomerPhone}
                        onChange={handleDigitalProductFormChange}
                      />
                      Phone
                    </span>
                    <input
                      name="requireCustomerPhone"
                      type="checkbox"
                      checked={digitalProductForm.requireCustomerPhone}
                      onChange={handleDigitalProductFormChange}
                    />
                  </label>

                  <div className="digital-repeat-list">
                    {(digitalProductForm.customerQuestions || []).map((question) => (
                      <div className="digital-repeat-item" key={question.id}>
                        <input
                          value={question.label}
                          onChange={(event) => updateDigitalProductQuestion(question.id, 'label', event.target.value)}
                          placeholder="Pertanyaan custom, contoh: Username Instagram"
                        />
                        <label className="digital-toggle-row compact-toggle">
                          <span>Wajib diisi</span>
                          <input
                            type="checkbox"
                            checked={question.required}
                            onChange={(event) => updateDigitalProductQuestion(question.id, 'required', event.target.checked)}
                          />
                        </label>
                        <button
                          className="text-action"
                          type="button"
                          onClick={() =>
                            setDigitalProductForm((current) => ({
                              ...current,
                              customerQuestions: (current.customerQuestions || []).filter((item) => item.id !== question.id),
                            }))
                          }
                        >
                          Hapus pertanyaan
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    className="text-action centered"
                    type="button"
                    onClick={() =>
                      setDigitalProductForm((current) => ({
                        ...current,
                        customerQuestions: [...(current.customerQuestions || []), createEmptyDigitalProductQuestion()],
                      }))
                    }
                  >
                    + Add Another Question
                  </button>
                </section>

                <section className="digital-builder-card">
                  <div className="digital-builder-card-heading">
                    <h3>Kode produk</h3>
                  </div>
                  <label>
                    Kode produk Lynk.id
                    <input
                      name="lynkProductKey"
                      type="text"
                      value={digitalProductForm.lynkProductKey}
                      onChange={handleDigitalProductFormChange}
                      placeholder="ID / slug / nama produk Lynk"
                    />
                  </label>
                  <label>
                    Kode produk Tripay
                    <input
                      name="tripayProductKey"
                      type="text"
                      value={digitalProductForm.tripayProductKey}
                      onChange={handleDigitalProductFormChange}
                      placeholder="SKU produk"
                    />
                  </label>
                </section>
              </div>
            </div>

            {isDigitalReviewManagerOpen && (
              <div
                className="digital-review-modal-backdrop"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    setIsDigitalReviewManagerOpen(false)
                  }
                }}
              >
                <section className="digital-review-modal" role="dialog" aria-modal="true" aria-labelledby="digital-review-manager-title">
                  <div className="digital-review-modal-heading">
                    <div>
                      <p className="eyebrow">Review produk</p>
                      <h3 id="digital-review-manager-title">Kelola ulasan pembeli</h3>
                      <small>{digitalProductForm.reviews?.length || 0} dari 10 ulasan tersimpan.</small>
                    </div>
                    <button
                      className="icon-action-button"
                      type="button"
                      onClick={() => setIsDigitalReviewManagerOpen(false)}
                      aria-label="Tutup kelola review"
                    >
                      <Icon name="x" />
                    </button>
                  </div>

                  <div className="digital-review-modal-body">
                    <div className="digital-review-admin-list">
                      <h4>List ulasan</h4>
                      {(digitalProductForm.reviews || []).map((review) => (
                        <article className="digital-review-admin-item" key={review.id}>
                          <span className="digital-review-admin-avatar" aria-hidden="true">
                            {review.avatar ? <img src={review.avatar} alt="" /> : <Icon name="user" />}
                          </span>
                          <div className="digital-review-admin-fields">
                            <div className="digital-review-admin-grid">
                              <input
                                value={review.name}
                                onChange={(event) => updateDigitalProductReview(review.id, 'name', event.target.value)}
                                placeholder="Nama reviewer"
                              />
                              <input
                                value={review.instagram || ''}
                                onChange={(event) => updateDigitalProductReview(review.id, 'instagram', event.target.value)}
                                placeholder="@username"
                              />
                              <select
                                value={review.rating}
                                onChange={(event) => updateDigitalProductReview(review.id, 'rating', event.target.value)}
                              >
                                {[5, 4, 3, 2, 1].map((rating) => (
                                  <option key={rating} value={rating}>{rating} bintang</option>
                                ))}
                              </select>
                              <input
                                type="number"
                                min="0"
                                value={review.likes || 0}
                                onChange={(event) => updateDigitalProductReview(review.id, 'likes', parseRupiahValue(event.target.value))}
                                placeholder="Likes"
                              />
                              <input
                                type="date"
                                value={review.date || ''}
                                onChange={(event) => updateDigitalProductReview(review.id, 'date', event.target.value)}
                              />
                              <input
                                type="time"
                                value={review.time || ''}
                                onChange={(event) => updateDigitalProductReview(review.id, 'time', event.target.value)}
                              />
                            </div>
                            <input
                              value={review.avatar || ''}
                              onChange={(event) => updateDigitalProductReview(review.id, 'avatar', event.target.value)}
                              placeholder="Link foto profil reviewer"
                            />
                            <textarea
                              value={review.message}
                              onChange={(event) => updateDigitalProductReview(review.id, 'message', event.target.value)}
                              placeholder="Isi ulasan"
                              rows={3}
                            />
                          </div>
                          <button
                            className="text-action"
                            type="button"
                            onClick={() => removeDigitalProductReview(review.id)}
                          >
                            Hapus
                          </button>
                        </article>
                      ))}
                      {!digitalProductForm.reviews?.length && (
                        <div className="digital-review-empty">
                          <Icon name="message" />
                          <strong>Belum ada ulasan</strong>
                          <small>Tambahkan ulasan manual dari form di bawah.</small>
                        </div>
                      )}
                    </div>

                    <div className="digital-review-add-panel">
                      <h4>Tambah ulasan</h4>
                      <div className="digital-review-admin-grid">
                        <input
                          value={digitalReviewDraft.name}
                          onChange={(event) => updateDigitalReviewDraft('name', event.target.value)}
                          placeholder="Nama reviewer"
                        />
                        <input
                          value={digitalReviewDraft.instagram}
                          onChange={(event) => updateDigitalReviewDraft('instagram', event.target.value)}
                          placeholder="@username Instagram"
                        />
                        <select
                          value={digitalReviewDraft.rating}
                          onChange={(event) => updateDigitalReviewDraft('rating', event.target.value)}
                        >
                          {[5, 4, 3, 2, 1].map((rating) => (
                            <option key={rating} value={rating}>{rating} bintang</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          value={digitalReviewDraft.likes}
                          onChange={(event) => updateDigitalReviewDraft('likes', event.target.value)}
                          placeholder="Jumlah likes"
                        />
                        <input
                          type="date"
                          value={digitalReviewDraft.date}
                          onChange={(event) => updateDigitalReviewDraft('date', event.target.value)}
                        />
                        <input
                          type="time"
                          value={digitalReviewDraft.time}
                          onChange={(event) => updateDigitalReviewDraft('time', event.target.value)}
                        />
                      </div>
                      <input
                        value={digitalReviewDraft.avatar}
                        onChange={(event) => updateDigitalReviewDraft('avatar', event.target.value)}
                        placeholder="Link foto profil reviewer"
                      />
                      <textarea
                        value={digitalReviewDraft.message}
                        onChange={(event) => updateDigitalReviewDraft('message', event.target.value)}
                        placeholder="Tulis isi ulasan"
                        rows={4}
                      />
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={addDigitalProductReview}
                        disabled={(digitalProductForm.reviews || []).length >= 10}
                      >
                        <Icon name="message" />
                        Tambahkan Ulasan
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </form>
        ) : (
          <section className="panel digital-products-admin-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Produk digital</p>
                <h2>Kelola produk digital</h2>
                <small>Jual file, template, preset, ebook, atau link akses otomatis lewat Tripay dan Lynk.id.</small>
              </div>
              <button className="btn btn-primary" type="button" onClick={openCreateDigitalProduct}>
                <Icon name="download" />
                Tambahkan Produk Digital
              </button>
            </div>

            <div className="admin-table compact-list-table digital-product-table" role="table" aria-label="Produk digital">
              <div className="table-row table-head" role="row">
                <span role="columnheader">Produk</span>
                <span role="columnheader">Harga</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Terjual</span>
                <span role="columnheader">Aksi</span>
              </div>
              {digitalProducts.map((product) => {
                const accessCount = digitalProductAccess.filter((access) => access.productId === product.id).length

                return (
                  <div className="table-row" role="row" key={product.id}>
                    <span className="payment-identity" data-label="Produk" role="cell">
                      <strong>{product.title}</strong>
                      <small>{product.fileName || product.fileUrl || 'Link produk belum diisi'}</small>
                      <span className="admin-inline-badges">
                        <mark className={product.showOnHomepage === false ? 'muted-mark' : ''}>
                          {product.showOnHomepage === false ? 'Hidden home' : 'Show home'}
                        </mark>
                        <mark className={product.showOnMember === false ? 'muted-mark' : ''}>
                          {product.showOnMember === false ? 'Hidden member' : 'Show member'}
                        </mark>
                        {product.highlighted && <mark>Highlight</mark>}
                      </span>
                    </span>
                    <span data-label="Harga" role="cell">{product.price ? formatRupiah(product.price) : 'Gratis'}</span>
                    <span data-label="Status" role="cell"><mark>{product.status}</mark></span>
                    <span data-label="Terjual" role="cell">{accessCount} pembeli</span>
                    <span className="row-actions" data-label="Aksi" role="cell">
                      <button type="button" onClick={() => handleEditDigitalProduct(product)}>Edit</button>
                      <details className="row-action-menu">
                        <summary aria-label={`Buka aksi produk ${product.title}`}>
                          <Icon name="moreVertical" />
                        </summary>
                        <div className="row-action-menu-panel">
                          <button
                            type="button"
                            onClick={() =>
                              updateDigitalProductQuickAction(
                                product.id,
                                { showOnHomepage: product.showOnHomepage === false },
                                product.showOnHomepage === false
                                  ? 'Produk ditampilkan di homepage.'
                                  : 'Produk disembunyikan dari homepage.',
                              )
                            }
                          >
                            {product.showOnHomepage === false ? 'Show homepage' : 'Hide homepage'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateDigitalProductQuickAction(
                                product.id,
                                { showOnMember: product.showOnMember === false },
                                product.showOnMember === false
                                  ? 'Produk ditampilkan di Produk Digital member.'
                                  : 'Produk disembunyikan dari Produk Digital member.',
                              )
                            }
                          >
                            {product.showOnMember === false ? 'Show member' : 'Hide member'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateDigitalProductQuickAction(
                                product.id,
                                { status: 'Aktif' },
                                'Produk dipublish.',
                              )
                            }
                          >
                            Publish
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateDigitalProductQuickAction(
                                product.id,
                                { highlighted: !product.highlighted },
                                product.highlighted
                                  ? 'Highlight produk dimatikan.'
                                  : 'Produk dijadikan highlight.',
                              )
                            }
                          >
                            {product.highlighted ? 'Unhighlight' : 'Highlight'}
                          </button>
                          <button
                            type="button"
                            onClick={() => showDigitalProductAnalysis(product, accessCount)}
                          >
                            Analisis
                          </button>
                          <button type="button" onClick={() => duplicateDigitalProduct(product)}>
                            Duplicat
                          </button>
                          <button
                            className="danger-action"
                            type="button"
                            onClick={() => handleDeleteDigitalProduct(product.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </details>
                    </span>
                  </div>
                )
              })}
              {!digitalProducts.length && (
                <article className="empty-state">
                  <Icon name="download" />
                  <h3>Belum ada produk digital</h3>
                  <p>Tambahkan produk pertama untuk mulai menjual file, template, atau akses digital.</p>
                  <button className="btn btn-primary" type="button" onClick={openCreateDigitalProduct}>
                    Tambahkan Produk Digital
                  </button>
                </article>
              )}
            </div>
          </section>
        )
      )}

      {activeMenu === 'students' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Peserta</p>
              <h2>Kelola member</h2>
            </div>
            <div className="member-heading-actions">
              <button
                className={`mobile-member-filter-toggle ${
                  hasMemberFilter ? 'active' : ''
                }`}
                type="button"
                aria-label="Tampilkan pencarian dan filter member"
                aria-expanded={isMemberFilterOpen}
                onClick={() => setIsMemberFilterOpen((current) => !current)}
              >
                <Icon name="filter" />
              </button>
              <button className="btn btn-primary" type="button" onClick={openCreateMember}>
                <Icon name="users" />
                Tambah Member
              </button>
            </div>
          </div>
          <div className={`member-filter-bar ${isMemberFilterOpen ? 'is-open' : ''}`}>
            <label className="member-search-field">
              Cari member
              <input
                type="search"
                value={memberSearchTerm}
                onChange={(event) => {
                  setMemberSearchTerm(event.target.value)
                  setMemberPage(1)
                }}
                placeholder="Nama, email, atau username"
              />
            </label>
            <label>
              Status akun
              <select
                value={memberStatusFilter}
                onChange={(event) => {
                  setMemberStatusFilter(event.target.value)
                  setMemberPage(1)
                }}
              >
                <option value="all">Semua status</option>
                {memberStatusOptions.map((status) => (
                  <option value={status} key={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kelas
              <select
                value={memberClassFilter}
                onChange={(event) => {
                  setMemberClassFilter(event.target.value)
                  setMemberPage(1)
                }}
              >
                <option value="all">Semua kelas</option>
                <option value="all-access">Akses semua kelas</option>
                <option value="no-access">Belum ada akses kelas</option>
                {memberClassOptions.map((course) => (
                  <option value={course.id} key={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Aktivitas
              <select
                value={memberActivityFilter}
                onChange={(event) => {
                  setMemberActivityFilter(event.target.value)
                  setMemberPage(1)
                }}
              >
                <option value="all">Semua aktivitas</option>
                <option value="online">Sedang aktif</option>
                <option value="offline">Tidak aktif</option>
              </select>
            </label>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!hasMemberFilter}
              onClick={() => {
                setMemberSearchTerm('')
                setMemberStatusFilter('all')
                setMemberClassFilter('all')
                setMemberActivityFilter('all')
                setMemberPage(1)
              }}
            >
              <Icon name="x" />
              Reset
            </button>
          </div>
          <div className="member-pagination-bar">
            <p>
              Menampilkan{' '}
              <strong>
                {filteredMembers.length ? memberPageStart + 1 : 0}-{memberPageEnd}
              </strong>{' '}
              dari <strong>{filteredMembers.length}</strong> member
            </p>
            <label>
              Tampil
              <select
                value={memberPageSize}
                onChange={(event) => {
                  setMemberPageSize(Number(event.target.value))
                  setMemberPage(1)
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          <div className="admin-table member-table compact-list-table" role="table" aria-label="Data member">
            <div className="table-row table-head" role="row">
              <span role="columnheader">Member</span>
              <span role="columnheader">Username</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Progress</span>
              <span role="columnheader">Aktivitas</span>
              <span role="columnheader">Aksi</span>
            </div>
            {visibleMembers.map((member) => {
              const progressSummary = getMemberProgressSummary(member, classes, submissions)

              return (
                <div className="table-row" role="row" key={member.id}>
                  <span className="member-identity" data-label="Member" role="cell">
                    <span className="sidebar-avatar" aria-hidden="true">
                      {member.avatar ? <img src={member.avatar} alt="" /> : <Icon name="user" />}
                    </span>
                    <span>
                      <strong>{member.name}</strong>
                      <small>{member.email || 'Email belum diisi'}</small>
                      {member.phone && <small>{member.phone}</small>}
                      <small className="mobile-list-meta">
                        {member.username} - {member.status}
                      </small>
                    </span>
                  </span>
                  <span data-label="Username" role="cell">
                    {member.username}
                  </span>
                  <span data-label="Status" role="cell">
                    <mark>{member.status}</mark>
                  </span>
                  <span className="member-progress-cell" data-label="Progress" role="cell">
                    <span className="member-progress-content">
                      <span className="member-progress-heading">
                        <strong>{progressSummary.percent}%</strong>
                        <small>{progressSummary.tasksLabel}</small>
                      </span>
                      <span className="progress-track member-progress-track">
                        <span style={{ width: `${progressSummary.percent}%` }}></span>
                      </span>
                      <small>{progressSummary.title}</small>
                      <small>{progressSummary.detail}</small>
                    </span>
                  </span>
                  <span className="member-activity-cell" data-label="Aktivitas" role="cell">
                    <span className="member-activity-content">
                      <span
                        className={
                          member.isOnline ? 'presence-badge online' : 'presence-badge'
                        }
                      >
                        <span aria-hidden="true"></span>
                        {member.isOnline ? 'Sedang aktif' : 'Tidak aktif'}
                      </span>
                      <small>
                        {member.lastSeenAt
                          ? `Terakhir aktif ${formatRelativeActivity(member.lastSeenAt)}`
                          : 'Belum pernah aktif'}
                      </small>
                      <small>Bergabung {member.joinedAt || '-'}</small>
                    </span>
                  </span>
                  <span className="row-actions" data-label="Aksi" role="cell">
                    <button type="button" onClick={() => handleEditMember(member)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => setPendingDeleteMember(member)}>
                      Hapus
                    </button>
                  </span>
                </div>
              )
            })}
            {!filteredMembers.length && (
              <article className="empty-state table-empty">
                <Icon name="users" />
                <h3>{members.length ? 'Tidak ada member sesuai filter' : 'Belum ada member'}</h3>
                <p>
                  {members.length
                    ? 'Ubah kata kunci atau filter untuk melihat member lain.'
                    : 'Tambahkan member pertama agar bisa login ke dashboard member.'}
                </p>
              </article>
            )}
          </div>
          {filteredMembers.length > memberPageSize && (
            <div className="pagination-controls" aria-label="Navigasi halaman member">
              <button
                type="button"
                onClick={() => setMemberPage(Math.max(1, safeMemberPage - 1))}
                disabled={safeMemberPage === 1}
              >
                Prev
              </button>
              <div className="pagination-pages">
                {memberPageNumbers.map((pageNumber) => (
                  <button
                    className={safeMemberPage === pageNumber ? 'active' : ''}
                    type="button"
                    key={pageNumber}
                    onClick={() => setMemberPage(pageNumber)}
                    aria-current={safeMemberPage === pageNumber ? 'page' : undefined}
                  >
                    {pageNumber}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setMemberPage(Math.min(memberPageCount, safeMemberPage + 1))}
                disabled={safeMemberPage === memberPageCount}
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}

      {activeMenu === 'payments' && (
        <>
          <section className="panel payment-report-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Rentang laporan</p>
                <h2>Grafik pendapatan</h2>
                <small>Filter tanggal ini mengatur statistik, grafik, dan tabel transaksi.</small>
              </div>
              <div className="payment-date-filter-bar">
                <label>
                  Mulai
                  <input
                    type="date"
                    value={paymentStartDate}
                    onChange={(event) => {
                      setPaymentStartDate(event.target.value)
                      setPaymentPage(1)
                    }}
                  />
                </label>
                <label>
                  Sampai
                  <input
                    type="date"
                    value={paymentEndDate}
                    onChange={(event) => {
                      setPaymentEndDate(event.target.value)
                      setPaymentPage(1)
                    }}
                  />
                </label>
                {(paymentStartDate || paymentEndDate) && (
                  <button
                    className="btn btn-secondary payment-date-reset"
                    type="button"
                    onClick={() => {
                      setPaymentStartDate('')
                      setPaymentEndDate('')
                      setPaymentPage(1)
                    }}
                  >
                    Reset tanggal
                  </button>
                )}
              </div>
            </div>
            <div className="payment-revenue-chart" aria-label="Grafik pendapatan harian">
              {revenueChartItems.length ? (
                revenueChartItems.map((item) => (
                  <div className="payment-chart-item" key={item.dateKey}>
                    <span
                      className="payment-chart-bar"
                      style={{
                        height: `${Math.max(8, Math.round((item.total / highestRevenueChartValue) * 100))}%`,
                      }}
                      title={`${new Date(item.dateKey).toLocaleDateString('id-ID')}: ${formatRupiah(item.total)}`}
                    ></span>
                    <small>{new Date(item.dateKey).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</small>
                    <strong>{formatRupiah(item.total)}</strong>
                  </div>
                ))
              ) : (
                <article className="empty-state payment-chart-empty">
                  <Icon name="trendingUp" />
                  <h3>Belum ada pendapatan pada rentang ini</h3>
                  <p>Ubah rentang tanggal untuk melihat grafik pendapatan lain.</p>
                </article>
              )}
            </div>
          </section>

          <section className="summary-grid admin-summary payment-summary">
            <MetricCard icon="wallet" label="Omzet terbayar" value={formatRupiah(totalPaidRevenue)} />
            <MetricCard icon="trendingUp" label="Transaksi sukses" value={paidPayments.length} />
            <MetricCard icon="clock" label="Menunggu bayar" value={pendingPayments.length} />
            <MetricCard icon="shield" label="Expired" value={expiredPayments.length} />
            <MetricCard icon="shield" label="Omzet Tripay" value={formatRupiah(tripayRevenue)} />
          </section>

          <section className="panel payment-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Pembayaran</p>
                <h2>Riwayat transaksi</h2>
                <small>Tabel mengikuti rentang tanggal dan filter transaksi.</small>
              </div>
              <div className="payment-filter-bar">
                <label>
                  Cari
                  <input
                    type="search"
                    value={paymentSearchTerm}
                    onChange={(event) => {
                      setPaymentSearchTerm(event.target.value)
                      setPaymentPage(1)
                    }}
                    placeholder="Nama, email, kelas, atau order"
                  />
                </label>
                <label>
                  Status
                  <select
                    value={paymentStatusFilter}
                    onChange={(event) => {
                      setPaymentStatusFilter(event.target.value)
                      setPaymentPage(1)
                    }}
                  >
                    <option value="all">Semua status</option>
                    {paymentStatusOptions.map((status) => (
                      <option value={status} key={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Kanal
                  <select
                    value={paymentSourceFilter}
                    onChange={(event) => {
                      setPaymentSourceFilter(event.target.value)
                      setPaymentPage(1)
                    }}
                  >
                    <option value="all">Semua kanal</option>
                    {paymentSourceOptions.map((source) => (
                      <option value={source} key={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {filteredPayments.length > 0 && (
              <div className="member-pagination-bar payment-pagination-bar">
                <p>
                  Menampilkan {paymentPageStart + 1}-{paymentPageEnd} dari{' '}
                  {filteredPayments.length} transaksi
                </p>
                <label className="pagination-size-select">
                  Tampilkan
                  <select
                    value={paymentPageSize}
                    onChange={(event) => {
                      setPaymentPageSize(Number(event.target.value))
                      setPaymentPage(1)
                    }}
                  >
                    {[10, 25, 50, 100].map((size) => (
                      <option value={size} key={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div
              className="admin-table payment-table compact-list-table"
              role="table"
              aria-label="Riwayat transaksi pembayaran"
            >
              <div className="table-row table-head" role="row">
                <span role="columnheader">Transaksi</span>
                <span role="columnheader">Member</span>
                <span role="columnheader">Kelas</span>
                <span role="columnheader">Nominal</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Waktu</span>
              </div>
              {visiblePayments.map((payment) => {
                const statusType = isPaidPayment(payment)
                  ? 'success'
                  : isFailedPayment(payment)
                    ? 'danger'
                    : 'pending'

                return (
                  <div className="table-row" role="row" key={payment.id}>
                    <span className="payment-identity" data-label="Transaksi" role="cell">
                      <strong>{payment.orderCode || payment.reference || '-'}</strong>
                      <small>
                        {payment.sourceLabel} / {payment.paymentMethod || '-'}
                      </small>
                    </span>
                    <span data-label="Member" role="cell">
                      <span className="payment-member-cell">
                        <strong>{payment.buyerName || 'Member'}</strong>
                        <small>{payment.buyerEmail || '-'}</small>
                      </span>
                    </span>
                    <span data-label="Kelas" role="cell">
                      {payment.classTitle}
                    </span>
                    <span data-label="Nominal" role="cell">
                      <strong>{payment.amount ? formatRupiah(payment.amount) : '-'}</strong>
                    </span>
                    <span data-label="Status" role="cell">
                      <mark className={`payment-status ${statusType}`}>
                        {payment.status}
                      </mark>
                    </span>
                    <span data-label="Waktu" role="cell">
                      {payment.createdAt
                        ? new Date(payment.createdAt).toLocaleString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '-'}
                    </span>
                  </div>
                )
              })}
              {!filteredPayments.length && (
                <article className="empty-state table-empty">
                  <Icon name="wallet" />
                  <h3>Belum ada transaksi</h3>
                  <p>Riwayat pembayaran Tripay dan Lynk.id akan muncul di sini.</p>
                </article>
              )}
            </div>
            {filteredPayments.length > paymentPageSize && (
              <div className="pagination-controls" aria-label="Navigasi halaman transaksi">
                <button
                  type="button"
                  onClick={() => setPaymentPage(Math.max(1, safePaymentPage - 1))}
                  disabled={safePaymentPage === 1}
                >
                  Prev
                </button>
                <div className="pagination-pages">
                  {paymentPageNumbers.map((pageNumber) => (
                    <button
                      className={safePaymentPage === pageNumber ? 'active' : ''}
                      type="button"
                      key={pageNumber}
                      onClick={() => setPaymentPage(pageNumber)}
                      aria-current={safePaymentPage === pageNumber ? 'page' : undefined}
                    >
                      {pageNumber}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentPage(Math.min(paymentPageCount, safePaymentPage + 1))}
                  disabled={safePaymentPage === paymentPageCount}
                >
                  Next
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {activeMenu === 'testimonials' && (
        <section className="panel testimonial-admin-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Moderasi sosial proof</p>
              <h2>{pendingTestimonials} testimoni menunggu persetujuan</h2>
              <small>{approvedTestimonials} testimoni sudah tampil di homepage.</small>
            </div>
          </div>
          <div className="testimonial-admin-list">
            {testimonials.map((testimonial) => (
              <article className="testimonial-admin-card" key={testimonial.id}>
                <span className="sidebar-avatar" aria-hidden="true">
                  {testimonial.memberAvatar ? (
                    <img src={testimonial.memberAvatar} alt="" />
                  ) : (
                    <Icon name="user" />
                  )}
                </span>
                <div>
                  <div className="testimonial-admin-heading">
                    <strong>{testimonial.memberName}</strong>
                    <mark>{testimonial.status}</mark>
                  </div>
                  <small>{testimonial.classTitle}</small>
                  <p>{testimonial.message}</p>
                  <div className="row-actions testimonial-admin-actions">
                    <button
                      className="testimonial-visibility-button"
                      type="button"
                      title={testimonial.status === 'approved' ? 'Sembunyikan dari homepage' : 'Tampilkan di homepage'}
                      aria-label={testimonial.status === 'approved' ? 'Sembunyikan testimoni dari homepage' : 'Tampilkan testimoni di homepage'}
                      onClick={() => handleToggleTestimonialVisibility(testimonial)}
                    >
                      <Icon name={testimonial.status === 'approved' ? 'eyeOff' : 'eye'} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModerateTestimonial(testimonial, 'approved')}
                      disabled={testimonial.status === 'approved'}
                    >
                      ACC
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModerateTestimonial(testimonial, 'rejected')}
                      disabled={testimonial.status === 'rejected'}
                    >
                      Tolak
                    </button>
                    <button type="button" onClick={() => handleRemoveTestimonial(testimonial)}>
                      Hapus
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {!testimonials.length && (
              <article className="empty-state">
                <Icon name="message" />
                <h3>Belum ada testimoni</h3>
                <p>Testimoni akan muncul setelah peserta menyelesaikan kelas dan mengirim pengalaman mereka.</p>
              </article>
            )}
          </div>
        </section>
      )}

      {activeMenu === 'submissions' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Review tugas</p>
              <h2>{pendingSubmissions} tugas menunggu feedback</h2>
            </div>
            <button
              className={`mobile-submission-filter-toggle ${
                hasSubmissionListFilter ? 'active' : ''
              }`}
              type="button"
              aria-label="Tampilkan pencarian dan filter tugas"
              aria-expanded={isSubmissionFilterOpen}
              onClick={() => setIsSubmissionFilterOpen((current) => !current)}
            >
              <Icon name="filter" />
            </button>
          </div>
          <div
            className={`submission-filter-bar submission-list-filter-bar ${
              isSubmissionFilterOpen ? 'is-open' : ''
            }`}
          >
            <label className="submission-search-field">
              Cari member
              <input
                type="search"
                value={submissionSearchTerm}
                onChange={(event) => {
                  setSubmissionSearchTerm(event.target.value)
                  setSubmissionPage(1)
                }}
                placeholder="Nama, email, atau username"
              />
            </label>
            <label>
              Status tugas
              <select
                value={submissionListStatusFilter}
                onChange={(event) => {
                  setSubmissionListStatusFilter(event.target.value)
                  setSubmissionPage(1)
                }}
              >
                {submissionStatusOptions.map((option) => (
                  <option value={option.id} key={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kelas
              <select
                value={submissionListClassFilter}
                onChange={(event) => {
                  setSubmissionListClassFilter(event.target.value)
                  setSubmissionPage(1)
                }}
              >
                <option value="all">Semua kelas</option>
                {submissionClassOptions.map(([classId, classTitle]) => (
                  <option value={classId} key={classId}>
                    {classTitle}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="member-pagination-bar submission-pagination-bar">
            <p>
              Menampilkan{' '}
              <strong>
                {filteredSubmissionMembers.length ? submissionPageStart + 1 : 0}-
                {submissionPageEnd}
              </strong>{' '}
              dari <strong>{filteredSubmissionMembers.length}</strong> member
            </p>
            <label>
              Tampil
              <select
                value={submissionPageSize}
                onChange={(event) => {
                  setSubmissionPageSize(Number(event.target.value))
                  setSubmissionPage(1)
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          <div
            className="admin-table submission-table compact-list-table"
            role="table"
            aria-label="Member pengirim tugas"
          >
            <div className="table-row table-head" role="row">
              <span role="columnheader">Member</span>
              <span role="columnheader">Tugas</span>
              <span role="columnheader">Menunggu</span>
              <span role="columnheader">Terakhir kirim</span>
              <span role="columnheader">Aksi</span>
            </div>
            {visibleSubmissionMembers.map((member) => (
              <div
                className={`table-row ${selectedSubmissionMemberId === member.id ? 'active-row' : ''}`}
                role="row"
                key={member.id}
              >
                <span className="member-identity" data-label="Member" role="cell">
                  <span className="sidebar-avatar" aria-hidden="true">
                    {member.avatar ? <img src={member.avatar} alt="" /> : <Icon name="user" />}
                  </span>
                  <span>
                    <strong>{member.name}</strong>
                    <small>{member.email || member.username}</small>
                    <small className="mobile-list-meta">
                      {member.submissionCount} tugas - {member.pendingSubmissionCount} menunggu -{' '}
                      {member.latestSubmissionAt
                        ? formatRelativeActivity(member.latestSubmissionAt)
                        : 'Belum ada tanggal'}
                    </small>
                  </span>
                </span>
                <span data-label="Tugas" role="cell">
                  {member.submissionCount} tugas
                </span>
                <span data-label="Menunggu" role="cell">
                  <mark>{member.pendingSubmissionCount}</mark>
                </span>
                <span data-label="Terakhir kirim" role="cell">
                  {member.latestSubmissionAt
                    ? formatRelativeActivity(member.latestSubmissionAt)
                    : '-'}
                </span>
                <span className="row-actions" data-label="Aksi" role="cell">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSubmissionMemberId(member.id)
                      setSubmissionStatusFilter('all')
                      setSubmissionClassFilter('all')
                    }}
                  >
                    Lihat Tugas
                  </button>
                </span>
              </div>
            ))}
            {!filteredSubmissionMembers.length && (
              <article className="empty-state table-empty">
                <Icon name="fileText" />
                <h3>{submissionMembers.length ? 'Tidak ada member sesuai filter' : 'Belum ada tugas'}</h3>
                <p>
                  {submissionMembers.length
                    ? 'Ubah kata kunci atau filter untuk melihat pengirim tugas lain.'
                    : 'Tugas yang dikirim member dari halaman materi akan muncul di sini.'}
                </p>
              </article>
            )}
          </div>
          {filteredSubmissionMembers.length > submissionPageSize && (
            <div className="pagination-controls" aria-label="Navigasi halaman tugas member">
              <button
                type="button"
                onClick={() => setSubmissionPage(Math.max(1, safeSubmissionPage - 1))}
                disabled={safeSubmissionPage === 1}
              >
                Prev
              </button>
              <div className="pagination-pages">
                {submissionPageNumbers.map((pageNumber) => (
                  <button
                    className={safeSubmissionPage === pageNumber ? 'active' : ''}
                    type="button"
                    key={pageNumber}
                    onClick={() => setSubmissionPage(pageNumber)}
                    aria-current={safeSubmissionPage === pageNumber ? 'page' : undefined}
                  >
                    {pageNumber}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setSubmissionPage(Math.min(submissionPageCount, safeSubmissionPage + 1))
                }
                disabled={safeSubmissionPage === submissionPageCount}
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}

      {activeMenu === 'certificates' && (
        <section className="panel admin-certificate-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Sertifikat</p>
              <h2>Kelola sertifikat member</h2>
              <small>
                Review permintaan perubahan nama dan pantau sertifikat yang sudah terbit.
              </small>
            </div>
          </div>
          <div className="certificate-summary-grid admin-summary-grid">
            <article>
              <Icon name="certificate" />
              <strong>{certificates.length}</strong>
              <span>Sertifikat terbit</span>
            </article>
            <article>
              <Icon name="clock" />
              <strong>{pendingCertificateNameRequests.length}</strong>
              <span>Menunggu review</span>
            </article>
            <article>
              <Icon name="checkCircle" />
              <strong>{reviewedCertificateNameRequests.filter((item) => item.status === 'approved').length}</strong>
              <span>Disetujui</span>
            </article>
            <article>
              <Icon name="x" />
              <strong>{reviewedCertificateNameRequests.filter((item) => item.status === 'rejected').length}</strong>
              <span>Ditolak</span>
            </article>
          </div>

          <div className="admin-certificate-layout">
            <section className="admin-certificate-card">
              <div className="subsection-heading">
                <div>
                  <p className="eyebrow">Approval</p>
                  <h3>Permintaan ubah nama</h3>
                </div>
                <span>{pendingCertificateNameRequests.length} pending</span>
              </div>
              <div className="admin-table certificate-request-table" role="table" aria-label="Permintaan ubah nama sertifikat">
                <div className="table-row table-head" role="row">
                  <span role="columnheader">Peserta</span>
                  <span role="columnheader">Kelas</span>
                  <span role="columnheader">Perubahan</span>
                  <span role="columnheader">Alasan</span>
                  <span role="columnheader">Aksi</span>
                </div>
                {pendingCertificateNameRequests.map((request) => (
                  <div className="table-row" role="row" key={request.id}>
                    <span data-label="Peserta" role="cell">
                      <strong>{request.memberName}</strong>
                      <small>{request.publicCertificateId}</small>
                    </span>
                    <span data-label="Kelas" role="cell">{request.classTitle}</span>
                    <span data-label="Perubahan" role="cell">
                      <small>{request.oldName}</small>
                      <strong>{request.newName}</strong>
                    </span>
                    <span data-label="Alasan" role="cell">{request.reason}</span>
                    <span className="row-actions" data-label="Aksi" role="cell">
                      <button type="button" onClick={() => handleReviewCertificateNameChange(request, 'approved')}>
                        Setujui
                      </button>
                      <button type="button" onClick={() => handleReviewCertificateNameChange(request, 'rejected')}>
                        Tolak
                      </button>
                    </span>
                  </div>
                ))}
                {!pendingCertificateNameRequests.length && (
                  <article className="empty-state table-empty">
                    <Icon name="checkCircle" />
                    <h3>Tidak ada permintaan pending</h3>
                    <p>Permintaan perubahan nama dari peserta akan muncul di sini.</p>
                  </article>
                )}
              </div>
            </section>

            <section className="admin-certificate-card">
              <div className="subsection-heading">
                <div>
                  <p className="eyebrow">Riwayat</p>
                  <h3>Riwayat perubahan nama</h3>
                </div>
                <span>{certificateNameChangeRequests.length} request</span>
              </div>
              <div className="admin-table certificate-history-table" role="table" aria-label="Riwayat perubahan nama sertifikat">
                <div className="table-row table-head" role="row">
                  <span role="columnheader">Sertifikat</span>
                  <span role="columnheader">Peserta</span>
                  <span role="columnheader">Nama Baru</span>
                  <span role="columnheader">Status</span>
                  <span role="columnheader">Tanggal</span>
                </div>
                {certificateNameChangeRequests.map((request) => (
                  <div className="table-row" role="row" key={request.id}>
                    <span data-label="Sertifikat" role="cell">{request.publicCertificateId}</span>
                    <span data-label="Peserta" role="cell">{request.memberName}</span>
                    <span data-label="Nama Baru" role="cell">{request.newName}</span>
                    <span data-label="Status" role="cell">
                      <mark>{request.status === 'approved' ? 'Disetujui' : request.status === 'rejected' ? 'Ditolak' : 'Pending'}</mark>
                    </span>
                    <span data-label="Tanggal" role="cell">
                      {request.reviewedAt
                        ? formatRelativeActivity(request.reviewedAt)
                        : formatRelativeActivity(request.createdAt)}
                    </span>
                  </div>
                ))}
                {!certificateNameChangeRequests.length && (
                  <article className="empty-state table-empty">
                    <Icon name="fileText" />
                    <h3>Belum ada riwayat</h3>
                    <p>Riwayat approval perubahan nama akan tersimpan permanen di sini.</p>
                  </article>
                )}
              </div>
            </section>

            <section className="admin-certificate-card wide">
              <div className="subsection-heading">
                <div>
                  <p className="eyebrow">Database</p>
                  <h3>Sertifikat terbit</h3>
                </div>
                <span>{certificates.length} sertifikat</span>
              </div>
              <div className="admin-table issued-certificate-table" role="table" aria-label="Sertifikat terbit">
                <div className="table-row table-head" role="row">
                  <span role="columnheader">ID</span>
                  <span role="columnheader">Peserta</span>
                  <span role="columnheader">Kelas</span>
                  <span role="columnheader">Terbit</span>
                  <span role="columnheader">Aksi</span>
                </div>
                {certificates.map((certificate) => (
                  <div className="table-row" role="row" key={certificate.id}>
                    <span data-label="ID" role="cell">
                      <strong>{certificate.certificateId}</strong>
                      <small>Versi {certificate.version}</small>
                    </span>
                    <span data-label="Peserta" role="cell">
                      <strong>{certificate.participantName}</strong>
                      <small>{certificate.memberName}</small>
                    </span>
                    <span data-label="Kelas" role="cell">{certificate.classTitle}</span>
                    <span data-label="Terbit" role="cell">
                      {formatRelativeActivity(certificate.issuedAt || certificate.createdAt)}
                    </span>
                    <span className="row-actions" data-label="Aksi" role="cell">
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            `/sertifikat/${encodeURIComponent(certificate.certificateId)}`,
                            '_blank',
                            'noopener,noreferrer',
                          )
                        }
                      >
                        Verifikasi
                      </button>
                    </span>
                  </div>
                ))}
                {!certificates.length && (
                  <article className="empty-state table-empty">
                    <Icon name="certificate" />
                    <h3>Belum ada sertifikat terbit</h3>
                    <p>Sertifikat akan tercatat saat member membuat sertifikat dari dashboard.</p>
                  </article>
                )}
              </div>
            </section>
          </div>
        </section>
      )}

      {activeMenu === 'support' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Bantuan mentor</p>
              <h2>Kelola pertanyaan member</h2>
            </div>
          </div>
          <div className="admin-table support-table" role="table" aria-label="Tiket bantuan mentor">
            <div className="table-row table-head" role="row">
              <span role="columnheader">Pertanyaan</span>
              <span role="columnheader">Member</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Dikirim</span>
              <span role="columnheader">Aksi</span>
            </div>
            {supportTickets.map((ticket) => (
              <div className="table-row" role="row" key={ticket.id}>
                <span className="support-message" data-label="Pertanyaan" role="cell">
                  <strong>{ticket.subject}</strong>
                  <small>{ticket.message}</small>
                  {(ticket.replies ?? []).at(-1)?.message && (
                    <small>Pesan terakhir: {(ticket.replies ?? []).at(-1).message}</small>
                  )}
                </span>
                <span data-label="Member" role="cell">
                  {ticket.memberName}
                </span>
                <span data-label="Status" role="cell">
                  <mark>{ticket.status}</mark>
                </span>
                <span data-label="Dikirim" role="cell">
                  {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString('id-ID') : '-'}
                </span>
                <span className="row-actions" data-label="Aksi" role="cell">
                  <button type="button" onClick={() => handleOpenSupport(ticket)}>
                    Balas
                  </button>
                  <button type="button" onClick={() => setPendingDeleteSupport(ticket)}>
                    Hapus
                  </button>
                </span>
              </div>
            ))}
            {!supportTickets.length && (
              <article className="empty-state table-empty">
                <Icon name="message" />
                <h3>Belum ada bantuan</h3>
                <p>Pertanyaan dari halaman member akan muncul di sini.</p>
              </article>
            )}
          </div>
        </section>
      )}

      {activeMenu === 'website-settings' && (
        <WebsiteSettingsPanel
          key={JSON.stringify(websiteSettings)}
          settings={websiteSettings}
          publicActivities={publicActivities}
          classes={classes}
          digitalProducts={digitalProducts}
          onSave={onWebsiteSettingsChange}
          onSyncTripayPaymentMethods={onSyncTripayPaymentMethods}
          onDownloadBackup={onDownloadBackup}
          onRestoreBackup={onRestoreBackup}
          onUploadImage={handleWebsiteImageUpload}
          onNotify={onNotify}
        />
      )}

      {actionStatus && (
        <p className="action-feedback" role="status">
          {actionStatus}
        </p>
      )}
      {isMemberModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="crud-editor member-editor" onSubmit={handleSubmitMember}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Kelola member</p>
                <h2>{editingMemberId ? 'Edit member' : 'Tambah member'}</h2>
              </div>
              <button
                type="button"
                aria-label="Tutup form member"
                onClick={() => {
                  resetMemberForm()
                  setIsMemberModalOpen(false)
                }}
              >
                <Icon name="x" />
              </button>
            </div>
            <p className="password-note">
              Password disimpan sebagai hash di data JSON dan tidak ditampilkan ulang
              setelah disimpan.
            </p>
            <div className="crud-form modal-form">
              <label>
                Nama member
                <input
                  name="name"
                  type="text"
                  value={memberForm.name}
                  onChange={handleMemberFormChange}
                  placeholder="Contoh: Andi Kreatif"
                  required
                />
              </label>
              <label>
                Username
                <input
                  name="username"
                  type="text"
                  value={memberForm.username}
                  onChange={handleMemberFormChange}
                  placeholder="andi.kreatif"
                  autoComplete="off"
                  required
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  value={memberForm.email}
                  onChange={handleMemberFormChange}
                  placeholder="nama@email.com"
                />
              </label>
              <label>
                Nomor telepon
                <input
                  name="phone"
                  type="tel"
                  value={memberForm.phone}
                  onChange={handleMemberFormChange}
                  placeholder="Opsional, contoh: 081234567890"
                />
              </label>
              <label>
                Status
                <select
                  name="status"
                  value={memberForm.status}
                  onChange={handleMemberFormChange}
                >
                  <option>Aktif</option>
                  <option>Nonaktif</option>
                </select>
              </label>
              <label className="full-field">
                Akses kelas
                <select
                  value={memberForm.classAccessMode}
                  onChange={handleMemberAccessModeChange}
                >
                  <option value="all">Semua kelas aktif</option>
                  <option value="custom">Pilih kelas tertentu</option>
                  <option value="none">Tidak ada akses kelas</option>
                </select>
              </label>
              {memberForm.classAccessMode === 'custom' && (
                <div className="member-class-access full-field">
                  {classes.map((course) => (
                    <label className="check-field" key={course.id}>
                      <input
                        type="checkbox"
                        checked={memberForm.allowedClassIds.includes(course.id)}
                        onChange={() => handleToggleMemberClassAccess(course.id)}
                      />
                      {course.title}
                    </label>
                  ))}
                  {!classes.length && (
                    <p className="password-note">
                      Belum ada kelas yang bisa diberikan akses.
                    </p>
                  )}
                </div>
              )}
              {memberForm.classAccessMode === 'none' && (
                <p className="password-note full-field">
                  Peserta ini tidak akan melihat kelas apa pun dan tidak bisa masuk ke
                  halaman belajar sampai admin memberikan akses.
                </p>
              )}
              <label className="full-field">
                Password {editingMemberId ? 'baru' : ''}
                <input
                  name="password"
                  type="password"
                  value={memberForm.password}
                  onChange={handleMemberFormChange}
                  placeholder={
                    editingMemberId
                      ? 'Kosongkan jika tidak diganti'
                      : 'Minimal 6 karakter'
                  }
                  autoComplete="new-password"
                  required={!editingMemberId}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  resetMemberForm()
                  setIsMemberModalOpen(false)
                }}
              >
                Batal
              </button>
              <button className="btn btn-primary" type="submit">
                {editingMemberId ? 'Simpan Edit' : 'Tambah Member'}
              </button>
            </div>
          </form>
        </div>
      )}
      {isSupportModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="crud-editor support-editor" onSubmit={handleSubmitSupport}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Bantuan mentor</p>
                <h2>Balas pertanyaan</h2>
              </div>
              <button
                type="button"
                aria-label="Tutup form bantuan"
                onClick={() => {
                  setSupportForm(createEmptySupportForm())
                  setIsSupportModalOpen(false)
                }}
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="support-ticket-preview">
              <strong>{supportForm.memberName}</strong>
              <span>{supportForm.subject}</span>
              <p>{supportForm.message}</p>
            </div>
            <div className="ticket-thread admin-thread">
              {supportForm.replies.map((reply) => (
                <div
                  className={
                    reply.senderRole === 'admin'
                      ? 'ticket-bubble mentor'
                      : 'ticket-bubble member'
                  }
                  key={reply.id}
                >
                  <small>{reply.senderRole === 'admin' ? 'Admin' : supportForm.memberName}</small>
                  <p>{reply.message}</p>
                </div>
              ))}
            </div>
            <div className="crud-form modal-form">
              <label>
                Status
                <select
                  name="status"
                  value={supportForm.status}
                  onChange={handleSupportFormChange}
                >
                  <option>Menunggu</option>
                  <option>Dibalas</option>
                  <option>Selesai</option>
                </select>
              </label>
              <label className="full-field">
                Balasan mentor
                <textarea
                  name="replyDraft"
                  value={supportForm.replyDraft}
                  onChange={handleSupportFormChange}
                  placeholder="Tulis balasan baru untuk member..."
                  rows="5"
                ></textarea>
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setSupportForm(createEmptySupportForm())
                  setIsSupportModalOpen(false)
                }}
              >
                Batal
              </button>
              <button className="btn btn-primary" type="submit">
                Simpan Balasan
              </button>
            </div>
          </form>
        </div>
      )}
      {selectedSubmissionMember && (
        <div className="modal-backdrop submission-member-backdrop" role="presentation">
          <div className="crud-editor submission-member-modal">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Tugas per member</p>
                <h2>{selectedSubmissionMember.name}</h2>
              </div>
              <button
                type="button"
                aria-label="Tutup daftar tugas member"
                onClick={() => setSelectedSubmissionMemberId('')}
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="submission-member-summary" aria-label="Ringkasan tugas member">
              <span>
                <small>Total tugas</small>
                <strong>{selectedSubmissionMember.submissionCount}</strong>
              </span>
              <span>
                <small>Menunggu</small>
                <strong>{selectedSubmissionMember.pendingSubmissionCount}</strong>
              </span>
              <span>
                <small>Terakhir kirim</small>
                <strong>
                  {selectedSubmissionMember.latestSubmissionAt
                    ? formatRelativeActivity(selectedSubmissionMember.latestSubmissionAt)
                    : '-'}
                </strong>
              </span>
            </div>
            <div className="submission-filter-bar">
              <label>
                Status tugas
                <select
                  value={submissionStatusFilter}
                  onChange={(event) => setSubmissionStatusFilter(event.target.value)}
                >
                  {submissionStatusOptions.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kelas
                <select
                  value={submissionClassFilter}
                  onChange={(event) => setSubmissionClassFilter(event.target.value)}
                >
                  <option value="all">Semua kelas</option>
                  {selectedMemberClassOptions.map(([classId, classTitle]) => (
                    <option value={classId} key={classId}>
                      {classTitle}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="admin-table submission-table member-submission-table compact-list-table"
              role="table"
              aria-label="Tugas per materi"
            >
              <div className="table-row table-head" role="row">
                <span role="columnheader">Materi</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Dikirim</span>
                <span role="columnheader">Aksi</span>
              </div>
              {visibleMemberSubmissions.map((submission) => (
                <div className="table-row" role="row" key={submission.id}>
                  <span className="support-message" data-label="Materi" role="cell">
                    {submission.attachmentUrl && (
                      <img
                        className="submission-table-thumb"
                        src={submission.attachmentUrl}
                        alt=""
                      />
                    )}
                    <strong>{submission.materialTitle}</strong>
                    <small>{submission.classTitle}</small>
                    <small className="mobile-list-meta">
                      {submission.status} -{' '}
                      {submission.submittedAt
                        ? new Date(submission.submittedAt).toLocaleDateString('id-ID')
                        : '-'}
                    </small>
                    {submission.attachmentUrl && (
                      <small className="submission-image-note">Ada gambar tugas</small>
                    )}
                  </span>
                  <span data-label="Status" role="cell">
                    <mark>{submission.status}</mark>
                  </span>
                  <span data-label="Dikirim" role="cell">
                    {submission.submittedAt
                      ? new Date(submission.submittedAt).toLocaleDateString('id-ID')
                      : '-'}
                  </span>
                  <span className="row-actions" data-label="Aksi" role="cell">
                    <button type="button" onClick={() => openSubmissionReview(submission)}>
                      Lihat Tugas
                    </button>
                  </span>
                </div>
              ))}
              {!visibleMemberSubmissions.length && (
                <article className="empty-state table-empty">
                  <Icon name="fileText" />
                  <h3>Tidak ada tugas sesuai filter</h3>
                  <p>Pilih filter lain untuk melihat kiriman tugas member ini.</p>
                </article>
              )}
            </div>
          </div>
        </div>
      )}
      {viewingSubmission && (
        <div className="modal-backdrop submission-review-backdrop" role="presentation">
          <div className="crud-editor submission-review">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Tugas peserta</p>
                <h2>{viewingSubmission.materialTitle}</h2>
              </div>
              <button
                type="button"
                aria-label="Tutup detail tugas"
                onClick={() => {
                  setViewingSubmission(null)
                  setSubmissionFeedback('')
                  setSubmissionRating(0)
                }}
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="support-ticket-preview">
              <strong>{viewingSubmission.memberName}</strong>
              <span>{viewingSubmission.classTitle}</span>
              <p>{viewingSubmission.answer}</p>
              {viewingSubmission.attachmentUrl && (
                <div className="submission-image-preview">
                  <img
                    src={viewingSubmission.attachmentUrl}
                    alt={viewingSubmission.attachmentName || 'Gambar tugas member'}
                  />
                  <a
                    className="submission-attachment-link"
                    href={viewingSubmission.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon name="image" />
                    Buka gambar ukuran penuh
                  </a>
                </div>
              )}
              {viewingSubmission.answer.startsWith('http') && (
                <a
                  className="text-button"
                  href={viewingSubmission.answer}
                  target="_blank"
                  rel="noreferrer"
                >
                  Buka link tugas
                </a>
              )}
            </div>
            <label>
              Feedback mentor
              <textarea
                value={submissionFeedback}
                onChange={(event) => setSubmissionFeedback(event.target.value)}
                placeholder="Tulis catatan review untuk peserta..."
                rows="5"
              ></textarea>
            </label>
            <div className="rating-review-field">
              <span>Rating tugas</span>
              <div className="star-rating" role="radiogroup" aria-label="Rating tugas">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    className={submissionRating >= rating ? 'active' : ''}
                    aria-label={`${rating} bintang`}
                    onClick={() => setSubmissionRating(rating)}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setViewingSubmission(null)
                  setSubmissionFeedback('')
                  setSubmissionRating(0)
                }}
              >
                Batal
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => handleReviewSubmission('Direview')}
              >
                Tandai Direview
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => handleReviewSubmission('Selesai')}
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
      {isClassModalOpen && (
        <div className="modal-backdrop class-modal-backdrop" role="presentation">
          <form className="crud-editor class-editor" onSubmit={handleSubmitClass}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Kelola kelas</p>
                <h2>{editingClassId ? 'Edit kelas' : 'Tambah kelas'}</h2>
              </div>
              <button
                type="button"
                aria-label="Tutup form kelas"
                onClick={() => {
                  resetClassForm()
                  setIsClassModalOpen(false)
                }}
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="crud-form modal-form class-editor-form">
              <div className="thumbnail-field">
                <span className="thumbnail-preview" aria-hidden="true">
                  {classForm.thumbnail ? (
                    <img src={classForm.thumbnail} alt="" />
                  ) : (
                    <Icon name="image" />
                  )}
                </span>
                <label className="upload-control">
                  <Icon name="image" />
                  Upload thumbnail
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleThumbnailChange}
                  />
                </label>
              </div>
              <label>
                Nama kelas
                <input
                  name="title"
                  type="text"
                  value={classForm.title}
                  onChange={handleClassFormChange}
                  placeholder="Contoh: Kelas Canva Pro"
                  required
                />
              </label>
              <label className="class-description-field full-field">
                Deskripsi kelas
                <span className="digital-rich-toolbar">
                  <button type="button" onClick={() => applyClassDescriptionTool('bold')}>B</button>
                  <button type="button" onClick={() => applyClassDescriptionTool('underline')}>U</button>
                  <button type="button" onClick={() => applyClassDescriptionTool('heading')}>H</button>
                  <button type="button" onClick={() => applyClassDescriptionTool('align-left')} title="Rata kiri">L</button>
                  <button type="button" onClick={() => applyClassDescriptionTool('align-center')} title="Rata tengah">C</button>
                  <button type="button" onClick={() => applyClassDescriptionTool('align-justify')} title="Justify">J</button>
                  <button type="button" onClick={() => applyClassDescriptionTool('youtube')} title="Tambah video YouTube"><Icon name="youtube" /></button>
                  <button type="button" onClick={() => applyClassDescriptionTool('list')}><Icon name="menu" /></button>
                  <button type="button" onClick={() => applyClassDescriptionTool('link')}><Icon name="link" /></button>
                </span>
                <textarea
                  className="digital-description-editor"
                  data-class-description-editor="true"
                  name="description"
                  value={classForm.description}
                  onChange={handleClassFormChange}
                  placeholder="Jelaskan manfaat, hasil belajar, bonus, dan siapa yang cocok mengikuti kelas ini."
                  rows={12}
                />
                <DescriptionVideoPreview value={classForm.description} />
              </label>
              <label>
                Status
                <select
                  name="status"
                  value={classForm.status}
                  onChange={handleClassFormChange}
                >
                  <option>Draft</option>
                  <option>Onboarding</option>
                  <option>Aktif</option>
                  <option>Arsip</option>
                </select>
              </label>
              <label className="price-field">
                Harga normal (Coret)
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="1000"
                  value={classForm.price}
                  onChange={handleClassFormChange}
                  placeholder="0"
                />
                <span>
                  {Number(classForm.price) > 0
                    ? formatRupiah(classForm.price)
                    : 'Kosong atau 0 = kelas gratis'}
                </span>
              </label>
              <label className="price-field">
                Harga promo (Sale Price)
                <input
                  name="salePrice"
                  type="number"
                  min="0"
                  step="1000"
                  value={classForm.salePrice}
                  onChange={handleClassFormChange}
                  placeholder="0"
                />
                <span>
                  {Number(classForm.salePrice) > 0
                    ? formatRupiah(classForm.salePrice)
                    : 'Kosong atau 0 = tidak menggunakan harga promo'}
                </span>
              </label>
              <label>
                Tombol utama detail kelas
                <select
                  name="purchaseButtonLabel"
                  value={classForm.purchaseButtonLabel}
                  onChange={handleClassFormChange}
                >
                  {[
                    ...(
                      classForm.purchaseButtonLabel &&
                      !classCtaButtonOptions.includes(classForm.purchaseButtonLabel)
                        ? [classForm.purchaseButtonLabel]
                        : []
                    ),
                    ...classCtaButtonOptions,
                  ].map((option) => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <div className="digital-metric-grid">
                <label>
                  Jumlah peserta tampilan
                  <input
                    name="displayStudents"
                    type="number"
                    min="0"
                    value={classForm.displayStudents}
                    onChange={handleClassFormChange}
                    placeholder="Kosong = jumlah asli"
                  />
                </label>
                <label>
                  Rating tampilan
                  <input
                    name="rating"
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={classForm.rating}
                    onChange={handleClassFormChange}
                    placeholder="Kosong = otomatis"
                  />
                </label>
              </div>
              <label className="digital-toggle-row">
                <span>Tampilkan di homepage</span>
                <input
                  name="showOnHomepage"
                  type="checkbox"
                  checked={classForm.showOnHomepage !== false}
                  onChange={handleClassFormChange}
                />
              </label>
              <label className="digital-toggle-row">
                <span>Tampilkan di Kelas Tersedia member</span>
                <input
                  name="showOnMember"
                  type="checkbox"
                  checked={classForm.showOnMember !== false}
                  onChange={handleClassFormChange}
                />
              </label>
              <label>
                Mentor
                <input
                  name="mentor"
                  type="text"
                  value={classForm.mentor}
                  onChange={handleClassFormChange}
                  placeholder="Nama mentor"
                />
              </label>
              <label>
                Kode produk Lynk.id
                <input
                  name="lynkProductKey"
                  type="text"
                  value={classForm.lynkProductKey}
                  onChange={handleClassFormChange}
                  placeholder="Product ID / slug / nama produk Lynk"
                />
                <span>Isi sama dengan ID, slug, atau nama produk di Lynk.id.</span>
              </label>
              <label>
                Kode produk Tripay
                <input
                  name="tripayProductKey"
                  type="text"
                  value={classForm.tripayProductKey}
                  onChange={handleClassFormChange}
                  placeholder="SKU / kode produk Tripay"
                />
                <span>Opsional. Dipakai sebagai SKU item pada invoice Tripay.</span>
              </label>
              <div className="materials-editor">
                <div className="materials-editor-heading">
                  <div>
                    <p className="eyebrow">Materi kelas</p>
                    <h3>Video upload, YouTube, dan tugas</h3>
                  </div>
                  <button className="btn btn-secondary" type="button" onClick={addMaterial}>
                    <Icon name="bookOpen" />
                    Tambah Materi
                  </button>
                </div>
                <div className="material-list-editor">
                  {classForm.materials.map((material, index) => (
                    <article
                      className={
                        draggingMaterialId === material.id
                          ? 'material-list-row dragging'
                          : 'material-list-row'
                      }
                      key={material.id}
                      onDragEnter={(event) => handleMaterialDragEnter(event, material.id)}
                      onDragOver={handleMaterialDragOver}
                      onDrop={(event) => {
                        event.preventDefault()
                        handleMaterialDragEnd()
                      }}
                    >
                      <button
                        className="material-drag-handle"
                        type="button"
                        draggable={classForm.materials.length > 1}
                        aria-label={`Geser materi ${index + 1}`}
                        title="Tahan dan geser untuk mengubah urutan"
                        onDragStart={(event) => handleMaterialDragStart(event, material.id)}
                        onDragEnd={handleMaterialDragEnd}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowUp') {
                            event.preventDefault()
                            moveMaterialByIndex(index, index - 1)
                          }

                          if (event.key === 'ArrowDown') {
                            event.preventDefault()
                            moveMaterialByIndex(index, index + 1)
                          }
                        }}
                        disabled={classForm.materials.length === 1}
                      >
                        <Icon name="menu" />
                      </button>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{material.title || `Materi ${index + 1}`}</strong>
                        <small>
                          {material.videoFile || material.videoUrl || material.imageFile
                            ? 'Media siap'
                            : 'Media belum diisi'} / {(material.promptItems ?? []).length} prompt / {(material.resourceLinks ?? []).length} link
                        </small>
                      </div>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => setActiveMaterialEditorId(material.id)}
                      >
                        <Icon name="fileText" />
                        Edit
                      </button>
                      <button
                        type="button"
                        aria-label={`Hapus materi ${index + 1}`}
                        onClick={() => removeMaterial(material.id)}
                        disabled={classForm.materials.length === 1}
                      >
                        <Icon name="x" />
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  resetClassForm()
                  setIsClassModalOpen(false)
                }}
              >
                Batal
              </button>
              <button className="btn btn-primary" type="submit">
                {editingClassId ? 'Simpan Edit' : 'Tambah Kelas'}
              </button>
            </div>
          </form>
        </div>
      )}
      {isClassModalOpen && activeMaterialEditor && (
        <div className="modal-backdrop material-modal-backdrop" role="presentation">
          <div className="crud-editor material-modal-editor">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Edit materi</p>
                <h2>Materi {activeMaterialEditorIndex + 1}</h2>
              </div>
              <button
                type="button"
                aria-label="Tutup editor materi"
                onClick={() => {
                  setPromptEditorState(null)
                  setActiveMaterialEditorId(null)
                }}
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="crud-form">
              <label>
                Judul materi
                <input
                  type="text"
                  value={activeMaterialEditor.title}
                  onChange={(event) =>
                    handleMaterialChange(
                      activeMaterialEditor.id,
                      'title',
                      event.target.value,
                    )
                  }
                  placeholder="Contoh: Setup workflow desain"
                />
              </label>
              <label>
                Link YouTube / Shorts
                <input
                  type="url"
                  value={activeMaterialEditor.videoUrl}
                  onChange={(event) =>
                    handleMaterialChange(
                      activeMaterialEditor.id,
                      'videoUrl',
                      event.target.value,
                    )
                  }
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </label>
              <div className="rich-text-field full-field">
                <span>Deskripsi materi</span>
                <div className="rich-text-toolbar">
                  <div className="rich-text-toolbar-group">
                    {richTextTools.slice(0, 4).map((tool) => (
                      <button
                        key={tool.command}
                        type="button"
                        title={tool.title}
                        aria-label={tool.title}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() =>
                          applyMaterialRichCommand(activeMaterialEditor.id, tool.command)
                        }
                      >
                        <RichTextToolIcon name={tool.icon} />
                      </button>
                    ))}
                  </div>
                  <div className="rich-text-toolbar-group">
                    {richTextTools.slice(4).map((tool) => (
                      <button
                        key={tool.command}
                        type="button"
                        title={tool.title}
                        aria-label={tool.title}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() =>
                          applyMaterialRichCommand(activeMaterialEditor.id, tool.command)
                        }
                      >
                        <RichTextToolIcon name={tool.icon} />
                      </button>
                    ))}
                  </div>
                  <div className="rich-text-color-group" aria-label="Warna teks">
                    {richTextColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        title={`Warna ${color}`}
                        aria-label={`Warna ${color}`}
                        style={{ '--swatch': color }}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() =>
                          applyMaterialRichCommand(
                            activeMaterialEditor.id,
                            'foreColor',
                            color,
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
                <div
                  ref={materialDescriptionRef}
                  className="rich-text-editor"
                  contentEditable
                  dir="ltr"
                  data-material-description={activeMaterialEditor.id}
                  data-placeholder="Tulis deskripsi materi seperti di Blogger..."
                  suppressContentEditableWarning
                  onFocus={rememberMaterialDescriptionSelection}
                  onKeyUp={rememberMaterialDescriptionSelection}
                  onMouseUp={rememberMaterialDescriptionSelection}
                  onInput={() => handleMaterialDescriptionInput(activeMaterialEditor.id)}
                />
              </div>
              <div className="video-upload-field">
                <label className="upload-control">
                  <Icon name="video" />
                  Upload video
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-m4v"
                    onChange={(event) =>
                      handleMaterialVideoUpload(activeMaterialEditor.id, event)
                    }
                  />
                </label>
                <div className="video-file-meta">
                  <strong>{activeMaterialEditor.videoName || 'Belum ada video upload'}</strong>
                  <small>
                    {activeMaterialEditor.videoFile
                      ? 'Diputar lewat proteksi session member.'
                      : 'Opsional, boleh memakai link YouTube saja.'}
                  </small>
                  {videoUploads[activeMaterialEditor.id] && (
                    <div
                      className={
                        videoUploads[activeMaterialEditor.id].status === 'error'
                          ? 'upload-progress error'
                          : 'upload-progress'
                      }
                    >
                      <span>
                        <i
                          style={{
                            width: `${videoUploads[activeMaterialEditor.id].percent}%`,
                          }}
                        ></i>
                      </span>
                      <small>
                        {videoUploads[activeMaterialEditor.id].status === 'done'
                          ? 'Upload selesai. Jangan lupa simpan kelas.'
                          : videoUploads[activeMaterialEditor.id].status === 'error'
                            ? 'Upload gagal.'
                            : `Mengupload ${videoUploads[activeMaterialEditor.id].percent}%`}
                      </small>
                    </div>
                  )}
                </div>
                {activeMaterialEditor.videoFile && (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      handleMaterialChange(activeMaterialEditor.id, 'videoFile', '')
                      handleMaterialChange(activeMaterialEditor.id, 'videoName', '')
                      handleMaterialChange(activeMaterialEditor.id, 'videoType', '')
                    }}
                  >
                    <Icon name="x" />
                    Lepas Video
                  </button>
                )}
              </div>
              <div className="video-upload-field material-image-upload-field">
                <label className="upload-control">
                  <Icon name="image" />
                  Upload foto
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      handleMaterialImageChange(activeMaterialEditor.id, event)
                    }
                  />
                </label>
                <div className="video-file-meta">
                  <strong>{activeMaterialEditor.imageName || 'Belum ada foto materi'}</strong>
                  <small>
                    {activeMaterialEditor.imageFile
                      ? 'Foto akan tampil di ruang belajar member.'
                      : 'Opsional, boleh dikosongkan jika materi hanya berisi teks atau prompt.'}
                  </small>
                </div>
                {activeMaterialEditor.imageFile && (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      handleMaterialChange(activeMaterialEditor.id, 'imageFile', '')
                      handleMaterialChange(activeMaterialEditor.id, 'imageName', '')
                    }}
                  >
                    <Icon name="x" />
                    Lepas Foto
                  </button>
                )}
              </div>
              <div className="material-resource-editor full-field">
                <div className="resource-editor-heading">
                  <div>
                    <p className="eyebrow">Materi pendukung</p>
                    <h3>PDF dan link referensi</h3>
                  </div>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => addResourceLink(activeMaterialEditor.id)}
                  >
                    <Icon name="arrowRight" />
                    Tambah Link
                  </button>
                </div>
                <div className="pdf-upload-row">
                  <label className="upload-control">
                    <Icon name="fileText" />
                    Upload PDF
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(event) =>
                        handleMaterialPdfChange(activeMaterialEditor.id, event)
                      }
                    />
                  </label>
                  <div className="video-file-meta">
                    <strong>{activeMaterialEditor.pdfName || 'Belum ada PDF'}</strong>
                    <small>PDF akan muncul di bawah video dan bisa diunduh member.</small>
                  </div>
                  {activeMaterialEditor.pdfFile && (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => {
                        handleMaterialChange(activeMaterialEditor.id, 'pdfFile', '')
                        handleMaterialChange(activeMaterialEditor.id, 'pdfName', '')
                      }}
                    >
                      <Icon name="x" />
                      Lepas PDF
                    </button>
                  )}
                </div>
                <div className="resource-link-list">
                  {(activeMaterialEditor.resourceLinks ?? []).map((link, linkIndex) => (
                    <article className="resource-link-editor" key={link.id}>
                      <strong>Link {linkIndex + 1}</strong>
                      <label>
                        Judul link
                        <input
                          type="text"
                          value={link.title}
                          onChange={(event) =>
                            handleResourceLinkChange(
                              activeMaterialEditor.id,
                              link.id,
                              'title',
                              event.target.value,
                            )
                          }
                          placeholder="Contoh: Template tugas Canva"
                        />
                      </label>
                      <label>
                        URL tujuan
                        <input
                          type="url"
                          value={link.url}
                          onChange={(event) =>
                            handleResourceLinkChange(
                              activeMaterialEditor.id,
                              link.id,
                              'url',
                              event.target.value,
                            )
                          }
                          placeholder="https://..."
                        />
                      </label>
                      <button
                        type="button"
                        aria-label={`Hapus link ${linkIndex + 1}`}
                        onClick={() => removeResourceLink(activeMaterialEditor.id, link.id)}
                      >
                        <Icon name="x" />
                      </button>
                    </article>
                  ))}
                </div>
              </div>
              <label className="check-field full-field">
                <input
                  type="checkbox"
                  checked={activeMaterialEditor.requiresTask}
                  onChange={(event) =>
                    handleMaterialChange(
                      activeMaterialEditor.id,
                      'requiresTask',
                      event.target.checked,
                    )
                  }
                />
                Wajib kirim tugas sebelum lanjut
              </label>
              {activeMaterialEditor.requiresTask && (
                <div className="task-image-settings full-field">
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={activeMaterialEditor.allowTaskImage !== false}
                      onChange={(event) =>
                        handleMaterialChange(
                          activeMaterialEditor.id,
                          'allowTaskImage',
                          event.target.checked,
                        )
                      }
                    />
                    Member boleh upload gambar tugas
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={Boolean(activeMaterialEditor.requireTaskImage)}
                      disabled={activeMaterialEditor.allowTaskImage === false}
                      onChange={(event) =>
                        handleMaterialChange(
                          activeMaterialEditor.id,
                          'requireTaskImage',
                          event.target.checked,
                        )
                      }
                    />
                    Gambar tugas wajib diupload
                  </label>
                </div>
              )}
              {activeMaterialEditor.requiresTask && (
                <label className="full-field">
                  Instruksi tugas
                  <textarea
                    value={activeMaterialEditor.taskPrompt}
                    onChange={(event) =>
                      handleMaterialChange(
                        activeMaterialEditor.id,
                        'taskPrompt',
                        event.target.value,
                      )
                    }
                    placeholder="Minta member mengirim link tugas, screenshot, atau catatan praktik."
                    rows="3"
                  ></textarea>
                </label>
              )}
              <div className="prompt-editor full-field">
                <div className="prompt-editor-heading">
                  <div>
                    <p className="eyebrow">Gambar dan prompt</p>
                    <h3>Asset AI prompt ke gambar</h3>
                  </div>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => openPromptEditor(activeMaterialEditor.id)}
                  >
                    <Icon name="image" />
                    Tambah Prompt
                  </button>
                </div>
                {(activeMaterialEditor.promptItems ?? []).length ? (
                  <div className="prompt-list-editor">
                    {(activeMaterialEditor.promptItems ?? []).map((promptItem, promptIndex) => (
                      <article className="prompt-list-row" key={promptItem.id}>
                        <span>{promptIndex + 1}</span>
                        <strong>{promptItem.title || `Prompt ${promptIndex + 1}`}</strong>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => openPromptEditor(activeMaterialEditor.id, promptItem)}
                        >
                          <Icon name="fileText" />
                          Edit
                        </button>
                        <button
                          className="prompt-delete-button"
                          type="button"
                          aria-label={`Hapus prompt ${promptIndex + 1}`}
                          onClick={() =>
                            removePromptItem(activeMaterialEditor.id, promptItem.id)
                          }
                        >
                          <Icon name="x" />
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="prompt-list-empty">
                    <Icon name="fileText" />
                    <p>Belum ada prompt. Klik Tambah Prompt untuk membuat asset baru.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  syncActiveMaterialDescription()
                  setPromptEditorState(null)
                  setActiveMaterialEditorId(null)
                }}
              >
                Selesai Edit Materi
              </button>
            </div>
          </div>
        </div>
      )}
      {promptEditorState && (
        <div className="modal-backdrop prompt-modal-backdrop" role="presentation">
          <form
            className="crud-editor prompt-modal-editor"
            onSubmit={(event) => {
              event.preventDefault()
              savePromptEditor()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Asset prompt</p>
                <h2>{promptEditorState.promptId ? 'Edit prompt' : 'Tambah prompt'}</h2>
              </div>
              <button
                type="button"
                aria-label="Tutup editor prompt"
                onClick={closePromptEditor}
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="prompt-modal-grid">
              <span className="prompt-image-preview prompt-modal-image" aria-hidden="true">
                {promptEditorState.draft.image ? (
                  <img src={promptEditorState.draft.image} alt="" />
                ) : (
                  <Icon name="fileText" />
                )}
              </span>
              <div className="prompt-editor-fields">
                <label>
                  Judul
                  <input
                    type="text"
                    value={promptEditorState.draft.title}
                    onChange={(event) =>
                      handlePromptDraftChange('title', event.target.value)
                    }
                    placeholder="Contoh: Storyboard UGC 30 Detik"
                  />
                </label>
                <label className="upload-control prompt-upload">
                  <Icon name="image" />
                  Upload gambar
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePromptDraftImageChange}
                  />
                </label>
                {promptEditorState.draft.image && (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => handlePromptDraftChange('image', '')}
                  >
                    <Icon name="x" />
                    Lepas Gambar
                  </button>
                )}
              </div>
            </div>
            <div className="prompt-modal-fields">
              <label>
                Prompt
                <textarea
                  value={promptEditorState.draft.prompt}
                  onChange={(event) =>
                    handlePromptDraftChange('prompt', event.target.value)
                  }
                  placeholder="Tulis prompt yang bisa disalin member..."
                  rows="7"
                ></textarea>
              </label>
              <label>
                Petunjuk pemakaian prompt
                <textarea
                  value={promptEditorState.draft.instruction ?? ''}
                  onChange={(event) =>
                    handlePromptDraftChange('instruction', event.target.value)
                  }
                  placeholder="Contoh: ganti bagian [produk] dengan nama produk sendiri sebelum disalin."
                  rows="4"
                ></textarea>
              </label>
            </div>
            <div className="modal-actions">
              {promptEditorState.draft.prompt && (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => handleCopyPrompt(promptEditorState.draft.prompt)}
                >
                  <Icon name="fileText" />
                  Copy
                </button>
              )}
              <button className="btn btn-secondary" type="button" onClick={closePromptEditor}>
                Batal
              </button>
              <button className="btn btn-primary" type="submit">
                Simpan Prompt
              </button>
            </div>
          </form>
        </div>
      )}
      {pendingDeleteClass && (
        <ConfirmDialog
          title="Hapus kelas?"
          message={`Apakah kamu yakin ingin menghapus "${pendingDeleteClass.title}"? Data ini akan hilang dari daftar kelas sesi ini.`}
          confirmLabel="Ya, Hapus"
          cancelLabel="Batal"
          onCancel={() => setPendingDeleteClass(null)}
          onConfirm={confirmDeleteClass}
        />
      )}
      {pendingDeleteMember && (
        <ConfirmDialog
          title="Hapus member?"
          message={`Apakah kamu yakin ingin menghapus member "${pendingDeleteMember.name}"? Akun ini tidak bisa login lagi setelah dihapus.`}
          confirmLabel="Ya, Hapus"
          cancelLabel="Batal"
          onCancel={() => setPendingDeleteMember(null)}
          onConfirm={confirmDeleteMember}
        />
      )}
      {pendingDeleteSupport && (
        <ConfirmDialog
          title="Hapus tiket bantuan?"
          message={`Apakah kamu yakin ingin menghapus pertanyaan dari "${pendingDeleteSupport.memberName}"?`}
          confirmLabel="Ya, Hapus"
          cancelLabel="Batal"
          onCancel={() => setPendingDeleteSupport(null)}
          onConfirm={confirmDeleteSupport}
        />
      )}
    </DashboardShell>
  )
}

export default AdminPage
