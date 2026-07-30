import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import './Login.css'

const resetTokenStorageKey = 'ibnucreative.password-reset-token.v1'

function ResetPasswordPage({ token, onSubmit, onLogin }) {
  const [activeToken] = useState(() => {
    if (token) {
      return token
    }

    try {
      return window.sessionStorage.getItem(resetTokenStorageKey) || ''
    } catch {
      return ''
    }
  })
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    if (activeToken) {
      try {
        window.sessionStorage.setItem(resetTokenStorageKey, activeToken)
      } catch {
        // Token tetap tersedia di state ketika sessionStorage diblokir.
      }
      window.history.replaceState({}, '', '/reset-password')
    }
  }, [activeToken])

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!activeToken) {
      setStatus('Link reset tidak valid atau token tidak tersedia.')
      return
    }

    if (newPassword.length < 8) {
      setStatus('Password baru minimal 8 karakter.')
      return
    }

    if (newPassword !== confirmPassword) {
      setStatus('Konfirmasi password baru belum sama.')
      return
    }

    try {
      setIsSubmitting(true)
      setStatus('')
      const data = await onSubmit({ token: activeToken, newPassword, confirmPassword })
      try {
        window.sessionStorage.removeItem(resetTokenStorageKey)
      } catch {
        // Pembersihan storage bersifat best-effort.
      }
      setStatus(data.message)
      setIsComplete(true)
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      setStatus(error.message || 'Password belum bisa direset.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="modern-auth-container reset-password-page">
      <div className="modern-auth-bg">
        <div className="modern-auth-grid" />
        <div className="bg-blob bg-blob-1" />
        <div className="bg-blob bg-blob-2" />
      </div>
      <div className="reset-password-card">
        <div className="forgot-password-icon"><Icon name={isComplete ? 'checkCircle' : 'shield'} /></div>
        <p className="eyebrow">Keamanan akun member</p>
        <h1>{isComplete ? 'Password berhasil direset' : 'Buat password baru'}</h1>
        <p>
          {isComplete
            ? 'Semua sesi lama telah dikeluarkan. Silakan login kembali menggunakan password baru.'
            : 'Gunakan minimal 8 karakter dan jangan memakai password lama.'}
        </p>

        {!isComplete ? (
          <form onSubmit={handleSubmit}>
            <label>
              Password baru
              <span className="password-security-input">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button type="button" onClick={() => setShowPassword((current) => !current)}>
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} />
                </button>
              </span>
            </label>
            <label>
              Ulangi password baru
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            {status && <div className="forgot-password-status" role="status">{status}</div>}
            <button className="btn btn-primary full" type="submit" disabled={isSubmitting}>
              <Icon name="lock" />
              {isSubmitting ? 'Menyimpan...' : 'Simpan Password Baru'}
            </button>
          </form>
        ) : (
          <>
            {status && <div className="forgot-password-status" role="status">{status}</div>}
            <button className="btn btn-primary full" type="button" onClick={onLogin}>
              <Icon name="logIn" /> Login Sekarang
            </button>
          </>
        )}
      </div>
    </section>
  )
}

export default ResetPasswordPage
