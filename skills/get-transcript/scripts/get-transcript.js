function extractJsonObject(source, startIndex) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = startIndex; i < source.length; i += 1) {
    const char = source[i]
    if (inString) {
      if (escaped) {
        escaped = false
      }
      else if (char === '\\') {
        escaped = true
      }
      else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      depth += 1
    }
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(startIndex, i + 1)
      }
    }
  }
  return null
}

function findPlayerResponse(html) {
  const tokens = [
    'ytInitialPlayerResponse =',
    'ytInitialPlayerResponse:',
    'var ytInitialPlayerResponse =',
    'ytInitialPlayerResponse',
  ]
  for (const token of tokens) {
    const tokenIndex = html.indexOf(token)
    if (tokenIndex === -1) continue
    const braceIndex = html.indexOf('{', tokenIndex)
    if (braceIndex === -1) continue
    const jsonText = extractJsonObject(html, braceIndex)
    if (!jsonText) continue
    try {
      return JSON.parse(jsonText)
    }
    catch {
      continue
    }
  }
  const playerResponseToken = 'player_response'
  const playerResponseIndex = html.indexOf(playerResponseToken)
  if (playerResponseIndex === -1) return null
  const quoteIndex = html.indexOf('"', playerResponseIndex)
  if (quoteIndex === -1) return null
  const endQuoteIndex = html.indexOf('"', quoteIndex + 1)
  if (endQuoteIndex === -1) return null
  const raw = html.slice(quoteIndex + 1, endQuoteIndex)
  try {
    const decoded = raw.replace(/\\u0026/g, '&').replace(/\\"/g, '"')
    return JSON.parse(decoded)
  }
  catch {
    return null
  }
}

function pickCaptionTrack(tracks, preferredLanguage) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null
  const normalizedLang = preferredLanguage?.toLowerCase()
  const manualTracks = tracks.filter((track) => !track.kind)
  const byLanguage = normalizedLang
    ? manualTracks.find((track) => String(track.languageCode || '').toLowerCase().startsWith(normalizedLang))
    : null
  if (byLanguage) return byLanguage
  return manualTracks[0] || tracks[0]
}

function pickTrackFromList(tracks, preferredLanguage) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null
  const normalizedLang = preferredLanguage?.toLowerCase()
  const manualTracks = tracks.filter((track) => track.kind !== 'asr')
  const byLanguage = normalizedLang
    ? manualTracks.find((track) => String(track.lang_code || '').toLowerCase().startsWith(normalizedLang))
    : null
  if (byLanguage) return byLanguage
  return manualTracks[0] || tracks[0]
}

function parseTranscript(jsonText) {
  const text = String(jsonText || '')
  try {
    const data = JSON.parse(text)
    const events = Array.isArray(data?.events) ? data.events : []
    const parts = []
    for (const event of events) {
      const segs = Array.isArray(event?.segs) ? event.segs : []
      for (const seg of segs) {
        if (seg?.utf8) parts.push(seg.utf8)
      }
    }
    return parts.join('').replace(/\s+/g, ' ').trim()
  }
  catch {
    return ''
  }
}

function parseTranscriptVtt(vttText) {
  const text = String(vttText || '')
  if (!text.trim()) return ''
  const lines = text.split(/\r?\n/)
  const parts = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed === 'WEBVTT') continue
    if (trimmed.includes('-->')) continue
    if (/^\d+$/.test(trimmed)) continue
    parts.push(trimmed)
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function parseTranscriptXml(xmlText) {
  const text = String(xmlText || '')
  if (!text) return ''
  const regex = /<text[^>]*>([\s\S]*?)<\/text>/g
  const parts = []
  let match
  while ((match = regex.exec(text)) !== null) {
    parts.push(decodeHtmlEntities(match[1] || ''))
  }
  if (!parts.length) return ''
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function parseTrackListXml(xmlText) {
  const text = String(xmlText || '')
  if (!text) return []
  const trackRegex = /<track\b([^>]*)\/?>/g
  const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/g
  const tracks = []
  let match
  while ((match = trackRegex.exec(text)) !== null) {
    const attrs = match[1] || ''
    const record = {}
    let attrMatch
    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      record[attrMatch[1]] = attrMatch[2]
    }
    tracks.push(record)
  }
  return tracks
}

