import 'dotenv/config'
import express from 'express'
import cron from 'node-cron'
import sharp from 'sharp'
import ffmpegPath from 'ffmpeg-static'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDatabase, saveDatabase } from './database.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mediaDir = path.join(root, 'generated')
const quotesFile = path.join(root, 'content', 'quotes.json')
const port = Number(process.env.API_PORT || 5174)
const app = express()

app.use(express.json({ limit: '1mb' }))
app.use('/media', express.static(mediaDir))

async function ensureStorage() {
  await mkdir(mediaDir, { recursive: true })
}

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[char])
}

function wrapText(text, maxCharacters) {
  const words = text.trim().split(/\s+/)
  const lines = []
  let line = ''

  for (const word of words) {
    if (`${line} ${word}`.trim().length > maxCharacters && line) {
      lines.push(line)
      line = word
    } else {
      line = `${line} ${word}`.trim()
    }
  }

  if (line) lines.push(line)

  return lines.slice(0, 8)
}

const captionHooks = [
  'Save this for the day you need it most.',
  'Read it twice. Then act on it.',
  'Your reminder to keep moving forward.',
  'Send this to someone who refuses to quit.',
]

const hashtagSets = [
  '#motivation #discipline #mindset #selfimprovement #successmindset #dailyquotes #motivationalquotes #growthmindset #consistency #focus #personaldevelopment #silentforward',
  '#motivationdaily #disciplineequalsfreedom #mindsetshift #mentalstrength #inspirationdaily #positivehabits #goals #productivity #selfgrowth #keepgoing #nevergiveup #silentforward',
  '#motivationalreels #reelsmotivation #mindsetmatters #dailymotivation #hardwork #successquotes #confidence #betterself #lifequotes #inspire #progress #silentforward',
]

function buildCaption(quote, format, cursor) {
  const hook = captionHooks[cursor % captionHooks.length]

  const hashtags =
    hashtagSets[
      (cursor + (format === 'reel' ? 1 : 0)) %
        hashtagSets.length
    ]

  return `${hook}

${quote}

Quiet work. Visible results. Follow @silentforward for a daily reset.

${hashtags}`
}

function dateAtTime(reference, time) {
  const date = new Date(reference)
  const [hours, minutes] = time.split(':').map(Number)

  date.setHours(hours, minutes, 0, 0)

  return date
}

function addDays(date, amount) {
  const copy = new Date(date)

  copy.setDate(copy.getDate() + amount)

  return copy
}

function firstAvailableSlot(time, forceTomorrow = false) {
  const now = new Date()
  let slot = dateAtTime(now, time)

  if (forceTomorrow || slot <= now) {
    slot = addDays(slot, 1)
  }

  return slot
}

function rebalanceScheduled(database, publishedFormat = null) {
  for (const format of ['post', 'reel']) {
    const time =
      format === 'post'
        ? database.settings.postTime
        : database.settings.reelTime

    let slot = firstAvailableSlot(
      time,
      format === publishedFormat,
    )

    const pending = database.posts
      .filter(
        (post) =>
          post.status === 'scheduled' &&
          post.format === format,
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledFor) -
          new Date(b.scheduledFor),
      )

    for (const post of pending) {
      post.scheduledFor = slot.toISOString()
      slot = addDays(slot, 1)
    }
  }

  database.posts.sort(
    (a, b) =>
      new Date(a.scheduledFor) -
      new Date(b.scheduledFor),
  )
}

