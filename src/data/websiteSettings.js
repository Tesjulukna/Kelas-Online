export const availableWebsiteIcons = [
  'spark',
  'bookOpen',
  'video',
  'layoutDashboard',
  'megaphone',
  'target',
  'certificate',
  'message',
  'shield',
  'users',
  'wallet',
  'trendingUp',
  'play',
  'fileText',
  'instagram',
  'youtube',
  'send',
]

export const defaultWebsiteSettings = {
  siteName: 'IbnuCreative',
  siteTitle: 'IbnuCreative Academy',
  siteDescription:
    'Platform kelas online kreatif untuk belajar desain, video, konten digital, dan strategi jualan dengan materi praktik serta feedback mentor.',
  faviconUrl: '/favicon.svg',
  brandIcon: 'spark',
  brandLogo: '',
  header: {
    loginLabel: 'Login',
    dashboardLabel: 'Dashboard',
    navItems: [
      { id: 'home', label: 'Beranda', sectionId: 'home' },
      { id: 'courses', label: 'Kelas', sectionId: 'courses' },
      { id: 'benefits', label: 'Benefit', sectionId: 'benefits' },
      { id: 'schedule', label: 'Jadwal', sectionId: 'schedule' },
    ],
  },
  hero: {
    eyebrow: 'Platform kelas online kreatif',
    title: 'Kelas online untuk menaikkan skillmu.',
    description:
      'Belajar desain, video editing, konten digital, hingga strategi jualan online lewat materi yang rapi, tugas praktik, feedback mentor, dan dashboard belajar yang nyaman dipakai di semua perangkat.',
    primaryButton: 'Mulai Belajar',
    dashboardButton: 'Buka Dashboard',
    secondaryButton: 'Lihat Kelas',
    backgroundImage: '',
  },
  stats: [
    { icon: 'users', value: '3.200+', label: 'member aktif' },
    { icon: 'bookOpen', value: '12', label: 'kelas dan workshop' },
    { icon: 'checkCircle', value: '92%', label: 'praktik sampai selesai' },
  ],
  courses: {
    eyebrow: 'Pilihan kelas',
    title: 'Daftar Kelas',
    fallbackMentor: 'Ibnu Creative',
    fallbackPrice: 'Mulai dari kelas pilihan',
    emptyPrice: 'Harga tersedia di dashboard',
  },
  homepageNotifications: {
    enabled: true,
    mode: 'all',
    selectedActivityIds: [],
    customActivities: [],
  },
  paymentMethods: [
    { code: 'QRIS', label: 'QRIS', brand: 'qris', logoUrl: '' },
    { code: 'QRIS2', label: 'QRIS 2', brand: 'qris', logoUrl: '' },
    { code: 'BCAVA', label: 'BCA Virtual Account', brand: 'bca', logoUrl: '' },
    { code: 'BNIVA', label: 'BNI Virtual Account', brand: 'bni', logoUrl: '' },
    { code: 'BRIVA', label: 'BRI Virtual Account', brand: 'bri', logoUrl: '' },
    { code: 'MANDIRIVA', label: 'Mandiri Virtual Account', brand: 'mandiri', logoUrl: '' },
    { code: 'PERMATAVA', label: 'Permata Virtual Account', brand: 'permata', logoUrl: '' },
    { code: 'CIMBVA', label: 'CIMB Niaga Virtual Account', brand: 'cimb', logoUrl: '' },
    { code: 'BSIVA', label: 'BSI Virtual Account', brand: 'bsi', logoUrl: '' },
    { code: 'MUAMALATVA', label: 'Muamalat Virtual Account', brand: 'muamalat', logoUrl: '' },
    { code: 'ALFAMART', label: 'Alfamart', brand: 'alfamart', logoUrl: '' },
    { code: 'INDOMARET', label: 'Indomaret', brand: 'indomaret', logoUrl: '' },
    { code: 'ALFAMIDI', label: 'Alfamidi', brand: 'alfamidi', logoUrl: '' },
    { code: 'OVO', label: 'OVO', brand: 'ovo', logoUrl: '' },
    { code: 'SHOPEEPAY', label: 'ShopeePay', brand: 'shopeepay', logoUrl: '' },
  ],
  benefits: {
    eyebrow: 'Benefit',
    title: 'Belajar lebih terarah dengan materi, tugas, dan feedback mentor.',
    items: [
      {
        title: 'Materi pendek dan fokus',
        description: 'Setiap modul dibuat ringkas agar mudah dipraktikkan.',
        icon: 'target',
      },
      {
        title: 'Feedback mentor',
        description: 'Tugas member direview supaya hasilnya naik bertahap.',
        icon: 'message',
      },
      {
        title: 'Sertifikat proyek',
        description: 'Kumpulkan portofolio yang bisa dipakai untuk klien.',
        icon: 'certificate',
      },
    ],
  },
  schedule: {
    eyebrow: 'Alur belajar',
    title: 'Pilih kelas, ikuti materi, kirim tugas, lalu dapatkan arahan.',
    description:
      'Semua proses belajar bisa dipantau dari dashboard member. Admin dan mentor dapat mengelola materi, tugas, serta balasan bantuan dari dashboard yang sama.',
    dashboardButton: 'Masuk Dashboard',
    loginButton: 'Login Member',
    steps: [
      { icon: 'play', label: 'Langkah 01', title: 'Pilih kelas favorit' },
      { icon: 'fileText', label: 'Langkah 02', title: 'Kerjakan tugas praktik' },
      { icon: 'message', label: 'Langkah 03', title: 'Terima feedback mentor' },
    ],
  },
  footer: {
    description:
      'Platform kelas online kreatif untuk belajar desain, video, konten digital, dan strategi jualan dengan materi praktik serta feedback mentor.',
    copyright: 'IbnuCreative Academy',
    bottomText: 'Kelas online kreatif untuk skill yang langsung dipraktikkan.',
    socialLinks: [
      { id: 'instagram', label: 'Instagram', icon: 'instagram', url: 'https://instagram.com/' },
      { id: 'youtube', label: 'YouTube', icon: 'youtube', url: 'https://youtube.com/' },
      { id: 'tiktok', label: 'TikTok', icon: 'video', url: 'https://tiktok.com/' },
      { id: 'whatsapp', label: 'WhatsApp', icon: 'message', url: 'https://wa.me/' },
      { id: 'telegram', label: 'Telegram', icon: 'send', url: 'https://t.me/' },
    ],
    contactItems: [
      { icon: 'message', text: 'Bantuan mentor tersedia dari dashboard member.' },
      { icon: 'shield', text: 'Materi dan progres belajar tersimpan aman.' },
    ],
    links: [
      { label: 'Kelas', sectionId: 'courses' },
      { label: 'Benefit', sectionId: 'benefits' },
      { label: 'Alur belajar', sectionId: 'schedule' },
    ],
  },
}

