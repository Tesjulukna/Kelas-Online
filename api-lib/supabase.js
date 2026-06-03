/* global Buffer, process */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'

const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || '')
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  ''
const publicBucket = process.env.SUPABASE_PUBLIC_BUCKET || 'ibnu-assets'
const videoBucket = process.env.SUPABASE_VIDEO_BUCKET || 'ibnu-videos'
const maxVideoUploadMb = Number(process.env.MAX_VIDEO_UPLOAD_MB || 80)

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

function normalizeSupabaseUrl(value) {
  const rawUrl = String(value || '').trim()

  if (!rawUrl) {
    return ''
  }

  try {
    return new URL(rawUrl).origin.replace(/\/+$/, '')
  } catch {
    return rawUrl
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/storage\/v1\/?$/i, '')
      .replace(/\/+$/, '')
  }
}

export function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

export function apiHandler(handler, allowedMethods = []) {
  return async function handleApi(request, response) {
    if (request.method === 'OPTIONS') {
      response.statusCode = 204
      response.end()
      return
    }

    if (allowedMethods.length && !allowedMethods.includes(request.method || 'GET')) {
      sendJson(response, 405, { message: 'Method tidak diizinkan.' })
      return
    }

    try {
      await handler(request, response)
    } catch (error) {
      const statusCode = error.statusCode || 500
      sendJson(response, statusCode, {
        message:
          error.message ||
          (statusCode >= 500 ? 'Server tidak bisa memproses data.' : 'Permintaan tidak valid.'),
      })
    }
  }
}

function assertConfig() {
  if (!supabaseUrl || !serviceKey) {
    throw new ApiError(500, 'Environment Supabase belum diisi di Vercel.')
  }
}

function cleanText(value, maxLength = 80) {
  return String(value ?? '')
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, maxLength)
}

function cleanRichHtml(value, maxLength = 6000) {
  return String(value ?? '')
    .slice(0, maxLength)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/<(?!\/?(p|br|strong|b|em|i|ul|ol|li|span|div)\b)[^>]*>/gi, '')
}

function cleanPromptText(value) {
  return String(value ?? '').split(String.fromCharCode(0)).join('')
}

function cleanUsername(value) {
  return cleanText(value, 40).toLowerCase().replace(/[^a-z0-9._-]/g, '')
}

function cleanSessionToken(value) {
  return String(value ?? '').replace(/[^a-f0-9]/gi, '').slice(0, 128)
}

function cleanEmail(value) {
  const email = cleanText(value, 120).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function cleanNumber(value, min = 0, max = 1000000) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : min
}

function cleanBoolean(value, fallback = false) {
  return value === undefined ? fallback : Boolean(value)
}

function cleanUrl(value, maxLength = 600) {
  const rawUrl = String(value ?? '').trim()
  const url = cleanText(rawUrl, maxLength)

  if (!url) {
    return ''
  }

  if (url.startsWith('/uploads/')) {
    return url
  }

  if (rawUrl.startsWith('data:image/') && rawUrl.length <= 3_000_000) {
    return rawUrl
  }

  if (rawUrl.startsWith('data:application/pdf') && rawUrl.length <= 8_000_000) {
    return rawUrl
  }

  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href.slice(0, maxLength) : ''
  } catch {
    return ''
  }
}

function cleanExternalUrl(value) {
  const rawUrl = cleanText(value, 360)

  if (!rawUrl) {
    return ''
  }

  try {
    const url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

function cleanYoutubeUrl(value) {
  const url = cleanText(value, 260)

  if (!url) {
    return ''
  }

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    return ['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host) ? url : ''
  } catch {
    return ''
  }
}

function parseJson(value, fallback = null) {
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return value
  }

  try {
    return JSON.parse(String(value ?? ''))
  } catch {
    return fallback
  }
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}`
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex')
}

function legacyPasswordHash(password) {
  return sha256(`ibnucreative:${String(password ?? '')}`)
}

async function hashPasswordValue(password) {
  return bcrypt.hash(String(password ?? ''), 10)
}

async function verifyPasswordValue(password, hash) {
  const storedHash = String(hash ?? '')

  if (storedHash.startsWith('$2')) {
    return bcrypt.compare(String(password ?? ''), storedHash.replace(/^\$2y\$/, '$2a$'))
  }

  return storedHash === legacyPasswordHash(password)
}

function tokenHash(token) {
  return sha256(token)
}

async function readJson(request) {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) {
    return request.body
  }

  if (typeof request.body === 'string') {
    return parseJson(request.body, {})
  }

  if (Buffer.isBuffer(request.body)) {
    return parseJson(request.body.toString('utf8'), {})
  }

  let rawBody = ''

  for await (const chunk of request) {
    rawBody += chunk
  }

  return parseJson(rawBody, {})
}

async function readRawBody(request) {
  if (typeof request.body === 'string') {
    return request.body
  }

  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) {
    return JSON.stringify(request.body)
  }

  if (Buffer.isBuffer(request.body)) {
    return request.body.toString('utf8')
  }

  let rawBody = ''

  for await (const chunk of request) {
    rawBody += chunk
  }

  return rawBody
}

async function rest(path, options = {}) {
  assertConfig()

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  const data = text ? parseJson(text, text) : null

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && (data.message || data.details || data.hint)) ||
      'Query Supabase gagal.'
    throw new ApiError(response.status, message)
  }

  return data
}

async function storage(path, options = {}) {
  assertConfig()

  const response = await fetch(`${supabaseUrl}/storage/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  const data = text ? parseJson(text, text) : null

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && (data.message || data.error)) ||
      'Storage Supabase gagal.'
    throw new ApiError(response.status, message)
  }

  return data
}

function eq(value) {
  return encodeURIComponent(String(value ?? ''))
}

function pathPart(value) {
  return String(value ?? '')
    .split('/')
    .map((item) => encodeURIComponent(item))
    .join('/')
}

