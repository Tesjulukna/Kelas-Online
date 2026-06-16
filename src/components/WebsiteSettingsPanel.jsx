import { useState } from 'react'
import { availableWebsiteIcons, cleanWebsiteSettings } from '../data/websiteSettings'
import Icon from './Icon'

function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings))
}

function readNestedValue(source, path) {
  return path.reduce((current, key) => current?.[key], source)
}

function writeNestedValue(source, path, value) {
  const next = cloneSettings(source)
  let target = next

  path.slice(0, -1).forEach((key) => {
    target = target[key]
  })

  target[path[path.length - 1]] = value

  return next
}

function TextField({
  label,
  value,
  onChange,
  placeholder = '',
  type = 'text',
  multiline = false,
}) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows="3"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </label>
  )
}

function IconSelect({ value, onChange, label = 'Icon' }) {
  return (
    <label className="settings-field settings-icon-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {availableWebsiteIcons.map((iconName) => (
          <option key={iconName} value={iconName}>
            {iconName}
          </option>
        ))}
      </select>
    </label>
  )
}

function ImageField({ label, value, onChange, onUploadImage, onNotify }) {
  const handleUpload = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      onNotify('File harus berupa gambar.')
      event.target.value = ''
      return
    }

    try {
      onNotify('Mengupload gambar...')
      const imageUrl = await onUploadImage(file)
      onChange(imageUrl)
      onNotify('Gambar berhasil diupload.')
    } catch (error) {
      onNotify(error.message || 'Gambar tidak bisa diupload. Isi URL manual sebagai alternatif.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <div className="settings-image-field">
      <TextField
        label={label}
        type="text"
        value={value}
        onChange={onChange}
        placeholder="/uploads/gambar/... atau https://..."
      />
      <div className="settings-image-actions">
        <span className="settings-image-preview" aria-hidden="true">
          {value ? <img src={value} alt="" /> : <Icon name="image" />}
        </span>
        <label className="upload-control settings-upload-control">
          <Icon name="image" />
          Upload
          <input type="file" accept="image/*" onChange={handleUpload} />
        </label>
        {value && (
          <button
            className="btn btn-secondary settings-clear-image"
            type="button"
            onClick={() => onChange('')}
          >
            <Icon name="x" />
            Lepas
          </button>
        )}
      </div>
    </div>
  )
}

function SectionHeader({ eyebrow, title, icon }) {
  return (
    <div className="settings-section-heading">
      <span className="settings-section-icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
      </div>
    </div>
  )
}

