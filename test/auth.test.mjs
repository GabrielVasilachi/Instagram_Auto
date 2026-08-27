import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedOrigin, issueSession, passwordMatches, verifySession } from '../server/auth.mjs'

test('session tokens are signed, expire, and reject tampering', () => {
  const now = Date.UTC(2026, 7, 26)
  const token = issueSession('a-session-secret-that-is-long-enough', now)
  assert.equal(verifySession(token, 'a-session-secret-that-is-long-enough', now + 1000), true)
  assert.equal(verifySession(`${token}x`, 'a-session-secret-that-is-long-enough', now + 1000), false)
  assert.equal(verifySession(token, 'another-secret', now + 1000), false)
  assert.equal(verifySession(token, 'a-session-secret-that-is-long-enough', now + 15 * 24 * 60 * 60 * 1000), false)
})

test('password comparison is exact', () => {
  assert.equal(passwordMatches('correct horse', 'correct horse'), true)
  assert.equal(passwordMatches('correct-horse', 'correct horse'), false)
  assert.equal(passwordMatches('', ''), false)
})

test('local Vite origin is allowed to authenticate through the API proxy', () => {
  const request = {
    get(name) {
      return ({ origin: 'http://127.0.0.1:5173', host: '127.0.0.1:5174' })[name]
    },
  }
  assert.equal(isAllowedOrigin(request), true)
})

test('unrelated origins remain blocked', () => {
  const request = {
    get(name) {
      return ({ origin: 'https://attacker.example', host: 'instagram-auto.example' })[name]
    },
  }
  assert.equal(isAllowedOrigin(request), false)
})
