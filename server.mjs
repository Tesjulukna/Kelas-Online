import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanWebsiteSettings, defaultWebsiteSettings } from './src/data/websiteSettings.js'
import {
  convertYoutubeLinesToEmbeds,
  descriptionHtmlToEditorText,
} from './src/utils/richDescription.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
const dataFile = path.join(dataDir, 'data.json')
const backupFile = path.join(dataDir, 'data.backup.json')
const tempFile = path.join(dataDir, 'data.tmp.json')
const port = Number(process.env.API_PORT) || 5176
const maxBodySize = 64 * 1024 * 1024
const localOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5176',
])

function cleanText(value, maxLength = 80) {
  return String(value ?? '')
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, maxLength)
}

function cleanPromptText(value) {
  return String(value ?? '').replace(/\u0000/g, '')
}

function cleanRichHtml(value, maxLength = 6000) {
  const safeText = descriptionHtmlToEditorText(value)
    .slice(0, maxLength)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/<(?!\/?(p|br|strong|b|em|i|ul|ol|li|span|div)\b)[^>]*>/gi, '')
    .replace(/style="([^"]*)"/gi, (_, styleValue) => {
      const allowed = String(styleValue)
        .split(';')
        .map((item) => item.trim())
        .filter((item) => /^(color|text-align)\s*:/i.test(item))

      return allowed.length ? `style="${allowed.join('; ')}"` : ''
    })

  return convertYoutubeLinesToEmbeds(safeText)
}

function cleanUsername(value) {
  return cleanText(value, 40).toLowerCase().replace(/[^a-z0-9._-]/g, '')
}

function cleanEmail(value) {
  const email = cleanText(value, 120).toLowerCase()

  return email.includes('@') ? email : ''
}

function hashPassword(value) {
  return createHash('sha256')
    .update(`ibnucreative:${String(value ?? '')}`)
    .digest('hex')
}

function cleanPasswordHash(value) {
  const hash = cleanText(value, 80).toLowerCase()

  return /^[a-f0-9]{64}$/.test(hash) ? hash : ''
}

function cleanNumber(value, min = 0, max = 1000000) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return min
  }

  return Math.min(max, Math.max(min, number))
}

function cleanImage(value) {
  if (typeof value !== 'string') {
    return ''
  }

  if (
    value.startsWith('/uploads/profiles/') ||
    value.startsWith('/uploads/tugas/') ||
    value.startsWith('/uploads/gambar/')
  ) {
    return cleanText(value, 240)
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
    return cleanText(value, 240)
  }

  return value.startsWith('data:application/pdf') && value.length <= 8_000_000
    ? value
    : ''
}

function cleanExternalUrl(value) {
  const safeValue = cleanText(value, 360)

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
  const source = Array.isArray(value) ? value.slice(0, 40) : []

  return source
    .filter((item) => item?.url || item?.title)
    .map((item, index) => ({
      id: cleanText(item.id || `${materialId}-link-${index + 1}`, 90),
      title: cleanText(item.title || `Link ${index + 1}`, 120),
      url: cleanExternalUrl(item.url || ''),
    }))
    .filter((item) => item.url)
}

