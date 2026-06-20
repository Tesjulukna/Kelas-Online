import { createQrMatrix, getCertificateVerificationUrl } from './qrCode'

export const certificateSizePresets = {
  a4Landscape: {
    label: 'A4 Landscape',
    width: 1123,
    height: 794,
  },
  a4Portrait: {
    label: 'A4 Portrait',
    width: 794,
    height: 1123,
  },
}

export const certificatePlaceholders = [
  '{{NAMA_PESERTA}}',
  '{{NAMA_KELAS}}',
  '{{TANGGAL_SELESAI}}',
  '{{ID_SERTIFIKAT}}',
  '{{NAMA_MENTOR}}',
  '{{NAMA_WEBSITE}}',
  '{{NILAI}}',
  '{{QR_CODE}}',
]

const certificatePdfRenderScale = 4
const certificatePdfImageQuality = 0.98

function makeElementId(prefix = 'element') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value)

  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function formatDate(value) {
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

export function createCertificateData(certificate = {}, settings = {}) {
  const siteName = settings.siteName || settings.siteTitle || 'Ibnu Creative'

  return {
    NAMA_PESERTA: certificate.participantName || certificate.memberName || 'Nama Peserta',
    NAMA_KELAS: certificate.classTitle || 'Nama Kelas',
    TANGGAL_SELESAI: formatDate(certificate.completedAt),
    TANGGAL_TERBIT: formatDate(certificate.issuedAt),
    ID_SERTIFIKAT: certificate.certificateId || 'IBNU-0000',
    NAMA_MENTOR: certificate.mentorName || 'Ibnu Creative',
    NAMA_WEBSITE: siteName,
    NILAI: certificate.score || 'Lulus',
    QR_CODE: certificate.certificateId || 'IBNU-0000',
    verificationUrl: getCertificateVerificationUrl({
      ...certificate,
      ID_SERTIFIKAT: certificate.certificateId || 'IBNU-0000',
    }),
  }
}

export function replaceCertificatePlaceholders(value, data = {}) {
  return String(value ?? '').replace(/\{\{([A-Z_]+)\}\}/g, (match, key) =>
    data[key] ?? match,
  )
}

export function createTextElement(overrides = {}) {
  return {
    id: makeElementId('text'),
    type: 'text',
    x: 160,
    y: 180,
    width: 800,
    height: 90,
    rotation: 0,
    opacity: 1,
    zIndex: 10,
    locked: false,
    hidden: false,
    content: 'Teks baru',
    fontFamily: 'Georgia',
    fontSize: 34,
    minFontSize: 20,
    maxFontSize: 56,
    fontWeight: 'normal',
    fontStyle: 'normal',
    underline: false,
    color: '#111827',
    align: 'center',
    letterSpacing: 0,
    lineHeight: 1.2,
    shadow: false,
    gradient: false,
    gradientFrom: '#2563eb',
    gradientTo: '#d97706',
    autoResize: false,
    nameField: false,
    ...overrides,
  }
}

export function createImageElement(overrides = {}) {
  return {
    id: makeElementId('image'),
    type: 'image',
    x: 80,
    y: 80,
    width: 180,
    height: 110,
    rotation: 0,
    opacity: 1,
    zIndex: 20,
    locked: false,
    hidden: false,
    src: '',
    alt: 'Gambar sertifikat',
    objectFit: 'contain',
    ...overrides,
  }
}

export function createShapeElement(shape = 'rectangle', overrides = {}) {
  return {
    id: makeElementId('shape'),
    type: 'shape',
    shape,
    x: 120,
    y: 120,
    width: shape === 'line' ? 360 : 220,
    height: shape === 'line' ? 4 : 120,
    rotation: 0,
    opacity: 1,
    zIndex: 5,
    locked: false,
    hidden: false,
    fill: shape === 'line' ? '#d4af37' : '#f8fafc',
    stroke: '#d4af37',
    strokeWidth: shape === 'line' ? 0 : 2,
    borderRadius: shape === 'rectangle' ? 16 : 999,
    ...overrides,
  }
}

export function createQrElement(overrides = {}) {
  return {
    id: makeElementId('qr'),
    type: 'qr',
    x: 910,
    y: 585,
    width: 120,
    height: 150,
    rotation: 0,
    opacity: 1,
    zIndex: 30,
    locked: false,
    hidden: false,
    color: '#111827',
    background: '#ffffff',
    ...overrides,
  }
}

export function createDefaultCertificateTemplate(classId = '', classTitle = 'Kelas Online') {
  const size = certificateSizePresets.a4Landscape

  return {
    id: '',
    classId,
    name: `Template ${classTitle}`,
    sizeType: 'a4Landscape',
    width: size.width,
    height: size.height,
    backgroundColor: '#f8fafc',
    backgroundImage: '',
    snapToGrid: true,
    gridSize: 10,
    elements: [
      createShapeElement('rectangle', {
        id: 'cert-bg-card',
        x: 46,
        y: 46,
        width: size.width - 92,
        height: size.height - 92,
        fill: '#ffffff',
        stroke: '#d4af37',
        strokeWidth: 4,
        borderRadius: 24,
        zIndex: 1,
      }),
      createShapeElement('rectangle', {
        id: 'cert-top-band',
        x: 46,
        y: 46,
        width: size.width - 92,
        height: 82,
        fill: '#0f172a',
        stroke: '#0f172a',
        strokeWidth: 0,
        borderRadius: 24,
        zIndex: 2,
      }),
      createTextElement({
        id: 'cert-site-name',
        x: 88,
        y: 72,
        width: 420,
        height: 36,
        content: '{{NAMA_WEBSITE}}',
        fontFamily: 'Inter',
        fontSize: 21,
        fontWeight: 'bold',
        color: '#ffffff',
        align: 'left',
        zIndex: 10,
      }),
      createTextElement({
        id: 'cert-title',
        x: 222,
        y: 180,
        width: 680,
        height: 52,
        content: 'SERTIFIKAT KELULUSAN',
        fontFamily: 'Inter',
        fontSize: 32,
        fontWeight: 'bold',
        color: '#b45309',
        align: 'center',
        letterSpacing: 1.4,
        zIndex: 10,
      }),
      createTextElement({
        id: 'cert-label',
        x: 280,
        y: 260,
        width: 560,
        height: 34,
        content: 'Diberikan kepada',
        fontFamily: 'Inter',
        fontSize: 22,
        color: '#64748b',
        align: 'center',
        zIndex: 10,
      }),
      createTextElement({
        id: 'cert-participant',
        x: 170,
        y: 310,
        width: 780,
        height: 96,
        content: '{{NAMA_PESERTA}}',
        fontFamily: 'Georgia',
        fontSize: 58,
        minFontSize: 30,
        maxFontSize: 62,
        fontWeight: 'bold',
        color: '#0f172a',
        align: 'center',
        autoResize: true,
        nameField: true,
        zIndex: 10,
      }),
      createTextElement({
        id: 'cert-course-label',
        x: 250,
        y: 430,
        width: 620,
        height: 40,
        content: 'atas keberhasilannya menyelesaikan kelas',
        fontFamily: 'Inter',
        fontSize: 20,
        color: '#64748b',
        align: 'center',
        zIndex: 10,
      }),
      createTextElement({
        id: 'cert-course-name',
        x: 165,
        y: 480,
        width: 790,
        height: 86,
        content: '{{NAMA_KELAS}}',
        fontFamily: 'Inter',
        fontSize: 34,
        fontWeight: 'bold',
        color: '#1e3a8a',
        align: 'center',
        lineHeight: 1.2,
        zIndex: 10,
      }),
      createTextElement({
        id: 'cert-date',
        x: 94,
        y: 640,
        width: 360,
        height: 34,
        content: 'Tanggal selesai: {{TANGGAL_SELESAI}}',
        fontFamily: 'Inter',
        fontSize: 17,
        color: '#334155',
        align: 'left',
        zIndex: 10,
      }),
      createTextElement({
        id: 'cert-mentor',
        x: 390,
        y: 675,
        width: 350,
        height: 42,
        content: '{{NAMA_MENTOR}}',
        fontFamily: 'Inter',
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111827',
        align: 'center',
        zIndex: 10,
      }),
      createShapeElement('line', {
        id: 'cert-sign-line',
        x: 430,
        y: 662,
        width: 270,
        height: 3,
        fill: '#0f172a',
        zIndex: 8,
      }),
      createQrElement({
        id: 'cert-qr',
        x: 915,
        y: 605,
        width: 120,
        height: 120,
        zIndex: 20,
      }),
      createTextElement({
        id: 'cert-id',
        x: 838,
        y: 730,
        width: 270,
        height: 24,
        content: '{{ID_SERTIFIKAT}}',
        fontFamily: 'Inter',
        fontSize: 13,
        fontWeight: 'bold',
        color: '#334155',
        align: 'center',
        zIndex: 10,
      }),
    ],
  }
}

export function normalizeCertificateTemplate(template = {}, fallbackClass = {}) {
  const defaultTemplate = createDefaultCertificateTemplate(
    template.classId || fallbackClass.id || '',
    fallbackClass.title || 'Kelas Online',
  )
  const sizePreset = certificateSizePresets[template.sizeType] || null
  const width = template.sizeType === 'custom'
    ? clampNumber(template.width, 320, 2400, defaultTemplate.width)
    : sizePreset?.width || clampNumber(template.width, 320, 2400, defaultTemplate.width)
  const height = template.sizeType === 'custom'
    ? clampNumber(template.height, 320, 2400, defaultTemplate.height)
    : sizePreset?.height || clampNumber(template.height, 320, 2400, defaultTemplate.height)
  const elements = Array.isArray(template.elements) && template.elements.length
    ? template.elements
    : defaultTemplate.elements

  return {
    ...defaultTemplate,
    ...template,
    id: template.id || '',
    classId: template.classId || fallbackClass.id || defaultTemplate.classId,
    name: template.name || defaultTemplate.name,
    sizeType: template.sizeType || 'a4Landscape',
    width,
    height,
    backgroundColor: template.backgroundColor || defaultTemplate.backgroundColor,
    backgroundImage: template.backgroundImage || '',
    snapToGrid: template.snapToGrid !== false,
    gridSize: clampNumber(template.gridSize, 4, 80, 10),
    elements: elements.map((element, index) => ({
      ...(element.type === 'text'
        ? createTextElement()
        : element.type === 'image'
          ? createImageElement()
          : element.type === 'qr'
            ? createQrElement()
            : createShapeElement(element.shape || 'rectangle')),
      ...element,
      id: element.id || makeElementId(element.type || 'element'),
      zIndex: Number.isFinite(Number(element.zIndex)) ? Number(element.zIndex) : index + 1,
      hidden: element.hidden === true,
      locked: element.locked === true,
    })),
  }
}

function wrapText(context, text, maxWidth, letterSpacing = 0) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''

  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word
    const width = context.measureText(nextLine).width + Math.max(0, nextLine.length - 1) * letterSpacing

    if (width > maxWidth && line) {
      lines.push(line)
      line = word
      return
    }

    line = nextLine
  })

  if (line) {
    lines.push(line)
  }

  return lines.length ? lines : ['']
}