function extractVideoId(pageUrl, playerResponse) {
  const fromResponse = playerResponse?.videoDetails?.videoId
  if (fromResponse) return String(fromResponse)
  try {
    const url = new URL(pageUrl)
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace('/', '')
      return id || ''
    }
    if (url.pathname.startsWith('/shorts/')) {
      return url.pathname.split('/')[2] || ''
    }
    const vParam = url.searchParams.get('v')
    if (vParam) return vParam
    return ''
  }
  catch {
    return ''
  }
}

function buildTimedTextUrl(videoId, track) {
  const params = new URLSearchParams()
  params.set('v', videoId)
  if (track?.lang_code) params.set('lang', track.lang_code)
  if (track?.kind) params.set('kind', track.kind)
  if (track?.name) params.set('name', track.name)
  if (track?.vss_id) params.set('vss_id', track.vss_id)
  return `https://www.youtube.com/api/timedtext?${params.toString()}`
}

function normalizeFetchTextResponse(value) {
  if (typeof value === 'string') return { text: value }
  if (!value || typeof value !== 'object') return { text: String(value || '') }
  const record = value
  const text = typeof record.text === 'string'
    ? record.text
    : typeof record.body === 'string'
      ? record.body
      : typeof record.data === 'string'
        ? record.data
        : ''
  const error = typeof record.error === 'string' ? record.error : ''
  const status = typeof record.status === 'number' ? record.status : undefined
  const contentType = typeof record.contentType === 'string' ? record.contentType : ''
  if (text || error || status || contentType) return { text, error, status, contentType }
  try {
    return { text: JSON.stringify(value) }
  }
  catch {
    return { text: String(value) }
  }
}

async function getPreferredLanguage(_api) {
  return 'en'
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function isTranscriptPanelOpen(api) {
  try {
    const panelVisible = await api.dom.querySelector('ytd-transcript-renderer')
    if (panelVisible) return true
    const dialogPanel = await api.dom.querySelector('tp-yt-paper-dialog ytd-transcript-renderer')
    if (dialogPanel) return true
    const engagementPanel = await api.dom.querySelector('[target-id="engagement-panel-transcript"]')
    return Boolean(engagementPanel)
  }
  catch {
    return false
  }
}

async function readTranscriptFromDom(api) {
  const segmentTextSelectors = [
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-transcript"] ytd-transcript-segment-renderer #segment-text',
    'ytd-transcript-segment-renderer #segment-text',
    'ytd-transcript-segment-renderer .segment-text',
    'ytd-transcript-segment-renderer yt-formatted-string',
    'ytd-transcript-segment-renderer span',
  ]
  const timestampSelectors = [
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-transcript"] ytd-transcript-segment-renderer #segment-timestamp',
    'ytd-transcript-segment-renderer #segment-timestamp',
    'ytd-transcript-segment-renderer .segment-timestamp',
  ]
  for (const selector of segmentTextSelectors) {
    const segments = await api.dom.getTextList(selector)
    const cleanedSegments = (segments || []).map((entry) => entry.trim()).filter(Boolean)
    if (!cleanedSegments.length) continue
    let timestamps = []
    for (const tsSelector of timestampSelectors) {
      const rawTimestamps = await api.dom.getTextList(tsSelector)
      const cleaned = (rawTimestamps || []).map((entry) => entry.trim()).filter(Boolean)
      if (cleaned.length) {
        timestamps = cleaned
        break
      }
    }
    const lines = cleanedSegments.map((segment, index) => {
      const timestamp = timestamps[index]
      if (timestamp) {
        return `${timestamp} ${segment}`.trim()
      }
      return segment
    })
    const transcript = lines.join('\n').trim()
    if (transcript) {
      return { transcript, errorDetail: '' }
    }
  }
  const panelOpen = await isTranscriptPanelOpen(api)
  if (panelOpen) {
    return { transcript: '', errorDetail: 'transcript-dom-empty' }
  }
  return { transcript: '', errorDetail: 'transcript-panel-not-open' }
}

async function tryOpenTranscriptPanel(api) {
  try {
    if (await isTranscriptPanelOpen(api)) return { opened: true }
    const menuSelectors = [
      'ytd-video-primary-info-renderer #menu button[aria-label*="More actions"]',
      'ytd-video-primary-info-renderer #menu yt-icon-button#button',
    ]
    let menuOpened = false
    for (const selector of menuSelectors) {
      const clicked = await api.dom.click(selector)
      if (clicked) {
        menuOpened = true
        break
      }
    }
    if (!menuOpened) {
      return { opened: false, errorDetail: 'transcript-open-failed' }
    }
    const textCandidates = ['Show transcript', 'Transcript', 'Show Transcript', '显示文字稿', '显示字幕', '转录']
    const clickedMenu = await api.dom.clickByText('ytd-menu-service-item-renderer, tp-yt-paper-item', textCandidates)
    if (clickedMenu) {
      await api.dom.click('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-transcript"]')
      return { opened: true, errorDetail: '' }
    }
    return { opened: false, errorDetail: 'transcript-open-failed' }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('DOM write access denied')) {
      return { opened: false, errorDetail: 'dom-write-denied' }
    }
    return { opened: false, errorDetail: 'transcript-open-failed' }
  }
}

