/* global Buffer, process */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import bcrypt from 'bcryptjs'
import { cleanWebsiteSettings, defaultWebsiteSettings } from '../src/data/websiteSettings.js'

const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || '')
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  ''
const publicBucket = process.env.SUPABASE_PUBLIC_BUCKET || 'ibnu-assets'
const videoBucket = process.env.SUPABASE_VIDEO_BUCKET || 'ibnu-videos'
const maxVideoUploadMb = Number(process.env.MAX_VIDEO_UPLOAD_MB || 80)
const loginAttemptWindowMs = 15 * 60 * 1000
const loginAttemptBlockMs = 15 * 60 * 1000
const maxLoginAttempts = 5
const testimonialMaxLength = 280

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
  applySecurityHeaders(response)
  response.statusCode = statusCode
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

export function apiHandler(handler, allowedMethods = []) {
  return async function handleApi(request, response) {
    applySecurityHeaders(response)

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

function applySecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  response.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: data: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self' https:",
      'frame-src https://www.youtube.com https://youtube.com',
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
  )
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

function sanitizeRichHtmlIframes(value) {
  return String(value ?? '').replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, (iframe) => {
    const srcMatch = iframe.match(/\ssrc=(["'])(.*?)\1/i)
    const titleMatch = iframe.match(/\stitle=(["'])(.*?)\1/i)
    const src = srcMatch?.[2] || ''

    try {
      const parsed = new URL(src)
      const host = parsed.hostname.replace(/^www\./, '')

      if (!['youtube.com', 'youtube-nocookie.com'].includes(host) || !parsed.pathname.startsWith('/embed/')) {
        return ''
      }

      const title = cleanText(titleMatch?.[2] || 'Video YouTube', 120).replace(/"/g, '&quot;')
      return `<iframe src="${parsed.href}" title="${title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
    } catch {
      return ''
    }
  })
}

function cleanRichHtml(value, maxLength = 6000) {
  return sanitizeRichHtmlIframes(convertYoutubeLinesToEmbeds(value))
    .slice(0, maxLength)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/\shref=(["'])\s*javascript:[\s\S]*?\1/gi, '')
    .replace(/\ssrc=(["'])\s*javascript:[\s\S]*?\1/gi, '')
    .replace(/<(?!\/?(p|br|strong|b|em|i|u|ul|ol|li|span|div|a|img|iframe|h2|h3|h4)\b)[^>]*>/gi, '')
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

function cleanPhone(value) {
  return cleanText(value, 40).replace(/[^0-9+()\-\s.]/g, '')
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
  const rawUrl = cleanText(value, 1200)

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

function parseOrderPayload(value) {
  const parsed = parseJson(value, {})

  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

function firstPayloadValue(payload, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current?.[key], payload)

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value)
    }
  }

  return ''
}

function parseTimestamp(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return 0
  }

  const raw = String(value).trim()
  const numeric = Number(raw)

  if (Number.isFinite(numeric)) {
    return numeric > 9999999999 ? numeric : numeric * 1000
  }

  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? 0 : parsed
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

function isMissingPhoneColumnError(error) {
  const message = String(error?.message || '').toLowerCase()

  return message.includes('phone') && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  )
}

function isMissingColumnError(error, column) {
  const message = String(error?.message || '').toLowerCase()
  const columnName = String(column || '').toLowerCase()

  return message.includes(columnName) && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find') ||
    message.includes('does not exist')
  )
}

async function hasTableColumn(table, column) {
  try {
    await rest(`${table}?select=${column}&limit=1`)
    return true
  } catch (error) {
    if (isMissingColumnError(error, column)) {
      return false
    }

    throw error
  }
}

async function restAccountWrite(path, options = {}) {
  try {
    return await rest(path, options)
  } catch (error) {
    if (
      options.body &&
      Object.hasOwn(options.body, 'phone') &&
      isMissingPhoneColumnError(error)
    ) {
      const body = { ...options.body }
      delete body.phone

      return rest(path, {
        ...options,
        body,
      })
    }

    throw error
  }
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
    phone: account.phone || '',
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

function tripayOrderExpiresAt(row, payload = parseOrderPayload(row.payload)) {
  const explicitTime = parseTimestamp(firstPayloadValue(payload, [
    'expired_time',
    'expires_time',
    'expiry_time',
    'data.expired_time',
    'data.expires_time',
    'data.expiry_time',
    'expired_at',
    'expires_at',
    'data.expired_at',
    'data.expires_at',
  ]))

  if (explicitTime) {
    return new Date(explicitTime).toISOString()
  }

  const createdTime = parseTimestamp(row.created_at || row.updated_at || '')

  if (!createdTime) {
    return ''
  }

  const expiredMinutes = cleanNumber(process.env.TRIPAY_EXPIRED_MINUTES || 1440, 5, 10080)
  return new Date(createdTime + expiredMinutes * 60 * 1000).toISOString()
}

function tripayOrderStatus(row, payload = parseOrderPayload(row.payload)) {
  const status = cleanText(row.status || firstPayloadValue(payload, [
    'status',
    'data.status',
    'payment_status',
    'data.payment_status',
  ]) || 'pending', 60).toLowerCase()
  const payableStatuses = ['pending', 'unpaid', 'waiting', 'callback']
  const expiresAt = tripayOrderExpiresAt(row, payload)
  const expiresTime = parseTimestamp(expiresAt)

  if (
    payableStatuses.includes(status) &&
    expiresTime &&
    expiresTime <= Date.now()
  ) {
    return 'expired'
  }

  return status
}

function sessionPayload(account, token = '') {
  return {
    userId: account.id,
    name: account.name,
    username: account.username,
    email: account.email || '',
    role: account.role,
    avatar: account.avatar || '',
    allowedClassIds:
      account.role === 'member' ? parseJson(account.allowed_class_ids, null) : null,
    token,
    signedInAt: new Date().toISOString(),
  }
}

async function createAccountSession(account, requestOrUserAgent = '') {
  const request = typeof requestOrUserAgent === 'object' && requestOrUserAgent
    ? requestOrUserAgent
    : null
  const userAgent = request
    ? request.headers?.['user-agent'] || ''
    : requestOrUserAgent
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

function requestSessionToken(request) {
  const headerToken = cleanSessionToken(request.headers['x-session-token'])
  const authHeader = String(request.headers.authorization || '')
  const url = new URL(request.url || '/', 'http://localhost')

  if (headerToken) {
    return headerToken
  }

  const queryToken = isQuerySessionTokenAllowed(url)
    ? cleanSessionToken(url.searchParams.get('token') || '')
    : ''

  if (queryToken) {
    return queryToken
  }

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return cleanSessionToken(authHeader.slice(7))
  }

  return ''
}

function isQuerySessionTokenAllowed(url) {
  return /^\/api\/video(?:\.php)?$/i.test(url.pathname)
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
    description: row.description || '',
    students: Number(row.students) || 0,
    displayStudents: row.display_students ?? '',
    rating: row.rating ?? '',
    status: row.status,
    revenue: row.revenue,
    price: Number(row.price) || 0,
    salePrice: Number(row.sale_price) || 0,
    purchaseButtonLabel: row.purchase_button_label || 'Beli Sekarang',
    registerButtonLabel: row.register_button_label || 'Daftar',
    lynkProductKey: row.lynk_product_key || '',
    tripayProductKey: row.tripay_product_key || '',
    thumbnail: row.thumbnail || '',
    mentor: row.mentor,
    progress: Number(row.progress) || 0,
    next: row.next_label,
    liveAt: row.live_at,
    lessons: row.lessons,
    showOnHomepage: row.show_on_homepage !== false,
    showOnMember: row.show_on_member !== false,
    highlighted: Boolean(row.highlighted),
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
    imageFile: row.image_file || '',
    imageName: row.image_name || '',
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
      instruction: asset.instruction || '',
      prompt: asset.prompt || '',
    })),
  }
}

function mapDigitalProduct(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    price: Number(row.price) || 0,
    displaySales: row.display_sales ?? '',
    rating: row.rating ?? '',
    status: row.status || 'Draft',
    thumbnail: row.thumbnail || '',
    addVideo: Boolean(row.add_video),
    videoUrl: row.video_url || '',
    fileUrl: row.file_url || '',
    fileName: row.file_name || '',
    deliveryNote: row.delivery_note || '',
    platformType: row.platform_type || 'upload',
    payWhatYouWant: Boolean(row.pay_what_you_want),
    salePrice: Number(row.sale_price) || 0,
    itemQuantityEnabled: Boolean(row.item_quantity_enabled),
    itemQuantity: Number(row.item_quantity) || 0,
    limitQtyPerCheckout: Boolean(row.limit_qty_per_checkout),
    purchaseButtonLabel: row.purchase_button_label || 'Buy Now',
    releaseTimeEnabled: Boolean(row.release_time_enabled),
    releaseTime: row.release_time || '',
    whatsappNotification: Boolean(row.whatsapp_notification),
    customMessageEnabled: Boolean(row.custom_message_enabled),
    customMessage: row.custom_message || '',
    reviews: cleanDigitalProductReviews(row.reviews || []),
    addOns: cleanDigitalProductAddOns(row.add_ons || []),
    customerQuestions: cleanDigitalProductQuestions(row.customer_questions || []),
    blockLayout: row.block_layout || 'default',
    requireCustomerName: Boolean(row.require_customer_name),
    requireCustomerPhone: Boolean(row.require_customer_phone),
    lynkProductKey: row.lynk_product_key || '',
    tripayProductKey: row.tripay_product_key || '',
    showOnHomepage: row.show_on_homepage !== false,
    showOnMember: row.show_on_member !== false,
    highlighted: Boolean(row.highlighted),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

function mapDigitalProductAccess(row) {
  return {
    id: row.id,
    productId: row.product_id || '',
    productTitle: row.product_title || '',
    memberId: row.member_id || '',
    buyerName: row.buyer_name || '',
    buyerEmail: row.buyer_email || '',
    source: row.source || '',
    orderId: row.order_id || '',
    status: row.status || 'active',
    downloadUrl: row.download_url || '',
    createdAt: row.created_at || '',
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

export async function fetchDigitalProducts(request = null) {
  const user = request ? await currentUser(request) : null
  const path = user?.role === 'admin'
    ? 'digital_products?select=*&order=updated_at.desc,id.asc'
    : `digital_products?select=*&status=eq.${eq('Aktif')}&order=updated_at.desc,id.asc`
  const [rows, accessRows] = await Promise.all([
    rest(path),
    user?.role === 'admin'
      ? rest('digital_product_access?select=*&order=created_at.desc&limit=500').catch(() => [])
      : user?.role === 'member'
        ? rest(
            `digital_product_access?select=*&member_id=eq.${eq(user.userId)}&order=created_at.desc&limit=200`,
          ).catch(() => [])
        : [],
  ])

  return {
    digitalProducts: (rows || []).map(mapDigitalProduct),
    digitalProductAccess: (accessRows || []).map(mapDigitalProductAccess),
    updatedAt: new Date().toISOString(),
  }
}

export async function fetchWebsiteSettings() {
  try {
    const rows = await rest('site_settings?select=*&id=eq.main&limit=1')
    const payload = rows?.[0]?.payload
    const settings = await hydrateTripayPaymentMethods(
      cleanWebsiteSettings(payload || defaultWebsiteSettings),
    )

    return {
      settings,
      updatedAt: rows?.[0]?.updated_at || new Date().toISOString(),
    }
  } catch (error) {
    if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
      const settings = await hydrateTripayPaymentMethods(defaultWebsiteSettings)

      return {
        settings,
        updatedAt: new Date().toISOString(),
      }
    }

    throw error
  }
}

export async function fetchTripayPaymentMethods(request) {
  await requireUser(request, 'admin')

  const settings = (await fetchWebsiteSettings()).settings
  const tripayMethods = await fetchTripayPaymentChannels()
  const paymentMethods = mergeTripayPaymentMethods(settings.paymentMethods, tripayMethods)

  return {
    paymentMethods,
    synced: tripayMethods.length > 0,
    updatedAt: new Date().toISOString(),
  }
}

function isMissingSiteSettingsTableError(error) {
  if (!(error instanceof ApiError)) {
    return false
  }

  const message = String(error.message || '').toLowerCase()

  return (
    (error.statusCode === 400 || error.statusCode === 404) &&
    (message.includes('site_settings') || message.includes('schema cache'))
  )
}

export async function replaceWebsiteSettings(settings) {
  const cleanSettings = cleanWebsiteSettings(settings)

  try {
    await rest('site_settings?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: {
        id: 'main',
        payload: cleanSettings,
      },
    })
  } catch (error) {
    if (isMissingSiteSettingsTableError(error)) {
      throw new ApiError(
        500,
        'Tabel site_settings belum siap di Supabase. Jalankan supabase/schema.sql, lalu coba simpan lagi.',
      )
    }

    throw error
  }

  return fetchWebsiteSettings()
}

const backupTables = [
  'accounts',
  'classes',
  'digital_products',
  'materials',
  'material_assets',
  'support_tickets',
  'submissions',
  'testimonials',
  'certificate_templates',
  'certificates',
  'certificate_name_change_requests',
  'member_progress',
  'lynk_orders',
  'tripay_orders',
  'payment_snapshots',
  'site_settings',
]

async function fetchBackupTable(table) {
  try {
    return await rest(`${table}?select=*`)
  } catch (error) {
    if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
      return []
    }

    throw error
  }
}

export async function createBackup() {
  const tables = {}

  for (const table of backupTables) {
    tables[table] = await fetchBackupTable(table)
  }

  return {
    type: 'ibnucreative-full-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    websiteSettings: (await fetchWebsiteSettings()).settings,
    tables,
  }
}

async function deleteBackupTable(table, filter) {
  try {
    await rest(`${table}?${filter}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
  } catch (error) {
    if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
      return
    }

    throw error
  }
}

async function insertBackupRows(table, rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return
  }

  await rest(table, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: rows,
  })
}

export async function restoreBackup(payload) {
  const backup = payload?.backup && typeof payload.backup === 'object'
    ? payload.backup
    : payload
  const tables = backup?.tables && typeof backup.tables === 'object' ? backup.tables : null

  if (!tables) {
    throw new ApiError(400, 'File backup tidak memuat data tabel.')
  }

  const deleteOrder = [
    ['material_assets', 'id=not.is.null'],
    ['materials', 'id=not.is.null'],
    ['submissions', 'id=not.is.null'],
    ['testimonials', 'id=not.is.null'],
    ['certificate_name_change_requests', 'id=not.is.null'],
    ['certificates', 'id=not.is.null'],
    ['certificate_templates', 'id=not.is.null'],
    ['support_tickets', 'id=not.is.null'],
    ['member_progress', 'member_id=not.is.null'],
    ['tripay_orders', 'id=not.is.null'],
    ['payment_snapshots', 'id=not.is.null'],
    ['lynk_orders', 'id=not.is.null'],
    ['digital_products', 'id=not.is.null'],
    ['classes', 'id=not.is.null'],
    ['accounts', 'id=not.is.null'],
    ['site_settings', 'id=not.is.null'],
  ]
  const insertOrder = [
    'accounts',
    'classes',
    'digital_products',
    'materials',
    'material_assets',
    'support_tickets',
    'submissions',
    'testimonials',
    'certificate_templates',
    'certificates',
    'certificate_name_change_requests',
    'member_progress',
    'lynk_orders',
    'tripay_orders',
    'payment_snapshots',
    'site_settings',
  ]

  for (const [table, filter] of deleteOrder) {
    await deleteBackupTable(table, filter)
  }

  for (const table of insertOrder) {
    await insertBackupRows(table, tables[table])
  }

  if (
    (!Array.isArray(tables.site_settings) || !tables.site_settings.length) &&
    backup.websiteSettings
  ) {
    await replaceWebsiteSettings(backup.websiteSettings)
  }

  return {
    message: 'Backup berhasil dipulihkan.',
    ...(await fetchWebsiteSettings()),
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
          description: cleanRichHtml(item.description || '', 6000),
          students: cleanNumber(item.students, 0, 1000000),
          display_students:
            item.displayStudents === '' || item.displayStudents === null || item.displayStudents === undefined
              ? null
              : cleanNumber(item.displayStudents, 0, 1000000),
          rating:
            item.rating === '' || item.rating === null || item.rating === undefined
              ? null
              : Math.min(5, Math.max(0, Number(item.rating) || 0)),
          status: cleanText(item.status || 'Aktif', 40),
          revenue: cleanText(item.revenue || 'Rp 0', 80),
          price: cleanNumber(item.price, 0, 1000000000),
          sale_price: cleanNumber(item.salePrice, 0, 1000000000),
          purchase_button_label: cleanText(item.purchaseButtonLabel || 'Beli Sekarang', 80),
          register_button_label: cleanText(item.registerButtonLabel || 'Daftar', 80),
          lynk_product_key: cleanText(item.lynkProductKey || '', 180),
          tripay_product_key: cleanText(item.tripayProductKey || '', 180),
          thumbnail: cleanUrl(item.thumbnail || ''),
          mentor: cleanText(item.mentor || 'Ibnu Creative', 120),
          progress: cleanNumber(item.progress, 0, 100),
          next_label: cleanText(item.next || 'Lanjutkan modul berikutnya', 160),
          live_at: cleanText(item.liveAt || 'Jadwal menyusul', 160),
          lessons: cleanText(item.lessons || `${materials.length} materi`, 80),
          show_on_homepage: item.showOnHomepage !== false,
          show_on_member: item.showOnMember !== false,
          highlighted: Boolean(item.highlighted),
        },
        materials: materials
          .filter(
            (material) =>
              material?.title || material?.videoUrl || material?.videoFile || material?.imageFile,
          )
          .map((material, materialIndex) => {
            const materialId = cleanText(
              material.id || `${classId}-material-${materialIndex + 1}`,
              120,
            )
            const imageFile = cleanUrl(material.imageFile || '')
            const imageName = cleanText(material.imageName || '', 180)
            const materialRow = {
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
            }

            if (imageFile || imageName) {
              materialRow.image_file = imageFile
              materialRow.image_name = imageName
            }

            return {
              materialRow,
              assets: (Array.isArray(material.promptItems)
                ? material.promptItems.slice(0, 80)
                : []
              )
                .filter((asset) => asset?.image || asset?.prompt || asset?.instruction)
                .map((asset, assetIndex) => {
                  const instruction = cleanPromptText(asset.instruction || '')
                  const row = {
                    id: cleanText(asset.id || `${materialId}-asset-${assetIndex + 1}`, 120),
                    material_id: materialId,
                    sort_order: assetIndex + 1,
                    title: cleanText(asset.title || `Prompt ${assetIndex + 1}`, 160),
                    image: cleanUrl(asset.image || ''),
                    prompt: cleanPromptText(asset.prompt || ''),
                  }

                  if (instruction) {
                    row.instruction = instruction
                  }

                  return row
                }),
            }
          }),
      }
    })
}

function cleanDigitalProductsForDb(value) {
  const source = Array.isArray(value) ? value.slice(0, 300) : []

  return source
    .filter((item) => item?.id && item?.title)
    .map((item, index) => ({
      id: cleanText(item.id || makeId('product'), 120),
      title: cleanText(item.title || `Produk Digital ${index + 1}`, 160),
      description: cleanRichHtml(item.description || '', 6000),
      price: cleanNumber(item.price, 0, 1000000000),
      display_sales:
        item.displaySales === '' || item.displaySales === null || item.displaySales === undefined
          ? null
          : cleanNumber(item.displaySales, 0, 1000000),
      rating:
        item.rating === '' || item.rating === null || item.rating === undefined
          ? null
          : Math.min(5, Math.max(0, Number(item.rating) || 0)),
      status: cleanText(item.status || 'Draft', 40),
      thumbnail: cleanUrl(item.thumbnail || ''),
      add_video: Boolean(item.addVideo),
      video_url: cleanExternalUrl(item.videoUrl || ''),
      file_url: cleanExternalUrl(item.fileUrl || ''),
      file_name: cleanText(item.fileName || '', 180),
      delivery_note: cleanText(item.deliveryNote || '', 800),
      platform_type: cleanText(item.platformType || 'upload', 40),
      pay_what_you_want: Boolean(item.payWhatYouWant),
      sale_price: cleanNumber(item.salePrice, 0, 1000000000),
      item_quantity_enabled: Boolean(item.itemQuantityEnabled),
      item_quantity: cleanNumber(item.itemQuantity, 0, 1000000),
      limit_qty_per_checkout: Boolean(item.limitQtyPerCheckout),
      purchase_button_label: cleanText(item.purchaseButtonLabel || 'Buy Now', 80),
      release_time_enabled: Boolean(item.releaseTimeEnabled),
      release_time: cleanText(item.releaseTime || '', 80),
      whatsapp_notification: Boolean(item.whatsappNotification),
      custom_message_enabled: Boolean(item.customMessageEnabled),
      custom_message: cleanText(item.customMessage || '', 800),
      reviews: cleanDigitalProductReviews(item.reviews || []),
      add_ons: cleanDigitalProductAddOns(item.addOns || []),
      customer_questions: cleanDigitalProductQuestions(item.customerQuestions || []),
      block_layout: cleanText(item.blockLayout || 'default', 40),
      require_customer_name: Boolean(item.requireCustomerName),
      require_customer_phone: Boolean(item.requireCustomerPhone),
      lynk_product_key: cleanText(item.lynkProductKey || '', 180),
      tripay_product_key: cleanText(item.tripayProductKey || '', 180),
      show_on_homepage: item.showOnHomepage !== false,
      show_on_member: item.showOnMember !== false,
      highlighted: Boolean(item.highlighted),
    }))
}

async function hasMaterialAssetInstructionColumn() {
  try {
    await rest('material_assets?select=instruction&limit=1')
    return true
  } catch (error) {
    if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
      return false
    }

    throw error
  }
}

async function hasMaterialImageColumns() {
  try {
    await rest('materials?select=image_file,image_name&limit=1')
    return true
  } catch (error) {
    if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
      return false
    }

    throw error
  }
}

export async function replaceClasses(classes) {
  const cleanClasses = cleanClassesForDb(classes)
  const classRows = cleanClasses.map((item) => item.classRow)
  const materialRows = cleanClasses.flatMap((item) => item.materials.map((row) => row.materialRow))
  const assetRows = cleanClasses.flatMap((item) => item.materials.flatMap((row) => row.assets))
  const hasMaterialImageData = materialRows.some((row) => row.image_file || row.image_name)

  if (hasMaterialImageData && !(await hasMaterialImageColumns())) {
    throw new ApiError(
      400,
      'Tambahkan kolom image_file dan image_name di tabel materials Supabase dulu.',
    )
  }

  const hasInstructionData = assetRows.some((row) => row.instruction)
  const safeAssetRows =
    hasInstructionData && !(await hasMaterialAssetInstructionColumn())
      ? assetRows.map((row) => {
          const nextRow = { ...row }
          delete nextRow.instruction
          return nextRow
        })
      : assetRows

  const optionalClassColumns = [
    'description',
    'display_students',
    'rating',
    'sale_price',
    'purchase_button_label',
    'register_button_label',
    'show_on_homepage',
    'show_on_member',
    'highlighted',
  ]
  const classColumnSupport = Object.fromEntries(
    await Promise.all(
      optionalClassColumns.map(async (column) => [
        column,
        await hasTableColumn('classes', column),
      ]),
    ),
  )
  const safeClassRows = classRows.map((row) => {
    const nextRow = { ...row }

    if (!classColumnSupport.sale_price && cleanNumber(row.sale_price, 0, 1000000000) > 0) {
      nextRow.price = cleanNumber(row.sale_price, 0, 1000000000)
    }

    optionalClassColumns.forEach((column) => {
      if (!classColumnSupport[column]) {
        delete nextRow[column]
      }
    })

    return nextRow
  })

  await rest('classes?id=not.is.null', {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })

  if (safeClassRows.length) {
    await rest('classes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: safeClassRows,
    })
  }

  if (materialRows.length) {
    await rest('materials', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: materialRows,
    })
  }

  if (safeAssetRows.length) {
    await rest('material_assets', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: safeAssetRows,
    })
  }

  return fetchClasses()
}

