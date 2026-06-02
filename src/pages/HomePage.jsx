import Icon from '../components/Icon'
import { benefits, courseHighlights } from '../data/platformData'

function HomePage({ isLoggedIn, onLogin, onExplore, classes = [] }) {
  const publicCourses = classes.length
    ? classes.slice(0, 3).map((course) => ({
        title: course.title,
        level: course.status,
        lessons: course.lessons,
        icon: 'bookOpen',
        thumbnail: course.thumbnail,
        mentor: course.mentor,
        price: course.price || course.revenue || 'Harga tersedia di dashboard',
        description: `${course.mentor} membimbing kelas ini dengan materi praktik yang mudah diikuti dari dashboard belajar.`,
      }))
    : courseHighlights.map((course) => ({
        ...course,
        thumbnail: '',
        mentor: 'Ibnu Creative',
        price: 'Mulai dari kelas pilihan',
      }))

  return (
    <>
      <section className="home-hero modern-hero image-hero" id="home">
        <div className="home-hero__overlay modern-hero__overlay image-hero__overlay">
          <div className="home-hero__content modern-hero__content image-hero__content">
            <p className="eyebrow">Platform kelas online kreatif</p>
            <h1 className="hero-title-modern">
              Kelas online untuk menaikkan skillmu.
            </h1>
            <p className="hero-copy">
              Belajar desain, video editing, konten digital, hingga strategi jualan
              online lewat materi yang rapi, tugas praktik, feedback mentor, dan
              dashboard belajar yang nyaman dipakai di semua perangkat.
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary" type="button" onClick={onLogin}>
                <Icon name="layoutDashboard" />
                {isLoggedIn ? 'Buka Dashboard' : 'Mulai Belajar'}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => onExplore('courses')}
              >
                <Icon name="play" />
                Lihat Kelas
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-band modern-stats" aria-label="Statistik kelas">
        <div>
          <Icon name="users" />
          <strong>3.200+</strong>
          <span>member aktif</span>
        </div>
        <div>
          <Icon name="bookOpen" />
          <strong>{Math.max(classes.length, 12)}</strong>
          <span>kelas dan workshop</span>
        </div>
        <div>
          <Icon name="checkCircle" />
          <strong>92%</strong>
          <span>praktik sampai selesai</span>
        </div>
      </section>

      <section className="content-section modern-section" id="courses">
        <div className="section-heading reveal-panel">
          <p className="eyebrow">Pilihan kelas</p>
          <h2>Daftar Kelas</h2>
        </div>
        <div className="course-grid">
          {publicCourses.map((course, index) => (
            <article
              className="course-card homepage-course-card animated-card"
              key={course.title}
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
                <span>{course.lessons}</span>
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
          <p className="eyebrow">Benefit</p>
          <h2>Belajar lebih terarah dengan materi, tugas, dan feedback mentor.</h2>
        </div>
        <div className="benefit-list">
          {benefits.map((benefit) => (
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
          <p className="eyebrow">Alur belajar</p>
          <h2>Pilih kelas, ikuti materi, kirim tugas, lalu dapatkan arahan.</h2>
          <p>
            Semua proses belajar bisa dipantau dari dashboard member. Admin dan
            mentor dapat mengelola materi, tugas, serta balasan bantuan dari
            dashboard yang sama.
          </p>
        </div>
        <article className="schedule-board animated-card">
          <div>
            <Icon name="play" />
            <span>Langkah 01</span>
            <strong>Pilih kelas favorit</strong>
          </div>
          <div>
            <Icon name="fileText" />
            <span>Langkah 02</span>
            <strong>Kerjakan tugas praktik</strong>
          </div>
          <div>
            <Icon name="message" />
            <span>Langkah 03</span>
            <strong>Terima feedback mentor</strong>
          </div>
          <button className="btn btn-primary" type="button" onClick={onLogin}>
            <Icon name="layoutDashboard" />
            {isLoggedIn ? 'Masuk Dashboard' : 'Login Member'}
          </button>
        </article>
      </section>
    </>
  )
}

export default HomePage
