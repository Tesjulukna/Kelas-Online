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

function formatActivityDate(value) {
  const time = Date.parse(value || '')

  if (!time) {
    return 'Tanggal belum tersedia'
  }

  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(time))
}

function getDateTimeLocalValue(value = new Date().toISOString()) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 16)
}

function makeCustomActivityId() {
  return `custom-activity-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function createCustomActivityForm(itemValue = '') {
  return {
    name: '',
    avatar: '',
    itemValue,
    actionKind: 'purchase',
    createdAt: getDateTimeLocalValue(),
  }
}

function buildMemberAboutSrcDoc(html = '', title = 'Tentang') {
  const trimmedHtml = String(html || '').trim()
  const safeTitle = String(title || 'Tentang')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const content = trimmedHtml || `
    <section style="min-height:100vh;display:grid;place-items:center;padding:48px 20px;background:#f8fafc;color:#0f172a;font-family:Inter,Arial,sans-serif;text-align:center">
      <div style="max-width:680px">
        <p style="margin:0 0 10px;color:#2563eb;font-weight:800;letter-spacing:.08em;text-transform:uppercase">Tentang</p>
        <h1 style="margin:0 0 14px;font-size:clamp(32px,7vw,64px);line-height:1.05">${safeTitle}</h1>
        <p style="margin:0;color:#64748b;font-size:18px;line-height:1.7">Paste HTML landing page dari Gemini di pengaturan ini, lalu tampilannya akan muncul untuk member.</p>
      </div>
    </section>
  `

  if (/<html[\s>]/i.test(content) || /<!doctype/i.test(content)) {
    if (/<head[\s>]/i.test(content)) {
      return content.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">')
    }

    return content.replace(/<html([^>]*)>/i, '<html$1><head><base target="_blank"></head>')
  }

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <base target="_blank">
    <title>${safeTitle}</title>
    <style>
      html, body { margin: 0; min-height: 100%; }
      body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #ffffff; color: #0f172a; }
      * { box-sizing: border-box; }
      img, video, iframe { max-width: 100%; }
    </style>
  </head>
  <body>${content}</body>
</html>`
}

