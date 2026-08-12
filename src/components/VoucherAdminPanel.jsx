import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import './VoucherAdminPanel.css'

const voucherApiPath = '/api/vouchers'

const scopeOptions = [
  { id: 'all', label: 'Semua item', description: 'Voucher berlaku untuk seluruh katalog.', icon: 'spark' },
  { id: 'classes', label: 'Kelas tertentu', description: 'Pilih kelas yang boleh memakai voucher.', icon: 'bookOpen' },
  { id: 'products', label: 'Produk digital', description: 'Batasi ke produk digital tertentu.', icon: 'download' },
  { id: 'prompts', label: 'Prompt', description: 'Batasi ke prompt tertentu.', icon: 'spark' },
  { id: 'bundles', label: 'Bundling', description: 'Batasi ke paket bundling tertentu.', icon: 'bundle' },
]

const statusFilters = [
  ['all', 'Semua'],
  ['active', 'Aktif'],
  ['scheduled', 'Terjadwal'],
  ['expired', 'Berakhir'],
  ['exhausted', 'Kuota habis'],
  ['inactive', 'Nonaktif'],
]

function unwrapApiData(payload) {
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload
}

async function requestVoucherApi({ method = 'GET', sessionToken = '', body, query = {}, signal } = {}) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  })
  const url = params.size ? `${voucherApiPath}?${params.toString()}` : voucherApiPath
  const response = await fetch(url, {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = {}
  }
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || payload?.error || `Permintaan voucher gagal (${response.status}).`)
  }
  return unwrapApiData(payload) || {}
}

function getValue(source, camelKey, snakeKey, fallback = '') {
  if (source?.[camelKey] !== undefined && source?.[camelKey] !== null) return source[camelKey]
  if (source?.[snakeKey] !== undefined && source?.[snakeKey] !== null) return source[snakeKey]
  return fallback
}

function normalizeTargetItems(rawItems) {
  const parsed = Array.isArray(rawItems) ? rawItems : []
  return parsed
    .map((item) => {
      if (typeof item === 'string' || typeof item === 'number') return { type: '', id: String(item) }
      const rawType = String(item?.type || item?.itemType || item?.item_type || '').toLowerCase()
      const type = ['class', 'classes', 'course', 'courses'].includes(rawType)
        ? 'class'
        : ['product', 'products', 'digital', 'digital_product', 'digital_products'].includes(rawType)
          ? 'product'
          : ['prompt', 'prompts'].includes(rawType)
            ? 'prompt'
            : ['bundle', 'bundles', 'bundling'].includes(rawType)
              ? 'bundle'
              : rawType
      return {
        type,
        id: String(item?.id || item?.itemId || item?.item_id || ''),
      }
    })
    .filter((item) => item.id)
}

function normalizeScope(rawScope) {
  const scope = String(rawScope || 'all').toLowerCase()
  if (['class', 'course', 'courses', 'classes'].includes(scope)) return 'classes'
  if (['product', 'products', 'digital', 'digital_product', 'digital_products', 'digital-products'].includes(scope)) return 'products'
  if (['prompt', 'prompts'].includes(scope)) return 'prompts'
  if (['bundle', 'bundles', 'bundling'].includes(scope)) return 'bundles'
  return 'all'
}

function normalizeVoucher(voucher = {}) {
  return {
    id: String(voucher.id || voucher.voucherId || voucher.voucher_id || ''),
    code: String(voucher.code || '').toUpperCase(),
    name: String(voucher.name || voucher.title || ''),
    description: String(voucher.description || ''),
    discountType: String(getValue(voucher, 'discountType', 'discount_type', 'percent')),
    discountValue: Number(getValue(voucher, 'discountValue', 'discount_value', 0)) || 0,
    maxDiscount: Number(getValue(voucher, 'maxDiscount', 'max_discount', 0)) || 0,
    minimumSubtotal: Number(getValue(voucher, 'minimumSubtotal', 'minimum_subtotal', voucher.minSubtotal || voucher.min_subtotal || 0)) || 0,
    startsAt: String(getValue(voucher, 'startsAt', 'starts_at', '')),
    endsAt: String(getValue(voucher, 'endsAt', 'ends_at', '')),
    totalQuota: Number(getValue(voucher, 'totalQuota', 'total_quota', 0)) || 0,
    perUserQuota: Math.max(0, Number(getValue(voucher, 'perUserQuota', 'per_user_quota', voucher.perCustomerQuota ?? voucher.per_customer_quota ?? 1)) || 0),
    redeemedCount: Number(getValue(voucher, 'redeemedCount', 'redeemed_count', voucher.stats?.used || 0)) || 0,
    reservedCount: Math.max(0, Number(voucher.stats?.reserved) || 0),
    remainingQuota: voucher.stats?.remainingQuota === null || voucher.stats?.remainingQuota === undefined
      ? null
      : Math.max(0, Number(voucher.stats.remainingQuota) || 0),
    scope: normalizeScope(voucher.scope || voucher.targetScope || voucher.target_scope || voucher.targetType || voucher.target_type),
    targetItems: normalizeTargetItems(voucher.targetItems || voucher.target_items || voucher.eligibleItems || voucher.eligible_items || voucher.targets),
    combineWithSale: Boolean(getValue(voucher, 'combineWithSale', 'combine_with_sale', getValue(voucher, 'allowSaleItems', 'allow_sale_items', false))),
    combineWithBundle: Boolean(getValue(voucher, 'combineWithBundle', 'combine_with_bundle', getValue(voucher, 'allowBundles', 'allow_bundles', false))),
    status: String(voucher.status || (voucher.active === false ? 'paused' : 'active')).toLowerCase(),
    createdAt: String(getValue(voucher, 'createdAt', 'created_at', '')),
    updatedAt: String(getValue(voucher, 'updatedAt', 'updated_at', '')),
  }
}

