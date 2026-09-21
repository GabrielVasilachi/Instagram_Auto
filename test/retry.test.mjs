import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRetryablePublishError,
  isTransientRemoteError,
  retryDelayMs,
  withRemoteRetries,
} from '../server/retry.mjs';

test('Supabase clock-skew errors are retried until the operation succeeds', async () => {
  let calls = 0;
  const waits = [];
  const result = await withRemoteRetries(
    async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('JWT issued at future'), { code: 'PGRST303' });
      return 'ok';
    },
    {
      attempts: 5,
      baseDelayMs: 10,
      wait: async (delayMs) => waits.push(delayMs),
    },
  );

  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);
});

test('non-transient publishing errors fail immediately', async () => {
  let calls = 0;
  await assert.rejects(
    withRemoteRetries(
      async () => {
        calls += 1;
        throw new Error('Instagram permission denied');
      },
      { wait: async () => {} },
    ),
    /permission denied/,
  );
  assert.equal(calls, 1);
});

test('the transient classifier covers gateway and network failures', () => {
  assert.equal(isTransientRemoteError({ code: 'PGRST303', message: 'JWT issued at future' }), true);
  assert.equal(isTransientRemoteError(new Error('fetch failed')), true);
  assert.equal(isTransientRemoteError(new Error('invalid caption')), false);
});

test('publishing retries common temporary Instagram and Cloudinary errors', () => {
  assert.equal(isRetryablePublishError(new Error('Please try again later')), true);
  assert.equal(isRetryablePublishError(new Error('Rate limit reached')), true);
  assert.equal(isRetryablePublishError(new Error('Invalid video dimensions')), false);
  assert.deepEqual(
    [1, 2, 3, 4, 8].map(retryDelayMs),
    [60_000, 300_000, 900_000, 3_600_000, 3_600_000],
  );
});
