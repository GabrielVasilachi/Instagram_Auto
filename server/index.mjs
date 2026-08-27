import 'dotenv/config'
import express from 'express'
import cron from 'node-cron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expiredSessionCookie, isAllowedOrigin, issueSession, passwordMatches, readSessionCookie, sessionCookie, verifySession } from './auth.mjs'
import { cloudinaryConfigured, uploadToCloudinary } from './cloudinary.mjs'
import { claimPostForPublishing, deletePost, insertPost, insertPosts, loadDatabase, loadPost, savePost, updateSettings } from './database.mjs'
import { DESIGN_OPTIONS, normalizeAccent, normalizeDesign, randomizedDesign, sanitizeText } from './design.mjs'
import { instagramConfigured, instagramRequest, publishToInstagram } from './instagram.mjs'
import { generateImage, generateMedia } from './media.mjs'
import { withRemoteRetries } from './retry.mjs'
import { addDaysAtTime, firstAvailableSlot } from './time.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mediaDirectory = process.env.VERCEL ? '/tmp/generated' : path.join(root, 'generated')
const quotesFile = path.join(root, 'content', 'quotes.json')
const port = Number(process.env.API_PORT || 5174)
const app = express()
const loginAttempts = new Map()
let accountCache = { expiresAt: 0, value: null }

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(express.json({ limit: '256kb' }))
app.use((_request, response, next) => {
  response.set({
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  })
  next()
})

function secureRequest(request) {
  return request.secure || request.get('x-forwarded-proto') === 'https' || Boolean(process.env.VERCEL)
}

function authConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.SESSION_SECRET)
}

function authenticated(request) {
  return authConfigured() && verifySession(readSessionCookie(request), process.env.SESSION_SECRET)
}

function requireAuthentication(request, response, next) {
  if (!authConfigured()) return response.status(503).json({ error: 'Autentificarea nu este configurată pe server.' })
  if (!authenticated(request)) return response.status(401).json({ error: 'Autentificare necesară.' })
  next()
}

function validateOrigin(request, response, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !isAllowedOrigin(request)) {
    return response.status(403).json({ error: 'Originea cererii nu este permisă.' })
  }
  next()
}

function attemptState(request) {
  const key = request.ip || 'unknown'
  const now = Date.now()
  const current = loginAttempts.get(key)
  if (!current || current.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + 15 * 60_000 }
    loginAttempts.set(key, fresh)
    return fresh
  }
  return current
}

app.get('/api/health', (_request, response) => response.json({ ok: true }))

app.get('/api/auth/session', (request, response) => {
  response.json({ authenticated: authenticated(request), configured: authConfigured() })
})

app.post('/api/auth/login', validateOrigin, (request, response) => {
  if (!authConfigured()) return response.status(503).json({ error: 'Autentificarea nu este configurată pe server.' })
  const attempts = attemptState(request)
  if (attempts.count >= 8) return response.status(429).json({ error: 'Prea multe încercări. Reîncearcă peste 15 minute.' })
  if (!passwordMatches(request.body?.password, process.env.ADMIN_PASSWORD)) {
    attempts.count += 1
    return response.status(401).json({ error: 'Parola nu este corectă.' })
  }
  loginAttempts.delete(request.ip || 'unknown')
  response.setHeader('Set-Cookie', sessionCookie(issueSession(process.env.SESSION_SECRET), secureRequest(request)))
  response.json({ authenticated: true })
})

app.post('/api/auth/logout', validateOrigin, (request, response) => {
  response.setHeader('Set-Cookie', expiredSessionCookie(secureRequest(request)))
  response.status(204).end()
})

app.use('/api', requireAuthentication, validateOrigin)

