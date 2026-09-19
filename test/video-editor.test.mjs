import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'
import ts from 'typescript'
const modelSource = await readFile(new URL('../src/video-editor/model.ts', import.meta.url), 'utf8')
const modelJs = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { newProject, mediaClip, textClip, splitClip, trimClip, snapTime, dimensions } = await import(
  `data:text/javascript;base64,${Buffer.from(modelJs).toString('base64')}`
)
import { validateExport } from '../server/video-editor/schema.mjs'
import { buildGraph, probe, renderProject, runFFmpeg } from '../server/video-editor/render.mjs'
import {
  readToken,
  signToken,
  verifyUpload,
  uploadTicket,
  cloudSignature,
  isEditorMediaUrl,
} from '../server/video-editor/assets.mjs'
import { normalizeDesign } from '../server/design.mjs'

const settings = { resolution: 720, fps: 24, quality: 'standard' }
const asset = {
  id: 'asset',
  name: 'Test video',
  kind: 'video',
  duration: 10,
  width: 320,
  height: 180,
  size: 1000,
  mime: 'video/mp4',
}
function project() {
  return {
    ...newProject(),
    ratio: '16:9',
    background: '#000000',
    assets: [asset],
    clips: [mediaClip(asset, 0)],
  }
}

test('split preserves source mapping at non-unit speed and respects locked tracks', () => {
  const p = project(),
    c = p.clips[0]
  c.sourceIn = 1
  c.speed = 2
  c.duration = 4
  const split = splitClip(p, c.id, 1.5)
  assert.equal(split.clips.length, 2)
  assert.equal(split.clips[0].duration, 1.5)
  assert.equal(split.clips[1].sourceIn, 4)
  assert.equal(split.clips[1].duration, 2.5)
  assert.equal(splitClip(p, c.id, 0), p)
  p.tracks.find((t) => t.id === c.track).locked = true
  assert.equal(splitClip(p, c.id, 2), p)
})
test('trim cannot read before or beyond source and snaps to nearby boundaries', () => {
  const c = mediaClip(asset, 3)
  c.sourceIn = 2
  c.speed = 2
  c.duration = 3
  const left = trimClip(c, 'left', -10, 10, 30)
  assert.equal(left.start, 2)
  assert.equal(left.sourceIn, 0)
  assert.equal(left.duration, 4)
  assert.equal(trimClip(c, 'right', 100, 10, 30).duration, 4)
  assert.equal(snapTime(3.03, project(), '', 3, 0.1), 3)
  assert.equal(snapTime(3.3, project(), '', 3, 0.1), 3.3)
  assert.deepEqual(dimensions('9:16', 720), { width: 720, height: 1280 })
})
test('export validation rejects injection, missing media, duplicates and unbounded work', () => {
  const p = project(),
    body = { project: p, settings, assets: [{ id: 'asset', token: 'receipt' }] }
  assert.equal(validateExport(body).duration, 10)
  for (const mutate of [
    (p) => (p.clips[0].start = NaN),
    (p) => (p.clips[0].duration = 181),
    (p) => (p.background = 'black;movie=/etc/passwd'),
    (p) => (p.clips[0].transform.rotation = '0;movie=http'),
    (p) => p.clips.push(p.clips[0]),
    (p) => (p.clips[0].assetId = 'missing'),
    (p) => (p.clips[0].track = 'audio'),
  ]) {
    const changed = structuredClone(p)
    mutate(changed)
    assert.throws(() => validateExport({ ...body, project: changed }))
  }
})
test('media receipts enforce purpose, signature and expiry; cloud uploads stay in the assigned account and path', () => {
  const previous = { ...process.env }
  Object.assign(process.env, {
    SESSION_SECRET: 'test-only-editor-secret',
    CLOUDINARY_CLOUD_NAME: 'test-cloud',
    CLOUDINARY_API_KEY: 'test-key',
    CLOUDINARY_API_SECRET: 'test-secret',
  })
  try {
    const id = 'a1234567-1234-1234-1234-123456789abc',
      token = signToken({ purpose: 'asset', id, cloud: false })
    assert.equal(readToken(token, 'asset').id, id)
    assert.throws(() => readToken(token, 'export'))
    assert.throws(() => readToken(token + 'x', 'asset'))
    assert.throws(() => readToken(signToken({ purpose: 'asset', id }, -1), 'asset'))
    const ticket = uploadTicket('video'),
      result = {
        public_id: ticket.fields.public_id,
        version: 123,
        resource_type: 'video',
        format: 'mp4',
      }
    result.signature = cloudSignature({ public_id: result.public_id, version: 123 })
    const receipt = readToken(verifyUpload(ticket.token, result).token, 'asset')
    assert.match(receipt.url, /^https:\/\/res\.cloudinary\.com\/test-cloud\//)
    assert.throws(() => verifyUpload(ticket.token, { ...result, public_id: 'another-file' }))
    assert.equal(
      isEditorMediaUrl(
        `https://res.cloudinary.com/test-cloud/video/upload/v123/silent-forward/editor-export/${id}.mp4`,
      ),
      true,
    )
    assert.equal(
      isEditorMediaUrl(
        `https://res.cloudinary.com/other-cloud/video/upload/v123/silent-forward/editor-export/${id}.mp4`,
      ),
      false,
    )
  } finally {
    for (const key of [
      'SESSION_SECRET',
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ]) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})
test('exported media survives planner database normalization', () => {
  const editorMedia = {
    url: 'https://res.cloudinary.com/test/video/upload/v1/silent-forward/editor-export/123.mp4',
    duration: 42,
    width: 1080,
    height: 1920,
  }
  assert.deepEqual(normalizeDesign({ editorMedia }, 'reel').editorMedia, editorMedia)
  assert.equal(normalizeDesign({}, 'reel').editorMedia, null)
})
test(
  'FFmpeg renders timed video, gaps, overlays, text animations, transforms and mixed audio to a playable MP4',
  { timeout: 90_000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-editor-test-'))
    try {
      const video = path.join(dir, 'source.mp4'),
        overlay = path.join(dir, 'overlay.media'),
        audio = path.join(dir, 'audio.wav'),
        text = path.join(dir, 'text.media')
      await runFFmpeg([
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=320x180:r=24:d=3',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=3',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        video,
      ])
      await runFFmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=3', audio])
      await sharp({ create: { width: 120, height: 80, channels: 4, background: '#00ff00' } })
        .png()
        .toFile(overlay)
      await sharp({ create: { width: 320, height: 180, channels: 4, background: '#ffffff00' } })
        .composite([
          {
            input: Buffer.from(
              '<svg width="320" height="180"><rect x="130" y="80" width="60" height="20" fill="white"/></svg>',
            ),
          },
        ])
        .png()
        .toFile(text)
      const a = { ...asset, duration: 3 },
        c = mediaClip(a, 0.25)
      c.duration = 1
      c.speed = 2
      c.sourceIn = 0.25
      c.audio.fadeIn = 0.2
      c.audio.fadeOut = 0.2
      const image = mediaClip({ ...a, id: 'image', kind: 'image' }, 0.5, 'overlay')
      image.duration = 1
      image.transform.scale = 0.2
      image.transform.rotation = 15
      image.adjustments.saturation = 0.7
      image.transition = 'fade'
      const music = mediaClip({ ...a, id: 'audio', kind: 'audio' }, 0)
      music.duration = 2
      music.audio.volume = 0.2
      const title = textClip(0.5)
      title.assetId = 'text'
      title.duration = 1
      title.text.animation = 'pop'
      const p = { ...project(), clips: [c, image, music, title] },
        files = [
          ['asset', video, 'video'],
          ['image', overlay, 'image'],
          ['audio', audio, 'audio'],
          ['text', text, 'image'],
        ]
      const media = new Map()
      for (const [id, file, kind] of files)
        media.set(id, { path: file, kind, ...(await probe(file)) })
      assert.equal(media.get('asset').hasAudio, true)
      assert.equal(media.get('asset').width, 320)
      const result = await renderProject(p, settings, media, dir)
      assert.ok((await stat(result.path)).size > 10_000)
      const info = await probe(result.path)
      assert.equal(info.width, 1280)
      assert.equal(info.height, 720)
      assert.ok(Math.abs(info.duration - 2) < 0.08)
      assert.equal(info.hasAudio, true)
      const first = path.join(dir, 'first.png'),
        middle = path.join(dir, 'middle.png')
      await runFFmpeg(['-y', '-i', result.path, '-frames:v', '1', first])
      await runFFmpeg(['-y', '-ss', '0.4', '-i', result.path, '-frames:v', '1', middle])
      const firstPixel = await sharp(await readFile(first))
        .extract({ left: 20, top: 20, width: 1, height: 1 })
        .raw()
        .toBuffer()
      const redPixel = await sharp(await readFile(middle))
        .extract({ left: 20, top: 20, width: 1, height: 1 })
        .raw()
        .toBuffer()
      assert.ok(firstPixel[0] < 10, 'gap at the start should be black')
      assert.ok(redPixel[0] > 200 && redPixel[1] < 30, 'trimmed video should be visible at .4s')
      const graph = buildGraph(p, settings, media).graph
      assert.match(graph, /atempo=2/)
      assert.match(graph, /afade/)
      assert.match(graph, /rotate=/)
      assert.match(graph, /colorchannelmixer/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
)
