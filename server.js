import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as cheerio from 'cheerio'
import express from 'express'
import { createServer as createViteServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT || 3000)
const USE_PLAYWRIGHT = process.env.USE_PLAYWRIGHT === '1'
const isProduction = process.env.NODE_ENV === 'production'
const browserUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36'

app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    message: 'server is running',
  })
})

app.post('/api/fetch-quote', async (req, res) => {
  const quoteUrl = String(req.body?.url || '').trim()
  console.log('[fetch-quote] url:', quoteUrl)

  let parsedUrl
  try {
    parsedUrl = new URL(quoteUrl)
  } catch {
    return sendError(res, 400, 'INVALID_URL', '請提供有效的報價單網址', '網址格式無法解析。')
  }

  if (parsedUrl.hostname !== 'quote.saiens.tw') {
    return sendError(
      res,
      400,
      'HOST_NOT_ALLOWED',
      '只允許抓取 quote.saiens.tw 報價單網址',
      '為避免本服務變成任意 proxy，目標網域被限制為 quote.saiens.tw。',
    )
  }

  if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
    return sendError(
      res,
      400,
      'INVALID_PROTOCOL',
      '報價單網址協定不支援',
      '只允許 http 或 https 網址。',
    )
  }

  try {
    let fetched = await fetchQuoteHtml(quoteUrl)
    let diagnosis = diagnoseFetchedHtml(fetched.html)
    let quote = null

    if (diagnosis.loginLike) {
      return sendError(
        res,
        401,
        'AUTH_REQUIRED',
        '報價單頁面需要登入或權限不足',
        '目前後端抓到的不是報價單內容，可能 access_token 無效或 quote.saiens.tw 需要登入 cookie。',
      )
    }

    try {
      quote = parseQuoteHtml(fetched.html, quoteUrl)
      if (!quote.signedMonth && USE_PLAYWRIGHT) {
        console.log('[fetch-quote] signature not found; trying Playwright fallback')
        const rendered = await fetchQuoteHtmlWithPlaywright(quoteUrl)
        const renderedQuote = parseQuoteHtml(rendered.html, quoteUrl)
        if (renderedQuote.signedMonth) quote = renderedQuote
      }
    } catch (parseError) {
      if (USE_PLAYWRIGHT && shouldTryPlaywright(fetched.html, diagnosis, parseError)) {
        console.log('[fetch-quote] trying Playwright fallback')
        fetched = await fetchQuoteHtmlWithPlaywright(quoteUrl)
        diagnosis = diagnoseFetchedHtml(fetched.html)
        if (diagnosis.loginLike) {
          return sendError(
            res,
            401,
            'AUTH_REQUIRED',
            '報價單頁面需要登入或權限不足',
            'Playwright 抓到的仍不是報價單內容，可能 access_token 無效或需要登入 cookie。',
          )
        }
        quote = parseQuoteHtml(fetched.html, quoteUrl)
      } else {
        throw parseError
      }
    }

    if (!diagnosis.hasQuoteKeywords && !quote.taxExcludedAmount && !quote.taxIncludedAmount) {
      return sendError(
        res,
        422,
        'NO_QUOTE_DATA',
        '抓到 HTML，但沒有報價單資料',
        '可能報價單內容是 JavaScript 動態載入，請啟用 Playwright fallback。',
      )
    }

    res.json({ ok: true, quote })
  } catch (error) {
    console.error('[fetch-quote] failed:', error)
    const status = error.publicStatus || 500
    res.status(status >= 400 && status < 600 ? status : 500).json({
      ok: false,
      message: error.publicMessage || '抓取失敗',
      errorType: error.publicType || error.cause?.code || error.code || 'UNKNOWN',
      detail: error.publicDetail || error.message || 'Unknown error',
    })
  }
})

if (isProduction) {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  })
  app.use(vite.middlewares)
}

app.listen(PORT, () => {
  console.log('✓ Server Started')
  console.log('✓ API Ready')
  console.log(`✓ http://localhost:${PORT}`)
  console.log('Routes:')
  console.log('GET /api/health')
  console.log('POST /api/fetch-quote')
  console.log('GET /')
})

