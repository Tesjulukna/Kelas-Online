import Icon from './Icon'

function TaskAnswerField({ value, onChange }) {
  return (
    <section className="task-answer-field">
      <header>
        <span><Icon name="message" /></span>
        <div>
          <strong>Tulis atau tempel jawaban tugas di sini</strong>
          <small>Masukkan link atau jawaban Anda pada kolom di bawah.</small>
        </div>
      </header>
      <label>
        <span>Jawaban tugas</span>
        <textarea
          aria-label="Kolom jawaban tugas"
          value={value}
          onChange={onChange}
          placeholder="Tempel link Google Drive, YouTube, Instagram, atau tulis catatan tugas..."
          rows="4"
        />
      </label>
      <p><Icon name="arrowRight" /> Setelah selesai, tekan Kirim Tugas di bawah.</p>
    </section>
  )
}

export default TaskAnswerField
