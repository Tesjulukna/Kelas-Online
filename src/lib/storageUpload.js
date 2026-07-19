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

function parseUploadResponse(xhr) {
  try {
    return xhr.responseText ? JSON.parse(xhr.responseText) : {}
  } catch {
    return {}
  }
}

function uploadWithProgress({
  url,
  method,
  body,
  headers = {},
  onProgress = () => {},
  errorMessage,
}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.open(method, url)

    Object.entries(headers).forEach(([name, value]) => {
      if (value) {
        xhr.setRequestHeader(name, value)
      }
    })

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return
      }

      onProgress(Math.round((event.loaded / event.total) * 100))
    }

    xhr.onload = () => {
      const data = parseUploadResponse(xhr)

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(data.message || data.error || errorMessage))
        return
      }

      onProgress(100)
      resolve(data)
    }

    xhr.onerror = () => reject(new Error(errorMessage))
    xhr.onabort = () => reject(new Error('Upload dibatalkan.'))
    xhr.send(body)
  })
}

export async function uploadToSignedUrl(signedUrl, file, onProgress = () => {}) {
  await uploadWithProgress({
    url: signedUrl,
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false',
    },
    onProgress,
    errorMessage: 'File tidak bisa diupload ke storage.',
  })
}

function emitUploadProgress(onProgress, percent, stage) {
  if (typeof onProgress !== 'function') {
    return
  }

  onProgress({
    percent: Math.min(100, Math.max(0, Math.round(Number(percent) || 0))),
    stage,
  })
}

function isPhpUploadEndpoint(endpoint = '') {
  return /\/api\/upload-file(?:\.php)?(?:$|[?#])/i.test(String(endpoint))
}

function isCompressibleImage(file) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file?.type)
}

function getImageCompressionPlan(type) {
  if (type === 'profile') {
    return {
      targetBytes: 700 * 1024,
      attempts: [
        { maxDimension: 1200, quality: 0.86 },
        { maxDimension: 1000, quality: 0.78 },
        { maxDimension: 800, quality: 0.7 },
        { maxDimension: 640, quality: 0.62 },
        { maxDimension: 480, quality: 0.54 },
      ],
    }
  }

  if (type === 'task') {
    return {
      targetBytes: 1800 * 1024,
      attempts: [
        { maxDimension: 2400, quality: 0.88 },
        { maxDimension: 2000, quality: 0.82 },
        { maxDimension: 1600, quality: 0.76 },
        { maxDimension: 1280, quality: 0.7 },
        { maxDimension: 1024, quality: 0.64 },
        { maxDimension: 800, quality: 0.56 },
      ],
    }
  }

  return {
    targetBytes: 1800 * 1024,
    attempts: [
      { maxDimension: 2600, quality: 0.88 },
      { maxDimension: 2200, quality: 0.82 },
      { maxDimension: 1800, quality: 0.76 },
    ],
  }
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

async function compressImageForUpload(file, type, onProgress) {
  if (!isCompressibleImage(file)) {
    return file
  }

  const mustOptimize = type === 'profile' || type === 'task'

  if (!mustOptimize && file.size <= 900 * 1024) {
    return file
  }

  emitUploadProgress(onProgress, 5, 'Membaca gambar...')

  const loaded = await readImageSize(file)

  if (!loaded) {
    throw new Error('Gambar tidak dapat dibaca atau dikompres oleh browser.')
  }

  const { image, imageUrl, width, height } = loaded
  const { targetBytes, attempts } = getImageCompressionPlan(type)
  const outputType = 'image/webp'
  const fallbackName = type === 'profile' ? 'profile' : type === 'task' ? 'task-image' : 'image'
  const baseName = file.name.replace(/\.[^.]+$/, '') || fallbackName
  let bestFile = null

  try {
    for (const [attemptIndex, attempt] of attempts.entries()) {
      emitUploadProgress(
        onProgress,
        8 + Math.round(((attemptIndex + 1) / attempts.length) * 25),
        'Mengompres gambar...',
      )
      const scale = Math.min(1, attempt.maxDimension / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))

      const context = canvas.getContext('2d', { alpha: true })

      if (!context) {
        continue
      }

      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      const blob = await canvasToBlob(canvas, outputType, attempt.quality)

      if (!blob || (bestFile && blob.size >= bestFile.size)) {
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

  if (!bestFile) {
    throw new Error('Gambar tidak berhasil dikompres. Coba pilih ulang file gambar yang valid.')
  }

  emitUploadProgress(onProgress, 35, 'Kompresi selesai.')

  return bestFile.size < file.size ? bestFile : file
}

async function uploadDirectToPhp({
  endpoint,
  file,
  type,
  sessionToken = '',
  onProgress = () => {},
}) {
  const formData = new FormData()
  formData.append('type', type)
  formData.append('file', file)

  return uploadWithProgress({
    url: endpoint,
    method: 'POST',
    body: formData,
    headers: {
      ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
    },
    onProgress,
    errorMessage: 'File tidak bisa diupload.',
  })
}

export async function uploadStorageFile({
  endpoint,
  file,
  type,
  sessionToken = '',
  onProgress = () => {},
}) {
  if (!file || file.size <= 0) {
    throw new Error('Pilih file yang ingin diupload.')
  }

  emitUploadProgress(onProgress, 0, 'Menyiapkan gambar...')
  const uploadFile = await compressImageForUpload(file, type, onProgress)
  emitUploadProgress(onProgress, 38, 'Menyiapkan upload...')
  const handleTransferProgress = (percent) => {
    emitUploadProgress(onProgress, 40 + (percent * 0.58), 'Mengupload gambar...')
  }

  if (isPhpUploadEndpoint(endpoint)) {
    const data = await uploadDirectToPhp({
      endpoint,
      file: uploadFile,
      type,
      sessionToken,
      onProgress: handleTransferProgress,
    })
    emitUploadProgress(onProgress, 100, 'Upload selesai.')
    return data
  }

  let upload

  try {
    upload = await requestStorageUpload({ endpoint, file: uploadFile, type, sessionToken })
  } catch (error) {
    try {
      const data = await uploadDirectToPhp({
        endpoint,
        file: uploadFile,
        type,
        sessionToken,
        onProgress: handleTransferProgress,
      })
      emitUploadProgress(onProgress, 100, 'Upload selesai.')
      return data
    } catch (directError) {
      throw new Error(
        directError.message || error.message || 'File tidak bisa diupload.',
        { cause: directError },
      )
    }
  }

  emitUploadProgress(onProgress, 42, 'Mengupload gambar...')
  await uploadToSignedUrl(upload.signedUrl, uploadFile, handleTransferProgress)
  emitUploadProgress(onProgress, 100, 'Upload selesai.')

  return upload
}