async function fetchQuoteHtml(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: browserHeaders(),
  })
  const html = await response.text()
  console.log('[fetch-quote] status:', response.status)
  console.log('[fetch-quote] content-type:', response.headers.get('content-type'))
  console.log('[fetch-quote] html length:', html.length)

  if (!response.ok) {
    const error = new Error(`quote.saiens.tw 回傳 HTTP ${response.status}`)
    error.publicStatus = response.status
    error.publicType = 'QUOTE_HTTP_ERROR'
    error.publicMessage = 'quote 網站回傳錯誤'
    error.publicDetail = `quote.saiens.tw 回傳 HTTP ${response.status}，可能網址、access_token 或權限有問題。`
    throw error
  }

  return { html, status: response.status, contentType: response.headers.get('content-type') || '' }
}

async function fetchQuoteHtmlWithPlaywright(url) {
  let chromium
  try {
    chromium = (await import('playwright')).chromium
  } catch {
    const error = new Error(
      'Playwright 尚未安裝，請執行 npm install playwright 與 npx playwright install chromium',
    )
    error.publicStatus = 500
    error.publicType = 'PLAYWRIGHT_NOT_INSTALLED'
    error.publicMessage = '需要 Playwright fallback，但 Playwright 尚未安裝'
    error.publicDetail = error.message
    throw error
  }

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ userAgent: browserUserAgent })
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await page.evaluate(async () => {
      for (let i = 0; i < 8; i += 1) {
        window.scrollTo(0, document.body.scrollHeight)
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
    })
    const morePattern = /載入更多|查看更多|更多|下一頁/
    for (let i = 0; i < 4; i += 1) {
      const clicked = await page
        .evaluate((patternSource) => {
          const pattern = new RegExp(patternSource)
          const elements = Array.from(document.querySelectorAll('button, a'))
          const target = elements.find((el) => pattern.test((el.textContent || '').trim()))
          if (!target) return false
          target.click()
          return true
        }, morePattern.source)
        .catch(() => false)
      if (!clicked) break
      await page.waitForTimeout(900)
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    }
    await page
      .locator('body')
      .innerText({ timeout: 5000 })
      .catch(() => '')
    const html = await page.content()
    console.log('[fetch-quote] playwright html length:', html.length)
    return { html, status: 200, contentType: 'text/html; playwright=1' }
  } finally {
    await browser.close()
  }
}

function browserHeaders() {
  return {
    'User-Agent': browserUserAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  }
}

function diagnoseFetchedHtml(html) {
  const text = normalizeText(cheerio.load(html)('body').text() || html)
  return {
    text,
    loginLike: /(login|sign in|password|登入|無權限|access denied)/i.test(text),
    hasQuoteKeywords: /(未連稅金額|總計|發表於)/.test(text),
    tooShort: String(html || '').length < 800,
  }
}

function shouldTryPlaywright(html, diagnosis, error) {
  return (
    diagnosis.tooShort ||
    !diagnosis.hasQuoteKeywords ||
    /抓不到金額|JavaScript 動態載入|沒有報價單資料/.test(error.message || '')
  )
}

function sendError(res, status, errorType, message, detail = '') {
  return res.status(status).json({
    ok: false,
    message,
    errorType,
    detail,
  })
}

