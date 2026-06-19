const version = 5
const size = 17 + version * 4
const dataCodewords = 108
const errorCorrectionCodewords = 26
const maxByteLength = 106
const fallbackOrigin = 'https://ibnucreative.com'

const expTable = new Uint8Array(512)
const logTable = new Uint8Array(256)

let value = 1
for (let index = 0; index < 255; index += 1) {
  expTable[index] = value
  logTable[value] = index
  value <<= 1

  if (value & 0x100) {
    value ^= 0x11d
  }
}

for (let index = 255; index < expTable.length; index += 1) {
  expTable[index] = expTable[index - 255]
}

function byteLength(text) {
  return new TextEncoder().encode(String(text || '')).length
}

export function getCertificateVerificationUrl(data = {}) {
  const explicitUrl = String(data.verificationUrl || '').trim()

  if (explicitUrl) {
    if (/^https?:\/\//i.test(explicitUrl)) {
      return explicitUrl
    }

    if (typeof window !== 'undefined') {
      return new URL(explicitUrl, window.location.origin).href
    }
  }

  const certificateId = String(
    data.ID_SERTIFIKAT || data.certificateId || data.QR_CODE || '',
  ).trim()
  const path = certificateId
    ? `/sertifikat/${encodeURIComponent(certificateId)}`
    : '/sertifikat'

  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`
  }

  return `${fallbackOrigin}${path}`
}

function shortenVerificationUrl(text) {
  if (byteLength(text) <= maxByteLength) {
    return text
  }

  const match = String(text).match(/\/sertifikat\/([^/?#]+)/i)

  if (!match?.[1]) {
    return text
  }

  const certificateId = match[1]
  const productionUrl = `${fallbackOrigin}/sertifikat/${certificateId}`

  return byteLength(productionUrl) <= maxByteLength ? productionUrl : text
}

function multiply(left, right) {
  if (left === 0 || right === 0) {
    return 0
  }

  return expTable[logTable[left] + logTable[right]]
}

function reedSolomonDivisor(degree) {
  const result = new Uint8Array(degree)

  result[degree - 1] = 1

  let root = 1

  for (let index = 0; index < degree; index += 1) {
    for (let item = 0; item < degree; item += 1) {
      result[item] = multiply(result[item], root)

      if (item + 1 < degree) {
        result[item] ^= result[item + 1]
      }
    }

    root = multiply(root, 0x02)
  }

  return result
}

function reedSolomonRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length)

  for (const byte of data) {
    const factor = byte ^ result[0]

    result.copyWithin(0, 1)
    result[result.length - 1] = 0

    for (let index = 0; index < divisor.length; index += 1) {
      result[index] ^= multiply(divisor[index], factor)
    }
  }

  return result
}

function appendBits(target, number, length) {
  for (let index = length - 1; index >= 0; index -= 1) {
    target.push((number >>> index) & 1)
  }
}

function makeDataCodewords(text) {
  const bytes = Array.from(new TextEncoder().encode(text))

  if (bytes.length > maxByteLength) {
    throw new Error('Link verifikasi terlalu panjang untuk QR sertifikat.')
  }

  const bits = []

  appendBits(bits, 0x4, 4)
  appendBits(bits, bytes.length, 8)
  bytes.forEach((byte) => appendBits(bits, byte, 8))

  const capacity = dataCodewords * 8
  const terminatorLength = Math.min(4, capacity - bits.length)

  appendBits(bits, 0, terminatorLength)

  while (bits.length % 8 !== 0) {
    bits.push(0)
  }

  const result = []

  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0

    for (let bit = 0; bit < 8; bit += 1) {
      byte = (byte << 1) | bits[index + bit]
    }

    result.push(byte)
  }

  for (let index = 0; result.length < dataCodewords; index += 1) {
    result.push(index % 2 === 0 ? 0xec : 0x11)
  }

  return result
}

function createMatrix() {
  return Array.from({ length: size }, () => Array(size).fill(false))
}

function createReservedMatrix() {
  return Array.from({ length: size }, () => Array(size).fill(false))
}

function inBounds(x, y) {
  return x >= 0 && x < size && y >= 0 && y < size
}

function setFunctionModule(modules, reserved, x, y, isDark) {
  if (!inBounds(x, y)) {
    return
  }

  modules[y][x] = Boolean(isDark)
  reserved[y][x] = true
}

function drawFinderPattern(modules, reserved, left, top) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const targetX = left + x
      const targetY = top + y

      if (!inBounds(targetX, targetY)) {
        continue
      }

      const isSeparator = x === -1 || x === 7 || y === -1 || y === 7
      const isDark = !isSeparator && (
        x === 0 ||
        x === 6 ||
        y === 0 ||
        y === 6 ||
        (x >= 2 && x <= 4 && y >= 2 && y <= 4)
      )

      setFunctionModule(modules, reserved, targetX, targetY, isDark)
    }
  }
}

function drawAlignmentPattern(modules, reserved, centerX, centerY) {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      setFunctionModule(
        modules,
        reserved,
        centerX + x,
        centerY + y,
        Math.max(Math.abs(x), Math.abs(y)) === 2 || (x === 0 && y === 0),
      )
    }
  }
}

function drawTimingPatterns(modules, reserved) {
  for (let index = 8; index < size - 8; index += 1) {
    const isDark = index % 2 === 0

    setFunctionModule(modules, reserved, index, 6, isDark)
    setFunctionModule(modules, reserved, 6, index, isDark)
  }
}

function getBit(bits, index) {
  return ((bits >>> index) & 1) !== 0
}

function formatBitsForMask(mask) {
  const errorCorrectionLevelBits = 1
  const data = (errorCorrectionLevelBits << 3) | mask
  let remainder = data

  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) ? 0x537 : 0)
  }

  return ((data << 10) | remainder) ^ 0x5412
}

function drawFormatBits(modules, reserved, mask) {
  const bits = formatBitsForMask(mask)

  for (let index = 0; index <= 5; index += 1) {
    setFunctionModule(modules, reserved, 8, index, getBit(bits, index))
  }

  setFunctionModule(modules, reserved, 8, 7, getBit(bits, 6))
  setFunctionModule(modules, reserved, 8, 8, getBit(bits, 7))
  setFunctionModule(modules, reserved, 7, 8, getBit(bits, 8))

  for (let index = 9; index < 15; index += 1) {
    setFunctionModule(modules, reserved, 14 - index, 8, getBit(bits, index))
  }

  for (let index = 0; index < 8; index += 1) {
    setFunctionModule(modules, reserved, size - 1 - index, 8, getBit(bits, index))
  }

  for (let index = 8; index < 15; index += 1) {
    setFunctionModule(modules, reserved, 8, size - 15 + index, getBit(bits, index))
  }

  setFunctionModule(modules, reserved, 8, size - 8, true)
}

function maskBit(mask, x, y) {
  if (mask === 0) return (x + y) % 2 === 0
  if (mask === 1) return y % 2 === 0
  if (mask === 2) return x % 3 === 0
  if (mask === 3) return (x + y) % 3 === 0
  if (mask === 4) return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0
  if (mask === 5) return ((x * y) % 2) + ((x * y) % 3) === 0
  if (mask === 6) return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0

  return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
}

function drawData(modules, reserved, codewords, mask) {
  const bits = []

  codewords.forEach((byte) => appendBits(bits, byte, 8))

  let bitIndex = 0
  let upward = true

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right -= 1
    }

    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical

      for (let column = 0; column < 2; column += 1) {
        const x = right - column

        if (reserved[y][x]) {
          continue
        }

        let isDark = bitIndex < bits.length ? bits[bitIndex] === 1 : false
        bitIndex += 1

        if (maskBit(mask, x, y)) {
          isDark = !isDark
        }

        modules[y][x] = isDark
      }
    }

    upward = !upward
  }
}

function makeCodewords(text) {
  const data = makeDataCodewords(text)
  const divisor = reedSolomonDivisor(errorCorrectionCodewords)
  const errorCorrection = Array.from(reedSolomonRemainder(data, divisor))

  return [...data, ...errorCorrection]
}

export function createQrMatrix(rawValue) {
  const text = shortenVerificationUrl(String(rawValue || '').trim())
  const modules = createMatrix()
  const reserved = createReservedMatrix()
  const mask = 0

  drawFinderPattern(modules, reserved, 0, 0)
  drawFinderPattern(modules, reserved, size - 7, 0)
  drawFinderPattern(modules, reserved, 0, size - 7)
  drawAlignmentPattern(modules, reserved, 30, 30)
  drawTimingPatterns(modules, reserved)
  drawFormatBits(modules, reserved, mask)
  drawData(modules, reserved, makeCodewords(text), mask)
  drawFormatBits(modules, reserved, mask)

  return {
    size,
    value: text,
    modules,
  }
}