function WebsiteSettingsPanel({
  settings,
  onSave,
  publicActivities = [],
  classes = [],
  digitalProducts = [],
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
  const [isCustomActivityOpen, setIsCustomActivityOpen] = useState(false)
  const [customActivityForm, setCustomActivityForm] = useState(() =>
    createCustomActivityForm(),
  )

  const notificationItemOptions = [
    ...classes
      .filter((course) => course?.id && course?.title)
      .map((course) => ({
        value: `kelas:${course.id}`,
        type: 'kelas',
        id: course.id,
        title: course.title,
        label: `Kelas - ${course.title}`,
      })),
    ...digitalProducts
      .filter((product) => product?.id && product?.title)
      .map((product) => ({
        value: `produk:${product.id}`,
        type: 'produk',
        id: product.id,
        title: product.title,
        label: `Produk - ${product.title}`,
      })),
  ]
  const customActivities = draft.homepageNotifications.customActivities || []
  const notificationPreviewActivities = [
    ...customActivities,
    ...publicActivities.filter(
      (activity) => !customActivities.some((custom) => custom.id === activity.id),
    ),
  ]

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

  const openCustomActivityModal = () => {
    setCustomActivityForm(createCustomActivityForm(notificationItemOptions[0]?.value || ''))
    setIsCustomActivityOpen(true)
  }

  const updateCustomActivityForm = (key, value) => {
    setCustomActivityForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const addCustomActivity = () => {
    const selectedItem = notificationItemOptions.find(
      (item) => item.value === customActivityForm.itemValue,
    )
    const name = customActivityForm.name.trim()

    if (!name) {
      onNotify('Nama orang wajib diisi.')
      return
    }

    if (!selectedItem) {
      onNotify('Pilih kelas atau produk terlebih dahulu.')
      return
    }

    const createdDate = customActivityForm.createdAt
      ? new Date(customActivityForm.createdAt)
      : new Date()
    const createdAt = Number.isNaN(createdDate.getTime())
      ? new Date().toISOString()
      : createdDate.toISOString()
    const actionText = customActivityForm.actionKind === 'access'
      ? selectedItem.type === 'produk' ? 'mengakses produk digital' : 'mengakses kelas'
      : selectedItem.type === 'produk' ? 'membeli produk digital' : 'mendaftar kelas'
    const activity = {
      id: makeCustomActivityId(),
      name,
      avatar: customActivityForm.avatar.trim(),
      actionText,
      itemTitle: selectedItem.title,
      itemId: selectedItem.id,
      type: selectedItem.type,
      createdAt,
    }

    setDraft((current) => {
      const next = cloneSettings(current)
      next.homepageNotifications.customActivities = [
        activity,
        ...(next.homepageNotifications.customActivities || []),
      ].slice(0, 100)

      if (next.homepageNotifications.mode === 'selected') {
        next.homepageNotifications.selectedActivityIds = [
          activity.id,
          ...(next.homepageNotifications.selectedActivityIds || []),
        ].slice(0, 300)
      }

      return next
    })
    setIsCustomActivityOpen(false)
    onNotify('Aktivitas custom ditambahkan. Klik Simpan Perubahan agar tersimpan.')
  }

  const removeCustomActivity = (activityId) => {
    setDraft((current) => {
      const next = cloneSettings(current)
      next.homepageNotifications.customActivities = (
        next.homepageNotifications.customActivities || []
      ).filter((activity) => activity.id !== activityId)
      next.homepageNotifications.selectedActivityIds = (
        next.homepageNotifications.selectedActivityIds || []
      ).filter((id) => id !== activityId)

      return next
    })
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
      id: 'notifications',
      eyebrow: 'Notifikasi',
      title: 'Toast aktivitas homepage',
      icon: 'bell',
      description: 'Pilih siapa saja yang boleh tampil di notifikasi pembelian/pendaftaran.',
    },
    {
      id: 'member-about',
      eyebrow: 'Tentang Member',
      title: 'HTML halaman Tentang',
      icon: 'fileText',
      description: 'Paste kode HTML/CSS dari Gemini untuk halaman Tentang di dashboard member.',
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

        <div className={`settings-section ${activeSectionId === 'notifications' ? 'is-active' : ''}`}>
          <SectionHeader eyebrow="Notifikasi" title="Toast aktivitas homepage" icon="bell" />
          <div className="settings-grid">
            <label className="settings-field settings-checkbox-field">
              <input
                type="checkbox"
                checked={draft.homepageNotifications.enabled}
                onChange={(event) => updateValue(['homepageNotifications', 'enabled'], event.target.checked)}
              />
              <span>Tampilkan notifikasi aktivitas di homepage</span>
            </label>
            <label className="settings-field">
              <span>Mode tampilan</span>
              <select
                value={draft.homepageNotifications.mode}
                onChange={(event) => updateValue(['homepageNotifications', 'mode'], event.target.value)}
              >
                <option value="all">Tampilkan semua aktivitas</option>
                <option value="selected">Pilih manual aktivitas tertentu</option>
              </select>
            </label>
          </div>
          <div className="settings-section-toolbar">
            <p>
              {draft.homepageNotifications.mode === 'selected'
                ? `${draft.homepageNotifications.selectedActivityIds.length} aktivitas dipilih`
                : 'Semua aktivitas real yang tersedia bisa tampil secara acak.'}
            </p>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={openCustomActivityModal}
            >
              <Icon name="user" />
              Tambah orang
            </button>
          </div>
          {customActivities.length > 0 && (
            <div className="settings-list homepage-custom-activity-list">
              {customActivities.map((activity) => (
                <article className="settings-row homepage-custom-activity-row" key={activity.id}>
                  <span className="homepage-notification-preview-avatar" aria-hidden="true">
                    {activity.avatar ? (
                      <img src={activity.avatar} alt="" />
                    ) : (
                      <Icon name={activity.type === 'produk' ? 'cart' : 'bookOpen'} />
                    )}
                  </span>
                  <span className="homepage-notification-preview-copy">
                    <strong>{activity.name}</strong>
                    <small>
                      {activity.actionText} {activity.itemTitle} - {formatActivityDate(activity.createdAt)}
                    </small>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCustomActivity(activity.id)}
                    aria-label={`Hapus aktivitas ${activity.name}`}
                  >
                    <Icon name="x" />
                  </button>
                </article>
              ))}
            </div>
          )}
          {draft.homepageNotifications.mode === 'selected' && (
            <div className="settings-list homepage-notification-settings-list">
              {notificationPreviewActivities.map((activity) => {
                const isChecked = draft.homepageNotifications.selectedActivityIds.includes(activity.id)
                const nextSelectedIds = isChecked
                  ? draft.homepageNotifications.selectedActivityIds.filter((id) => id !== activity.id)
                  : [...draft.homepageNotifications.selectedActivityIds, activity.id]

                return (
                  <label className="settings-row homepage-notification-row" key={activity.id}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() =>
                        updateValue(['homepageNotifications', 'selectedActivityIds'], nextSelectedIds)
                      }
                    />
                    <span className="homepage-notification-preview-avatar" aria-hidden="true">
                      {activity.avatar ? (
                        <img src={activity.avatar} alt="" />
                      ) : (
                        <Icon name={activity.type === 'produk' ? 'cart' : 'bookOpen'} />
                      )}
                    </span>
                    <span className="homepage-notification-preview-copy">
                      <strong>{activity.name || 'Pelanggan'}</strong>
                      <small>
                        {activity.actionText} {activity.itemTitle} - {formatActivityDate(activity.createdAt)}
                      </small>
                    </span>
                  </label>
                )
              })}
              {!notificationPreviewActivities.length && (
                <article className="empty-state table-empty">
                  <Icon name="bell" />
                  <h3>Belum ada aktivitas</h3>
                  <p>Aktivitas pembelian, akses produk, atau pendaftaran kelas akan muncul setelah ada data.</p>
                </article>
              )}
            </div>
          )}
        </div>

        <div className={`settings-section ${activeSectionId === 'member-about' ? 'is-active' : ''}`}>
          <SectionHeader eyebrow="Tentang Member" title="HTML halaman Tentang" icon="fileText" />
          <div className="settings-grid">
            <TextField
              label="Label menu member"
              value={draft.memberAbout.menuLabel}
              onChange={(value) => updateValue(['memberAbout', 'menuLabel'], value)}
              placeholder="Tentang"
            />
            <TextField
              label="Judul fallback"
              value={draft.memberAbout.title}
              onChange={(value) => updateValue(['memberAbout', 'title'], value)}
              placeholder="Tentang IbnuCreative"
            />
          </div>
          <label className="settings-field settings-code-field">
            <span>HTML / kode landing page</span>
            <textarea
              value={draft.memberAbout.html}
              onChange={(event) => updateValue(['memberAbout', 'html'], event.target.value)}
              placeholder="Paste kode HTML dari Gemini di sini. HTML dan CSS akan tampil di halaman Tentang member."
              rows={18}
              spellCheck="false"
            />
          </label>
          <div className="settings-about-preview">
            <div className="settings-section-toolbar">
              <p>Preview halaman Tentang member</p>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => updateValue(['memberAbout', 'html'], '')}
              >
                <Icon name="x" />
                Kosongkan
              </button>
            </div>
            <iframe
              title="Preview halaman Tentang member"
              srcDoc={buildMemberAboutSrcDoc(draft.memberAbout.html, draft.memberAbout.title)}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
            />
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
        {isCustomActivityOpen && (
          <div
            className="settings-mini-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setIsCustomActivityOpen(false)
              }
            }}
          >
            <div
              className="settings-mini-modal custom-activity-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="custom-activity-title"
            >
              <div className="settings-mini-modal-heading">
                <div>
                  <p className="eyebrow">Toast aktivitas</p>
                  <h3 id="custom-activity-title">Tambah orang</h3>
                </div>
                <button
                  type="button"
                  aria-label="Tutup tambah orang"
                  onClick={() => setIsCustomActivityOpen(false)}
                >
                  <Icon name="x" />
                </button>
              </div>

              <div className="custom-activity-preview">
                <span className="homepage-notification-preview-avatar" aria-hidden="true">
                  {customActivityForm.avatar ? (
                    <img src={customActivityForm.avatar} alt="" />
                  ) : (
                    <Icon name="user" />
                  )}
                </span>
                <div>
                  <strong>{customActivityForm.name || 'Nama pelanggan'}</strong>
                  <small>Preview foto dan nama yang akan tampil di toast.</small>
                </div>
              </div>

              <div className="settings-grid custom-activity-form-grid">
                <TextField
                  label="Nama orang"
                  value={customActivityForm.name}
                  onChange={(value) => updateCustomActivityForm('name', value)}
                  placeholder="Contoh: Rina Wijaya"
                />
                <TextField
                  label="Link gambar profil"
                  value={customActivityForm.avatar}
                  onChange={(value) => updateCustomActivityForm('avatar', value)}
                  placeholder="https://..."
                />
                <label className="settings-field">
                  <span>Tanggal dan waktu</span>
                  <input
                    type="datetime-local"
                    value={customActivityForm.createdAt}
                    onChange={(event) => updateCustomActivityForm('createdAt', event.target.value)}
                  />
                </label>
                <label className="settings-field">
                  <span>Aktivitas</span>
                  <select
                    value={customActivityForm.actionKind}
                    onChange={(event) => updateCustomActivityForm('actionKind', event.target.value)}
                  >
                    <option value="purchase">Pembelian / pendaftaran</option>
                    <option value="access">Akses produk / kelas</option>
                  </select>
                </label>
                <label className="settings-field custom-activity-product-select">
                  <span>Pilih kelas atau produk</span>
                  <select
                    value={customActivityForm.itemValue}
                    onChange={(event) => updateCustomActivityForm('itemValue', event.target.value)}
                  >
                    {notificationItemOptions.map((item) => (
                      <option value={item.value} key={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!notificationItemOptions.length && (
                <p className="custom-activity-note">
                  Belum ada kelas atau produk yang bisa dipilih.
                </p>
              )}

              <div className="settings-mini-modal-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setIsCustomActivityOpen(false)}
                >
                  Batal
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={addCustomActivity}
                  disabled={!notificationItemOptions.length}
                >
                  <Icon name="user" />
                  Tambahkan
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