function publicStorageUrl(bucket, path) {
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${pathPart(path)}`
}

async function createSignedUploadUrl(bucket, path, { upsert = false } = {}) {
  const data = await storage(
    `object/upload/sign/${encodeURIComponent(bucket)}/${pathPart(path)}`,
    {
      method: 'POST',
      body: {},
      headers: upsert ? { 'x-upsert': 'true' } : {},
    },
  )
  const relativeUrl = data.url || data.signedURL || data.signedUrl || ''
  const signedUrl = /^https?:\/\//i.test(relativeUrl)
    ? relativeUrl
    : `${supabaseUrl}/storage/v1${relativeUrl}`

  return {
    signedUrl,
    path,
    token: new URL(signedUrl).searchParams.get('token') || '',
  }
}

async function createSignedReadUrl(bucket, path, expiresIn = 900) {
  const data = await storage(`object/sign/${encodeURIComponent(bucket)}/${pathPart(path)}`, {
    method: 'POST',
    body: { expiresIn },
  })
  const relativeUrl = data.signedURL || data.signedUrl || ''

  return /^https?:\/\//i.test(relativeUrl)
    ? relativeUrl
    : `${supabaseUrl}/storage/v1${relativeUrl}`
}

function accountPublic(account, progressRows = [], sessionRows = []) {
  const lastSeenAt = sessionRows
    .filter((item) => item.account_id === account.id)
    .map((item) => item.last_seen_at)
    .filter(Boolean)
    .sort()
    .at(-1) || ''
  const lastSeenTime = lastSeenAt ? Date.parse(lastSeenAt) : 0

  return {
    id: account.id,
    name: account.name,
    username: account.username,
    email: account.email || '',
    status: account.status,
    avatar: account.avatar || '',
    allowedClassIds: parseJson(account.allowed_class_ids, null),
    joinedAt: account.joined_at || '',
    lastSeenAt,
    isOnline: lastSeenTime > 0 && Date.now() - lastSeenTime < 5 * 60 * 1000,
    learningProgress: progressRows
      .filter((row) => row.member_id === account.id)
      .map((row) => ({
        classId: row.class_id,
        classTitle: row.class_title || 'Kelas',
        materialId: row.material_id || '',
        materialTitle: row.material_title || 'Materi',
        materialIndex: Number(row.material_index) || 0,
        materialCount: Number(row.material_count) || 0,
        progressPercent: Number(row.progress_percent) || 0,
        lastActivityAt: row.last_activity_at || row.updated_at || '',
      })),
  }
}

function sessionPayload(account, token = '') {
  return {
    userId: account.id,
    name: account.name,
    username: account.username,
    role: account.role,
    avatar: account.avatar || '',
    allowedClassIds:
      account.role === 'member' ? parseJson(account.allowed_class_ids, null) : null,
    token,
    signedInAt: new Date().toISOString(),
  }
}

function requestSessionToken(request) {
  const headerToken = cleanSessionToken(request.headers['x-session-token'])
  const authHeader = String(request.headers.authorization || '')
  const url = new URL(request.url || '/', 'http://localhost')
  const queryToken = cleanSessionToken(url.searchParams.get('token') || '')

  if (headerToken) {
    return headerToken
  }

  if (queryToken) {
    return queryToken
  }

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return cleanSessionToken(authHeader.slice(7))
  }

  return ''
}

export async function currentUser(request) {
  const token = requestSessionToken(request)

  if (!token) {
    return null
  }

  const sessions = await rest(
    `auth_sessions?select=*&token_hash=eq.${eq(tokenHash(token))}&expires_at=gt.${eq(
      new Date().toISOString(),
    )}&limit=1`,
  )
  const session = sessions?.[0]

  if (!session) {
    return null
  }

  const accounts = await rest(
    `accounts?select=*&id=eq.${eq(session.account_id)}&role=eq.${eq(
      session.role,
    )}&status=eq.${eq('Aktif')}&limit=1`,
  )
  const account = accounts?.[0]

  if (!account) {
    return null
  }

  await rest(`auth_sessions?id=eq.${eq(session.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: { last_seen_at: new Date().toISOString() },
  })

  return sessionPayload(account, token)
}

export async function requireUser(request, role = null) {
  const user = await currentUser(request)

  if (!user) {
    throw new ApiError(401, 'Silakan login dulu.')
  }

  if (role && user.role !== role) {
    throw new ApiError(403, 'Akses tidak diizinkan.')
  }

  return user
}

function mapClass(row, materials) {
  return {
    id: row.id,
    title: row.title,
    students: Number(row.students) || 0,
    status: row.status,
    revenue: row.revenue,
    lynkProductKey: row.lynk_product_key || '',
    thumbnail: row.thumbnail || '',
    mentor: row.mentor,
    progress: Number(row.progress) || 0,
    next: row.next_label,
    liveAt: row.live_at,
    lessons: row.lessons,
    materials,
  }
}

function mapMaterial(row, assets) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    videoUrl: row.video_url || '',
    videoFile: row.video_file || '',
    videoName: row.video_name || '',
    videoType: row.video_type || '',
    pdfFile: row.pdf_file || '',
    pdfName: row.pdf_name || '',
    resourceLinks: parseJson(row.resource_links, []),
    requiresTask: Boolean(row.requires_task),
    allowTaskImage: row.allow_task_image !== false,
    requireTaskImage: Boolean(row.require_task_image),
    taskPrompt: row.task_prompt || '',
    promptItems: assets.map((asset) => ({
      id: asset.id,
      title: asset.title,
      image: asset.image || '',
      prompt: asset.prompt || '',
    })),
  }
}

export async function fetchClasses() {
  const [classRows, materialRows, assetRows] = await Promise.all([
    rest('classes?select=*&order=updated_at.desc,id.asc'),
    rest('materials?select=*&order=sort_order.asc,id.asc'),
    rest('material_assets?select=*&order=sort_order.asc,id.asc'),
  ])
  const assetsByMaterial = new Map()
  const materialsByClass = new Map()

  for (const asset of assetRows || []) {
    assetsByMaterial.set(asset.material_id, [
      ...(assetsByMaterial.get(asset.material_id) || []),
      asset,
    ])
  }

  for (const material of materialRows || []) {
    materialsByClass.set(material.class_id, [
      ...(materialsByClass.get(material.class_id) || []),
      mapMaterial(material, assetsByMaterial.get(material.id) || []),
    ])
  }

  const updatedCandidates = [
    ...(classRows || []).map((row) => row.updated_at),
    ...(materialRows || []).map((row) => row.updated_at),
    ...(assetRows || []).map((row) => row.updated_at),
  ].filter(Boolean)

  return {
    classes: (classRows || []).map((row) =>
      mapClass(row, materialsByClass.get(row.id) || []),
    ),
    updatedAt: updatedCandidates.sort().at(-1) || new Date().toISOString(),
  }
}

