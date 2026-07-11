import { useState } from 'react'
import Icon from '../../components/Icon'

const ACCESS_TEXT_LINK_PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+|wa\.me\/[^\s<]+|chat\.whatsapp\.com\/[^\s<]+)/gi
const TRAILING_URL_PUNCTUATION_PATTERN = /[.,!?;:)\]}]+$/

function getAccessHref(value) {
  if (/^https?:\/\//i.test(value)) {
    return value
  }

  return `https://${value}`
}

function LinkifiedAccessText({ text }) {
  if (!text) {
    return null
  }

  const parts = []
  let lastIndex = 0

  String(text).replace(ACCESS_TEXT_LINK_PATTERN, (match, _url, offset) => {
    if (offset > lastIndex) {
      parts.push(String(text).slice(lastIndex, offset))
    }

    const trailingMatch = match.match(TRAILING_URL_PUNCTUATION_PATTERN)
    const trailingText = trailingMatch?.[0] || ''
    const cleanUrl = trailingText ? match.slice(0, -trailingText.length) : match

    parts.push(
      <a
        href={getAccessHref(cleanUrl)}
        target="_blank"
        rel="noreferrer"
        key={`access-link-${offset}`}
      >
        {cleanUrl}
      </a>,
    )

    if (trailingText) {
      parts.push(trailingText)
    }

    lastIndex = offset + match.length
    return match
  })

  if (lastIndex < String(text).length) {
    parts.push(String(text).slice(lastIndex))
  }

  return <>{parts}</>
}