export async function replaceDigitalProducts(request, products) {
  await requireUser(request, 'admin')
  const rows = cleanDigitalProductsForDb(products)

  if (rows.length) {
    try {
      await rest('digital_products', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: rows,
      })
    } catch (error) {
      if (
        String(error?.message || '').includes('display_sales') ||
        String(error?.message || '').includes('rating') ||
        String(error?.message || '').includes('show_on_homepage') ||
        String(error?.message || '').includes('show_on_member') ||
        String(error?.message || '').includes('highlighted')
      ) {
        throw new ApiError(
          500,
          'Kolom produk digital untuk homepage belum ada di Supabase. Jalankan schema.sql terbaru dulu, lalu ulangi.',
        )
      }

      throw error
    }

    const keepIds = new Set(rows.map((row) => row.id))
    const existingRows = await rest('digital_products?select=id').catch(() => [])
    const staleRows = (existingRows || []).filter((row) => !keepIds.has(row.id))

    for (const staleRow of staleRows) {
      await rest(`digital_products?id=eq.${eq(staleRow.id)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      })
    }
  } else {
    await rest('digital_products?id=not.is.null', {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
  }

  return fetchDigitalProducts(request)
}

export async function updateDigitalProductReviewLike(request, payload) {
  const productId = cleanText(payload?.productId || '', 80)
  const reviewId = cleanText(payload?.reviewId || '', 80)
  const isLiked = Boolean(payload?.liked)

  if (!productId || !reviewId) {
    throw new ApiError(400, 'Produk atau ulasan tidak valid.')
  }

  const rows = await rest(
    `digital_products?select=*&id=eq.${eq(productId)}&status=eq.${eq('Aktif')}&limit=1`,
  )
  const product = rows?.[0]

  if (!product) {
    throw new ApiError(404, 'Produk tidak ditemukan.')
  }

  const reviews = cleanDigitalProductReviews(product.reviews || [])
  const reviewIndex = reviews.findIndex((review) => review.id === reviewId)

  if (reviewIndex < 0) {
    throw new ApiError(404, 'Ulasan tidak ditemukan.')
  }

  const nextReviews = reviews.map((review, index) =>
    index === reviewIndex
      ? {
          ...review,
          likes: cleanNumber((review.likes || 0) + (isLiked ? 1 : -1), 0, 1000000),
        }
      : review,
  )

  await rest(`digital_products?id=eq.${eq(productId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: {
      reviews: nextReviews,
      updated_at: new Date().toISOString(),
    },
  })

  return fetchDigitalProducts(request)
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

function paymentPublic(row, source) {
  const payload = parseOrderPayload(row.payload)
  const sourceLabel = source === 'tripay' ? 'Tripay' : 'Lynk.id'
  const expiresAt = source === 'tripay' ? tripayOrderExpiresAt(row, payload) : ''
  const status = source === 'tripay'
    ? tripayOrderStatus(row, payload)
    : cleanText(row.status || 'processed', 60)
  const amount = source === 'tripay'
    ? cleanNumber(row.amount, 0, 1000000000)
    : cleanNumber(
        firstPayloadValue(payload, [
          'amount',
          'total_amount',
          'data.amount',
          'data.total_amount',
          'order.total',
          'data.order.total',
        ]),
        0,
        1000000000,
      )
  const paymentMethod = source === 'tripay'
    ? firstPayloadValue(payload, [
        'payment_method',
        'method',
        'data.payment_method',
        'data.method',
        'payment_name',
        'data.payment_name',
      ])
    : 'Lynk.id'
  const orderCode = source === 'tripay'
    ? cleanText(row.reference || row.merchant_ref || row.id, 180)
    : cleanText(row.order_id || row.event_id || row.id, 180)
  const orderType = cleanText(
    firstPayloadValue(payload, ['order_type', 'data.order_type']) || 'class',
    60,
  )
  const productId = cleanText(firstPayloadValue(payload, ['product_id', 'data.product_id']), 120)
  const productTitle = cleanText(
    firstPayloadValue(payload, ['product_title', 'data.product_title']),
    180,
  )
  const classIds = parseJson(row.class_ids, [])
  const productKey = cleanText(row.product_key || firstPayloadValue(payload, ['product_key', 'data.product_key']), 240)
  const productName = cleanText(row.product_name || firstPayloadValue(payload, ['product_name', 'data.product_name']), 240)

  return {
    id: `${source}:${row.id}`,
    source,
    sourceLabel,
    orderCode,
    merchantRef: cleanText(row.merchant_ref || '', 180),
    reference: cleanText(row.reference || '', 180),
    buyerName: cleanText(row.buyer_name || '', 160),
    buyerEmail: cleanEmail(row.buyer_email || ''),
    memberId: cleanText(row.member_id || '', 120),
    classId: cleanText(row.class_id || '', 120),
    classIds: Array.isArray(classIds) ? classIds.map((classId) => cleanText(classId, 120)).filter(Boolean) : [],
    itemType: orderType === 'digital_product' ? 'digital_product' : 'class',
    productId,
    productTitle,
    productKey,
    productName,
    classTitle: cleanText(
      productTitle || row.class_title || productName || productKey || 'Kelas',
      180,
    ),
    amount,
    status,
    paymentMethod: cleanText(paymentMethod || sourceLabel, 80),
    checkoutUrl: cleanExternalUrl(row.checkout_url || ''),
    accessGranted: row.access_granted === true,
    expiresAt,
    isExpired: status === 'expired',
    createdAt: cleanText(row.created_at || '', 60),
    updatedAt: cleanText(row.updated_at || '', 60),
  }
}

function paymentSnapshotPublic(row) {
  const itemType = row.item_type === 'digital_product' ? 'digital_product' : 'class'
  const classTitle = cleanText(row.class_title || row.product_title || 'Kelas', 180)
  const productTitle = cleanText(row.product_title || '', 180)

  return {
    id: cleanText(row.id || `snapshot:${row.member_id}:${row.class_id}:${row.product_id}`, 240),
    source: cleanText(row.source || 'legacy_access', 80),
    sourceLabel: cleanText(row.source_label || 'Akses lama', 80),
    orderCode: cleanText(row.order_code || row.id || '', 180),
    merchantRef: '',
    reference: '',
    buyerName: cleanText(row.buyer_name || 'Member', 160),
    buyerEmail: cleanEmail(row.buyer_email || ''),
    memberId: cleanText(row.member_id || '', 120),
    classId: cleanText(row.class_id || '', 120),
    classIds: [],
    itemType,
    productId: cleanText(row.product_id || '', 120),
    productTitle,
    productKey: '',
    productName: '',
    classTitle: itemType === 'digital_product' ? productTitle || classTitle : classTitle,
    amount: cleanNumber(row.amount, 0, 1000000000),
    status: cleanText(row.status || 'paid', 60),
    paymentMethod: cleanText(row.payment_method || 'Akses kelas', 80),
    checkoutUrl: '',
    accessGranted: row.access_granted !== false,
    expiresAt: '',
    isExpired: false,
    createdAt: cleanText(row.created_at || '', 60),
    updatedAt: cleanText(row.updated_at || '', 60),
  }
}

function historicalAccessPayments(members, classes, existingPayments) {
  const paidAccessKeys = new Set(
    existingPayments
      .filter((payment) => payment.accessGranted || ['paid', 'processed', 'success', 'settlement'].includes(payment.status.toLowerCase()))
      .map((payment) => `${payment.memberId || payment.buyerEmail}:${payment.classId}`)
      .filter((key) => !key.startsWith(':') && !key.endsWith(':')),
  )
  const paidClasses = (classes || [])
    .map((course) => {
      const salePrice = cleanNumber(course.sale_price, 0, 1000000000)
      const normalPrice = cleanNumber(course.price, 0, 1000000000)

      return {
        id: cleanText(course.id, 120),
        title: cleanText(course.title || 'Kelas', 180),
        price: salePrice > 0 ? salePrice : normalPrice,
      }
    })
    .filter((course) => course.price > 0)
  const snapshotRows = []

  const syntheticPayments = (members || [])
    .filter((member) => member.role === 'member' && member.status === 'Aktif')
    .flatMap((member) => {
      const memberId = cleanText(member.id, 120)
      const memberEmail = cleanEmail(member.email || '')
      const allowedClassIds = parseJson(member.allowed_class_ids, null)
      const accessibleClasses = Array.isArray(allowedClassIds)
        ? paidClasses.filter((course) => allowedClassIds.includes(course.id))
        : paidClasses

      return accessibleClasses
        .filter((course) => {
          const keyById = `${memberId}:${course.id}`
          const keyByEmail = `${memberEmail}:${course.id}`

          return !paidAccessKeys.has(keyById) && !paidAccessKeys.has(keyByEmail)
        })
        .map((course) => ({
          id: cleanText(`legacy-access:${memberId}:${course.id}`, 240),
          source: 'legacy_access',
          sourceLabel: 'Akses lama',
          orderCode: `AKSES-${memberId}-${course.id}`,
          merchantRef: '',
          reference: '',
          buyerName: cleanText(member.name || 'Member', 160),
          buyerEmail: memberEmail,
          memberId,
          classId: course.id,
          classTitle: course.title,
          amount: course.price,
          status: 'paid',
          paymentMethod: 'Akses kelas',
          checkoutUrl: '',
          accessGranted: true,
          createdAt: cleanText(member.joined_at || member.created_at || '', 60),
          updatedAt: cleanText(member.updated_at || member.joined_at || '', 60),
        }))
    })

  syntheticPayments.forEach((payment) => {
    snapshotRows.push({
      id: payment.id,
      source: payment.source,
      source_label: payment.sourceLabel,
      order_code: payment.orderCode,
      buyer_name: payment.buyerName,
      buyer_email: payment.buyerEmail,
      member_id: payment.memberId,
      class_id: payment.classId,
      class_title: payment.classTitle,
      item_type: payment.itemType || 'class',
      amount: payment.amount,
      status: payment.status,
      payment_method: payment.paymentMethod,
      access_granted: payment.accessGranted,
      created_at: payment.createdAt,
    })
  })

  return { payments: syntheticPayments, snapshotRows }
}

export async function fetchPayments() {
  const [tripayRows, lynkRows, memberRows, classRows, snapshotRows] = await Promise.all([
    fetchBackupTable('tripay_orders'),
    fetchBackupTable('lynk_orders'),
    fetchBackupTable('accounts'),
    fetchBackupTable('classes'),
    fetchBackupTable('payment_snapshots'),
  ])
  const gatewayPayments = [
    ...(tripayRows || []).map((row) => paymentPublic(row, 'tripay')),
    ...(lynkRows || []).map((row) => paymentPublic(row, 'lynk')),
  ]
  const snapshotPayments = (snapshotRows || []).map(paymentSnapshotPublic)
  const legacyAccess = historicalAccessPayments(
    memberRows || [],
    classRows || [],
    [...gatewayPayments, ...snapshotPayments],
  )

  if (legacyAccess.snapshotRows.length) {
    await rest('payment_snapshots?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: legacyAccess.snapshotRows,
    }).catch(() => null)
  }

  const payments = [
    ...gatewayPayments,
    ...snapshotPayments,
    ...legacyAccess.payments,
  ].sort((a, b) => {
    const bTime = Date.parse(b.createdAt || b.updatedAt || '') || 0
    const aTime = Date.parse(a.createdAt || a.updatedAt || '') || 0

    return bTime - aTime
  })

  return {
    payments,
    updatedAt: new Date().toISOString(),
  }
}

export async function fetchPublicActivities() {
  const [paymentsData, accessRows, memberRows, classRows, productRows] = await Promise.all([
    fetchPayments().catch(() => ({ payments: [] })),
    rest('digital_product_access?select=*&order=created_at.desc&limit=1000').catch(() => []),
    rest('accounts?select=id,name,email,avatar,allowed_class_ids,joined_at,created_at,updated_at,status,role&role=eq.member&status=eq.Aktif&limit=1000').catch(() => []),
    rest('classes?select=id,title,lynk_product_key,tripay_product_key,status&order=updated_at.desc,id.asc').catch(() => []),
    rest('digital_products?select=id,title,lynk_product_key,tripay_product_key,status&order=updated_at.desc,id.asc').catch(() => []),
  ])
  const membersById = new Map((memberRows || []).map((member) => [member.id, member]))
  const membersByEmail = new Map(
    (memberRows || [])
      .filter((member) => member.email)
      .map((member) => [String(member.email).toLowerCase(), member]),
  )
  const normalizeLookupKey = (value) => normalizeLynkKey(value) || cleanText(value || '', 220).toLowerCase().trim()
  const classTitleByKey = new Map()
  const productTitleByKey = new Map()
  const addLookup = (map, row) => {
    const title = cleanText(row.title || '', 180)

    if (!title) {
      return
    }

    ;[row.id, row.title, row.lynk_product_key, row.tripay_product_key]
      .map(normalizeLookupKey)
      .filter(Boolean)
      .forEach((key) => map.set(key, title))
  }

  ;(classRows || []).forEach((row) => addLookup(classTitleByKey, row))
  ;(productRows || []).forEach((row) => addLookup(productTitleByKey, row))

  const resolvePaymentTitle = (payment, isProduct) => {
    const map = isProduct ? productTitleByKey : classTitleByKey
    const candidates = isProduct
      ? [
          payment.productId,
          payment.productTitle,
          payment.classTitle,
          payment.merchantRef,
          payment.reference,
          payment.orderCode,
        ]
      : [
          payment.classId,
          payment.classTitle,
          payment.productTitle,
          payment.merchantRef,
          payment.reference,
          payment.orderCode,
        ]

    for (const candidate of candidates) {
      const candidateKey = normalizeLookupKey(candidate)
      const title = map.get(candidateKey)
      if (title) {
        return title
      }

      if (candidateKey.length >= 4) {
        for (const [key, mappedTitle] of map.entries()) {
          if (key.length >= 4 && (candidateKey.includes(key) || key.includes(candidateKey))) {
            return mappedTitle
          }
        }
      }
    }

    return cleanText(isProduct ? payment.productTitle || payment.classTitle : payment.classTitle, 180)
  }
  const pushActivity = ({ id, name, avatar, actionText, itemTitle, itemId, type, createdAt }) => {
    if (!itemTitle) {
      return
    }

    activities.push({
      id: cleanText(id, 240),
      name: cleanText(name || 'Pelanggan', 160),
      avatar: cleanUrl(avatar || ''),
      actionText,
      itemTitle: cleanText(itemTitle, 180),
      itemId: cleanText(itemId || '', 160),
      type,
      createdAt: cleanText(createdAt || '', 60),
    })
  }
  const activities = []

  ;(paymentsData.payments || [])
    .filter((payment) => {
      const status = String(payment.status || '').toLowerCase()
      return payment.accessGranted || ['paid', 'processed', 'success', 'settlement', 'capture'].includes(status)
    })
    .forEach((payment) => {
          const isProduct = payment.itemType === 'digital_product' || Boolean(payment.productId)
          const member = membersById.get(payment.memberId) || membersByEmail.get(String(payment.buyerEmail || '').toLowerCase())
          const createdAt = payment.updatedAt || payment.createdAt
          const classIds = Array.isArray(payment.classIds) ? payment.classIds : []

          if (!isProduct && classIds.length) {
            classIds.forEach((classId) => {
              pushActivity({
                id: `payment:${payment.id}:${classId}`,
                name: member?.name || payment.buyerName,
                avatar: member?.avatar || '',
                actionText: 'mendaftar kelas',
                itemTitle: classTitleByKey.get(normalizeLookupKey(classId)) || resolvePaymentTitle({ ...payment, classId }, false),
                itemId: classId,
                type: 'kelas',
                createdAt,
              })
            })
            return
          }

          const directClassTitle = !isProduct && payment.classId
            ? classTitleByKey.get(normalizeLookupKey(payment.classId))
            : ''
          const directProductTitle = isProduct && payment.productId
            ? productTitleByKey.get(normalizeLookupKey(payment.productId))
            : ''

          pushActivity({
            id: `payment:${payment.id}`,
            name: member?.name || payment.buyerName,
            avatar: member?.avatar || '',
            actionText: isProduct ? 'membeli produk digital' : 'mendaftar kelas',
            itemTitle: directProductTitle || directClassTitle || resolvePaymentTitle(payment, isProduct),
            itemId: isProduct ? payment.productId : payment.classId,
            type: isProduct ? 'produk' : 'kelas',
            createdAt,
          })
    })

  ;(memberRows || []).forEach((member) => {
    const memberId = cleanText(member.id || '', 120)
    const allowedClassIds = parseJson(member.allowed_class_ids, null)

    if (!memberId || !Array.isArray(allowedClassIds) || !allowedClassIds.length) {
      return
    }

    allowedClassIds
      .map((classId) => cleanText(classId, 120))
      .filter(Boolean)
      .forEach((classId) => {
        const title = classTitleByKey.get(normalizeLookupKey(classId))

        if (!title) {
          return
        }

        pushActivity({
          id: `member-class:${memberId}:${classId}`,
          name: member.name,
          avatar: member.avatar || '',
          actionText: 'mengakses kelas',
          itemTitle: title,
          itemId: classId,
          type: 'kelas',
          createdAt: member.joined_at || member.created_at || member.updated_at || '',
        })
      })
  })

  ;(accessRows || []).forEach((row) => {
    const access = mapDigitalProductAccess(row)
    const resolvedProductTitle = productTitleByKey.get(normalizeLookupKey(access.productId)) ||
      productTitleByKey.get(normalizeLookupKey(access.productTitle)) ||
      access.productTitle
    const member = membersById.get(access.memberId) || membersByEmail.get(String(access.buyerEmail || '').toLowerCase())
    const isDuplicate = activities.some(
      (activity) =>
        activity.type === 'produk' &&
        activity.itemTitle === resolvedProductTitle &&
        activity.createdAt === access.createdAt,
    )

    if (!resolvedProductTitle || isDuplicate) {
      return
    }

    activities.push({
      id: cleanText(`access:${access.id}`, 240),
      name: cleanText(member?.name || access.buyerName || 'Pelanggan', 160),
      avatar: cleanUrl(member?.avatar || ''),
      actionText: 'mengakses produk digital',
      itemTitle: cleanText(resolvedProductTitle, 180),
      itemId: cleanText(access.productId, 160),
      type: 'produk',
      createdAt: cleanText(access.createdAt || '', 60),
    })
  })

  const uniqueActivities = new Map()
  activities
    .filter((activity) => activity.name && activity.itemTitle)
    .forEach((activity) => {
      const key = activity.id || `${activity.type}:${activity.name}:${activity.itemTitle}:${activity.createdAt}`

      if (!uniqueActivities.has(key)) {
        uniqueActivities.set(key, activity)
      }
    })

  return {
    activities: [...uniqueActivities.values()]
      .sort((first, second) => (Date.parse(second.createdAt || '') || 0) - (Date.parse(first.createdAt || '') || 0))
      .slice(0, 300)
      .sort(() => Math.random() - 0.5),
    updatedAt: new Date().toISOString(),
  }
}

async function expireTripayOrderIfNeeded(row) {
  const payload = parseOrderPayload(row.payload)
  const status = tripayOrderStatus(row, payload)

  if (status === 'expired' && row.status !== 'expired') {
    await rest(`tripay_orders?id=eq.${eq(row.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { status: 'expired' },
    }).catch(() => null)

    return { ...row, status: 'expired' }
  }

  return row
}

async function fetchMemberTripayRows(memberId) {
  const rows = await rest(
    `tripay_orders?select=*&member_id=eq.${eq(memberId)}&order=created_at.desc&limit=100`,
  )
  const checkedRows = await Promise.all((rows || []).map(expireTripayOrderIfNeeded))

  return checkedRows
}

export async function fetchMemberPayments(request) {
  const user = await requireUser(request, 'member')
  const rows = await fetchMemberTripayRows(user.userId)

  return {
    payments: rows.map((row) => paymentPublic(row, 'tripay')),
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
  await restAccountWrite('accounts', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: {
      id: makeId('member'),
      role: 'member',
      name: cleanText(payload.name || username, 120),
      username,
      email: cleanEmail(payload.email),
      phone: cleanPhone(payload.phone),
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
    phone: cleanPhone(payload.phone),
  }

  if (payload.password) {
    nextMember.password_hash = await hashPasswordValue(payload.password)
  }

  await restAccountWrite(`accounts?id=eq.${eq(memberId)}&role=eq.member`, {
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
  const classId = cleanText(payload.classId || '', 120)
  const classTitle = cleanText(payload.classTitle || 'Kelas', 160)
  const materialId = cleanText(payload.materialId || '', 120)
  const materialTitle = cleanText(payload.materialTitle || 'Materi', 160)
  const materialIndex = cleanNumber(payload.materialIndex || 0, 0, 10000)
  const materialCount = cleanNumber(payload.materialCount || 1, 1, 10000)

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
      class_id: classId,
      class_title: classTitle,
      material_id: materialId,
      material_title: materialTitle,
      answer,
      attachment_url: cleanUrl(payload.attachmentUrl || ''),
      attachment_name: cleanText(payload.attachmentName || '', 180),
      status: 'Menunggu Review',
      feedback: '',
      rating: 0,
      submitted_at: new Date().toISOString(),
    },
  })

  if (classId && materialId) {
    const [materialRows, submissionRows] = await Promise.all([
      rest(
        `materials?select=id,sort_order,requires_task&class_id=eq.${eq(classId)}&order=sort_order.asc,id.asc`,
      ),
      rest(
        `submissions?select=material_id&member_id=eq.${eq(user.userId)}&class_id=eq.${eq(classId)}`,
      ),
    ])
    const requiredMaterialIds = (materialRows || [])
      .filter((material) => material.requires_task)
      .map((material) => material.id)
    const submittedRequiredIds = new Set(
      (submissionRows || [])
        .map((submission) => submission.material_id)
        .filter((submittedMaterialId) => requiredMaterialIds.includes(submittedMaterialId)),
    )
    const progressPercent = requiredMaterialIds.length
      ? Math.min(100, Math.round((submittedRequiredIds.size / requiredMaterialIds.length) * 100))
      : 0

    await rest('member_progress?on_conflict=member_id,class_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: {
        member_id: user.userId,
        class_id: classId,
        class_title: classTitle,
        material_id: materialId,
        material_title: materialTitle,
        material_index: materialIndex,
        material_count: materialCount,
        progress_percent: progressPercent,
        last_activity_at: new Date().toISOString(),
      },
    })
  }

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

function mapTestimonial(row) {
  return {
    id: row.id,
    memberId: row.member_id || '',
    memberName: row.member_name || 'Member',
    memberAvatar: row.member_avatar || '',
    classId: row.class_id || '',
    classTitle: row.class_title || 'Kelas',
    message: row.message || '',
    status: row.status || 'pending',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

export async function fetchTestimonials(user = null) {
  let query = `testimonials?select=*&status=eq.${eq('approved')}&order=created_at.desc,id.desc`

  if (user?.role === 'admin') {
    query = 'testimonials?select=*&order=created_at.desc,id.desc'
  } else if (user?.role === 'member') {
    query = `testimonials?select=*&or=(status.eq.${eq('approved')},member_id.eq.${eq(user.userId)})&order=created_at.desc,id.desc`
  }

  const rows = await rest(query).catch((error) => {
    if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
      return []
    }

    throw error
  })

  return {
    testimonials: (rows || []).map(mapTestimonial),
    updatedAt: new Date().toISOString(),
  }
}

export async function createTestimonial(user, payload) {
  if (user.role !== 'member') {
    throw new ApiError(403, 'Hanya member yang bisa mengirim testimoni.')
  }

  const classId = cleanText(payload.classId || '', 120)
  const classTitle = cleanText(payload.classTitle || 'Kelas', 160)
  const rawMessage = cleanText(payload.message || '', 1200)
  const message = cleanText(rawMessage, testimonialMaxLength)

  if (!classId || !message) {
    throw new ApiError(400, 'Kelas dan isi testimoni wajib diisi.')
  }

  if (rawMessage.length > testimonialMaxLength) {
    throw new ApiError(422, `Testimoni maksimal ${testimonialMaxLength} karakter.`)
  }

  const existingRows = await rest(
    `testimonials?select=id&member_id=eq.${eq(user.userId)}&class_id=eq.${eq(classId)}&limit=1`,
  ).catch(() => [])
  const existing = existingRows?.[0]
  const body = {
    member_id: user.userId,
    member_name: cleanText(user.name || 'Member', 120),
    member_avatar: cleanUrl(user.avatar || ''),
    class_id: classId,
    class_title: classTitle,
    message,
    status: 'pending',
    created_at: new Date().toISOString(),
  }

  if (existing) {
    await rest(`testimonials?id=eq.${eq(existing.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body,
    })
  } else {
    await rest('testimonials', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: {
        id: makeId('testimonial'),
        ...body,
      },
    })
  }

  return fetchTestimonials(user)
}

export async function updateTestimonial(payload) {
  const testimonialId = cleanText(payload.id, 120)
  const status = cleanText(payload.status || 'pending', 40)

  if (!testimonialId) {
    throw new ApiError(400, 'ID testimoni wajib dikirim.')
  }

  if (!['pending', 'approved', 'rejected', 'hidden'].includes(status)) {
    throw new ApiError(422, 'Status testimoni tidak valid.')
  }

  await rest(`testimonials?id=eq.${eq(testimonialId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: { status },
  })

  return fetchTestimonials({ role: 'admin' })
}

export async function deleteTestimonial(testimonialId) {
  await rest(`testimonials?id=eq.${eq(cleanText(testimonialId, 120))}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })

  return fetchTestimonials({ role: 'admin' })
}

export async function trackProgress(user, payload) {
  const classId = cleanText(payload.classId, 120)
  const materialId = cleanText(payload.materialId, 120)
  const materialIndex = cleanNumber(payload.materialIndex, 0, 10000)
  const materialCount = cleanNumber(payload.materialCount, 1, 10000)

  if (!classId || !materialId) {
    throw new ApiError(400, 'Data progress materi tidak lengkap.')
  }

  const existingProgressRows = await rest(
    `member_progress?select=progress_percent&member_id=eq.${eq(user.userId)}&class_id=eq.${eq(classId)}&limit=1`,
  ).catch(() => [])
  const progressPercent = cleanNumber(
    payload.progressPercent ?? existingProgressRows?.[0]?.progress_percent ?? 0,
    0,
    100,
  )

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
      progress_percent: progressPercent,
      last_activity_at: new Date().toISOString(),
    },
  })

  return { ok: true, updatedAt: new Date().toISOString() }
}

