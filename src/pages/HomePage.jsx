import Icon from '../components/Icon'
import { benefits, courseHighlights } from '../data/platformData'
import { cleanWebsiteSettings, defaultWebsiteSettings } from '../data/websiteSettings'

function HomePage({
  isLoggedIn,
  onLogin,
  onExplore,
  classes = [],
  settings = defaultWebsiteSettings,
}) {
  const websiteSettings = cleanWebsiteSettings(settings)
  const heroStyle = websiteSettings.hero.backgroundImage
    ? { backgroundImage: `url(${JSON.stringify(websiteSettings.hero.backgroundImage)})` }
    : undefined
  const publicCourses = classes.length
    ? classes.map((course) => ({
        id: course.id,
        title: course.title,
        level: course.status,
        lessons: course.lessons,
        icon: 'bookOpen',
        thumbnail: course.thumbnail,
        mentor: course.mentor,
        price: course.price || course.revenue || websiteSettings.courses.emptyPrice,
        description: `${course.mentor} membimbing kelas ini dengan materi praktik yang mudah diikuti dari dashboard belajar.`,
      }))
    : courseHighlights.map((course) => ({
        ...course,
        thumbnail: '',
        mentor: websiteSettings.courses.fallbackMentor,
        price: websiteSettings.courses.fallbackPrice,
      }))

  return (
    <>
      <section className="home-hero modern-hero image-hero" id="home" style={heroStyle}>
        <div className="home-hero__overlay modern-hero__overlay image-hero__overlay">
          <div className="home-hero__content modern-hero__content image-hero__content">
            <p className="eyebrow">{websiteSettings.hero.eyebrow}</p>
            <h1 className="hero-title-modern">{websiteSettings.hero.title}</h1>
            <p className="hero-copy">{websiteSettings.hero.description}</p>
            <div className="hero-actions">
              <button className="btn btn-primary" type="button" onClick={onLogin}>
                <Icon name="layoutDashboard" />
                {isLoggedIn
                  ? websiteSettings.hero.dashboardButton
                  : websiteSettings.hero.primaryButton}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => onExplore('courses')}
              >
                <Icon name="play" />
                {websiteSettings.hero.secondaryButton}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-band modern-stats" aria-label="Statistik kelas">
        {websiteSettings.stats.map((stat, index) => (
          <div key={`${stat.label}-${index}`}>
            <Icon name={stat.icon} />
            <strong>{index === 1 && classes.length ? Math.max(classes.length, Number(stat.value) || 0) : stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </section>

      <section className="content-section modern-section" id="courses">
        <div className="section-heading reveal-panel">
          <p className="eyebrow">{websiteSettings.courses.eyebrow}</p>
          <h2>{websiteSettings.courses.title}</h2>
        </div>
        <div className="course-grid">
          {publicCourses.map((course, index) => (
            <article
              className="course-card homepage-course-card animated-card"
              key={course.id || course.title}
            >
              <div className="homepage-course-visual">
                {course.thumbnail ? (
                  <img src={course.thumbnail} alt="" />
                ) : (
                  <Icon name={course.icon || 'bookOpen'} />
                )}
              </div>
              <div className="homepage-course-body">
                <h3>{course.title}</h3>
                <span className="homepage-course-mentor">
                  <Icon name="user" />
                  {course.mentor}
                </span>
                <p>{course.description}</p>
              </div>
              <div className="course-meta">
                <span>{course.level}</span>
                <span>{course.price}</span>
              </div>
              <button
                className="btn btn-primary homepage-course-button"
                type="button"
                onClick={onLogin}
              >
                Daftar
                <Icon name="arrowRight" />
              </button>
              <i style={{ '--card-delay': `${index * 0.12}s` }}></i>
            </article>
          ))}
        </div>
      </section>

      <section className="content-section split-section modern-section" id="benefits">
        <div className="section-heading reveal-panel">
          <p className="eyebrow">{websiteSettings.benefits.eyebrow}</p>
          <h2>{websiteSettings.benefits.title}</h2>
        </div>
        <div className="benefit-list">
          {(websiteSettings.benefits.items.length
            ? websiteSettings.benefits.items
            : benefits
          ).map((benefit) => (
            <article className="benefit-item animated-card" key={benefit.title}>
              <Icon name={benefit.icon} />
              <div>
                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="content-section schedule-section modern-section" id="schedule">
        <div className="schedule-copy reveal-panel">
          <p className="eyebrow">{websiteSettings.schedule.eyebrow}</p>
          <h2>{websiteSettings.schedule.title}</h2>
          <p>{websiteSettings.schedule.description}</p>
        </div>
        <article className="schedule-board animated-card">
          {websiteSettings.schedule.steps.map((step, index) => (
            <div key={`${step.title}-${index}`}>
              <Icon name={step.icon} />
              <span>{step.label}</span>
              <strong>{step.title}</strong>
            </div>
          ))}
          <button className="btn btn-primary" type="button" onClick={onLogin}>
            <Icon name="layoutDashboard" />
            {isLoggedIn
              ? websiteSettings.schedule.dashboardButton
              : websiteSettings.schedule.loginButton}
          </button>
        </article>
      </section>
    </>
  )
}

export default HomePage
