export async function requestStorageUpload({
  endpoint,
  file,
  type,
  sessionToken = '',
}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
    },
    body: JSON.stringify({
      type,
      name: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    }),
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.message || 'Upload tidak bisa disiapkan.')
  }

  if (!data.signedUrl) {
    throw new Error('Signed upload URL tidak tersedia.')
  }

  return data
}

export function buildSignedUploadBody(file) {
  const formData = new FormData()

  formData.append('cacheControl', '3600')
  formData.append('', file)

  return formData
}

export async function uploadToSignedUrl(signedUrl, file) {
  const response = await fetch(signedUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false',
    },
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.message || data.error || 'File tidak bisa diupload ke storage.')
  }
}

function isPhpUploadEndpoint(endpoint = '') {
  return /\/api\/upload-file(?:\.php)?(?:$|[?#])/i.test(String(endpoint))
}

function isCompressibleImage(file) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file?.type)
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality)
  })
}

async function readImageSize(file) {
  const imageUrl = URL.createObjectURL(file)
  const image = new Image()

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = imageUrl
    })

    return {
      image,
      imageUrl,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    }
  } catch {
    URL.revokeObjectURL(imageUrl)
    return null
  }
}

async function compressImageForHosting(file) {
  if (!isCompressibleImage(file) || file.size <= 900 * 1024) {
    return file
  }

  const loaded = await readImageSize(file)

  if (!loaded) {
    return file
  }

  const { image, imageUrl, width, height } = loaded
  const targetBytes = 1800 * 1024
  const attempts = [
    { maxDimension: 2600, quality: 0.88 },
    { maxDimension: 2200, quality: 0.82 },
    { maxDimension: 1800, quality: 0.76 },
  ]
  const outputType = 'image/webp'
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
  let bestFile = file

  try {
    for (const attempt of attempts) {
      const scale = Math.min(1, attempt.maxDimension / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))

      const context = canvas.getContext('2d', { alpha: true })

      if (!context) {
        continue
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      const blob = await canvasToBlob(canvas, outputType, attempt.quality)

      if (!blob || blob.size >= bestFile.size) {
        continue
      }

      bestFile = new File([blob], `${baseName}.webp`, { type: outputType })

      if (blob.size <= targetBytes) {
        break
      }
    }
  } finally {
    URL.revokeObjectURL(imageUrl)
  }

  return bestFile
}

async function uploadDirectToPhp({ endpoint, file, type, sessionToken = '' }) {
  const uploadFile = await compressImageForHosting(file)
  const formData = new FormData()
  formData.append('type', type)
  formData.append('file', uploadFile)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
    },
    body: formData,
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.message || 'File tidak bisa diupload.')
  }

  return data
}

export async function uploadStorageFile({
  endpoint,
  file,
  type,
  sessionToken = '',
}) {
  if (!file || file.size <= 0) {
    throw new Error('Pilih file yang ingin diupload.')
  }

  if (isPhpUploadEndpoint(endpoint)) {
    return uploadDirectToPhp({ endpoint, file, type, sessionToken })
  }

  let upload

  try {
    upload = await requestStorageUpload({ endpoint, file, type, sessionToken })
  } catch (error) {
    return uploadDirectToPhp({ endpoint, file, type, sessionToken }).catch((directError) => {
      throw new Error(directError.message || error.message || 'File tidak bisa diupload.')
    })
  }

  await uploadToSignedUrl(upload.signedUrl, file)

  return upload
}