function cleanResourceLinks(value) {
  const links = Array.isArray(value) ? value.slice(0, 40) : []

  return links
    .map((link, index) => ({
      id: cleanText(link?.id || `resource-link-${index + 1}`, 120),
      title: cleanText(link?.title || `Link ${index + 1}`, 120),
      url: cleanExternalUrl(link?.url || ''),
    }))
    .filter((link) => link.url)
}

function cleanClassesForDb(value) {
  const source = Array.isArray(value) ? value.slice(0, 200) : []

  return source
    .filter((item) => item?.id && item?.title)
    .map((item, classIndex) => {
      const classId = cleanText(item.id || makeId('class'), 120)
      const materials = Array.isArray(item.materials) ? item.materials.slice(0, 80) : []

      return {
        classRow: {
          id: classId,
          title: cleanText(item.title || `Kelas ${classIndex + 1}`, 160),
          students: cleanNumber(item.students, 0, 1000000),
          status: cleanText(item.status || 'Aktif', 40),
          revenue: cleanText(item.revenue || 'Rp 0', 80),
          lynk_product_key: cleanText(item.lynkProductKey || '', 180),
          thumbnail: cleanUrl(item.thumbnail || ''),
          mentor: cleanText(item.mentor || 'Ibnu Creative', 120),
          progress: cleanNumber(item.progress, 0, 100),
          next_label: cleanText(item.next || 'Lanjutkan modul berikutnya', 160),
          live_at: cleanText(item.liveAt || 'Jadwal menyusul', 160),
          lessons: cleanText(item.lessons || `${materials.length} materi`, 80),
        },
        materials: materials
          .filter((material) => material?.title || material?.videoUrl || material?.videoFile)
          .map((material, materialIndex) => {
            const materialId = cleanText(
              material.id || `${classId}-material-${materialIndex + 1}`,
              120,
            )

            return {
              materialRow: {
                id: materialId,
                class_id: classId,
                sort_order: materialIndex + 1,
                title: cleanText(material.title || `Materi ${materialIndex + 1}`, 160),
                description: cleanRichHtml(material.description || ''),
                video_url: cleanYoutubeUrl(material.videoUrl || ''),
                video_file: cleanText(material.videoFile || '', 240),
                video_name: cleanText(material.videoName || '', 180),
                video_type: cleanText(material.videoType || '', 100),
                pdf_file: cleanUrl(material.pdfFile || ''),
                pdf_name: cleanText(material.pdfName || '', 180),
                resource_links: JSON.stringify(cleanResourceLinks(material.resourceLinks)),
                requires_task: Boolean(material.requiresTask),
                allow_task_image: cleanBoolean(material.allowTaskImage, true),
                require_task_image: Boolean(material.requireTaskImage),
                task_prompt: cleanText(
                  material.taskPrompt || 'Kirim link tugas atau catatan praktik materi ini.',
                  500,
                ),
              },
              assets: (Array.isArray(material.promptItems)
                ? material.promptItems.slice(0, 80)
                : []
              )
                .filter((asset) => asset?.image || asset?.prompt)
                .map((asset, assetIndex) => ({
                  id: cleanText(asset.id || `${materialId}-asset-${assetIndex + 1}`, 120),
                  material_id: materialId,
                  sort_order: assetIndex + 1,
                  title: cleanText(asset.title || `Prompt ${assetIndex + 1}`, 160),
                  image: cleanUrl(asset.image || ''),
                  prompt: cleanPromptText(asset.prompt || ''),
                })),
            }
          }),
      }
    })
}

export async function replaceClasses(classes) {
  const cleanClasses = cleanClassesForDb(classes)
  const classRows = cleanClasses.map((item) => item.classRow)
  const materialRows = cleanClasses.flatMap((item) => item.materials.map((row) => row.materialRow))
  const assetRows = cleanClasses.flatMap((item) => item.materials.flatMap((row) => row.assets))

  await rest('classes?id=not.is.null', {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })

  if (classRows.length) {
    await rest('classes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: classRows,
    })
  }

  if (materialRows.length) {
    await rest('materials', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: materialRows,
    })
  }

  if (assetRows.length) {
    await rest('material_assets', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: assetRows,
    })
  }

  return fetchClasses()
}

export async function fetchMembers() {
  const now = new Date().toISOString()
  const [members, sessionRows, progressRows] = await Promise.all([
    rest('accounts?select=*&role=eq.member&order=created_at.desc,id.desc'),
    rest(
      `auth_sessions?select=account_id,last_seen_at,expires_at&role=eq.member&expires_at=gt.${eq(
        now,
      )}`,
    ),
    rest('member_progress?select=*&order=last_activity_at.desc'),
  ])

  return {
    members: (members || []).map((account) =>
      accountPublic(account, progressRows || [], sessionRows || []),
    ),
    updatedAt: new Date().toISOString(),
  }
}

async function assertUniqueUsername(username, ignoredId = '') {
  const existing = await rest(
    `accounts?select=id&role=eq.member&username=eq.${eq(username)}&limit=1`,
  )

  if (existing?.[0] && existing[0].id !== ignoredId) {
    throw new ApiError(400, 'Username sudah dipakai member lain.')
  }
}

export async function createMember(payload) {
  const username = cleanUsername(payload.username)
  const password = String(payload.password ?? '')

  if (!username || password.length < 6) {
    throw new ApiError(400, 'Username dan password minimal 6 karakter wajib diisi.')
  }

  await assertUniqueUsername(username)
  await rest('accounts', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: {
      id: makeId('member'),
      role: 'member',
      name: cleanText(payload.name || username, 120),
      username,
      email: cleanEmail(payload.email),
      status: cleanText(payload.status || 'Aktif', 40),
      avatar: cleanUrl(payload.avatar || ''),
      allowed_class_ids: Array.isArray(payload.allowedClassIds)
        ? JSON.stringify(payload.allowedClassIds.map((classId) => cleanText(classId, 120)))
        : null,
      password_hash: await hashPasswordValue(password),
      joined_at: new Date().toISOString().slice(0, 10),
    },
  })

  return fetchMembers()
}

