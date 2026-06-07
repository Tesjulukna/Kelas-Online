import { useEffect, useState } from 'react'
import ConfirmDialog from './components/ConfirmDialog'
import Icon from './components/Icon'
import ProfileEditor from './components/ProfileEditor'
import ProfileMenu from './components/ProfileMenu'
import AdminPage from './pages/AdminPage'
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
const classesApiPath = '/api/classes'
const membersApiPath = '/api/members'
const supportApiPath = '/api/support'
const submissionsApiPath = '/api/submissions'
const settingsApiPath = '/api/settings'
const backupApiPath = '/api/backup'
const loginApiPath = '/api/login'
const logoutApiPath = '/api/logout'
const profileApiPath = '/api/profile'
const allowedRoles = ['member', 'admin']
const pagePaths = {
  home: '/',
  login: '/login',
  member: '/member',
  admin: '/admin',
}
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

  return 'home'
}

function getInitialPage(session) {
  if (typeof window === 'undefined') {
    return session?.role ?? 'home'
  }

  const page = getPageFromPath(window.location.pathname)

  if (session?.role && (page === 'login' || (page !== 'home' && page !== session.role))) {
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
        'students',
        'submissions',
        'certificates',
        'support',
        'website-settings',
      ]
    : ['overview', 'my-courses', 'certificates', 'support']

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

function cleanSessionToken(value) {
  return String(value ?? '').replace(/[^a-f0-9]/gi, '').slice(0, 128)
}

function cleanLongText(value, maxLength = 260) {
  return String(value).trim().replace(/[<>]/g, '').slice(0, maxLength)
}

function cleanPromptText(value) {
  return String(value ?? '').split(String.fromCharCode(0)).join('')
}

function cleanRichHtml(value, maxLength = 6000) {
  const safeHtml = String(value ?? '').slice(0, maxLength)

  if (typeof window === 'undefined' || !safeHtml) {
    return ''
  }

  const template = document.createElement('template')
  template.innerHTML = safeHtml
  const allowedTags = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI', 'SPAN', 'DIV'])
  const allowedStyles = new Set(['color', 'text-align'])

  template.content.querySelectorAll('*').forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(document.createTextNode(node.textContent ?? ''))
      return
    }

    ;[...node.attributes].forEach((attribute) => {
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
    const saved = JSON.parse(window.sessionStorage.getItem(sessionKey))

    if (
      !saved ||
      !allowedRoles.includes(saved.role) ||
      typeof saved.name !== 'string' ||
      typeof saved.username !== 'string' ||
      typeof saved.userId !== 'string'
    ) {
      window.sessionStorage.removeItem(sessionKey)
      return null
    }

    return {
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
  } catch {
    window.sessionStorage.removeItem(sessionKey)
    return null
  }
}

function seedClasses() {
  return adminClassSeed.map((item, index) => ({
    ...item,
    id: `admin-class-${index + 1}`,
    thumbnail: item.thumbnail ?? '',
    mentor: item.mentor ?? 'Ibnu Creative',
    progress: item.progress ?? [72, 46, 88][index] ?? 35,
    next: item.next ?? 'Lanjutkan modul berikutnya',
    liveAt: item.liveAt ?? 'Jumat, 29 Mei 2026, 20.00 WITA',
    lessons: item.lessons ?? `${16 + index * 4} materi`,
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
        students: Math.max(0, Number(item.students) || 0),
        status: cleanText(item.status || 'Draft'),
        revenue: cleanText(item.revenue || 'Rp 0'),
        lynkProductKey: cleanLongText(item.lynkProductKey || '', 160),
        thumbnail: cleanAvatar(item.thumbnail),
        mentor: cleanText(item.mentor || 'Ibnu Creative'),
        progress: Math.min(100, Math.max(0, Number(item.progress) || 0)),
        next: cleanText(item.next || 'Lanjutkan modul berikutnya'),
        liveAt: cleanText(item.liveAt || 'Jadwal menyusul'),
        lessons: cleanText(item.lessons || '12 materi'),
        materials: cleanMaterials(item.materials, classId, item.title),
      }
    })
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

function App() {
  const [session, setSession] = useState(() => readSession())
  const [page, setPage] = useState(() => getInitialPage(readSession()))
  const [activeSection, setActiveSection] = useState(() => getInitialSection())
  const [loginUsername, setLoginUsername] = useState(
    () => readSession()?.username ?? '',
  )
  const [loginPassword, setLoginPassword] = useState('')
  const [activeMemberMenu, setActiveMemberMenu] = useState(() =>
    getDashboardMenuFromUrl('member'),
  )
  const [activeAdminMenu, setActiveAdminMenu] = useState(() =>
    getDashboardMenuFromUrl('admin'),
  )
  const [classes, setClasses] = useState(() => readClasses())
  const [websiteSettings, setWebsiteSettings] = useState(() => readWebsiteSettings())
  const [members, setMembers] = useState([])
  const [supportTickets, setSupportTickets] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [isClassesLoaded, setIsClassesLoaded] = useState(false)
  const [isWebsiteSettingsLoaded, setIsWebsiteSettingsLoaded] = useState(false)
  const [isDashboardMenuOpen, setIsDashboardMenuOpen] = useState(false)
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false)
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [memberFocusTarget, setMemberFocusTarget] = useState(null)
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
    const handlePopState = () => {
      const currentSession = readSession()
      let nextPage = getPageFromPath(window.location.pathname)

      if (
        currentSession?.role &&
        (nextPage === 'login' || (nextPage !== 'home' && nextPage !== currentSession.role))
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
    return () => window.removeEventListener('popstate', handlePopState)
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
    if (!session) {
      return undefined
    }

    let isCurrent = true

    const syncPeopleData = () => {
      const requests = Promise.all([
        fetchStoredMembers(),
        fetchStoredSupportTickets(session),
        fetchStoredSubmissions(session),
      ])

      requests
        .then(([nextMembers, nextSupportTickets, nextSubmissions]) => {
          if (!isCurrent) {
            return
          }

          setMembers(nextMembers)
          if (session.role === 'member') {
            const memberAccount = nextMembers.find((member) => member.id === session.userId)
            const nextSession = syncSessionWithMemberAccount(session, memberAccount)

            if (JSON.stringify(nextSession) !== JSON.stringify(session)) {
              window.sessionStorage.setItem(sessionKey, JSON.stringify(nextSession))
              setSession(nextSession)
            }
          }
          setSupportTickets(nextSupportTickets)
          setSubmissions(nextSubmissions)
        })
        .catch(() => {
          if (isCurrent) {
            setMembers((current) => current)
            setSupportTickets((current) => current)
            setSubmissions((current) => current)
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

  const goToDashboard = () => {
    if (!session) {
      goToLogin()
      return
    }

    navigateToPage(session.role)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleLogin = async (event) => {
    event.preventDefault()

    try {
      const data = await requestJson(loginApiPath, {
        method: 'POST',
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      })
      const nextSession = data.session

      if (!nextSession || !allowedRoles.includes(nextSession.role)) {
        throw new Error('Session login tidak valid.')
      }

      window.sessionStorage.setItem(sessionKey, JSON.stringify(nextSession))
      setSession(nextSession)
      setSeenNotificationIds(readSeenNotifications(nextSession.userId))
      setLoginUsername(nextSession.username)
      setLoginPassword('')
      setActiveMemberMenu('overview')
      setActiveAdminMenu('overview')
      navigateToPage(nextSession.role, { replace: true })
      showNotice(`Berhasil masuk sebagai ${nextSession.role}.`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      showNotice(error.message || 'Login gagal.')
    }
  }

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
    window.sessionStorage.removeItem(sessionKey)
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

        window.sessionStorage.setItem(sessionKey, JSON.stringify(savedSession))
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

  const refreshDataAfterRestore = async () => {
    const [
      nextClasses,
      nextMembers,
      nextSupportTickets,
      nextSubmissions,
      nextSettings,
    ] = await Promise.all([
      fetchStoredClasses(),
      fetchStoredMembers(),
      fetchStoredSupportTickets(session),
      fetchStoredSubmissions(session),
      fetchStoredWebsiteSettings(),
    ])

    setClasses(nextClasses)
    setMembers(nextMembers)
    setSupportTickets(nextSupportTickets)
    setSubmissions(nextSubmissions)
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

  const handleUpdateSubmission = async (submissionData) => {
    const data = await requestJson(submissionsApiPath, {
      method: 'PUT',
      body: JSON.stringify(submissionData),
    })

    return applySubmissionsResponse(data)
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

  const currentMember = session?.role === 'member'
    ? members.find((member) => member.id === session.userId)
    : null
  const currentMemberAccess = session?.role === 'member'
    ? currentMember
      ? currentMember.allowedClassIds
      : session.allowedClassIds
    : null
  const memberClasses = session?.role === 'member' && Array.isArray(currentMemberAccess)
    ? classes.filter((course) => currentMemberAccess.includes(course.id))
    : classes

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
        {page === 'home' && (
          <HomePage
            isLoggedIn={Boolean(session)}
            onLogin={goToDashboard}
            onExplore={goToHomeSection}
            classes={classes}
            settings={websiteSettings}
          />
        )}
        {page === 'login' && (
          <LoginPage
            username={loginUsername}
            onUsernameChange={setLoginUsername}
            password={loginPassword}
            onPasswordChange={setLoginPassword}
            onSubmit={handleLogin}
          />
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
              supportTickets={supportTickets}
              submissions={submissions}
              focusTarget={memberFocusTarget}
              activeMenu={activeMemberMenu}
              onMenuChange={(menuId) => navigateToDashboardMenu('member', menuId)}
              isMenuOpen={isDashboardMenuOpen}
              onCloseMenu={() => setIsDashboardMenuOpen(false)}
              onNotify={showNotice}
              onCreateSupportTicket={handleCreateSupportTicket}
              onReplySupportTicket={handleReplySupportTicket}
              onCreateSubmission={handleCreateSubmission}
            />
          ) : (
            <LoginPage
              username={loginUsername}
              onUsernameChange={setLoginUsername}
              password={loginPassword}
              onPasswordChange={setLoginPassword}
              onSubmit={handleLogin}
            />
          ))}
        {page === 'admin' &&
          (session?.role === 'admin' ? (
            <AdminPage
              loginName={session.name}
              avatar={session.avatar}
              sessionToken={session.token}
              classes={classes}
              members={members}
              supportTickets={supportTickets}
              submissions={submissions}
              websiteSettings={websiteSettings}
              onClassesChange={handleClassesChange}
              onWebsiteSettingsChange={handleWebsiteSettingsChange}
              onDownloadBackup={handleDownloadBackup}
              onRestoreBackup={handleRestoreBackup}
              onCreateMember={handleCreateMember}
              onUpdateMember={handleUpdateMember}
              onDeleteMember={handleDeleteMember}
              onUpdateSupportTicket={handleUpdateSupportTicket}
              onDeleteSupportTicket={handleDeleteSupportTicket}
              onUpdateSubmission={handleUpdateSubmission}
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
            />
          ))}
      </main>
      {(page === 'home' || page === 'login') && (
        <SiteFooter
          onHomeSection={goToHomeSection}
          onLogin={session ? goToDashboard : goToLogin}
          isLoggedIn={Boolean(session)}
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

function SiteFooter({ onHomeSection, onLogin, isLoggedIn, settings }) {
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

        <nav className="footer-links" aria-label="Navigasi footer">
          {safeSettings.footer.links.map((item) => (
            <button
              type="button"
              onClick={() => onHomeSection(item.sectionId)}
              key={item.sectionId}
            >
              {item.label}
            </button>
          ))}
          <button type="button" onClick={onLogin}>
            {isLoggedIn
              ? safeSettings.header.dashboardLabel
              : safeSettings.header.loginLabel}
          </button>
        </nav>

        <div className="footer-contact">
          {safeSettings.footer.contactItems.map((item, index) => (
            <span key={`${item.text}-${index}`}>
              <Icon name={item.icon} />
              {item.text}
            </span>
          ))}
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
          : 'site-header'
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
          {notifications.slice(0, 8).map((notification) => (
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
          {!notifications.length && (
            <p className="notification-empty">Belum ada notifikasi.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default App
