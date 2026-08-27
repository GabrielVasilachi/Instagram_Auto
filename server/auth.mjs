import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'silent_forward_session'
const SESSION_SECONDS = 60 * 60 * 24 * 14

function safeEqual(left, right) {
  const first = Buffer.from(String(left ?? ''))
  const second = Buffer.from(String(right ?? ''))
  return first.length === second.length && timingSafeEqual(first, second)
}

function signature(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function issueSession(secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    expiresAt: now + SESSION_SECONDS * 1000,
    nonce: randomBytes(12).toString('base64url'),
  })).toString('base64url')

  return `${payload}.${signature(payload, secret)}`
}

export function verifySession(token, secret, now = Date.now()) {
  if (!token || !secret) return false
  const [payload, providedSignature, extra] = String(token).split('.')
  if (!payload || !providedSignature || extra || !safeEqual(providedSignature, signature(payload, secret))) return false

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return parsed.version === 1 && Number(parsed.expiresAt) > now
  } catch {
    return false
  }
}

export function passwordMatches(provided, expected) {
  return Boolean(expected) && safeEqual(provided, expected)
}

export function readSessionCookie(request) {
  const cookies = String(request.headers.cookie ?? '').split(';')
  for (const cookie of cookies) {
    const [name, ...value] = cookie.trim().split('=')
    if (name === COOKIE_NAME) return decodeURIComponent(value.join('='))
  }
  return ''
}

export function sessionCookie(token, secure = true) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`
}

export function expiredSessionCookie(secure = true) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`
}

export function isAllowedOrigin(request) {
  const origin = request.get('origin')
  if (!origin) return true
  const host = request.get('host')
  const forwardedHost = request.get('x-forwarded-host')
  if ([host, forwardedHost].filter(Boolean).some((value) => origin === `https://${value}` || origin === `http://${value}`)) return true

  // Vite serves the UI on :5173 and proxies /api to :5174. Both endpoints are
  // the same local application, but a strict host+port comparison rejects the
  // login request. Keep the production check strict and only relax loopback.
  try {
    const originUrl = new URL(origin)
    const requestHost = String(forwardedHost || host || '').split(':')[0]
    const loopback = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
    return loopback.has(originUrl.hostname) && loopback.has(requestHost)
  } catch {
    return false
  }
}
