import { useRef, useState } from 'react'
import { clamp, durationOf, mediaClip, snapTime, timeLabel, trimClip } from './model'
import type { Clip, TrackId } from './types'
import type { Editor } from './useEditor'
import { Icon } from './Icon'

export function Timeline({ editor: e }: { editor: Editor }) {
  const [zoom, setZoom] = useState(48),
    [snap, setSnap] = useState(true),
    scroll = useRef<HTMLDivElement>(null)
  const length = Math.max(30, durationOf(e.project) + 8),
    width = length * zoom
  const selected = e.project.clips.find((c) => c.id === e.selected),
    locked = e.project.tracks.find((t) => t.id === selected?.track)?.locked
  const seek = (clientX: number) => {
    const rect = scroll.current!.getBoundingClientRect()
    e.seek((clientX - rect.left + scroll.current!.scrollLeft - 160) / zoom)
  }
  function drag(event: React.PointerEvent, clip: Clip, edge?: 'left' | 'right') {
    if (e.project.tracks.find((t) => t.id === clip.track)?.locked) return
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    e.setSelected(clip.id)
    e.setPlaying(false)
    e.begin()
    const startX = event.clientX,
      original = structuredClone(clip),
      originalScroll = scroll.current!.scrollLeft
    const sourceDuration =
      clip.kind === 'text'
        ? 180
        : e.project.assets.find((a) => a.id === clip.assetId)?.duration || clip.duration
    const move = (ev: PointerEvent) => {
      const rect = scroll.current!.getBoundingClientRect()
      if (ev.clientX > rect.right - 35) scroll.current!.scrollLeft += 12
      if (ev.clientX < rect.left + 170) scroll.current!.scrollLeft -= 12
      let delta = (ev.clientX - startX + scroll.current!.scrollLeft - originalScroll) / zoom
      const reference = edge === 'right' ? original.start + original.duration : original.start
      if (snap)
        delta = snapTime(reference + delta, e.project, clip.id, e.time, 8 / zoom) - reference
      delta = Math.round(delta * e.project.fps) / e.project.fps
      if (edge)
        e.updateClip(clip.id, () => trimClip(original, edge, delta, sourceDuration, e.project.fps))
      else
        e.updateClip(clip.id, () => ({
          ...original,
          start: clamp(original.start + delta, 0, 180 - original.duration),
        }))
    }
    const end = () => {
      e.end()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
    window.addEventListener('pointercancel', end, { once: true })
  }
  function drop(event: React.DragEvent, track: TrackId) {
    event.preventDefault()
    const asset = e.project.assets.find(
      (a) => a.id === event.dataTransfer.getData('application/x-sf-media'),
    )
    if (
      !asset ||
      e.project.tracks.find((t) => t.id === track)?.locked ||
      track === 'text' ||
      (asset.kind === 'audio' ? track !== 'audio' : track === 'audio')
    )
      return
    if (e.project.clips.length >= 40) return e.setError('A project can contain up to 40 clips.')
    const rect = event.currentTarget.getBoundingClientRect()
    let start = clamp((event.clientX - rect.left) / zoom, 0, 179)
    if (snap) start = snapTime(start, e.project, '', e.time, 8 / zoom)
    const clip = mediaClip(asset, start, track)
    clip.duration = Math.min(clip.duration, 180 - start)
    e.edit((p) => ({ ...p, clips: [...p.clips, clip] }))
    e.setSelected(clip.id)
  }
  const interval = zoom >= 60 ? 1 : zoom >= 24 ? 5 : 10
  return (
    <section className="ve-timeline" aria-label="Timeline">
      <div className="ve-timeline-tools">
        <div className="ve-inline">
          <span className="ve-timeline-title">Timeline</span>
          <i className="ve-divider" />
          <button
            aria-label="Split at playhead"
            title="Split at playhead · S"
            disabled={!selected || locked}
            onClick={e.split}
          >
            <Icon name="split" />
          </button>
          <button
            aria-label="Duplicate clip"
            title="Duplicate · ⌘/Ctrl D"
            disabled={!selected || locked}
            onClick={e.duplicate}
          >
            <Icon name="copy" />
          </button>
          <button
            aria-label="Delete clip"
            title="Delete · Backspace"
            disabled={!selected || locked}
            onClick={e.remove}
          >
            <Icon name="trash" />
          </button>
          <i className="ve-divider" />
          <button
            className={snap ? 've-active' : ''}
            title="Snap to playhead and clip edges"
            aria-label="Snapping"
            aria-pressed={snap}
            onClick={() => setSnap((v) => !v)}
          >
            <Icon name="magnet" />
          </button>
          <span className="ve-timeline-hint">
            {selected ? selected.name : 'Select a clip to edit'}
          </span>
        </div>
        <div className="ve-inline">
          <span>{e.project.clips.length} clips</span>
          <button
            aria-label="Zoom out timeline"
            onClick={() => setZoom((v) => Math.max(12, v - 12))}
          >
            <Icon name="minus" />
          </button>
          <input
            aria-label="Timeline zoom"
            type="range"
            min="12"
            max="120"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <button
            aria-label="Zoom in timeline"
            onClick={() => setZoom((v) => Math.min(120, v + 12))}
          >
            <Icon name="plus" />
          </button>
          <button
            className="ve-small-button"
            onClick={() => {
              setZoom(
                clamp(
                  ((scroll.current?.clientWidth || 1100) - 200) /
                    Math.max(10, durationOf(e.project)),
                  12,
                  120,
                ),
              )
              scroll.current?.scrollTo({ left: 0 })
            }}
          >
            Fit
          </button>
        </div>
      </div>
      <div className="ve-timeline-scroll" ref={scroll}>
        <div className="ve-timeline-content" style={{ width: width + 160 }}>
          <div className="ve-ruler-row">
            <div className="ve-track-label ve-ruler-label">
              {timeLabel(e.time, true, e.project.fps)}
            </div>
            <div
              className="ve-ruler"
              style={{ width }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                e.setPlaying(false)
                seek(event.clientX)
                const move = (ev: PointerEvent) => seek(ev.clientX),
                  end = () => {
                    window.removeEventListener('pointermove', move)
                    window.removeEventListener('pointerup', end)
                    window.removeEventListener('pointercancel', end)
                  }
                window.addEventListener('pointermove', move)
                window.addEventListener('pointerup', end, { once: true })
                window.addEventListener('pointercancel', end, { once: true })
              }}
            >
              {Array.from({ length: Math.ceil(length / interval) }, (_, i) => (
                <span key={i} style={{ left: i * interval * zoom }}>
                  {timeLabel(i * interval)}
                  <i />
                </span>
              ))}
            </div>
          </div>
          {e.project.tracks.map((track) => (
            <div className={`ve-track-row ${track.locked ? 've-locked' : ''}`} key={track.id}>
              <div className="ve-track-label">
                <span className={`ve-track-code ve-${track.id}`}>{track.label}</span>
                <strong>{track.name}</strong>
                <button
                  aria-label={`${track.hidden || track.muted ? 'Enable' : 'Disable'} ${track.name} track`}
                  title={track.id === 'audio' ? 'Mute track' : 'Hide track (also mutes audio)'}
                  className={track.hidden || track.muted ? 've-dimmed' : ''}
                  onClick={() =>
                    e.edit((p) => ({
                      ...p,
                      tracks: p.tracks.map((t) =>
                        t.id === track.id
                          ? {
                              ...t,
                              ...(track.id === 'audio'
                                ? { muted: !t.muted }
                                : { hidden: !t.hidden }),
                            }
                          : t,
                      ),
                    }))
                  }
                >
                  <Icon name={track.id === 'audio' ? 'volume' : 'eye'} size={13} />
                </button>
                <button
                  aria-label={`${track.locked ? 'Unlock' : 'Lock'} ${track.name} track`}
                  className={track.locked ? 've-active' : 've-dimmed'}
                  onClick={() =>
                    e.edit((p) => ({
                      ...p,
                      tracks: p.tracks.map((t) =>
                        t.id === track.id ? { ...t, locked: !t.locked } : t,
                      ),
                    }))
                  }
                >
                  <Icon name="lock" size={12} />
                </button>
              </div>
              <div
                className="ve-track-lane"
                data-track={track.id}
                style={{ width, backgroundSize: `${interval * zoom}px 100%` }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={(event) => drop(event, track.id)}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) {
                    e.setSelected(null)
                    seek(event.clientX)
                  }
                }}
              >
                {!e.project.clips.some((c) => c.track === track.id) && (
                  <span className="ve-track-empty">
                    {track.id === 'text'
                      ? 'Add a title from the Text panel'
                      : `Drop ${track.id === 'audio' ? 'audio' : 'media'} here`}
                  </span>
                )}
                {e.project.clips
                  .filter((c) => c.track === track.id)
                  .map((clip) => {
                    const asset =
                      clip.kind === 'text'
                        ? undefined
                        : e.project.assets.find((a) => a.id === clip.assetId)
                    return (
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Clip: ${clip.name}`}
                        aria-pressed={clip.id === e.selected}
                        key={clip.id}
                        className={`ve-clip ve-clip-${clip.kind} ${clip.id === e.selected ? 've-selected' : ''}`}
                        style={{
                          left: clip.start * zoom,
                          width: Math.max(5, clip.duration * zoom),
                        }}
                        onPointerDown={(event) => drag(event, clip)}
                        onClick={() => e.setSelected(clip.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') e.setSelected(clip.id)
                        }}
                      >
                        <span
                          className="ve-trim-handle ve-trim-left"
                          role="slider"
                          tabIndex={0}
                          aria-label="Trim clip start"
                          aria-valuenow={clip.start}
                          onPointerDown={(event) => drag(event, clip, 'left')}
                          onKeyDown={(event) => {
                            if (event.key.startsWith('Arrow')) {
                              event.stopPropagation()
                              e.updateClip(clip.id, (c) =>
                                trimClip(
                                  c,
                                  'left',
                                  event.key === 'ArrowLeft'
                                    ? -1 / e.project.fps
                                    : 1 / e.project.fps,
                                  asset?.duration || 180,
                                  e.project.fps,
                                ),
                              )
                            }
                          }}
                        />
                        {asset?.thumbnail && (
                          <div
                            className="ve-clip-thumbnails"
                            style={{ backgroundImage: `url(${asset.thumbnail})` }}
                          />
                        )}
                        {asset?.waveform && (
                          <svg
                            className="ve-waveform"
                            viewBox="0 0 100 32"
                            preserveAspectRatio="none"
                            aria-label="Audio waveform"
                          >
                            {asset.waveform.map((n, i) => (
                              <path
                                key={i}
                                d={`M${i} ${16 - n * 15}v${Math.max(1, n * 30)}`}
                                stroke="currentColor"
                                strokeWidth=".5"
                              />
                            ))}
                          </svg>
                        )}
                        <span className="ve-clip-name">
                          <Icon name={clip.kind === 'text' ? 'text' : clip.kind} size={11} />
                          {clip.kind === 'text' ? clip.text.content : clip.name}
                        </span>
                        {clip.transition !== 'none' && (
                          <span
                            className="ve-clip-transition"
                            title={clip.transition}
                            style={{ width: clip.transitionDuration * zoom }}
                          />
                        )}
                        <span
                          className="ve-trim-handle ve-trim-right"
                          role="slider"
                          tabIndex={0}
                          aria-label="Trim clip end"
                          aria-valuenow={clip.start + clip.duration}
                          onPointerDown={(event) => drag(event, clip, 'right')}
                        />
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
          <div className="ve-playhead" style={{ left: 160 + e.time * zoom }}>
            <span />
          </div>
        </div>
      </div>
      <div className="ve-timeline-footer">
        <span>
          <i /> All edits are non-destructive
        </span>
        <span>
          Space <b>Play</b> <i>·</i> S <b>Split</b> <i>·</i> ⌘/Ctrl Z <b>Undo</b>
        </span>
        <span>{timeLabel(durationOf(e.project))} total</span>
      </div>
    </section>
  )
}
