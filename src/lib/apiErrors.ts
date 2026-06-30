export function friendlyFetchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/Load failed|Failed to fetch|NetworkError/i.test(message)) {
    return '連不到後端 API。本機開發請確認 npm start 已啟動；線上版請稍後再試。'
  }
  if (/HTTP 404/.test(message)) return 'API 404：找不到 /api/fetch-quote，請確認後端已部署。'
  if (/403/.test(message)) return 'quote 網站回 403，可能 access_token 無效、權限不足或需要登入。'
  return message
}

export function networkDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    return `目前是從 file:// 開啟，請改用 http://localhost:3000（本機）或線上網址。原始錯誤：${message}`
  }
  if (/Load failed|Failed to fetch|NetworkError/i.test(message)) {
    return `連不到 API。本機請確認 npm start 已啟動；線上版稍後再試。原始錯誤：${message}`
  }
  if (/HTTP 404/.test(message)) return '404：找不到 /api/health，請確認後端已部署或本機已啟動。'
  if (/HTTP 500/.test(message))
    return '500：後端出錯，本機看 npm start 的 console，線上看 Vercel logs。'
  return message
}