function drawLetterSpacedText(context, text, x, y, letterSpacing = 0) {
  if (!letterSpacing) {
    context.fillText(text, x, y)
    return
  }

  let nextX = x

  for (const character of String(text || '')) {
    context.fillText(character, nextX, y)
    nextX += context.measureText(character).width + letterSpacing
  }
}

function drawQr(context, element, data) {
  const qr = createQrMatrix(getCertificateVerificationUrl(data))
  const codeText = String(data.ID_SERTIFIKAT || data.QR_CODE || '').trim()
  const quietZone = 4
  const cells = qr.size + quietZone * 2
  const captionHeight = codeText
    ? Math.min(30, Math.max(17, element.height * 0.18))
    : 0
  const qrAreaHeight = Math.max(36, element.height - captionHeight)
  const boxSize = Math.min(element.width, qrAreaHeight)
  const cellSize = boxSize / cells
  const offsetX = (element.width - boxSize) / 2
  const offsetY = (qrAreaHeight - boxSize) / 2

  context.fillStyle = element.background || '#ffffff'
  context.fillRect(0, 0, element.width, element.height)
  context.fillStyle = element.color || '#111827'

  qr.modules.forEach((line, row) => {
    line.forEach((isDark, col) => {
      if (isDark) {
        context.fillRect(
          offsetX + (col + quietZone) * cellSize,
          offsetY + (row + quietZone) * cellSize,
          Math.ceil(cellSize),
          Math.ceil(cellSize),
        )
      }
    })
  })

  if (codeText) {
    let fontSize = Math.min(14, Math.max(8, captionHeight * 0.44))

    context.fillStyle = element.color || '#111827'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = `700 ${fontSize}px Arial`

    while (fontSize > 7 && context.measureText(codeText).width > element.width - 8) {
      fontSize -= 1
      context.font = `700 ${fontSize}px Arial`
    }

    context.fillText(codeText, element.width / 2, qrAreaHeight + captionHeight / 2)
  }
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2)

  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

