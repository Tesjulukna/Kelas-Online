import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const dataDir = path.resolve('data')
const dataFile = path.join(dataDir, 'data.json')
const backupFile = path.join(dataDir, 'data.backup.json')
const tempFile = path.join(dataDir, 'data.tmp.json')
const maxBodySize = 64 * 1024 * 1024

function cleanText(value, maxLength = 80) {
  return String(value ?? '')
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, maxLength)
}

function cleanPromptText(value) {
  return String(value ?? '').split(String.fromCharCode(0)).join('')
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
  return typeof value === 'string' &&
    value.startsWith('data:image/') &&
    value.length <= 3_000_000
    ? value
    : ''
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
      videoUrl: 'https://www.youtube.com/watch?v=ysz5S6PUM-U',
      videoFile: '',
      videoName: '',
      videoType: '',
      requiresTask: false,
      taskPrompt: '',
      promptItems: [],
    },
    {
      id: `${classId}-material-2`,
      title: `Praktik ${title}`,
      videoUrl: 'https://www.youtube.com/shorts/aqz-KE-bpKQ',
      videoFile: '',
      videoName: '',
      videoType: '',
      requiresTask: true,
      taskPrompt: 'Kirim link hasil praktik atau catatan tugas dari materi ini.',
      promptItems: [],
    },
  ]
}

function cleanPromptItems(value, materialId = 'material') {
  const source = Array.isArray(value) ? value.slice(0, 80) : []

  return source
    .filter((item) => item?.image || item?.prompt)
    .map((item, index) => ({
      id: cleanText(item.id || `${materialId}-prompt-${index + 1}`, 90),
      title: cleanText(item.title || `Prompt ${index + 1}`, 100),
      image: cleanImage(item.image),
      prompt: cleanPromptText(item.prompt),
    }))
}

function cleanMaterials(value, classId, title) {
  const source = Array.isArray(value) ? value.slice(0, 80) : []
  const materials = source
    .filter((item) => item?.title || item?.videoUrl || item?.videoFile)
    .map((item, index) => {
      const id = cleanText(item.id || `${classId}-material-${index + 1}`, 90)

      return {
        id,
        title: cleanText(item.title || `Materi ${index + 1}`, 100),
        videoUrl: cleanYoutubeUrl(item.videoUrl),
        videoFile: cleanText(item.videoFile || '', 180),
        videoName: cleanText(item.videoName || '', 160),
        videoType: cleanText(item.videoType || '', 80),
        requiresTask: Boolean(item.requiresTask),
        taskPrompt: cleanText(
          item.taskPrompt || 'Kirim link tugas atau catatan praktik materi ini.',
          260,
        ),
        promptItems: cleanPromptItems(item.promptItems, id),
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
        students: cleanNumber(item.students, 0, 1000000),
        status: cleanText(item.status || 'Aktif', 40),
        revenue: cleanText(item.revenue || 'Rp 0', 60),
        thumbnail: cleanImage(item.thumbnail),
        mentor: cleanText(item.mentor || 'Ibnu Creative', 80),
        progress: cleanNumber(item.progress, 0, 100),
        next: cleanText(item.next || 'Lanjutkan modul berikutnya', 120),
        liveAt: cleanText(item.liveAt || 'Jadwal menyusul', 120),
        lessons: cleanText(item.lessons || '12 materi', 60),
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
      createdAt: cleanText(item.createdAt || new Date().toISOString(), 40),
    }))
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
      status: cleanText(item.status || 'Menunggu Review', 40),
      feedback: cleanText(item.feedback || '', 1200),
      submittedAt: cleanText(item.submittedAt || new Date().toISOString(), 40),
    }))
}

async function ensureDataFile() {
  await mkdir(dataDir, { recursive: true })

  try {
    await readFile(dataFile, 'utf8')
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
      updatedAt: cleanText(data.updatedAt, 40),
    }
  } catch {
    return {
      classes: [],
      admins: createDefaultAdmins(),
      members: createDefaultMembers(),
      supportTickets: [],
      submissions: [],
      updatedAt: '',
    }
  }
}