function normalizeRedemption(redemption = {}) {
  return {
    id: String(redemption.id || redemption.redemptionId || redemption.redemption_id || ''),
    voucherCode: String(getValue(redemption, 'voucherCode', 'voucher_code', redemption.code || '-')),
    memberName: String(getValue(redemption, 'memberName', 'member_name', redemption.customerName || redemption.buyerName || 'Pembeli')),
    memberEmail: String(getValue(redemption, 'memberEmail', 'member_email', redemption.email || redemption.buyerEmail || '')),
    orderReference: String(getValue(redemption, 'orderReference', 'order_reference', redemption.orderRef || redemption.reference || '-')),
    orderType: String(getValue(redemption, 'orderType', 'order_type', redemption.itemType || 'Pesanan')),
    subtotal: Number(redemption.subtotal || 0),
    discountAmount: Number(getValue(redemption, 'discountAmount', 'discount_amount', 0)) || 0,
    finalTotal: Number(getValue(redemption, 'finalTotal', 'final_total', redemption.finalAmount || redemption.total || 0)) || 0,
    redeemedAt: String(getValue(redemption, 'redeemedAt', 'redeemed_at', redemption.usedAt || redemption.createdAt || redemption.created_at || '')),
    status: String(redemption.status || 'used').toLowerCase(),
  }
}

function createEmptyVoucher() {
  return {
    id: '',
    code: '',
    name: '',
    description: '',
    discountType: 'percent',
    discountValue: 10,
    maxDiscount: 0,
    minimumSubtotal: 0,
    startsAt: '',
    endsAt: '',
    totalQuota: 0,
    perUserQuota: 1,
    redeemedCount: 0,
    scope: 'all',
    targetItems: [],
    combineWithSale: false,
    combineWithBundle: false,
    status: 'active',
  }
}

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function toDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16)
}

function toApiDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function getVoucherState(voucher) {
  if (voucher.status === 'archived') return 'archived'
  if (['draft', 'paused', 'inactive', 'disabled'].includes(voucher.status)) return 'inactive'
  const now = Date.now()
  const startsAt = voucher.startsAt ? new Date(voucher.startsAt).getTime() : 0
  const endsAt = voucher.endsAt ? new Date(voucher.endsAt).getTime() : 0
  if (voucher.remainingQuota === 0 || (voucher.totalQuota > 0 && voucher.redeemedCount >= voucher.totalQuota)) return 'exhausted'
  if (startsAt && startsAt > now) return 'scheduled'
  if (endsAt && endsAt < now) return 'expired'
  return 'active'
}

const stateLabels = {
  active: 'Aktif',
  scheduled: 'Terjadwal',
  expired: 'Berakhir',
  exhausted: 'Kuota habis',
  inactive: 'Nonaktif',
  archived: 'Diarsipkan',
}