export async function updateMember(payload) {
  const memberId = cleanText(payload.id, 120)
  const username = cleanUsername(payload.username)

  if (!memberId || !username) {
    throw new ApiError(400, 'Data member tidak ditemukan atau username kosong.')
  }

  if (payload.password && String(payload.password).length < 6) {
    throw new ApiError(400, 'Password minimal 6 karakter.')
  }

  const existing = await rest(`accounts?select=*&id=eq.${eq(memberId)}&role=eq.member&limit=1`)

  if (!existing?.[0]) {
    throw new ApiError(404, 'Member tidak ditemukan.')
  }

  await assertUniqueUsername(username, memberId)

  const nextMember = {
    name: cleanText(payload.name || username, 120),
    username,
    email: cleanEmail(payload.email),
    status: cleanText(payload.status || 'Aktif', 40),
    avatar: cleanUrl(payload.avatar || existing[0].avatar || ''),
    allowed_class_ids: Array.isArray(payload.allowedClassIds)
      ? JSON.stringify(payload.allowedClassIds.map((classId) => cleanText(classId, 120)))
      : null,
  }

  if (payload.password) {
    nextMember.password_hash = await hashPasswordValue(payload.password)
  }

  await rest(`accounts?id=eq.${eq(memberId)}&role=eq.member`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: nextMember,
  })

  return fetchMembers()
}

export async function deleteMember(memberId) {
  const id = cleanText(memberId, 120)

  if (!id) {
    throw new ApiError(400, 'ID member wajib dikirim.')
  }

  await rest(`accounts?id=eq.${eq(id)}&role=eq.member`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })
  await rest(`support_tickets?member_id=eq.${eq(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: { status: 'Member dihapus' },
  })
  await rest(`member_progress?member_id=eq.${eq(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })

  return fetchMembers()
}

function mapTicket(row) {
  const replies = parseJson(row.replies, [])

  return {
    id: row.id,
    memberId: row.member_id || '',
    memberName: row.member_name || 'Member',
    subject: row.subject || 'Bantuan mentor',
    message: row.message || '',
    status: row.status || 'Menunggu',
    priority: row.priority || 'Normal',
    answer: row.answer || '',
    replies: Array.isArray(replies) ? replies : [],
    createdAt: row.created_at || '',
  }
}

export async function fetchSupportTickets(user) {
  const query =
    user.role === 'admin'
      ? 'support_tickets?select=*&order=created_at.desc,id.desc'
      : `support_tickets?select=*&member_id=eq.${eq(user.userId)}&order=created_at.desc,id.desc`
  const rows = await rest(query)

  return {
    supportTickets: (rows || []).map(mapTicket),
    updatedAt: new Date().toISOString(),
  }
}

export async function createSupportTicket(user, payload) {
  const message = cleanText(payload.message, 600)

  if (!message) {
    throw new ApiError(400, 'Pertanyaan bantuan wajib diisi.')
  }

  const memberId = user.role === 'member' ? user.userId : cleanText(payload.memberId, 120)
  const memberName = user.role === 'member' ? user.name : cleanText(payload.memberName || 'Member', 120)
  const ticket = {
    id: makeId('ticket'),
    member_id: memberId,
    member_name: memberName,
    subject: cleanText(payload.subject || 'Bantuan mentor', 160),
    message,
    status: 'Menunggu',
    priority: cleanText(payload.priority || 'Normal', 40),
    answer: '',
    replies: JSON.stringify([
      {
        id: makeId('reply'),
        senderRole: user.role === 'admin' ? 'admin' : 'member',
        senderName: user.name,
        message,
        createdAt: new Date().toISOString(),
      },
    ]),
    created_at: new Date().toISOString(),
  }

  await rest('support_tickets', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: ticket,
  })

  return fetchSupportTickets(user)
}

export async function updateSupportTicket(user, payload) {
  const ticketId = cleanText(payload.id, 120)
  const rows = await rest(`support_tickets?select=*&id=eq.${eq(ticketId)}&limit=1`)
  const ticket = rows?.[0]

  if (!ticket) {
    throw new ApiError(404, 'Tiket bantuan tidak ditemukan.')
  }

  if (user.role !== 'admin' && ticket.member_id !== user.userId) {
    throw new ApiError(403, 'Akses tiket tidak diizinkan.')
  }

  const message = cleanText(payload.message ?? payload.answer ?? '', 600)
  const senderRole = user.role === 'admin' ? 'admin' : 'member'
  const replies = parseJson(ticket.replies, [])
  const nextReplies = message
    ? [
        ...(Array.isArray(replies) ? replies : []),
        {
          id: makeId('reply'),
          senderRole,
          senderName: cleanText(payload.senderName || user.name, 120),
          message,
          createdAt: new Date().toISOString(),
        },
      ]
    : replies

  await rest(`support_tickets?id=eq.${eq(ticketId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: {
      status: cleanText(payload.status || ticket.status, 40),
      answer: senderRole === 'admin' && message ? message : ticket.answer || '',
      replies: JSON.stringify(nextReplies),
    },
  })

  return fetchSupportTickets(user)
}

export async function deleteSupportTicket(ticketId) {
  await rest(`support_tickets?id=eq.${eq(cleanText(ticketId, 120))}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })

  return fetchSupportTickets({ role: 'admin' })
}

function mapSubmission(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name || 'Member',
    classId: row.class_id || '',
    classTitle: row.class_title || '',
    materialId: row.material_id || '',
    materialTitle: row.material_title || '',
    answer: row.answer || '',
    attachmentUrl: row.attachment_url || '',
    attachmentName: row.attachment_name || '',
    status: row.status || 'Menunggu Review',
    feedback: row.feedback || '',
    rating: Number(row.rating) || 0,
    submittedAt: row.submitted_at || '',
  }
}

export async function fetchSubmissions(user) {
  const query =
    user.role === 'admin'
      ? 'submissions?select=*&order=submitted_at.desc,id.desc'
      : `submissions?select=*&member_id=eq.${eq(user.userId)}&order=submitted_at.desc,id.desc`
  const rows = await rest(query)

  return {
    submissions: (rows || []).map(mapSubmission),
    updatedAt: new Date().toISOString(),
  }
}