function certificatePublic(row) {
  return {
    id: cleanText(row.id || '', 160),
    certificateId: cleanText(row.certificate_id || '', 80),
    memberId: cleanText(row.member_id || '', 120),
    memberName: cleanText(row.member_name || 'Member', 160),
    classId: cleanText(row.class_id || '', 120),
    classTitle: cleanText(row.class_title || 'Kelas', 180),
    mentorName: cleanText(row.mentor_name || 'Ibnu Creative', 140),
    participantName: cleanText(row.participant_name || row.member_name || 'Member', 160),
    templateId: cleanText(row.template_id || '', 160),
    templateSnapshot: parseJson(row.template_snapshot, null),
    completedAt: cleanText(row.completed_at || '', 80),
    issuedAt: cleanText(row.issued_at || row.created_at || '', 80),
    nameChangeUsed: row.name_change_used === true,
    version: cleanNumber(row.version || 1, 1, 1000),
    revokedAt: cleanText(row.revoked_at || '', 80),
    createdAt: cleanText(row.created_at || '', 80),
    updatedAt: cleanText(row.updated_at || '', 80),
  }
}

function certificateTemplatePublic(row) {
  const payload = parseJson(row.payload, {})

  return {
    id: cleanText(row.id || '', 160),
    classId: cleanText(row.class_id || '', 120),
    name: cleanText(row.name || 'Template Sertifikat', 180),
    sizeType: cleanText(row.size_type || payload.sizeType || 'a4Landscape', 40),
    width: cleanNumber(row.width || payload.width || 1123, 320, 2400),
    height: cleanNumber(row.height || payload.height || 794, 320, 2400),
    backgroundColor: cleanText(payload.backgroundColor || '#f8fafc', 40),
    backgroundImage: cleanUrl(payload.backgroundImage || '', 1200),
    snapToGrid: payload.snapToGrid !== false,
    gridSize: cleanNumber(payload.gridSize || 10, 4, 80),
    elements: Array.isArray(payload.elements) ? payload.elements : [],
    createdAt: cleanText(row.created_at || '', 80),
    updatedAt: cleanText(row.updated_at || '', 80),
  }
}

