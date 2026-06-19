import {
  createCertificateData,
  downloadCertificateTemplatePdf,
} from './certificateTemplate'

function escapePdfText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r?\n/g, ' ')
}

function cleanFileName(value) {
  return String(value ?? 'sertifikat')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'sertifikat'
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

function splitTitle(value, maxLength = 42) {
  const words = String(value || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''

  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word

    if (nextLine.length > maxLength && line) {
      lines.push(line)
      line = word
      return
    }

    line = nextLine
  })

  if (line) {
    lines.push(line)
  }

  return lines.slice(0, 2)
}

function hashBits(value) {
  let hash = 2166136261

  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return Math.abs(hash >>> 0).toString(2).padStart(32, '0').repeat(8)
}

function textCommand({ x, y, size, text, font = 'F1', color = '0.10 0.15 0.25' }) {
  return `${color} rg BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`
}

function rectCommand({ x, y, width, height, color }) {
  return `${color} rg ${x} ${y} ${width} ${height} re f`
}

function qrGridCommands(id, x, y) {
  const bits = hashBits(id)
  const size = 7
  const cell = 7 // Increased from 5 to 7 for better scanability and look
  const commands = [
    rectCommand({ x, y, width: size * cell, height: size * cell, color: '1 1 1' }),
  ]

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const isFinder =
        (row < 2 && col < 2) ||
        (row < 2 && col > 4) ||
        (row > 4 && col < 2)
      const bitIndex = row * size + col

      if (isFinder || bits[bitIndex] === '1') {
        commands.push(rectCommand({
          x: x + col * cell,
          y: y + (size - row - 1) * cell,
          width: cell - 1,
          height: cell - 1,
          color: '0.08 0.13 0.23',
        }))
      }
    }
  }

  return commands.join('\n')
}

// Estimates Helvetica text width in points
function estimateTextWidth(text, size) {
  const chars = String(text ?? '')
  let width = 0
  for (const char of chars) {
    if (char >= 'A' && char <= 'Z') {
      width += size * 0.62
    } else if (char >= 'a' && char <= 'z') {
      width += size * 0.46
    } else if (char === ' ' || char === '-') {
      width += size * 0.28
    } else if (['I', 'i', 'l', 't', 'j', 'f', 'r', '1', '.'].includes(char)) {
      width += size * 0.25
    } else if (['w', 'm', 'M', 'W'].includes(char)) {
      width += size * 0.78
    } else {
      width += size * 0.50
    }
  }
  return width
}

// Center align text horizontally relative to pageWidth (default 841.89)
function centeredTextCommand({ y, size, text, font = 'F1', color = '0.10 0.15 0.25', pageWidth = 841.89 }) {
  const textWidth = estimateTextWidth(text, size)
  const x = Math.max(40, (pageWidth - textWidth) / 2)
  return textCommand({ x, y, size, text, font, color })
}

// Concat binary string and text elements into a Uint8Array PDF output
function buildPdf(objects) {
  const encoder = new TextEncoder()
  const parts = []
  
  const header = '%PDF-1.4\n'
  parts.push(encoder.encode(header))
  
  let currentOffset = header.length
  const offsets = [0]
  
  objects.forEach((obj, index) => {
    offsets[index + 1] = currentOffset
    
    const prefix = `${index + 1} 0 obj\n`
    const suffix = '\nendobj\n'
    
    const prefixBytes = encoder.encode(prefix)
    const suffixBytes = encoder.encode(suffix)
    
    let objBytes
    if (obj instanceof Uint8Array) {
      objBytes = obj
    } else {
      objBytes = encoder.encode(String(obj))
    }
    
    parts.push(prefixBytes, objBytes, suffixBytes)
    currentOffset += prefixBytes.length + objBytes.length + suffixBytes.length
  })
  
  const xrefOffset = currentOffset
  let xref = `xref\n0 ${objects.length + 1}\n`
  xref += '0000000000 65535 f \n'
  offsets.slice(1).forEach((offset) => {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
  xref += `startxref\n${xrefOffset}\n%%EOF`
  
  parts.push(encoder.encode(xref))
  
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0)
  const result = new Uint8Array(totalLength)
  let pos = 0
  parts.forEach((p) => {
    result.set(p, pos)
    pos += p.length
  })
  
  return result
}

// Fetches an image URL and converts it to a binary JPEG string for PDF XObject embedding
async function fetchImageAsPdfObject(url) {
  if (!url) return null
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('Image load failed'))
      img.src = url
    })

    const canvas = document.createElement('canvas')
    // Scale logo to a max width of 150px and max height of 32px
    const scale = Math.min(1, 150 / img.width, 32 / img.height)
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff' // White background fallback for PNG transparent channels
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    const arrayBuffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return {
      width: canvas.width,
      height: canvas.height,
      data: binary
    }
  } catch (e) {
    console.warn('Failed to embed logo image in PDF, falling back to vector badge:', e)
    return null
  }
}

