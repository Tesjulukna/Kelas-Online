const youtubeHosts = new Set([
  'youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
])

function getYoutubeVideoId(value) {
  try {
    const url = new URL(String(value || '').trim())
    const host = url.hostname.replace(/^www\./, '').toLowerCase()

    if (!youtubeHosts.has(host)) {
      return ''
    }

    let videoId = ''

    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] || ''
    } else if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) {
      videoId = url.pathname.split('/').filter(Boolean)[1] || ''
    } else {
      videoId = url.searchParams.get('v') || ''
    }

    return /^[a-zA-Z0-9_-]+$/.test(videoId) ? videoId : ''
  } catch {
    return ''
  }
}

export function getYoutubeEmbedUrl(value) {
  const videoId = getYoutubeVideoId(value)

  return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` : ''
}

export function getYoutubeEditorUrl(value) {
  const videoId = getYoutubeVideoId(value)

  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : ''
}

function getIframeSource(value) {
  const match = String(value || '').match(/\bsrc=(["'])(.*?)\1/i)

  return match?.[2] || ''
}

function isYoutubeMediaLine(value) {
  const line = String(value || '').trim()

  if (!line) {
    return false
  }

  if (/^https?:\/\/\S+$/i.test(line)) {
    return Boolean(getYoutubeEmbedUrl(line))
  }

  if (!/^<iframe\b[^>]*>[\s\S]*<\/iframe>$/i.test(line)) {
    return false
  }

  return Boolean(getYoutubeEmbedUrl(getIframeSource(line)))
}

export function normalizeYoutubeDescriptionSpacing(value) {
  const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n')
  const mediaLines = lines.map(isYoutubeMediaLine)

  return lines
    .filter((line, index) => {
      if (line.trim()) {
        return true
      }

      let previousIndex = index - 1
      let nextIndex = index + 1

      while (previousIndex >= 0 && !lines[previousIndex].trim()) {
        previousIndex -= 1
      }

      while (nextIndex < lines.length && !lines[nextIndex].trim()) {
        nextIndex += 1
      }

      return !mediaLines[previousIndex] && !mediaLines[nextIndex]
    })
    .join('\n')
}

export function convertYoutubeLinesToEmbeds(value) {
  const normalized = normalizeYoutubeDescriptionSpacing(value)
  const converted = normalized
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      const embedUrl = /^https?:\/\/\S+$/i.test(trimmed) ? getYoutubeEmbedUrl(trimmed) : ''

      return embedUrl
        ? `<iframe src="${embedUrl}" title="Video YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
        : line
    })
    .join('\n')

  return normalizeYoutubeDescriptionSpacing(converted)
}

export function descriptionHtmlToEditorText(value) {
  const text = String(value || '').replace(
    /<iframe\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>\s*<\/iframe>/gi,
    (_, _quote, src) => `\n${getYoutubeEditorUrl(src) || src}\n`,
  )

  return normalizeYoutubeDescriptionSpacing(text)
}

export function getYoutubeEmbedsFromText(value) {
  const seen = new Set()

  return String(value || '')
    .split(/\s+/)
    .map((chunk) => chunk.trim().replace(/[),.;]+$/, ''))
    .map((chunk) => getYoutubeEmbedUrl(chunk))
    .filter((embedUrl) => {
      if (!embedUrl || seen.has(embedUrl)) {
        return false
      }

      seen.add(embedUrl)
      return true
    })
}

export function createYoutubeLineInsertion(value, start, end, url) {
  const description = String(value || '')
  const before = description.slice(0, start)
  const after = description.slice(end)
  const prefix = before && !/[\r\n]$/.test(before) ? '\n' : ''
  const suffix = after && !/^[\r\n]/.test(after) ? '\n' : ''

  return `${prefix}${String(url || '').trim()}${suffix}`
}