function captionFor(quote, format, cursor) {
  const hooks = [
    'Save this for the day you need it most.',
    'Read it twice. Then act on it.',
    'Your reminder to keep moving forward.',
    'Send this to someone who refuses to quit.',
    'A quiet reminder for the work nobody sees.',
    'Keep this close when motivation gets quiet.',
  ]
  const hashtagSets = [
    '#motivation #discipline #mindset #selfimprovement #successmindset #dailyquotes #growthmindset #consistency #focus #personaldevelopment #silentforward',
    '#motivationdaily #disciplineequalsfreedom #mindsetshift #mentalstrength #inspirationdaily #positivehabits #goals #productivity #selfgrowth #keepgoing #silentforward',
    '#motivationalreels #reelsmotivation #mindsetmatters #dailymotivation #hardwork #successquotes #confidence #betterself #lifequotes #progress #silentforward',
    '#quietgrowth #deepwork #dailyfocus #resilience #habits #purpose #momentum #buildinpublic #mindsetcoach #forward #silentforward',
  ]
  const hook = hooks[cursor % hooks.length]
  const hashtags = hashtagSets[(cursor + (format === 'reel' ? 1 : 0)) % hashtagSets.length]
  return `${hook}\n\n${quote}\n\nQuiet work. Visible results. Follow @silentforward for a daily reset.\n\n${hashtags}`
}

function validTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ''))
}

function validTimezone(value) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

function normalizePostInput(body, existing = null) {
  const format = ['post', 'reel'].includes(body.format) ? body.format : existing?.format ?? 'post'
  const quote = sanitizeText(body.quote ?? existing?.quote, 220)
  const caption = sanitizeText(body.caption ?? existing?.caption, 2200)
  const date = new Date(body.scheduledFor ?? existing?.scheduledFor)
  if (!quote || Number.isNaN(date.getTime())) throw new Error('Completează mesajul și o dată validă.')
  return {
    ...(existing ?? {}),
    quote,
    caption,
    accent: normalizeAccent(body.accent ?? existing?.accent),
    format,
    scheduledFor: date.toISOString(),
    design: normalizeDesign(body.design ?? existing?.design, format),
  }
}

async function profile() {
  if (accountCache.value && accountCache.expiresAt > Date.now()) return accountCache.value
  let value = { connected: false, username: 'silentforward', accountType: 'BUSINESS' }
  if (process.env.INSTAGRAM_ACCESS_TOKEN) {
    try {
      const remote = await instagramRequest('me', { parameters: { fields: 'user_id,username,account_type' } })
      value = { connected: true, username: remote.username, accountType: remote.account_type }
    } catch {
      // The queue remains available when Instagram profile lookup is temporarily unavailable.
    }
  }
  accountCache = { value, expiresAt: Date.now() + 10 * 60_000 }
  return value
}

app.get('/api/dashboard', async (_request, response) => {
  const [database, account] = await Promise.all([loadDatabase(), profile()])
  response.json({
    account,
    publishingReady: cloudinaryConfigured() && instagramConfigured(),
    settings: database.settings,
    designOptions: DESIGN_OPTIONS,
    posts: database.posts,
    stats: {
      scheduled: database.posts.filter((post) => post.status === 'scheduled').length,
      published: database.posts.filter((post) => post.status === 'published').length,
      failed: database.posts.filter((post) => post.status === 'failed').length,
    },
  })
})

app.get('/api/quotes/random', async (request, response) => {
  const quotes = JSON.parse(await readFile(quotesFile, 'utf8'))
  const count = Math.min(8, Math.max(1, Number(request.query.count) || 1))
  const start = Math.floor(Math.random() * quotes.length)
  response.json(Array.from({ length: count }, (_value, index) => quotes[(start + index) % quotes.length]))
})

app.post('/api/posts', async (request, response) => {
  try {
    const values = normalizePostInput(request.body)
    const post = await insertPost({
      id: randomUUID(),
      ...values,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      autoGenerated: false,
    })
    response.status(201).json(post)
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Postarea nu a putut fi creată.' })
  }
})

app.patch('/api/posts/:id', async (request, response) => {
  const existing = await loadPost(request.params.id)
  if (!existing) return response.status(404).json({ error: 'Postarea nu există.' })
  if (['published', 'publishing'].includes(existing.status)) return response.status(409).json({ error: 'O postare publicată sau în curs de publicare nu mai poate fi editată.' })
  try {
    const updated = normalizePostInput(request.body, existing)
    response.json(await savePost({ ...updated, status: 'scheduled', error: '', autoGenerated: false, mediaUrl: null }))
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Postarea nu a putut fi actualizată.' })
  }
})