async function writeData(nextData) {
  await ensureDataFile()

  try {
    await writeFile(backupFile, await readFile(dataFile, 'utf8'))
  } catch {
    // Backup is best-effort only.
  }

  const currentData = await readData()

  await writeFile(
    tempFile,
    JSON.stringify(
      {
        classes: cleanClasses(nextData.classes ?? currentData.classes),
        admins: cleanAccounts(nextData.admins ?? currentData.admins),
        members: cleanAccounts(nextData.members ?? currentData.members),
        supportTickets: cleanSupportTickets(
          nextData.supportTickets ?? currentData.supportTickets,
        ),
        submissions: cleanSubmissions(nextData.submissions ?? currentData.submissions),
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
  await rename(tempFile, dataFile)
}

function readRequestBody(request) {
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

function sendJson(response, statusCode, data) {
  response.statusCode = statusCode
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(data))
}

function sendPublicData(response, statusCode, data) {
  sendJson(response, statusCode, {
    ...data,
    admins: undefined,
    members: data.members ? redactAccounts(data.members) : undefined,
  })
}

function getRequestId(request) {
  const url = new URL(request.url || '/', 'http://localhost')

  return cleanText(url.searchParams.get('id') || '', 90)
}

function assertUniqueUsername(accounts, username, ignoredId = '') {
  if (accounts.some((item) => item.username === username && item.id !== ignoredId)) {
    throw new Error('Username sudah dipakai member lain.')
  }
}

function localDataPlugin() {
  const handleClassesRequest = async (request, response) => {
    try {
      if (request.method === 'GET') {
        const data = await readData()
        sendJson(response, 200, {
          classes: data.classes,
          updatedAt: data.updatedAt,
        })
        return
      }

      if (request.method === 'PUT') {
        const payload = JSON.parse((await readRequestBody(request)) || '{}')
        await writeData({
          classes: Array.isArray(payload) ? payload : payload.classes,
        })
        const data = await readData()
        sendJson(response, 200, {
          classes: data.classes,
          updatedAt: data.updatedAt,
        })
        return
      }

      sendJson(response, 405, { message: 'Method tidak diizinkan.' })
    } catch (error) {
      sendJson(response, 400, {
        message: error.message || 'Data tidak bisa diproses.',
      })
    }
  }

  const handleMembersRequest = async (request, response) => {
    try {
      if (request.method === 'GET') {
        const data = await readData()
        sendPublicData(response, 200, {
          members: data.members,
          updatedAt: data.updatedAt,
        })
        return
      }

      if (request.method === 'POST') {
        const payload = JSON.parse((await readRequestBody(request)) || '{}')
        const data = await readData()
        const username = cleanUsername(payload.username)
        const password = String(payload.password ?? '')

        if (!username || password.length < 6) {
          throw new Error('Username dan password minimal 6 karakter wajib diisi.')
        }

        assertUniqueUsername(data.members, username)

        const nextMember = {
          id: `member-${Date.now()}`,
          name: cleanText(payload.name || username, 100),
          username,
          email: cleanEmail(payload.email),
          status: cleanText(payload.status || 'Aktif', 40),
          avatar: cleanImage(payload.avatar),
          passwordHash: hashPassword(password),
          joinedAt: new Date().toISOString().slice(0, 10),
        }

        await writeData({ members: [nextMember, ...data.members] })
        const nextData = await readData()
        sendPublicData(response, 200, {
          members: nextData.members,
          updatedAt: nextData.updatedAt,
        })
        return
      }

      if (request.method === 'PUT') {
        const payload = JSON.parse((await readRequestBody(request)) || '{}')
        const data = await readData()
        const memberId = cleanText(payload.id, 90)
        const currentMember = data.members.find((item) => item.id === memberId)
        const username = cleanUsername(payload.username)

        if (!currentMember || !username) {
          throw new Error('Data member tidak ditemukan atau username kosong.')
        }

        if (payload.password && String(payload.password).length < 6) {
          throw new Error('Password minimal 6 karakter.')
        }

        assertUniqueUsername(data.members, username, memberId)

        const nextMembers = data.members.map((item) =>
          item.id === memberId
            ? {
                ...item,
                name: cleanText(payload.name || username, 100),
                username,
                email: cleanEmail(payload.email),
                status: cleanText(payload.status || 'Aktif', 40),
                avatar: cleanImage(payload.avatar) || item.avatar,
                passwordHash: payload.password
                  ? hashPassword(payload.password)
                  : item.passwordHash,
              }
            : item,
        )

        await writeData({ members: nextMembers })
        const nextData = await readData()
        sendPublicData(response, 200, {
          members: nextData.members,
          updatedAt: nextData.updatedAt,
        })
        return
      }

      if (request.method === 'DELETE') {
        const memberId = getRequestId(request)
        const data = await readData()

        await writeData({
          members: data.members.filter((item) => item.id !== memberId),
          supportTickets: data.supportTickets.map((ticket) =>
            ticket.memberId === memberId
              ? { ...ticket, status: 'Member dihapus' }
              : ticket,
          ),
        })
        const nextData = await readData()
        sendPublicData(response, 200, {
          members: nextData.members,
          updatedAt: nextData.updatedAt,
        })
        return
      }

      sendJson(response, 405, { message: 'Method tidak diizinkan.' })
    } catch (error) {
      sendJson(response, 400, {
        message: error.message || 'Data member tidak bisa diproses.',
      })
    }
  }

  const handleSupportRequest = async (request, response) => {
    try {
      if (request.method === 'GET') {
        const data = await readData()
        const url = new URL(request.url || '/', 'http://localhost')
        const role = url.searchParams.get('role') === 'admin' ? 'admin' : 'member'
        const userId = cleanText(url.searchParams.get('userId') || '', 90)
        const supportTickets =
          role === 'admin'
            ? data.supportTickets
            : data.supportTickets.filter((ticket) => ticket.memberId === userId)

        sendJson(response, 200, {
          supportTickets,
          updatedAt: data.updatedAt,
        })
        return
      }

      if (request.method === 'POST') {
        const payload = JSON.parse((await readRequestBody(request)) || '{}')
        const data = await readData()
        const message = cleanText(payload.message, 600)

        if (!message) {
          throw new Error('Pertanyaan bantuan wajib diisi.')
        }

        const nextTicket = {
          id: `ticket-${Date.now()}`,
          memberId: cleanText(payload.memberId, 90),
          memberName: cleanText(payload.memberName || 'Member', 100),
          subject: cleanText(payload.subject || 'Bantuan mentor', 120),
          message,
          status: 'Menunggu',
          priority: cleanText(payload.priority || 'Normal', 40),
          answer: '',
          createdAt: new Date().toISOString(),
        }

        await writeData({ supportTickets: [nextTicket, ...data.supportTickets] })
        const nextData = await readData()
        const supportTickets = nextTicket.memberId
          ? nextData.supportTickets.filter(
              (ticket) => ticket.memberId === nextTicket.memberId,
            )
          : nextData.supportTickets

        sendJson(response, 200, {
          supportTickets,
          updatedAt: nextData.updatedAt,
        })
        return
      }

      if (request.method === 'PUT') {
        const payload = JSON.parse((await readRequestBody(request)) || '{}')
        const ticketId = cleanText(payload.id, 90)
        const data = await readData()

        await writeData({
          supportTickets: data.supportTickets.map((ticket) =>
            ticket.id === ticketId
              ? {
                  ...ticket,
                  status: cleanText(payload.status || ticket.status, 40),
                  answer: cleanText(payload.answer ?? ticket.answer, 600),
                }
              : ticket,
          ),
        })
        const nextData = await readData()
        sendJson(response, 200, {
          supportTickets: nextData.supportTickets,
          updatedAt: nextData.updatedAt,
        })
        return
      }

      if (request.method === 'DELETE') {
        const ticketId = getRequestId(request)
        const data = await readData()

        await writeData({
          supportTickets: data.supportTickets.filter((item) => item.id !== ticketId),
        })
        const nextData = await readData()
        sendJson(response, 200, {
          supportTickets: nextData.supportTickets,
          updatedAt: nextData.updatedAt,
        })
        return
      }

      sendJson(response, 405, { message: 'Method tidak diizinkan.' })
    } catch (error) {
      sendJson(response, 400, {
        message: error.message || 'Data bantuan tidak bisa diproses.',
      })
    }
  }

  const handleSubmissionsRequest = async (request, response) => {
    try {
      if (request.method === 'GET') {
        const data = await readData()
        const url = new URL(request.url || '/', 'http://localhost')
        const role = url.searchParams.get('role') === 'admin' ? 'admin' : 'member'
        const userId = cleanText(url.searchParams.get('userId') || '', 90)
        const submissions =
          role === 'admin'
            ? data.submissions
            : data.submissions.filter((item) => item.memberId === userId)

        sendJson(response, 200, {
          submissions,
          updatedAt: data.updatedAt,
        })
        return
      }

      if (request.method === 'POST') {
        const payload = JSON.parse((await readRequestBody(request)) || '{}')
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
          status: 'Menunggu Review',
          feedback: '',
          submittedAt: new Date().toISOString(),
        }

        await writeData({ submissions: [nextSubmission, ...data.submissions] })
        const nextData = await readData()
        const submissions = nextSubmission.memberId
          ? nextData.submissions.filter(
              (item) => item.memberId === nextSubmission.memberId,
            )
          : nextData.submissions

        sendJson(response, 200, {
          submissions,
          updatedAt: nextData.updatedAt,
        })
        return
      }

      if (request.method === 'PUT') {
        const payload = JSON.parse((await readRequestBody(request)) || '{}')
        const submissionId = cleanText(payload.id, 90)
        const data = await readData()

        await writeData({
          submissions: data.submissions.map((item) =>
            item.id === submissionId
              ? {
                  ...item,
                  status: cleanText(payload.status || item.status, 40),
                  feedback: cleanText(payload.feedback ?? item.feedback, 1200),
                }
              : item,
          ),
        })
        const nextData = await readData()
        sendJson(response, 200, {
          submissions: nextData.submissions,
          updatedAt: nextData.updatedAt,
        })
        return
      }

      if (request.method === 'DELETE') {
        const submissionId = getRequestId(request)
        const data = await readData()

        await writeData({
          submissions: data.submissions.filter((item) => item.id !== submissionId),
        })
        const nextData = await readData()
        sendJson(response, 200, {
          submissions: nextData.submissions,
          updatedAt: nextData.updatedAt,
        })
        return
      }

      sendJson(response, 405, { message: 'Method tidak diizinkan.' })
    } catch (error) {
      sendJson(response, 400, {
        message: error.message || 'Data tugas tidak bisa diproses.',
      })
    }
  }

  const handleProfileRequest = async (request, response) => {
    try {
      if (!['GET', 'PUT'].includes(request.method || '')) {
        sendJson(response, 405, { message: 'Method tidak diizinkan.' })
        return
      }

      const payload =
        request.method === 'PUT'
          ? JSON.parse((await readRequestBody(request)) || '{}')
          : {}
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
        sendJson(response, 200, {
          session: {
            userId: account.id,
            name: account.name,
            username: account.username,
            role,
            avatar: account.avatar || '',
            signedInAt: new Date().toISOString(),
          },
        })
        return
      }

      const nextAccount = {
        ...account,
        name: cleanText(payload.name || account.name, 100),
        avatar: cleanImage(payload.avatar),
      }
      const nextAccounts = accounts.map((item) =>
        item.id === account.id ? nextAccount : item,
      )

      await writeData({
        admins: role === 'admin' ? nextAccounts : data.admins,
        members: role === 'member' ? nextAccounts : data.members,
      })

      sendJson(response, 200, {
        session: {
          userId: nextAccount.id,
          name: nextAccount.name,
          username: nextAccount.username,
          role,
          avatar: nextAccount.avatar || '',
          signedInAt: new Date().toISOString(),
        },
      })
    } catch (error) {
      sendJson(response, 400, {
        message: error.message || 'Profil tidak bisa diproses.',
      })
    }
  }

  const handleLoginRequest = async (request, response) => {
    try {
      if (request.method !== 'POST') {
        sendJson(response, 405, { message: 'Method tidak diizinkan.' })
        return
      }

      const payload = JSON.parse((await readRequestBody(request)) || '{}')
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
        sendJson(response, 401, {
          message: 'Username atau password tidak sesuai.',
        })
        return
      }

      sendJson(response, 200, {
        session: {
          userId: account.id,
          name: account.name,
          username: account.username,
          role: account.role,
          avatar: account.avatar || '',
          signedInAt: new Date().toISOString(),
        },
      })
    } catch (error) {
      sendJson(response, 400, {
        message: error.message || 'Login tidak bisa diproses.',
      })
    }
  }

  const handleLogoutRequest = async (request, response) => {
    if (!['GET', 'POST'].includes(request.method || '')) {
      sendJson(response, 405, { message: 'Method tidak diizinkan.' })
      return
    }

    sendJson(response, 200, { message: 'Logout berhasil.' })
  }

  const registerRoutes = (server) => {
    server.middlewares.use('/api/classes', handleClassesRequest)
    server.middlewares.use('/api/classes.php', handleClassesRequest)
    server.middlewares.use('/api/members', handleMembersRequest)
    server.middlewares.use('/api/members.php', handleMembersRequest)
    server.middlewares.use('/api/support', handleSupportRequest)
    server.middlewares.use('/api/support.php', handleSupportRequest)
    server.middlewares.use('/api/submissions', handleSubmissionsRequest)
    server.middlewares.use('/api/submissions.php', handleSubmissionsRequest)
    server.middlewares.use('/api/login', handleLoginRequest)
    server.middlewares.use('/api/login.php', handleLoginRequest)
    server.middlewares.use('/api/profile', handleProfileRequest)
    server.middlewares.use('/api/profile.php', handleProfileRequest)
    server.middlewares.use('/api/logout', handleLogoutRequest)
    server.middlewares.use('/api/logout.php', handleLogoutRequest)
  }

  return {
    name: 'local-data-json-api',
    configureServer(server) {
      registerRoutes(server)
    },
    configurePreviewServer(server) {
      registerRoutes(server)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localDataPlugin()],
})
