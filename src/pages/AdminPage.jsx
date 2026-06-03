import { useEffect, useRef, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
import DashboardShell from '../components/DashboardShell'
import Icon from '../components/Icon'
import MetricCard from '../components/MetricCard'
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
    students: 0,
    status: 'Aktif',
    revenue: '0',
    lynkProductKey: '',
    thumbnail: '',
    mentor: '',
    progress: 0,
    next: '',
    liveAt: '',
    lessons: '',
    materials: [createEmptyMaterial()],
  }
}

function createEmptyMemberForm() {
  return {
    name: '',
    username: '',
    email: '',
    password: '',
    status: 'Aktif',
    classAccessMode: 'all',
    allowedClassIds: [],
  }
}

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
  members = [],
  supportTickets = [],
  submissions = [],
  onClassesChange,
  onCreateMember = async () => {},
  onUpdateMember = async () => {},
  onDeleteMember = async () => {},
  onUpdateSupportTicket = async () => {},
  onDeleteSupportTicket = async () => {},
  onUpdateSubmission = async () => {},
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
  const [memberForm, setMemberForm] = useState(() => createEmptyMemberForm())
  const [editingMemberId, setEditingMemberId] = useState(null)
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false)
  const [pendingDeleteMember, setPendingDeleteMember] = useState(null)
  const [memberPageSize, setMemberPageSize] = useState(10)
  const [memberPage, setMemberPage] = useState(1)
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
  const [draggingMaterialId, setDraggingMaterialId] = useState(null)
  const materialDescriptionRef = useRef(null)
  const descriptionSelectionRef = useRef(null)
  const lastMaterialDragTargetRef = useRef('')

  const onlineMembers = members.filter((item) => item.isOnline)
  const waitingSupportCount = supportTickets.filter(
    (item) => item.status === 'Menunggu',
  ).length
  const pendingSubmissions = submissions.filter(
    (item) => item.status === 'Menunggu Review',
  ).length
  const memberPageCount = Math.max(1, Math.ceil(members.length / memberPageSize))
  const safeMemberPage = Math.min(memberPage, memberPageCount)
  const memberPageStart = members.length ? (safeMemberPage - 1) * memberPageSize : 0
  const memberPageEnd = Math.min(members.length, memberPageStart + memberPageSize)
  const visibleMembers = members.slice(memberPageStart, memberPageEnd)
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

      return {
        ...member,
        submissionCount: memberSubmissions.length,
        pendingSubmissionCount: memberSubmissions.filter(
          (submission) => submission.status === 'Menunggu Review',
        ).length,
        latestSubmissionAt: latestSubmission?.submittedAt || '',
      }
    })
    .filter((member) => member.submissionCount > 0)
    .sort((first, second) => getTimeValue(second.latestSubmissionAt) - getTimeValue(first.latestSubmissionAt))
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
    if (materialDescriptionRef.current && activeMaterialEditor) {
      materialDescriptionRef.current.innerHTML = activeMaterialEditor.description || ''
    }
  }, [activeMaterialEditor, activeMaterialEditorId])

  const resetClassForm = () => {
    setClassForm(createEmptyClassForm())
    setEditingClassId(null)
    setActiveMaterialEditorId(null)
    setDraggingMaterialId(null)
    lastMaterialDragTargetRef.current = ''
  }

  const openCreateClass = () => {
    resetClassForm()
    onMenuChange('manage-classes')
    setIsClassModalOpen(true)
  }

  const handleClassFormChange = (event) => {
    const { name, value } = event.target
    setClassForm((current) => ({
      ...current,
      [name]:
        name === 'students' || name === 'progress'
          ? Number(value)
          : name === 'revenue'
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

  const handlePromptItemChange = (materialId, promptId, field, value) => {
    setClassForm((current) => ({
      ...current,
      materials: current.materials.map((material) =>
        material.id === materialId
          ? {
              ...material,
              promptItems: (material.promptItems ?? []).map((item) =>
                item.id === promptId ? { ...item, [field]: value } : item,
              ),
            }
          : material,
      ),
    }))
  }

  const addPromptItem = (materialId) => {
    setClassForm((current) => ({
      ...current,
      materials: current.materials.map((material) =>
        material.id === materialId
          ? {
              ...material,
              promptItems: [...(material.promptItems ?? []), createEmptyPromptItem()],
            }
          : material,
      ),
    }))
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

  const handlePromptImageChange = async (materialId, promptId, event) => {
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
      handlePromptItemChange(materialId, promptId, 'image', imageUrl)
      onNotify('Gambar prompt berhasil diupload.')
    } catch (error) {
      onNotify(error.message || 'Gambar prompt tidak bisa diupload.')
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
        pdfFile: material.pdfFile ?? '',
        pdfName: material.pdfName ?? '',
        requiresTask: Boolean(material.requiresTask),
        allowTaskImage: material.allowTaskImage !== false,
        requireTaskImage: Boolean(material.requireTaskImage),
        taskPrompt:
          material.taskPrompt.trim() ||
          'Kirim link tugas atau catatan praktik materi ini.',
        promptItems: (material.promptItems ?? [])
          .filter((item) => item.image || item.prompt)
          .map((item, promptIndex) => ({
            id: item.id || `prompt-${Date.now()}-${index}-${promptIndex}`,
            title: item.title.trim() || `Prompt ${promptIndex + 1}`,
            image: item.image,
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
      students: existingClass?.students ?? 0,
      status: classForm.status,
      revenue: formatRupiah(classForm.revenue),
      lynkProductKey: classForm.lynkProductKey.trim(),
      thumbnail: classForm.thumbnail,
      mentor: classForm.mentor.trim() || 'Ibnu Creative',
      progress: existingClass?.progress ?? 0,
      next: existingClass?.next ?? 'Mulai materi pertama',
      liveAt: existingClass?.liveAt ?? '',
      lessons: `${materials.length} materi`,
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
      students: item.students,
      status: item.status,
      revenue: parseRupiahValue(item.revenue),
      lynkProductKey: item.lynkProductKey ?? '',
      thumbnail: item.thumbnail ?? '',
      mentor: item.mentor ?? '',
      progress: item.progress ?? 0,
      next: item.next ?? '',
      liveAt: item.liveAt ?? '',
      lessons: item.lessons ?? '',
      materials: item.materials?.length
        ? item.materials.map((material) => ({
            ...material,
            description: material.description ?? '',
            videoFile: material.videoFile ?? '',
            videoName: material.videoName ?? '',
            videoType: material.videoType ?? '',
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
        'Revenue',
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
          item.revenue,
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
              <span role="columnheader">Revenue</span>
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
                  </span>
                </span>
                <span data-label="Peserta" role="cell">
                  {item.students}
                </span>
                <span data-label="Status" role="cell">
                  <mark>{item.status}</mark>
                </span>
                <span data-label="Revenue" role="cell">
                  {item.revenue}
                </span>
                <span className="row-actions" data-label="Aksi" role="cell">
                  <button type="button" onClick={() => handleEditClass(item)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => setPendingDeleteClass(item)}>
                    Hapus
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeMenu === 'students' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Peserta</p>
              <h2>Kelola member</h2>
            </div>
            <button className="btn btn-primary" type="button" onClick={openCreateMember}>
              <Icon name="users" />
              Tambah Member
            </button>
          </div>
          <div className="member-pagination-bar">
            <p>
              Menampilkan{' '}
              <strong>
                {members.length ? memberPageStart + 1 : 0}-{memberPageEnd}
              </strong>{' '}
              dari <strong>{members.length}</strong> member
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
          <div className="admin-table member-table" role="table" aria-label="Data member">
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
            {!members.length && (
              <article className="empty-state table-empty">
                <Icon name="users" />
                <h3>Belum ada member</h3>
                <p>Tambahkan member pertama agar bisa login ke dashboard member.</p>
              </article>
            )}
          </div>
          {members.length > memberPageSize && (
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

      {activeMenu === 'submissions' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Review tugas</p>
              <h2>{pendingSubmissions} tugas menunggu feedback</h2>
            </div>
          </div>
          <div className="admin-table submission-table" role="table" aria-label="Member pengirim tugas">
            <div className="table-row table-head" role="row">
              <span role="columnheader">Member</span>
              <span role="columnheader">Tugas</span>
              <span role="columnheader">Menunggu</span>
              <span role="columnheader">Terakhir kirim</span>
              <span role="columnheader">Aksi</span>
            </div>
            {submissionMembers.map((member) => (
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
                    Buka Tugas
                  </button>
                </span>
              </div>
            ))}
            {!submissionMembers.length && (
              <article className="empty-state table-empty">
                <Icon name="fileText" />
                <h3>Belum ada tugas</h3>
                <p>Tugas yang dikirim member dari halaman materi akan muncul di sini.</p>
              </article>
            )}
          </div>
          {selectedSubmissionMember && (
            <div className="submission-member-detail">
              <div className="panel-heading compact-heading">
                <div>
                  <p className="eyebrow">Tugas per materi</p>
                  <h3>{selectedSubmissionMember.name}</h3>
                </div>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setSelectedSubmissionMemberId('')}
                >
                  <Icon name="x" />
                  Tutup
                </button>
              </div>
              <div className="submission-filter-bar">
                <div className="filter-button-group" aria-label="Filter status tugas">
                  {submissionStatusOptions.map((option) => (
                    <button
                      className={
                        submissionStatusFilter === option.id ? 'active' : ''
                      }
                      type="button"
                      key={option.id}
                      onClick={() => setSubmissionStatusFilter(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
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
                className="admin-table submission-table member-submission-table"
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
          )}
        </section>
      )}

      {activeMenu === 'certificates' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Sertifikat</p>
              <h2>Kelola kelulusan member</h2>
            </div>
          </div>
          <div className="menu-card-grid">
            <article className="action-card">
              <Icon name="certificate" />
              <h3>Sertifikat siap review</h3>
              <p>
                {Math.max(0, submissions.length - pendingSubmissions)} tugas sudah
                melewati review mentor.
              </p>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setActionStatus('Data sertifikat member dibuka.')
                  onNotify('Membuka kelola sertifikat.')
                }}
              >
                <Icon name="arrowRight" />
                Kelola Sertifikat
              </button>
            </article>
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
      {viewingSubmission && (
        <div className="modal-backdrop" role="presentation">
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
        <div className="modal-backdrop" role="presentation">
          <form className="crud-editor" onSubmit={handleSubmitClass}>
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
            <div className="crud-form modal-form">
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
              <label className="revenue-field">
                Revenue
                <input
                  name="revenue"
                  type="number"
                  min="0"
                  step="1000"
                  value={classForm.revenue}
                  onChange={handleClassFormChange}
                  placeholder="0"
                />
                <span>{formatRupiah(classForm.revenue)}</span>
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
                          {material.videoFile || material.videoUrl ? 'Video siap' : 'Video belum diisi'} / {(material.promptItems ?? []).length} prompt / {(material.resourceLinks ?? []).length} link
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
                onClick={() => setActiveMaterialEditorId(null)}
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
                    onClick={() => addPromptItem(activeMaterialEditor.id)}
                  >
                    <Icon name="image" />
                    Tambah Prompt
                  </button>
                </div>
                <div className="prompt-editor-track">
                  {(activeMaterialEditor.promptItems ?? []).map((promptItem, promptIndex) => (
                    <article className="prompt-editor-card" key={promptItem.id}>
                      <div className="prompt-editor-title">
                        <span>{promptIndex + 1}</span>
                        <strong>{promptItem.title || `Prompt ${promptIndex + 1}`}</strong>
                        <button
                          type="button"
                          aria-label={`Hapus prompt ${promptIndex + 1}`}
                          onClick={() =>
                            removePromptItem(activeMaterialEditor.id, promptItem.id)
                          }
                        >
                          <Icon name="x" />
                        </button>
                      </div>
                      <span className="prompt-image-preview" aria-hidden="true">
                        {promptItem.image ? <img src={promptItem.image} alt="" /> : <Icon name="fileText" />}
                      </span>
                      <div className="prompt-editor-fields">
                        <label>
                          Judul
                          <input
                            type="text"
                            value={promptItem.title}
                            onChange={(event) =>
                              handlePromptItemChange(
                                activeMaterialEditor.id,
                                promptItem.id,
                                'title',
                                event.target.value,
                              )
                            }
                            placeholder="Contoh: Poster cyberpunk"
                          />
                        </label>
                        <label className="upload-control prompt-upload">
                          <Icon name="image" />
                          Upload gambar
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) =>
                              handlePromptImageChange(
                                activeMaterialEditor.id,
                                promptItem.id,
                                event,
                              )
                            }
                          />
                        </label>
                        <label>
                          Prompt
                          <textarea
                            value={promptItem.prompt}
                            onChange={(event) =>
                              handlePromptItemChange(
                                activeMaterialEditor.id,
                                promptItem.id,
                                'prompt',
                                event.target.value,
                              )
                            }
                            placeholder="Tulis prompt yang bisa disalin member..."
                            rows="4"
                          ></textarea>
                        </label>
                        {promptItem.prompt && (
                          <div className="prompt-actions">
                            <button
                              className="btn btn-secondary"
                              type="button"
                              onClick={() => handleCopyPrompt(promptItem.prompt)}
                            >
                              <Icon name="fileText" />
                              Copy
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  syncActiveMaterialDescription()
                  setActiveMaterialEditorId(null)
                }}
              >
                Selesai Edit Materi
              </button>
            </div>
          </div>
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
