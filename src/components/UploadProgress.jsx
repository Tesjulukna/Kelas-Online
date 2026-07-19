function UploadProgress({ value = 0, label = 'Memproses gambar...' }) {
  const percent = Math.min(100, Math.max(0, Math.round(Number(value) || 0)))

  return (
    <div
      className="image-upload-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={percent}
    >
      <span className="image-upload-progress-meta">
        <span>{label}</span>
        <strong>{percent}%</strong>
      </span>
      <span className="image-upload-progress-track" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </span>
    </div>
  )
}

export default UploadProgress