function cleanYoutubeUrl(value) {
  const safeValue = cleanText(value, 260)

  if (!safeValue) {
    return ''
  }

  try {
    const url = new URL(safeValue)
    const host = url.hostname.replace(/^www\./, '')

    return ['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)
      ? safeValue
      : ''
  } catch {
    return ''
  }
}

function fallbackMaterials(classId, title) {
  return [
    {
      id: `${classId}-material-1`,
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
      id: `${classId}-material-2`,
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

function cleanPromptItems(value, materialId = 'material') {
  const source = Array.isArray(value) ? value.slice(0, 80) : []

  return source
    .filter((item) => item?.image || item?.prompt || item?.instruction)
    .map((item, index) => ({
      id: cleanText(item.id || `${materialId}-prompt-${index + 1}`, 90),
      title: cleanText(item.title || `Prompt ${index + 1}`, 100),
      image: cleanImage(item.image),
      instruction: cleanPromptText(item.instruction),
      prompt: cleanPromptText(item.prompt),
    }))
}

function cleanMaterials(value, classId, title) {
  const source = Array.isArray(value) ? value.slice(0, 80) : []
  const materials = source
    .filter((item) => item?.title || item?.videoUrl || item?.videoFile || item?.imageFile)
    .map((item, index) => {
      const id = cleanText(item.id || `${classId}-material-${index + 1}`, 90)

      return {
        id,
        title: cleanText(item.title || `Materi ${index + 1}`, 100),
        description: cleanRichHtml(item.description || ''),
        videoUrl: cleanYoutubeUrl(item.videoUrl),
        videoFile: cleanText(item.videoFile || '', 180),
        videoName: cleanText(item.videoName || '', 160),
        videoType: cleanText(item.videoType || '', 80),
        imageFile: cleanImage(item.imageFile || ''),
        imageName: cleanText(item.imageName || '', 160),
        pdfFile: cleanPdfFile(item.pdfFile || ''),
        pdfName: cleanText(item.pdfName || '', 180),
        requiresTask: Boolean(item.requiresTask),
        allowTaskImage: item.allowTaskImage !== false,
        requireTaskImage: Boolean(item.requireTaskImage),
        taskPrompt: cleanText(
          item.taskPrompt || 'Kirim link tugas atau catatan praktik materi ini.',
          260,
        ),
        promptItems: cleanPromptItems(item.promptItems, id),
        resourceLinks: cleanResourceLinks(item.resourceLinks, id),
      }
    })

  return materials.length ? materials : fallbackMaterials(classId, title)
}

function cleanClasses(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .slice(0, 200)
    .filter((item) => item?.id && item?.title)
    .map((item, index) => {
      const id = cleanText(item.id || `class-${Date.now()}-${index}`, 90)
      const title = cleanText(item.title || `Kelas ${index + 1}`, 100)

      return {
        id,
        title,
        description: cleanRichHtml(item.description || ''),
        students: cleanNumber(item.students, 0, 1000000),
        displayStudents:
          item.displayStudents === '' || item.displayStudents === null || item.displayStudents === undefined
            ? ''
            : cleanNumber(item.displayStudents, 0, 1000000),
        rating:
          item.rating === '' || item.rating === null || item.rating === undefined
            ? ''
            : cleanNumber(item.rating, 0, 5),
        status: cleanText(item.status || 'Aktif', 40),
        revenue: cleanText(item.revenue || 'Rp 0', 60),
        price: cleanNumber(item.price, 0, 1000000000),
        salePrice:
          item.salePrice === '' || item.salePrice === null || item.salePrice === undefined
            ? ''
            : cleanNumber(item.salePrice, 0, 1000000000),
        lynkProductKey: cleanText(item.lynkProductKey || '', 180),
        tripayProductKey: cleanText(item.tripayProductKey || '', 180),
        thumbnail: cleanImage(item.thumbnail),
        mentor: cleanText(item.mentor || 'Ibnu Creative', 80),
        progress: cleanNumber(item.progress, 0, 100),
        next: cleanText(item.next || 'Lanjutkan modul berikutnya', 120),
        liveAt: cleanText(item.liveAt || 'Jadwal menyusul', 120),
        lessons: cleanText(item.lessons || '12 materi', 60),
        showOnHomepage: item.showOnHomepage !== false,
        showOnMember: item.showOnMember !== false,
        highlighted: item.highlighted === true,
        materials: cleanMaterials(item.materials, id, title),
      }
    })
}

function createDefaultAdmins() {
  return [
    {
      id: 'admin-1',
      name: 'Admin IbnuCreative',
      username: 'admin',
      email: 'admin@ibnucreative.local',
      status: 'Aktif',
      passwordHash: hashPassword('admin123'),
      joinedAt: '2026-05-29',
    },
  ]
}

function createDefaultMembers() {
  return [
    {
      id: 'member-1',
      name: 'Sahabat Kreatif',
      username: 'member',
      email: 'member@ibnucreative.local',
      status: 'Aktif',
      passwordHash: hashPassword('member123'),
      joinedAt: '2026-05-29',
    },
  ]
}

function cleanAccounts(value) {
  if (!Array.isArray(value)) {
    return []
  }

  const usedUsernames = new Set()

  return value
    .slice(0, 300)
    .map((item, index) => {
      const username = cleanUsername(item.username || `member-${index + 1}`)

      return {
        id: cleanText(item.id || `account-${Date.now()}-${index}`, 90),
        name: cleanText(item.name || username || `Member ${index + 1}`, 100),
        username,
        email: cleanEmail(item.email),
        status: cleanText(item.status || 'Aktif', 40),
        avatar: cleanImage(item.avatar),
        allowedClassIds: Array.isArray(item.allowedClassIds) ? item.allowedClassIds.map((classId) => cleanText(classId, 90)).filter(Boolean) : (item.allowedClassIds && typeof item.allowedClassIds === 'object' ? item.allowedClassIds : null),
        passwordHash:
          cleanPasswordHash(item.passwordHash) || hashPassword(item.password || 'member123'),
        joinedAt: cleanText(item.joinedAt || new Date().toISOString().slice(0, 10), 40),
      }
    })
    .filter((item) => {
      if (!item.username || usedUsernames.has(item.username)) {
        return false
      }

      usedUsernames.add(item.username)
      return true
    })
}

function redactAccounts(accounts) {
  return accounts.map((account) => {
    const publicAccount = { ...account }

    delete publicAccount.passwordHash
    return publicAccount
  })
}

function cleanSupportTickets(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .slice(0, 500)
    .filter((item) => item?.id && item?.message)
    .map((item, index) => ({
      id: cleanText(item.id || `ticket-${Date.now()}-${index}`, 90),
      memberId: cleanText(item.memberId || '', 90),
      memberName: cleanText(item.memberName || 'Member', 100),
      subject: cleanText(item.subject || 'Bantuan mentor', 120),
      message: cleanText(item.message, 600),
      status: cleanText(item.status || 'Menunggu', 40),
      priority: cleanText(item.priority || 'Normal', 40),
      answer: cleanText(item.answer || '', 600),
      replies: cleanSupportReplies(item.replies, item),
      createdAt: cleanText(item.createdAt || new Date().toISOString(), 40),
    }))
}

function cleanSupportReplies(value, ticket = {}) {
  const replies = Array.isArray(value) ? value.slice(0, 200) : []
  const cleanedReplies = replies
    .filter((item) => item?.message)
    .map((item, index) => ({
      id: cleanText(item.id || `reply-${Date.now()}-${index}`, 90),
      senderRole: item.senderRole === 'admin' ? 'admin' : 'member',
      senderName: cleanText(
        item.senderName || (item.senderRole === 'admin' ? 'Admin' : ticket.memberName || 'Member'),
        100,
      ),
      message: cleanText(item.message, 600),
      createdAt: cleanText(item.createdAt || new Date().toISOString(), 40),
    }))

  if (cleanedReplies.length) {
    return cleanedReplies
  }

  const fallbackReplies = []

  if (ticket.message) {
    fallbackReplies.push({
      id: `${cleanText(ticket.id || 'ticket', 80)}-question`,
      senderRole: 'member',
      senderName: cleanText(ticket.memberName || 'Member', 100),
      message: cleanText(ticket.message, 600),
      createdAt: cleanText(ticket.createdAt || new Date().toISOString(), 40),
    })
  }

  if (ticket.answer) {
    fallbackReplies.push({
      id: `${cleanText(ticket.id || 'ticket', 80)}-answer`,
      senderRole: 'admin',
      senderName: 'Admin',
      message: cleanText(ticket.answer, 600),
      createdAt: cleanText(ticket.createdAt || new Date().toISOString(), 40),
    })
  }

  return fallbackReplies
}

function cleanSubmissions(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .slice(0, 1000)
    .filter((item) => item?.id && item?.answer)
    .map((item, index) => ({
      id: cleanText(item.id || `submission-${Date.now()}-${index}`, 90),
      memberId: cleanText(item.memberId || '', 90),
      memberName: cleanText(item.memberName || 'Member', 100),
      classId: cleanText(item.classId || '', 90),
      classTitle: cleanText(item.classTitle || 'Kelas', 140),
      materialId: cleanText(item.materialId || '', 90),
      materialTitle: cleanText(item.materialTitle || 'Materi', 140),
      answer: cleanText(item.answer || '', 1200),
      attachmentUrl: cleanImage(item.attachmentUrl || ''),
      attachmentName: cleanText(item.attachmentName || '', 180),
      status: cleanText(item.status || 'Menunggu Review', 40),
      feedback: cleanText(item.feedback || '', 1200),
      rating: Math.round(cleanNumber(item.rating || 0, 0, 5)),
      submittedAt: cleanText(item.submittedAt || new Date().toISOString(), 40),
    }))
}

async function ensureDataFile() {
  await mkdir(dataDir, { recursive: true })

  try {
    await access(dataFile)
  } catch {
    await writeFile(
      dataFile,
      JSON.stringify(
        {
          classes: [],
          admins: createDefaultAdmins(),
          members: createDefaultMembers(),
          supportTickets: [],
          submissions: [],
          websiteSettings: defaultWebsiteSettings,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    )
  }
}

async function readData() {
  await ensureDataFile()

  try {
    const data = JSON.parse(await readFile(dataFile, 'utf8'))
    return {
      classes: cleanClasses(data.classes),
      admins: Array.isArray(data.admins)
        ? cleanAccounts(data.admins)
        : createDefaultAdmins(),
      members: Array.isArray(data.members)
        ? cleanAccounts(data.members)
        : createDefaultMembers(),
      supportTickets: cleanSupportTickets(data.supportTickets),
      submissions: cleanSubmissions(data.submissions),
      websiteSettings: cleanWebsiteSettings(data.websiteSettings),
      updatedAt: cleanText(data.updatedAt, 40),
    }
  } catch {
    return {
      classes: [],
      admins: createDefaultAdmins(),
      members: createDefaultMembers(),
      supportTickets: [],
      submissions: [],
      websiteSettings: defaultWebsiteSettings,
      updatedAt: '',
    }
  }
}

async function writeData(nextData) {
  await ensureDataFile()

  try {
    const current = await readFile(dataFile, 'utf8')
    await writeFile(backupFile, current)
  } catch {
    // Backup is best-effort only.
  }

  const currentData = await readData()
  const payload = JSON.stringify(
    {
      classes: cleanClasses(nextData.classes ?? currentData.classes),
      admins: cleanAccounts(nextData.admins ?? currentData.admins),
      members: cleanAccounts(nextData.members ?? currentData.members),
      supportTickets: cleanSupportTickets(
        nextData.supportTickets ?? currentData.supportTickets,
      ),
      submissions: cleanSubmissions(nextData.submissions ?? currentData.submissions),
      websiteSettings: cleanWebsiteSettings(
        nextData.websiteSettings ?? currentData.websiteSettings,
      ),
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  )

  await writeFile(tempFile, payload)
  await rename(tempFile, dataFile)
}

function sendJson(response, statusCode, data, origin) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': localOrigins.has(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(data))
}

function sendPublicData(response, statusCode, data, origin) {
  sendJson(
    response,
    statusCode,
    {
      ...data,
      admins: undefined,
      members: data.members ? redactAccounts(data.members) : undefined,
    },
    origin,
  )
}

function sendBackupJson(response, data, origin) {
  const fileName = `backup-ibnucreative-${new Date().toISOString().slice(0, 10)}.json`

  response.writeHead(200, {
    'Access-Control-Allow-Origin': localOrigins.has(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Content-Disposition',
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(data, null, 2))
}

function assertUniqueUsername(accounts, username, ignoredId = '') {
  if (accounts.some((item) => item.username === username && item.id !== ignoredId)) {
    throw new Error('Username sudah dipakai member lain.')
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''

    request.on('data', (chunk) => {
      body += chunk

      if (body.length > maxBodySize) {
        reject(new Error('Payload terlalu besar.'))
        request.destroy()
      }
    })

    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin ?? ''
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const pathname = url.pathname
  const requestId = cleanText(url.searchParams.get('id') || '', 90)

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {}, origin)
    return
  }

  try {
    if (pathname === '/api/classes' || pathname === '/api/classes.php') {
      if (request.method === 'GET') {
        const data = await readData()
        sendJson(
          response,
          200,
          {
            classes: data.classes,
            updatedAt: data.updatedAt,
          },
          origin,
        )
        return
      }

      if (request.method === 'PUT') {
        const body = await readBody(request)
        const payload = JSON.parse(body || '{}')
        const classes = Array.isArray(payload) ? payload : payload.classes

        await writeData({ classes })
        const data = await readData()
        sendJson(
          response,
          200,
          {
            classes: data.classes,
            updatedAt: data.updatedAt,
          },
          origin,
        )
        return
      }

      sendJson(response, 405, { message: 'Method tidak diizinkan.' }, origin)
      return
    }

    if (pathname === '/api/settings' || pathname === '/api/settings.php') {
      if (request.method === 'GET') {
        const data = await readData()

        sendJson(
          response,
          200,
          {
            settings: data.websiteSettings,
            updatedAt: data.updatedAt,
          },
          origin,
        )
        return
      }

      if (request.method === 'PUT') {
        const payload = JSON.parse((await readBody(request)) || '{}')

        await writeData({
          websiteSettings: cleanWebsiteSettings(payload.settings || payload),
        })
        const data = await readData()
        sendJson(
          response,
          200,
          {
            settings: data.websiteSettings,
            updatedAt: data.updatedAt,
          },
          origin,
        )
        return
      }

      sendJson(response, 405, { message: 'Method tidak diizinkan.' }, origin)
      return
    }

    if (pathname === '/api/backup' || pathname === '/api/backup.php') {
      if (request.method === 'GET') {
        const data = await readData()

        sendBackupJson(
          response,
          {
            type: 'ibnucreative-full-backup',
            version: 1,
            exportedAt: new Date().toISOString(),
            ...data,
          },
          origin,
        )
        return
      }

      if (request.method === 'POST') {
        const payload = JSON.parse((await readBody(request)) || '{}')
        const backup = payload.backup && typeof payload.backup === 'object'
          ? payload.backup
          : payload

        await writeData({
          classes: backup.classes,
          admins: backup.admins,
          members: backup.members,
          supportTickets: backup.supportTickets,
          submissions: backup.submissions,
          websiteSettings: backup.websiteSettings || backup.settings,
        })
        const data = await readData()

        sendJson(
          response,
          200,
          {
            message: 'Backup berhasil dipulihkan.',
            settings: data.websiteSettings,
            updatedAt: data.updatedAt,
          },
          origin,
        )
        return
      }

      sendJson(response, 405, { message: 'Method tidak diizinkan.' }, origin)
      return
    }

    if (pathname === '/api/members' || pathname === '/api/members.php') {
      if (request.method === 'GET') {
        const data = await readData()
        sendPublicData(
          response,
          200,
          {
            members: data.members,
            updatedAt: data.updatedAt,
          },
          origin,
        )
        return
      }

      if (request.method === 'POST') {
        const payload = JSON.parse((await readBody(request)) || '{}')
        const data = await readData()
        const username = cleanUsername(payload.username)
        const password = String(payload.password ?? '')

        if (!username || password.length < 6) {
          throw new Error('Username dan password minimal 6 karakter wajib diisi.')
        }

        assertUniqueUsername(data.members, username)

        await writeData({
          members: [
            {
              id: `member-${Date.now()}`,
              name: cleanText(payload.name || username, 100),
              username,
              email: cleanEmail(payload.email),
              status: cleanText(payload.status || 'Aktif', 40),
              avatar: cleanImage(payload.avatar),
              allowedClassIds: Array.isArray(payload.allowedClassIds)
                ? payload.allowedClassIds.map((classId) => cleanText(classId, 90)).filter(Boolean)
                : null,
              passwordHash: hashPassword(password),
              joinedAt: new Date().toISOString().slice(0, 10),
            },
            ...data.members,
          ],
        })
        const nextData = await readData()
        sendPublicData(
          response,
          200,
          {
            members: nextData.members,
            updatedAt: nextData.updatedAt,
          },
          origin,
        )
        return
      }

      if (request.method === 'PUT') {
        const payload = JSON.parse((await readBody(request)) || '{}')
        const data = await readData()
        const memberId = cleanText(payload.id, 90)
        const username = cleanUsername(payload.username)
        const currentMember = data.members.find((item) => item.id === memberId)

        if (!currentMember || !username) {
          throw new Error('Data member tidak ditemukan atau username kosong.')
        }

        if (payload.password && String(payload.password).length < 6) {
          throw new Error('Password minimal 6 karakter.')
        }

        assertUniqueUsername(data.members, username, memberId)

        await writeData({
          members: data.members.map((item) =>
            item.id === memberId
              ? {
                  ...item,
                  name: cleanText(payload.name || username, 100),
                  username,
                  email: cleanEmail(payload.email),
                  status: cleanText(payload.status || 'Aktif', 40),
                  avatar: cleanImage(payload.avatar) || item.avatar,
                  allowedClassIds: Array.isArray(payload.allowedClassIds)
                    ? payload.allowedClassIds.map((classId) => cleanText(classId, 90)).filter(Boolean)
                    : null,
                  passwordHash: payload.password
                    ? hashPassword(payload.password)
                    : item.passwordHash,
                }
              : item,
          ),
        })
        const nextData = await readData()
        sendPublicData(
          response,
          200,
          {
            members: nextData.members,
            updatedAt: nextData.updatedAt,
          },
          origin,
        )
        return
      }

      if (request.method === 'DELETE') {
        const data = await readData()

        await writeData({
          members: data.members.filter((item) => item.id !== requestId),
          supportTickets: data.supportTickets.map((ticket) =>
            ticket.memberId === requestId
              ? { ...ticket, status: 'Member dihapus' }
              : ticket,
          ),
        })
        const nextData = await readData()
        sendPublicData(
          response,
          200,
          {
            members: nextData.members,
            updatedAt: nextData.updatedAt,
          },
          origin,
        )
        return
      }

      sendJson(response, 405, { message: 'Method tidak diizinkan.' }, origin)
      return
    }

    if (pathname === '/api/support' || pathname === '/api/support.php') {
      if (request.method === 'GET') {
        const data = await readData()
        const role = url.searchParams.get('role') === 'admin' ? 'admin' : 'member'
        const userId = cleanText(url.searchParams.get('userId') || '', 90)
        const supportTickets =
          role === 'admin'
            ? data.supportTickets
            : data.supportTickets.filter((ticket) => ticket.memberId === userId)

        sendJson(
          response,
          200,
          {
            supportTickets,
            updatedAt: data.updatedAt,
          },
          origin,
        )
        return
      }

      if (request.method === 'POST') {
        const payload = JSON.parse((await readBody(request)) || '{}')
        const data = await readData()
        const message = cleanText(payload.message, 600)

        if (!message) {
          throw new Error('Pertanyaan bantuan wajib diisi.')
        }

        await writeData({
          supportTickets: [
            {
              id: `ticket-${Date.now()}`,
              memberId: cleanText(payload.memberId, 90),
              memberName: cleanText(payload.memberName || 'Member', 100),
              subject: cleanText(payload.subject || 'Bantuan mentor', 120),
              message,
              status: 'Menunggu',
              priority: cleanText(payload.priority || 'Normal', 40),
              answer: '',
              replies: [
                {
                  id: `reply-${Date.now()}`,
                  senderRole: 'member',
                  senderName: cleanText(payload.memberName || 'Member', 100),
                  message,
                  createdAt: new Date().toISOString(),
                },
              ],
              createdAt: new Date().toISOString(),
            },
            ...data.supportTickets,
          ],
        })
        const nextData = await readData()
        const supportTickets = cleanText(payload.memberId, 90)
          ? nextData.supportTickets.filter(
              (ticket) => ticket.memberId === cleanText(payload.memberId, 90),
            )
          : nextData.supportTickets

        sendJson(
          response,
          200,
          {
            supportTickets,
            updatedAt: nextData.updatedAt,
          },
          origin,
        )
        return
      }

      if (request.method === 'PUT') {
        const payload = JSON.parse((await readBody(request)) || '{}')
        const ticketId = cleanText(payload.id, 90)
        const replyMessage = cleanText(payload.message ?? payload.answer ?? '', 600)
        const senderRole = payload.senderRole === 'admin' ? 'admin' : 'member'
        const senderName = cleanText(
          payload.senderName || (senderRole === 'admin' ? 'Admin' : 'Member'),
          100,
        )
        const data = await readData()

        await writeData({
          supportTickets: data.supportTickets.map((ticket) =>
            ticket.id === ticketId
              ? {
                  ...ticket,
                  status: cleanText(payload.status || ticket.status, 40),
                  answer: senderRole === 'admin' && replyMessage ? replyMessage : ticket.answer,
                  replies: replyMessage
                    ? [
                        ...(ticket.replies ?? []),
                        {
                          id: `reply-${Date.now()}`,
                          senderRole,
                          senderName,
                          message: replyMessage,
                          createdAt: new Date().toISOString(),
                        },
                      ]
                    : ticket.replies,
                }
              : ticket,
          ),
        })
        const nextData = await readData()
        sendJson(
          response,
          200,
          {
            supportTickets: nextData.supportTickets,
            updatedAt: nextData.updatedAt,
          },
          origin,
        )
        return
      }

      if (request.method === 'DELETE') {
        const data = await readData()

        await writeData({
          supportTickets: data.supportTickets.filter((item) => item.id !== requestId),
        })
        const nextData = await readData()
        sendJson(
          response,
          200,
          {
            supportTickets: nextData.supportTickets,
            updatedAt: nextData.updatedAt,
          },
          origin,
        )
        return
      }

      sendJson(response, 405, { message: 'Method tidak diizinkan.' }, origin)
      return
    }

    if (pathname === '/api/submissions' || pathname === '/api/submissions.php') {
      if (request.method === 'GET') {
        const data = await readData()
        const role = url.searchParams.get('role') === 'admin' ? 'admin' : 'member'
        const userId = cleanText(url.searchParams.get('userId') || '', 90)
        const submissions =
          role === 'admin'
            ? data.submissions
            : data.submissions.filter((item) => item.memberId === userId)

        sendJson(
          response,
          200,
          {
            submissions,
            updatedAt: data.updatedAt,
          },
          origin,
        )
        return
      }

      if (request.method === 'POST') {
        const payload = JSON.parse((await readBody(request)) || '{}')
        const data = await readData()
        const answer = cleanText(payload.answer, 1200)

        if (!answer) {
          throw new Error('Isi tugas wajib dikirim.')
        }

        const nextSubmission = {
          id: `submission-${Date.now()}`,
          memberId: cleanText(payload.memberId || '', 90),
          memberName: cleanText(payload.memberName || 'Member', 100),
          classId: cleanText(payload.classId || '', 90),
          classTitle: cleanText(payload.classTitle || 'Kelas', 140),
          materialId: cleanText(payload.materialId || '', 90),
          materialTitle: cleanText(payload.materialTitle || 'Materi', 140),
          answer,
          attachmentUrl: cleanImage(payload.attachmentUrl || ''),
          attachmentName: cleanText(payload.attachmentName || '', 180),
          status: 'Menunggu Review',
          feedback: '',
          rating: 0,
          submittedAt: new Date().toISOString(),
        }

        await writeData({ submissions: [nextSubmission, ...data.submissions] })
        const nextData = await readData()
        const submissions = nextSubmission.memberId
          ? nextData.submissions.filter((item) => item.memberId === nextSubmission.memberId)
          : nextData.submissions

        sendJson(
          response,
          200,
          {
            submissions,
            updatedAt: nextData.updatedAt,
          },
          origin,
        )
        return
      }

      if (request.method === 'PUT') {
        const payload = JSON.parse((await readBody(request)) || '{}')
        const submissionId = cleanText(payload.id, 90)
        const data = await readData()

        await writeData({
          submissions: data.submissions.map((item) =>
            item.id === submissionId
              ? {
                  ...item,
                  status: cleanText(payload.status || item.status, 40),
                  feedback: cleanText(payload.feedback ?? item.feedback, 1200),
                  rating: Math.round(cleanNumber(payload.rating ?? item.rating ?? 0, 0, 5)),
                }
              : item,
          ),
        })
        const nextData = await readData()
        sendJson(
          response,
          200,
          {
            submissions: nextData.submissions,
            updatedAt: nextData.updatedAt,
          },
          origin,
        )
        return
      }

      if (request.method === 'DELETE') {
        const data = await readData()

        await writeData({
          submissions: data.submissions.filter((item) => item.id !== requestId),
        })
        const nextData = await readData()
        sendJson(
          response,
          200,
          {
            submissions: nextData.submissions,
            updatedAt: nextData.updatedAt,
          },
          origin,
        )
        return
      }

      sendJson(response, 405, { message: 'Method tidak diizinkan.' }, origin)
      return
    }

    if (pathname === '/api/profile' || pathname === '/api/profile.php') {
      if (!['GET', 'PUT'].includes(request.method || '')) {
        sendJson(response, 405, { message: 'Method tidak diizinkan.' }, origin)
        return
      }

      const payload =
        request.method === 'PUT' ? JSON.parse((await readBody(request)) || '{}') : {}
      const data = await readData()
      const role = payload.role === 'admin' ? 'admin' : 'member'
      const userId = cleanText(payload.userId || '', 90)
      const username = cleanUsername(payload.username || '')
      const accounts = role === 'admin' ? data.admins : data.members
      const account = accounts.find(
        (item) => item.id === userId || (username && item.username === username),
      )

      if (!account) {
        throw new Error('Akun tidak ditemukan. Silakan login ulang.')
      }

      if (request.method === 'GET') {
        sendJson(
          response,
          200,
          {
            session: {
              userId: account.id,
              name: account.name,
              username: account.username,
              role,
              avatar: account.avatar || '',
              allowedClassIds: role === 'member' ? (Array.isArray(account.allowedClassIds) ? account.allowedClassIds : null) : account.allowedClassIds,
              signedInAt: new Date().toISOString(),
            },
          },
          origin,
        )
        return
      }

      const nextAccount = {
        ...account,
        name: cleanText(payload.name || account.name, 100),
        avatar: cleanImage(payload.avatar),
      }
      if (role === 'admin' && payload.allowedClassIds !== undefined) {
        nextAccount.allowedClassIds = payload.allowedClassIds
      }
      const nextAccounts = accounts.map((item) =>
        item.id === account.id ? nextAccount : item,
      )

      await writeData({
        admins: role === 'admin' ? nextAccounts : data.admins,
        members: role === 'member' ? nextAccounts : data.members,
      })

      sendJson(
        response,
        200,
        {
          session: {
            userId: nextAccount.id,
            name: nextAccount.name,
            username: nextAccount.username,
            role,
            avatar: nextAccount.avatar || '',
            allowedClassIds: role === 'member' ? (Array.isArray(nextAccount.allowedClassIds) ? nextAccount.allowedClassIds : null) : nextAccount.allowedClassIds,
            signedInAt: new Date().toISOString(),
          },
        },
        origin,
      )
      return
    }

    if (pathname === '/api/login' || pathname === '/api/login.php') {
      if (request.method !== 'POST') {
        sendJson(response, 405, { message: 'Method tidak diizinkan.' }, origin)
        return
      }

      const payload = JSON.parse((await readBody(request)) || '{}')
      const login = cleanText(payload.username, 120)
      const username = cleanUsername(login)
      const email = cleanEmail(login)
      const passwordHash = hashPassword(payload.password)
      const data = await readData()
      const candidates = [
        ...data.admins.map((account) => ({ ...account, role: 'admin' })),
        ...data.members.map((account) => ({ ...account, role: 'member' })),
      ]
      const account = candidates.find(
        (item) =>
          item.status === 'Aktif' &&
          item.passwordHash === passwordHash &&
          (item.username === username || (email && item.email === email)),
      )

      if (!account) {
        sendJson(
          response,
          401,
          { message: 'Username atau password tidak sesuai.' },
          origin,
        )
        return
      }

      sendJson(
        response,
        200,
        {
          session: {
              userId: account.id,
              name: account.name,
              username: account.username,
              role: account.role,
              avatar: account.avatar || '',
              allowedClassIds:
                account.role === 'member' && Array.isArray(account.allowedClassIds)
                  ? account.allowedClassIds
                  : null,
              signedInAt: new Date().toISOString(),
            },
        },
        origin,
      )
      return
    }

    if (
      pathname === '/api/upload-file' ||
      pathname === '/api/upload-file.php' ||
      pathname === '/api/upload-video' ||
      pathname === '/api/upload-video.php'
    ) {
      if (request.method === 'POST') {
        const body = await readBody(request)
        const payload = JSON.parse(body || '{}')
        const type = cleanText(payload.type || '', 40)
        const name = cleanText(payload.name || 'file', 180)
        const contentType = cleanText(payload.contentType || 'application/octet-stream', 120)

        const folderMap = {
          profile: 'profiles',
          task: 'tugas',
          'class-image': 'gambar',
          'certificate-image': 'sertifikat',
          document: 'dokumen',
          video: 'videos',
        }
        const folder = folderMap[type] || 'temp'
        const extension = name.split('.').pop() || 'bin'
        const fileName = `${type || 'file'}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.${extension}`

        const relativePath = `uploads/${folder}/${fileName}`
        const absolutePath = path.resolve(__dirname, 'public', relativePath)

        const mockSignedUrl = `${url.pathname}?mock=true&path=${encodeURIComponent(absolutePath)}`

        sendJson(
          response,
          200,
          {
            signedUrl: mockSignedUrl,
            url: `/${relativePath}`,
            path: relativePath,
            file: relativePath,
            name: name,
            type: contentType,
          },
          origin,
        )
        return
      }

      if (request.method === 'PUT') {
        const absolutePath = url.searchParams.get('path')
        if (!absolutePath) {
          sendJson(response, 400, { message: 'Path tidak ditemukan.' }, origin)
          return
        }

        await mkdir(path.dirname(absolutePath), { recursive: true })

        const writeStream = createWriteStream(absolutePath)
        await pipeline(request, writeStream)

        sendJson(response, 200, { success: true }, origin)
        return
      }

      sendJson(response, 405, { message: 'Method tidak diizinkan.' }, origin)
      return
    }

    if (pathname === '/api/logout' || pathname === '/api/logout.php') {
      if (!['GET', 'POST'].includes(request.method || '')) {
        sendJson(response, 405, { message: 'Method tidak diizinkan.' }, origin)
        return
      }

      sendJson(response, 200, { message: 'Logout berhasil.' }, origin)
      return
    }

    sendJson(response, 404, { message: 'Endpoint tidak ditemukan.' }, origin)
  } catch (error) {
    sendJson(
      response,
      400,
      { message: error.message || 'Data tidak bisa diproses.' },
      origin,
    )
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Data API berjalan di http://127.0.0.1:${port}`)
})