async function generateImage(
  post,
  targetPath,
  layer = 'complete',
) {
  const width = 1080
  const height = post.format === 'reel' ? 1920 : 1350

  const lines = wrapText(
    post.quote,
    post.format === 'reel' ? 22 : 25,
  )

  const fontSize = post.format === 'reel' ? 88 : 76
  const lineHeight = Math.round(fontSize * 1.12)
  const totalHeight = lines.length * lineHeight
  const startY = Math.round(
    (height - totalHeight) / 2,
  )

  const text = lines
    .map(
      (line, index) =>
        `<text x="90" y="${
          startY + index * lineHeight
        }" fill="#f6f6f2" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700">${escapeXml(
          line,
        )}</text>`,
    )
    .join('')

  const background =
    layer === 'text'
      ? ''
      : `<defs><radialGradient id="bg" cx="82%" cy="14%"><stop offset="0" stop-color="#282b2e"/><stop offset="0.35" stop-color="#111315"/><stop offset="1" stop-color="#070809"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/><circle cx="1020" cy="30" r="240" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2"/><text x="90" y="105" fill="#777b80" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="7">SILENT FORWARD</text><text x="90" y="${
          height - 70
        }" fill="#676b70" font-family="Arial, sans-serif" font-size="20">@silentforward</text>`

  const quoteLayer =
    layer === 'background'
      ? ''
      : `${text}<rect x="90" y="${
          startY + totalHeight + 34
        }" width="150" height="12" rx="6" fill="${
          post.accent
        }"/>`

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${background}${quoteLayer}</svg>`

  await sharp(Buffer.from(svg))
    .png({ quality: 94 })
    .toFile(targetPath)
}

async function generateMedia(post) {
  const imagePath = path.join(
    mediaDir,
    `${post.id}.png`,
  )

  if (post.format === 'post') {
    await generateImage(post, imagePath)
    return imagePath
  }

  if (!ffmpegPath) {
    throw new Error(
      'Generatorul video nu este disponibil.',
    )
  }

  const backgroundPath = path.join(
    mediaDir,
    `${post.id}-background.png`,
  )

  const textPath = path.join(
    mediaDir,
    `${post.id}-text.png`,
  )

  await generateImage(
    post,
    backgroundPath,
    'background',
  )

  await generateImage(
    post,
    textPath,
    'text',
  )

  const videoPath = path.join(
    mediaDir,
    `${post.id}.mp4`,
  )

  await new Promise((resolve, reject) => {
    const ambientTone =
      'aevalsrc=0.018*(sin(2*PI*174*t)+sin(2*PI*220*t)+sin(2*PI*261.63*t)):s=44100:d=8'

    const filters =
      '[1:v]format=rgba,fade=t=in:st=0:duration=1:alpha=1[text];[0:v][text]overlay=0:0:shortest=1,format=yuv420p[v];[2:a]afade=t=in:st=0:duration=1,afade=t=out:st=7:duration=1,volume=0.65[a]'

    const child = spawn(ffmpegPath, [
      '-y',
      '-loop',
      '1',
      '-i',
      backgroundPath,
      '-loop',
      '1',
      '-i',
      textPath,
      '-f',
      'lavfi',
      '-i',
      ambientTone,
      '-t',
      '8',
      '-filter_complex',
      filters,
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-c:a',
      'aac',
      '-shortest',
      videoPath,
    ])

    let error = ''

    child.stderr.on('data', (chunk) => {
      error += chunk.toString()
    })

    child.on('error', reject)

    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Generarea video a eșuat: ${error.slice(
                -240,
              )}`,
            ),
          ),
    )
  })

  return videoPath
}

function cloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  )
}

async function uploadToCloudinary(
  filePath,
  format,
) {
  if (!cloudinaryConfigured()) {
    throw new Error(
      'Configurează Cloudinary pentru a publica materiale pe Instagram.',
    )
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const folder = 'silent-forward'

  const signature = createHash('sha1')
    .update(
      `folder=${folder}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`,
    )
    .digest('hex')

  const body = new FormData()

  body.set(
    'file',
    new Blob([await readFile(filePath)]),
    path.basename(filePath),
  )

  body.set(
    'api_key',
    process.env.CLOUDINARY_API_KEY,
  )

  body.set(
    'timestamp',
    String(timestamp),
  )

  body.set('folder', folder)
  body.set('signature', signature)

  const resourceType =
    format === 'reel' ? 'video' : 'image'

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    {
      method: 'POST',
      body,
    },
  )

  const result = await response.json()

  if (!response.ok) {
    throw new Error(
      result.error?.message ||
        'Încărcarea materialului a eșuat.',
    )
  }

  return result.secure_url
}

async function instagramRequest(
  pathname,
  options = {},
) {
  const token =
    process.env.INSTAGRAM_ACCESS_TOKEN

  if (!token) {
    throw new Error(
      'Tokenul Instagram lipsește.',
    )
  }

  const url = new URL(
    `https://graph.instagram.com/${pathname.replace(
      /^\//,
      '',
    )}`,
  )

  const parameters = {
    ...(options.parameters || {}),
    access_token: token,
  }

  for (const [key, value] of Object.entries(
    parameters,
  )) {
    url.searchParams.set(key, String(value))
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
  })

  const result = await response.json()

  if (!response.ok || result.error) {
    throw new Error(
      result.error?.message ||
        'Instagram API a returnat o eroare.',
    )
  }

  return result
}

async function waitForContainer(containerId) {
  for (
    let attempt = 0;
    attempt < 36;
    attempt += 1
  ) {
    const status = await instagramRequest(
      containerId,
      {
        parameters: {
          fields: 'status_code,status',
        },
      },
    )

    if (status.status_code === 'FINISHED') {
      return
    }

    if (
      status.status_code === 'ERROR' ||
      status.status_code === 'EXPIRED'
    ) {
      throw new Error(
        status.status ||
          'Instagram nu a procesat videoclipul.',
      )
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 5000),
    )
  }

  throw new Error(
    'Instagram procesează videoclipul prea mult timp.',
  )
}