function cleanText(value, maxLength = 80) {
  return String(value ?? '').trim().replace(/[<>]/g, '').slice(0, maxLength)
}

function cleanUrl(value, maxLength = 2000) {
  const url = cleanText(value, maxLength)

  if (!url) {
    return ''
  }

  if (
    url.startsWith('/') ||
    url.startsWith('data:image/') ||
    /^https?:\/\//i.test(url)
  ) {
    return url
  }

  return ''
}

function cleanIcon(value, fallback = 'spark') {
  return availableWebsiteIcons.includes(value) || value === 'checkCircle'
    ? value
    : fallback
}

function cleanNavItems(value) {
  const fallbackItems = defaultWebsiteSettings.header.navItems
  const source = Array.isArray(value) ? value : fallbackItems

  return fallbackItems.map((fallbackItem, index) => {
    const item = source.find((candidate) => candidate?.id === fallbackItem.id) ?? source[index]

    return {
      ...fallbackItem,
      label: cleanText(item?.label || fallbackItem.label, 40),
    }
  })
}

function cleanStats(value) {
  const source = Array.isArray(value) && value.length ? value : defaultWebsiteSettings.stats

  return source.slice(0, 6).map((item, index) => {
    const fallback = defaultWebsiteSettings.stats[index] ?? defaultWebsiteSettings.stats[0]

    return {
      icon: cleanIcon(item?.icon, fallback.icon),
      value: cleanText(item?.value || fallback.value, 30),
      label: cleanText(item?.label || fallback.label, 60),
    }
  })
}

function cleanBenefitItems(value) {
  const source = Array.isArray(value) && value.length
    ? value
    : defaultWebsiteSettings.benefits.items

  return source.slice(0, 8).map((item, index) => {
    const fallback =
      defaultWebsiteSettings.benefits.items[index] ??
      defaultWebsiteSettings.benefits.items[0]

    return {
      title: cleanText(item?.title || fallback.title, 90),
      description: cleanText(item?.description || fallback.description, 220),
      icon: cleanIcon(item?.icon, fallback.icon),
    }
  })
}