function certificateNameChangePublic(row) {
  return {
    id: cleanText(row.id || '', 160),
    certificateRowId: cleanText(row.certificate_row_id || row.certificate_id || '', 160),
    publicCertificateId: cleanText(row.public_certificate_id || '', 80),
    memberId: cleanText(row.member_id || '', 120),
    memberName: cleanText(row.member_name || 'Member', 160),
    classId: cleanText(row.class_id || '', 120),
    classTitle: cleanText(row.class_title || 'Kelas', 180),
    oldName: cleanText(row.old_name || '', 160),
    newName: cleanText(row.new_name || '', 160),
    reason: cleanText(row.reason || '', 700),
    status: cleanText(row.status || 'pending', 40),
    adminNote: cleanText(row.admin_note || '', 500),
    reviewedAt: cleanText(row.reviewed_at || '', 80),
    createdAt: cleanText(row.created_at || '', 80),
    updatedAt: cleanText(row.updated_at || '', 80),
  }
}

function isMissingCertificateTableError(error) {
  const message = String(error?.message || '').toLowerCase()

  return ['certificates', 'certificate_templates', 'certificate_name_change_requests'].some((table) =>
    message.includes(table),
  ) && (
    message.includes('relation') ||
    message.includes('table') ||
    message.includes('schema cache') ||
    message.includes('does not exist')
  )
}

function certificateTableSetupError(error) {
  if (isMissingCertificateTableError(error)) {
    throw new ApiError(
      500,
      'Tabel sertifikat belum siap di Supabase. Jalankan supabase/schema.sql terbaru dulu.',
    )
  }

  throw error
}

function cleanCertificateTemplateElement(element = {}, index = 0) {
  const type = ['text', 'image', 'shape', 'qr'].includes(element.type) ? element.type : 'text'

  return {
    ...element,
    id: cleanText(element.id || `certificate-element-${index + 1}`, 120),
    type,
    x: cleanNumber(element.x, -2400, 2400),
    y: cleanNumber(element.y, -2400, 2400),
    width: cleanNumber(element.width, 1, 2400, 160),
    height: cleanNumber(element.height, 1, 2400, 80),
    rotation: cleanNumber(element.rotation, -360, 360),
    opacity: Math.min(1, Math.max(0, Number(element.opacity ?? 1) || 0)),
    zIndex: cleanNumber(element.zIndex ?? index + 1, -10000, 10000, index + 1),
    locked: Boolean(element.locked),
    hidden: Boolean(element.hidden),
    ...(type === 'text'
      ? {
          content: cleanText(element.content || 'Teks', 1000),
          fontFamily: cleanText(element.fontFamily || 'Inter', 80),
          fontSize: cleanNumber(element.fontSize, 6, 220, 24),
          minFontSize: cleanNumber(element.minFontSize, 6, 220, 14),
          maxFontSize: cleanNumber(element.maxFontSize, 6, 240, 56),
          fontWeight: element.fontWeight === 'bold' ? 'bold' : 'normal',
          fontStyle: element.fontStyle === 'italic' ? 'italic' : 'normal',
          underline: Boolean(element.underline),
          color: cleanText(element.color || '#111827', 40),
          align: ['left', 'center', 'right'].includes(element.align) ? element.align : 'left',
          letterSpacing: cleanNumber(element.letterSpacing, -4, 24),
          lineHeight: Math.min(3, Math.max(0.8, Number(element.lineHeight) || 1.2)),
          shadow: Boolean(element.shadow),
          gradient: Boolean(element.gradient),
          gradientFrom: cleanText(element.gradientFrom || '#2563eb', 40),
          gradientTo: cleanText(element.gradientTo || '#d97706', 40),
          autoResize: Boolean(element.autoResize),
          nameField: Boolean(element.nameField),
        }
      : {}),
    ...(type === 'image'
      ? {
          src: cleanUrl(element.src || '', 1200),
          alt: cleanText(element.alt || 'Gambar sertifikat', 160),
          objectFit: element.objectFit === 'cover' ? 'cover' : 'contain',
        }
      : {}),
    ...(type === 'shape'
      ? {
          shape: ['rectangle', 'circle', 'line'].includes(element.shape) ? element.shape : 'rectangle',
          fill: cleanText(element.fill || '#f8fafc', 40),
          stroke: cleanText(element.stroke || '#d4af37', 40),
          strokeWidth: cleanNumber(element.strokeWidth, 0, 80),
          borderRadius: cleanNumber(element.borderRadius, 0, 999),
        }
      : {}),
    ...(type === 'qr'
      ? {
          color: cleanText(element.color || '#111827', 40),
          background: cleanText(element.background || '#ffffff', 40),
        }
      : {}),
  }
}

function cleanCertificateTemplateForDb(payload = {}) {
  const sizeType = ['a4Landscape', 'a4Portrait', 'custom'].includes(payload.sizeType)
    ? payload.sizeType
    : 'a4Landscape'
  const width = sizeType === 'a4Portrait'
    ? 794
    : sizeType === 'a4Landscape'
      ? 1123
      : cleanNumber(payload.width, 320, 2400, 1123)
  const height = sizeType === 'a4Portrait'
    ? 1123
    : sizeType === 'a4Landscape'
      ? 794
      : cleanNumber(payload.height, 320, 2400, 794)

  return {
    id: cleanText(payload.id || makeId('certificate-template'), 160),
    classId: cleanText(payload.classId || '', 120),
    name: cleanText(payload.name || 'Template Sertifikat', 180),
    sizeType,
    width,
    height,
    payload: {
      sizeType,
      width,
      height,
      backgroundColor: cleanText(payload.backgroundColor || '#f8fafc', 40),
      backgroundImage: cleanUrl(payload.backgroundImage || '', 1200),
      snapToGrid: payload.snapToGrid !== false,
      gridSize: cleanNumber(payload.gridSize || 10, 4, 80, 10),
      elements: Array.isArray(payload.elements)
        ? payload.elements.slice(0, 220).map(cleanCertificateTemplateElement)
        : [],
    },
  }
}

async function fetchCertificateRowsForUser(user) {
  try {
    if (user.role === 'admin') {
      const [certificateRows, requestRows, templateRows] = await Promise.all([
        rest('certificates?select=*&order=issued_at.desc,created_at.desc'),
        rest('certificate_name_change_requests?select=*&order=created_at.desc,id.desc'),
        rest('certificate_templates?select=*&order=updated_at.desc,created_at.desc'),
      ])

      return {
        certificates: (certificateRows || []).map(certificatePublic),
        certificateNameChangeRequests: (requestRows || []).map(certificateNameChangePublic),
        certificateTemplates: (templateRows || []).map(certificateTemplatePublic),
        updatedAt: new Date().toISOString(),
      }
    }

    const [certificateRows, requestRows, templateRows] = await Promise.all([
      rest(
        `certificates?select=*&member_id=eq.${eq(user.userId)}&order=issued_at.desc,created_at.desc`,
      ),
      rest(
        `certificate_name_change_requests?select=*&member_id=eq.${eq(user.userId)}&order=created_at.desc,id.desc`,
      ),
      rest('certificate_templates?select=*&order=updated_at.desc,created_at.desc').catch(() => []),
    ])

    return {
      certificates: (certificateRows || []).map(certificatePublic),
      certificateNameChangeRequests: (requestRows || []).map(certificateNameChangePublic),
      certificateTemplates: (templateRows || []).map(certificateTemplatePublic),
      updatedAt: new Date().toISOString(),
    }
  } catch (error) {
    certificateTableSetupError(error)
  }
}

export async function fetchCertificates(user) {
  return fetchCertificateRowsForUser(user)
}

export async function saveCertificateTemplate(user, payload) {
  if (user.role !== 'admin') {
    throw new ApiError(403, 'Hanya admin yang bisa menyimpan template sertifikat.')
  }

  const template = cleanCertificateTemplateForDb(payload)

  if (!template.classId) {
    throw new ApiError(400, 'Pilih kelas untuk template sertifikat.')
  }

  const classRows = await rest(
    `classes?select=id,title&id=eq.${eq(template.classId)}&limit=1`,
  ).catch((error) => {
    certificateTableSetupError(error)
  })

  if (!classRows?.[0]) {
    throw new ApiError(404, 'Kelas untuk template sertifikat tidak ditemukan.')
  }

  await rest('certificate_templates?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: {
      id: template.id,
      class_id: template.classId,
      name: template.name,
      size_type: template.sizeType,
      width: template.width,
      height: template.height,
      payload: template.payload,
    },
  }).catch((error) => {
    certificateTableSetupError(error)
  })

  return {
    ok: true,
    message: 'Template sertifikat berhasil disimpan.',
    ...(await fetchCertificateRowsForUser(user)),
  }
}

export async function duplicateCertificateTemplate(user, payload) {
  if (user.role !== 'admin') {
    throw new ApiError(403, 'Hanya admin yang bisa duplicate template sertifikat.')
  }

  const templateId = cleanText(payload.templateId || payload.id || '', 160)

  if (!templateId) {
    throw new ApiError(400, 'ID template wajib dikirim.')
  }

  const rows = await rest(
    `certificate_templates?select=*&id=eq.${eq(templateId)}&limit=1`,
  ).catch((error) => {
    certificateTableSetupError(error)
  })
  const sourceTemplate = rows?.[0]

  if (!sourceTemplate) {
    throw new ApiError(404, 'Template sertifikat tidak ditemukan.')
  }

  const nextId = makeId('certificate-template')

  await rest('certificate_templates', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: {
      id: nextId,
      class_id: cleanText(payload.classId || sourceTemplate.class_id || '', 120),
      name: cleanText(payload.name || `${sourceTemplate.name || 'Template'} Copy`, 180),
      size_type: sourceTemplate.size_type,
      width: sourceTemplate.width,
      height: sourceTemplate.height,
      payload: parseJson(sourceTemplate.payload, {}),
    },
  })

  return {
    ok: true,
    message: 'Template sertifikat berhasil diduplicate.',
    ...(await fetchCertificateRowsForUser(user)),
  }
}

