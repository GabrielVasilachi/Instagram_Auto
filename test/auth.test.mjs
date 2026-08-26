import test from 'node:test'
import assert from 'node:assert/strict'
import { issueSession, passwordMatches, verifySession } from '../server/auth.mjs'

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
