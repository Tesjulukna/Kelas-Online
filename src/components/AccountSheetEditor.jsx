import { useEffect, useState } from 'react'

const statusLabel = value => ({ available: 'Tersedia', tersedia: 'Tersedia', disabled: 'Nonaktif', nonaktif: 'Nonaktif', sold: 'Terjual', terjual: 'Terjual', reserved: 'Menunggu pembayaran', external_sold: 'Terjual' })[value] || value

export default function AccountSheetEditor({ spreadsheet, tab, onRequest, onBusyChange }) {
  const [data, setData] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState([])
  const [showPassword, setShowPassword] = useState(false)
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => {
      setBusy(true)
      setMessage('Memuat data Spreadsheet...')
      setData(null)
      setEditing(null)
      setShowPassword(false)
      setPage(0)
      onRequest({ action: 'rows', spreadsheet, tab })
        .then(result => { if (current) { setData(result); setMessage('') } })
        .catch(error => { if (current) setMessage(error.message || 'Data belum dapat dimuat.') })
        .finally(() => { if (current) setBusy(false) })
    }, 0)
    return () => { current = false; window.clearTimeout(timer) }
  }, [spreadsheet, tab, onRequest, refresh])

  const rows = (data?.values || []).slice(1).filter(row => row.some(value => String(value).trim()))
  const pages = Math.max(1, Math.ceil(rows.length / 20))
  const visible = rows.slice(page * 20, page * 20 + 20)
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

  return (
    <section className="account-sheet-editor">
      <div className="account-sheet-editor-heading">
        <h3>Data Spreadsheet</h3>
        <button className="btn btn-secondary" type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Sembunyikan Password' : 'Lihat Password'}</button>
        <button className="btn btn-secondary" type="button" disabled={busy || Boolean(editing)} onClick={() => setRefresh(value => value + 1)}>Muat Ulang</button>
      </div>
      {message && <p className="account-sheet-status" role="status">{message}</p>}
      {data && <>
        <small>{rows.length} akun pada tab {tab}. Perubahan baris langsung disimpan ke Spreadsheet.</small>
        <div className="account-sheet-table-scroll">
          <table className="account-sheet-table">
            <thead><tr>{['ID Akun', 'Email / Username', 'Password', 'Status', 'ID Pesanan', 'Email Pembeli', 'Aksi'].map(label => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>{visible.map((raw, index) => {
              const row = Array.from({ length: 6 }, (_, cell) => String(raw[cell] ?? ''))
              const localStatus = data.stockStatuses?.[row[0].trim()]
              const status = localStatus || row[3].trim().toLowerCase() || 'available'
              const locked = ['sold', 'terjual', 'reserved', 'external_sold'].includes(status) || Boolean(row[4] || row[5])
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
                <td>{active ? <div className="account-sheet-row-actions">
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>Simpan Baris</button>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setEditing(null); setShowPassword(false) }}>Batal</button>
                </div> : locked ? <small>{status === 'reserved' ? 'Sedang dipesan' : 'Data pembelian terkunci'}</small> : <button type="button" className="btn btn-secondary" disabled={busy || Boolean(editing)} onClick={() => { setEditing(raw); setDraft([...row.slice(0, 3), ['disabled', 'nonaktif'].includes(row[3]) ? 'disabled' : 'available', '', '']); setShowPassword(false) }}>Edit</button>}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
        {!rows.length && <p>Tab ini belum memiliki data akun.</p>}
        {pages > 1 && <div className="account-sheet-row-actions"><button type="button" className="btn btn-secondary" disabled={page === 0 || Boolean(editing)} onClick={() => setPage(value => value - 1)}>Sebelumnya</button><span>{page + 1} / {pages}</span><button type="button" className="btn btn-secondary" disabled={page + 1 >= pages || Boolean(editing)} onClick={() => setPage(value => value + 1)}>Berikutnya</button></div>}
      </>}
    </section>
  )
}