export async function deleteCertificateTemplate(user, templateId) {
  if (user.role !== 'admin') {
    throw new ApiError(403, 'Hanya admin yang bisa menghapus template sertifikat.')
  }

  const id = cleanText(templateId || '', 160)

  if (!id) {
    throw new ApiError(400, 'ID template wajib dikirim.')
  }

  await rest(`certificate_templates?id=eq.${eq(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  }).catch((error) => {
    certificateTableSetupError(error)
  })

  return {
    ok: true,
    message: 'Template sertifikat dihapus.',
    ...(await fetchCertificateRowsForUser(user)),
  }
}

async function findCertificateByAnyId(value) {
  const certificateId = cleanText(value || '', 160)

  if (!certificateId) {
    return null
  }

  const rows = await rest(
    `certificates?select=*&or=(id.eq.${eq(certificateId)},certificate_id.eq.${eq(certificateId)})&limit=1`,
  ).catch((error) => {
    certificateTableSetupError(error)
  })

  return rows?.[0] || null
}

async function uniqueCertificateId() {
  const year = new Date().getFullYear()

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `IBNU-${year}-${randomBytes(4).toString('hex').toUpperCase()}`
    const rows = await rest(
      `certificates?select=id&certificate_id=eq.${eq(code)}&limit=1`,
    ).catch((error) => {
      certificateTableSetupError(error)
    })

    if (!rows?.length) {
      return code
    }
  }

  return `IBNU-${year}-${Date.now().toString(36).toUpperCase()}`
}

async function fetchCertificateTemplateForClass(classId) {
  const rows = await rest(
    `certificate_templates?select=*&class_id=eq.${eq(classId)}&order=updated_at.desc,created_at.desc&limit=1`,
  ).catch(() => [])
  const template = rows?.[0]

  return template ? certificateTemplatePublic(template) : null
}

async function getClassCompletionForCertificate(user, classId) {
  const [classRows, materialRows, progressRows, submissionRows] = await Promise.all([
    rest(`classes?select=*&id=eq.${eq(classId)}&limit=1`),
    rest(
      `materials?select=id,sort_order,requires_task&class_id=eq.${eq(classId)}&order=sort_order.asc,id.asc`,
    ).catch(() => []),
    rest(
      `member_progress?select=*&member_id=eq.${eq(user.userId)}&class_id=eq.${eq(classId)}&limit=1`,
    ).catch(() => []),
    rest(
      `submissions?select=material_id&member_id=eq.${eq(user.userId)}&class_id=eq.${eq(classId)}`,
    ).catch(() => []),
  ])
  const course = classRows?.[0]

  if (!course) {
    throw new ApiError(404, 'Kelas tidak ditemukan.')
  }

  if (course.status !== 'Aktif') {
    throw new ApiError(422, 'Sertifikat hanya tersedia untuk kelas aktif.')
  }

  const allowedClassIds = Array.isArray(user.allowedClassIds) ? user.allowedClassIds : null

  if (allowedClassIds && !allowedClassIds.includes(course.id)) {
    throw new ApiError(403, 'Kelas ini belum ada di akun member.')
  }

  const progress = progressRows?.[0] || null
  const requiredMaterialIds = (materialRows || [])
    .filter((material) => material.requires_task)
    .map((material) => material.id)
  const submittedMaterialIds = new Set(
    (submissionRows || []).map((submission) => submission.material_id).filter(Boolean),
  )
  const requiredDone =
    requiredMaterialIds.length > 0 &&
    requiredMaterialIds.every((materialId) => submittedMaterialIds.has(materialId))
  const progressDone = Number(progress?.progress_percent || 0) >= 100
  const allMaterialsVisited =
    !requiredMaterialIds.length &&
    Number(progress?.material_count || 0) > 0 &&
    Number(progress?.material_index || 0) >= Number(progress?.material_count || 0) - 1
  const completedAt =
    progress?.last_activity_at ||
    progress?.updated_at ||
    (requiredDone ? new Date().toISOString() : '')

  return {
    course,
    complete: requiredDone || progressDone || allMaterialsVisited,
    completedAt,
  }
}

export async function createCertificate(user, payload) {
  if (user.role !== 'member') {
    throw new ApiError(403, 'Hanya member yang bisa membuat sertifikat.')
  }

  const classId = cleanText(payload.classId || '', 120)
  const participantName = cleanText(payload.participantName || payload.name || '', 120)

  if (!classId) {
    throw new ApiError(400, 'Pilih kelas untuk membuat sertifikat.')
  }

  if (participantName.length < 3) {
    throw new ApiError(422, 'Nama lengkap sertifikat minimal 3 karakter.')
  }

  const existingRows = await rest(
    `certificates?select=*&member_id=eq.${eq(user.userId)}&class_id=eq.${eq(classId)}&limit=1`,
  ).catch((error) => {
    certificateTableSetupError(error)
  })
  const existingCertificate = existingRows?.[0]

  if (existingCertificate) {
    return {
      ok: true,
      certificate: certificatePublic(existingCertificate),
      message: 'Sertifikat kelas ini sudah pernah dibuat.',
      ...(await fetchCertificateRowsForUser(user)),
    }
  }

  const completion = await getClassCompletionForCertificate(user, classId)

  if (!completion.complete) {
    throw new ApiError(422, 'Sertifikat baru bisa dibuat setelah progress kelas 100%.')
  }

  const now = new Date().toISOString()
  const certificateId = await uniqueCertificateId()
  const certificateTemplate = await fetchCertificateTemplateForClass(classId)

  await rest('certificates', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: {
      id: makeId('certificate'),
      certificate_id: certificateId,
      member_id: user.userId,
      member_name: cleanText(user.name || 'Member', 160),
      class_id: classId,
      class_title: cleanText(completion.course.title || 'Kelas', 180),
      mentor_name: cleanText(completion.course.mentor || 'Ibnu Creative', 140),
      participant_name: participantName,
      template_id: certificateTemplate?.id || '',
      template_snapshot: certificateTemplate || null,
      completed_at: completion.completedAt || now,
      issued_at: now,
      name_change_used: false,
      version: 1,
      revoked_at: '',
    },
  }).catch((error) => {
    certificateTableSetupError(error)
  })

  const rows = await rest(
    `certificates?select=*&certificate_id=eq.${eq(certificateId)}&limit=1`,
  )

  return {
    ok: true,
    certificate: certificatePublic(rows?.[0] || {}),
    message: 'Sertifikat berhasil dibuat.',
    ...(await fetchCertificateRowsForUser(user)),
  }
}

export async function requestCertificateNameChange(user, payload) {
  if (user.role !== 'member') {
    throw new ApiError(403, 'Hanya member yang bisa mengajukan perubahan nama.')
  }

  const certificateLookup = cleanText(payload.certificateId || payload.id || '', 160)
  const newName = cleanText(payload.newName || '', 120)
  const oldName = cleanText(payload.oldName || '', 120)
  const reason = cleanText(payload.reason || '', 600)

  if (!certificateLookup || !newName || !reason) {
    throw new ApiError(400, 'Nama baru dan alasan perubahan wajib diisi.')
  }

  if (newName.length < 3) {
    throw new ApiError(422, 'Nama baru minimal 3 karakter.')
  }

  if (reason.length < 8) {
    throw new ApiError(422, 'Alasan perubahan minimal 8 karakter.')
  }

  const certificate = await findCertificateByAnyId(certificateLookup)

  if (!certificate) {
    throw new ApiError(404, 'Sertifikat tidak ditemukan.')
  }

  if (certificate.member_id !== user.userId) {
    throw new ApiError(403, 'Sertifikat ini bukan milik akun Anda.')
  }

  if (certificate.name_change_used === true) {
    throw new ApiError(422, 'Kesempatan ubah nama sertifikat sudah digunakan.')
  }

  const existingRequests = await rest(
    `certificate_name_change_requests?select=id&certificate_row_id=eq.${eq(certificate.id)}&limit=1`,
  ).catch((error) => {
    certificateTableSetupError(error)
  })

  if (existingRequests?.length) {
    throw new ApiError(422, 'Permintaan ubah nama untuk sertifikat ini sudah pernah dibuat.')
  }

  const requestId = makeId('cert-name')
  const now = new Date().toISOString()

  await rest('certificate_name_change_requests', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: {
      id: requestId,
      certificate_row_id: certificate.id,
      public_certificate_id: certificate.certificate_id,
      member_id: user.userId,
      member_name: cleanText(user.name || 'Member', 160),
      class_id: certificate.class_id,
      class_title: certificate.class_title,
      old_name: oldName || certificate.participant_name,
      new_name: newName,
      reason,
      status: 'pending',
      admin_note: '',
      reviewed_at: '',
      created_at: now,
    },
  }).catch((error) => {
    certificateTableSetupError(error)
  })

  await rest(`certificates?id=eq.${eq(certificate.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: {
      name_change_used: true,
    },
  })

  return {
    ok: true,
    message: 'Permintaan ubah nama dikirim dan menunggu persetujuan admin.',
    ...(await fetchCertificateRowsForUser(user)),
  }
}

export async function reviewCertificateNameChange(user, payload) {
  if (user.role !== 'admin') {
    throw new ApiError(403, 'Hanya admin yang bisa meninjau perubahan nama.')
  }

  const requestId = cleanText(payload.id || payload.requestId || '', 160)
  const status = cleanText(payload.status || '', 40)
  const adminNote = cleanText(payload.adminNote || '', 500)

  if (!requestId || !['approved', 'rejected'].includes(status)) {
    throw new ApiError(400, 'Status review perubahan nama tidak valid.')
  }

  const requestRows = await rest(
    `certificate_name_change_requests?select=*&id=eq.${eq(requestId)}&limit=1`,
  ).catch((error) => {
    certificateTableSetupError(error)
  })
  const changeRequest = requestRows?.[0]

  if (!changeRequest) {
    throw new ApiError(404, 'Permintaan perubahan nama tidak ditemukan.')
  }

  if (changeRequest.status !== 'pending') {
    throw new ApiError(422, 'Permintaan perubahan nama ini sudah ditinjau.')
  }

  const now = new Date().toISOString()

  if (status === 'approved') {
    const certificate = await findCertificateByAnyId(changeRequest.certificate_row_id)

    if (!certificate) {
      throw new ApiError(404, 'Sertifikat tujuan tidak ditemukan.')
    }

    await rest(`certificates?id=eq.${eq(certificate.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: {
        participant_name: changeRequest.new_name,
        version: cleanNumber(certificate.version || 1, 1, 1000) + 1,
      },
    })
  }

  await rest(`certificate_name_change_requests?id=eq.${eq(requestId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: {
      status,
      admin_note: adminNote,
      reviewed_at: now,
    },
  })

  return {
    ok: true,
    message: status === 'approved'
      ? 'Nama sertifikat berhasil diperbarui.'
      : 'Permintaan ubah nama ditolak.',
    ...(await fetchCertificateRowsForUser(user)),
  }
}

export async function fetchCertificateVerification(certificateId) {
  const lookup = cleanText(certificateId || '', 160)

  if (!lookup) {
    throw new ApiError(400, 'ID sertifikat wajib diisi.')
  }

  const certificate = await findCertificateByAnyId(lookup)

  if (!certificate || certificate.revoked_at) {
    return {
      valid: false,
      certificate: null,
      message: 'Sertifikat tidak ditemukan atau sudah tidak aktif.',
    }
  }

  return {
    valid: true,
    certificate: certificatePublic(certificate),
    message: 'Sertifikat valid dan tercatat di database.',
  }
}

function clientIpFromRequest(request) {
  if (!request) {
    return 'unknown'
  }

  const forwarded = String(request.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim()

  return forwarded || String(request.socket?.remoteAddress || 'unknown')
}

function loginAttemptKey(loginValue, request) {
  return sha256(`${String(loginValue || '').toLowerCase()}|${clientIpFromRequest(request)}`)
}

async function readLoginAttempt(attemptKey) {
  try {
    const rows = await rest(
      `login_attempts?select=*&attempt_key=eq.${eq(attemptKey)}&limit=1`,
    )

    return rows?.[0] || null
  } catch {
    return null
  }
}

async function assertLoginAllowed(attemptKey) {
  const row = await readLoginAttempt(attemptKey)
  const blockedUntil = row?.blocked_until ? Date.parse(row.blocked_until) : 0

  if (blockedUntil && blockedUntil > Date.now()) {
    throw new ApiError(429, 'Terlalu banyak percobaan login. Coba lagi beberapa menit.')
  }
}

async function recordLoginFailure(attemptKey) {
  const row = await readLoginAttempt(attemptKey)
  const lastAttemptAt = row?.last_attempt_at ? Date.parse(row.last_attempt_at) : 0
  const recent = lastAttemptAt && lastAttemptAt >= Date.now() - loginAttemptWindowMs
  const attempts = recent ? Number(row.attempts || 0) + 1 : 1
  const now = new Date()
  const blockedUntil =
    attempts >= maxLoginAttempts
      ? new Date(now.getTime() + loginAttemptBlockMs).toISOString()
      : null

  try {
    await rest('login_attempts?on_conflict=attempt_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: {
        attempt_key: attemptKey,
        attempts,
        last_attempt_at: now.toISOString(),
        blocked_until: blockedUntil,
      },
    })
  } catch {
    // Best-effort protection when the optional table has not been installed yet.
  }
}

async function clearLoginFailures(attemptKey) {
  try {
    await rest(`login_attempts?attempt_key=eq.${eq(attemptKey)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    })
  } catch {
    // Best-effort cleanup.
  }
}

export async function login(payload, userAgent = '') {
  const loginValue = cleanText(payload.username, 120)
  const username = cleanUsername(loginValue)
  const email = cleanEmail(loginValue)
  const password = String(payload.password ?? '')
  const request = typeof userAgent === 'object' && userAgent ? userAgent : null
  const loginUserAgent = request ? request.headers?.['user-agent'] || '' : userAgent

  if ((!username && !email) || !password) {
    throw new ApiError(400, 'Username/email dan password wajib diisi.')
  }

  const attemptKey = loginAttemptKey(loginValue, request)
  await assertLoginAllowed(attemptKey)

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
    await recordLoginFailure(attemptKey)
    throw new ApiError(401, 'Username atau password tidak sesuai.')
  }

  await clearLoginFailures(attemptKey)
  return createAccountSession(account, loginUserAgent)
}

export async function createGoogleAuthUrl(request) {
  assertConfig()

  const redirectTo = cleanExternalUrl(process.env.GOOGLE_AUTH_REDIRECT_URL || '') ||
    absoluteRequestUrl(request, '/auth/google/callback')

  if (!redirectTo) {
    throw new ApiError(500, 'URL callback Google tidak bisa dibuat.')
  }

  const url = new URL(`${supabaseUrl}/auth/v1/authorize`)
  url.searchParams.set('provider', 'google')
  url.searchParams.set('redirect_to', redirectTo)

  return {
    url: url.toString(),
    redirectTo,
  }
}

async function fetchSupabaseAuthUser(accessToken) {
  assertConfig()

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'ibnucreative-google-login',
    },
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new ApiError(401, data.message || data.error_description || 'Login Google tidak valid.')
  }

  return data
}

export async function loginWithGoogle(payload, request) {
  const accessToken = cleanText(payload.accessToken || payload.access_token || '', 2400)

  if (!accessToken) {
    throw new ApiError(400, 'Token Google belum diterima.')
  }

  const authUser = await fetchSupabaseAuthUser(accessToken)
  const email = cleanEmail(authUser.email || authUser.user_metadata?.email || '')

  if (!email) {
    throw new ApiError(422, 'Email Google tidak ditemukan.')
  }

  if (authUser.email_confirmed_at === null || authUser.confirmed_at === null) {
    throw new ApiError(403, 'Email Google belum terverifikasi.')
  }

  const metadata = authUser.user_metadata || {}
  const fullName = cleanText(
    metadata.full_name || metadata.name || metadata.display_name || email.split('@')[0],
    120,
  )
  const avatar = cleanUrl(metadata.avatar_url || metadata.picture || '')
  const rows = await rest(`accounts?select=*&role=eq.member&email=eq.${eq(email)}&limit=1`)
  let account = rows?.[0]

  if (account) {
    const updates = {}

    if (!account.name && fullName) {
      updates.name = fullName
    }

    if (!account.avatar && avatar) {
      updates.avatar = avatar
    }

    if (account.status !== 'Aktif') {
      updates.status = 'Aktif'
    }

    if (Object.keys(updates).length) {
      await rest(`accounts?id=eq.${eq(account.id)}&role=eq.member`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: updates,
      })
      account = { ...account, ...updates }
    }
  } else {
    account = {
      id: makeId('member'),
      role: 'member',
      name: fullName || 'Member Google',
      username: await uniqueMemberUsername(email, fullName),
      email,
      phone: '',
      status: 'Aktif',
      avatar,
      allowed_class_ids: JSON.stringify([]),
      password_hash: await hashPasswordValue(randomBytes(24).toString('hex')),
      joined_at: new Date().toISOString().slice(0, 10),
    }

    await restAccountWrite('accounts', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: account,
    })
  }

  return createAccountSession(account, request)
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
  const rows = await rest(
    `accounts?select=*&id=eq.${eq(user.userId)}&role=eq.${eq(user.role)}&limit=1`,
  )
  const account = rows?.[0]

  if (!account) {
    throw new ApiError(404, 'Akun tidak ditemukan.')
  }

  const updates = {
    name: cleanText(payload.name || user.name, 120),
    avatar: cleanUrl(payload.avatar || ''),
  }

  if (user.role === 'admin') {
    const hasEmailPayload = Object.prototype.hasOwnProperty.call(payload, 'email')
    const nextEmail = hasEmailPayload ? cleanEmail(payload.email) : account.email || ''
    const nextPassword = String(payload.password || '')
    const changesEmail = hasEmailPayload && nextEmail !== (account.email || '')
    const changesPassword = nextPassword.length > 0

    if (hasEmailPayload && !nextEmail) {
      throw new ApiError(400, 'Email admin tidak valid.')
    }

    if (changesPassword && nextPassword.length < 6) {
      throw new ApiError(400, 'Password baru minimal 6 karakter.')
    }

    if (changesEmail || changesPassword) {
      const currentPassword = String(payload.currentPassword || '')

      if (!currentPassword || !(await verifyPasswordValue(currentPassword, account.password_hash))) {
        throw new ApiError(400, 'Password saat ini tidak sesuai.')
      }
    }

    if (changesEmail) {
      const sameEmailRows = await rest(`accounts?select=id&email=eq.${eq(nextEmail)}&limit=2`)
      const emailUsedByOtherAccount = (sameEmailRows || []).some((item) => item.id !== user.userId)

      if (emailUsedByOtherAccount) {
        throw new ApiError(400, 'Email sudah dipakai akun lain.')
      }

      updates.email = nextEmail
    }

    if (changesPassword) {
      updates.password_hash = await hashPasswordValue(nextPassword)
    }
  }

  await rest(`accounts?id=eq.${eq(user.userId)}&role=eq.${eq(user.role)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: updates,
  })
  const updatedRows = await rest(
    `accounts?select=*&id=eq.${eq(user.userId)}&role=eq.${eq(user.role)}&limit=1`,
  )
  const updatedAccount = updatedRows?.[0]

  if (!updatedAccount) {
    throw new ApiError(404, 'Akun tidak ditemukan.')
  }

  return { session: sessionPayload(updatedAccount, user.token) }
}

function extensionFromContentType(contentType, fallback = 'file') {
  const extensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogg',
    'video/quicktime': 'mov',
    'video/x-m4v': 'm4v',
  }

  return extensions[contentType] || fallback
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
    'certificate-image': {
      folder: 'sertifikat',
      role: 'admin',
      mimeTypes: imageTypes,
      maxBytes: 12 * 1024 * 1024,
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

  const extension = extensionFromContentType(contentType, 'file')
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

  const extension = extensionFromContentType(contentType, 'mp4')
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

function firstPhone(payload) {
  const preferred = firstValue(payload, [
    'buyer.phone',
    'buyer.phone_number',
    'buyer.whatsapp',
    'customer.phone',
    'customer.phone_number',
    'customer.whatsapp',
    'user.phone',
    'user.phone_number',
    'order.customer_phone',
    'data.buyer.phone',
    'data.buyer.phone_number',
    'data.buyer.whatsapp',
    'data.customer.phone',
    'data.customer.phone_number',
    'data.customer.whatsapp',
    'data.message_data.customer.phone',
    'data.message_data.customer.phone_number',
    'data.message_data.customer.whatsapp',
    'message_data.customer.phone',
    'message_data.customer.phone_number',
    'message_data.customer.whatsapp',
    'buyer_phone',
    'buyer_phone_number',
    'customer_phone',
    'customer_phone_number',
    'phone',
    'phone_number',
    'telephone',
    'whatsapp',
    'wa',
  ])
  const phone = cleanPhone(preferred)

  if (phone) {
    return phone
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

async function uniqueMemberUsername(email, name) {
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

async function findLynkDigitalProducts(productCandidates) {
  const candidateKeys = [
    ...new Set(productCandidates.map((candidate) => normalizeLynkKey(candidate)).filter(Boolean)),
  ]
  const productIds = []
  const products = await rest(
    'digital_products?select=id,title,lynk_product_key,status&order=id.asc',
  ).catch(() => [])

  for (const row of products || []) {
    if (row.status !== 'Aktif') {
      continue
    }

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
      productIds.push(row.id)
    }
  }

  return [...new Set(productIds.filter(Boolean))]
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

function escapeHtmlWithBreaks(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>')
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

function cleanEmailHeader(value, maxLength = 240) {
  return String(value ?? '')
    .trim()
    .replace(/[\r\n]/g, '')
    .slice(0, maxLength)
}

async function sendResendEmail({ to, subject, text, html }) {
  const apiKey = cleanText(process.env.RESEND_API_KEY || '', 300)
  const from = cleanEmailHeader(
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

function buildTripayPaymentMessage(order) {
  const itemLabel = order.itemType === 'digital_product' ? 'produk digital' : 'kelas'

  return `Halo ${order.buyerName},

Invoice pembayaran ${itemLabel} Anda sudah dibuat.

Item: ${order.classTitle}
Harga: Rp ${new Intl.NumberFormat('id-ID').format(order.amount)}
Biaya layanan: ${order.paymentFee ? `Rp ${new Intl.NumberFormat('id-ID').format(order.paymentFee)}` : 'Gratis'}
Total pembayaran: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount || order.amount)}
Metode pembayaran: ${order.paymentMethod}
${order.expiresAt ? `Batas pembayaran: ${new Date(order.expiresAt).toLocaleString('id-ID')}` : ''}

Silakan selesaikan pembayaran melalui link berikut:
${order.checkoutUrl}

Akses akan aktif otomatis setelah pembayaran sukses.

IbnuCreative Academy`
}

async function sendTripayPaymentEmail(order) {
  if (process.env.TRIPAY_SEND_PAYMENT_EMAIL === 'false') {
    return {
      sent: false,
      message: 'Pengiriman email pembayaran dinonaktifkan.',
    }
  }

  const text = buildTripayPaymentMessage(order)
  const itemLabel = order.itemType === 'digital_product' ? 'produk digital' : 'kelas'
  const expiresLine = order.expiresAt
    ? `<p><strong>Batas pembayaran:</strong> ${escapeHtml(new Date(order.expiresAt).toLocaleString('id-ID'))}</p>`
    : ''
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2>Invoice pembayaran IbnuCreative</h2>
      <p>Halo ${escapeHtml(order.buyerName)},</p>
      <p>Invoice pembayaran ${escapeHtml(itemLabel)} Anda sudah dibuat. Silakan selesaikan pembayaran agar akses bisa aktif otomatis.</p>
      <p><strong>Item:</strong> ${escapeHtml(order.classTitle)}</p>
      <p><strong>Harga:</strong> Rp ${escapeHtml(new Intl.NumberFormat('id-ID').format(order.amount))}</p>
      <p><strong>Biaya layanan:</strong> ${order.paymentFee ? `Rp ${escapeHtml(new Intl.NumberFormat('id-ID').format(order.paymentFee))}` : 'Gratis'}</p>
      <p><strong>Total pembayaran:</strong> Rp ${escapeHtml(new Intl.NumberFormat('id-ID').format(order.totalAmount || order.amount))}</p>
      <p><strong>Metode pembayaran:</strong> ${escapeHtml(order.paymentMethod)}</p>
      ${expiresLine}
      <p>
        <a href="${escapeHtml(order.checkoutUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700">
          Selesaikan Pembayaran
        </a>
      </p>
      <p>Jika tombol tidak bisa dibuka, salin link ini:<br><a href="${escapeHtml(order.checkoutUrl)}">${escapeHtml(order.checkoutUrl)}</a></p>
      <p>IbnuCreative Academy</p>
    </div>
  `

  return sendResendEmail({
    to: order.buyerEmail,
    subject: `Selesaikan pembayaran ${order.classTitle}`,
    text,
    html,
  })
}

function buildTripaySuccessMessage(order) {
  return `Halo ${order.buyerName},

Pembayaran kelas Anda sudah berhasil.

Kelas: ${order.classTitle}
Status akses: Aktif

Silakan login dan buka menu Kelas Saya untuk mulai belajar:
${order.classUrl}

IbnuCreative Academy`
}

async function sendTripayPaymentSuccessEmail(order) {
  if (process.env.TRIPAY_SEND_SUCCESS_EMAIL === 'false') {
    return {
      sent: false,
      message: 'Pengiriman email pembayaran sukses dinonaktifkan.',
    }
  }

  if (!cleanEmail(order.buyerEmail)) {
    return {
      sent: false,
      message: 'Email pembeli tidak valid.',
    }
  }

  const text = buildTripaySuccessMessage(order)
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2>Pembayaran berhasil, akses kelas sudah aktif</h2>
      <p>Halo ${escapeHtml(order.buyerName)},</p>
      <p>Pembayaran kelas Anda sudah berhasil. Akses belajar sudah aktif dan bisa langsung dibuka dari akun member.</p>
      <p><strong>Kelas:</strong> ${escapeHtml(order.classTitle)}</p>
      <p><strong>Status akses:</strong> Aktif</p>
      <p>
        <a href="${escapeHtml(order.classUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700">
          Buka Kelas Saya
        </a>
      </p>
      <p>Jika tombol tidak bisa dibuka, salin link ini:<br><a href="${escapeHtml(order.classUrl)}">${escapeHtml(order.classUrl)}</a></p>
      <p>IbnuCreative Academy</p>
    </div>
  `

  return sendResendEmail({
    to: order.buyerEmail,
    subject: `Pembayaran ${order.classTitle} berhasil`,
    text,
    html,
  })
}

function buildDigitalProductDeliveryMessage(order) {
  return `Halo ${order.buyerName},

Pembayaran produk digital Anda sudah berhasil.

Produk: ${order.productTitle}
${order.downloadUrl ? `Link akses/download: ${order.downloadUrl}` : ''}
${order.deliveryNote ? `Catatan: ${order.deliveryNote}` : ''}

Simpan email ini untuk mengakses produk Anda kembali.

IbnuCreative Academy`
}

async function sendDigitalProductDeliveryEmail(order) {
  if (process.env.DIGITAL_PRODUCT_SEND_EMAIL === 'false') {
    return {
      sent: false,
      message: 'Pengiriman email produk digital dinonaktifkan.',
    }
  }

  if (!cleanEmail(order.buyerEmail)) {
    return {
      sent: false,
      message: 'Email pembeli tidak valid.',
    }
  }

  const text = buildDigitalProductDeliveryMessage(order)
  const downloadButton = order.downloadUrl
    ? `<p><a href="${escapeHtml(order.downloadUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700">Akses Produk</a></p>`
    : ''
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2>Produk digital Anda sudah siap</h2>
      <p>Halo ${escapeHtml(order.buyerName)},</p>
      <p>Pembayaran produk digital Anda sudah berhasil. Silakan akses produk dari link berikut.</p>
      <p><strong>Produk:</strong> ${escapeHtml(order.productTitle)}</p>
      ${downloadButton}
      ${order.downloadUrl ? `<p>Jika tombol tidak bisa dibuka, salin link ini:<br><a href="${escapeHtml(order.downloadUrl)}">${escapeHtml(order.downloadUrl)}</a></p>` : ''}
      ${order.deliveryNote ? `<p><strong>Catatan akses:</strong><br>${escapeHtmlWithBreaks(order.deliveryNote)}</p>` : ''}
      <p>IbnuCreative Academy</p>
    </div>
  `

  return sendResendEmail({
    to: order.buyerEmail,
    subject: `Produk digital ${order.productTitle} sudah siap`,
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

function requestOrigin(request) {
  const host = cleanText(
    request.headers['x-forwarded-host'] ||
      request.headers.host ||
      '',
    180,
  )
  const forwardedProto = cleanText(request.headers['x-forwarded-proto'] || '', 40)
    .split(',')[0]
    .trim()
  const proto = forwardedProto || (host.includes('localhost') ? 'http' : 'https')

  return host ? `${proto}://${host}` : ''
}

function absoluteRequestUrl(request, path) {
  const origin = requestOrigin(request)

  return origin ? `${origin}${path}` : ''
}

function publicCodeFromId(id, takenCodes = new Set()) {
  const source = String(id || 'item')
  let hash = 0x811c9dc5

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  for (let salt = 0; salt < 100; salt += 1) {
    const code = String(10000 + ((hash + salt * 9973) % 90000)).padStart(5, '0')

    if (!takenCodes.has(code)) {
      takenCodes.add(code)
      return code
    }
  }

  return String(10000 + (hash % 90000)).padStart(5, '0')
}

function withPublicCodes(rows = []) {
  const takenCodes = new Set()

  return rows.map((row) => ({
    ...row,
    public_code: publicCodeFromId(row.id, takenCodes),
  }))
}

function absolutePublicUrl(request, value) {
  const url = cleanUrl(value || '')

  if (!url || url.startsWith('data:')) {
    return ''
  }

  if (url.startsWith('/')) {
    return absoluteRequestUrl(request, url)
  }

  return url
}

async function readAppHtml() {
  for (const filePath of ['dist/index.html', 'index.html']) {
    try {
      return await readFile(filePath, 'utf8')
    } catch {
      // Try the next known app entry point.
    }
  }

  return '<!doctype html><html lang="id"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>IbnuCreative</title></head><body><div id="root"><p style="font-family:system-ui,sans-serif;padding:24px">Halaman sedang dimuat. Jika tidak terbuka, kembali ke beranda.</p></div></body></html>'
}

function publicProductAccessUrl(request, orderCode) {
  const code = cleanText(orderCode || '', 180)

  return code ? absoluteRequestUrl(request, `/produk-akses/${encodeURIComponent(code)}`) : ''
}

function cleanDigitalProductReviews(value) {
  const parsedValue = typeof value === 'string' ? parseJson(value, []) : value
  const source = Array.isArray(parsedValue) ? parsedValue.slice(0, 10) : []

  return source
    .map((item, index) => ({
      id: cleanText(item?.id || `review-${index + 1}`, 80),
      name: cleanText(item?.name || '', 80),
      instagram: cleanText(String(item?.instagram || '').replace(/^@/, ''), 80),
      avatar: cleanUrl(item?.avatar || ''),
      rating: cleanNumber(item?.rating, 1, 5),
      date: cleanText(item?.date || '', 40),
      time: cleanText(item?.time || '', 20),
      likes: cleanNumber(item?.likes, 0, 1000000),
      message: cleanText(item?.message || '', 500),
    }))
    .filter((item) => item.name || item.message)
}

function cleanDigitalProductAddOns(value) {
  const parsedValue = typeof value === 'string' ? parseJson(value, []) : value
  const source = Array.isArray(parsedValue) ? parsedValue.slice(0, 20) : []

  return source
    .map((item, index) => ({
      id: cleanText(item?.id || `addon-${index + 1}`, 80),
      title: cleanText(item?.title || '', 120),
      price: cleanNumber(item?.price, 0, 1000000000),
      description: cleanText(item?.description || '', 300),
    }))
    .filter((item) => item.title)
}

function cleanDigitalProductQuestions(value) {
  const parsedValue = typeof value === 'string' ? parseJson(value, []) : value
  const source = Array.isArray(parsedValue) ? parsedValue.slice(0, 20) : []

  return source
    .map((item, index) => ({
      id: cleanText(item?.id || `question-${index + 1}`, 80),
      label: cleanText(item?.label || '', 160),
      required: Boolean(item?.required),
    }))
    .filter((item) => item.label)
}

function injectHeadMeta(html, meta) {
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}" />` : '',
    meta.image ? `<meta property="og:image:secure_url" content="${escapeHtml(meta.image)}" />` : '',
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    meta.image ? `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />` : '',
  ].filter(Boolean).join('\n    ')

  return html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta name="description"[^>]*>/i, '')
    .replace('</head>', `    ${tags}\n  </head>`)
}

export async function renderPublicDetailPage(request, response, { type, code }) {
  const itemType = type === 'kelas' ? 'kelas' : 'produk'
  const cleanCode = cleanText(code || '', 20)
  const publicPath = `/${itemType}/${encodeURIComponent(cleanCode)}`
  const rows = itemType === 'kelas'
    ? await rest(`classes?select=*&status=eq.${eq('Aktif')}&order=updated_at.desc,id.asc`)
    : await rest(`digital_products?select=*&status=eq.${eq('Aktif')}&order=updated_at.desc,id.asc`)
  const item = withPublicCodes(rows || []).find((row) => row.public_code === cleanCode || row.id === cleanCode)

  if (!item) {
    response.statusCode = 404
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(injectHeadMeta(await readAppHtml(), {
      title: 'Halaman tidak ditemukan',
      description: 'Kelas atau produk yang Anda buka tidak ditemukan.',
      image: '',
      url: absoluteRequestUrl(request, publicPath),
    }))
    return
  }

  const amount = cleanNumber(item.sale_price, 0, 1000000000) || cleanNumber(item.price, 0, 1000000000)
  const priceText = amount ? `Harga ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)}.` : 'Gratis.'
  const description = itemType === 'kelas'
    ? `${cleanText(String(item.description || '').replace(/<[^>]*>/g, ' '), 180) || `${item.mentor || 'Mentor IbnuCreative'} membimbing kelas ini`}. ${priceText}`
    : `${item.description || item.file_name || item.platform_type || 'Produk digital IbnuCreative'}. ${priceText}`
  const html = injectHeadMeta(await readAppHtml(), {
    title: cleanText(item.title || (itemType === 'kelas' ? 'Detail kelas' : 'Detail produk'), 160),
    description: cleanText(description, 220),
    image: absolutePublicUrl(request, item.thumbnail || ''),
    url: absoluteRequestUrl(request, publicPath),
  })

  response.statusCode = 200
  response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300')
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(html)
}

function tripayApiBaseUrl() {
  const configured = cleanExternalUrl(process.env.TRIPAY_API_BASE_URL || '')

  if (configured) {
    return configured.replace(/\/+$/, '')
  }

  return process.env.TRIPAY_IS_PRODUCTION === 'true'
    ? 'https://tripay.co.id/api'
    : 'https://tripay.co.id/api-sandbox'
}

function inferTripayMethodBrand(code, name = '') {
  const value = `${code} ${name}`.toLowerCase()

  if (value.includes('qris')) return 'qris'
  if (value.includes('bca')) return 'bca'
  if (value.includes('bni')) return 'bni'
  if (value.includes('bri')) return 'bri'
  if (value.includes('mandiri')) return 'mandiri'
  if (value.includes('permata')) return 'permata'
  if (value.includes('cimb')) return 'cimb'
  if (value.includes('bsi')) return 'bsi'
  if (value.includes('muamalat')) return 'muamalat'
  if (value.includes('alfamart')) return 'alfamart'
  if (value.includes('indomaret')) return 'indomaret'
  if (value.includes('alfamidi')) return 'alfamidi'
  if (value.includes('ovo')) return 'ovo'
  if (value.includes('shopee')) return 'shopeepay'

  return code.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40) || 'wallet'
}

function isTripayChannelActive(channel) {
  const active = channel.active ?? channel.is_active ?? channel.enabled
  const status = cleanText(channel.status || channel.payment_status || '', 40).toLowerCase()

  if (active === false || active === 0 || active === '0') {
    return false
  }

  if (['inactive', 'disabled', 'nonaktif', 'off'].includes(status)) {
    return false
  }

  return true
}

function tripayMethodFromChannel(channel) {
  const code = cleanText(
    channel.code || channel.payment_code || channel.method || channel.payment_method || '',
    40,
  ).toUpperCase()
  const label = cleanText(
    channel.name || channel.payment_name || channel.title || channel.label || code,
    80,
  )
  const logoUrl = cleanExternalUrl(
    channel.icon_url ||
      channel.iconUrl ||
      channel.logo_url ||
      channel.logoUrl ||
      channel.image_url ||
      channel.imageUrl ||
      '',
  )
  const feeFlat = cleanNumber(
    channel.total_fee?.flat ??
      channel.total_fee_flat ??
      channel.fee_customer?.flat ??
      channel.fee_customer_flat ??
      channel.fee?.flat ??
      channel.flat_fee ??
      channel.fee_flat ??
      channel.fee ??
      channel.total_fee ??
      0,
    0,
    100000000,
  )
  const feePercent = Math.max(0, Math.min(100, Number(
    channel.total_fee?.percent ??
      channel.total_fee_percent ??
      channel.fee_customer?.percent ??
      channel.fee_customer_percent ??
      channel.fee?.percent ??
      channel.percent_fee ??
      channel.fee_percent ??
      0,
  ) || 0))

  if (!code) {
    return null
  }

  return {
    code,
    label: label || code,
    brand: inferTripayMethodBrand(code, label),
    logoUrl,
    feeFlat,
    feePercent,
  }
}

async function fetchTripayPaymentChannels() {
  const apiKey = cleanText(process.env.TRIPAY_API_KEY || '', 300)

  if (!apiKey) {
    return []
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)

  try {
    const response = await fetch(`${tripayApiBaseUrl()}/merchant/payment-channel`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'User-Agent': 'ibnucreative-tripay-payment-methods',
      },
      signal: controller.signal,
    })
    const responseText = await response.text()
    const responseData = parseJson(responseText, {})

    if (!response.ok || responseData.success === false) {
      return []
    }

    const channels = Array.isArray(responseData.data)
      ? responseData.data
      : Array.isArray(responseData)
        ? responseData
        : []

    return channels
      .filter(isTripayChannelActive)
      .map(tripayMethodFromChannel)
      .filter(Boolean)
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}

function mergeTripayPaymentMethods(savedMethods = [], tripayMethods = []) {
  const savedByCode = new Map(
    cleanWebsiteSettings({ paymentMethods: savedMethods }).paymentMethods.map((method) => [
      method.code,
      method,
    ]),
  )
  const remoteMethods = cleanWebsiteSettings({ paymentMethods: tripayMethods }).paymentMethods

  if (!remoteMethods.length) {
    return [...savedByCode.values()]
  }

  return remoteMethods.map((method) => {
    const saved = savedByCode.get(method.code)

    return {
      ...method,
      logoUrl: saved?.logoUrl || method.logoUrl || '',
      label: saved?.label || method.label,
      brand: saved?.brand || method.brand,
      feeFlat: method.feeFlat || saved?.feeFlat || 0,
      feePercent: method.feePercent || saved?.feePercent || 0,
    }
  })
}

async function hydrateTripayPaymentMethods(settings) {
  const tripayMethods = await fetchTripayPaymentChannels()

  if (!tripayMethods.length) {
    return settings
  }

  return cleanWebsiteSettings({
    ...settings,
    paymentMethods: mergeTripayPaymentMethods(settings.paymentMethods, tripayMethods),
  })
}

function tripayConfig(request) {
  const merchantCode = cleanText(process.env.TRIPAY_MERCHANT_CODE || '', 80)
  const apiKey = cleanText(process.env.TRIPAY_API_KEY || '', 300)
  const privateKey = cleanText(process.env.TRIPAY_PRIVATE_KEY || '', 300)
  const method = cleanText(process.env.TRIPAY_DEFAULT_METHOD || 'QRIS', 40)
  const callbackUrl =
    cleanExternalUrl(process.env.TRIPAY_CALLBACK_URL || '') ||
    absoluteRequestUrl(request, '/api/tripay-webhook')
  const returnUrl =
    cleanExternalUrl(process.env.TRIPAY_RETURN_URL || '') ||
    absoluteRequestUrl(request, '/member?menu=my-courses')
  const expiredMinutes = cleanNumber(process.env.TRIPAY_EXPIRED_MINUTES || 1440, 5, 10080)
  const customerPhone = cleanText(
    process.env.TRIPAY_DEFAULT_CUSTOMER_PHONE || '081234567890',
    30,
  )

  if (!merchantCode || !apiKey || !privateKey) {
    throw new ApiError(500, 'Konfigurasi Tripay belum lengkap di environment.')
  }

  if (!callbackUrl || !returnUrl) {
    throw new ApiError(500, 'URL callback/return Tripay belum bisa dibuat.')
  }

  return {
    merchantCode,
    apiKey,
    privateKey,
    method,
    callbackUrl,
    returnUrl,
    expiredMinutes,
    customerPhone,
  }
}

function appendFormValue(params, key, value) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendFormValue(params, `${key}[${index}]`, item))
    return
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([childKey, childValue]) =>
      appendFormValue(params, `${key}[${childKey}]`, childValue),
    )
    return
  }

  if (value !== undefined && value !== null) {
    params.append(key, String(value))
  }
}

function encodeTripayForm(payload) {
  const params = new URLSearchParams()

  Object.entries(payload).forEach(([key, value]) => appendFormValue(params, key, value))

  return params.toString()
}

function tripayCheckoutSignature({ merchantCode, merchantRef, amount, privateKey }) {
  return createHmac('sha256', privateKey)
    .update(`${merchantCode}${merchantRef}${amount}`)
    .digest('hex')
}

function validTripaySignature(request, rawBody, privateKey) {
  const signatures = [
    request.headers['x-callback-signature'],
    request.headers['x-tripay-signature'],
    request.headers['x-signature'],
    request.headers.signature,
  ].filter(Boolean)
  const expected = createHmac('sha256', privateKey).update(rawBody).digest('hex')

  return signatures.some((signature) =>
    timingSafeSame(String(signature).trim().replace(/^sha256=/i, ''), expected),
  )
}

function isTripayPaid(payload) {
  const status = firstValue(payload, ['status', 'data.status']).toUpperCase()

  return status === 'PAID' || Boolean(firstValue(payload, ['paid_at', 'data.paid_at']))
}

async function grantMemberClassAccess(memberId, classId) {
  const memberRows = await rest(
    `accounts?select=*&id=eq.${eq(memberId)}&role=eq.member&limit=1`,
  )
  const member = memberRows?.[0]

  if (!member) {
    throw new ApiError(404, 'Member pembeli tidak ditemukan.')
  }

  const currentClassIds = parseJson(member.allowed_class_ids, null)

  if (currentClassIds === null) {
    return { member, granted: false, alreadyHasAccess: true }
  }

  const safeClassIds = Array.isArray(currentClassIds)
    ? currentClassIds.map((id) => cleanText(id, 120)).filter(Boolean)
    : []

  if (safeClassIds.includes(classId)) {
    return { member, granted: false, alreadyHasAccess: true }
  }

  const mergedClassIds = [...new Set([...safeClassIds, classId])]

  await rest(`accounts?id=eq.${eq(member.id)}&role=eq.member`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: {
      status: 'Aktif',
      allowed_class_ids: JSON.stringify(mergedClassIds),
    },
  })
  await incrementClassStudents([classId])

  return {
    member: {
      ...member,
      allowed_class_ids: JSON.stringify(mergedClassIds),
    },
    granted: true,
    alreadyHasAccess: false,
  }
}