function WebsiteSettingsPanel({
  settings,
  onSave,
  onSyncTripayPaymentMethods = async () => [],
  onDownloadBackup,
  onRestoreBackup,
  onUploadImage,
  onNotify = () => {},
}) {
  const [draft, setDraft] = useState(() => cleanWebsiteSettings(settings))
  const [isSaving, setIsSaving] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [isSyncingPayments, setIsSyncingPayments] = useState(false)
  const [activeSectionId, setActiveSectionId] = useState('')

  const updateValue = (path, value) => {
    setDraft((current) => writeNestedValue(current, path, value))
  }

  const updateArrayItem = (path, index, key, value) => {
    setDraft((current) => {
      const next = cloneSettings(current)
      const items = readNestedValue(next, path)

      items[index] = {
        ...items[index],
        [key]: value,
      }

      return next
    })
  }

  const addArrayItem = (path, item) => {
    setDraft((current) => {
      const next = cloneSettings(current)
      const items = readNestedValue(next, path)

      items.push(item)

      return next
    })
  }

  const removeArrayItem = (path, index) => {
    setDraft((current) => {
      const next = cloneSettings(current)
      const items = readNestedValue(next, path)

      if (items.length <= 1) {
        return next
      }

      items.splice(index, 1)

      return next
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSaving(true)

    try {
      const savedSettings = await onSave(cleanWebsiteSettings(draft))
      setDraft(cleanWebsiteSettings(savedSettings || draft))
      onNotify('Pengaturan website berhasil disimpan.')
    } catch (error) {
      onNotify(error.message || 'Pengaturan website tidak bisa disimpan.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRestore = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setIsRestoring(true)

    try {
      const text = await file.text()
      const backup = JSON.parse(text)
      const restoredSettings = await onRestoreBackup(backup)

      if (restoredSettings) {
        setDraft(cleanWebsiteSettings(restoredSettings))
      }

      onNotify('Backup berhasil diupload dan data dipulihkan.')
    } catch (error) {
      onNotify(error.message || 'File backup tidak bisa dipulihkan.')
    } finally {
      event.target.value = ''
      setIsRestoring(false)
    }
  }

  const handleSyncTripayPaymentMethods = async () => {
    setIsSyncingPayments(true)

    try {
      const paymentMethods = await onSyncTripayPaymentMethods()

      if (!paymentMethods.length) {
        onNotify('Belum ada metode pembayaran aktif yang terbaca dari Tripay.')
        return
      }

      setDraft((current) => cleanWebsiteSettings({
        ...current,
        paymentMethods,
      }))
      onNotify('Metode pembayaran aktif dari Tripay berhasil disinkronkan.')
    } catch (error) {
      onNotify(error.message || 'Metode pembayaran Tripay belum bisa disinkronkan.')
    } finally {
      setIsSyncingPayments(false)
    }
  }

  const settingsCategories = [
    {
      id: 'identity',
      eyebrow: 'Identitas',
      title: 'Nama header, title, icon, favicon',
      icon: 'spark',
      description: 'Atur nama brand yang tampil di header/footer, judul browser, favicon, dan logo.',
    },
    {
      id: 'header',
      eyebrow: 'Header',
      title: 'Navigasi header',
      icon: 'layoutDashboard',
      description: 'Ubah label menu navigasi, tombol login, dan dashboard.',
    },
    {
      id: 'hero',
      eyebrow: 'Hero',
      title: 'Headline, CTA, gambar utama',
      icon: 'image',
      description: 'Kelola copywriting utama, tombol, dan gambar hero.',
    },
    {
      id: 'stats',
      eyebrow: 'Statistik',
      title: 'Angka di bawah hero',
      icon: 'trendingUp',
      description: 'Sesuaikan icon, angka, dan label statistik homepage.',
    },
    {
      id: 'benefits',
      eyebrow: 'Kelas dan Benefit',
      title: 'Heading dan kartu benefit',
      icon: 'certificate',
      description: 'Atur heading daftar kelas, fallback, dan benefit website.',
    },
    {
      id: 'payments',
      eyebrow: 'Pembayaran',
      title: 'Logo metode pembayaran',
      icon: 'wallet',
      description: 'Upload logo QRIS, virtual account, minimarket, dan e-wallet.',
    },
    {
      id: 'schedule',
      eyebrow: 'Alur Belajar',
      title: 'Section langkah belajar',
      icon: 'calendar',
      description: 'Ubah section alur belajar, tombol, dan langkah-langkahnya.',
    },
    {
      id: 'footer',
      eyebrow: 'Footer',
      title: 'Copy, link sosial, kontak',
      icon: 'message',
      description: 'Kelola deskripsi, copyright, link, sosial, dan kontak footer.',
    },
  ]
  const activeCategory = settingsCategories.find((item) => item.id === activeSectionId)

  return (
    <section className="panel website-settings-panel">
      <form className="website-settings-form" onSubmit={handleSubmit} noValidate>
        <div className="panel-heading settings-panel-heading">
          <div className="settings-title-block">
            <span className="settings-title-icon" aria-hidden="true">
              <Icon name="settings" />
            </span>
            <div>
              <p className="eyebrow">Pengaturan Website</p>
              <h2>Ubah tampilan dan data publik</h2>
            </div>
          </div>
          <div className="button-row">
            <button className="btn btn-secondary" type="button" onClick={onDownloadBackup}>
              <Icon name="download" />
              Backup
            </button>
            <label className="btn btn-secondary settings-upload-backup">
              <Icon name="upload" />
              Restore
              <input
                type="file"
                accept="application/json"
                disabled={isRestoring}
                onChange={handleRestore}
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={isSaving}>
              <Icon name="settings" />
              {isSaving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>

        <div className="settings-card-grid" aria-label="Pilih subpengaturan website">
          {settingsCategories.map((section) => (
            <button
              className="settings-card-button"
              type="button"
              key={section.id}
              onClick={() => setActiveSectionId(section.id)}
            >
              <span className="settings-card-icon" aria-hidden="true">
                <Icon name={section.icon} />
              </span>
              <span className="settings-card-copy">
                <small>{section.eyebrow}</small>
                <strong>{section.title}</strong>
                <span>{section.description}</span>
              </span>
              <Icon name="arrowRight" className="settings-card-arrow" />
            </button>
          ))}
        </div>

        {activeCategory && (
          <div className="modal-backdrop settings-modal-backdrop" role="presentation">
            <div
              className="crud-editor settings-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`Pengaturan ${activeCategory.eyebrow}`}
            >
              <div className="modal-heading settings-modal-heading">
                <div>
                  <p className="eyebrow">{activeCategory.eyebrow}</p>
                  <h2>{activeCategory.title}</h2>
                </div>
                <button
                  type="button"
                  aria-label="Tutup pengaturan"
                  onClick={() => setActiveSectionId('')}
                >
                  <Icon name="x" />
                </button>
              </div>
              <div className="settings-modal-body">
        <div className={`settings-section ${activeSectionId === 'identity' ? 'is-active' : ''}`}>
          <SectionHeader
            eyebrow="Identitas"
            title="Nama, title, icon, favicon"
            icon="spark"
          />
          <div className="settings-grid">
            <TextField
              label="Nama brand di header"
              value={draft.siteName}
              onChange={(value) => updateValue(['siteName'], value)}
            />
            <TextField
              label="Judul tab browser"
              value={draft.siteTitle}
              onChange={(value) => updateValue(['siteTitle'], value)}
            />
            <TextField
              label="Deskripsi SEO"
              value={draft.siteDescription}
              onChange={(value) => updateValue(['siteDescription'], value)}
              multiline
            />
            <TextField
              label="URL favicon"
              type="text"
              value={draft.faviconUrl}
              onChange={(value) => updateValue(['faviconUrl'], value)}
              placeholder="Kosongkan, /favicon.svg, atau https://..."
            />
            <IconSelect
              label="Icon brand"
              value={draft.brandIcon}
              onChange={(value) => updateValue(['brandIcon'], value)}
            />
            <ImageField
              label="Logo brand"
              value={draft.brandLogo}
              onChange={(value) => updateValue(['brandLogo'], value)}
              onUploadImage={onUploadImage}
              onNotify={onNotify}
            />
          </div>
        </div>

        <div className={`settings-section ${activeSectionId === 'header' ? 'is-active' : ''}`}>
          <SectionHeader eyebrow="Header" title="Menu header dan tombol login" icon="layoutDashboard" />
          <div className="settings-list">
            {draft.header.navItems.map((item, index) => (
              <article className="settings-row" key={item.id}>
                <strong>{item.sectionId}</strong>
                <TextField
                  label="Label menu"
                  value={item.label}
                  onChange={(value) =>
                    updateArrayItem(['header', 'navItems'], index, 'label', value)
                  }
                />
              </article>
            ))}
          </div>
          <div className="settings-grid">
            <TextField
              label="Tombol login"
              value={draft.header.loginLabel}
              onChange={(value) => updateValue(['header', 'loginLabel'], value)}
            />
            <TextField
              label="Label dashboard footer"
              value={draft.header.dashboardLabel}
              onChange={(value) => updateValue(['header', 'dashboardLabel'], value)}
            />
          </div>
        </div>

        <div className={`settings-section ${activeSectionId === 'hero' ? 'is-active' : ''}`}>
          <SectionHeader eyebrow="Hero" title="Headline, CTA, gambar utama" icon="image" />
          <div className="settings-grid">
            <TextField
              label="Eyebrow"
              value={draft.hero.eyebrow}
              onChange={(value) => updateValue(['hero', 'eyebrow'], value)}
            />
            <TextField
              label="Judul hero"
              value={draft.hero.title}
              onChange={(value) => updateValue(['hero', 'title'], value)}
            />
            <TextField
              label="Deskripsi hero"
              value={draft.hero.description}
              onChange={(value) => updateValue(['hero', 'description'], value)}
              multiline
            />
            <TextField
              label="Tombol utama"
              value={draft.hero.primaryButton}
              onChange={(value) => updateValue(['hero', 'primaryButton'], value)}
            />
            <TextField
              label="Tombol dashboard"
              value={draft.hero.dashboardButton}
              onChange={(value) => updateValue(['hero', 'dashboardButton'], value)}
            />
            <TextField
              label="Tombol lihat kelas"
              value={draft.hero.secondaryButton}
              onChange={(value) => updateValue(['hero', 'secondaryButton'], value)}
            />
            <ImageField
              label="Gambar hero"
              value={draft.hero.backgroundImage}
              onChange={(value) => updateValue(['hero', 'backgroundImage'], value)}
              onUploadImage={onUploadImage}
              onNotify={onNotify}
            />
          </div>
        </div>

        <div className={`settings-section ${activeSectionId === 'stats' ? 'is-active' : ''}`}>
          <SectionHeader eyebrow="Statistik" title="Angka di bawah hero" icon="trendingUp" />
          <div className="settings-list">
            {draft.stats.map((item, index) => (
              <article className="settings-row settings-row-compact" key={`stat-${index}`}>
                <IconSelect
                  value={item.icon}
                  onChange={(value) => updateArrayItem(['stats'], index, 'icon', value)}
                />
                <TextField
                  label="Angka"
                  value={item.value}
                  onChange={(value) => updateArrayItem(['stats'], index, 'value', value)}
                />
                <TextField
                  label="Label"
                  value={item.label}
                  onChange={(value) => updateArrayItem(['stats'], index, 'label', value)}
                />
              </article>
            ))}
          </div>
        </div>

        <div className={`settings-section ${activeSectionId === 'benefits' ? 'is-active' : ''}`}>
          <SectionHeader
            eyebrow="Kelas dan Benefit"
            title="Heading dan kartu benefit"
            icon="certificate"
          />
          <div className="settings-grid">
            <TextField
              label="Eyebrow daftar kelas"
              value={draft.courses.eyebrow}
              onChange={(value) => updateValue(['courses', 'eyebrow'], value)}
            />
            <TextField
              label="Judul daftar kelas"
              value={draft.courses.title}
              onChange={(value) => updateValue(['courses', 'title'], value)}
            />
            <TextField
              label="Mentor fallback"
              value={draft.courses.fallbackMentor}
              onChange={(value) => updateValue(['courses', 'fallbackMentor'], value)}
            />
            <TextField
              label="Harga fallback"
              value={draft.courses.fallbackPrice}
              onChange={(value) => updateValue(['courses', 'fallbackPrice'], value)}
            />
            <TextField
              label="Eyebrow benefit"
              value={draft.benefits.eyebrow}
              onChange={(value) => updateValue(['benefits', 'eyebrow'], value)}
            />
            <TextField
              label="Judul benefit"
              value={draft.benefits.title}
              onChange={(value) => updateValue(['benefits', 'title'], value)}
            />
          </div>
          <div className="settings-list">
            {draft.benefits.items.map((item, index) => (
              <article className="settings-row" key={`benefit-${index}`}>
                <IconSelect
                  value={item.icon}
                  onChange={(value) =>
                    updateArrayItem(['benefits', 'items'], index, 'icon', value)
                  }
                />
                <TextField
                  label="Judul"
                  value={item.title}
                  onChange={(value) =>
                    updateArrayItem(['benefits', 'items'], index, 'title', value)
                  }
                />
                <TextField
                  label="Deskripsi"
                  value={item.description}
                  onChange={(value) =>
                    updateArrayItem(['benefits', 'items'], index, 'description', value)
                  }
                  multiline
                />
                <button
                  className="settings-remove-button"
                  type="button"
                  aria-label="Hapus benefit"
                  onClick={() => removeArrayItem(['benefits', 'items'], index)}
                >
                  <Icon name="x" />
                </button>
              </article>
            ))}
            <button
              className="btn btn-secondary settings-add-button"
              type="button"
              onClick={() =>
                addArrayItem(['benefits', 'items'], {
                  icon: 'spark',
                  title: 'Benefit baru',
                  description: 'Tulis deskripsi benefit.',
                })
              }
            >
              <Icon name="arrowRight" />
              Tambah Benefit
            </button>
          </div>
        </div>

        <div className={`settings-section ${activeSectionId === 'payments' ? 'is-active' : ''}`}>
          <SectionHeader eyebrow="Pembayaran" title="Logo metode pembayaran" icon="wallet" />
          <div className="settings-section-toolbar">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={isSyncingPayments}
              onClick={handleSyncTripayPaymentMethods}
            >
              <Icon name="download" />
              {isSyncingPayments ? 'Sinkron...' : 'Sinkron dari Tripay'}
            </button>
          </div>
          <div className="settings-list payment-method-settings-list">
            {draft.paymentMethods.map((item, index) => (
              <article className="settings-row payment-method-settings-row" key={item.code}>
                <strong>{item.code}</strong>
                <TextField
                  label="Nama metode"
                  value={item.label}
                  onChange={(value) =>
                    updateArrayItem(['paymentMethods'], index, 'label', value)
                  }
                />
                <ImageField
                  label="Logo metode"
                  value={item.logoUrl}
                  onChange={(value) =>
                    updateArrayItem(['paymentMethods'], index, 'logoUrl', value)
                  }
                  onUploadImage={onUploadImage}
                  onNotify={onNotify}
                />
              </article>
            ))}
          </div>
        </div>

        <div className={`settings-section ${activeSectionId === 'schedule' ? 'is-active' : ''}`}>
          <SectionHeader eyebrow="Alur Belajar" title="Section langkah belajar" icon="calendar" />
          <div className="settings-grid">
            <TextField
              label="Eyebrow alur"
              value={draft.schedule.eyebrow}
              onChange={(value) => updateValue(['schedule', 'eyebrow'], value)}
            />
            <TextField
              label="Judul alur"
              value={draft.schedule.title}
              onChange={(value) => updateValue(['schedule', 'title'], value)}
            />
            <TextField
              label="Deskripsi alur"
              value={draft.schedule.description}
              onChange={(value) => updateValue(['schedule', 'description'], value)}
              multiline
            />
            <TextField
              label="Tombol dashboard"
              value={draft.schedule.dashboardButton}
              onChange={(value) => updateValue(['schedule', 'dashboardButton'], value)}
            />
            <TextField
              label="Tombol login"
              value={draft.schedule.loginButton}
              onChange={(value) => updateValue(['schedule', 'loginButton'], value)}
            />
          </div>
          <div className="settings-list">
            {draft.schedule.steps.map((item, index) => (
              <article className="settings-row settings-row-compact" key={`step-${index}`}>
                <IconSelect
                  value={item.icon}
                  onChange={(value) =>
                    updateArrayItem(['schedule', 'steps'], index, 'icon', value)
                  }
                />
                <TextField
                  label="Label"
                  value={item.label}
                  onChange={(value) =>
                    updateArrayItem(['schedule', 'steps'], index, 'label', value)
                  }
                />
                <TextField
                  label="Judul"
                  value={item.title}
                  onChange={(value) =>
                    updateArrayItem(['schedule', 'steps'], index, 'title', value)
                  }
                />
              </article>
            ))}
          </div>
        </div>

        <div className={`settings-section ${activeSectionId === 'footer' ? 'is-active' : ''}`}>
          <SectionHeader eyebrow="Footer" title="Copy, link sosial, kontak" icon="message" />
          <div className="settings-grid">
            <TextField
              label="Deskripsi footer"
              value={draft.footer.description}
              onChange={(value) => updateValue(['footer', 'description'], value)}
              multiline
            />
            <TextField
              label="Copyright"
              value={draft.footer.copyright}
              onChange={(value) => updateValue(['footer', 'copyright'], value)}
            />
            <TextField
              label="Teks bawah footer"
              value={draft.footer.bottomText}
              onChange={(value) => updateValue(['footer', 'bottomText'], value)}
            />
          </div>
          <div className="settings-list">
            {draft.footer.links.map((item, index) => (
              <article className="settings-row settings-row-compact" key={item.sectionId}>
                <strong>{item.sectionId}</strong>
                <TextField
                  label="Label link footer"
                  value={item.label}
                  onChange={(value) =>
                    updateArrayItem(['footer', 'links'], index, 'label', value)
                  }
                />
              </article>
            ))}
            {draft.footer.socialLinks.map((item, index) => (
              <article className="settings-row" key={`${item.id}-${index}`}>
                <IconSelect
                  value={item.icon}
                  onChange={(value) =>
                    updateArrayItem(['footer', 'socialLinks'], index, 'icon', value)
                  }
                />
                <TextField
                  label="Label sosial"
                  value={item.label}
                  onChange={(value) =>
                    updateArrayItem(['footer', 'socialLinks'], index, 'label', value)
                  }
                />
                <TextField
                  label="URL"
                  type="text"
                  value={item.url}
                  onChange={(value) =>
                    updateArrayItem(['footer', 'socialLinks'], index, 'url', value)
                  }
                />
                <button
                  className="settings-remove-button"
                  type="button"
                  aria-label="Hapus link sosial"
                  onClick={() => removeArrayItem(['footer', 'socialLinks'], index)}
                >
                  <Icon name="x" />
                </button>
              </article>
            ))}
            <button
              className="btn btn-secondary settings-add-button"
              type="button"
              onClick={() =>
                addArrayItem(['footer', 'socialLinks'], {
                  id: `social-${Date.now()}`,
                  icon: 'send',
                  label: 'Sosial baru',
                  url: 'https://',
                })
              }
            >
              <Icon name="arrowRight" />
              Tambah Sosial
            </button>
            {draft.footer.contactItems.map((item, index) => (
              <article className="settings-row settings-row-compact" key={`contact-${index}`}>
                <IconSelect
                  value={item.icon}
                  onChange={(value) =>
                    updateArrayItem(['footer', 'contactItems'], index, 'icon', value)
                  }
                />
                <TextField
                  label="Teks kontak"
                  value={item.text}
                  onChange={(value) =>
                    updateArrayItem(['footer', 'contactItems'], index, 'text', value)
                  }
                />
                <button
                  className="settings-remove-button"
                  type="button"
                  aria-label="Hapus kontak"
                  onClick={() => removeArrayItem(['footer', 'contactItems'], index)}
                >
                  <Icon name="x" />
                </button>
              </article>
            ))}
          </div>
        </div>
              </div>
              <div className="modal-actions settings-modal-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setActiveSectionId('')}
                >
                  Batal
                </button>
                <button className="btn btn-primary" type="submit" disabled={isSaving}>
                  <Icon name="settings" />
                  {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </section>
  )
}

export default WebsiteSettingsPanel
