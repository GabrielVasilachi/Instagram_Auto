export function instagramConfigured() {
  return Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID)
}

export async function instagramRequest(pathname, options = {}) {
  if (!process.env.INSTAGRAM_ACCESS_TOKEN) throw new Error('Tokenul Instagram lipsește.')
  const url = new URL(`https://graph.instagram.com/${pathname.replace(/^\//, '')}`)
  const parameters = { ...(options.parameters || {}), access_token: process.env.INSTAGRAM_ACCESS_TOKEN }
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value))
  const response = await fetch(url, { method: options.method || 'GET' })
  const result = await response.json()
  if (!response.ok || result.error) throw new Error(result.error?.message || 'Instagram API a returnat o eroare.')
  return result
}

export async function waitForContainer(containerId) {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const status = await instagramRequest(containerId, { parameters: { fields: 'status_code,status' } })
    if (status.status_code === 'FINISHED') return
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') throw new Error(status.status || 'Instagram nu a procesat videoclipul.')
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  throw new Error('Instagram procesează videoclipul prea mult timp.')
}

export async function publishToInstagram(post, publicUrl) {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID
  if (!accountId) throw new Error('Instagram Account ID lipsește.')
  const parameters = post.format === 'reel'
    ? { media_type: 'REELS', video_url: publicUrl, caption: post.caption, share_to_feed: 'true' }
    : { image_url: publicUrl, caption: post.caption }
  const container = await instagramRequest(`${accountId}/media`, { method: 'POST', parameters })
  // Images can also remain IN_PROGRESS briefly after Meta accepts their URL.
  // Publishing before FINISHED produces the misleading "Media ID is not available" error.
  await waitForContainer(container.id)
  return instagramRequest(`${accountId}/media_publish`, { method: 'POST', parameters: { creation_id: container.id } })
}