async function loadImage(src) {
  if (!src) {
    return null
  }

  const image = new Image()
  image.crossOrigin = 'anonymous'

  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
    image.src = src
  })

  return image
}

function drawImageFit(context, image, width, height, objectFit = 'contain') {
  const imageRatio = image.width / image.height
  const boxRatio = width / height
  let drawWidth
  let drawHeight
  let drawX
  let drawY

  if (objectFit === 'cover' ? imageRatio > boxRatio : imageRatio < boxRatio) {
    drawHeight = objectFit === 'cover' ? height : width / imageRatio
    drawWidth = objectFit === 'cover' ? height * imageRatio : width
  } else {
    drawWidth = objectFit === 'cover' ? width : height * imageRatio
    drawHeight = objectFit === 'cover' ? width / imageRatio : height
  }

  drawX = (width - drawWidth) / 2
  drawY = (height - drawHeight) / 2

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
}

function prepareElementContext(context, element) {
  context.save()
  context.globalAlpha = clampNumber(element.opacity, 0, 1, 1)
  context.translate(element.x + element.width / 2, element.y + element.height / 2)
  context.rotate((Number(element.rotation) || 0) * Math.PI / 180)
  context.translate(-element.width / 2, -element.height / 2)
}

function restoreElementContext(context) {
  context.restore()
}

