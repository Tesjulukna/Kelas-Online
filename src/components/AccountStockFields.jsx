import { useEffect, useRef, useState } from 'react'

export default function AccountStockFields({ form, productId, onChange, onDetect, onSync, onBusyChange }) {
  const [tabs, setTabs] = useState([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const requestRef = useRef(0)
  const detectedRef = useRef('')
  const busyRef = useRef(false)

  useEffect(() => () => { requestRef.current += 1 }, [])

  const detect = async () => {
    const spreadsheet = form.accountSpreadsheetId.trim()
    if (!spreadsheet || busyRef.current || detectedRef.current === spreadsheet) return
    const request = ++requestRef.current
    busyRef.current = true
    setBusy(true)
    onBusyChange(true)
    setStatus('Mendeteksi tab Spreadsheet...')
    try {
      const result = await onDetect(spreadsheet)
      if (request !== requestRef.current) return
      const nextTabs = result.tabs || []
      setTabs(nextTabs)
      detectedRef.current = result.spreadsheetId
      onChange({ accountSpreadsheetId: result.spreadsheetId,
        accountSheetTab: nextTabs.some((tab) => tab.title === form.accountSheetTab)
          ? form.accountSheetTab : nextTabs.length === 1 ? nextTabs[0].title : '' })
      setStatus(`${result.title || 'Spreadsheet'}: ${nextTabs.length} tab ditemukan.`)
    } catch (error) {
      if (request === requestRef.current) setStatus(error.message || 'Tab belum dapat dideteksi. Periksa koneksi Google Sheets di server.')
    } finally {
      if (request === requestRef.current) { busyRef.current = false; setBusy(false); onBusyChange(false) }
    }
  }

  const sync = async () => {
    if (!productId || busyRef.current) return
    const request = ++requestRef.current
    busyRef.current = true
    setBusy(true)
    onBusyChange(true)
    setStatus('Menyinkronkan stok...')
    try {
      const result = await onSync(productId)
      if (request !== requestRef.current) return
      const saved = result.digitalProducts?.find((product) => product.id === productId)
      if (saved) onChange({ itemQuantity: saved.itemQuantity, accountStockSyncedAt: saved.accountStockSyncedAt })
      setStatus(result.message)
    } catch (error) {
      if (request === requestRef.current) setStatus(error.message)
    } finally {
      if (request === requestRef.current) { busyRef.current = false; setBusy(false); onBusyChange(false) }
    }
  }

  return (
    <div className="digital-platform-box account-sheet-box">
      <h3>Stok akun dari Google Spreadsheet</h3>
      <p>Satu baris untuk satu akun. Detail akun dikirim ke email pembeli setelah pembayaran sukses.</p>
      <label>
        Link atau ID Spreadsheet
        <input type="text" value={form.accountSpreadsheetId} disabled={busy}
          placeholder="https://docs.google.com/spreadsheets/d/..." onBlur={detect}
          onChange={(event) => {
            requestRef.current += 1
            detectedRef.current = ''
            setTabs([])
            setStatus('')
            onChange({ accountSpreadsheetId: event.target.value, accountSheetTab: '' })
          }} />
      </label>
      <button className="btn btn-secondary" type="button" disabled={busy || !form.accountSpreadsheetId}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { detectedRef.current = ''; detect() }}>
        {busy ? 'Menghubungkan Google Sheets...' : 'Deteksi Tab Spreadsheet'}
      </button>
      {status && <p className="account-sheet-status" role="status" aria-live="polite">{status}</p>}
      <label>
        Tab stok akun
        <select value={form.accountSheetTab} disabled={busy} onChange={(event) => onChange({ accountSheetTab: event.target.value })}>
          <option value="">Pilih tab hasil deteksi</option>
          {form.accountSheetTab && !tabs.some((tab) => tab.title === form.accountSheetTab) && (
            <option value={form.accountSheetTab}>{form.accountSheetTab}</option>
          )}
          {tabs.map((tab) => <option key={tab.id} value={tab.title}>{tab.title}</option>)}
        </select>
      </label>
      <p>Kolom A–F: <code>id, username, password, status, order_id, buyer_email</code>. Isi status <code>available</code> untuk akun siap jual.</p>
      <a href="/templates/account-stock.csv" download>Unduh template stok akun</a>
      <small>Gunakan Spreadsheet milik akun Google yang men-deploy GAS. URL GAS dan kunci koneksi diatur di hosting.</small>
      {productId && <button className="btn btn-secondary" type="button" disabled={busy} onClick={sync}>Sinkronkan Stok Tersimpan</button>}
      <small>Simpan produk untuk memakai perubahan sumber. Penambahan baris stok masuk setelah sinkronisasi.</small>
      {form.accountStockSyncedAt && <small>Sinkronisasi terakhir: {form.accountStockSyncedAt}</small>}
    </div>
  )
}
