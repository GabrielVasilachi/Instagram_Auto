import test from 'node:test';
import assert from 'node:assert/strict';
import { captionFor, POST_WEEKDAYS, REEL_TIMES } from '../server/content-plan.mjs';

test('content plan schedules three Reels daily and two posts weekly', () => {
  assert.equal(REEL_TIMES.length, 3);
  assert.equal(new Set(REEL_TIMES).size, 3);
  assert.equal(POST_WEEKDAYS.length, 2);
});

test('captions preserve the story and promise a reason to follow', () => {
  const quote = 'Test quote.';
  const captions = ['focus', 'discipline', 'resilience'].map((pillar, cursor) =>
    captionFor(quote, 'reel', cursor, { pillar }),
  );
  assert.ok(new Set(captions).size >= 2);
  assert.ok(captions.every((caption) => caption.includes('#silentforward')));
  assert.ok(captions.every((caption) => caption.startsWith(quote)));
  assert.ok(captions.every((caption) => caption.includes('Follow @silentforward for')));
});