app.post('/api/posts/:id/duplicate', async (request, response) => {
  const existing = await loadPost(request.params.id)
  if (!existing) return response.status(404).json({ error: 'Postarea nu există.' })
  const scheduledFor = request.body?.scheduledFor || new Date(Math.max(Date.now() + 3_600_000, new Date(existing.scheduledFor).getTime() + 86_400_000)).toISOString()
  const duplicate = await insertPost({
    ...existing,
    id: randomUUID(),
    scheduledFor,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    autoGenerated: false,
    mediaUrl: null,
    instagramMediaId: null,
    publishedAt: null,
    error: '',
  })
  response.status(201).json(duplicate)
})

app.post('/api/posts/:id/preview', async (request, response) => {
  const post = await loadPost(request.params.id)
  if (!post) return response.status(404).json({ error: 'Postarea nu există.' })
  response.json({ ...post, mediaUrl: `/api/posts/${post.id}/media?v=${Date.now()}` })
})

app.get('/api/posts/:id/media', async (request, response) => {
  const post = await loadPost(request.params.id)
  if (!post) return response.status(404).json({ error: 'Postarea nu există.' })
  await mkdir(mediaDirectory, { recursive: true })
  const previewPost = { ...post, id: `${post.id}-preview-${Date.now()}` }
  const filePath = post.format === 'reel'
    ? await generateMedia(previewPost, mediaDirectory)
    : await generateImage(previewPost, path.join(mediaDirectory, `${previewPost.id}.png`))
  response.type(post.format === 'reel' ? 'video/mp4' : 'image/png')
  response.sendFile(filePath, () => unlink(filePath).catch(() => {}))
})

async function fillQueue() {
  const database = await loadDatabase()
  const quotes = JSON.parse(await readFile(quotesFile, 'utf8'))
  const additions = []
  let cursor = database.quoteCursor

  for (const format of ['post', 'reel']) {
    const pending = database.posts
      .filter((post) => post.status === 'scheduled' && post.format === format)
      .sort((left, right) => new Date(left.scheduledFor) - new Date(right.scheduledFor))
    const needed = Math.max(0, database.settings.queueDays - pending.length)
    const time = format === 'post' ? database.settings.postTime : database.settings.reelTime
    let nextSlot = pending.length
      ? addDaysAtTime(new Date(pending.at(-1).scheduledFor), 1, time, database.settings.timezone)
      : firstAvailableSlot(time, database.settings.timezone)

    for (let index = 0; index < needed; index += 1) {
      const quote = quotes[cursor % quotes.length]
      additions.push({
        id: randomUUID(),
        quote,
        caption: captionFor(quote, format, cursor),
        accent: ['#d9ff3f', '#ff5c35', '#62e6ff', '#d8a7ff', '#ffcf5c', '#71f6a5'][cursor % 6],
        format,
        status: 'scheduled',
        scheduledFor: nextSlot.toISOString(),
        createdAt: new Date().toISOString(),
        autoGenerated: true,
        design: randomizedDesign(cursor, format),
      })
      cursor += 1
      nextSlot = addDaysAtTime(nextSlot, 1, time, database.settings.timezone)
    }
  }

  await insertPosts(additions)
  await updateSettings({ ...database.settings, schemaVersion: 3 }, cursor)
  return additions
}

async function publishPost(postId) {
  const existing = await loadPost(postId)
  if (!existing) throw new Error('Postarea nu există.')
  if (existing.status === 'published') return existing
  const post = await claimPostForPublishing(postId)
  if (!post) throw new Error('Postarea este deja procesată de un alt job.')
  let filePath
  try {
    await mkdir(mediaDirectory, { recursive: true })
    filePath = await generateMedia(post, mediaDirectory)
    const publicUrl = await uploadToCloudinary(filePath, post)
    const published = await publishToInstagram(post, publicUrl)
    const result = await savePost({
      ...post,
      status: 'published',
      mediaUrl: publicUrl,
      instagramMediaId: published.id,
      publishedAt: new Date().toISOString(),
      error: '',
    })
    await fillQueue()
    return result
  } catch (error) {
    await savePost({ ...post, status: 'failed', error: error instanceof Error ? error.message : 'Publicarea a eșuat.' })
    throw error
  } finally {
    if (filePath) await unlink(filePath).catch(() => {})
  }
}