function parseQuoteHtml(html, quoteUrl) {
  const $ = cheerio.load(html)
  $('script, style, noscript, svg').remove()
  const text = normalizeText($('body').text() || html)
  const orderNo = extractOrderNo(text, quoteUrl)
  const customerName = extractCustomerName(text)
  const customerType = inferCustomerType(`${customerName}\n${text}`)
  const defaultCommissionRate = customerType === 'personal' ? 5 : 4
  const signature = extractSignatureInfo({ html, text, orderNo })
  const amountDebug = {
    taxExcludedLabel: '',
    taxExcludedRaw: '',
    taxIncludedLabel: '',
    taxIncludedRaw: '',
  }
  let amountInferred = false

  const excludedMatch =
    findAmountByLabelGroups(text, [['未連稅金額', '未連稅 金額'], ['未稅金額']]) ||
    emptyAmountMatch()
  const includedMatch =
    findAmountByLabelGroups(text, [['總計'], ['含稅總價', '總價']]) || emptyAmountMatch()

  let taxExcludedAmount = excludedMatch.amount
  let taxIncludedAmount = includedMatch.amount
  amountDebug.taxExcludedLabel = excludedMatch.label
  amountDebug.taxExcludedRaw = excludedMatch.raw
  amountDebug.taxIncludedLabel = includedMatch.label
  amountDebug.taxIncludedRaw = includedMatch.raw

  if (!taxExcludedAmount && !taxIncludedAmount) {
    const error = new Error('抓不到金額，可能該頁面是 JavaScript 動態載入，請改用 Playwright 模式')
    error.publicStatus = 422
    error.publicMessage = error.message
    throw error
  }

  if (!taxExcludedAmount && taxIncludedAmount) {
    taxExcludedAmount = Math.round(taxIncludedAmount / 1.05)
    amountDebug.taxExcludedLabel = '由總計反推'
    amountDebug.taxExcludedRaw = String(taxExcludedAmount)
    amountInferred = true
  }

  if (!taxIncludedAmount && taxExcludedAmount) {
    taxIncludedAmount = Math.round(taxExcludedAmount * 1.05)
    amountDebug.taxIncludedLabel = '由未連稅金額反推'
    amountDebug.taxIncludedRaw = String(taxIncludedAmount)
    amountInferred = true
  }

  return {
    quoteUrl,
    orderNo,
    customerName,
    customerType,
    taxExcludedAmount,
    taxIncludedAmount,
    defaultCommissionRate,
    amountInferred,
    amountDebug,
    signedAtText: signature.signedAtText,
    signedMonth: signature.signedMonth,
    signedQuarterKey: signature.signedQuarterKey,
    signatureDebug: signature.signatureDebug,
  }
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractOrderNo(text, quoteUrl) {
  const fromUrl = quoteUrl.match(/\/orders\/(\d+)/)?.[1] || ''
  const fromText =
    text.match(/(?:報價單|訂單|案件|編號|Order|Quote)[^\d]{0,20}(\d{4,})/i)?.[1] ||
    text.match(/#\s*(\d{4,})/)?.[1] ||
    ''
  return fromText || fromUrl
}

function extractCustomerName(text) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const labeled = text.match(/(?:客戶名稱|客戶資訊|客戶|買受人|業主|公司名稱)[：:\s]*([^\n\r]+)/)
  if (labeled?.[1]) return cleanCustomerName(labeled[1])

  const likelyLine = lines.find((line) =>
    /(有限公司|股份有限公司|企業|工程|設計|室內裝修|事務所|工作室|商行|個人業主|自宅)/.test(line),
  )

  return cleanCustomerName(likelyLine || '')
}

function cleanCustomerName(value) {
  return String(value || '')
    .replace(/^(客戶名稱|客戶資訊|客戶|買受人|業主|公司名稱)[：:\s]*/, '')
    .replace(/\s{2,}.*/, '')
    .trim()
}

function inferCustomerType(value) {
  const text = String(value || '')
  const personalPattern = /(個人業主|個人|業主|自宅)/
  const companyPattern =
    /(公司|有限公司|股份有限公司|企業|工程|設計|室內裝修|事務所|工作室|行|商行)/

  if (personalPattern.test(text) && !companyPattern.test(text)) return 'personal'
  if (companyPattern.test(text)) return 'company'
  if (personalPattern.test(text)) return 'personal'
  return 'unknown'
}

function findAmountByLabelGroups(text, labelGroups) {
  for (const group of labelGroups) {
    for (const label of group) {
      const match = findAmountAfterLabel(text, label)
      if (match.amount > 0) return match
    }
  }
  return null
}

function findAmountAfterLabel(text, label) {
  const labelPattern = new RegExp(label.split(/\s+/).map(escapeRegExp).join('\\s*'), 'gi')
  const moneyPattern =
    /(?:NT\$|TWD|\$)?\s*[-+]?\d{1,3}(?:,\d{3})*(?:\.\d+)?|(?:NT\$|TWD|\$)?\s*[-+]?\d{4,}(?:\.\d+)?/gi
  let labelMatch

  while ((labelMatch = labelPattern.exec(text)) !== null) {
    const nearby = text.slice(
      labelMatch.index + labelMatch[0].length,
      labelMatch.index + labelMatch[0].length + 120,
    )
    const amounts = nearby.match(moneyPattern) || []
    for (const raw of amounts) {
      const amount = parseAmount(raw)
      if (amount > 0) {
        return { label, raw: raw.trim(), amount }
      }
    }
  }

  return emptyAmountMatch()
}

function emptyAmountMatch() {
  return { label: '', raw: '', amount: 0 }
}

function parseAmount(raw) {
  const cleaned = String(raw || '')
    .replace(/NT\$|TWD|\$/gi, '')
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '')
    .trim()
  const value = Number(cleaned)
  return Number.isFinite(value) ? Math.round(value) : 0
}

