import test from 'node:test'
import assert from 'node:assert/strict'
import { publishToInstagram } from '../server/instagram.mjs'

test('image containers reach FINISHED before media_publish is called', async () => {
  const previousFetch = globalThis.fetch
  const previousToken = process.env.INSTAGRAM_ACCESS_TOKEN
  const previousAccount = process.env.INSTAGRAM_ACCOUNT_ID
  const calls = []
  const responses = [
    { id: 'container-1' },
    { id: 'container-1', status_code: 'FINISHED', status: 'Finished' },
    { id: 'media-1' },
  ]

  process.env.INSTAGRAM_ACCESS_TOKEN = 'test-token'
  process.env.INSTAGRAM_ACCOUNT_ID = 'account-1'
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method ?? 'GET' })
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const result = await publishToInstagram({ format: 'post', caption: 'Caption' }, 'https://example.com/image.png')
    assert.equal(result.id, 'media-1')
    assert.match(calls[0].url, /account-1\/media/)
    assert.match(calls[1].url, /container-1/)
    assert.match(calls[1].url, /status_code/)
    assert.match(calls[2].url, /account-1\/media_publish/)
  } finally {
    globalThis.fetch = previousFetch
    process.env.INSTAGRAM_ACCESS_TOKEN = previousToken
    process.env.INSTAGRAM_ACCOUNT_ID = previousAccount
  }
})