async function grantDigitalProductAccess({
  productId,
  memberId = '',
  buyerEmail = '',
  buyerName = '',
  source = 'manual',
  orderId = '',
}) {
  const productRows = await rest(
    `digital_products?select=*&id=eq.${eq(productId)}&status=eq.${eq('Aktif')}&limit=1`,
  )
  const product = productRows?.[0]

  if (!product) {
    throw new ApiError(404, 'Produk digital aktif tidak ditemukan.')
  }

  const accessRows = await rest(
    `digital_product_access?select=*&product_id=eq.${eq(product.id)}&or=(member_id.eq.${eq(
      memberId || '-',
    )},buyer_email.eq.${eq(cleanEmail(buyerEmail) || '-')})&limit=1`,
  ).catch(() => [])
  const existingAccess = accessRows?.[0]

  if (existingAccess) {
    const nextOrderId = cleanText(orderId, 180)
    if (nextOrderId && !existingAccess.order_id) {
      await rest(`digital_product_access?id=eq.${eq(existingAccess.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { order_id: nextOrderId },
      }).catch(() => {})
      existingAccess.order_id = nextOrderId
    }
    return { product, granted: false, alreadyHasAccess: true, access: existingAccess }
  }

  const access = {
    id: makeId('digital-access'),
    product_id: product.id,
    product_title: product.title,
    member_id: cleanText(memberId, 120),
    buyer_name: cleanText(buyerName || 'Pembeli', 160),
    buyer_email: cleanEmail(buyerEmail),
    source: cleanText(source, 40),
    order_id: cleanText(orderId, 180),
    status: 'active',
    download_url: cleanExternalUrl(product.file_url || ''),
  }

  await rest('digital_product_access', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: access,
  })

  return { product, granted: true, alreadyHasAccess: false, access }
}

async function findReusableTripayOrder(memberId, classId) {
  const rows = await rest(
    `tripay_orders?select=*&member_id=eq.${eq(memberId)}&class_id=eq.${eq(
      classId,
    )}&order=created_at.desc&limit=10`,
  )
  const checkedRows = await Promise.all((rows || []).map(expireTripayOrderIfNeeded))

  return checkedRows.find((row) =>
    ['pending', 'unpaid', 'waiting', 'callback'].includes(tripayOrderStatus(row)),
  )
}

async function tripayPaymentMethodLabel(method) {
  const code = cleanText(method || '', 40).toUpperCase()

  if (!code) {
    return ''
  }

  try {
    const settings = (await fetchWebsiteSettings()).settings
    return settings.paymentMethods.find((item) => item.code === code)?.label || code
  } catch {
    return code
  }
}

async function tripayPaymentMethodDetails(method) {
  const code = cleanText(method || '', 40).toUpperCase()

  if (!code) {
    return null
  }

  try {
    const settings = (await fetchWebsiteSettings()).settings
    return settings.paymentMethods.find((item) => item.code === code) || null
  } catch {
    return null
  }
}

function calculatePaymentMethodFee(method, amount) {
  if (!method) {
    return 0
  }

  const flatFee = cleanNumber(method.feeFlat || 0, 0, 100000000)
  const percentFee = Math.max(0, Math.min(100, Number(method.feePercent) || 0))

  return flatFee + Math.max(0, Math.round((cleanNumber(amount, 0, 1000000000) * percentFee) / 100))
}

export async function createTripayCheckout(request) {
  const user = await requireUser(request, 'member')
  const payload = await readJson(request)
  const classId = cleanText(payload.classId, 120)
  const productId = cleanText(payload.productId, 120)
  const checkoutType = productId ? 'digital_product' : 'class'
  const paymentMethod = cleanText(payload.paymentMethod || '', 40).toUpperCase()
  const forceNewPayment = payload.forceNewPayment === true

  if (!classId && !productId) {
    throw new ApiError(400, 'ID kelas atau produk wajib dikirim.')
  }

  const [itemRows, memberRows] = await Promise.all([
    checkoutType === 'digital_product'
      ? rest(`digital_products?select=*&id=eq.${eq(productId)}&status=eq.${eq('Aktif')}&limit=1`)
      : rest(`classes?select=*&id=eq.${eq(classId)}&status=eq.Aktif&limit=1`),
    rest(`accounts?select=*&id=eq.${eq(user.userId)}&role=eq.member&limit=1`),
  ])
  const checkoutItem = itemRows?.[0]
  const member = memberRows?.[0]

  if (!checkoutItem) {
    throw new ApiError(
      404,
      checkoutType === 'digital_product'
        ? 'Produk digital aktif tidak ditemukan.'
        : 'Kelas aktif tidak ditemukan.',
    )
  }

  if (!member) {
    throw new ApiError(404, 'Akun member tidak ditemukan.')
  }

  if (checkoutType === 'class') {
    const currentClassIds = parseJson(member.allowed_class_ids, null)

    if (currentClassIds === null || (Array.isArray(currentClassIds) && currentClassIds.includes(classId))) {
      return {
        ok: true,
        alreadyHasAccess: true,
        message: 'Akses kelas sudah aktif.',
      }
    }
  } else {
    const existingAccess = await rest(
      `digital_product_access?select=*&product_id=eq.${eq(checkoutItem.id)}&member_id=eq.${eq(member.id)}&limit=1`,
    ).catch(() => [])

    if (existingAccess?.[0]) {
      const access = existingAccess[0]
      const accessOrderId = cleanText(
        access.order_id || `ACCESS-${checkoutItem.id}-${member.id}`,
        180,
      )

      if (!access.order_id && accessOrderId) {
        await rest(`digital_product_access?id=eq.${eq(access.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: { order_id: accessOrderId },
        }).catch(() => {})
      }

      return {
        ok: true,
        alreadyHasAccess: true,
        accessUrl: publicProductAccessUrl(request, accessOrderId),
        accessOrderId,
        message: 'Produk digital sudah dimiliki.',
      }
    }
  }

  const normalPrice = cleanNumber(checkoutItem.price, 0, 1000000000)
  const salePrice = cleanNumber(checkoutItem.sale_price, 0, 1000000000)
  const amount = salePrice > 0
    ? salePrice
    : normalPrice

  if (amount <= 0) {
    const accessResult = checkoutType === 'digital_product'
      ? await grantDigitalProductAccess({
          productId: checkoutItem.id,
          memberId: member.id,
          buyerEmail: member.email || user.email || '',
          buyerName: member.name || user.name || 'Member',
          source: 'free',
          orderId: `FREE-${checkoutItem.id}-${member.id}`,
        })
      : await grantMemberClassAccess(member.id, checkoutItem.id)

    const accessOrderId = checkoutType === 'digital_product'
      ? accessResult.access?.order_id || `FREE-${checkoutItem.id}-${member.id}`
      : ''

    return {
      ok: true,
      freeAccessGranted: accessResult.granted,
      alreadyHasAccess: accessResult.alreadyHasAccess,
      accessUrl: checkoutType === 'digital_product'
        ? publicProductAccessUrl(request, accessOrderId)
        : '',
      accessOrderId,
      message: accessResult.granted
        ? checkoutType === 'digital_product'
          ? 'Produk digital gratis sudah aktif.'
          : 'Akses kelas gratis sudah aktif.'
        : checkoutType === 'digital_product'
          ? 'Produk digital sudah dimiliki.'
          : 'Akses kelas sudah aktif.',
    }
  }

  const buyerEmail = cleanEmail(member.email || user.email || '')

  if (!buyerEmail) {
    throw new ApiError(422, 'Email member wajib diisi sebelum checkout Tripay.')
  }

  const config = tripayConfig(request)
  const method = paymentMethod || config.method
  const orderItemId = checkoutType === 'digital_product'
    ? `product:${checkoutItem.id}`
    : checkoutItem.id
  const existingOrder = forceNewPayment
    ? null
    : await findReusableTripayOrder(member.id, orderItemId)

  if (existingOrder?.checkout_url) {
    const existingPayment = paymentPublic(existingOrder, 'tripay')

    return {
      ok: true,
      existingPayment: true,
      checkoutUrl: existingPayment.checkoutUrl,
      merchantRef: existingPayment.merchantRef,
      reference: existingPayment.reference,
      paymentMethod: existingPayment.paymentMethod,
      expiresAt: existingPayment.expiresAt,
      message: 'Invoice pembayaran sebelumnya masih aktif.',
    }
  }

  const merchantRef = `IC${Date.now()}${randomBytes(3).toString('hex').toUpperCase()}`
  const itemSku = cleanText(checkoutItem.tripay_product_key || checkoutItem.id, 80)
  const expiresAt = new Date(Date.now() + config.expiredMinutes * 60 * 1000).toISOString()
  const checkoutPayload = {
    method,
    merchant_ref: merchantRef,
    amount,
    customer_name: cleanText(member.name || user.name || 'Member', 120),
    customer_email: buyerEmail,
    customer_phone: config.customerPhone,
    order_items: [
      {
        sku: itemSku,
        name: cleanText(checkoutItem.title || 'IbnuCreative', 160),
        price: amount,
        quantity: 1,
      },
    ],
    callback_url: config.callbackUrl,
    return_url: checkoutType === 'digital_product'
      ? publicProductAccessUrl(request, merchantRef) || config.returnUrl
      : config.returnUrl,
    expired_time: Math.floor(Date.parse(expiresAt) / 1000),
    signature: tripayCheckoutSignature({
      merchantCode: config.merchantCode,
      merchantRef,
      amount,
      privateKey: config.privateKey,
    }),
  }
  const response = await fetch(`${tripayApiBaseUrl()}/transaction/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'ibnucreative-tripay-checkout',
    },
    body: encodeTripayForm(checkoutPayload),
  })
  const responseText = await response.text()
  const responseData = parseJson(responseText, {})

  if (!response.ok || responseData.success === false) {
    throw new ApiError(
      response.status || 502,
      responseData.message || responseData.error || 'Checkout Tripay gagal dibuat.',
    )
  }

  const tripayData = responseData.data || responseData
  const paymentMethodDetails = await tripayPaymentMethodDetails(method)
  const paymentMethodLabel = paymentMethodDetails?.label || await tripayPaymentMethodLabel(method)
  const paymentFee = calculatePaymentMethodFee(paymentMethodDetails, amount)
  const savedPayload = JSON.stringify({
    order_type: checkoutType,
    product_id: checkoutType === 'digital_product' ? checkoutItem.id : '',
    product_title: checkoutType === 'digital_product' ? checkoutItem.title : '',
    delivery_url: checkoutType === 'digital_product' ? checkoutItem.file_url || '' : '',
    delivery_note: checkoutType === 'digital_product' ? checkoutItem.delivery_note || '' : '',
    custom_message: checkoutType === 'digital_product' && checkoutItem.custom_message_enabled ? checkoutItem.custom_message || '' : '',
    payment_method: method,
    payment_name: paymentMethodLabel,
    payment_fee: paymentFee,
    total_amount: amount + paymentFee,
    data: tripayData,
    response: responseData,
  })
  const checkoutUrl =
    cleanExternalUrl(tripayData.checkout_url || '') ||
    cleanExternalUrl(tripayData.pay_url || '') ||
    cleanExternalUrl(tripayData.payment_url || '')
  const reference = cleanText(tripayData.reference || '', 180)

  if (!checkoutUrl) {
    throw new ApiError(502, 'Tripay tidak mengembalikan URL checkout.')
  }

  await rest('tripay_orders', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: {
      id: makeId('tripay'),
      merchant_ref: merchantRef,
      reference,
      member_id: member.id,
      buyer_name: cleanText(member.name || user.name || 'Member', 160),
      buyer_email: buyerEmail,
      class_id: orderItemId,
      class_title: checkoutItem.title,
      amount,
      status: 'pending',
      checkout_url: checkoutUrl,
      payload: savedPayload,
    },
  })
  const emailResult = await sendTripayPaymentEmail({
    buyerName: cleanText(member.name || user.name || 'Member', 160),
    buyerEmail,
    classTitle: cleanText(checkoutItem.title || 'IbnuCreative', 160),
    itemType: checkoutType,
    amount,
    paymentFee,
    totalAmount: amount + paymentFee,
    paymentMethod: paymentMethodLabel,
    checkoutUrl,
    expiresAt,
  })

  return {
    ok: true,
    checkoutUrl,
    merchantRef,
    reference,
    paymentMethod: method,
    expiresAt,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? '' : emailResult.message || '',
    message: 'Checkout Tripay berhasil dibuat.',
  }
}

export async function createPublicDigitalProductCheckout(request) {
  const payload = await readJson(request)
  const productId = cleanText(payload.productId, 120)
  const paymentMethod = cleanText(payload.paymentMethod || '', 40).toUpperCase()
  const buyerName = cleanText(payload.buyerName || '', 120)
  const buyerEmail = cleanEmail(payload.buyerEmail || '')
  const buyerPhone = cleanPhone(payload.buyerPhone || '')
  const acceptedTerms = payload.acceptedTerms === true
  const acceptedMarketing = payload.acceptedMarketing === true
  const customAnswers = payload.customAnswers && typeof payload.customAnswers === 'object' && !Array.isArray(payload.customAnswers)
    ? Object.fromEntries(
        Object.entries(payload.customAnswers)
          .map(([key, value]) => [cleanText(key, 100), cleanText(value, 500)])
          .filter(([key, value]) => key && value),
      )
    : {}

  if (!productId) {
    throw new ApiError(400, 'ID produk wajib dikirim.')
  }

  if (!buyerName || !buyerEmail || !buyerPhone) {
    throw new ApiError(422, 'Nama, email, dan nomor HP wajib diisi.')
  }

  if (!acceptedTerms || !acceptedMarketing) {
    throw new ApiError(422, 'Centang persetujuan checkout terlebih dahulu.')
  }

  const productRows = await rest(
    `digital_products?select=*&id=eq.${eq(productId)}&status=eq.${eq('Aktif')}&limit=1`,
  )
  const product = productRows?.[0]

  if (!product) {
    throw new ApiError(404, 'Produk digital aktif tidak ditemukan.')
  }

  const normalPrice = cleanNumber(product.price, 0, 1000000000)
  const salePrice = cleanNumber(product.sale_price, 0, 1000000000)
  const amount = salePrice > 0 ? salePrice : normalPrice

  if (amount <= 0) {
    const freeOrderId = `FREE-PUBLIC-${product.id}-${Date.now()}`
    const accessResult = await grantDigitalProductAccess({
      productId: product.id,
      buyerEmail,
      buyerName,
      source: 'free-public',
      orderId: freeOrderId,
    })
    const accessUrl = publicProductAccessUrl(request, accessResult.access?.order_id || freeOrderId)
    const deliveryEmailResult = await sendDigitalProductDeliveryEmail({
      buyerName,
      buyerEmail,
      productTitle: cleanText(product.title || 'Produk digital', 160),
      productDescription: cleanText(product.description || '', 800),
      downloadUrl: cleanExternalUrl(accessUrl || product.file_url || ''),
      customMessage: product.custom_message_enabled ? cleanText(product.custom_message || '', 800) : '',
      deliveryNote: cleanText(product.delivery_note || '', 800),
    })

    return {
      ok: true,
      freeAccessGranted: accessResult.granted,
      accessUrl,
      emailSent: deliveryEmailResult.sent,
      message: 'Produk gratis sudah dikirim ke email.',
    }
  }

  if (!paymentMethod) {
    throw new ApiError(422, 'Pilih metode pembayaran dulu.')
  }

  const config = tripayConfig(request)
  const merchantRef = `ICP${Date.now()}${randomBytes(3).toString('hex').toUpperCase()}`
  const itemSku = cleanText(product.tripay_product_key || product.id, 80)
  const expiresAt = new Date(Date.now() + config.expiredMinutes * 60 * 1000).toISOString()
  const checkoutPayload = {
    method: paymentMethod,
    merchant_ref: merchantRef,
    amount,
    customer_name: buyerName,
    customer_email: buyerEmail,
    customer_phone: buyerPhone || config.customerPhone,
    order_items: [
      {
        sku: itemSku,
        name: cleanText(product.title || 'Produk digital', 160),
        price: amount,
        quantity: 1,
      },
    ],
    callback_url: config.callbackUrl,
    return_url: publicProductAccessUrl(request, merchantRef) || config.returnUrl,
    expired_time: Math.floor(Date.parse(expiresAt) / 1000),
    signature: tripayCheckoutSignature({
      merchantCode: config.merchantCode,
      merchantRef,
      amount,
      privateKey: config.privateKey,
    }),
  }
  const response = await fetch(`${tripayApiBaseUrl()}/transaction/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'ibnucreative-public-product-checkout',
    },
    body: encodeTripayForm(checkoutPayload),
  })
  const responseText = await response.text()
  const responseData = parseJson(responseText, {})

  if (!response.ok || responseData.success === false) {
    throw new ApiError(
      response.status || 502,
      responseData.message || responseData.error || 'Checkout Tripay gagal dibuat.',
    )
  }

  const tripayData = responseData.data || responseData
  const paymentMethodDetails = await tripayPaymentMethodDetails(paymentMethod)
  const paymentMethodLabel = paymentMethodDetails?.label || await tripayPaymentMethodLabel(paymentMethod)
  const paymentFee = calculatePaymentMethodFee(paymentMethodDetails, amount)
  const checkoutUrl =
    cleanExternalUrl(tripayData.checkout_url || '') ||
    cleanExternalUrl(tripayData.pay_url || '') ||
    cleanExternalUrl(tripayData.payment_url || '')
  const reference = cleanText(tripayData.reference || '', 180)

  if (!checkoutUrl) {
    throw new ApiError(502, 'Tripay tidak mengembalikan URL checkout.')
  }

  const savedPayload = JSON.stringify({
    order_type: 'digital_product',
    public_checkout: true,
    product_id: product.id,
    product_title: product.title || '',
    product_description: product.description || '',
    delivery_url: product.file_url || '',
    custom_message: product.custom_message_enabled ? product.custom_message || '' : '',
    delivery_note: product.delivery_note || '',
    buyer_phone: buyerPhone,
    accepted_marketing: acceptedMarketing,
    customer_answers: customAnswers,
    payment_method: paymentMethod,
    payment_name: paymentMethodLabel,
    payment_fee: paymentFee,
    total_amount: amount + paymentFee,
    data: tripayData,
    response: responseData,
  })

  await rest('tripay_orders', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: {
      id: makeId('tripay'),
      merchant_ref: merchantRef,
      reference,
      member_id: '',
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      class_id: `product:${product.id}`,
      class_title: product.title || 'Produk digital',
      amount,
      status: 'pending',
      checkout_url: checkoutUrl,
      payload: savedPayload,
    },
  })

  const emailResult = await sendTripayPaymentEmail({
    buyerName,
    buyerEmail,
    classTitle: cleanText(product.title || 'Produk digital', 160),
    itemType: 'digital_product',
    amount,
    paymentFee,
    totalAmount: amount + paymentFee,
    paymentMethod: paymentMethodLabel,
    checkoutUrl,
    expiresAt,
  })

  return {
    ok: true,
    checkoutUrl,
    merchantRef,
    reference,
    paymentMethod,
    expiresAt,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? '' : emailResult.message || '',
    message: 'Checkout produk digital berhasil dibuat.',
  }
}