function cleanScheduleSteps(value) {
  const source = Array.isArray(value) && value.length
    ? value
    : defaultWebsiteSettings.schedule.steps

  return source.slice(0, 6).map((item, index) => {
    const fallback =
      defaultWebsiteSettings.schedule.steps[index] ??
      defaultWebsiteSettings.schedule.steps[0]

    return {
      icon: cleanIcon(item?.icon, fallback.icon),
      label: cleanText(item?.label || fallback.label, 40),
      title: cleanText(item?.title || fallback.title, 90),
    }
  })
}

function cleanSocialLinks(value) {
  const source = Array.isArray(value) ? value : defaultWebsiteSettings.footer.socialLinks

  return source.slice(0, 8).map((item, index) => {
    const fallback =
      defaultWebsiteSettings.footer.socialLinks[index] ??
      defaultWebsiteSettings.footer.socialLinks[0]

    return {
      id: cleanText(item?.id || fallback.id || `social-${index + 1}`, 40),
      label: cleanText(item?.label || fallback.label, 50),
      icon: cleanIcon(item?.icon, fallback.icon),
      url: cleanUrl(item?.url || fallback.url, 360),
    }
  })
}

function cleanContactItems(value) {
  const source = Array.isArray(value) ? value : defaultWebsiteSettings.footer.contactItems

  return source.slice(0, 6).map((item, index) => {
    const fallback =
      defaultWebsiteSettings.footer.contactItems[index] ??
      defaultWebsiteSettings.footer.contactItems[0]

    return {
      icon: cleanIcon(item?.icon, fallback.icon),
      text: cleanText(item?.text || fallback.text, 180),
    }
  })
}

function cleanFooterLinks(value) {
  const fallbackLinks = defaultWebsiteSettings.footer.links
  const source = Array.isArray(value) ? value : fallbackLinks

  return fallbackLinks.map((fallbackItem, index) => {
    const item = source[index] ?? fallbackItem

    return {
      ...fallbackItem,
      label: cleanText(item?.label || fallbackItem.label, 40),
    }
  })
}

function cleanPaymentMethods(value) {
  const fallbackMethods = defaultWebsiteSettings.paymentMethods
  const source = Array.isArray(value) && value.length ? value : fallbackMethods
  const seenCodes = new Set()

  return source
    .map((item, index) => {
      const fallback = fallbackMethods.find((method) => method.code === item?.code) ??
        fallbackMethods[index] ??
        fallbackMethods[0]
      const code = cleanText(item?.code || fallback.code, 40).toUpperCase()

      if (!code || seenCodes.has(code)) {
        return null
      }

      seenCodes.add(code)

      return {
        code,
        label: cleanText(item?.label || fallback.label || code, 80),
        brand: cleanText(item?.brand || fallback.brand || code.toLowerCase(), 40),
        logoUrl: cleanUrl(item?.logoUrl || item?.iconUrl || '', 2000),
        feeFlat: Math.max(
          0,
          Math.round(Number(item?.feeFlat ?? item?.feeCustomer?.flat) || 0),
        ),
        feePercent: Math.max(
          0,
          Math.min(100, Number(item?.feePercent ?? item?.feeCustomer?.percent) || 0),
        ),
      }
    })
    .filter(Boolean)
}

function cleanHomepageNotifications(value = {}) {
  const mode = ['all', 'selected'].includes(value?.mode) ? value.mode : 'all'
  const selectedActivityIds = Array.isArray(value?.selectedActivityIds)
    ? value.selectedActivityIds
        .map((id) => cleanText(id, 240))
        .filter(Boolean)
        .slice(0, 300)
    : []
  const customActivities = Array.isArray(value?.customActivities)
    ? value.customActivities
        .map((activity, index) => {
          const itemType = activity?.type === 'produk' || activity?.itemType === 'produk'
            ? 'produk'
            : 'kelas'

          return {
            id: cleanText(activity?.id || `custom-activity-${index + 1}`, 240),
            name: cleanText(activity?.name || '', 160),
            avatar: cleanUrl(activity?.avatar || '', 2000),
            actionText: cleanText(
              activity?.actionText || (itemType === 'produk' ? 'membeli produk digital' : 'mendaftar kelas'),
              80,
            ),
            itemTitle: cleanText(activity?.itemTitle || '', 180),
            itemId: cleanText(activity?.itemId || '', 160),
            type: itemType,
            createdAt: cleanText(activity?.createdAt || '', 80),
          }
        })
        .filter((activity) => activity.name && activity.itemTitle)
        .slice(0, 100)
    : []

  return {
    enabled: value?.enabled !== false,
    mode,
    selectedActivityIds,
    customActivities,
  }
}