async function getYouTubeHeaders(api, pageUrl) {
  const headers = {
    accept: 'application/json, text/xml, */*',
  }
  try {
    const clientName = await api.dom.getWindowValue('ytcfg.data_.INNERTUBE_CLIENT_NAME')
    const clientVersion = await api.dom.getWindowValue('ytcfg.data_.INNERTUBE_CLIENT_VERSION')
    const visitorData = await api.dom.getWindowValue('ytcfg.data_.VISITOR_DATA')
    if (clientName) headers['x-youtube-client-name'] = String(clientName)
    if (clientVersion) headers['x-youtube-client-version'] = String(clientVersion)
    if (visitorData) headers['x-goog-visitor-id'] = String(visitorData)
  }
  catch {
    // ignore header enrichment failures
  }
  return {
    headers,
    referrer: pageUrl || undefined,
    referrerPolicy: 'origin-when-cross-origin',
  }
}

async function loadPlayerResponseFromWindow(api) {
  try {
    const raw = await api.dom.getWindowJson('ytInitialPlayerResponse')
    if (raw) {
      try {
        return JSON.parse(raw)
      }
      catch {
        return null
      }
    }
  }
  catch (error) {
    return { __error: 'dom-failed', __detail: error instanceof Error ? error.message : String(error) }
  }
  try {
    const playerResponse = await api.dom.getWindowValue('ytplayer.config.args.player_response')
    if (playerResponse && typeof playerResponse === 'string') {
      try {
        return JSON.parse(playerResponse)
      }
      catch {
        return null
      }
    }
  }
  catch (error) {
    return { __error: 'dom-failed', __detail: error instanceof Error ? error.message : String(error) }
  }
  return null
}

async function fetchTimedTextListTracks(api, videoId, pageUrl) {
  const fetchInit = await getYouTubeHeaders(api, pageUrl)
  const urls = [
    `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}`,
    `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}&hl=en`,
  ]
  let lastDetail = 'timedtext-list-empty'
  for (const url of urls) {
    try {
      const domResult = await api.dom.fetchText?.(url, { credentials: 'include', cache: 'no-store', ...fetchInit })
      const result = normalizeFetchTextResponse(domResult ?? await api.sw.fetchText(url, { credentials: 'include', cache: 'no-store', ...fetchInit }))
      if (result.error && !result.text) {
        lastDetail = `fetch-failed: ${result.error}`
        continue
      }
      const listText = String(result.text || '')
      if (!listText.trim()) {
        lastDetail = 'timedtext-list-empty'
        continue
      }
      const tracks = parseTrackListXml(listText)
      if (tracks.length) {
        return { tracks, errorDetail: '' }
      }
      lastDetail = 'timedtext-list-empty'
    }
    catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error)
    }
  }
  return { tracks: [], errorDetail: lastDetail }
}

