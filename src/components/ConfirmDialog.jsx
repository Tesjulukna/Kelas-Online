import Icon from './Icon'

function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Ya, lanjutkan',
  cancelLabel = 'Batal',
  tone = 'danger',
  onCancel,
  onConfirm,
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className={`confirm-dialog ${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div className="confirm-icon" aria-hidden="true">
          <Icon name={tone === 'danger' ? 'shield' : 'checkCircle'} />
        </div>
        <div>
          <h2 id="confirm-title">{title}</h2>
          <p>{message}</p>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn btn-primary" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}

export default ConfirmDialog
