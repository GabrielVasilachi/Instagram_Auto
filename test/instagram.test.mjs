import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchMediaInsights,
  publishStoryToInstagram,
  publishToInstagram,
} from '../server/instagram.mjs';

test('image containers reach FINISHED before media_publish is called', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const previousAccount = process.env.INSTAGRAM_ACCOUNT_ID;
  const calls = [];
  const responses = [
    { id: 'container-1' },
    { id: 'container-1', status_code: 'FINISHED', status: 'Finished' },
    { id: 'media-1' },
  ];

  process.env.INSTAGRAM_ACCESS_TOKEN = 'test-token';
  process.env.INSTAGRAM_ACCOUNT_ID = 'account-1';
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method ?? 'GET' });
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await publishToInstagram(
      { format: 'post', caption: 'Caption' },
      'https://example.com/image.png',
    );
    assert.equal(result.id, 'media-1');
    assert.match(calls[0].url, /account-1\/media/);
    assert.match(calls[1].url, /container-1/);
    assert.match(calls[1].url, /status_code/);
    assert.match(calls[2].url, /account-1\/media_publish/);
  } finally {
    globalThis.fetch = previousFetch;
    process.env.INSTAGRAM_ACCESS_TOKEN = previousToken;
    process.env.INSTAGRAM_ACCOUNT_ID = previousAccount;
  }
});

test('media insights are normalized into growth metrics', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  process.env.INSTAGRAM_ACCESS_TOKEN = 'test-token';
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: [
          { name: 'views', values: [{ value: 120 }] },
          { name: 'reach', values: [{ value: 100 }] },
          { name: 'shares', values: [{ value: 7 }] },
          { name: 'saved', values: [{ value: 9 }] },
          { name: 'ig_reels_avg_watch_time', values: [{ value: 4300 }] },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  try {
    const metrics = await fetchMediaInsights({ format: 'reel', instagramMediaId: 'media-1' });
    assert.equal(metrics.views, 120);
    assert.equal(metrics.shares, 7);
    assert.equal(metrics.saved, 9);
    assert.equal(metrics.averageWatchTimeMs, 4300);
  } finally {
    globalThis.fetch = previousFetch;
    process.env.INSTAGRAM_ACCESS_TOKEN = previousToken;
  }
});

test('story publishing creates a STORIES video container before publishing', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const previousAccount = process.env.INSTAGRAM_ACCOUNT_ID;
  const calls = [];
  const responses = [
    { id: 'story-container-1' },
    { id: 'story-container-1', status_code: 'FINISHED', status: 'Finished' },
    { id: 'story-media-1' },
  ];

  process.env.INSTAGRAM_ACCESS_TOKEN = 'test-token';
  process.env.INSTAGRAM_ACCOUNT_ID = 'account-1';
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method ?? 'GET' });
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await publishStoryToInstagram('https://example.com/story.mp4');
    assert.equal(result.id, 'story-media-1');
    assert.match(calls[0].url, /media_type=STORIES/);
    assert.match(calls[0].url, /video_url=https%3A%2F%2Fexample.com%2Fstory.mp4/);
    assert.match(calls[2].url, /media_publish/);
  } finally {
    globalThis.fetch = previousFetch;
    process.env.INSTAGRAM_ACCESS_TOKEN = previousToken;
    process.env.INSTAGRAM_ACCOUNT_ID = previousAccount;
  }
});
