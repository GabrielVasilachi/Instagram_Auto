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
