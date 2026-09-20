import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDesign, sanitizeText } from '../server/design.mjs'

test('invisible and bidirectional control characters are removed', () => {
  assert.equal(sanitizeText('Disci\u200Bpline\u202E\u0000\r\nFocus'), 'Discipline\nFocus')
  assert.equal(sanitizeText('  disciplină și progres  '), 'disciplină și progres')
})

test('design values are constrained to supported remote rendering options', () => {
  const design = normalizeDesign({ template: 'unknown', fontSize: 999, duration: 1, musicVolume: -5 }, 'reel')
  assert.equal(design.template, 'midnight')
  assert.equal(design.fontSize, 112)
  assert.equal(design.duration, 5)
  assert.equal(design.musicVolume, 0)
})

test('advanced typography and overlay values are constrained', () => {
  const design = normalizeDesign({ textCase: 'uppercase', letterSpacing: 99, lineHeight: 10, overlayOpacity: 90 }, 'reel')
  assert.equal(design.textCase, 'uppercase')
  assert.equal(design.letterSpacing, 12)
  assert.equal(design.lineHeight, 90)
  assert.equal(design.overlayOpacity, 65)
})

test('story publishing state survives design normalization safely', () => {
  const design = normalizeDesign({
    story: {
      status: 'failed',
      error: 'Temporary API error',
      retryCount: 2,
      nextAttemptAt: '2026-08-28T10:00:00.000Z',
    },
  }, 'reel')
  assert.equal(design.story.status, 'failed')
  assert.equal(design.story.retryCount, 2)
  assert.equal(design.story.error, 'Temporary API error')
})
