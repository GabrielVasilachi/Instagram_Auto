import { clamp, dimensions } from './model'
import type { Clip, Project, Resources, TextClip } from './types'

const textCache = new Map<string, HTMLCanvasElement>()
export function textCanvas(clip: TextClip, ratio: Project['ratio']) {
  const key = JSON.stringify([clip.text, ratio])
  const cached = textCache.get(key)
  if (cached) return cached
  const { width, height } = dimensions(ratio)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!,
    s = clip.text
  const families = { sans: 'Studio Sans', serif: 'Studio Serif', mono: 'Studio Mono' }
  ctx.font = `${s.weight} ${s.size}px "${families[s.font]}"`
  ctx.textAlign = s.align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  const maxWidth = width * 0.82,
    lines: string[] = []
  for (const paragraph of s.content.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      if (line && ctx.measureText(line + ' ' + word).width > maxWidth) {
        lines.push(line)
        line = ''
      }
      // Split long unbroken words as well as ordinary word-wrapped paragraphs.
      for (const ch of (line ? ' ' : '') + word) {
        if (ctx.measureText(line + ch).width > maxWidth && line) {
          lines.push(line)
          line = ''
        }
        line += ch
      }
    }
    lines.push(line)
  }
  const lineHeight = s.size * 1.25,
    blockHeight = lines.length * lineHeight,
    x = s.align === 'left' ? width * 0.09 : s.align === 'right' ? width * 0.91 : width / 2
  if (s.backgroundOpacity > 0) {
    ctx.globalAlpha = s.backgroundOpacity
    ctx.fillStyle = s.background
    ctx.fillRect(width * 0.06, (height - blockHeight) / 2 - 20, width * 0.88, blockHeight + 40)
    ctx.globalAlpha = 1
  }
  if (s.shadow) {
    ctx.shadowColor = '#000000bb'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 4
  }
  ctx.fillStyle = s.color
  ctx.strokeStyle = s.strokeColor
  ctx.lineWidth = s.stroke * 2
  lines.forEach((line, i) => {
    const y = (height - blockHeight) / 2 + lineHeight * (i + 0.5)
    if (s.stroke) ctx.strokeText(line, x, y)
    ctx.fillText(line, x, y)
  })
  if (textCache.size > 35) textCache.clear()
  textCache.set(key, canvas)
  return canvas
}
export function animationAt(clip: Clip, local: number) {
  const length = Math.min(clip.transitionDuration, clip.duration / 2),
    n = clamp(local / 0.4, 0, 1)
  let alpha = 1,
    scale = 1,
    x = 0,
    y = 0
  if (clip.transition !== 'none') alpha *= clamp(local / length, 0, 1)
  if (clip.transition === 'fade') alpha *= clamp((clip.duration - local) / length, 0, 1)
  if (clip.kind === 'text') {
    if (clip.text.animation !== 'none') {
      const fade = Math.min(0.4, clip.duration / 2)
      alpha *= clamp(local / fade, 0, 1) * clamp((clip.duration - local) / fade, 0, 1)
    }
    if (clip.text.animation === 'slide-up') y = (1 - n) * 0.06
    if (clip.text.animation === 'slide-left') x = (1 - n) * 0.08
    if (clip.text.animation === 'pop') scale = 0.75 + 0.25 * n
    if (clip.text.animation === 'zoom') scale = 0.85 + 0.15 * n
  }
  return { alpha, scale, x, y }
}
export function visualClips(project: Project) {
  const order = { video: 0, overlay: 1, text: 2, audio: 3 }
  return project.clips
    .filter((c) => c.kind !== 'audio' && !project.tracks.find((t) => t.id === c.track)?.hidden)
    .slice()
    .sort((a, b) => order[a.track] - order[b.track] || a.start - b.start)
}
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  project: Project,
  resources: Resources,
  time: number,
  selected?: string | null,
) {
  const W = ctx.canvas.width,
    H = ctx.canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = project.background
  ctx.fillRect(0, 0, W, H)
  for (const clip of visualClips(project)) {
    if (time < clip.start || time >= clip.start + clip.duration) continue
    const source =
      clip.kind === 'text' ? textCanvas(clip, project.ratio) : resources.get(clip.id)?.element
    if (!source || source instanceof HTMLAudioElement) continue
    if (source instanceof HTMLVideoElement && source.readyState < 2) continue
    const sw =
      source instanceof HTMLVideoElement
        ? source.videoWidth
        : source instanceof HTMLImageElement
          ? source.naturalWidth
          : source.width
    const sh =
      source instanceof HTMLVideoElement
        ? source.videoHeight
        : source instanceof HTMLImageElement
          ? source.naturalHeight
          : source.height
    if (!sw || !sh) continue
    const tr = clip.transform,
      a = animationAt(clip, time - clip.start),
      boxW = (W * tr.width) / 100,
      boxH = (H * tr.height) / 100
    const fit = tr.fit === 'fill' ? Math.max(boxW / sw, boxH / sh) : Math.min(boxW / sw, boxH / sh)
    const dw = tr.fit === 'fill' ? boxW : sw * fit,
      dh = tr.fit === 'fill' ? boxH : sh * fit
    const cropW = tr.fit === 'fill' ? boxW / fit : sw,
      cropH = tr.fit === 'fill' ? boxH / fit : sh
    ctx.save()
    ctx.translate(W * (tr.x / 100 + a.x), H * (tr.y / 100 + a.y))
    ctx.rotate((tr.rotation * Math.PI) / 180)
    ctx.scale(tr.scale * a.scale * (tr.flipX ? -1 : 1), tr.scale * a.scale * (tr.flipY ? -1 : 1))
    ctx.globalAlpha = tr.opacity * a.alpha
    if (clip.kind !== 'text') {
      const f = clip.adjustments
      ctx.filter = `brightness(${f.brightness * 2 ** f.exposure}) contrast(${f.contrast}) saturate(${f.saturation}) grayscale(${f.grayscale}) blur(${(f.blur * W) / dimensions(project.ratio).width}px)`
    }
    ctx.drawImage(
      source,
      (sw - cropW) / 2,
      (sh - cropH) / 2,
      cropW,
      cropH,
      -dw / 2,
      -dh / 2,
      dw,
      dh,
    )
    ctx.filter = 'none'
    if (selected === clip.id) {
      ctx.globalAlpha = 1
      ctx.lineWidth = 1.5 / tr.scale
      ctx.strokeStyle = '#d9ff3f'
      ctx.strokeRect(-dw / 2, -dh / 2, dw, dh)
      const k = 5 / tr.scale
      for (const x of [-dw / 2, dw / 2])
        for (const y of [-dh / 2, dh / 2]) {
          ctx.fillStyle = '#d9ff3f'
          ctx.fillRect(x - k / 2, y - k / 2, k, k)
        }
    }
    ctx.restore()
  }
}