export async function createSubmission(user, payload) {
  const answer = cleanText(payload.answer, 1200)

  if (!answer) {
    throw new ApiError(400, 'Isi tugas wajib dikirim.')
  }

  await rest('submissions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: {
      id: makeId('submission'),
      member_id: user.userId,
      member_name: user.name,
      class_id: cleanText(payload.classId || '', 120),
      class_title: cleanText(payload.classTitle || 'Kelas', 160),
      material_id: cleanText(payload.materialId || '', 120),
      material_title: cleanText(payload.materialTitle || 'Materi', 160),
      answer,
      attachment_url: cleanUrl(payload.attachmentUrl || ''),
      attachment_name: cleanText(payload.attachmentName || '', 180),
      status: 'Menunggu Review',
      feedback: '',
      rating: 0,
      submitted_at: new Date().toISOString(),
    },
  })

  return fetchSubmissions(user)
}

export async function updateSubmission(payload) {
  const submissionId = cleanText(payload.id, 120)

  if (!submissionId) {
    throw new ApiError(400, 'ID tugas wajib dikirim.')
  }

  await rest(`submissions?id=eq.${eq(submissionId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: {
      status: cleanText(payload.status || 'Direview', 40),
      feedback: cleanText(payload.feedback || '', 1200),
      rating: cleanNumber(payload.rating || 0, 0, 5),
    },
  })

  return fetchSubmissions({ role: 'admin' })
}

export async function deleteSubmission(submissionId) {
  await rest(`submissions?id=eq.${eq(cleanText(submissionId, 120))}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })

  return fetchSubmissions({ role: 'admin' })
}

export async function trackProgress(user, payload) {
  const classId = cleanText(payload.classId, 120)
  const materialId = cleanText(payload.materialId, 120)
  const materialIndex = cleanNumber(payload.materialIndex, 0, 10000)
  const materialCount = cleanNumber(payload.materialCount, 1, 10000)

  if (!classId || !materialId) {
    throw new ApiError(400, 'Data progress materi tidak lengkap.')
  }

  await rest('member_progress?on_conflict=member_id,class_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: {
      member_id: user.userId,
      class_id: classId,
      class_title: cleanText(payload.classTitle || 'Kelas', 160),
      material_id: materialId,
      material_title: cleanText(payload.materialTitle || 'Materi', 160),
      material_index: materialIndex,
      material_count: materialCount,
      progress_percent: Math.min(100, Math.round(((materialIndex + 1) / materialCount) * 100)),
      last_activity_at: new Date().toISOString(),
    },
  })

  return { ok: true, updatedAt: new Date().toISOString() }
}

export async function login(payload, userAgent = '') {
  const loginValue = cleanText(payload.username, 120)
  const username = cleanUsername(loginValue)
  const email = cleanEmail(loginValue)
  const password = String(payload.password ?? '')

  if ((!username && !email) || !password) {
    throw new ApiError(400, 'Username/email dan password wajib diisi.')
  }

  const queries = []

  if (username) {
    queries.push(rest(`accounts?select=*&status=eq.Aktif&username=eq.${eq(username)}`))
  }

  if (email) {
    queries.push(rest(`accounts?select=*&status=eq.Aktif&email=eq.${eq(email)}`))
  }

  const candidates = (await Promise.all(queries)).flat()
  const uniqueCandidates = [...new Map(candidates.map((item) => [item.id, item])).values()]
    .sort((a, b) => (a.role === 'admin' ? -1 : 1) - (b.role === 'admin' ? -1 : 1))
  let account = null

  for (const candidate of uniqueCandidates) {
    if (await verifyPasswordValue(password, candidate.password_hash)) {
      account = candidate
      break
    }
  }

  if (!account) {
    throw new ApiError(401, 'Username atau password tidak sesuai.')
  }

  const token = randomBytes(32).toString('hex')

  await rest(`auth_sessions?expires_at=lt.${eq(new Date().toISOString())}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })
  await rest('auth_sessions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: {
      id: makeId('session'),
      account_id: account.id,
      role: account.role,
      token_hash: tokenHash(token),
      user_agent: cleanText(userAgent, 255),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      last_seen_at: new Date().toISOString(),
    },
  })

  return { session: sessionPayload(account, token) }
}

export async function logout(request) {
  const token = requestSessionToken(request)

  if (token) {
    await rest(`auth_sessions?token_hash=eq.${eq(tokenHash(token))}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
  }

  return { message: 'Logout berhasil.' }
}

