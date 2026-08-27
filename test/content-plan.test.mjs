import test from 'node:test'
import assert from 'node:assert/strict'
import { captionFor, POST_WEEKDAYS, REEL_TIMES } from '../server/content-plan.mjs'

test('content plan schedules three Reels daily and two posts weekly', () => {
  assert.equal(REEL_TIMES.length, 3)
  assert.equal(new Set(REEL_TIMES).size, 3)
  assert.equal(POST_WEEKDAYS.length, 2)
})

test('captions rotate hooks, calls to action and relevant hashtags', () => {
  const quote = 'Test quote.'
  const captions = Array.from({ length: 12 }, (_, cursor) => captionFor(quote, 'reel', cursor))
  assert.equal(new Set(captions).size, captions.length)
  assert.ok(captions.every((caption) => caption.includes('#silentforward')))
  assert.ok(captions.every((caption) => caption.includes(quote)))
})
