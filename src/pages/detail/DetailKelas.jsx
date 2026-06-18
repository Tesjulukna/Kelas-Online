import { useState } from 'react'
import Icon from '../../components/Icon'
import { benefits } from '../../data/platformData'
import { cleanWebsiteSettings, defaultWebsiteSettings } from '../../data/websiteSettings'

function formatRupiah(value) {
  const amount = Math.max(0, Math.round(Number(value) || 0))

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function DetailKelas({
  course,
  wishlistCount = 0,
  onAddToWishlist,
  onBack,
  onBuy,
  onOpenWishlist,
  onShare,
  settings = defaultWebsiteSettings,
}) {
  const [openAccordion, setOpenAccordion] = useState(null)

  if (!course) {
    return null
  }

  const websiteSettings = cleanWebsiteSettings(settings)

  const originalPrice = course.price 
    ? formatRupiah(Math.round(course.price * 1.6 / 1000) * 1000)
    : null

  const toggleAccordion = (id) => {
    setOpenAccordion((current) => (current === id ? null : id))
  }

  const benefitItems = (websiteSettings.benefits.items && websiteSettings.benefits.items.length
    ? websiteSettings.benefits.items
    : benefits)

  const scheduleSteps = websiteSettings.schedule.steps || []
  const hasRichDescription = /<\/?[a-z][\s\S]*>/i.test(course.description || '')

  return (
    <section className="public-detail-page">
      <div className="public-detail-topbar">
        <button className="icon-action-button" type="button" onClick={onBack} aria-label="Kembali">
          <Icon name="arrowLeft" />
        </button>
        <div className="public-detail-topbar-actions">
          <button className="icon-action-button cart-action-button" type="button" onClick={onOpenWishlist} aria-label="Keranjang">
            <Icon name="cart" />
            {wishlistCount > 0 && <span>{wishlistCount}</span>}
          </button>
          <button
            className="icon-action-button"
            type="button"
            onClick={() => onShare(course.title, course.title)}
            aria-label="Bagikan"
          >
            <Icon name="share" />
          </button>
        </div>
      </div>

      <article className="public-detail-hero">
        <div className="public-detail-image">
          {course.thumbnail ? (
            <img src={course.thumbnail} alt={course.title} />
          ) : (
            <Icon name="bookOpen" />
          )}
          <div className="play-button-overlay" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff" width="24" height="24" style={{ display: 'block' }}>
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
        </div>

        <div className="public-detail-copy">
          <span className="card-badge badge-kelas" style={{ position: 'static', display: 'inline-block', marginBottom: '8px' }}>
            Kelas Premium
          </span>
          <h1>{course.title}</h1>
          {hasRichDescription ? (
            <div
              className="public-rich-description"
              dangerouslySetInnerHTML={{ __html: course.description }}
            />
          ) : (
            <p>{course.description || `${course.mentor} membimbing kelas ini dengan materi praktik yang mudah diikuti dari dashboard belajar.`}</p>
          )}
          
          <div className="public-detail-meta">
            <span>
              <Icon name="user" style={{ marginRight: '4px', width: '12px' }} />
              {course.mentor || 'Mentor Profesional'}
            </span>
            <span>
              <Icon name="bookOpen" style={{ marginRight: '4px', width: '12px' }} />
              {String(course.lessons || '').toLowerCase().includes('materi')
                ? course.lessons
                : `${course.lessons} Materi`}
            </span>
            <span>Akses Selamanya</span>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {originalPrice && (
              <span style={{ fontSize: '0.86rem', color: '#94a3b8', textDecoration: 'line-through' }}>
                {originalPrice}
              </span>
            )}
            <strong style={{ fontSize: '1.8rem', color: '#0f172a', fontWeight: '800' }}>
              {course.price ? formatRupiah(course.price) : 'Gratis'}
            </strong>
          </div>
        </div>
      </article>

      {/* Accordion Section */}
      <div className="detail-accordion-group">

        {/* Benefit Accordion */}
        <div className={`detail-accordion-item ${openAccordion === 'benefit' ? 'open' : ''}`}>
          <button
            className="detail-accordion-trigger"
            type="button"
            onClick={() => toggleAccordion('benefit')}
            aria-expanded={openAccordion === 'benefit'}
          >
            <span className="detail-accordion-trigger-left">
              <span className="detail-accordion-icon-wrap">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </span>
              <span className="detail-accordion-label">
                <strong>{websiteSettings.benefits.title || 'Benefit Kelas'}</strong>
                <small>{benefitItems.length} keuntungan belajar</small>
              </span>
            </span>
            <span className="detail-accordion-chevron">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </button>
          <div className="detail-accordion-body">
            <div className="details-benefit-grid">
              {benefitItems.map((benefit) => (
                <article className="details-benefit-card" key={benefit.title}>
                  <div className="details-benefit-icon-wrapper">
                    <Icon name={benefit.icon} />
                  </div>
                  <div className="details-benefit-content">
                    <h3>{benefit.title}</h3>
                    <p>{benefit.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        {/* Alur Belajar Accordion */}
        <div className={`detail-accordion-item ${openAccordion === 'schedule' ? 'open' : ''}`}>
          <button
            className="detail-accordion-trigger"
            type="button"
            onClick={() => toggleAccordion('schedule')}
            aria-expanded={openAccordion === 'schedule'}
          >
            <span className="detail-accordion-trigger-left">
              <span className="detail-accordion-icon-wrap">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                  <polyline points="9 11 12 14 22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
              </span>
              <span className="detail-accordion-label">
                <strong>{websiteSettings.schedule.title || 'Alur Belajar'}</strong>
                <small>{scheduleSteps.length} tahapan belajar</small>
              </span>
            </span>
            <span className="detail-accordion-chevron">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </button>
          <div className="detail-accordion-body">
            {websiteSettings.schedule.description && (
              <p className="accordion-schedule-desc">{websiteSettings.schedule.description}</p>
            )}
            <div className="details-schedule-timeline">
              {scheduleSteps.map((step, index) => (
                <div className="details-schedule-step" key={`${step.title}-${index}`}>
                  <div className="step-number-badge">{index + 1}</div>
                  <div className="details-schedule-step-icon">
                    <Icon name={step.icon} />
                  </div>
                  <div className="details-schedule-step-content">
                    <span className="step-label">{step.label}</span>
                    <strong>{step.title}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      <div className="public-sticky-actions">
        <button className="btn btn-secondary" type="button" onClick={onAddToWishlist}>
          <Icon name="cart" />
          Keranjang
        </button>
        <button className="btn btn-primary" type="button" onClick={() => onBuy(course.id)}>
          <Icon name="wallet" />
          Beli Sekarang
        </button>
      </div>
    </section>
  )
}

export default DetailKelas
