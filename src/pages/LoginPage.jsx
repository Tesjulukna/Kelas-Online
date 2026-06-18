import { useState, useRef } from 'react'
import Icon from '../components/Icon'
import { cleanWebsiteSettings, defaultWebsiteSettings } from '../data/websiteSettings'
import './Login.css'

function LoginPage({
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  onSubmit,
  onGoogleLogin,
  isGoogleLoading = false,
}) {
  const [showPassword, setShowPassword] = useState(false)
  const cardRef = useRef(null)
  
  const [settings] = useState(() => {
    try {
      const cached = window.sessionStorage.getItem('ibnucreative.website-settings.v1')
      return cached ? cleanWebsiteSettings(JSON.parse(cached)) : defaultWebsiteSettings
    } catch {
      return defaultWebsiteSettings
    }
  })

  const handleMouseMove = (e) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(hover: hover)').matches) return

    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const xc = rect.width / 2
    const yc = rect.height / 2
    
    const rx = -((y - yc) / yc) * 12
    const ry = ((x - xc) / xc) * 12
    
    card.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg)`
    card.style.setProperty('--mx', `${(x / rect.width) * 100}%`)
    card.style.setProperty('--my', `${(y / rect.height) * 100}%`)
  }
  
  const handleMouseLeave = () => {
    const card = cardRef.current
    if (!card) return
    card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)'
    card.style.setProperty('--mx', '50%')
    card.style.setProperty('--my', '50%')
  }

  return (
    <section className="modern-auth-container">
      {/* Background Animated Elements */}
      <div className="modern-auth-bg">
        <div className="modern-auth-grid" />
        <div className="bg-blob bg-blob-1" />
        <div className="bg-blob bg-blob-2" />
        <div className="bg-blob bg-blob-3" />
      </div>

      <div className="login-layout-wrap">
        {/* Left Panel: Desktop Showcase */}
        <div className="login-showcase">
          <div className="showcase-brand">
            <span className="showcase-logo">
              {settings.brandLogo ? (
                <img src={settings.brandLogo} alt={settings.siteName} />
              ) : (
                <Icon name={settings.brandIcon || 'spark'} />
              )}
            </span>
            <span className="showcase-name">{settings.siteName}</span>
          </div>
          <h1>Tingkatkan Skill Kreatif Tanpa Batas</h1>
          <p>
            Bergabunglah bersama ribuan member lainnya untuk belajar desain, video, copywriting, dan strategi bisnis digital secara praktis dengan mentor berpengalaman.
          </p>
          
          {/* Decorative 3D Showcase Elements */}
          <div className="visual-3d-scene">
            <div className="floating-3d-card card-design">
              <div className="card-icon-wrap">
                <Icon name="spark" />
              </div>
              <h3>Creative Design</h3>
              <span>12 Modul Praktik</span>
            </div>
            <div className="floating-3d-card card-video">
              <div className="card-icon-wrap">
                <Icon name="video" />
              </div>
              <h3>Videography</h3>
              <span>8 Modul Praktik</span>
            </div>
            <div className="floating-3d-card card-code">
              <div className="card-icon-wrap">
                <Icon name="bookOpen" />
              </div>
              <h3>Digital Strategy</h3>
              <span>15 Modul Praktik</span>
            </div>
          </div>
        </div>

        {/* Right Panel: Form Card Container */}
        <div className="login-card-container">
          <div 
            className="modern-login-card"
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Card sheen reflection light */}
            <div className="card-sheen" />

            {/* Brand display on mobile screen sizes (instead of left panel) */}
            <div className="mobile-brand-header">
              <span className="mobile-brand-logo">
                {settings.brandLogo ? (
                  <img src={settings.brandLogo} alt={settings.siteName} />
                ) : (
                  <Icon name={settings.brandIcon || 'spark'} />
                )}
              </span>
              <span className="mobile-brand-name">{settings.siteName}</span>
            </div>

            <div className="form-heading">
              <div className="icon-wrapper">
                <Icon name="logIn" />
              </div>
              <div>
                <h2>Masuk Akun</h2>
                <p>Gunakan username/email & password</p>
              </div>
            </div>

            <form onSubmit={onSubmit} autoComplete="on">
              <div className="input-group">
                <input
                  type="text"
                  name="username"
                  value={username}
                  onChange={(event) => onUsernameChange(event.target.value)}
                  placeholder=" "
                  autoComplete="username"
                  required
                />
                <label className="floating-label">Username atau email</label>
                <div className="input-icon-wrapper">
                  <Icon name="user" />
                </div>
              </div>

              <div className="input-group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  placeholder=" "
                  autoComplete="current-password"
                  required
                />
                <label className="floating-label">Password</label>
                <div className="input-icon-wrapper">
                  <Icon name="lock" />
                </div>
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} />
                </button>
              </div>

              <button className="btn btn-primary full" type="submit">
                <Icon name="arrowRight" />
                Masuk Dashboard
              </button>

              <div className="google-login-block">
                <p>Login atau daftar menggunakan akun Google</p>
                <button
                  className="google-login-button"
                  type="button"
                  onClick={onGoogleLogin}
                  disabled={isGoogleLoading}
                >
                  {isGoogleLoading ? (
                    <div className="button-spinner" />
                  ) : (
                    <>
                      <svg className="google-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      {isGoogleLoading ? 'Menghubungkan...' : 'Login dengan Google'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}

export default LoginPage
