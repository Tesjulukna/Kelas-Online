import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { accountRowStatus, accountSheetPage } from '../utils/accountSheetView'

const statusLabel = value => ({ active: 'Aktif', expired: 'Kedaluwarsa', available: 'Tersedia', tersedia: 'Tersedia', disabled: 'Nonaktif', nonaktif: 'Nonaktif', sold: 'Terjual', terjual: 'Terjual', reserved: 'Menunggu pembayaran', external_sold: 'Terjual' })[value] || value

export default function AccountSheetEditor({ spreadsheet, tab, onRequest, onBusyChange, kind = 'account' }) {
  const automatic = kind === 'auto_account'
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState([])
  const [showPassword, setShowPassword] = useState(false)
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [pageSize, setPageSize] = useState(20)
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!isModalOpen) return undefined
    const dialog = dialogRef.current
    dialog.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { dialog.close(); document.body.style.overflow = previousOverflow }
  }, [isModalOpen])

  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => {
      setBusy(true)
      setMessage('Memuat data Spreadsheet...')
      setData(null)
      setEditing(null)
      setShowPassword(false)
      setPage(0)
      onRequest({ action: 'rows', spreadsheet, tab, kind })
        .then(result => { if (current) { setData(result); setMessage('') } })
        .catch(error => { if (current) setMessage(error.message || 'Data belum dapat dimuat.') })
        .finally(() => { if (current) setBusy(false) })
    }, 0)
    return () => { current = false; window.clearTimeout(timer) }
  }, [spreadsheet, tab, onRequest, refresh, kind])

  const rows = (data?.values || []).slice(1).filter(row => row.some(value => String(value).trim()))
  const result = accountSheetPage(rows, data?.stockStatuses, { query, status: filterStatus, page, pageSize })
  const visible = isModalOpen ? result.rows : rows.slice(0, 5)
  const navigationDisabled = busy || Boolean(editing)
  const pageStart = Math.max(0, Math.min(result.page - 2, result.pages - 5))
  const save = async () => {
    if (busy || !editing) return
    setBusy(true)
    onBusyChange(true)
    setMessage('Menyimpan perubahan ke Spreadsheet...')
    try {
      const result = await onRequest({ action: 'update_row', spreadsheet, tab, original: editing, updated: draft })
      setData(result)
      setEditing(null)
      setShowPassword(false)
      setMessage(result.message)
    } catch (error) { setMessage(error.message || 'Perubahan belum dapat disimpan.') }
    finally { setBusy(false); onBusyChange(false) }
  }

  const table = (
        <div className="account-sheet-table-scroll">
          <table className="account-sheet-table">
            <thead><tr>{['ID Akun', automatic ? 'Nama' : 'Email / Username', automatic ? 'Token' : 'Password', 'Status', 'ID Pesanan', 'Email Pembeli', ...(automatic ? ['Dibuat', 'Berlaku sampai'] : []), 'Aksi'].map(label => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>{visible.map((raw, index) => {
              const row = Array.from({ length: 6 }, (_, cell) => String(raw[cell] ?? ''))
              const status = accountRowStatus(row, data?.stockStatuses)
              const locked = automatic || ['sold', 'terjual', 'reserved', 'external_sold'].includes(status) || Boolean(row[4] || row[5])
              const active = editing === raw
              return <tr key={`${page}:${index}`}>
                <td>{row[0]}</td>
                <td>{active ? <input aria-label="Email atau username akun" value={draft[1]} disabled={busy} onChange={event => setDraft(value => value.map((cell, i) => i === 1 ? event.target.value : cell))} /> : row[1]}</td>
                <td>{active ? <>
                  <input aria-label="Password akun" autoComplete="new-password" type={showPassword ? 'text' : 'password'} value={draft[2]} disabled={busy} onChange={event => setDraft(value => value.map((cell, i) => i === 2 ? event.target.value : cell))} />
                  <button type="button" className="text-action" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Sembunyikan' : 'Lihat Password'}</button>
                </> : showPassword ? row[2] : '••••••••'}</td>
                <td>{active ? <select aria-label="Status akun" value={draft[3]} disabled={busy} onChange={event => setDraft(value => value.map((cell, i) => i === 3 ? event.target.value : cell))}><option value="available">Tersedia</option><option value="disabled">Nonaktif</option></select> : statusLabel(status)}</td>
                <td>{row[4] || '—'}</td><td>{row[5] || '—'}</td>
                {automatic && <><td>{raw[6] || '—'}</td><td>{raw[7] || 'Tanpa batas waktu'}</td></>}
                <td>{active ? <div className="account-sheet-row-actions">
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>Simpan Baris</button>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setEditing(null); setShowPassword(false) }}>Batal</button>
                </div> : locked ? <small>{status === 'reserved' ? 'Sedang dipesan' : 'Data pembelian terkunci'}</small> : <button type="button" className="btn btn-secondary" disabled={busy || Boolean(editing)} onClick={() => { setEditing(raw); setDraft([...row.slice(0, 3), status === 'disabled' ? 'disabled' : 'available', '', '']); setShowPassword(false) }}>Edit</button>}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
  )

  const actions = <div className="account-sheet-row-actions">
    <button className="btn btn-secondary" type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Sembunyikan' : automatic ? 'Lihat Token' : 'Lihat Password'}</button>
    <button className="btn btn-secondary" type="button" disabled={navigationDisabled} onClick={() => setRefresh(value => value + 1)}>Muat Ulang</button>
  </div>

  return (
    <section className="account-sheet-editor">
      <div className="account-sheet-editor-heading">
        <h3>Data Spreadsheet</h3>
        <button className="btn btn-primary" type="button" disabled={!data || navigationDisabled} onClick={() => { setIsModalOpen(true); setShowPassword(false) }}>Lihat Semua ({rows.length})</button>
      </div>
      {!isModalOpen && message && <p className="account-sheet-status" role="status">{message}</p>}
      {data && <>
        <small>Preview {Math.min(5, rows.length)} dari {rows.length} akun pada tab {tab}.</small>
        {!isModalOpen && <>{actions}{table}</>}
        {!rows.length && <p>Tab ini belum memiliki data akun.</p>}
      </>}
      {isModalOpen && createPortal(
        <dialog ref={dialogRef} className="account-sheet-dialog" aria-labelledby="account-sheet-dialog-title"
          onCancel={event => { event.preventDefault(); if (!navigationDisabled) { setIsModalOpen(false); setShowPassword(false) } }}>
          <div className="account-sheet-dialog-heading">
            <div><h2 id="account-sheet-dialog-title">Daftar Akun Spreadsheet</h2><small>Tab {tab} · {rows.length} akun</small></div>
            <button className="btn btn-secondary" type="button" disabled={navigationDisabled} onClick={() => { setIsModalOpen(false); setShowPassword(false) }}>Tutup</button>
          </div>
          <div className="account-sheet-filters">
            <label>Pencarian<input type="search" value={query} disabled={navigationDisabled} placeholder="ID akun, username, pesanan, email pembeli" onChange={event => { setQuery(event.target.value); setPage(0) }} /></label>
            <label>Filter status<select value={filterStatus} disabled={navigationDisabled} onChange={event => { setFilterStatus(event.target.value); setPage(0) }}><option value="all">Semua Status</option>{automatic ? <option value="active">Aktif</option> : <><option value="available">Tersedia</option><option value="reserved">Menunggu Pembayaran</option><option value="sold">Terjual</option></>}<option value="disabled">Nonaktif</option></select></label>
            <label>Akun per halaman<select value={pageSize} disabled={navigationDisabled} onChange={event => { setPageSize(Number(event.target.value)); setPage(0) }}><option value={20}>20</option><option value={50}>50</option></select></label>
          </div>
          {actions}
          {message && <p className="account-sheet-status" role="status">{message}</p>}
          {editing && <small>Simpan atau batalkan edit baris sebelum berpindah halaman atau menutup popup.</small>}
          <small>{result.total} akun sesuai pencarian dan filter.</small>
          {table}
          {!result.total && <p>Tidak ada akun yang cocok.</p>}
          <nav className="account-sheet-pagination" aria-label="Halaman daftar akun">
            <button className="btn btn-secondary" type="button" disabled={navigationDisabled || result.page === 0} onClick={() => setPage(result.page - 1)}>Sebelumnya</button>
            {pageStart > 0 && <><button className="btn btn-secondary" type="button" disabled={navigationDisabled} onClick={() => setPage(0)}>1</button><span>…</span></>}
            {Array.from({ length: Math.min(5, result.pages) }, (_, index) => pageStart + index).map(number => <button className={`btn ${number === result.page ? 'btn-primary' : 'btn-secondary'}`} type="button" key={number} aria-current={number === result.page ? 'page' : undefined} disabled={navigationDisabled} onClick={() => setPage(number)}>{number + 1}</button>)}
            {pageStart + 5 < result.pages && <><span>…</span><button className="btn btn-secondary" type="button" disabled={navigationDisabled} onClick={() => setPage(result.pages - 1)}>{result.pages}</button></>}
            <button className="btn btn-secondary" type="button" disabled={navigationDisabled || result.page + 1 >= result.pages} onClick={() => setPage(result.page + 1)}>Berikutnya</button>
          </nav>
        </dialog>, document.body)}
    </section>
  )
}
