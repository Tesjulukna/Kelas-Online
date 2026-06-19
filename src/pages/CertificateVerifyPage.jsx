import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { cleanWebsiteSettings, defaultWebsiteSettings } from '../data/websiteSettings'

function formatDate(value) {
  const time = Date.parse(value || '')

  if (!time) {
    return '-'
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(time))
}

function CertificateCodeMark({ value }) {
  const seed = String(value || 'CERTIFICATE')
  let hash = 0

  for (const character of seed) {
    hash = (hash * 33 + character.charCodeAt(0)) >>> 0
  }

  return (
    <span className="verify-qr" aria-hidden="true">
      {Array.from({ length: 64 }).map((_, index) => {
        const row = Math.floor(index / 8)
        const col = index % 8
        const finder =
          (row < 2 && col < 2) ||
          (row < 2 && col > 5) ||
          (row > 5 && col < 2)
        const active = finder || ((hash >> (index % 24)) & 1) === 1

        return <i className={active ? 'active' : ''} key={index}></i>
      })}
    </span>
  )
}

function CertificateVerifyPage({
  certificateId,
  apiPath = '/api/certificates',
  settings = defaultWebsiteSettings,
}) {
  const safeSettings = cleanWebsiteSettings(settings)
  const [state, setState] = useState({
    loading: true,
    valid: false,
    certificate: null,
    message: '',
  })

  useEffect(() => {
    let isCurrent = true

    fetch(`${apiPath}?verify=${encodeURIComponent(certificateId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.message || 'Sertifikat belum bisa diverifikasi.')
        }

        if (isCurrent) {
          setState({
            loading: false,
            valid: data.valid === true,
            certificate: data.certificate || null,
            message: data.message || '',
          })
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setState({
            loading: false,
            valid: false,
            certificate: null,
            message: error.message || 'Sertifikat belum bisa diverifikasi.',
          })
        }
      })

    return () => {
      isCurrent = false
    }
  }, [apiPath, certificateId])

  const certificate = state.certificate

  return (
    <section className="certificate-verify-page">
      <div className="certificate-verify-shell">
        <div className="certificate-verify-hero">
          <p className="eyebrow">Verifikasi Sertifikat</p>
          <h1>{safeSettings.siteName}</h1>
          <p>
            Masukkan atau buka kode sertifikat untuk memastikan data kelulusan tercatat
            resmi di database website.
          </p>
        </div>

        <article className={state.valid ? 'verify-card valid' : 'verify-card'}>
          {state.loading ? (
            <>
              <Icon name="clock" />
              <h2>Memeriksa sertifikat...</h2>
              <p>Mohon tunggu sebentar.</p>
            </>
          ) : state.valid && certificate ? (
            <>
              <div className="verify-status">
                <span><Icon name="shield" /></span>
                <div>
                  <small>Status</small>
                  <strong>Sertifikat valid</strong>
                </div>
              </div>
              <CertificateCodeMark value={certificate.certificateId} />
              <div className="verify-details">
                <span>
                  <small>ID Sertifikat</small>
                  <strong>{certificate.certificateId}</strong>
                </span>
                <span>
                  <small>Nama Peserta</small>
                  <strong>{certificate.participantName}</strong>
                </span>
                <span>
                  <small>Kelas</small>
                  <strong>{certificate.classTitle}</strong>
                </span>
                <span>
                  <small>Mentor</small>
                  <strong>{certificate.mentorName}</strong>
                </span>
                <span>
                  <small>Tanggal Selesai</small>
                  <strong>{formatDate(certificate.completedAt)}</strong>
                </span>
                <span>
                  <small>Tanggal Terbit</small>
                  <strong>{formatDate(certificate.issuedAt)}</strong>
                </span>
              </div>
            </>
          ) : (
            <>
              <Icon name="x" />
              <h2>Sertifikat tidak valid</h2>
              <p>{state.message || 'Kode sertifikat tidak ditemukan di database.'}</p>
              <strong>{certificateId}</strong>
            </>
          )}
        </article>
      </div>
    </section>
  )
}

export default CertificateVerifyPage