export async function fetchPublicDigitalProductAccess(request) {
  const url = new URL(request.url || '/', 'http://localhost')
  const orderCode = cleanText(
    url.searchParams.get('order') || url.searchParams.get('ref') || url.searchParams.get('merchant_ref') || '',
    180,
  )

  if (!orderCode) {
    throw new ApiError(400, 'Kode akses produk tidak ditemukan.')
  }

  const orderRows = await rest(
    `tripay_orders?select=*&or=(merchant_ref.eq.${eq(orderCode)},reference.eq.${eq(orderCode)})&limit=1`,
  ).catch(() => [])
  const order = orderRows?.[0]

  if (order) {
    const payload = parseJson(order.payload, {})
    const isDigitalProductOrder = cleanText(payload.order_type || '', 60) === 'digital_product'

    if (!isDigitalProductOrder) {
      throw new ApiError(404, 'Order ini bukan produk digital.')
    }

    const status = tripayOrderStatus(order)
    const isPaid = order.access_granted === true || ['processed', 'paid', 'success', 'settlement'].includes(status)
    const productId = cleanText(payload.product_id || '', 120)
    const productRows = productId
      ? await rest(`digital_products?select=*&id=eq.${eq(productId)}&limit=1`).catch(() => [])
      : []
    const product = productRows?.[0]

    return {
      ok: true,
      paid: isPaid,
      status,
      checkoutUrl: cleanExternalUrl(order.checkout_url || ''),
      orderCode: cleanText(order.reference || order.merchant_ref || order.id, 180),
      buyerName: cleanText(order.buyer_name || '', 160),
      product: product
        ? mapDigitalProduct(product)
        : {
            id: productId,
            title: cleanText(payload.product_title || order.class_title || 'Produk digital', 160),
            description: cleanRichHtml(payload.product_description || ''),
            thumbnail: '',
            fileUrl: cleanExternalUrl(payload.delivery_url || ''),
            fileName: '',
            deliveryNote: cleanText(payload.delivery_note || '', 800),
            customMessage: cleanText(payload.custom_message || '', 800),
          },
      delivery: isPaid
        ? {
            downloadUrl: cleanExternalUrl(product?.file_url || payload.delivery_url || ''),
            deliveryNote: cleanText(product?.delivery_note || payload.delivery_note || '', 800),
            customMessage: cleanText(
              product?.custom_message_enabled ? product.custom_message : payload.custom_message || '',
              800,
            ),
          }
        : null,
      message: isPaid
        ? 'Pembayaran berhasil. Produk digital sudah bisa diakses.'
        : 'Pembayaran belum terkonfirmasi. Jika sudah bayar, tunggu callback Tripay beberapa saat lalu cek ulang.',
    }
  }

  const accessRows = await rest(
    `digital_product_access?select=*&order_id=eq.${eq(orderCode)}&status=eq.active&limit=1`,
  ).catch(() => [])
  const access = accessRows?.[0]

  if (!access) {
    throw new ApiError(404, 'Akses produk belum ditemukan.')
  }

  const productRows = await rest(
    `digital_products?select=*&id=eq.${eq(access.product_id)}&limit=1`,
  ).catch(() => [])
  const product = productRows?.[0]

  return {
    ok: true,
    paid: true,
    status: 'processed',
    checkoutUrl: '',
    orderCode,
    buyerName: cleanText(access.buyer_name || '', 160),
    product: product ? mapDigitalProduct(product) : {
      id: cleanText(access.product_id || '', 120),
      title: cleanText(access.product_title || 'Produk digital', 160),
      description: '',
      thumbnail: '',
      fileUrl: cleanExternalUrl(access.download_url || ''),
      fileName: '',
    },
    delivery: {
      downloadUrl: cleanExternalUrl(product?.file_url || access.download_url || ''),
      deliveryNote: cleanText(product?.delivery_note || '', 800),
      customMessage: cleanText(product?.custom_message_enabled ? product.custom_message : '', 800),
    },
    message: 'Produk digital sudah bisa diakses.',
  }
}