async function publishPost(postId) {
  const database = await loadDatabase()

  const post = database.posts.find(
    (item) => item.id === postId,
  )

  if (!post) {
    throw new Error('Postarea nu există.')
  }

  if (post.status === 'published') {
    return post
  }

  post.status = 'publishing'
  post.error = ''

  await saveDatabase(database)

  try {
    const filePath =
      await generateMedia(post)

    post.mediaUrl = `/media/${path.basename(
      filePath,
    )}`

    await saveDatabase(database)

    const publicUrl =
      await uploadToCloudinary(
        filePath,
        post.format,
      )

    const accountId =
      process.env.INSTAGRAM_ACCOUNT_ID

    if (!accountId) {
      throw new Error(
        'Instagram Account ID lipsește.',
      )
    }

    const parameters =
      post.format === 'reel'
        ? {
            media_type: 'REELS',
            video_url: publicUrl,
            caption: post.caption,
            share_to_feed: 'true',
          }
        : {
            image_url: publicUrl,
            caption: post.caption,
          }

    const container =
      await instagramRequest(
        `${accountId}/media`,
        {
          method: 'POST',
          parameters,
        },
      )

    if (post.format === 'reel') {
      await waitForContainer(container.id)
    }

    const published =
      await instagramRequest(
        `${accountId}/media_publish`,
        {
          method: 'POST',
          parameters: {
            creation_id: container.id,
          },
        },
      )

    post.status = 'published'
    post.instagramMediaId = published.id
    post.publishedAt =
      new Date().toISOString()

    rebalanceScheduled(
      database,
      post.format,
    )

    await saveDatabase(database)
    await fillQueue()

    return post
  } catch (error) {
    post.status = 'failed'

    post.error =
      error instanceof Error
        ? error.message
        : 'Publicarea a eșuat.'

    await saveDatabase(database)

    throw error
  }
}

async function fillQueue() {
  const database = await loadDatabase()

  const quotes = JSON.parse(
    await readFile(quotesFile, 'utf8'),
  )

  const isMigration =
    database.schemaVersion !== 2

  for (const format of ['post', 'reel']) {
    const pending = database.posts
      .filter(
        (post) =>
          post.status === 'scheduled' &&
          post.format === format,
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledFor) -
          new Date(b.scheduledFor),
      )

    const needed = Math.max(
      0,
      database.settings.queueDays -
        pending.length,
    )

    const time =
      format === 'post'
        ? database.settings.postTime
        : database.settings.reelTime

    let nextSlot = pending.length
      ? addDays(
          dateAtTime(
            new Date(
              pending.at(-1).scheduledFor,
            ),
            time,
          ),
          1,
        )
      : firstAvailableSlot(time)

    for (
      let index = 0;
      index < needed;
      index += 1
    ) {
      const quote =
        quotes[
          database.quoteCursor %
            quotes.length
        ]

      const cursor =
        database.quoteCursor

      database.quoteCursor += 1

      database.posts.push({
        id: randomUUID(),
        quote,
        caption: buildCaption(
          quote,
          format,
          cursor,
        ),
        accent: [
          '#d9ff3f',
          '#ff5c35',
          '#62e6ff',
          '#d8a7ff',
        ][cursor % 4],
        format,
        status: 'scheduled',
        scheduledFor:
          nextSlot.toISOString(),
        createdAt:
          new Date().toISOString(),
        autoGenerated: true,
      })

      nextSlot = addDays(
        nextSlot,
        1,
      )
    }
  }

  if (isMigration) {
    database.schemaVersion = 2

    for (const post of database.posts.filter(
      (item) =>
        item.status === 'scheduled',
    )) {
      post.caption = buildCaption(
        post.quote,
        post.format,
        database.quoteCursor++,
      )

      post.autoGenerated = true
    }

    rebalanceScheduled(database)
  }

  database.posts.sort(
    (a, b) =>
      new Date(a.scheduledFor) -
      new Date(b.scheduledFor),
  )

  await saveDatabase(database)
}

async function checkSchedule() {
  const database = await loadDatabase()

  if (!database.settings.autopilot) {
    return
  }

  const due = database.posts.find(
    (post) =>
      post.status === 'scheduled' &&
      new Date(post.scheduledFor) <=
        new Date(),
  )

  if (due) {
    publishPost(due.id).catch(
      (error) =>
        console.error(
          `[scheduler] ${error.message}`,
        ),
    )
  }
}

