const transientCodes = new Set([
  'PGRST000',
  'PGRST001',
  'PGRST002',
  'PGRST003',
  'PGRST303',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
])

export function isTransientRemoteError(error) {
  const code = String(error?.code ?? '')
  const message = String(error?.message ?? error ?? '').toLowerCase()
  return transientCodes.has(code)
    || message.includes('jwt issued at future')
    || message.includes('fetch failed')
    || message.includes('network')
    || message.includes('timed out')
    || message.includes('timeout')
    || message.includes('temporarily unavailable')
}

export function isRetryablePublishError(error) {
  if (isTransientRemoteError(error)) return true
  const message = String(error?.message ?? error ?? '').toLowerCase()
  return message.includes('try again')
    || message.includes('retry')
    || message.includes('rate limit')
    || message.includes('too many requests')
    || message.includes('internal server error')
    || message.includes('service unavailable')
    || message.includes('temporarily')
    || message.includes('connection')
    || message.includes('procesează videoclipul prea mult')
}

export function retryDelayMs(attempt) {
  const delays = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]
  return delays[Math.min(Math.max(1, Number(attempt) || 1) - 1, delays.length - 1)]
}

export async function withRemoteRetries(operation, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 5)
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs) || 15_000)
  const wait = options.wait ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)))

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      if (attempt === attempts || !isTransientRemoteError(error)) throw error
      const delayMs = Math.min(baseDelayMs * attempt, 60_000)
      options.onRetry?.({ attempt, delayMs, error })
      await wait(delayMs)
    }
  }
}
