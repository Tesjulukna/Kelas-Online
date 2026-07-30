import { useEffect, useState } from 'react'
import Icon from './Icon'

function formatCountdown(seconds) {
  const safeSeconds = Math.max(0, seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60

  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function ForgotPasswordModal({ initialEmail = '', onClose, onRequestReset }) {
  const [email, setEmail] = useState(initialEmail)
  const [status, setStatus] = useState('')
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (remainingSeconds <= 0) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [remainingSeconds])

  const handleSubmit = async (event) => {
    event.preventDefault()

    try {
      setIsSubmitting(true)
      setStatus('')
      const data = await onRequestReset(email)
      setStatus(data.message)
      setRemainingSeconds(Number(data.retryAfter) || 0)
    } catch (error) {
      setStatus(error.message || 'Link reset belum bisa dikirim.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop forgot-password-backdrop" role="presentation">
      <form className="forgot-password-modal" onSubmit={handleSubmit}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Pemulihan akun</p>
            <h2>Lupa password?</h2>
          </div>
          <button type="button" aria-label="Tutup lupa password" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        <div className="forgot-password-icon"><Icon name="lock" /></div>
        <p>Masukkan email member. Kami akan mengirim link aman yang berlaku selama 30 menit.</p>
        <label>
          Email member
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nama@email.com"
            autoComplete="email"
            required
          />
        </label>

        {status && <div className="forgot-password-status" role="status">{status}</div>}
        {remainingSeconds > 0 && (
          <div className="forgot-password-countdown">
            <small>Link masih aktif</small>
            <strong>{formatCountdown(remainingSeconds)}</strong>
            <span>Email baru tidak akan dikirim selama waktu ini.</span>
          </div>
        )}

        <button
          className="btn btn-primary full"
          type="submit"
          disabled={isSubmitting || remainingSeconds > 0}
        >
          <Icon name="send" />
          {isSubmitting ? 'Memproses...' : remainingSeconds > 0 ? 'Link Sudah Dikirim' : 'Kirim Link Reset'}
        </button>
      </form>
    </div>
  )
}

export default ForgotPasswordModal
