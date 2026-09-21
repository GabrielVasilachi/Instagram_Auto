import test from 'node:test';
import assert from 'node:assert/strict';
import { planReel, chooseQuote, similar, moodFor } from '../server/reel-plan.mjs';
import { refreshScheduledReel, eligibleForRefresh } from '../server/refresh-reels.mjs';

test('scenes preserve every word and give reading time outside transitions', () => {
  const quote = 'The first day back will feel awkward. Let it. You are rebuilding a rhythm.';
  const plan = planReel(quote);
  assert.equal(plan.scenes.map((s) => s.text).join(' '), quote);
  assert.ok(plan.duration >= 9);
  for (const [i, scene] of plan.scenes.entries()) {
    assert.ok(scene.hold >= 2.45);
    if (i) assert.ok(scene.start > plan.scenes[i - 1].end);
  }
  assert.ok(planReel('Take the next step.').duration >= 5);
  assert.throws(() => planReel('Never give up.'));
  assert.throws(() => planReel('word '.repeat(50)));
});
test('selection avoids recent exact and near duplicate messages', () => {
  assert.ok(similar('Build quietly. Keep your promise.', 'Build quietly, keep your promise!'));
  const fresh = 'Your future is asking for an hour.';
  assert.equal(
    chooseQuote(['Never give up.', 'Build quietly. Keep your promise.', fresh], 0, [
      { quote: 'Build quietly, keep your promise!' },
    ]),
    fresh,
  );
  assert.equal(moodFor('The rejection was real.'), 'pain');
});
const post = {
  id: 'x',
  quote: 'Give your ambition an hour it can actually use.',
  caption: 'Existing caption',
  accent: '#ffffff',
  format: 'reel',
  status: 'scheduled',
  scheduledFor: new Date(Date.now() + 86400000).toISOString(),
  design: {},
  mediaUrl: 'old',
};
function dependencies(overrides = {}) {
  return {
    snapshot: async () => ({ post, raw: post }),
    replace: async (_, next) => {
      assert.equal(next.status, post.status);
      assert.equal(next.scheduledFor, post.scheduledFor);
      assert.equal(next.caption, post.caption);
      return next;
    },
    generate: async () => '/tmp/nonexistent-reel-test.mp4',
    upload: async () => 'new',
    directory: '/tmp',
    ...overrides,
  };
}
test('refresh preserves schedule and only replaces validated and uploaded media', async () => {
  assert.equal((await refreshScheduledReel('x', dependencies())).status, 'refreshed');
  let replaced = false;
  await assert.rejects(
    refreshScheduledReel(
      'x',
      dependencies({
        generate: async () => {
          throw new Error('render failure');
        },
        replace: async () => {
          replaced = true;
        },
      }),
    ),
  );
  assert.equal(replaced, false);
  await assert.rejects(
    refreshScheduledReel(
      'x',
      dependencies({
        upload: async () => {
          throw new Error('upload failure');
        },
        replace: async () => {
          replaced = true;
        },
      }),
    ),
  );
  assert.equal(replaced, false);
  assert.equal(
    (await refreshScheduledReel('x', dependencies({ replace: async () => null }))).status,
    'conflict',
  );
});
test('refresh excludes published, due, static and editor content', () => {
  for (const override of [
    { status: 'published' },
    { status: 'publishing' },
    { format: 'post' },
    { scheduledFor: '2020-01-01' },
    { design: { editorMedia: { url: 'video' } } },
  ])
    assert.equal(eligibleForRefresh({ ...post, ...override }), false);
});
