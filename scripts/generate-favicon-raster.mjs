import { deflateSync } from 'node:zlib'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const rootDir = resolve(import.meta.dirname, '..')

function crc32(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) {
    value ^= byte
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
  }
  return (value ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type)
  const header = Buffer.alloc(4)
  header.writeUInt32BE(data.length, 0)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0)
  return Buffer.concat([header, typeBytes, data, checksum])
}

function makeIcon(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size)
  const radius = size * 0.22
  const scale = size / 48

  for (let y = 0; y < size; y += 1) {
    pixels[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x += 1) {
      const offset = y * (size * 4 + 1) + 1 + x * 4
      const dx = Math.max(radius - x, 0, x - (size - radius - 1))
      const dy = Math.max(radius - y, 0, y - (size - radius - 1))
      const inside = dx * dx + dy * dy <= radius * radius
      const glow = Math.max(0, 1 - Math.hypot(x - size * 0.78, y - size * 0.26) / (size * 0.65))
      pixels[offset] = Math.round(126 + glow * 25)
      pixels[offset + 1] = Math.round(20 + glow * 90)
      pixels[offset + 2] = 255
      pixels[offset + 3] = inside ? 255 : 0

      const px = x / scale
      const py = y / scale
      const mark = (px > 20 && px < 28 && py > 8 && py < 38)
        || (px > 13 && px < 35 && py > 8 && py < 15)
        || (px > 13 && px < 35 && py > 32 && py < 39)
      if (mark && inside) {
        pixels[offset] = 255
        pixels[offset + 1] = 255
        pixels[offset + 2] = 255
      }
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const favicon = makeIcon(32)
const appleTouchIcon = makeIcon(180)
const icoHeader = Buffer.from([0, 0, 1, 0, 1, 0, 32, 32, 0, 0, 1, 0, 32, 0, favicon.length, 0, 0, 0, 22, 0, 0, 0])

await Promise.all([
  writeFile(resolve(rootDir, 'public/favicon-32.png'), favicon),
  writeFile(resolve(rootDir, 'public/apple-touch-icon.png'), appleTouchIcon),
  writeFile(resolve(rootDir, 'public/favicon.ico'), Buffer.concat([icoHeader, favicon])),
])
