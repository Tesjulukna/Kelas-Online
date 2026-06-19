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

function splitTitle(value, maxLength = 52) {
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
  const cell = 5
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

function buildPdf(objects) {
  let body = '%PDF-1.4\n'
  const offsets = [0]

  objects.forEach((object, index) => {
    offsets[index + 1] = body.length
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefOffset = body.length
  body += `xref\n0 ${objects.length + 1}\n`
  body += '0000000000 65535 f \n'
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
  body += `startxref\n${xrefOffset}\n%%EOF`

  return body
}

export function downloadCertificatePdf({
  certificate,
  siteName = 'Ibnu Creative',
  verificationUrl = '',
}) {
  const width = 841.89
  const height = 595.28
  const titleLines = splitTitle(certificate.classTitle || 'Kelas Online')
  const issuedDate = formatDate(certificate.issuedAt)
  const completedDate = formatDate(certificate.completedAt)
  const certificateId = certificate.certificateId || certificate.id || ''
  const stream = [
    'q',
    rectCommand({ x: 0, y: 0, width, height, color: '0.97 0.98 1' }),
    rectCommand({ x: 24, y: 24, width: width - 48, height: height - 48, color: '1 1 1' }),
    '0.16 0.27 0.52 RG 3 w 42 42 757.89 511.28 re S',
    '0.85 0.71 0.34 RG 1.4 w 58 58 725.89 479.28 re S',
    rectCommand({ x: 42, y: 506, width: 758, height: 28, color: '0.08 0.13 0.23' }),
    rectCommand({ x: 42, y: 62, width: 758, height: 18, color: '0.85 0.71 0.34' }),
    textCommand({ x: 72, y: 515, size: 12, text: siteName.toUpperCase(), font: 'F2', color: '1 1 1' }),
    textCommand({ x: 72, y: 452, size: 18, text: 'CERTIFICATE OF COMPLETION', font: 'F2', color: '0.85 0.62 0.18' }),
    textCommand({ x: 72, y: 422, size: 11, text: 'Diberikan kepada', font: 'F1', color: '0.38 0.45 0.55' }),
    textCommand({ x: 72, y: 369, size: 36, text: certificate.participantName || certificate.memberName || 'Member', font: 'F2', color: '0.08 0.13 0.23' }),
    textCommand({ x: 72, y: 333, size: 12, text: 'telah menyelesaikan seluruh materi dan persyaratan kelas', font: 'F1', color: '0.38 0.45 0.55' }),
    ...titleLines.map((line, index) =>
      textCommand({ x: 72, y: 294 - index * 28, size: 24, text: line, font: 'F2', color: '0.12 0.20 0.38' }),
    ),
    textCommand({ x: 72, y: 205, size: 12, text: `Tanggal selesai: ${completedDate}`, font: 'F1', color: '0.20 0.28 0.39' }),
    textCommand({ x: 72, y: 181, size: 12, text: `Tanggal terbit: ${issuedDate}`, font: 'F1', color: '0.20 0.28 0.39' }),
    textCommand({ x: 72, y: 128, size: 11, text: 'Mentor', font: 'F1', color: '0.38 0.45 0.55' }),
    '0.08 0.13 0.23 RG 1.2 w 72 114 180 0 l S',
    textCommand({ x: 72, y: 94, size: 14, text: certificate.mentorName || 'Ibnu Creative', font: 'F2', color: '0.08 0.13 0.23' }),
    qrGridCommands(certificateId, 685, 362),
    textCommand({ x: 650, y: 336, size: 10, text: 'Kode Verifikasi', font: 'F2', color: '0.38 0.45 0.55' }),
    textCommand({ x: 610, y: 316, size: 12, text: certificateId, font: 'F2', color: '0.08 0.13 0.23' }),
    textCommand({ x: 588, y: 292, size: 8, text: verificationUrl || `Verifikasi: ${certificateId}`, font: 'F1', color: '0.38 0.45 0.55' }),
    textCommand({ x: 72, y: 70, size: 8, text: 'Sertifikat ini dibuat otomatis dan dapat diverifikasi menggunakan kode unik di halaman verifikasi.', font: 'F1', color: '0.38 0.45 0.55' }),
    'Q',
  ].join('\n')
  const streamLength = new TextEncoder().encode(stream).length
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`,
  ]
  const pdf = buildPdf(objects)
  const blob = new Blob([pdf], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${cleanFileName(certificate.classTitle)}-${cleanFileName(certificate.participantName)}.pdf`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