async function fetchTranscriptText(api, baseUrl, pageUrl) {
  const joinFmt = (fmt) => `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}fmt=${fmt}`
  const attempts = [
    joinFmt('vtt'),
    joinFmt('srv3'),
    joinFmt('json3'),
    baseUrl,
  ]
  let lastError = ''
  let lastPreview = ''
  const fetchInit = await getYouTubeHeaders(api, pageUrl)
  for (const url of attempts) {
    try {
      const domResult = await api.dom.fetchText?.(url, { credentials: 'include', cache: 'no-store', ...fetchInit })
      const result = normalizeFetchTextResponse(domResult ?? await api.sw.fetchText(url, { credentials: 'include', cache: 'no-store', ...fetchInit }))
      if (result.error && !result.text) {
        lastError = `fetch-failed: ${result.error}`
        continue
      }
      const transcriptText = String(result.text || '')
      if (!transcriptText.trim()) {
        lastError = 'empty-response'
        continue
      }
      const vttTranscript = parseTranscriptVtt(transcriptText)
      if (vttTranscript) {
        return { transcript: vttTranscript, errorDetail: '' }
      }
      const transcript = parseTranscript(transcriptText)
      if (transcript) {
        return { transcript, errorDetail: '' }
      }
      const xmlTranscript = parseTranscriptXml(transcriptText)
      if (xmlTranscript) {
        return { transcript: xmlTranscript, errorDetail: '' }
      }
      lastError = 'parse-failed: xml-regex-empty'
      lastPreview = transcriptText.slice(0, 200)
    }
    catch (error) {
      lastError = error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error)
    }
  }
  const previewDetail = lastPreview ? `${lastError}: ${lastPreview}` : lastError
  return { transcript: '', errorDetail: previewDetail }
}