export async function updateProfile(user, payload) {
  await rest(`accounts?id=eq.${eq(user.userId)}&role=eq.${eq(user.role)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: {
      name: cleanText(payload.name || user.name, 120),
      avatar: cleanUrl(payload.avatar || ''),
    },
  })
  const rows = await rest(
    `accounts?select=*&id=eq.${eq(user.userId)}&role=eq.${eq(user.role)}&limit=1`,
  )
  const account = rows?.[0]

  if (!account) {
    throw new ApiError(404, 'Akun tidak ditemukan.')
  }

  return { session: sessionPayload(account, user.token) }
}

function extensionFromName(name, fallback = 'file') {
  const ext = cleanText(String(name || '').split('.').pop() || '', 12).toLowerCase()
  return /^[a-z0-9]+$/.test(ext) ? ext : fallback
}

function storagePath(folder, name, extension) {
  const safeName = cleanText(String(name || 'file').replace(/\.[^.]+$/, ''), 80)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'file'

  return `${folder}/${Date.now()}-${randomBytes(4).toString('hex')}-${safeName}.${extension}`
}

export async function prepareFileUpload(request, payload) {
  const user = await requireUser(request)
  const type = cleanText(payload.type || '', 40)
  const name = cleanText(payload.name || 'file', 180)
  const contentType = cleanText(payload.contentType || 'application/octet-stream', 120)
  const size = cleanNumber(payload.size, 0, 1024 * 1024 * 1024)
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  const configByType = {
    profile: {
      folder: `profiles/${user.userId}`,
      role: null,
      mimeTypes: imageTypes,
      maxBytes: 6 * 1024 * 1024,
    },
    task: {
      folder: `tugas/${user.userId}`,
      role: 'member',
      mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxBytes: 8 * 1024 * 1024,
    },
    'class-image': {
      folder: 'gambar',
      role: 'admin',
      mimeTypes: imageTypes,
      maxBytes: 8 * 1024 * 1024,
    },
    document: {
      folder: 'dokumen',
      role: 'admin',
      mimeTypes: ['application/pdf'],
      maxBytes: 25 * 1024 * 1024,
    },
  }
  const config = configByType[type]

  if (!config) {
    throw new ApiError(400, 'Tipe upload tidak valid.')
  }

  if (config.role && user.role !== config.role) {
    throw new ApiError(403, 'Akses upload tidak diizinkan.')
  }

  if (!config.mimeTypes.includes(contentType)) {
    throw new ApiError(400, 'Format file tidak sesuai.')
  }

  if (size <= 0 || size > config.maxBytes) {
    throw new ApiError(400, 'Ukuran file melebihi batas upload.')
  }

  const extension = extensionFromName(name, contentType === 'application/pdf' ? 'pdf' : 'jpg')
  const path = storagePath(config.folder, name, extension)
  const upload = await createSignedUploadUrl(publicBucket, path)

  return {
    ...upload,
    bucket: publicBucket,
    path,
    url: publicStorageUrl(publicBucket, path),
    name,
    type: contentType,
  }
}

export async function prepareVideoUpload(request, payload) {
  const user = await requireUser(request, 'admin')
  const name = cleanText(payload.name || 'video', 180)
  const contentType = cleanText(payload.contentType || 'application/octet-stream', 120)
  const size = cleanNumber(payload.size, 0, 10 * 1024 * 1024 * 1024)
  const allowedTypes = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-m4v',
  ]

  if (!allowedTypes.includes(contentType)) {
    throw new ApiError(400, 'Format video harus MP4, WebM, OGG, MOV, atau M4V.')
  }

  if (size <= 0 || size > maxVideoUploadMb * 1024 * 1024) {
    throw new ApiError(400, `Ukuran video maksimal ${maxVideoUploadMb} MB.`)
  }

  const extension = extensionFromName(name, 'mp4')
  const path = storagePath(`videos/${user.userId}`, name, extension)
  const upload = await createSignedUploadUrl(videoBucket, path)

  return {
    ...upload,
    bucket: videoBucket,
    path,
    file: path,
    name,
    type: contentType,
  }
}

export async function redirectProtectedVideo(request, response) {
  await requireUser(request)
  const url = new URL(request.url || '/', 'http://localhost')
  const file = cleanText(url.searchParams.get('file') || '', 300)

  if (!file || file.includes('..')) {
    throw new ApiError(400, 'File video tidak valid.')
  }

  const signedUrl = await createSignedReadUrl(videoBucket, file, 900)

  response.statusCode = 302
  response.setHeader('Location', signedUrl)
  response.end()
}

export { readJson }

function timingSafeSame(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ''))
  const rightBuffer = Buffer.from(String(right ?? ''))

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function nestedValue(payload, path) {
  let current = payload

  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return ''
    }

    current = current[segment]
  }

  return typeof current === 'string' || typeof current === 'number'
    ? cleanText(current, 240)
    : ''
}

function flattenValues(value) {
  if (!Array.isArray(value) && (!value || typeof value !== 'object')) {
    return [value]
  }

  return Object.values(value).flatMap((item) => flattenValues(item))
}

function firstValue(payload, paths) {
  for (const path of paths) {
    const value = nestedValue(payload, path)

    if (value) {
      return value
    }
  }

  return ''
}

function firstEmail(payload) {
  for (const value of flattenValues(payload)) {
    const email = cleanEmail(value)

    if (email) {
      return email
    }
  }

  return ''
}

function normalizeLynkKey(value) {
  return cleanText(value, 240)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function collectProductCandidates(payload) {
  const paths = [
    'product.id',
    'product.slug',
    'product.name',
    'product.title',
    'product_id',
    'product_slug',
    'product_name',
    'item.id',
    'item.slug',
    'item.name',
    'item.title',
    'item_id',
    'item_name',
    'name',
    'title',
  ]
  const candidates = paths.map((path) => firstValue(payload, [path])).filter(Boolean)

  const listPaths = [
    'items',
    'products',
    'line_items',
    'order_items',
    'message_data.items',
    'data.message_data.items',
  ]

  for (const listPath of listPaths) {
    const list = listPath.split('.').reduce((current, segment) => {
      if (!current || typeof current !== 'object') {
        return undefined
      }

      return current[segment]
    }, payload)

    if (!Array.isArray(list)) {
      continue
    }

    for (const item of list) {
      if (!item || typeof item !== 'object') {
        continue
      }

      for (const key of ['id', 'uuid', 'product_id', 'slug', 'name', 'title', 'product_name']) {
        if (item[key]) {
          candidates.push(cleanText(item[key], 240))
        }
      }
    }
  }

  return [...new Set(candidates.filter(Boolean))]
}

function isPaidEvent(payload) {
  const values = []
  const statusKeys = [
    'event',
    'type',
    'status',
    'payment_status',
    'transaction_status',
    'order_status',
    'message_action',
    'message_title',
    'message_code',
  ]

  for (const key of statusKeys) {
    if (payload?.[key]) {
      values.push(String(payload[key]).toLowerCase())
    }
  }

  for (const key of ['data', 'message_data', 'order', 'transaction', 'payment']) {
    const nested = payload?.[key]

    if (!nested || typeof nested !== 'object') {
      continue
    }

    for (const nestedKey of statusKeys) {
      if (nested[nestedKey]) {
        values.push(String(nested[nestedKey]).toLowerCase())
      }
    }
  }

  if (!values.length) {
    return true
  }

  return values.some((value) => /paid|received|success|settled|complete|berhasil|lunas|sukses/.test(value))
}

function generatedLynkPassword(email, secret) {
  return `IC-${createHmac('sha256', secret).update(email.toLowerCase()).digest('hex').slice(0, 10)}`
}

async function uniqueLynkUsername(email, name) {
  const rawBase = cleanUsername(email.split('@')[0] || name || 'member') || 'member'
  let username = rawBase
  let counter = 2

  while (true) {
    const existing = await rest(
      `accounts?select=id&role=eq.member&username=eq.${eq(username)}&limit=1`,
    )

    if (!existing?.[0]) {
      return username
    }

    username = `${rawBase}${counter}`
    counter += 1
  }
}

async function findLynkClasses(productCandidates) {
  const candidateKeys = [
    ...new Set(productCandidates.map((candidate) => normalizeLynkKey(candidate)).filter(Boolean)),
  ]
  const map = parseJson(process.env.LYNK_PRODUCT_CLASS_MAP || '{}', {})
  const classIds = []

  if (map && typeof map === 'object' && !Array.isArray(map)) {
    for (const [productKey, mappedIds] of Object.entries(map)) {
      if (!candidateKeys.includes(normalizeLynkKey(productKey))) {
        continue
      }

      for (const classId of Array.isArray(mappedIds) ? mappedIds : [mappedIds]) {
        classIds.push(cleanText(classId, 120))
      }
    }
  }

  const classes = await rest('classes?select=id,title,lynk_product_key&order=id.asc')

  for (const row of classes || []) {
    const rowKeys = [
      normalizeLynkKey(row.id),
      normalizeLynkKey(row.title),
      normalizeLynkKey(row.lynk_product_key || ''),
    ].filter(Boolean)

    if (
      candidateKeys.some((candidateKey) =>
        rowKeys.some(
          (rowKey) =>
            candidateKey === rowKey ||
            candidateKey.includes(rowKey) ||
            rowKey.includes(candidateKey),
        ),
      )
    ) {
      classIds.push(row.id)
    }
  }

  return [...new Set(classIds.filter(Boolean))]
}

async function incrementClassStudents(classIds) {
  for (const classId of classIds) {
    const rows = await rest(`classes?select=students&id=eq.${eq(classId)}&limit=1`)
    const current = Number(rows?.[0]?.students) || 0

    await rest(`classes?id=eq.${eq(classId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { students: current + 1 },
    })
  }
}

