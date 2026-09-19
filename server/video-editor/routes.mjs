import express from 'express'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile, copyFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { cloudinaryConfigured } from '../cloudinary.mjs'
import { normalizeDesign, sanitizeText } from '../design.mjs'
import { LIMITS, validateExport } from './schema.mjs'
import {
  cleanLocalFiles,
  downloadAsset,
  isEditorMediaUrl,
  localDirectory,
  readToken,
  signToken,
  uploadRenderedVideo,
  uploadTicket,
  verifyUpload,
} from './assets.mjs'
import { probe, renderProject } from './render.mjs'

export function editorRouter({ insertPost, loadPost }) {
  const router = express.Router()
  let activeExports = 0
  router.get('/capabilities', (_req, res) =>
    res.json({
      available: !process.env.VERCEL || cloudinaryConfigured(),
      cloud: cloudinaryConfigured(),
      limits: LIMITS,
      fps: [24, 30, 60],
    }),
  )
  router.post('/upload-ticket', (req, res) => {
    try {
      res.json(uploadTicket(req.body?.kind))
    } catch (e) {
      res.status(400).json({ error: e.message })
    }
  })
  router.post('/verify-upload', (req, res) => {
    try {
      res.json(verifyUpload(req.body?.ticket, req.body?.result || {}))
    } catch (e) {
      res.status(400).json({ error: e.message })
    }
  })
  router.post(
    '/assets/:id',
    express.raw({ type: 'application/octet-stream', limit: LIMITS.fileBytes }),
    async (req, res) => {
      try {
        const ticket = readToken(req.query.ticket, 'upload')
        if (
          process.env.VERCEL ||
          ticket.cloud ||
          ticket.id !== req.params.id ||
          !Buffer.isBuffer(req.body) ||
          !req.body.length
        )
          throw new Error('Invalid local upload.')
        await cleanLocalFiles()
        await writeFile(path.join(localDirectory, `${ticket.id}.media`), req.body, { flag: 'wx' })
        res.json({
          token: signToken({ purpose: 'asset', id: ticket.id, kind: ticket.kind, cloud: false }),
        })
      } catch (e) {
        res.status(400).json({ error: e.message })
      }
    },
  )
  router.post('/export', async (req, res) => {
    let manifest
    try {
      manifest = validateExport(req.body)
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }
    if (activeExports >= 1)
      return res
        .status(429)
        .json({ error: 'Another video is rendering on this worker. Please try again shortly.' })
    if (process.env.VERCEL && !cloudinaryConfigured())
      return res.status(503).json({ error: 'Cloudinary is not configured.' })
    const controller = new AbortController(),
      deadline = setTimeout(
        () =>
          controller.abort(
            new Error('Export exceeded the server time limit. Try 720p or a shorter timeline.'),
          ),
        265_000,
      )
    let directory,
      lastProgress = 0
    const emit = (data) => {
      if (!res.destroyed) res.write(JSON.stringify(data) + '\n')
    }
    res.set({
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()
    const keepAlive = setInterval(() => emit({ phase: 'heartbeat' }), 10_000)
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })
    activeExports++
    try {
      directory = await mkdtemp(path.join(os.tmpdir(), 'sf-editor-render-'))
      emit({ phase: 'preparing', progress: 0 })
      const media = new Map(),
        needed = new Set(manifest.project.clips.map((c) => c.assetId))
      let totalBytes = 0,
        loaded = 0
      for (const asset of manifest.assets.filter((a) => needed.has(a.id))) {
        const receipt = readToken(asset.token, 'asset')
        const downloaded = await downloadAsset(
          receipt,
          path.join(directory, `${asset.id}.media`),
          controller.signal,
        )
        totalBytes += downloaded.bytes
        if (totalBytes > LIMITS.totalBytes) throw new Error('Export media exceeds 250 MB.')
        const metadata = await probe(downloaded.path, controller.signal)
        if (metadata.width * metadata.height > 34_000_000)
          throw new Error('Media resolution exceeds 8K.')
        media.set(asset.id, { ...downloaded, ...metadata, kind: receipt.kind })
        emit({ phase: 'preparing', progress: Math.round((++loaded / needed.size) * 100) })
      }
      for (const c of manifest.project.clips) {
        const m = media.get(c.assetId),
          still = c.kind === 'text' || c.kind === 'image'
        if (
          !m ||
          (still
            ? m.kind !== 'image' || !m.hasVideo
            : c.kind === 'audio'
              ? !m.hasAudio
              : !m.hasVideo)
        )
          throw new Error(`Invalid media for ${c.name || 'clip'}.`)
        if (!still && c.sourceIn + c.duration * c.speed > m.duration + 0.15)
          throw new Error(`Trim exceeds the source duration: ${c.name || 'clip'}.`)
      }
      const result = await renderProject(manifest.project, manifest.settings, media, directory, {
        signal: controller.signal,
        onProgress: (fraction) => {
          const progress = Math.floor(fraction * 100)
          if (progress > lastProgress) {
            lastProgress = progress
            emit({ phase: 'rendering', progress })
          }
        },
      })
      emit({ phase: 'uploading', progress: 100 })
      const id = randomUUID()
      let url
      if (cloudinaryConfigured())
        url = await uploadRenderedVideo(result.path, id, controller.signal)
      else {
        await cleanLocalFiles()
        await copyFile(result.path, path.join(localDirectory, `${id}.mp4`))
        url = null
      }
      const data = {
          purpose: 'export',
          id,
          url,
          width: result.width,
          height: result.height,
          duration: result.duration,
          cloud: cloudinaryConfigured(),
        },
        token = signToken(data, 7 * 86400)
      const downloadUrl = url || `/api/video-editor/download?token=${encodeURIComponent(token)}`
      emit({
        phase: 'complete',
        result: {
          url: downloadUrl,
          token,
          duration: data.duration,
          width: data.width,
          height: data.height,
        },
      })
    } catch (error) {
      console.error('[video-editor]', error.message)
      emit({
        phase: 'error',
        error: controller.signal.aborted
          ? 'Export cancelled or server time limit reached. Try a shorter project or 720p.'
          : error.message.startsWith('FFmpeg failed')
            ? 'Video rendering failed. Try converting the source to MP4 or reducing the project size.'
            : error.message,
      })
    } finally {
      activeExports--
      clearTimeout(deadline)
      clearInterval(keepAlive)
      if (directory) await rm(directory, { recursive: true, force: true })
      res.end()
    }
  })
  router.get('/download', async (req, res) => {
    try {
      const result = readToken(req.query.token, 'export')
      if (result.cloud) return res.redirect(result.url)
      if (process.env.VERCEL) throw new Error('Local exports are unavailable.')
      const file = path.join(localDirectory, `${result.id}.mp4`)
      await stat(file)
      res.download(file, 'silent-forward.mp4')
    } catch {
      res.status(404).json({ error: 'This export has expired. Render the project again.' })
    }
  })
  router.post('/planner', async (req, res) => {
    try {
      const result = readToken(req.body?.token, 'export')
      if (!result.cloud || !isEditorMediaUrl(result.url))
        throw new Error('Cloudinary is required to send this export to the remote planner.')
      if (Math.abs(result.width / result.height - 9 / 16) > 0.005 || result.duration < 3)
        throw new Error(
          'Reels require a 9:16 canvas and at least 3 seconds. Export again with these settings.',
        )
      const scheduledFor = new Date(req.body.scheduledFor)
      if (!Number.isFinite(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now() + 60_000)
        throw new Error('Choose a time at least one minute in the future.')
      const existing = await loadPost(result.id)
      if (existing) return res.json(existing)
      const editorMedia = {
        url: result.url,
        width: result.width,
        height: result.height,
        duration: result.duration,
      }
      const post = {
        id: result.id,
        quote: sanitizeText(req.body.name || 'Video Editor Reel', 220),
        caption: sanitizeText(req.body.caption || '', 2200),
        format: 'reel',
        accent: '#d9ff3f',
        status: 'scheduled',
        scheduledFor: scheduledFor.toISOString(),
        createdAt: new Date().toISOString(),
        autoGenerated: false,
        mediaUrl: result.url,
        design: { ...normalizeDesign({}, 'reel'), editorMedia },
      }
      try {
        res.status(201).json(await insertPost(post))
      } catch (error) {
        const duplicate = await loadPost(result.id)
        if (duplicate) return res.json(duplicate)
        throw error
      }
    } catch (error) {
      res.status(400).json({ error: error.message || 'Could not add the video to the planner.' })
    }
  })
  router.use((error, _req, res, _next) =>
    res
      .status(error.status || 400)
      .json({
        error: error.type === 'entity.too.large' ? 'Upload exceeds 100 MB.' : error.message,
      }),
  )
  return router
}
