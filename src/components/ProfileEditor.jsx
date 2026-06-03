import { useState } from 'react'
import Icon from './Icon'
import { uploadStorageFile } from '../lib/storageUpload'

const uploadFileApiPath = '/api/upload-file'

async function compressImageFile(file, { maxSize = 1400, quality = 0.9 } = {}) {
  if (!file.type.startsWith('image/')) {
    return file
  }

  const imageUrl = URL.createObjectURL(file)
  const image = new Image()

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = imageUrl
    })

    const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')

    if (!context) {
      return file
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const outputType = file.type === 'image/png' ? 'image/webp' : file.type
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, outputType, quality),
    )

    if (!blob || blob.size >= file.size) {
      return file
    }

    const extension = outputType === 'image/webp' ? 'webp' : 'jpg'
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'profile'

    return new File([blob], `${baseName}.${extension}`, { type: outputType })
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function ProfileEditor({ session, onClose, onSave, onNotify = () => {} }) {
  const [name, setName] = useState(session.name)
  const [email, setEmail] = useState(session.email || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [avatar, setAvatar] = useState(session.avatar || '')
  const [isUploading, setIsUploading] = useState(false)
  const canEditCredentials = session.role === 'admin'

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      onNotify('Foto profil harus JPG, PNG, atau WebP.')
      event.target.value = ''
      return
    }

    try {
      setIsUploading(true)
      const compressedFile = await compressImageFile(file)
      const data = await uploadStorageFile({
        endpoint: uploadFileApiPath,
        file: compressedFile,
        type: 'profile',
        sessionToken: session.token,
      })

      setAvatar(data.url)
      onNotify('Foto profil berhasil diupload.')
    } catch (error) {
      onNotify(error.message || 'Foto profil tidak bisa diupload.')
    } finally {
      setIsUploading(false)
      event.target.value = ''
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (canEditCredentials) {
      const changesEmail = email.trim().toLowerCase() !== String(session.email || '').toLowerCase()
      const changesPassword = password.length > 0

      if (changesPassword && password.length < 6) {
        onNotify('Password baru minimal 6 karakter.')
        return
      }

      if (changesPassword && password !== passwordConfirm) {
        onNotify('Konfirmasi password baru belum sama.')
        return
      }

      if ((changesEmail || changesPassword) && !currentPassword) {
        onNotify('Isi password saat ini untuk mengubah email atau password.')
        return
      }
    }

    onSave({ name, avatar, email, currentPassword, password })
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="profile-editor" onSubmit={handleSubmit}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Profil akun</p>
            <h2>Edit profil</h2>
          </div>
          <button type="button" aria-label="Tutup edit profil" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="profile-preview">
          <span className="profile-preview-avatar" aria-hidden="true">
            {avatar ? <img src={avatar} alt="" /> : <Icon name="user" />}
          </span>
          <label className="upload-control">
            <Icon name="image" />
            {isUploading ? 'Mengupload...' : 'Upload foto'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              disabled={isUploading}
            />
          </label>
        </div>

        <label>
          Nama tampilan
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nama tampilan"
            required
          />
        </label>

        {canEditCredentials && (
          <div className="profile-security-fields">
            <label>
              Email admin
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@email.com"
                required
              />
            </label>
            <label>
              Password saat ini
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Isi jika ubah email/password"
                autoComplete="current-password"
              />
            </label>
            <label>
              Password baru
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Kosongkan jika tidak diganti"
                autoComplete="new-password"
              />
            </label>
            <label>
              Ulangi password baru
              <input
                type="password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder="Ulangi password baru"
                autoComplete="new-password"
              />
            </label>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Batal
          </button>
          <button className="btn btn-primary" type="submit" disabled={isUploading}>
            Simpan Profil
          </button>
        </div>
      </form>
    </div>
  )
}

export default ProfileEditor