function extractSignatureInfo({ html, text, orderNo }) {
  const $ = cheerio.load(html || '')
  const containers = collectMessageContainers($)
  const candidates =
    containers.length > 0
      ? containers.map((el, index) => messageCandidateFromElement($, el, index, orderNo))
      : fallbackMessageCandidates(text, orderNo)
  const viable = candidates.filter(
    (candidate) => candidate.hasSignature && candidate.hasPdf && candidate.signedMonth,
  )
  viable.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp)
  const selected = viable[0]

  if (!selected) {
    return {
      signedAtText: '',
      signedMonth: '',
      signedQuarterKey: '',
      signatureDebug: {
        matchedBy: '',
        matchedMessageText: '',
        matchedAttachmentText: '',
        candidates: candidates.slice(0, 12).map(publicCandidate),
      },
    }
  }

  return {
    signedAtText: selected.signedAtText,
    signedMonth: selected.signedMonth,
    signedQuarterKey: getFiscalQuarter(selected.signedMonth).key,
    signatureDebug: {
      matchedBy: selected.matchedBy,
      matchedMessageText: selected.messageText,
      matchedAttachmentText: selected.attachmentText,
      candidates: candidates.slice(0, 12).map(publicCandidate),
    },
  }
}

function collectMessageContainers($) {
  const selectors = [
    '.o_Message',
    '.o-mail-Message',
    '.o_Chatter',
    '.o_thread_message',
    "[class*='Message']",
    "[class*='message']",
    "[class*='chatter']",
    "[class*='mail']",
  ]
  const seen = new Set()
  const containers = []
  selectors.forEach((selector) => {
    $(selector).each((_index, el) => {
      const key = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 220)
      if (!key || seen.has(key)) return
      seen.add(key)
      containers.push(el)
    })
  })
  return containers
}

function messageCandidateFromElement($, el, index, orderNo) {
  const $el = $(el)
  const messageText = normalizeText($el.text()).slice(0, 2000)
  const hrefs = []
  $el.find('a[href]').each((_index, link) => {
    hrefs.push(String($(link).attr('href') || ''))
  })
  const attachmentText = normalizeText(
    $el.find("a, [class*='attachment'], [class*='Attachment']").text() || '',
  )
  return buildSignatureCandidate({
    index,
    messageText,
    attachmentText,
    hrefs,
    orderNo,
    source: 'dom-message',
  })
}