export async function processTripayWebhook(request) {
  const privateKey = cleanText(process.env.TRIPAY_PRIVATE_KEY || '', 300)
  const rawBody = await readRawBody(request)
  const payload = parseJson(rawBody, null)

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(400, 'Payload webhook Tripay tidak valid.')
  }

  if (!privateKey) {
    throw new ApiError(500, 'Private key Tripay belum diisi di environment.')
  }

  if (!validTripaySignature(request, rawBody, privateKey)) {
    throw new ApiError(401, 'Signature webhook Tripay tidak valid.')
  }

  const event = cleanText(request.headers['x-callback-event'] || '', 80).toLowerCase()
  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload
  const merchantRef = firstValue(data, ['merchant_ref', 'merchantRef'])
  const reference = firstValue(data, ['reference'])
  const status = cleanText(firstValue(data, ['status']) || 'callback', 40).toLowerCase()

  if (event && event !== 'payment_status') {
    return {
      ok: true,
      ignored: true,
      message: 'Event Tripay diterima tetapi bukan payment_status.',
    }
  }

  if (!merchantRef && !reference) {
    throw new ApiError(422, 'Merchant reference Tripay tidak ditemukan.')
  }

  let orderRows = merchantRef
    ? await rest(`tripay_orders?select=*&merchant_ref=eq.${eq(merchantRef)}&limit=1`)
    : []

  if (!orderRows?.[0] && reference) {
    orderRows = await rest(`tripay_orders?select=*&reference=eq.${eq(reference)}&limit=1`)
  }

  const order = orderRows?.[0]

  if (!order) {
    return {
      ok: true,
      ignored: true,
      message: 'Order Tripay tidak ditemukan di website.',
      merchantRef,
      reference,
    }
  }

  const existingOrderPayload = parseOrderPayload(order.payload)

  if (!isTripayPaid(data)) {
    await rest(`tripay_orders?id=eq.${eq(order.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: {
        reference: reference || order.reference || '',
        status,
        payload: JSON.stringify({
          ...existingOrderPayload,
          callback: payload,
          raw_callback: rawBody,
        }),
      },
    })

    return {
      ok: true,
      ignored: true,
      status,
      message: 'Webhook Tripay diterima, tetapi pembayaran belum sukses.',
    }
  }

  const paidAmount = cleanNumber(
    firstValue(data, ['amount', 'total_amount', 'data.amount', 'data.total_amount']),
    0,
    1000000000,
  )

  if (paidAmount && paidAmount < Number(order.amount || 0)) {
    throw new ApiError(422, 'Nominal pembayaran Tripay lebih kecil dari harga order.')
  }

  if (order.status === 'processed' || order.status === 'paid') {
    return {
      ok: true,
      duplicate: true,
      message: 'Order Tripay sudah pernah diproses.',
    }
  }

  const orderPayload = existingOrderPayload
  const isDigitalProductOrder = cleanText(orderPayload.order_type || '', 60) === 'digital_product'

  if (isDigitalProductOrder) {
    const productId = cleanText(orderPayload.product_id || '', 120)
    const accessResult = await grantDigitalProductAccess({
      productId,
      memberId: order.member_id,
      buyerEmail: order.buyer_email,
      buyerName: order.buyer_name,
      source: 'tripay',
      orderId: reference || order.reference || order.merchant_ref || order.id,
    })

    await rest(`tripay_orders?id=eq.${eq(order.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: {
        reference: reference || order.reference || '',
        status: 'processed',
        access_granted: accessResult.granted,
        payload: JSON.stringify({
          ...orderPayload,
          callback: payload,
          raw_callback: rawBody,
        }),
      },
    })
    const accessUrl = orderPayload.public_checkout === true
      ? publicProductAccessUrl(request, order.merchant_ref || reference || order.reference)
      : ''
    const deliveryEmailResult = await sendDigitalProductDeliveryEmail({
      buyerName: cleanText(order.buyer_name || 'Member', 160),
      buyerEmail: cleanEmail(order.buyer_email || ''),
      productTitle: cleanText(accessResult.product.title || order.class_title || 'Produk digital', 160),
      productDescription: cleanText(accessResult.product.description || orderPayload.product_description || '', 800),
      downloadUrl: cleanExternalUrl(accessUrl || accessResult.product.file_url || orderPayload.delivery_url || ''),
      customMessage: cleanText(accessResult.product.custom_message_enabled ? accessResult.product.custom_message : orderPayload.custom_message || '', 800),
      deliveryNote: cleanText(accessResult.product.delivery_note || orderPayload.delivery_note || '', 800),
    })

    return {
      ok: true,
      message: accessResult.granted
        ? 'Pembayaran Tripay sukses dan produk digital sudah aktif.'
        : 'Pembayaran Tripay sukses. Member sudah memiliki produk digital.',
      merchantRef: order.merchant_ref,
      reference: reference || order.reference || '',
      productId,
      memberId: order.member_id,
      accessGranted: accessResult.granted,
      emailSent: deliveryEmailResult.sent,
      emailMessageId: deliveryEmailResult.id || '',
      emailError: deliveryEmailResult.sent ? '' : deliveryEmailResult.message || '',
    }
  }

  const accessResult = await grantMemberClassAccess(order.member_id, order.class_id)

  await rest(`tripay_orders?id=eq.${eq(order.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: {
      reference: reference || order.reference || '',
      status: 'processed',
      access_granted: accessResult.granted,
      payload: JSON.stringify({
        ...existingOrderPayload,
        callback: payload,
        raw_callback: rawBody,
      }),
    },
  })
  const successEmailResult = await sendTripayPaymentSuccessEmail({
    buyerName: cleanText(order.buyer_name || 'Member', 160),
    buyerEmail: cleanEmail(order.buyer_email || ''),
    classTitle: cleanText(order.class_title || 'Kelas IbnuCreative', 160),
    classUrl: absoluteRequestUrl(request, '/member?menu=my-courses') || loginUrlFromRequest(request),
  })

  return {
    ok: true,
    message: accessResult.granted
      ? 'Pembayaran Tripay sukses dan akses kelas sudah aktif.'
      : 'Pembayaran Tripay sukses. Member sudah memiliki akses kelas.',
    merchantRef: order.merchant_ref,
    reference: reference || order.reference || '',
    classId: order.class_id,
    memberId: order.member_id,
    accessGranted: accessResult.granted,
    emailSent: successEmailResult.sent,
    emailMessageId: successEmailResult.id || '',
    emailError: successEmailResult.sent ? '' : successEmailResult.message || '',
  }
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
  const buyerPhone = firstPhone(payload)
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

  const [classIds, productIds] = await Promise.all([
    findLynkClasses(productCandidates),
    findLynkDigitalProducts(productCandidates),
  ])

  if (!classIds.length && !productIds.length) {
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
      message: 'Produk Lynk.id tidak dipetakan ke kelas atau produk digital website, jadi tidak dibuatkan akun member.',
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

    await restAccountWrite(`accounts?id=eq.${eq(existingMember.id)}&role=eq.member`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: {
        name: buyerName || existingMember.name,
        phone: buyerPhone || existingMember.phone || '',
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

    await restAccountWrite('accounts', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: {
        id: member.id,
        role: 'member',
        name: buyerName,
        username: member.username,
        email: buyerEmail,
        phone: buyerPhone,
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

  const productAccessResults = []

  for (const digitalProductId of productIds) {
    productAccessResults.push(await grantDigitalProductAccess({
      productId: digitalProductId,
      memberId: member.id,
      buyerEmail,
      buyerName,
      source: 'lynk',
      orderId,
    }))
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
  const productEmailResults = []

  for (const accessResult of productAccessResults) {
    productEmailResults.push(await sendDigitalProductDeliveryEmail({
      buyerName,
      buyerEmail,
      productTitle: accessResult.product.title,
      downloadUrl: cleanExternalUrl(accessResult.product.file_url || ''),
      deliveryNote: cleanText(accessResult.product.delivery_note || '', 800),
    }))
  }
  const fulfillmentMessage = buildCredentialsMessage(account)

  return {
    ok: true,
    message: productIds.length && !classIds.length
      ? 'Produk digital berhasil diberikan dari pembayaran Lynk.id.'
      : 'Akun member berhasil dibuat atau diperbarui dari pembayaran Lynk.id.',
    emailSent: emailResult.sent,
    emailMessageId: emailResult.id || '',
    emailError: emailResult.sent ? '' : emailResult.message || '',
    productEmailSent: productEmailResults.some((result) => result.sent),
    productIds,
    fulfillmentMessage,
    account,
  }
}