function loginUrlFromRequest(request) {
  const configured = cleanExternalUrl(process.env.SITE_LOGIN_URL || '')

  if (configured) {
    return configured
  }

  const host = cleanText(request.headers.host || '', 180)

  return host ? `https://${host}/login` : '/login'
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildCredentialsMessage(account) {
  return `Halo ${account.name},

Pembayaran kelas Anda melalui Lynk.id sudah berhasil dan akses belajar sudah aktif.

Login: ${account.loginUrl}
Email: ${account.email}
Username: ${account.username}
${
  account.password
    ? `Password: ${account.password}`
    : 'Password: gunakan password akun yang sudah pernah dibuat.'
}

Silakan login dan buka menu Kelas Saya.

IbnuCreative Academy`
}

async function sendResendEmail({ to, subject, text, html }) {
  const apiKey = cleanText(process.env.RESEND_API_KEY || '', 300)
  const from = cleanText(
    process.env.RESEND_FROM_EMAIL || process.env.LYNK_EMAIL_FROM || '',
    240,
  )
  const replyTo = cleanEmail(process.env.RESEND_REPLY_TO || '')

  if (!apiKey || !from) {
    return {
      sent: false,
      message: 'RESEND_API_KEY atau RESEND_FROM_EMAIL belum diisi.',
    }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ibnucreative-vercel-api',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    return {
      sent: false,
      message: data.message || data.error || 'Email Resend gagal dikirim.',
    }
  }

  return {
    sent: true,
    id: data.id || data.data?.id || '',
  }
}

