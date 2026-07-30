import { useEffect, useState } from 'react'
import Icon from './Icon'

function PasswordField({ label, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false)

  return (
    <label>
      {label}
      <span className="password-security-input">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} />
        </button>
      </span>
    </label>
  )
}

function PasswordSecurityModal({
  email,
  onClose,
  onChangePassword,
  onRequestReset,
  onNotify = () => {},
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRequestingReset, setIsRequestingReset] = useState(false)
  const [resetRemaining, setResetRemaining] = useState(0)
  const passwordStrength = Math.min(100, Math.round((newPassword.length / 12) * 100))

  useEffect(() => {
    if (resetRemaining <= 0) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setResetRemaining((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [resetRemaining])

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (newPassword.length < 8) {
      onNotify('Password baru minimal 8 karakter.')
      return
    }

    if (newPassword !== confirmPassword) {
      onNotify('Konfirmasi password baru belum sama.')
      return
    }

    try {
      setIsSubmitting(true)
      await onChangePassword({ currentPassword, newPassword, confirmPassword })
      onClose()
    } catch (error) {
      onNotify(error.message || 'Password belum bisa diganti.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRequestReset = async () => {
    try {
      setIsRequestingReset(true)
      const data = await onRequestReset(email)
      setResetRemaining(Number(data.retryAfter) || 0)
      onNotify(data.message)
    } catch (error) {
      onNotify(error.message || 'Link reset belum bisa dikirim.')
    } finally {
      setIsRequestingReset(false)
    }
  }

  return (
    <div className="modal-backdrop password-security-backdrop" role="presentation">
      <form className="password-security-modal" onSubmit={handleSubmit}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Keamanan akun</p>
            <h2>Ganti password</h2>
          </div>
          <button type="button" aria-label="Tutup keamanan akun" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="password-security-intro">
          <span><Icon name="shield" /></span>
          <div>
            <strong>Lindungi akun belajarmu</strong>
            <p>Password baru minimal 8 karakter. Sesi pada perangkat lain akan dikeluarkan.</p>
          </div>
        </div>

        <PasswordField
          label="Password saat ini"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
        />
        <PasswordField
          label="Password baru"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
        />
        <div className="password-strength" aria-label={`Kekuatan password ${passwordStrength}%`}>
          <span style={{ width: `${passwordStrength}%` }} />
        </div>
        <PasswordField
          label="Ulangi password baru"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
        />

        <button className="btn btn-primary full" type="submit" disabled={isSubmitting}>
          <Icon name="lock" />
          {isSubmitting ? 'Menyimpan...' : 'Ganti Password'}
        </button>

        <div className="password-reset-alternative">
          <strong>Tidak mengetahui password saat ini?</strong>
          <p>Kami hanya mengirim satu link. Link baru tidak akan dikirim selama link sebelumnya masih aktif.</p>
          {resetRemaining > 0 && (
            <div className="password-reset-active">
              Link aktif sekitar {Math.ceil(resetRemaining / 60)} menit lagi.
            </div>
          )}
          <button
            className="btn btn-secondary full"
            type="button"
            onClick={handleRequestReset}
            disabled={isRequestingReset || resetRemaining > 0 || !email}
          >
            <Icon name="send" />
            {isRequestingReset
              ? 'Mengirim...'
              : resetRemaining > 0
                ? 'Link Reset Sudah Aktif'
                : 'Kirim Link Reset ke Email'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default PasswordSecurityModal