function drawTextElement(context, element, data) {
  const content = replaceCertificatePlaceholders(element.content, data)
  let fontSize = clampNumber(element.fontSize, 6, 220, 24)
  const minFontSize = clampNumber(element.minFontSize, 6, fontSize, 14)
  const maxFontSize = clampNumber(element.maxFontSize, fontSize, 240, fontSize)
  const fontWeight = element.fontWeight === 'bold' ? '700' : '400'
  const fontStyle = element.fontStyle === 'italic' ? 'italic' : 'normal'
  const fontFamily = element.fontFamily || 'Arial'
  const lineHeight = clampNumber(element.lineHeight, 0.8, 3, 1.2)
  const letterSpacing = clampNumber(element.letterSpacing, -4, 24, 0)

  if (element.autoResize) {
    fontSize = Math.min(fontSize, maxFontSize)
    while (fontSize > minFontSize) {
      context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
      const lines = wrapText(context, content, element.width, letterSpacing)
      const totalHeight = lines.length * fontSize * lineHeight
      const maxLineWidth = Math.max(
        ...lines.map((line) => context.measureText(line).width + Math.max(0, line.length - 1) * letterSpacing),
      )

      if (maxLineWidth <= element.width && totalHeight <= element.height) {
        break
      }

      fontSize -= 1
    }
  }

  context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
  context.textBaseline = 'top'
  context.textAlign = 'left'
  context.fillStyle = element.color || '#111827'

  if (element.gradient) {
    const gradient = context.createLinearGradient(0, 0, element.width, 0)
    gradient.addColorStop(0, element.gradientFrom || '#2563eb')
    gradient.addColorStop(1, element.gradientTo || '#d97706')
    context.fillStyle = gradient
  }

  if (element.shadow) {
    context.shadowColor = 'rgba(15, 23, 42, 0.28)'
    context.shadowBlur = 8
    context.shadowOffsetX = 0
    context.shadowOffsetY = 4
  }

  const lines = wrapText(context, content, element.width, letterSpacing)
  const lineGap = fontSize * lineHeight

  lines.forEach((line, index) => {
    const textWidth = context.measureText(line).width + Math.max(0, line.length - 1) * letterSpacing
    const x = element.align === 'right'
      ? element.width - textWidth
      : element.align === 'center'
        ? (element.width - textWidth) / 2
        : 0
    const y = index * lineGap

    drawLetterSpacedText(context, line, x, y, letterSpacing)

    if (element.underline) {
      context.save()
      context.shadowColor = 'transparent'
      context.strokeStyle = element.gradient ? element.gradientTo || '#d97706' : element.color || '#111827'
      context.lineWidth = Math.max(1, fontSize * 0.06)
      context.beginPath()
      context.moveTo(x, y + fontSize + 3)
      context.lineTo(x + textWidth, y + fontSize + 3)
      context.stroke()
      context.restore()
    }
  })
}

function drawShapeElement(context, element) {
  context.fillStyle = element.fill || 'transparent'
  context.strokeStyle = element.stroke || 'transparent'
  context.lineWidth = clampNumber(element.strokeWidth, 0, 60, 0)

  if (element.shape === 'circle') {
    context.beginPath()
    context.ellipse(element.width / 2, element.height / 2, element.width / 2, element.height / 2, 0, 0, Math.PI * 2)
    context.closePath()
  } else if (element.shape === 'line') {
    context.fillRect(0, Math.max(0, element.height / 2 - 1), element.width, Math.max(1, element.height))
    return
  } else {
    drawRoundedRect(context, 0, 0, element.width, element.height, Number(element.borderRadius) || 0)
  }

  if (element.fill && element.fill !== 'transparent') {
    context.fill()
  }

  if (context.lineWidth > 0 && element.stroke && element.stroke !== 'transparent') {
    context.stroke()
  }
}

