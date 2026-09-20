import test from 'node:test'
import assert from 'node:assert/strict'
import { captionFor, POST_WEEKDAYS, REEL_TIMES } from '../server/content-plan.mjs'

test('content plan schedules three Reels daily and two posts weekly', () => {
  assert.equal(REEL_TIMES.length, 3)
  assert.equal(new Set(REEL_TIMES).size, 3)
  assert.equal(POST_WEEKDAYS.length, 2)
})

test('captions complement the Reel and keep CTAs occasional', () => {
  const quote = 'Test quote.'
  const captions = Array.from({ length: 12 }, (_, cursor) => captionFor(quote, 'reel', cursor))
  assert.ok(new Set(captions).size >= 2)
  assert.ok(captions.every((caption) => caption.includes('#silentforward')))
  assert.ok(captions.every((caption) => !caption.includes(quote)))
})
