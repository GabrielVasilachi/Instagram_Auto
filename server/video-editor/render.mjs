import ffmpegPath from 'ffmpeg-static'
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dimensions } from './schema.mjs'

export function runFFmpeg(args, { signal, onProgress, duration = 1, acceptProbe = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    })
    let errors = '',
      output = '',
      settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      error ? reject(error) : resolve(value)
    }
    child.stderr.on('data', (data) => {
      errors = (errors + data.toString()).slice(-24_000)
    })
    child.stdout.on('data', (data) => {
      output += data.toString()
      const lines = output.split('\n')
      output = lines.pop() || ''
      for (const line of lines)
        if (line.startsWith('out_time_us='))
          onProgress?.(Math.min(0.99, Number(line.split('=')[1]) / 1_000_000 / duration))
    })
    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (code === 0 || (acceptProbe && /Input #0/.test(errors))) finish(null, errors)
      else finish(new Error(`FFmpeg failed (${code}): ${errors.slice(-3000)}`))
    })
  })
}
const protocols = [
  '-protocol_whitelist',
  'file,pipe',
  '-format_whitelist',
  'mov,mp3,wav,aac,matroska,webm,png_pipe,jpeg_pipe,webp_pipe,image2',
]
export async function probe(file, signal) {
  const result = await runFFmpeg([...protocols, '-i', file], { signal, acceptProbe: true })
  const d = result.match(/Duration: (\d+):(\d+):([\d.]+)/),
    video = result.match(/Video: [^\n]*? (\d{2,5})x(\d{2,5})/),
    rotation = Number(result.match(/rotation of ([-\d.]+) degrees/)?.[1] || 0),
    swap = Math.abs(Math.abs(rotation % 180) - 90) < 0.1
  return {
    hasAudio: /Stream #\d+:\d+[^\n]*Audio:/.test(result),
    hasVideo: /Stream #\d+:\d+[^\n]*Video:/.test(result),
    duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
    width: video ? Number(video[swap ? 2 : 1]) : 0,
    height: video ? Number(video[swap ? 1 : 2]) : 0,
  }
}
const round = (n) => Math.round(n * 1e6) / 1e6
export function buildGraph(project, settings, media) {
  const { width: W, height: H } = dimensions(project.ratio, settings.resolution),
    fps = settings.fps
  const duration = Math.max(...project.clips.map((c) => c.start + c.duration)),
    inputs = [],
    graph = []
  const order = { video: 0, overlay: 1, text: 2, audio: 3 }
  const clips = project.clips
    .filter((c) => !project.tracks.find((t) => t.id === c.track).hidden)
    .slice()
    .sort((a, b) => order[a.track] - order[b.track] || a.start - b.start)
  graph.push(
    `color=c=${project.background.replace('#', '0x')}:s=${W}x${H}:r=${fps}:d=${round(duration)},format=rgba[base]`,
  )
  let previous = 'base',
    visual = 0
  const audioLabels = []
  for (const [i, c] of clips.entries()) {
    const m = media.get(c.assetId)
    if (!m) throw new Error('A required media file is missing.')
    const still = c.kind === 'image' || c.kind === 'text',
      start = round(c.start),
      len = round(c.duration)
    inputs.push(...protocols)
    if (still)
      inputs.push('-f', 'image2', '-loop', '1', '-framerate', String(fps), '-t', String(len))
    else inputs.push('-ss', String(c.sourceIn), '-t', String(round(c.duration * c.speed)))
    inputs.push('-i', m.path)
    if (c.kind !== 'audio') {
      const tr = c.transform,
        f = c.adjustments,
        boxW = Math.max(2, Math.round((W * tr.width) / 100)),
        boxH = Math.max(2, Math.round((H * tr.height) / 100))
      const sw = m.width || W,
        sh = m.height || H,
        factor = tr.fit === 'fill' ? Math.max(boxW / sw, boxH / sh) : Math.min(boxW / sw, boxH / sh)
      const dw = tr.fit === 'fill' ? boxW : Math.round(sw * factor),
        dh = tr.fit === 'fill' ? boxH : Math.round(sh * factor)
      const parts = [`setpts=(PTS-STARTPTS)/${still ? 1 : c.speed}`, `fps=${fps}`, 'setsar=1']
      if (tr.fit === 'fill')
        parts.push(
          `crop=w=${Math.max(1, Math.floor(boxW / factor))}:h=${Math.max(1, Math.floor(boxH / factor))}`,
        )
      parts.push(`scale=${Math.max(2, dw)}:${Math.max(2, dh)}:flags=bicubic`, 'format=rgba')
      if (c.kind !== 'text') {
        const brightness = round(f.brightness * 2 ** f.exposure),
          contrast = f.contrast
        parts.push(
          `lutrgb=r='clip((clip(val*${brightness},0,255)-127.5)*${contrast}+127.5,0,255)':g='clip((clip(val*${brightness},0,255)-127.5)*${contrast}+127.5,0,255)':b='clip((clip(val*${brightness},0,255)-127.5)*${contrast}+127.5,0,255)'`,
        )
        // CSS saturate and grayscale use the same Rec.709 RGB luminance matrix.
        const saturation = f.saturation * (1 - f.grayscale),
          luminance = [0.2126, 0.7152, 0.0722],
          channels = ['r', 'g', 'b'],
          matrix = []
        channels.forEach((row, y) =>
          channels.forEach((col, x) =>
            matrix.push(
              `${row}${col}=${round((1 - saturation) * luminance[x] + (x === y ? saturation : 0))}`,
            ),
          ),
        )
        parts.push(`colorchannelmixer=${matrix.join(':')}`)
        if (f.blur > 0)
          parts.push(`gblur=sigma=${Math.max(0.01, round((f.blur * settings.resolution) / 1080))}`)
      }
      const animation = c.kind === 'text' ? c.text.animation : 'none'
      let scale = String(tr.scale)
      if (animation === 'pop') scale = `${tr.scale}*(0.75+0.25*min(t/0.4,1))`
      if (animation === 'zoom') scale = `${tr.scale}*(0.85+0.15*min(t/0.4,1))`
      parts.push(`scale=w='max(2,round(iw*(${scale})))':h='max(2,round(ih*(${scale})))':eval=frame`)
      if (tr.flipX) parts.push('hflip')
      if (tr.flipY) parts.push('vflip')
      if (tr.rotation)
        parts.push(
          `rotate=${round((tr.rotation * Math.PI) / 180)}:ow=rotw(${round((tr.rotation * Math.PI) / 180)}):oh=roth(${round((tr.rotation * Math.PI) / 180)}):c=none`,
        )
      parts.push(`colorchannelmixer=aa=${tr.opacity}`)
      const fade = Math.min(c.transitionDuration, c.duration / 2)
      if (c.transition !== 'none') parts.push(`fade=t=in:st=0:d=${round(fade)}:alpha=1`)
      if (c.transition === 'fade')
        parts.push(`fade=t=out:st=${round(len - fade)}:d=${round(fade)}:alpha=1`)
      if (animation !== 'none') {
        const textFade = Math.min(0.4, len / 2)
        parts.push(
          `fade=t=in:st=0:d=${textFade}:alpha=1`,
          `fade=t=out:st=${round(len - textFade)}:d=${textFade}:alpha=1`,
        )
      }
      parts.push(`setpts=PTS+${start}/TB`)
      graph.push(`[${i}:v]${parts.join(',')}[v${i}]`)
      const extraX =
        animation === 'slide-left' ? `+${W * 0.08}*(1-min(max((t-${start})/0.4,0),1))` : ''
      const extraY =
        animation === 'slide-up' ? `+${H * 0.06}*(1-min(max((t-${start})/0.4,0),1))` : ''
      const next = `mix${visual++}`
      graph.push(
        `[${previous}][v${i}]overlay=x='${round((W * tr.x) / 100)}-overlay_w/2${extraX}':y='${round((H * tr.y) / 100)}-overlay_h/2${extraY}':enable='gte(t,${start})*lt(t,${round(start + len)})':eof_action=pass:repeatlast=0:format=auto[${next}]`,
      )
      previous = next
    }
    const track = project.tracks.find((t) => t.id === c.track)
    if (m.hasAudio && !c.audio.muted && !track.muted && c.audio.volume > 0 && !still) {
      const parts = ['asetpts=PTS-STARTPTS'],
        tempo = c.speed < 0.5 ? 'atempo=0.5,atempo=0.5' : `atempo=${c.speed}`
      parts.push(tempo, `atrim=duration=${len}`, `volume=${c.audio.volume}`)
      if (c.audio.fadeIn) parts.push(`afade=t=in:d=${Math.min(c.audio.fadeIn, len / 2)}`)
      if (c.audio.fadeOut)
        parts.push(
          `afade=t=out:st=${Math.max(0, len - Math.min(c.audio.fadeOut, len / 2))}:d=${Math.min(c.audio.fadeOut, len / 2)}`,
        )
      parts.push(
        'aresample=48000',
        'aformat=channel_layouts=stereo',
        `adelay=${Math.round(start * 1000)}:all=1`,
      )
      graph.push(`[${i}:a]${parts.join(',')}[a${i}]`)
      audioLabels.push(`[a${i}]`)
    }
  }
  graph.push(`[${previous}]format=yuv420p[outv]`)
  graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${round(duration)}[silence]`)
  graph.push(
    `[silence]${audioLabels.join('')}amix=inputs=${audioLabels.length + 1}:duration=longest:normalize=0,alimiter=limit=1:level=false:latency=true,atrim=duration=${round(duration)}[outa]`,
  )
  return { inputs, graph: graph.join(';\n'), duration, width: W, height: H }
}
export async function renderProject(
  project,
  settings,
  media,
  directory,
  { signal, onProgress } = {},
) {
  const built = buildGraph(project, settings, media),
    script = path.join(directory, 'filters.txt'),
    output = path.join(directory, 'export.mp4')
  await writeFile(script, built.graph)
  await runFFmpeg(
    [
      '-y',
      '-threads',
      '2',
      '-filter_complex_threads',
      '1',
      ...built.inputs,
      '-filter_complex_script',
      script,
      '-map',
      '[outv]',
      '-map',
      '[outa]',
      '-t',
      String(built.duration),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      settings.quality === 'high' ? '18' : '23',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(settings.fps),
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      output,
    ],
    { signal, onProgress, duration: built.duration },
  )
  return { ...built, path: output }
}