app.get(
  '/api/dashboard',
  async (_request, response) => {
    const database = await loadDatabase()

    let account = {
      connected: false,
      username: 'silentforward',
      accountType: 'BUSINESS',
    }

    if (
      process.env.INSTAGRAM_ACCESS_TOKEN
    ) {
      try {
        const profile =
          await instagramRequest('me', {
            parameters: {
              fields:
                'user_id,username,account_type',
            },
          })

        account = {
          connected: true,
          username: profile.username,
          accountType:
            profile.account_type,
        }
      } catch {
        // Dashboard remains usable offline.
      }
    }

    response.json({
      account,
      publishingReady:
        cloudinaryConfigured(),
      settings: database.settings,
      posts: database.posts,
      stats: {
        scheduled:
          database.posts.filter(
            (post) =>
              post.status ===
              'scheduled',
          ).length,

        published:
          database.posts.filter(
            (post) =>
              post.status ===
              'published',
          ).length,

        failed:
          database.posts.filter(
            (post) =>
              post.status === 'failed',
          ).length,
      },
    })
  },
)

app.post(
  '/api/posts',
  async (request, response) => {
    const {
      quote,
      caption = '',
      accent = '#d9ff3f',
      format = 'post',
      scheduledFor,
    } = request.body

    if (
      !quote?.trim() ||
      !scheduledFor ||
      !['post', 'reel'].includes(
        format,
      )
    ) {
      return response
        .status(400)
        .json({
          error:
            'Completează mesajul, formatul și data.',
        })
    }

    const database =
      await loadDatabase()

    const post = {
      id: randomUUID(),
      quote: quote.trim(),
      caption: caption.trim(),
      accent,
      format,
      status: 'scheduled',
      scheduledFor,
      createdAt:
        new Date().toISOString(),
    }

    try {
      const mediaPath =
        await generateMedia(post)

      post.mediaUrl = `/media/${path.basename(
        mediaPath,
      )}`
    } catch (error) {
      return response
        .status(500)
        .json({
          error:
            error instanceof Error
              ? error.message
              : 'Materialul nu a putut fi generat.',
        })
    }

    database.posts.push(post)

    database.posts.sort(
      (a, b) =>
        new Date(a.scheduledFor) -
        new Date(b.scheduledFor),
    )

    await saveDatabase(database)

    response
      .status(201)
      .json(post)
  },
)

app.patch(
  '/api/settings',
  async (request, response) => {
    const database =
      await loadDatabase()

    for (const key of [
      'autopilot',
      'postTime',
      'reelTime',
      'timezone',
      'queueDays',
    ]) {
      if (key in request.body) {
        database.settings[key] =
          request.body[key]
      }
    }

    if (
      'postTime' in request.body ||
      'reelTime' in request.body
    ) {
      rebalanceScheduled(database)
    }

    await saveDatabase(database)

    response.json(database.settings)
  },
)

app.post(
  '/api/posts/:id/preview',
  async (request, response) => {
    const database =
      await loadDatabase()

    const post = database.posts.find(
      (item) =>
        item.id === request.params.id,
    )

    if (!post) {
      return response
        .status(404)
        .json({
          error: 'Postarea nu există.',
        })
    }

    try {
      const mediaPath =
        await generateMedia(post)

      post.mediaUrl = `/media/${path.basename(
        mediaPath,
      )}?v=${Date.now()}`

      await saveDatabase(database)

      response.json(post)
    } catch (error) {
      response
        .status(500)
        .json({
          error:
            error instanceof Error
              ? error.message
              : 'Previzualizarea nu a putut fi generată.',
        })
    }
  },
)

app.post(
  '/api/posts/:id/publish',
  async (request, response) => {
    try {
      response.json(
        await publishPost(
          request.params.id,
        ),
      )
    } catch (error) {
      response
        .status(400)
        .json({
          error:
            error instanceof Error
              ? error.message
              : 'Publicarea a eșuat.',
        })
    }
  },
)

app.delete(
  '/api/posts/:id',
  async (request, response) => {
    const database =
      await loadDatabase()

    const index =
      database.posts.findIndex(
        (post) =>
          post.id === request.params.id,
      )

    if (index === -1) {
      return response
        .status(404)
        .json({
          error: 'Postarea nu există.',
        })
    }

    const [post] =
      database.posts.splice(
        index,
        1,
      )

    await saveDatabase(database)

    for (const suffix of [
      '.png',
      '.mp4',
      '-background.png',
      '-text.png',
    ]) {
      try {
        await unlink(
          path.join(
            mediaDir,
            `${post.id}${suffix}`,
          ),
        )
      } catch {
        // Fișierul poate să nu existe.
      }
    }

    response.status(204).end()
  },
)

app.get(
  '/api/health',
  (_request, response) =>
    response.json({ ok: true }),
)

await ensureStorage()
await fillQueue()

cron.schedule(
  '* * * * *',
  checkSchedule,
  {
    timezone: 'Europe/Chisinau',
  },
)

cron.schedule(
  '5 * * * *',
  fillQueue,
  {
    timezone: 'Europe/Chisinau',
  },
)

app.listen(
  port,
  '127.0.0.1',
  () =>
    console.log(
      `Silent Forward API: http://127.0.0.1:${port}`,
    ),
)