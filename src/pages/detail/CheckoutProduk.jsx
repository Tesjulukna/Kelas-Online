import Icon from '../../components/Icon'
import VoucherCodeField from '../../components/VoucherCodeField'
import { getCheckoutEmailWarning } from '../../utils/emailValidation'
import { getCheckoutPhoneWarning } from '../../utils/phoneValidation'

export function PaymentMethodLogo({ method }) {
  if (method.logoUrl) {
    return (
      <span className="payment-method-logo custom-logo" aria-hidden="true">
        <img src={method.logoUrl} alt="" />
      </span>
    )
  }

  if (method.brand === 'qris') {
    return (
      <span className="payment-method-logo qris-logo" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </span>
    )
  }

  if (['alfamart', 'indomaret', 'alfamidi'].includes(method.brand)) {
    return (
      <span className={`payment-method-logo store-logo ${method.brand}`} aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </span>
    )
  }

  if (['ovo', 'shopeepay'].includes(method.brand)) {
    return (
      <span className={`payment-method-logo wallet-logo ${method.brand}`} aria-hidden="true">
        <span></span>
      </span>
    )
  }

  return (
    <span className={`payment-method-logo bank-logo ${method.brand}`} aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </span>
  )
}

function CheckoutProduk({
  product,
  itemType = 'product',
  form,
  checkoutCustomer = null,
  isMemberCheckout = false,
  memberNeedsPhone = false,
  isFree,
  isPaymentPickerOpen,
  paymentMethods,
  paymentAmount = 0,
  paymentFee = 0,
  paymentTotal = 0,
  voucherEnabled = false,
  voucherCode = '',
  voucherResult = null,
  voucherLoading = false,
  isSubmitting = false,
  voucherStatus = '',
  priceLabel,
  status,
  emailWarning = '',
  phoneWarning = '',
  onBack,
  onChange,
  onAnswerChange,
  onPaymentPickerToggle,
  onPaymentMethodSelect,
  onVoucherCodeChange = null,
  onVoucherApply = null,
  onVoucherRemove = null,
  onShare,
  onSubmit,
}) {
  if (!product) {
    return null
  }

  const isClassCheckout = itemType === 'class'
  const isPromptCheckout = !isClassCheckout && product.productType === 'prompt'
  const hasAppliedVoucher = voucherResult?.valid === true
  const voucherDiscount = hasAppliedVoucher
    ? Math.max(0, Math.round(Number(voucherResult?.discountAmount) || 0))
    : 0
  const voucherFinalAmount = hasAppliedVoucher
    ? Math.max(0, Math.round(Number(voucherResult?.finalAmount) || 0))
    : Math.max(0, Math.round(Number(paymentAmount) || 0))
  const isVoucherFree = !isFree && hasAppliedVoucher && voucherFinalAmount === 0
  const isEffectiveFree = isFree || isVoucherFree
  const checkoutTitle = isClassCheckout ? 'Checkout kelas' : isPromptCheckout ? 'Checkout prompt' : 'Checkout produk'
  const freeNote = isVoucherFree
    ? 'Voucher menanggung seluruh harga. Selesaikan pesanan tanpa memilih metode pembayaran.'
    : isClassCheckout
      ? 'Kelas ini gratis. Isi data peserta, lalu daftar tanpa memilih metode pembayaran.'
      : isPromptCheckout
        ? 'Prompt ini gratis. Isi data penerima, lalu ambil prompt tanpa memilih metode pembayaran.'
        : 'Produk ini gratis. Isi data penerima, lalu ambil produk tanpa memilih metode pembayaran.'
  const priceLabelTitle = isClassCheckout ? 'Harga kelas' : isPromptCheckout ? 'Harga prompt' : 'Harga produk'
  const submitLabel = isEffectiveFree
    ? (isVoucherFree ? 'Selesaikan Pesanan' : isClassCheckout ? 'Daftar Kelas' : isPromptCheckout ? 'Ambil Prompt' : 'Ambil Produk')
    : 'Buat Pembayaran'
  const marketingConsentText = isClassCheckout
    ? 'Saya setuju alamat email dan nomor telepon digunakan untuk menerima akses kelas, invoice, atau pesan pembelajaran dan pemasaran.'
    : isPromptCheckout
      ? 'Saya setuju alamat email dan nomor telepon digunakan untuk menerima prompt, akses pembelian, atau pesan pemasaran.'
      : 'Saya setuju alamat email dan nomor telepon digunakan untuk menerima produk atau pesan pemasaran.'
  const selectedMethodLabel =
    paymentMethods.find((method) => method.code === form.paymentMethod)?.label ||
    form.paymentMethod
  const customerQuestions = !isClassCheckout && Array.isArray(product.customerQuestions)
    ? product.customerQuestions
    : []
  const memberName = checkoutCustomer?.name || form.buyerName || 'Member'
  const memberEmail = checkoutCustomer?.email || form.buyerEmail || '-'
  const visibleEmailWarning = !isMemberCheckout
    ? emailWarning || getCheckoutEmailWarning(form.buyerEmail)
    : ''
  const visiblePhoneWarning = phoneWarning || getCheckoutPhoneWarning(form.buyerPhone)
  const canUseVoucher = !isFree && (voucherEnabled || typeof onVoucherApply === 'function')
  const displayedPaymentTotal = hasAppliedVoucher
    ? voucherFinalAmount + (isVoucherFree ? 0 : Math.max(0, Math.round(Number(paymentFee) || 0)))
    : paymentTotal || paymentAmount

  return (
    <section className="public-detail-page public-checkout-page">
      <div className="public-detail-topbar">
        <button className="icon-action-button" type="button" onClick={onBack}>
          <Icon name="arrowLeft" />
        </button>
        <button
          className="icon-action-button"
          type="button"
          onClick={() => onShare(product.title, product.description)}
        >
          <Icon name="share" />
        </button>
      </div>
      <form className="public-checkout-panel" onSubmit={onSubmit}>
        <div className="section-heading">
          <p className="eyebrow">{checkoutTitle}</p>
          <h2>{product.title}</h2>
          <small>{priceLabel}</small>
        </div>
        {isMemberCheckout ? (
          <div className="public-checkout-account">
            <span className="public-checkout-account-icon" aria-hidden="true">
              <Icon name="user" />
            </span>
            <div>
              <small>Checkout memakai akun member</small>
              <strong>{memberName}</strong>
              <span>{memberEmail}</span>
            </div>
          </div>
        ) : (
          <div className="public-checkout-grid">
            <label>
              Nama
              <input name="buyerName" value={form.buyerName} onChange={onChange} required />
            </label>
            <label>
              Email
              <input name="buyerEmail" type="email" value={form.buyerEmail} onChange={onChange} required />
              {visibleEmailWarning && (
                <small className="checkout-field-warning">{visibleEmailWarning}</small>
              )}
            </label>
            <label>
              Nomor HP
              <input
                name="buyerPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+628123456789 atau +14155552671"
                value={form.buyerPhone}
                onChange={onChange}
                aria-invalid={Boolean(visiblePhoneWarning)}
                required
              />
              {visiblePhoneWarning ? (
                <small className="checkout-field-warning">{visiblePhoneWarning}</small>
              ) : (
                <small className="checkout-field-hint">Nomor luar negeri: awali dengan +kode negara.</small>
              )}
            </label>
          </div>
        )}
        {memberNeedsPhone && (
          <div className="public-checkout-grid">
            <label>
              Nomor HP untuk invoice
              <input
                name="buyerPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+628123456789 atau +14155552671"
                value={form.buyerPhone}
                onChange={onChange}
                aria-invalid={Boolean(visiblePhoneWarning)}
                required
              />
              {visiblePhoneWarning ? (
                <small className="checkout-field-warning">{visiblePhoneWarning}</small>
              ) : (
                <small className="checkout-field-hint">Nomor luar negeri: awali dengan +kode negara.</small>
              )}
            </label>
          </div>
        )}
        {customerQuestions.length > 0 && (
          <div className="public-checkout-grid">
            {customerQuestions.map((question) => (
              <label key={question.id}>
                {question.label}
                <input
                  value={form.customAnswers?.[question.id] || ''}
                  onChange={(event) => onAnswerChange(question.id, event.target.value)}
                  required={question.required}
                />
              </label>
            ))}
          </div>
        )}
        {canUseVoucher && (
          <>
            {hasAppliedVoucher && (
              <input
                type="hidden"
                name="voucherCode"
                value={voucherResult?.voucher?.code || voucherCode}
              />
            )}
            <VoucherCodeField
              id={`${itemType}-${product.id}-voucher`}
              code={voucherCode}
              result={voucherResult}
              status={voucherStatus}
              isLoading={voucherLoading}
              onCodeChange={onVoucherCodeChange || (() => {})}
              onApply={onVoucherApply || (() => {})}
              onRemove={onVoucherRemove || (() => {})}
            />
          </>
        )}
        {!isEffectiveFree ? (
          <>
            <button
              className="btn btn-secondary public-payment-picker-toggle"
              type="button"
              onClick={onPaymentPickerToggle}
            >
              Pilih Metode Pembayaran
              <Icon name="wallet" />
            </button>
            {isPaymentPickerOpen && (
              <div className="payment-method-grid public-payment-method-grid" aria-label="Daftar metode pembayaran">
                {paymentMethods.map((method) => (
                  <button
                    className={`payment-method-option ${
                      form.paymentMethod === method.code ? 'selected' : ''
                    }`}
                    key={method.code}
                    type="button"
                    title={method.label}
                    aria-label={method.label}
                    aria-pressed={form.paymentMethod === method.code}
                    onClick={() => onPaymentMethodSelect(method.code)}
                  >
                    <PaymentMethodLogo method={method} />
                    <span className="payment-method-name">{method.label || method.code}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="public-checkout-free-note">{freeNote}</p>
        )}
        {!isFree && (form.paymentMethod || hasAppliedVoucher) && (
          <>
            {form.paymentMethod && (
              <p className="public-checkout-status">Metode dipilih: {selectedMethodLabel}</p>
            )}
            <div className="payment-breakdown public-checkout-breakdown" aria-live="polite">
              <span>
                <small>{priceLabelTitle}</small>
                <strong>{priceLabel}</strong>
              </span>
              {hasAppliedVoucher && voucherDiscount > 0 && (
                <span className="voucher-payment-discount">
                  <small>Potongan voucher</small>
                  <strong>-{new Intl.NumberFormat('id-ID', {
                    style: 'currency',
                    currency: 'IDR',
                    maximumFractionDigits: 0,
                  }).format(voucherDiscount)}</strong>
                </span>
              )}
              <span>
                <small>Biaya layanan</small>
                <strong>
                  {!isVoucherFree && !form.paymentMethod
                    ? 'Pilih metode'
                    : !isVoucherFree && paymentFee
                    ? new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: 'IDR',
                        maximumFractionDigits: 0,
                      }).format(paymentFee)
                    : 'Gratis'}
                </strong>
              </span>
              <span className="payment-breakdown-total">
                <small>Total pembayaran</small>
                <strong>
                  {new Intl.NumberFormat('id-ID', {
                    style: 'currency',
                    currency: 'IDR',
                    maximumFractionDigits: 0,
                  }).format(displayedPaymentTotal)}
                </strong>
              </span>
            </div>
            {!isVoucherFree && <div className="secure-payment-note">
              <span className="secure-payment-icon" aria-hidden="true">
                <Icon name="lock" />
              </span>
              <div>
                <small>secure</small>
                <strong>Secure Payment</strong>
                <p>
                  Pembayaran diproses melalui gateway resmi yang dipilih dengan koneksi terenkripsi.
                  Mitra pembayaran berada dalam ekosistem yang diawasi oleh Otoritas Jasa Keuangan (OJK) Republik Indonesia.
                </p>
              </div>
            </div>}
          </>
        )}
        <label className="public-checkout-check">
          <input
            type="checkbox"
            name="acceptedTerms"
            checked={form.acceptedTerms}
            onChange={onChange}
          />
          <span>Saya menyetujui ketentuan penggunaan.</span>
        </label>
        <label className="public-checkout-check">
          <input
            type="checkbox"
            name="acceptedMarketing"
            checked={form.acceptedMarketing}
            onChange={onChange}
          />
          <span>{marketingConsentText}</span>
        </label>
        {status && <p className="public-checkout-status">{status}</p>}
        <button
          className="btn btn-primary public-checkout-button"
          type="submit"
          disabled={
            voucherLoading ||
            isSubmitting ||
            (!isEffectiveFree && !form.paymentMethod) ||
            !form.acceptedTerms ||
            !form.acceptedMarketing ||
            (isMemberCheckout && (!memberEmail || memberEmail === '-')) ||
            (memberNeedsPhone && !form.buyerPhone)
          }
        >
          {isSubmitting ? 'Memproses pesanan...' : submitLabel}
          <Icon name="arrowRight" />
        </button>
      </form>
    </section>
  )
}

export default CheckoutProduk