app.post('/api/posts/:id/publish', async (request, response) => {
  try {
    response.json(await publishPost(request.params.id))
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Publicarea a eșuat.' })
  }
})

app.delete('/api/posts/:id', async (request, response) => {
  const post = await loadPost(request.params.id)
  if (!post) return response.status(404).json({ error: 'Postarea nu există.' })
  if (['published', 'publishing'].includes(post.status)) return response.status(409).json({ error: 'Istoricul unei postări publicate nu poate fi șters din dashboard.' })
  await deletePost(post.id)
  response.status(204).end()
})

app.patch('/api/settings', async (request, response) => {
  const database = await loadDatabase()
  const settings = { ...database.settings }
  if ('autopilot' in request.body) settings.autopilot = Boolean(request.body.autopilot)
  if ('postTime' in request.body) {
    if (!validTime(request.body.postTime)) return response.status(400).json({ error: 'Ora postării nu este validă.' })
    settings.postTime = request.body.postTime
  }
  if ('reelTime' in request.body) {
    if (!validTime(request.body.reelTime)) return response.status(400).json({ error: 'Ora Reel-ului nu este validă.' })
    settings.reelTime = request.body.reelTime
  }
  if ('timezone' in request.body) {
    if (!validTimezone(request.body.timezone)) return response.status(400).json({ error: 'Fusul orar nu este valid.' })
    settings.timezone = request.body.timezone
  }
  if ('queueDays' in request.body) settings.queueDays = Math.min(30, Math.max(3, Number(request.body.queueDays) || settings.queueDays))
  response.json(await updateSettings({ ...settings, schemaVersion: 3 }))
})

async function publishDuePosts(limit = 4) {
  const database = await loadDatabase()
  if (!database.settings.autopilot) return []
  const due = database.posts
    .filter((post) => post.status === 'scheduled' && new Date(post.scheduledFor) <= new Date())
    .sort((left, right) => new Date(left.scheduledFor) - new Date(right.scheduledFor))
    .slice(0, limit)
  const results = []
  const errors = []
  for (const post of due) {
    try {
      console.log(`[publisher] Publicăm ${post.format}: ${post.id}`)
      results.push(await publishPost(post.id))
      console.log(`[publisher] Publicare finalizată: ${post.id}`)
    } catch (error) {
      errors.push(error)
      console.error(`[publisher] ${error instanceof Error ? error.message : error}`)
    }
  }
  if (!due.length) console.log('[publisher] Nu există postări scadente.')
  if (errors.length) throw errors[0]
  return results
}

app.use((error, _request, response, _next) => {
  console.error('[api]', error instanceof Error ? error.message : error)
  response.status(500).json({ error: 'Serverul a întâmpinat o eroare. Încearcă din nou.' })
})

await mkdir(mediaDirectory, { recursive: true })

if (process.env.RUN_ONCE === 'true') {
  await withRemoteRetries(async () => {
    await fillQueue()
    await publishDuePosts()
  }, {
    attempts: 5,
    baseDelayMs: 15_000,
    onRetry: ({ attempt, delayMs, error }) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[publisher] Serviciu remote indisponibil temporar (${message}). Reîncercarea ${attempt + 1}/5 începe în ${Math.round(delayMs / 1000)}s.`)
    },
  })
  process.exit(0)
}

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  await fillQueue()
  cron.schedule('* * * * *', () => publishDuePosts().catch((error) => console.error(`[scheduler] ${error.message}`)), { timezone: 'Europe/Chisinau' })
  cron.schedule('5 * * * *', () => fillQueue().catch((error) => console.error(`[queue] ${error.message}`)), { timezone: 'Europe/Chisinau' })
  app.listen(port, '127.0.0.1', () => console.log(`Silent Forward API: http://127.0.0.1:${port}`))
}

export { fillQueue, publishDuePosts, publishPost }
export default app