export function cleanWebsiteSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {}

  return {
    siteName: cleanText(source.siteName || defaultWebsiteSettings.siteName, 60),
    siteTitle: cleanText(source.siteTitle || defaultWebsiteSettings.siteTitle, 90),
    siteDescription: cleanText(
      source.siteDescription || defaultWebsiteSettings.siteDescription,
      220,
    ),
    faviconUrl: cleanUrl(source.faviconUrl || defaultWebsiteSettings.faviconUrl, 2000),
    brandIcon: cleanIcon(source.brandIcon, defaultWebsiteSettings.brandIcon),
    brandLogo: cleanUrl(source.brandLogo || '', 2000),
    header: {
      loginLabel: cleanText(
        source.header?.loginLabel || defaultWebsiteSettings.header.loginLabel,
        30,
      ),
      dashboardLabel: cleanText(
        source.header?.dashboardLabel || defaultWebsiteSettings.header.dashboardLabel,
        30,
      ),
      navItems: cleanNavItems(source.header?.navItems),
    },
    hero: {
      eyebrow: cleanText(source.hero?.eyebrow || defaultWebsiteSettings.hero.eyebrow, 80),
      title: cleanText(source.hero?.title || defaultWebsiteSettings.hero.title, 120),
      description: cleanText(
        source.hero?.description || defaultWebsiteSettings.hero.description,
        320,
      ),
      primaryButton: cleanText(
        source.hero?.primaryButton || defaultWebsiteSettings.hero.primaryButton,
        40,
      ),
      dashboardButton: cleanText(
        source.hero?.dashboardButton || defaultWebsiteSettings.hero.dashboardButton,
        40,
      ),
      secondaryButton: cleanText(
        source.hero?.secondaryButton || defaultWebsiteSettings.hero.secondaryButton,
        40,
      ),
      backgroundImage: cleanUrl(source.hero?.backgroundImage || '', 2000),
    },
    stats: cleanStats(source.stats),
    courses: {
      eyebrow: cleanText(
        source.courses?.eyebrow || defaultWebsiteSettings.courses.eyebrow,
        60,
      ),
      title: cleanText(source.courses?.title || defaultWebsiteSettings.courses.title, 90),
      fallbackMentor: cleanText(
        source.courses?.fallbackMentor || defaultWebsiteSettings.courses.fallbackMentor,
        80,
      ),
      fallbackPrice: cleanText(
        source.courses?.fallbackPrice || defaultWebsiteSettings.courses.fallbackPrice,
        90,
      ),
      emptyPrice: cleanText(
        source.courses?.emptyPrice || defaultWebsiteSettings.courses.emptyPrice,
        90,
      ),
    },
    homepageNotifications: cleanHomepageNotifications(source.homepageNotifications),
    paymentMethods: cleanPaymentMethods(source.paymentMethods),
    benefits: {
      eyebrow: cleanText(
        source.benefits?.eyebrow || defaultWebsiteSettings.benefits.eyebrow,
        60,
      ),
      title: cleanText(source.benefits?.title || defaultWebsiteSettings.benefits.title, 140),
      items: cleanBenefitItems(source.benefits?.items),
    },
    schedule: {
      eyebrow: cleanText(
        source.schedule?.eyebrow || defaultWebsiteSettings.schedule.eyebrow,
        60,
      ),
      title: cleanText(source.schedule?.title || defaultWebsiteSettings.schedule.title, 140),
      description: cleanText(
        source.schedule?.description || defaultWebsiteSettings.schedule.description,
        280,
      ),
      dashboardButton: cleanText(
        source.schedule?.dashboardButton || defaultWebsiteSettings.schedule.dashboardButton,
        40,
      ),
      loginButton: cleanText(
        source.schedule?.loginButton || defaultWebsiteSettings.schedule.loginButton,
        40,
      ),
      steps: cleanScheduleSteps(source.schedule?.steps),
    },
    footer: {
      description: cleanText(
        source.footer?.description || defaultWebsiteSettings.footer.description,
        260,
      ),
      copyright: cleanText(
        source.footer?.copyright || defaultWebsiteSettings.footer.copyright,
        80,
      ),
      bottomText: cleanText(
        source.footer?.bottomText || defaultWebsiteSettings.footer.bottomText,
        120,
      ),
      socialLinks: cleanSocialLinks(source.footer?.socialLinks),
      contactItems: cleanContactItems(source.footer?.contactItems),
      links: cleanFooterLinks(source.footer?.links),
    },
  }
}