function fallbackMessageCandidates(text, orderNo) {
  const chunks = normalizeText(text)
    .split(/(?=發表於\s*\d{4}\s*年)|(?=\d{4}[/-]\d{1,2}[/-]\d{1,2})/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
  return chunks.map((messageText, index) =>
    buildSignatureCandidate({
      index,
      messageText: messageText.slice(0, 2000),
      attachmentText: messageText,
      hrefs: [],
      orderNo,
      source: 'body-text',
    }),
  )
}

function buildSignatureCandidate({ index, messageText, attachmentText, hrefs, orderNo, source }) {
  const combinedAttachment = `${attachmentText}\n${hrefs.join('\n')}`
  const hasSignature = /簽名/.test(messageText)
  const hasPdf = /\.pdf\b/i.test(combinedAttachment)
  const hasOrderNo = Boolean(
    orderNo && new RegExp(escapeRegExp(orderNo), 'i').test(combinedAttachment),
  )
  const strongSignature = /訂單由[\s\S]{0,80}簽名/.test(messageText)
  const date = extractPostedDate(messageText)
  let score = 0
  if (hasSignature) score += 20
  if (hasPdf) score += 20
  if (hasOrderNo) score += 40
  if (strongSignature) score += 15
  if (date.signedMonth) score += 10
  return {
    index,
    source,
    messageText,
    attachmentText: combinedAttachment.trim().slice(0, 1000),
    hrefs,
    hasSignature,
    hasPdf,
    hasOrderNo,
    strongSignature,
    signedAtText: date.signedAtText,
    signedMonth: date.signedMonth,
    timestamp: date.timestamp,
    score,
    matchedBy: hasOrderNo ? 'signature+pdf+orderNo' : hasPdf ? 'signature+pdf' : 'candidate',
  }
}

function extractPostedDate(value) {
  const text = normalizeText(value)
  const patterns = [
    /(?:發表於\s*)?(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(上午|下午)?\s*(\d{1,2})?:?(\d{2})?/,
    /(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/,
    /(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    let year
    let month
    let day
    let hour = 0
    let minute = 0
    let meridiem = ''
    if (pattern === patterns[0]) {
      year = Number(match[1])
      month = Number(match[2])
      day = Number(match[3])
      meridiem = match[4] || ''
      hour = Number(match[5] || 0)
      minute = Number(match[6] || 0)
    } else {
      year = Number(match[1])
      month = Number(match[2])
      day = Number(match[3])
      hour = Number(match[4] || 0)
      minute = Number(match[5] || 0)
    }
    if (meridiem === '下午' && hour > 0 && hour < 12) hour += 12
    if (meridiem === '上午' && hour === 12) hour = 0
    const signedMonth = `${year}-${String(month).padStart(2, '0')}`
    const dateText = match[0].replace(/\s+/g, ' ').trim()
    return {
      signedAtText: buildSignedAtText(text, dateText),
      signedMonth,
      timestamp: new Date(year, month - 1, day, hour, minute).getTime(),
    }
  }
  return { signedAtText: '', signedMonth: '', timestamp: 0 }
}

function buildSignedAtText(fullText, dateText) {
  const signatureMatch = fullText.match(/訂單由[\s\S]{0,80}?簽名/)
  const suffix = signatureMatch ? ` ${signatureMatch[0].replace(/\s+/g, ' ').trim()}` : ''
  return `${dateText}${suffix}`.trim()
}

function publicCandidate(candidate) {
  return {
    source: candidate.source,
    score: candidate.score,
    matchedBy: candidate.matchedBy,
    signedAtText: candidate.signedAtText,
    signedMonth: candidate.signedMonth,
    hasSignature: candidate.hasSignature,
    hasPdf: candidate.hasPdf,
    hasOrderNo: candidate.hasOrderNo,
    messageText: candidate.messageText.slice(0, 320),
    attachmentText: candidate.attachmentText.slice(0, 240),
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getFiscalQuarter(monthString) {
  if (!/^\d{4}-\d{2}$/.test(String(monthString || ''))) return { year: 0, quarter: '', key: '' }
  const [yearText, monthText] = monthString.split('-')
  const rawYear = Number(yearText)
  const month = Number(monthText)
  let year = rawYear
  let quarter = ''
  if ([2, 3, 4].includes(month)) quarter = 'Q1'
  else if ([5, 6, 7].includes(month)) quarter = 'Q2'
  else if ([8, 9, 10].includes(month)) quarter = 'Q3'
  else {
    quarter = 'Q4'
    if (month === 1) year = rawYear - 1
  }
  return { year, quarter, key: `${year}-${quarter}` }
}