export async function downloadCertificatePdf({
  certificate,
  siteName = 'Ibnu Creative',
  brandLogo = '',
  verificationUrl = '',
  template = null,
}) {
  if (template) {
    const data = createCertificateData(
      {
        ...certificate,
        verificationUrl,
      },
      { siteName },
    )

    await downloadCertificateTemplatePdf(
      template,
      data,
      `${cleanFileName(certificate.classTitle)}-${cleanFileName(certificate.participantName)}`,
    )
    return
  }

  const width = 841.89
  const height = 595.28
  
  // Format info
  const issuedDate = formatDate(certificate.issuedAt)
  const completedDate = formatDate(certificate.completedAt)
  const certificateId = certificate.certificateId || certificate.id || ''
  const mentorName = certificate.mentorName || 'Ramdialta Ibnu Sajara, S.Pd'

  // Dynamic Name Size
  const participantName = certificate.participantName || certificate.memberName || 'Member'
  let nameFontSize = 36
  if (participantName.length > 20) {
    nameFontSize = Math.max(18, Math.round(36 * (20 / participantName.length)))
  }

  // Dynamic Title Size & wrap lines
  const classTitle = certificate.classTitle || 'Kelas Online'
  const titleLines = splitTitle(classTitle, 42)
  let titleFontSize = 24
  if (classTitle.length > 30) {
    titleFontSize = Math.max(16, Math.round(24 * (30 / Math.max(30, classTitle.length))))
  }
  const titleSpacing = Math.round(titleFontSize * 1.2)

  // Load logo image asynchronosly
  let logoImg = null
  if (brandLogo) {
    logoImg = await fetchImageAsPdfObject(brandLogo)
  }

  // Build content stream
  const contentParts = [
    'q',
    // Background color (very light blue tint)
    rectCommand({ x: 0, y: 0, width, height, color: '0.97 0.98 1' }),
    // Outer white paper sheet card
    rectCommand({ x: 24, y: 24, width: width - 48, height: height - 48, color: '1 1 1' }),
    // Inner primary navy border (3w)
    '0.16 0.27 0.52 RG 3 w 42 42 757.89 511.28 re S',
    // Golden secondary border (1.4w)
    '0.85 0.71 0.34 RG 1.4 w 58 58 725.89 479.28 re S',
  ]

  let textXStart

  // Logo top left placement
  if (logoImg) {
    // Calculate display dimensions keeping aspect ratio
    const destHeight = 24
    const destWidth = (logoImg.width / logoImg.height) * destHeight
    // Image command: q w 0 0 h x y cm /Img1 Do Q
    contentParts.push(`q ${destWidth.toFixed(2)} 0 0 ${destHeight.toFixed(2)} 72 502 cm /Img1 Do Q`)
    textXStart = 72 + destWidth + 10
  } else {
    // Fallback gold diamond badge
    contentParts.push(
      '0.85 0.71 0.34 rg 72 514 m 78 522 l 84 514 l 78 506 l f',
      '0.85 0.71 0.34 rg 75 514 m 78 509 l 81 514 l 78 517 l f'
    )
    textXStart = 94
  }

  // Draw siteName text at top left
  contentParts.push(textCommand({ x: textXStart, y: 508, size: 12, text: siteName.toUpperCase(), font: 'F2', color: '0.08 0.13 0.23' }))
  
  // Draw certificate badge on the top-right
  contentParts.push(textCommand({ x: 588, y: 508, size: 10, text: 'CERTIFICATE OF COMPLETION', font: 'F2', color: '0.85 0.71 0.34' }))

  // Main centered certificate body text
  contentParts.push(
    centeredTextCommand({ y: 436, size: 16, text: 'SERTIFIKAT KELULUSAN', font: 'F2', color: '0.85 0.71 0.34' }),
    centeredTextCommand({ y: 405, size: 11, text: 'Diberikan kepada', font: 'F1', color: '0.38 0.45 0.55' }),
    centeredTextCommand({ y: 350, size: nameFontSize, text: participantName, font: 'F2', color: '0.08 0.13 0.23' }),
    centeredTextCommand({ y: 312, size: 11, text: 'telah menyelesaikan seluruh materi dan persyaratan kelas', font: 'F1', color: '0.38 0.45 0.55' }),
    ...titleLines.map((line, index) =>
      centeredTextCommand({ y: 275 - index * titleSpacing, size: titleFontSize, text: line, font: 'F2', color: '0.12 0.20 0.38' })
    ),
  )

  // Mentor Signature section (left column)
  // Electronic signature (E-Sign) drawing
  contentParts.push(
    'q',
    '0.22 0.74 0.97 RG 1.8 w', // light blue signature ink
    '108 126 m',
    '114 141 124 144 128 131 c',
    '132 122 138 125 142 134 c',
    '146 141 154 127 162 133 c',
    '168 137 174 134 182 130 c',
    '188 127 192 131 186 134 c',
    '180 137 169 135 159 135 c',
    '149 135 129 135 104 135 c',
    'S',
    'Q'
  )

  // Signature line
  contentParts.push('0.08 0.13 0.23 RG 1.2 w 72 114 180 0 l S')
  
  // Mentor texts
  contentParts.push(
    centeredTextCommand({ y: 152, size: 10, text: 'Mentor', font: 'F1', color: '0.38 0.45 0.55', pageWidth: 324 }),
    centeredTextCommand({ y: 94, size: 12, text: mentorName, font: 'F2', color: '0.08 0.13 0.23', pageWidth: 324 })
  )

  // Date completed & terbit (middle column)
  contentParts.push(
    centeredTextCommand({ y: 114, size: 10, text: `Tanggal Selesai: ${completedDate}`, font: 'F1', color: '0.20 0.28 0.39', pageWidth: 841.89 }),
    centeredTextCommand({ y: 94, size: 10, text: `Tanggal Terbit: ${issuedDate}`, font: 'F1', color: '0.20 0.28 0.39', pageWidth: 841.89 })
  )

  // Verification area (right column)
  contentParts.push(
    qrGridCommands(certificateId, 685, 110),
    centeredTextCommand({ y: 96, size: 8, text: `ID: ${certificateId}`, font: 'F2', color: '0.08 0.13 0.23', pageWidth: 1420 }),
    centeredTextCommand({ y: 84, size: 7, text: 'Verifikasi Online', font: 'F1', color: '0.38 0.45 0.55', pageWidth: 1420 })
  )

  // Bottom note
  contentParts.push(
    centeredTextCommand({ y: 68, size: 8, text: 'Sertifikat ini dibuat otomatis dan dapat diverifikasi menggunakan kode unik di halaman verifikasi.', font: 'F1', color: '0.38 0.45 0.55' }),
    'Q'
  )

  const stream = contentParts.join('\n')
  const streamLength = new TextEncoder().encode(stream).length

  // Build final PDF objects array
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> ${logoImg ? '/XObject << /Img1 7 0 R >>' : ''} >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`,
  ]

  // If logoImg exists, append the binary image XObject to objects list
  if (logoImg) {
    const encoder = new TextEncoder()
    const headerStr = `<< /Type /XObject /Subtype /Image /Width ${logoImg.width} /Height ${logoImg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoImg.data.length} >>\nstream\n`
    const footerStr = '\nendstream'
    
    const headerBytes = encoder.encode(headerStr)
    const footerBytes = encoder.encode(footerStr)
    
    // Convert binary string to byte array
    const imgBytes = new Uint8Array(logoImg.data.length)
    for (let i = 0; i < logoImg.data.length; i++) {
      imgBytes[i] = logoImg.data.charCodeAt(i)
    }
    
    const imageObject = new Uint8Array(headerBytes.length + imgBytes.length + footerBytes.length)
    imageObject.set(headerBytes, 0)
    imageObject.set(imgBytes, headerBytes.length)
    imageObject.set(footerBytes, headerBytes.length + imgBytes.length)
    
    objects.push(imageObject)
  }

  const pdfBytes = buildPdf(objects)
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${cleanFileName(certificate.classTitle)}-${cleanFileName(certificate.participantName)}.pdf`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
