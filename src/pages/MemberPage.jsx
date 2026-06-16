import { useCallback, useEffect, useState } from 'react'
import DashboardShell from '../components/DashboardShell'
import Icon from '../components/Icon'
import MetricCard from '../components/MetricCard'
import { memberMenuItems } from '../data/platformData'
import { cleanWebsiteSettings, defaultWebsiteSettings } from '../data/websiteSettings'
import { uploadStorageFile } from '../lib/storageUpload'

const taskStorageKey = 'ibnucreative.memberTasks.v1'
const courseProgressStorageKey = 'ibnucreative.memberCourseProgress.v1'
const expiredPaymentNoticeKey = 'ibnucreative.expiredPaymentNotices.v1'
const uploadFileApiPath = '/api/upload-file'

function scopedStorageKey(baseKey, userId = '') {
  return userId ? `${baseKey}.${userId}` : baseKey
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

function formatRupiah(value) {
  const amount = Math.max(0, Math.round(Number(value) || 0))

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
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
  submissions = [],
  payments = [],
  activeMenu,
  onMenuChange,
  isMenuOpen,
  onCloseMenu,
  onNotify = () => {},
  onCreateSupportTicket = async () => {},
  onReplySupportTicket = async () => {},
  onCreateSubmission = async () => {},
  onCreateTripayCheckout = async () => {},
  focusTarget = null,
  websiteSettings = defaultWebsiteSettings,
}) {
  const safeWebsiteSettings = cleanWebsiteSettings(websiteSettings)
  const tripayPaymentMethods = safeWebsiteSettings.paymentMethods
  const courses = classes.filter((course) => course.status === 'Aktif')
  const allActiveCourses = allClasses.filter((course) => course.status === 'Aktif')
  const activeDigitalProducts = digitalProducts.filter((product) => product.status === 'Aktif')
  const ownedDigitalProductIds = new Set(digitalProductAccess.map((access) => access.productId))
  const accessibleClassIds = Array.isArray(allowedClassIds)
    ? new Set(allowedClassIds)
    : new Set(allActiveCourses.map((course) => course.id))
  const availableCourses = allActiveCourses.filter((course) => !accessibleClassIds.has(course.id))
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [activeMaterialIndex, setActiveMaterialIndex] = useState(0)
  const [taskDraft, setTaskDraft] = useState('')
  const [taskAttachment, setTaskAttachment] = useState(null)
  const [submittedTasks, setSubmittedTasks] = useState(() => readSubmittedTasks(userId))
  const [courseProgress, setCourseProgress] = useState(() => readCourseProgress(userId))
  const [supportMessage, setSupportMessage] = useState('')
  const [supportSubject, setSupportSubject] = useState('')
  const [supportDraft, setSupportDraft] = useState('')
  const [supportReplyDrafts, setSupportReplyDrafts] = useState({})
  const [previewImage, setPreviewImage] = useState(null)
  const [activePromptInstruction, setActivePromptInstruction] = useState(null)
  const [checkoutClassId, setCheckoutClassId] = useState('')
  const [paymentMethodCourse, setPaymentMethodCourse] = useState(null)
  const [selectedPaymentMethodCode, setSelectedPaymentMethodCode] = useState('')
  const [isPaymentTermsAccepted, setIsPaymentTermsAccepted] = useState(false)
  const [isChangingPaymentMethod, setIsChangingPaymentMethod] = useState(false)
  const [dismissedExpiredPayments, setDismissedExpiredPayments] = useState(() =>
    readDismissedExpiredPaymentNotices(userId),
  )
  const completedCourses = courses.filter((course) => getCourseProgress(course) >= 100)
  const selectedCourse = courses.find((course) => course.id === selectedCourseId)
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
  const isActiveTaskSubmitted =
    Boolean(submittedTasks[activeTaskKey]) || Boolean(activeServerSubmission)
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

    return item.itemType === 'digital_product' && salePrice > 0 ? salePrice : normalPrice
  }
  const selectedPaymentMethod = tripayPaymentMethods.find(
    (method) => method.code === selectedPaymentMethodCode,
  )
  const paymentModalAmount = getCheckoutAmount(paymentMethodCourse)
  const paymentModalFee = getPaymentMethodFee(selectedPaymentMethod, paymentModalAmount)
  const paymentModalTotal = paymentModalAmount + paymentModalFee
  const activePaymentsByClass = new Map()
  const expiredPaymentsByClass = new Map()
  const activePaymentsByProduct = new Map()
  const expiredPaymentsByProduct = new Map()

  payments
    .filter((payment) => payment.source === 'tripay')
    .forEach((payment) => {
      const status = String(payment.status || '').toLowerCase()
      const isProductPayment = payment.itemType === 'digital_product' || Boolean(payment.productId)
      const productId = payment.productId || String(payment.classId || '').replace(/^product:/, '')
      const pendingMap = isProductPayment ? activePaymentsByProduct : activePaymentsByClass
      const expiredMap = isProductPayment ? expiredPaymentsByProduct : expiredPaymentsByClass
      const key = isProductPayment ? productId : payment.classId
      const currentPending = pendingMap.get(key)
      const currentExpired = expiredMap.get(key)

      if (
        ['pending', 'unpaid', 'waiting', 'callback'].includes(status) &&
        payment.checkoutUrl &&
        !payment.isExpired
      ) {
        if (
          !currentPending ||
          Date.parse(payment.createdAt || '') > Date.parse(currentPending.createdAt || '')
        ) {
          pendingMap.set(key, payment)
        }
      }

      if (status === 'expired' || payment.isExpired) {
        if (
          !currentExpired ||
          Date.parse(payment.createdAt || '') > Date.parse(currentExpired.createdAt || '')
        ) {
          expiredMap.set(key, payment)
        }
      }
    })

  const rememberCoursePosition = useCallback((courseId, materialIndex) => {
    setCourseProgress((current) => ({
      ...current,
      [courseId]: Math.max(Number(current[courseId]) || 0, materialIndex),
    }))
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
      return 0
    }

    const submittedRequiredIds = new Set(
      submissions
      .filter((submission) => submission.classId === course.id)
      .map((submission) => submission.materialId)
      .filter((materialId) =>
        requiredMaterials.some((material) => material.id === materialId),
      ),
    )

    return Math.min(100, Math.round((submittedRequiredIds.size / requiredCount) * 100))
  }

  const handleDashboardMenuChange = (menuId) => {
    if (menuId !== 'my-courses') {
      setSelectedCourseId(null)
      setActiveMaterialIndex(0)
    }

    onMenuChange(menuId)
  }

  const isMaterialUnlocked = (index) => {
    if (!selectedCourse) {
      return false
    }

    return materials.slice(0, index).every((material) => {
      if (!material.requiresTask) {
        return true
      }

      return Boolean(
        submittedTasks[getTaskKey(selectedCourse.id, material.id)] ||
          submissions.find(
            (item) => item.classId === selectedCourse.id && item.materialId === material.id,
          ),
      )
    })
  }

  const handleOpenCourse = (course) => {
    setSelectedCourseId(course.id)
    setActiveMaterialIndex(0)
    setTaskDraft('')
    setTaskAttachment(null)
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
      await onCreateSubmission({
        classId: selectedCourse.id,
        classTitle: selectedCourse.title,
        materialId: activeMaterial.id,
        materialTitle: activeMaterial.title,
        materialIndex: currentMaterialIndex,
        materialCount: materials.length,
        answer: taskDraft.trim() || `Upload gambar tugas: ${taskAttachment.name}`,
        attachmentUrl: isTaskImageAllowed ? (taskAttachment?.url ?? '') : '',
        attachmentName: isTaskImageAllowed ? (taskAttachment?.name ?? '') : '',
      })
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
      onNotify('Tugas terkirim. Materi berikutnya sudah terbuka.')
    } catch (error) {
      onNotify(error.message || 'Tugas tidak bisa dikirim.')
    }
  }

  const handlePreviousMaterial = () => {
    if (!hasPreviousMaterial) {
      return
    }

    setActiveMaterialIndex(currentMaterialIndex - 1)
    setTaskDraft('')
    setTaskAttachment(null)
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

  const handleDownloadCertificate = () => {
    onNotify('Sertifikat demo siap diunduh dari backend produksi.')
  }

  const handleStartCheckout = async (item, paymentMethod = '', { forceNewPayment = false, itemType = 'class' } = {}) => {
    const price = getCheckoutAmount({ ...item, itemType })

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
        handleDashboardMenuChange(itemType === 'digital_product' ? 'digital-products' : 'my-courses')
        return
      }

      if (data.alreadyHasAccess) {
        onNotify(itemType === 'digital_product'
          ? 'Produk digital sudah dimiliki.'
          : 'Akses kelas sudah aktif. Silakan buka Kelas Saya.')
        handleDashboardMenuChange(itemType === 'digital_product' ? 'digital-products' : 'my-courses')
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
  }

  const openPaymentMethodPopup = (item, { forceNewPayment = false, itemType = 'class' } = {}) => {
    const price = getCheckoutAmount({ ...item, itemType })
    const pendingPayment = itemType === 'digital_product'
      ? activePaymentsByProduct.get(item.id)
      : activePaymentsByClass.get(item.id)

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
  }

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
      menuItems={memberMenuItems}
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
                      {isActiveTaskSubmitted ? (
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
                        </div>
                      ) : (
                        <>
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
                        {!isActiveTaskSubmitted && (
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={handleSubmitTask}
                          >
                            <Icon name="message" />
                            Kirim Tugas
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
                    {course.mentor} / {course.lessons}
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
              const price = Math.max(0, Math.round(Number(course.price) || 0))
              const isCheckingOut = checkoutClassId === course.id
              const pendingPayment = activePaymentsByClass.get(course.id)
              const expiredPayment = expiredPaymentsByClass.get(course.id)
              const showExpiredNotice =
                expiredPayment && !dismissedExpiredPayments.includes(expiredPayment.id)
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
                      {course.mentor} / {course.lessons}
                    </p>
                    <span className="member-class-next">{accessNote}</span>
                  </span>
                  <span className="available-class-price">
                    <small>{price ? 'Harga kelas' : 'Kelas gratis'}</small>
                    <strong>{price ? formatRupiah(price) : 'Gratis'}</strong>
                  </span>
                  <span className="available-payment-action">
                    {showExpiredNotice && (
                      <span className="expired-payment-notice">
                        <span>Pembayaran sebelumnya expired.</span>
                        <button
                          type="button"
                          aria-label="Tutup pemberitahuan pembayaran expired"
                          onClick={() => dismissExpiredPaymentNotice(expiredPayment.id)}
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
                <Icon name="wallet" />
                Buat Pembayaran
              </button>
            </div>
          </section>
        </div>
      )}

      {activeMenu === 'digital-products' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Produk digital</p>
              <h2>Produk digital</h2>
            </div>
          </div>
          <div className="learning-list">
            {activeDigitalProducts.map((product) => {
              const normalPrice = Math.max(0, Math.round(Number(product.price) || 0))
              const salePrice = Math.max(0, Math.round(Number(product.salePrice) || 0))
              const price = salePrice || normalPrice
              const isOwned = ownedDigitalProductIds.has(product.id)
              const pendingPayment = activePaymentsByProduct.get(product.id)
              const expiredPayment = expiredPaymentsByProduct.get(product.id)
              const showExpiredNotice =
                expiredPayment && !dismissedExpiredPayments.includes(expiredPayment.id)
              const isCheckingOut = checkoutClassId === `digital_product:${product.id}`
              let buttonLabel = isOwned
                ? 'Akses Produk'
                : pendingPayment
                  ? 'Selesaikan Pembayaran'
                  : price
                    ? product.purchaseButtonLabel || 'Beli Produk'
                    : 'Ambil Gratis'

              if (isCheckingOut) {
                buttonLabel = price ? 'Membuat invoice...' : 'Membuka akses...'
              }

              return (
                <article className="member-class-card available-class-card" key={product.id}>
                  <span className="member-class-visual">
                    {product.thumbnail ? (
                      <img src={product.thumbnail} alt="" />
                    ) : (
                      <Icon name="download" />
                    )}
                    <span>{product.status}</span>
                  </span>
                  <span className="member-class-body">
                    <h3>{product.title}</h3>
                    <p>{product.fileName || 'Produk digital'}</p>
                    <span className="member-class-next">
                      {product.description || 'Akses produk dikirim otomatis setelah pembayaran sukses.'}
                    </span>
                  </span>
                  <span className="available-class-price">
                    <small>{price ? 'Harga produk' : 'Produk gratis'}</small>
                    <strong>{price ? formatRupiah(price) : 'Gratis'}</strong>
                    {salePrice > 0 && normalPrice > salePrice && (
                      <small className="struck-price">{formatRupiah(normalPrice)}</small>
                    )}
                  </span>
                  <span className="available-payment-action">
                    {showExpiredNotice && (
                      <span className="expired-payment-notice">
                        <span>Pembayaran sebelumnya expired.</span>
                        <button
                          type="button"
                          aria-label="Tutup pemberitahuan pembayaran expired"
                          onClick={() => dismissExpiredPaymentNotice(expiredPayment.id)}
                        >
                          <Icon name="x" />
                        </button>
                      </span>
                    )}
                    <button
                      className="btn btn-primary member-class-button"
                      type="button"
                      disabled={isCheckingOut}
                      onClick={() => {
                        if (isOwned && product.fileUrl) {
                          window.open(product.fileUrl, '_blank', 'noopener,noreferrer')
                          return
                        }

                        openPaymentMethodPopup(product, { itemType: 'digital_product' })
                      }}
                    >
                      <Icon name={isOwned ? 'download' : 'wallet'} />
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
            {!activeDigitalProducts.length && (
              <article className="empty-state">
                <Icon name="download" />
                <h3>Belum ada produk digital</h3>
                <p>Produk digital akan muncul setelah admin mengaktifkannya.</p>
              </article>
            )}
          </div>
        </section>
      )}

      {activeMenu === 'certificates' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Sertifikat</p>
              <h2>Sertifikat proyek</h2>
            </div>
          </div>
          <div className="menu-card-grid">
            {(completedCourses.length ? completedCourses : courses.slice(0, 2)).map((course) => (
              <article className="action-card" key={course.id}>
                {course.thumbnail ? (
                  <img className="certificate-thumb" src={course.thumbnail} alt="" />
                ) : (
                  <Icon name="certificate" />
                )}
                <h3>{course.title}</h3>
                <p>Sertifikat siap setelah seluruh tugas final disetujui mentor.</p>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={handleDownloadCertificate}
                >
                  <Icon name="arrowRight" />
                  Unduh
                </button>
              </article>
            ))}
            {!courses.length && (
              <article className="action-card">
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
