import Icon from './Icon'
import './VoucherCodeField.css'

function VoucherCodeField({
  id = 'checkout-voucher-code',
  code = '',
  result = null,
  status = '',
  isLoading = false,
  disabled = false,
  onCodeChange = () => {},
  onApply = () => {},
  onRemove = () => {},
}) {
  const isApplied = result?.valid === true
  const appliedCode = String(result?.voucher?.code || code || '').trim().toUpperCase()

  const handleKeyDown = (event) => {
    if (event.key !== 'Enter' || isApplied || isLoading || disabled) return

    event.preventDefault()
    onApply()
  }

  if (isApplied) {
    return (
      <div className="voucher-code-field is-applied" aria-live="polite">
        <div className="voucher-code-heading">
          <span className="voucher-code-heading-icon" aria-hidden="true">
            <Icon name="checkCircle" />
          </span>
          <div>
            <strong>Voucher diterapkan</strong>
            <small>Potongan sudah masuk ke ringkasan pembayaran.</small>
          </div>
        </div>
        <div className="voucher-applied-chip">
          <span>{appliedCode}</span>
          <button type="button" onClick={onRemove} disabled={disabled} aria-label={`Hapus voucher ${appliedCode}`}>
            <Icon name="x" />
          </button>
        </div>
        {status && <p className="voucher-code-status success">{status}</p>}
      </div>
    )
  }

  return (
    <div className="voucher-code-field">
      <div className="voucher-code-heading">
        <span className="voucher-code-heading-icon" aria-hidden="true">
          <Icon name="spark" />
        </span>
        <div>
          <strong>Punya kode voucher?</strong>
          <small>Satu voucher dapat digunakan untuk satu pembayaran.</small>
        </div>
      </div>
      <div className="voucher-code-control">
        <label className="sr-only" htmlFor={id}>Kode voucher</label>
        <input
          id={id}
          name="voucherCode"
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Masukkan kode voucher"
          maxLength={64}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck="false"
          disabled={isLoading || disabled}
        />
        <button
          type="button"
          onClick={onApply}
          disabled={!String(code || '').trim() || isLoading || disabled}
        >
          {isLoading ? 'Memeriksa...' : 'Gunakan'}
        </button>
      </div>
      {status && <p className="voucher-code-status error" role="alert">{status}</p>}
    </div>
  )
}

export default VoucherCodeField