module.exports.run = async ({ api, args }) => {
  const inputUrl = args && typeof args === 'object' && 'url' in args ? args.url : ''
  const pageUrl = inputUrl || await api.dom.getWindowValue('location.href') || ''
  let hostname = ''
  try {
    hostname = new URL(pageUrl).hostname
  }
  catch {
    return { transcript: '', error: 'invalid-url', errorDetail: 'url-parse-failed' }
  }
  if (!hostname.includes('youtube.com') && !hostname.includes('youtu.be')) {
    return { transcript: '', error: 'not-youtube', errorDetail: 'url-hostname-not-youtube' }
  }

  const domResult = await readTranscriptFromDom(api)
  if (domResult.transcript) {
    const limit = 200000
    const finalTranscript = domResult.transcript.length > limit
      ? domResult.transcript.slice(0, limit)
      : domResult.transcript
    return {
      transcript: finalTranscript,
      source: 'youtube',
      language: 'en',
      errorDetail: domResult.transcript.length > limit ? 'truncated' : '',
    }
  }
  let domDetail = domResult.errorDetail || 'transcript-dom-empty'
  if (domDetail === 'transcript-panel-not-open') {
    const openResult = await tryOpenTranscriptPanel(api)
    if (openResult.opened) {
      await sleep(600)
      const retryResult = await readTranscriptFromDom(api)
      if (retryResult.transcript) {
        const limit = 200000
        const finalTranscript = retryResult.transcript.length > limit
          ? retryResult.transcript.slice(0, limit)
          : retryResult.transcript
        return {
          transcript: finalTranscript,
          source: 'youtube',
          language: 'en',
          errorDetail: retryResult.transcript.length > limit ? 'truncated' : '',
        }
      }
      domDetail = retryResult.errorDetail || 'transcript-dom-empty'
    }
    else {
      domDetail = openResult.errorDetail || 'transcript-open-failed'
    }
  }
  const withDomDetail = (detail) => (domDetail ? `${detail} | dom:${domDetail}` : detail)

  const preferredLanguage = await getPreferredLanguage(api)
  let playerResponse = await loadPlayerResponseFromWindow(api)
  if (playerResponse && playerResponse.__error === 'dom-failed') {
    return { transcript: '', error: 'dom-failed', errorDetail: playerResponse.__detail || 'dom-access-failed' }
  }
  let html = ''
  if (!playerResponse) {
    try {
      html = await api.dom.getDocumentHtml()
    }
    catch (error) {
      return {
        transcript: '',
        error: 'dom-failed',
        errorDetail: error instanceof Error ? error.message : String(error),
      }
    }
    if (!html) {
      try {
        html = await api.sw.fetchText(pageUrl)
      }
      catch (error) {
        const detail = error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : JSON.stringify(error)
        return { transcript: '', error: 'fetch-failed', errorDetail: detail }
      }
    }
    if (!html) {
      return { transcript: '', error: 'fetch-failed', errorDetail: 'empty-html' }
    }
    playerResponse = findPlayerResponse(html)
  }
  if (!playerResponse) {
    return { transcript: '', error: 'parse-failed', errorDetail: 'player-response-missing' }
  }
  const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  const track = pickCaptionTrack(captionTracks, preferredLanguage)
  let transcriptResult = null
  if (track?.baseUrl) {
    transcriptResult = await fetchTranscriptText(api, track.baseUrl, pageUrl)
  }
  const initialTranscript = transcriptResult?.transcript || ''
  const initialError = transcriptResult?.errorDetail || ''
  const shouldFallback = !track?.baseUrl
    || (!initialTranscript && (initialError.includes('empty-response') || initialError.includes('parse-failed')))
  if (shouldFallback) {
    const videoId = extractVideoId(pageUrl, playerResponse)
    if (!videoId) {
      return { transcript: '', error: 'parse-failed', errorDetail: withDomDetail('video-id-missing') }
    }
    const listResult = await fetchTimedTextListTracks(api, videoId, pageUrl)
    if (!listResult.tracks.length) {
      return { transcript: '', error: 'no-captions', errorDetail: withDomDetail(listResult.errorDetail || 'timedtext-list-empty') }
    }
    const listTrack = pickTrackFromList(listResult.tracks, preferredLanguage)
    if (!listTrack) {
      return { transcript: '', error: 'no-captions', errorDetail: withDomDetail('timedtext-list-empty') }
    }
    const listBaseUrl = buildTimedTextUrl(videoId, listTrack)
    const { transcript, errorDetail } = await fetchTranscriptText(api, listBaseUrl, pageUrl)
    if (!transcript) {
      return { transcript: '', error: 'fetch-failed', errorDetail: withDomDetail(errorDetail || 'timedtext-list-fetch-failed') }
    }
    const limit = 200000
    const finalTranscript = transcript.length > limit
      ? transcript.slice(0, limit)
      : transcript
    return {
      transcript: finalTranscript,
      source: 'youtube',
      language: listTrack.lang_code || '',
      errorDetail: transcript.length > limit ? 'truncated' : '',
    }
  }

  if (!initialTranscript) {
    const fallbackDetail = initialError || 'transcript-empty'
    return { transcript: '', error: 'fetch-failed', errorDetail: withDomDetail(fallbackDetail) }
  }
  const limit = 200000
  const finalTranscript = initialTranscript.length > limit
    ? initialTranscript.slice(0, limit)
    : initialTranscript

  return {
    transcript: finalTranscript,
    source: 'youtube',
    language: track.languageCode || '',
    errorDetail: initialTranscript.length > limit ? 'truncated' : '',
  }
}