export async function renderCertificateTemplateToCanvas(template, data = {}, scale = 1) {
  const safeTemplate = normalizeCertificateTemplate(template)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(safeTemplate.width * scale))
  canvas.height = Math.max(1, Math.round(safeTemplate.height * scale))
  const context = canvas.getContext('2d')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.scale(scale, scale)
  context.fillStyle = safeTemplate.backgroundColor || '#ffffff'
  context.fillRect(0, 0, safeTemplate.width, safeTemplate.height)

  if (safeTemplate.backgroundImage) {
    try {
      const image = await loadImage(safeTemplate.backgroundImage)
      drawImageFit(context, image, safeTemplate.width, safeTemplate.height, 'cover')
    } catch {
      // A missing background should not block certificate generation.
    }
  }

  const elements = [...safeTemplate.elements]
    .filter((element) => !element.hidden)
    .sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0))

  for (const element of elements) {
    prepareElementContext(context, element)

    if (element.type === 'text') {
      drawTextElement(context, element, data)
    } else if (element.type === 'shape') {
      drawShapeElement(context, element)
    } else if (element.type === 'qr') {
      drawQr(context, element, data)
    } else if (element.type === 'image' && element.src) {
      try {
        const image = await loadImage(element.src)
        drawImageFit(context, image, element.width, element.height, element.objectFit)
      } catch {
        context.fillStyle = '#f1f5f9'
        context.fillRect(0, 0, element.width, element.height)
      }
    }

    restoreElementContext(context)
  }

  return canvas
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function downloadCertificateTemplateImage(template, data, format = 'png', fileName = 'sertifikat') {
  const canvas = await renderCertificateTemplateToCanvas(template, data, 2)
  const mimeType = format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : 'image/png'
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png'
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, 0.94))

  if (blob) {
    downloadBlob(blob, `${fileName}.${extension}`)
  }
}

function base64ToBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function buildImagePdf(imageBytes, imageWidth, imageHeight, pageWidth, pageHeight) {
  const encoder = new TextEncoder()
  const parts = []
  const offsets = [0]
  let offset = 0

  const push = (part) => {
    const bytes = part instanceof Uint8Array ? part : encoder.encode(String(part))
    parts.push(bytes)
    offset += bytes.length
  }

  push('%PDF-1.4\n')
  const addObject = (object) => {
    offsets.push(offset)
    push(`${offsets.length - 1} 0 obj\n`)
    push(object)
    push('\nendobj\n')
  }

  const stream = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Img1 Do Q`

  addObject('<< /Type /Catalog /Pages 2 0 R >>')
  addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Img1 5 0 R >> >> /Contents 4 0 R >>`)
  addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)

  offsets.push(offset)
  push('5 0 obj\n')
  push(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`)
  push(imageBytes)
  push('\nendstream\nendobj\n')

  const xrefOffset = offset
  push(`xref\n0 ${offsets.length}\n`)
  push('0000000000 65535 f \n')
  offsets.slice(1).forEach((item) => {
    push(`${String(item).padStart(10, '0')} 00000 n \n`)
  })
  push(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)

  const totalLength = parts.reduce((sum, bytes) => sum + bytes.length, 0)
  const result = new Uint8Array(totalLength)
  let cursor = 0

  parts.forEach((bytes) => {
    result.set(bytes, cursor)
    cursor += bytes.length
  })

  return result
}

export async function downloadCertificateTemplatePdf(template, data, fileName = 'sertifikat') {
  const safeTemplate = normalizeCertificateTemplate(template)
  const canvas = await renderCertificateTemplateToCanvas(safeTemplate, data, certificatePdfRenderScale)
  const dataUrl = canvas.toDataURL('image/jpeg', certificatePdfImageQuality)
  const imageBytes = base64ToBytes(dataUrl)
  const isLandscape = safeTemplate.width >= safeTemplate.height
  const pageWidth = isLandscape ? 841.89 : 595.28
  const pageHeight = isLandscape ? 595.28 : 841.89
  const pdfBytes = buildImagePdf(imageBytes, canvas.width, canvas.height, pageWidth, pageHeight)
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })

  downloadBlob(blob, `${fileName}.pdf`)
}
