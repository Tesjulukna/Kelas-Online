import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

test('kolom jawaban tugas memberi instruksi jelas sebelum member mengetik', async (t) => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const { default: TaskAnswerField } = await vite.ssrLoadModule('/src/components/TaskAnswerField.jsx')

  const html = renderToStaticMarkup(React.createElement(TaskAnswerField, {
    value: '',
    onChange: () => {},
  }))

  assert.match(html, /Tulis atau tempel jawaban tugas di sini/)
  assert.match(html, /Setelah selesai, tekan Kirim Tugas di bawah/)
  assert.match(html, /aria-label="Kolom jawaban tugas"/)
  assert.match(html, /Tempel link Google Drive, YouTube, Instagram, atau tulis catatan tugas/)
})