async function sendResendCredentialsEmail(account) {
  if (process.env.LYNK_SEND_CREDENTIALS_EMAIL === 'false') {
    return {
      sent: false,
      message: 'Pengiriman email kredensial dinonaktifkan.',
    }
  }

  const text = buildCredentialsMessage(account)
  const safeName = escapeHtml(account.name)
  const passwordLine = account.password
    ? `<p><strong>Password:</strong> ${escapeHtml(account.password)}</p>`
    : '<p><strong>Password:</strong> gunakan password akun yang sudah pernah dibuat.</p>'
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2>Akses kelas IbnuCreative Anda sudah aktif</h2>
      <p>Halo ${safeName},</p>
      <p>Pembayaran kelas Anda melalui Lynk.id sudah berhasil dan akses belajar sudah aktif.</p>
      <p><strong>Login:</strong> <a href="${escapeHtml(account.loginUrl)}">${escapeHtml(account.loginUrl)}</a></p>
      <p><strong>Email:</strong> ${escapeHtml(account.email)}</p>
      <p><strong>Username:</strong> ${escapeHtml(account.username)}</p>
      ${passwordLine}
      <p>Silakan login dan buka menu Kelas Saya.</p>
      <p>IbnuCreative Academy</p>
    </div>
  `

  return sendResendEmail({
    to: account.email,
    subject: 'Akses kelas IbnuCreative Anda sudah aktif',
    text,
    html,
  })
}

function webhookSecretFromRequest(request, payload) {
  const authHeader = String(request.headers.authorization || '')
  const url = new URL(request.url || '/', 'http://localhost')

  return (
    cleanText(url.searchParams.get('secret') || '', 240) ||
    cleanText(request.headers['x-lynk-webhook-secret'] || '', 240) ||
    cleanText(request.headers['x-webhook-secret'] || '', 240) ||
    cleanText(request.headers['x-merchant-key'] || '', 240) ||
    cleanText(request.headers.merchant_key || '', 240) ||
    (authHeader.toLowerCase().startsWith('bearer ')
      ? cleanText(authHeader.slice(7), 240)
      : '') ||
    firstValue(payload, [
      'merchant_key',
      'merchantKey',
      'merchantKeyId',
      'merchant.key',
      'data.merchant_key',
      'data.merchantKey',
    ])
  )
}

function validLynkSignature(request, rawBody, secret) {
  const signatures = [
    request.headers['x-lynk-signature'],
    request.headers['x-signature'],
    request.headers['x-webhook-signature'],
    request.headers.signature,
  ].filter(Boolean)
  const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex')
  const expectedBase64 = createHmac('sha256', secret).update(rawBody).digest('base64')

  return signatures.some((signature) => {
    const cleanSignature = String(signature).trim().replace(/^sha256=/i, '')

    return timingSafeSame(cleanSignature, expectedHex) || timingSafeSame(cleanSignature, expectedBase64)
  })
}

export async function processLynkWebhook(request) {
  const secret = cleanText(process.env.LYNK_WEBHOOK_SECRET || '', 240)
  const rawBody = await readRawBody(request)
  const payload = parseJson(rawBody, null)

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(400, 'Payload webhook tidak valid.')
  }

  if (!secret) {
    throw new ApiError(500, 'Merchant Key Lynk.id belum diisi di environment Vercel.')
  }

  const givenSecret = webhookSecretFromRequest(request, payload)

  if (!timingSafeSame(secret, givenSecret) && !validLynkSignature(request, rawBody, secret)) {
    throw new ApiError(401, 'Merchant Key webhook Lynk.id tidak valid.')
  }

  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload
  const eventId = firstValue(payload, ['id', 'event_id', 'webhook_id', 'data.id'])
  const orderId =
    firstValue(payload, [
      'order_id',
      'order.id',
      'transaction_id',
      'transaction.id',
      'invoice_id',
      'invoice.id',
      'payment_id',
      'payment.id',
      'data.order_id',
      'data.transaction_id',
      'data.invoice_id',
      'data.message_id',
      'data.message_data.refId',
      'message_id',
      'message_data.refId',
      'refId',
    ]) || eventId || sha256(rawBody)
  const buyerEmail = firstEmail(payload)
  const buyerName =
    firstValue(payload, [
      'buyer.name',
      'customer.name',
      'user.name',
      'order.customer_name',
      'data.buyer.name',
      'data.customer.name',
      'data.message_data.customer.name',
      'message_data.customer.name',
      'buyer_name',
      'customer_name',
      'name',
    ]) || 'Pembeli Lynk.id'
  const productCandidates = [
    ...new Set([...collectProductCandidates(payload), ...collectProductCandidates(data)]),
  ]
  const productKey = cleanText(productCandidates[0] || '', 240)

  if (!isPaidEvent(payload)) {
    return {
      ok: true,
      ignored: true,
      message: 'Webhook diterima, tetapi status pembayaran belum sukses.',
    }
  }

  const savedOrders = await rest(`lynk_orders?select=*&order_id=eq.${eq(orderId)}&limit=1`)
  const savedOrder = savedOrders?.[0]

  if (savedOrder) {
    const savedEmail = cleanEmail(savedOrder.buyer_email || '')

    return {
      ok: true,
      duplicate: true,
      message: 'Order Lynk.id sudah pernah diproses.',
      account: {
        name: savedOrder.buyer_name,
        email: savedOrder.buyer_email,
        username: savedOrder.username,
        password: savedOrder.password_created && savedEmail
          ? generatedLynkPassword(savedEmail, secret)
          : null,
        loginUrl: loginUrlFromRequest(request),
      },
    }
  }

  if (!buyerEmail) {
    throw new ApiError(422, 'Email pembeli tidak ditemukan pada payload Lynk.id.')
  }

  const classIds = await findLynkClasses(productCandidates)

  if (!classIds.length) {
    await rest('lynk_orders', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: {
        id: makeId('lynk'),
        event_id: eventId,
        order_id: orderId,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        product_key: productKey,
        product_name: productKey,
        class_ids: JSON.stringify([]),
        status: 'unmapped',
        payload: rawBody,
      },
    })

    return {
      ok: true,
      ignored: true,
      status: 'unmapped',
      message: 'Produk Lynk.id tidak dipetakan ke kelas website, jadi tidak dibuatkan akun member.',
      productCandidates,
    }
  }

  const memberRows = await rest(
    `accounts?select=*&role=eq.member&email=eq.${eq(buyerEmail)}&limit=1`,
  )
  const existingMember = memberRows?.[0]
  const password = generatedLynkPassword(buyerEmail, secret)
  const resetExistingPassword = process.env.LYNK_RESET_EXISTING_MEMBER_PASSWORD === 'true'
  let member = existingMember
  let passwordCreated
  let newAccessIds = classIds

  if (existingMember) {
    const currentClassIds = Array.isArray(parseJson(existingMember.allowed_class_ids, []))
      ? parseJson(existingMember.allowed_class_ids, [])
      : []
    const mergedClassIds = [...new Set([...currentClassIds, ...classIds])]

    newAccessIds = mergedClassIds.filter((classId) => !currentClassIds.includes(classId))
    passwordCreated = resetExistingPassword

    await rest(`accounts?id=eq.${eq(existingMember.id)}&role=eq.member`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: {
        name: buyerName || existingMember.name,
        status: 'Aktif',
        allowed_class_ids: JSON.stringify(mergedClassIds),
        ...(resetExistingPassword
          ? { password_hash: await hashPasswordValue(password) }
          : {}),
      },
    })
  } else {
    member = {
      id: makeId('member'),
      username: await uniqueLynkUsername(buyerEmail, buyerName),
    }
    passwordCreated = true

    await rest('accounts', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: {
        id: member.id,
        role: 'member',
        name: buyerName,
        username: member.username,
        email: buyerEmail,
        status: 'Aktif',
        avatar: '',
        allowed_class_ids: JSON.stringify(classIds),
        password_hash: await hashPasswordValue(password),
        joined_at: new Date().toISOString().slice(0, 10),
      },
    })
  }

  if (newAccessIds.length) {
    await incrementClassStudents(newAccessIds)
  }

  await rest('lynk_orders', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: {
      id: makeId('lynk'),
      event_id: eventId,
      order_id: orderId,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      product_key: productKey,
      product_name: productKey,
      class_ids: JSON.stringify(classIds),
      member_id: member.id,
      username: member.username,
      password_created: passwordCreated,
      status: 'processed',
      payload: rawBody,
    },
  })

  const account = {
    name: buyerName,
    email: buyerEmail,
    username: member.username,
    password: passwordCreated ? password : null,
    loginUrl: loginUrlFromRequest(request),
    classIds,
  }
  const emailResult = await sendResendCredentialsEmail(account)
  const fulfillmentMessage = buildCredentialsMessage(account)

  return {
    ok: true,
    message: 'Akun member berhasil dibuat atau diperbarui dari pembayaran Lynk.id.',
    emailSent: emailResult.sent,
    emailMessageId: emailResult.id || '',
    emailError: emailResult.sent ? '' : emailResult.message || '',
    fulfillmentMessage,
    account,
  }
}
