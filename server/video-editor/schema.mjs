export const LIMITS = {
  duration: 180,
  clips: 40,
  assets: 70,
  fileBytes: 100 * 1024 * 1024,
  totalBytes: 250 * 1024 * 1024,
}
const fail = (message) => {
  throw new Error(message)
}
const num = (v, lo, hi, field) =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fail(`Invalid ${field}.`)
const choice = (v, choices, field) => (choices.includes(v) ? v : fail(`Invalid ${field}.`))
const id = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : fail('Invalid ID.')
export function validateExport(body) {
  const p = body?.project,
    options = body?.settings
  if (!p || p.version !== 1 || !options) fail('Invalid project.')
  choice(p.ratio, ['9:16', '16:9', '1:1', '4:5'], 'aspect ratio')
  if (!/^#[0-9a-f]{6}$/i.test(p.background)) fail('Invalid canvas color.')
  if (!Array.isArray(p.clips) || !p.clips.length || p.clips.length > LIMITS.clips)
    fail('Use 1–40 clips per export.')
  if (
    !Array.isArray(p.tracks) ||
    p.tracks.length !== 4 ||
    new Set(p.tracks.map((t) => t.id)).size !== 4
  )
    fail('Invalid tracks.')
  p.tracks.forEach((t) => {
    choice(t.id, ['video', 'overlay', 'audio', 'text'], 'track')
    for (const k of ['muted', 'hidden', 'locked'])
      if (typeof t[k] !== 'boolean') fail('Invalid track state.')
  })
  if (new Set(p.clips.map((c) => c.id)).size !== p.clips.length) fail('Duplicate clip IDs.')
  for (const c of p.clips) {
    id(c.id)
    id(c.assetId)
    choice(c.kind, ['video', 'image', 'audio', 'text'], 'clip type')
    choice(c.track, ['video', 'overlay', 'audio', 'text'], 'track')
    if (
      (c.kind === 'audio' && c.track !== 'audio') ||
      (c.kind === 'text' && c.track !== 'text') ||
      (['video', 'image'].includes(c.kind) && !['video', 'overlay'].includes(c.track))
    )
      fail('Incompatible clip and track.')
    num(c.start, 0, LIMITS.duration, 'start')
    num(c.duration, 1 / 60, LIMITS.duration, 'duration')
    if (c.start + c.duration > LIMITS.duration + 0.001)
      fail('Maximum export duration is 3 minutes.')
    num(c.sourceIn, 0, 86_400, 'source offset')
    choice(c.speed, [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2], 'speed')
    choice(c.transition, ['none', 'fade', 'dissolve'], 'transition')
    num(c.transitionDuration, 0.01, 2, 'transition duration')
    const t = c.transform,
      a = c.audio,
      f = c.adjustments
    if (!t || !a || !f) fail('Missing clip properties.')
    for (const k of ['x', 'y']) num(t[k], -100, 200, `position ${k}`)
    for (const k of ['width', 'height']) num(t[k], 10, 150, k)
    num(t.scale, 0.1, 2, 'scale')
    num(t.rotation, -180, 180, 'rotation')
    num(t.opacity, 0, 1, 'opacity')
    choice(t.fit, ['fit', 'fill'], 'fit')
    for (const k of ['flipX', 'flipY']) if (typeof t[k] !== 'boolean') fail('Invalid flip.')
    num(a.volume, 0, 1, 'volume')
    num(a.fadeIn, 0, 5, 'fade in')
    num(a.fadeOut, 0, 5, 'fade out')
    if (typeof a.muted !== 'boolean') fail('Invalid mute.')
    for (const k of ['brightness', 'contrast', 'saturation']) num(f[k], 0, 2, k)
    num(f.exposure, -2, 2, 'exposure')
    num(f.blur, 0, 12, 'blur')
    num(f.grayscale, 0, 1, 'grayscale')
    if (c.kind === 'text')
      choice(
        c.text?.animation,
        ['none', 'fade', 'slide-up', 'slide-left', 'pop', 'zoom'],
        'text animation',
      )
  }
  choice(options.resolution, [720, 1080], 'resolution')
  choice(options.fps, [24, 30, 60], 'FPS')
  choice(options.quality, ['standard', 'high'], 'quality')
  if (!Array.isArray(body.assets) || body.assets.length > LIMITS.assets) fail('Invalid assets.')
  const assetIds = new Set(body.assets.map((a) => id(a.id)))
  if (assetIds.size !== body.assets.length || p.clips.some((c) => !assetIds.has(c.assetId)))
    fail('Missing or duplicate media assets.')
  return {
    project: p,
    settings: options,
    assets: body.assets,
    duration: Math.max(...p.clips.map((c) => c.start + c.duration)),
  }
}
export function dimensions(ratio, resolution) {
  const [w, h] = ratio.split(':').map(Number)
  return w >= h
    ? { width: Math.round((resolution * w) / h / 2) * 2, height: resolution }
    : { width: resolution, height: Math.round((resolution * h) / w / 2) * 2 }
}