function VoucherAdminPanel({
  sessionToken = '',
  classes = [],
  digitalProducts = [],
  bundlePrograms = [],
  onNotify = () => {},
}) {
  const [vouchers, setVouchers] = useState([])
  const [redemptions, setRedemptions] = useState([])
  const [apiStats, setApiStats] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [editorError, setEditorError] = useState('')
  const [archiveError, setArchiveError] = useState('')
  const [view, setView] = useState('vouchers')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editor, setEditor] = useState(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pendingArchive, setPendingArchive] = useState(null)

  const loadVouchers = async ({ quiet = false, signal } = {}) => {
    if (!quiet) setIsLoading(true)
    setLoadError('')
    try {
      const payload = await requestVoucherApi({ sessionToken, signal, query: { includeRedemptions: 1 } })
      if (signal?.aborted) return
      setVouchers((Array.isArray(payload.vouchers) ? payload.vouchers : []).map(normalizeVoucher))
      setRedemptions((Array.isArray(payload.redemptions) ? payload.redemptions : []).map(normalizeRedemption))
      setApiStats(payload.stats && typeof payload.stats === 'object' ? payload.stats : {})
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') return
      setLoadError(error.message || 'Data voucher belum bisa dimuat.')
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => loadVouchers({ signal: controller.signal }), 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
    // sessionToken is the only credential-dependent input for this endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken])

  useEffect(() => {
    if (!feedback) return undefined
    const timer = window.setTimeout(() => setFeedback(''), 4200)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const catalog = useMemo(() => {
    const classItems = classes.map((item) => ({
      id: String(item.id),
      type: 'class',
      scope: 'classes',
      title: item.title || 'Kelas tanpa judul',
      thumbnail: item.thumbnail || item.image || '',
      price: Number(item.salePrice) || Number(item.price) || 0,
      active: item.status !== 'Draft' && item.status !== 'Nonaktif',
    }))
    const productItems = digitalProducts.map((item) => {
      const isPrompt = item.productType === 'prompt'
      return {
        id: String(item.id),
        type: isPrompt ? 'prompt' : 'product',
        scope: isPrompt ? 'prompts' : 'products',
        title: item.title || (isPrompt ? 'Prompt tanpa judul' : 'Produk tanpa judul'),
        thumbnail: item.thumbnail || item.image || '',
        price: Number(item.salePrice) || Number(item.price) || 0,
        active: item.status !== 'Draft' && item.status !== 'Nonaktif',
      }
    })
    const bundles = bundlePrograms.map((item) => ({
      id: String(item.id),
      type: 'bundle',
      scope: 'bundles',
      title: item.title || 'Bundling tanpa judul',
      thumbnail: item.thumbnail || '',
      price: Number(item.fixedPrice) || 0,
      active: item.active !== false,
    }))
    return [...classItems, ...productItems, ...bundles]
  }, [bundlePrograms, classes, digitalProducts])

  const computedStats = useMemo(() => {
    const available = vouchers.filter((voucher) => voucher.status !== 'archived')
    return {
      total: Number(apiStats.total ?? available.length) || 0,
      active: Number(apiStats.active ?? available.filter((voucher) => getVoucherState(voucher) === 'active').length) || 0,
      redemptions: Number(apiStats.redemptions ?? apiStats.totalRedemptions ?? apiStats.used ?? redemptions.filter((item) => item.status === 'used').length) || 0,
      discount: Number(apiStats.discount ?? apiStats.totalDiscount ?? apiStats.discountTotal ?? redemptions.filter((item) => item.status === 'used').reduce((total, item) => total + item.discountAmount, 0)) || 0,
    }
  }, [apiStats, redemptions, vouchers])

  const visibleVouchers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return vouchers
      .filter((voucher) => voucher.status !== 'archived')
      .filter((voucher) => statusFilter === 'all' || getVoucherState(voucher) === statusFilter)
      .filter((voucher) => !query || [voucher.code, voucher.name, voucher.description].some((value) => value.toLowerCase().includes(query)))
  }, [search, statusFilter, vouchers])

  const visibleRedemptions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return redemptions
      .filter((item) => item.status === 'used')
      .filter((item) => !query || [item.voucherCode, item.memberName, item.memberEmail, item.orderReference].some((value) => value.toLowerCase().includes(query)))
  }, [redemptions, search])

  const pickerItems = useMemo(() => {
    if (!editor || editor.scope === 'all') return []
    const query = pickerSearch.trim().toLowerCase()
    return catalog.filter((item) => item.scope === editor.scope && (!query || item.title.toLowerCase().includes(query)))
  }, [catalog, editor, pickerSearch])

  const openCreate = () => {
    setEditorError('')
    setEditor(createEmptyVoucher())
    setPickerSearch('')
  }

  const openEdit = (voucher) => {
    setEditorError('')
    setEditor({
      ...voucher,
      startsAt: toDateTimeInput(voucher.startsAt),
      endsAt: toDateTimeInput(voucher.endsAt),
      targetItems: voucher.targetItems.map((item) => ({ ...item })),
    })
    setPickerSearch('')
  }

  const updateEditor = (patch) => setEditor((current) => ({ ...current, ...patch }))

  const toggleTarget = (item) => {
    setEditor((current) => {
      const selected = current.targetItems.some((target) => target.type === item.type && String(target.id) === item.id)
      return {
        ...current,
        targetItems: selected
          ? current.targetItems.filter((target) => !(target.type === item.type && String(target.id) === item.id))
          : [...current.targetItems, { type: item.type, id: item.id }],
      }
    })
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!editor) return
    setEditorError('')
    const code = editor.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')
    if (code.length < 3) {
      setEditorError('Kode voucher minimal 3 karakter dan hanya boleh berisi huruf, angka, tanda - atau _.')
      return
    }
    if (!editor.name.trim()) {
      setEditorError('Nama promo wajib diisi agar mudah dikenali admin.')
      return
    }
    if (Number(editor.discountValue) <= 0 || (editor.discountType === 'percent' && Number(editor.discountValue) > 100)) {
      setEditorError('Isi nilai diskon yang valid. Diskon persen maksimal 100%.')
      return
    }
    if (editor.startsAt && editor.endsAt && new Date(editor.endsAt) <= new Date(editor.startsAt)) {
      setEditorError('Waktu berakhir harus setelah waktu mulai.')
      return
    }
    if (editor.scope !== 'all' && editor.targetItems.length === 0) {
      setEditorError('Pilih minimal satu item untuk target voucher ini.')
      return
    }

    const payload = {
      ...(editor.id ? { id: editor.id } : {}),
      code,
      name: editor.name.trim(),
      description: editor.description.trim(),
      discountType: editor.discountType,
      discountValue: Number(editor.discountValue),
      maxDiscount: editor.discountType === 'percent' ? Math.max(0, Number(editor.maxDiscount) || 0) : 0,
      minimumSubtotal: Math.max(0, Number(editor.minimumSubtotal) || 0),
      startsAt: toApiDate(editor.startsAt),
      endsAt: toApiDate(editor.endsAt),
      totalQuota: Math.max(0, Math.floor(Number(editor.totalQuota) || 0)),
      perUserQuota: Math.max(0, Math.floor(Number(editor.perUserQuota) || 0)),
      scope: editor.scope,
      targetItems: editor.scope === 'all' ? [] : editor.targetItems,
      combineWithSale: Boolean(editor.combineWithSale),
      combineWithBundle: editor.scope === 'bundles' ? true : Boolean(editor.combineWithBundle),
      status: ['draft', 'paused'].includes(editor.status) ? editor.status : 'active',
    }

    setIsSaving(true)
    try {
      await requestVoucherApi({
        method: editor.id ? 'PUT' : 'POST',
        sessionToken,
        body: payload,
      })
      setEditor(null)
      setFeedback(editor.id ? 'Perubahan voucher berhasil disimpan.' : 'Voucher baru berhasil dibuat.')
      onNotify(editor.id ? 'Voucher berhasil diperbarui.' : 'Voucher berhasil dibuat.')
      await loadVouchers({ quiet: true })
    } catch (error) {
      setEditorError(error.message || 'Voucher belum bisa disimpan.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleArchive = async () => {
    if (!pendingArchive) return
    setArchiveError('')
    setIsSaving(true)
    try {
      await requestVoucherApi({ method: 'DELETE', sessionToken, query: { id: pendingArchive.id } })
      setPendingArchive(null)
      setFeedback('Voucher diarsipkan. Riwayat pemakaiannya tetap tersimpan.')
      onNotify('Voucher berhasil diarsipkan.')
      await loadVouchers({ quiet: true })
    } catch (error) {
      setArchiveError(error.message || 'Voucher belum bisa diarsipkan.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="voucher-admin-panel">
      <header className="voucher-admin-hero">
        <div className="voucher-admin-hero-copy">
          <span className="voucher-admin-kicker"><Icon name="spark" /> Voucher & Promo</span>
          <h2>Buat promo yang tetap terukur</h2>
          <p>Atur kode diskon, target produk, periode, dan kuota. Sistem checkout akan memvalidasi semua aturan sebelum potongan diberikan.</p>
        </div>
        <button className="voucher-admin-create" type="button" onClick={openCreate}>
          <Icon name="plus" /> Buat Voucher
        </button>
        <span className="voucher-admin-hero-orb voucher-admin-hero-orb-one" />
        <span className="voucher-admin-hero-orb voucher-admin-hero-orb-two" />
      </header>

      <div className="voucher-stat-grid">
        <article><span className="voucher-stat-icon is-blue"><Icon name="certificate" /></span><div><small>Total voucher</small><strong>{computedStats.total}</strong><p>Promo tersimpan</p></div></article>
        <article><span className="voucher-stat-icon is-green"><Icon name="checkCircle" /></span><div><small>Sedang aktif</small><strong>{computedStats.active}</strong><p>Siap digunakan</p></div></article>
        <article><span className="voucher-stat-icon is-violet"><Icon name="users" /></span><div><small>Penukaran</small><strong>{computedStats.redemptions}</strong><p>Voucher terpakai</p></div></article>
        <article><span className="voucher-stat-icon is-orange"><Icon name="wallet" /></span><div><small>Total diskon</small><strong>{formatRupiah(computedStats.discount)}</strong><p>Nilai promo diberikan</p></div></article>
      </div>

      <section className="voucher-workspace">
        <div className="voucher-workspace-heading">
          <div className="voucher-view-tabs" role="tablist" aria-label="Data voucher">
            <button type="button" role="tab" aria-selected={view === 'vouchers'} className={view === 'vouchers' ? 'active' : ''} onClick={() => setView('vouchers')}>
              Daftar Voucher <span>{vouchers.filter((item) => item.status !== 'archived').length}</span>
            </button>
            <button type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>
              Riwayat Penukaran <span>{redemptions.length}</span>
            </button>
          </div>
          <button className="voucher-refresh-button" type="button" onClick={() => loadVouchers()} disabled={isLoading}>
            <Icon name="redo" /> {isLoading ? 'Memuat...' : 'Muat ulang'}
          </button>
        </div>

        <div className="voucher-toolbar">
          <label className="voucher-search-field">
            <Icon name="search" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={view === 'vouchers' ? 'Cari kode atau nama promo...' : 'Cari kode, member, atau pesanan...'} />
            {search && <button type="button" aria-label="Hapus pencarian" onClick={() => setSearch('')}><Icon name="x" /></button>}
          </label>
          {view === 'vouchers' && (
            <label className="voucher-filter-field">
              <Icon name="filter" />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter status voucher">
                {statusFilters.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
          )}
        </div>

        {feedback && <div className="voucher-feedback" role="status"><Icon name="checkCircle" /> {feedback}</div>}
        {loadError && <div className="voucher-load-error" role="alert"><Icon name="shield" /><div><strong>Data voucher belum bisa dimuat</strong><p>{loadError}</p></div><button type="button" onClick={() => loadVouchers()}>Coba lagi</button></div>}

        {view === 'vouchers' ? (
          <div className="voucher-table" role="table" aria-label="Daftar voucher">
            <div className="voucher-table-head" role="row">
              <span role="columnheader">Voucher</span><span role="columnheader">Potongan</span><span role="columnheader">Periode</span><span role="columnheader">Pemakaian</span><span role="columnheader">Status</span><span role="columnheader">Aksi</span>
            </div>
            {visibleVouchers.map((voucher) => {
              const state = getVoucherState(voucher)
              const scope = scopeOptions.find((item) => item.id === voucher.scope)
              const committedQuota = voucher.redeemedCount + voucher.reservedCount
              const quotaPercent = voucher.totalQuota > 0 ? Math.min(100, (committedQuota / voucher.totalQuota) * 100) : 0
              return (
                <article className="voucher-table-row" role="row" key={voucher.id || voucher.code}>
                  <div className="voucher-main-cell" role="cell" data-label="Voucher">
                    <span className="voucher-code">{voucher.code}</span>
                    <div><strong>{voucher.name || 'Promo tanpa nama'}</strong><small><Icon name={scope?.icon || 'target'} /> {scope?.label || 'Semua item'}</small></div>
                  </div>
                  <div className="voucher-value-cell" role="cell" data-label="Potongan">
                    <strong>{voucher.discountType === 'percent' ? `${voucher.discountValue}%` : formatRupiah(voucher.discountValue)}</strong>
                    <small>{voucher.discountType === 'percent' && voucher.maxDiscount > 0 ? `Maks. ${formatRupiah(voucher.maxDiscount)}` : `Min. ${formatRupiah(voucher.minimumSubtotal)}`}</small>
                  </div>
                  <div className="voucher-date-cell" role="cell" data-label="Periode">
                    <span><Icon name="calendar" /> {voucher.startsAt ? formatDateTime(voucher.startsAt) : 'Mulai sekarang'}</span>
                    <small>sampai {voucher.endsAt ? formatDateTime(voucher.endsAt) : 'tanpa batas'}</small>
                  </div>
                  <div className="voucher-quota-cell" role="cell" data-label="Pemakaian">
                    <span><strong>{committedQuota}</strong> / {voucher.totalQuota > 0 ? voucher.totalQuota : 'Tanpa batas'}</span>
                    <i><b style={{ width: `${voucher.totalQuota > 0 ? quotaPercent : 0}%` }} /></i>
                    <small>{voucher.redeemedCount} terpakai{voucher.reservedCount > 0 ? ` · ${voucher.reservedCount} menunggu bayar` : ''} · {voucher.perUserQuota > 0 ? `maks. ${voucher.perUserQuota}x per member` : 'tanpa batas per member'}</small>
                  </div>
                  <div role="cell" data-label="Status"><mark className={`voucher-status is-${state}`}><i />{stateLabels[state]}</mark></div>
                  <div className="voucher-row-actions" role="cell" data-label="Aksi">
                    <button type="button" onClick={() => openEdit(voucher)}><Icon name="edit" /><span>Edit</span></button>
                    <button className="danger" type="button" onClick={() => { setArchiveError(''); setPendingArchive(voucher) }}><Icon name="trash" /><span>Arsip</span></button>
                  </div>
                </article>
              )
            })}
            {!isLoading && !loadError && visibleVouchers.length === 0 && (
              <div className="voucher-empty-state">
                <span><Icon name="certificate" /></span>
                <h3>{search || statusFilter !== 'all' ? 'Voucher tidak ditemukan' : 'Belum ada voucher'}</h3>
                <p>{search || statusFilter !== 'all' ? 'Ubah kata pencarian atau filter status.' : 'Buat voucher pertama untuk mulai menjalankan promo.'}</p>
                {!search && statusFilter === 'all' && <button type="button" onClick={openCreate}><Icon name="plus" /> Buat Voucher</button>}
              </div>
            )}
            {isLoading && <div className="voucher-loading"><span /><span /><span /></div>}
          </div>
        ) : (
          <div className="voucher-history-table" role="table" aria-label="Riwayat penukaran voucher">
            <div className="voucher-history-head" role="row">
              <span role="columnheader">Waktu</span><span role="columnheader">Voucher</span><span role="columnheader">Member</span><span role="columnheader">Pesanan</span><span role="columnheader">Diskon</span><span role="columnheader">Total bayar</span>
            </div>
            {visibleRedemptions.map((item) => (
              <article className="voucher-history-row" role="row" key={item.id || `${item.orderReference}-${item.voucherCode}`}>
                <span role="cell" data-label="Waktu"><strong>{formatDateTime(item.redeemedAt)}</strong></span>
                <span role="cell" data-label="Voucher"><b className="voucher-code small">{item.voucherCode}</b></span>
                <span role="cell" data-label="Member"><strong>{item.memberName}</strong><small>{item.memberEmail || '-'}</small></span>
                <span role="cell" data-label="Pesanan"><strong>{item.orderReference}</strong><small>{item.orderType}</small></span>
                <span role="cell" data-label="Diskon"><strong className="voucher-discount-amount">-{formatRupiah(item.discountAmount)}</strong><small>dari {formatRupiah(item.subtotal)}</small></span>
                <span role="cell" data-label="Total bayar"><strong>{formatRupiah(item.finalTotal)}</strong></span>
              </article>
            ))}
            {!isLoading && !loadError && visibleRedemptions.length === 0 && <div className="voucher-empty-state"><span><Icon name="clock" /></span><h3>Belum ada penukaran</h3><p>Riwayat akan muncul setelah voucher berhasil dipakai pada pembayaran.</p></div>}
            {isLoading && <div className="voucher-loading"><span /><span /><span /></div>}
          </div>
        )}
      </section>

      {editor && (
        <div className="voucher-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !isSaving && setEditor(null)}>
          <form className="voucher-editor" role="dialog" aria-modal="true" aria-labelledby="voucher-editor-title" onSubmit={handleSave}>
            <header className="voucher-editor-heading">
              <div><span className="voucher-admin-kicker"><Icon name="certificate" /> {editor.id ? 'Edit voucher' : 'Voucher baru'}</span><h2 id="voucher-editor-title">{editor.id ? `Atur ${editor.code}` : 'Buat voucher promo'}</h2><p>Lengkapi aturan berikut. Validasi akhir tetap dilakukan oleh server saat checkout.</p></div>
              <button type="button" aria-label="Tutup editor voucher" disabled={isSaving} onClick={() => setEditor(null)}><Icon name="x" /></button>
            </header>

            {editorError && <div className="voucher-modal-error" role="alert"><Icon name="shield" /><span>{editorError}</span></div>}

            <div className="voucher-editor-scroll">
              <section className="voucher-form-section">
                <div className="voucher-form-section-title"><span>1</span><div><h3>Identitas promo</h3><p>Kode ini dimasukkan pembeli pada halaman checkout.</p></div></div>
                <div className="voucher-form-grid">
                  <label><span>Kode voucher</span><div className="voucher-code-input"><input value={editor.code} maxLength="32" disabled={Boolean(editor.id)} onChange={(event) => updateEditor({ code: event.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="HEMAT20" required /><small>{editor.code.length}/32</small></div><small>{editor.id ? 'Kode dikunci setelah voucher dibuat agar histori tetap konsisten.' : 'Huruf kapital, angka, tanda - atau _.'}</small></label>
                  <label><span>Nama promo</span><input value={editor.name} onChange={(event) => updateEditor({ name: event.target.value })} placeholder="Promo member baru" required /></label>
                  <label className="voucher-full-field"><span>Catatan internal <i>opsional</i></span><textarea value={editor.description} onChange={(event) => updateEditor({ description: event.target.value })} placeholder="Tujuan atau catatan promo untuk admin..." /></label>
                </div>
              </section>

              <section className="voucher-form-section">
                <div className="voucher-form-section-title"><span>2</span><div><h3>Nilai & minimum belanja</h3><p>Pilih potongan persen atau nominal rupiah.</p></div></div>
                <div className="voucher-discount-type-tabs">
                  <button type="button" className={editor.discountType === 'percent' ? 'active' : ''} onClick={() => updateEditor({ discountType: 'percent' })}><strong>%</strong><span>Diskon persen<small>Cocok untuk promo fleksibel</small></span></button>
                  <button type="button" className={editor.discountType === 'fixed' ? 'active' : ''} onClick={() => updateEditor({ discountType: 'fixed' })}><Icon name="wallet" /><span>Potongan nominal<small>Potongan rupiah tetap</small></span></button>
                </div>
                <div className="voucher-form-grid voucher-pricing-grid">
                  <label><span>{editor.discountType === 'percent' ? 'Persentase diskon' : 'Nominal potongan'}</span><div className="voucher-number-input"><b>{editor.discountType === 'percent' ? '%' : 'Rp'}</b><input type="number" min="1" max={editor.discountType === 'percent' ? '100' : undefined} value={editor.discountValue} onChange={(event) => updateEditor({ discountValue: event.target.value })} required /></div></label>
                  {editor.discountType === 'percent' && <label><span>Batas maksimal diskon</span><div className="voucher-number-input"><b>Rp</b><input type="number" min="0" value={editor.maxDiscount} onChange={(event) => updateEditor({ maxDiscount: event.target.value })} /></div><small>Isi 0 jika tanpa batas.</small></label>}
                  <label><span>Minimum subtotal</span><div className="voucher-number-input"><b>Rp</b><input type="number" min="0" value={editor.minimumSubtotal} onChange={(event) => updateEditor({ minimumSubtotal: event.target.value })} /></div><small>Dihitung sebelum biaya layanan.</small></label>
                </div>
              </section>

              <section className="voucher-form-section">
                <div className="voucher-form-section-title"><span>3</span><div><h3>Periode & kuota</h3><p>Batasi waktu dan jumlah penukaran untuk mengontrol anggaran promo.</p></div></div>
                <div className="voucher-form-grid">
                  <label><span>Mulai berlaku <i>opsional</i></span><input type="datetime-local" value={editor.startsAt} onChange={(event) => updateEditor({ startsAt: event.target.value })} /><small>Kosongkan agar aktif setelah disimpan.</small></label>
                  <label><span>Berakhir <i>opsional</i></span><input type="datetime-local" value={editor.endsAt} min={editor.startsAt || undefined} onChange={(event) => updateEditor({ endsAt: event.target.value })} /><small>Kosongkan jika tanpa tanggal akhir.</small></label>
                  <label><span>Total kuota</span><input type="number" min="0" step="1" value={editor.totalQuota} onChange={(event) => updateEditor({ totalQuota: event.target.value })} /><small>Isi 0 untuk tanpa batas total.</small></label>
                  <label><span>Kuota per member</span><input type="number" min="0" step="1" value={editor.perUserQuota} onChange={(event) => updateEditor({ perUserQuota: event.target.value })} /><small>Isi 0 untuk tanpa batas; rekomendasi 1 kali per akun/email.</small></label>
                </div>
              </section>

              <section className="voucher-form-section">
                <div className="voucher-form-section-title"><span>4</span><div><h3>Target voucher</h3><p>Tentukan jenis item yang menerima potongan.</p></div><strong>{editor.scope === 'all' ? 'Semua' : `${editor.targetItems.length} dipilih`}</strong></div>
                <div className="voucher-scope-grid">
                  {scopeOptions.map((option) => <button type="button" className={editor.scope === option.id ? 'active' : ''} onClick={() => { if (editor.scope !== option.id) updateEditor({ scope: option.id, targetItems: [] }) }} key={option.id}><span><Icon name={option.icon} /></span><strong>{option.label}</strong><small>{option.description}</small><i>{editor.scope === option.id && <Icon name="checkCircle" />}</i></button>)}
                </div>
                {editor.scope !== 'all' && (
                  <div className="voucher-item-picker">
                    <div className="voucher-item-picker-head"><label><Icon name="search" /><input type="search" value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder={`Cari ${scopeOptions.find((option) => option.id === editor.scope)?.label.toLowerCase()}...`} /></label><span>{editor.targetItems.length} dipilih</span></div>
                    <div className="voucher-item-picker-list">
                      {pickerItems.map((item) => {
                        const selected = editor.targetItems.some((target) => target.type === item.type && String(target.id) === item.id)
                        return <button type="button" className={selected ? 'selected' : ''} disabled={!item.active && !selected} onClick={() => toggleTarget(item)} key={`${item.type}:${item.id}`}><span>{item.thumbnail ? <img src={item.thumbnail} alt="" /> : <Icon name={item.scope === 'classes' ? 'bookOpen' : item.scope === 'prompts' ? 'spark' : item.scope === 'bundles' ? 'bundle' : 'download'} />}</span><p><strong>{item.title}</strong><small>{formatRupiah(item.price)}{!item.active ? ' - Nonaktif' : ''}</small></p><i><Icon name={selected ? 'checkCircle' : 'plus'} /></i></button>
                      })}
                      {!pickerItems.length && <div className="voucher-picker-empty"><Icon name="search" /><p>Tidak ada item yang cocok atau katalog masih kosong.</p></div>}
                    </div>
                  </div>
                )}
              </section>

              <section className="voucher-form-section">
                <div className="voucher-form-section-title"><span>5</span><div><h3>Aturan kombinasi & status</h3><p>Tentukan apakah voucher boleh menumpuk dengan diskon lain.</p></div></div>
                <div className="voucher-switch-list">
                  <label><input type="checkbox" checked={editor.combineWithSale} onChange={(event) => updateEditor({ combineWithSale: event.target.checked })} /><i /><span><strong>Boleh untuk item yang sedang diskon</strong><small>Potongan voucher dihitung dari harga jual aktif.</small></span></label>
                  <label className={editor.scope === 'bundles' ? 'is-locked' : ''}><input type="checkbox" checked={editor.scope === 'bundles' || editor.combineWithBundle} disabled={editor.scope === 'bundles'} onChange={(event) => updateEditor({ combineWithBundle: event.target.checked })} /><i /><span><strong>Boleh digabung dengan harga bundling</strong><small>{editor.scope === 'bundles' ? 'Wajib aktif karena target voucher adalah bundling.' : 'Aktifkan hanya jika margin paket masih aman.'}</small></span></label>
                  <label><input type="checkbox" checked={editor.status === 'active'} onChange={(event) => updateEditor({ status: event.target.checked ? 'active' : 'paused' })} /><i /><span><strong>Voucher aktif</strong><small>Voucher tetap mengikuti tanggal mulai, akhir, dan kuota.</small></span></label>
                </div>
              </section>
            </div>

            <footer className="voucher-editor-actions">
              <div><Icon name="shield" /><span><strong>Validasi aman di server</strong><small>Kode tidak dapat dipakai jika salah satu aturan gagal.</small></span></div>
              <span><button type="button" disabled={isSaving} onClick={() => setEditor(null)}>Batal</button><button className="primary" type="submit" disabled={isSaving}><Icon name="checkCircle" /> {isSaving ? 'Menyimpan...' : editor.id ? 'Simpan Perubahan' : 'Buat Voucher'}</button></span>
            </footer>
          </form>
        </div>
      )}

      {pendingArchive && (
        <div className="voucher-modal-backdrop is-confirm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !isSaving && setPendingArchive(null)}>
          <section className="voucher-archive-dialog" role="dialog" aria-modal="true" aria-labelledby="voucher-archive-title">
            <span className="voucher-archive-icon"><Icon name="trash" /></span>
            <h2 id="voucher-archive-title">Arsipkan {pendingArchive.code}?</h2>
            <p>Voucher tidak dapat dipakai lagi, tetapi riwayat penukaran dan laporan transaksi tetap tersimpan.</p>
            {archiveError && <div className="voucher-modal-error" role="alert"><Icon name="shield" /><span>{archiveError}</span></div>}
            <div><button type="button" disabled={isSaving} onClick={() => setPendingArchive(null)}>Batal</button><button className="danger" type="button" disabled={isSaving} onClick={handleArchive}>{isSaving ? 'Mengarsipkan...' : 'Ya, Arsipkan'}</button></div>
          </section>
        </div>
      )}
    </section>
  )
}

export default VoucherAdminPanel
