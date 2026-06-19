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

export async function uploadStorageFile({
  endpoint,
  file,
  type,
  sessionToken = '',
}) {
  const upload = await requestStorageUpload({ endpoint, file, type, sessionToken })

  await uploadToSignedUrl(upload.signedUrl, file)

  return upload
}