function ProductAccessPage({
  accessState,
  onBack,
  onRetry,
}) {
  const [copyStatus, setCopyStatus] = useState('')
  const accessData = accessState.data
  const accessProduct = accessData?.product
  const delivery = accessData?.delivery
  const isPrompt = accessProduct?.productType === 'prompt'
  const promptContent = delivery?.promptContent || accessProduct?.promptContent || ''
  const rawPromptItems = Array.isArray(delivery?.promptItems)
    ? delivery.promptItems
    : Array.isArray(accessProduct?.promptItems)
      ? accessProduct.promptItems
      : []
  const promptItems = rawPromptItems
    .map((item, index) => ({
      id: item.id || `prompt-access-${index + 1}`,
      title: item.title || `Prompt ${index + 1}`,
      prompt: item.prompt || '',
    }))
    .filter((item) => item.prompt)
  const visiblePromptItems = promptItems.length || !promptContent
    ? promptItems
    : [{
        id: 'prompt-access-legacy',
        title: 'Prompt utama',
        prompt: promptContent,
      }]
  const allPromptText = visiblePromptItems
    .map((item) => `${item.title}\n${item.prompt}`)
    .join('\n\n')
  const promptInstructions = delivery?.promptInstructions || accessProduct?.promptInstructions || ''
  const promptExamples = delivery?.promptExamples || accessProduct?.promptExamples || ''
  const handleCopyPrompt = async (text = allPromptText, label = 'Prompt') => {
    if (!text) {
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus(`${label} berhasil disalin.`)
    } catch {
      setCopyStatus('Prompt belum bisa disalin otomatis. Blok teks prompt lalu salin manual.')
    }
  }

  return (
    <section className="public-detail-page public-product-access-page">
      <div className="public-access-topbar">
        <button className="icon-action-button" type="button" onClick={onBack}>
          <Icon name="arrowLeft" />
        </button>
      </div>

      <article className="public-checkout-panel public-access-panel">
        <div className="section-heading">
          <p className="eyebrow">{isPrompt ? 'Akses prompt' : 'Akses produk'}</p>
          <h2>{accessProduct?.title || (isPrompt ? 'Prompt' : 'Produk digital')}</h2>
          <small>{accessData?.message || (isPrompt ? 'Memeriksa status pembayaran prompt.' : 'Memeriksa status pembayaran produk digital.')}</small>
        </div>

        {accessState.isLoading && (
          <p className="public-checkout-status">Memuat akses produk...</p>
        )}

        {accessState.error && (
          <div className="public-access-message">
            <Icon name="shield" />
            <h3>Akses belum tersedia</h3>
            <p>{accessState.error}</p>
            <button className="btn btn-secondary" type="button" onClick={onRetry}>
              Cek ulang
            </button>
          </div>
        )}

        {accessData && !accessData.paid && (
          <div className="public-access-message">
            <Icon name="clock" />
            <h3>Pembayaran belum terkonfirmasi</h3>
            <p>{accessData.message}</p>
            <div className="public-access-actions">
              {accessData.checkoutUrl && (
                <a className="btn btn-primary" href={accessData.checkoutUrl}>
                  Lanjutkan Pembayaran
                </a>
              )}
              <button className="btn btn-secondary" type="button" onClick={onRetry}>
                Cek Ulang
              </button>
            </div>
          </div>
        )}

        {accessData?.paid && accessProduct && (
          <div className="public-access-content">
            <div>
              <p className="eyebrow">{isPrompt ? 'Prompt siap diakses' : 'Produk siap diakses'}</p>
              <h3>{accessProduct.title}</h3>
              <p>Cek emailmu juga. Kami sudah mengirimkan link akses dan detail {isPrompt ? 'prompt' : 'produk'} ke email pembeli.</p>
            </div>

            {isPrompt && visiblePromptItems.length ? (
              <section className="public-detail-section public-access-note prompt-access-box">
                <p className="eyebrow">Isi prompt</p>
                <div className="prompt-access-list">
                  {visiblePromptItems.map((promptItem, promptIndex) => (
                    <article className="prompt-access-item" key={promptItem.id || `prompt-access-item-${promptIndex}`}>
                      <div className="prompt-access-item-heading">
                        <h3>{promptItem.title || `Prompt ${promptIndex + 1}`}</h3>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => handleCopyPrompt(promptItem.prompt, promptItem.title || `Prompt ${promptIndex + 1}`)}
                        >
                          <Icon name="copy" />
                          Salin
                        </button>
                      </div>
                      <div className="prompt-access-scroll">
                        <pre>{promptItem.prompt}</pre>
                      </div>
                    </article>
                  ))}
                </div>
                <button className="btn btn-primary" type="button" onClick={() => handleCopyPrompt()}>
                  <Icon name="copy" />
                  Salin Semua Prompt
                </button>
                {copyStatus && <small>{copyStatus}</small>}
              </section>
            ) : delivery?.downloadUrl ? (
              <a className="btn btn-primary public-access-download" href={delivery.downloadUrl}>
                Buka Isi Produk
                <Icon name="arrowRight" />
              </a>
            ) : (
              <p className="public-checkout-status">
                {isPrompt ? 'Isi prompt belum tersedia. Silakan cek email atau hubungi support.' : 'Link produk belum tersedia. Silakan cek email atau hubungi support.'}
              </p>
            )}

            {isPrompt && promptInstructions && (
              <section className="public-detail-section public-access-note prompt-access-guide">
                <p className="eyebrow">Cara penggunaan</p>
                <p className="public-access-linkified-text">
                  <LinkifiedAccessText text={promptInstructions} />
                </p>
              </section>
            )}

            {isPrompt && promptExamples && (
              <section className="public-detail-section public-access-note">
                <p className="eyebrow">Contoh hasil</p>
                <p className="public-access-linkified-text">
                  <LinkifiedAccessText text={promptExamples} />
                </p>
              </section>
            )}

            {delivery?.deliveryNote && (
              <section className="public-detail-section public-access-note">
                <p className="eyebrow">Catatan akses</p>
                <p className="public-access-linkified-text">
                  <LinkifiedAccessText text={delivery.deliveryNote} />
                </p>
              </section>
            )}
          </div>
        )}
      </article>
    </section>
  )
}

export default ProductAccessPage
