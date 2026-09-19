import { clamp, trimClip } from './model'
import type { Clip, TextClip } from './types'
import type { Editor } from './useEditor'
import { Icon } from './Icon'

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Math.round(value * 1000) / 1000}
        onChange={(event) => {
          const n = event.target.valueAsNumber
          if (Number.isFinite(n)) onChange(clamp(n, min, max))
        }}
      />
    </label>
  )
}
function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  editor,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  editor: Editor
}) {
  return (
    <label className="ve-slider">
      <span>
        {label}
        <output>{Math.round(value * 100) / 100}</output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={editor.begin}
        onPointerUp={editor.end}
        onPointerCancel={editor.end}
        onBlur={editor.end}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}
export function Inspector({ editor: e }: { editor: Editor }) {
  const clip = e.project.clips.find((c) => c.id === e.selected)
  const update = (fn: (c: Clip) => Clip) => clip && e.updateClip(clip.id, fn)
  const text = (values: Partial<TextClip['text']>) =>
    update((c) => (c.kind === 'text' ? { ...c, text: { ...c.text, ...values } } : c))
  const transform = (values: Partial<Clip['transform']>) =>
    update((c) => ({ ...c, transform: { ...c.transform, ...values } }))
  const audio = (values: Partial<Clip['audio']>) =>
    update((c) => ({ ...c, audio: { ...c.audio, ...values } }))
  const visual = clip && clip.kind !== 'audio',
    locked = e.project.tracks.find((t) => t.id === clip?.track)?.locked
  const asset =
    clip && clip.kind !== 'text' ? e.project.assets.find((a) => a.id === clip.assetId) : undefined
  return (
    <aside className="ve-inspector">
      <div className="ve-panel-heading">
        <span>Properties</span>
        <small>{clip ? clip.kind.toUpperCase() : 'PROJECT'}</small>
      </div>
      {!clip ? (
        <>
          <div className="ve-properties-empty">
            <Icon name="effects" size={27} />
            <strong>The details make it yours.</strong>
            <p>Select a clip on the timeline to adjust its properties.</p>
          </div>
          <div className="ve-property-section">
            <h3>Project settings</h3>
            <label>
              Canvas color
              <input
                type="color"
                value={e.project.background}
                onChange={(event) => e.edit((p) => ({ ...p, background: event.target.value }))}
              />
            </label>
            <label>
              Frame rate
              <select
                value={e.project.fps}
                onChange={(event) =>
                  e.edit((p) => ({ ...p, fps: Number(event.target.value) as 24 | 30 | 60 }))
                }
              >
                <option value={24}>24 FPS</option>
                <option value={30}>30 FPS</option>
                <option value={60}>60 FPS</option>
              </select>
            </label>
            <p className="ve-muted">
              Select a clip, then drag it directly in the preview to position it.
            </p>
          </div>
        </>
      ) : (
        <fieldset className="ve-inspector-fields" disabled={locked}>
          <div className="ve-property-section">
            <h3>
              {clip.name}
              <Icon name={locked ? 'lock' : clip.kind} size={14} />
            </h3>
            <div className="ve-field-grid">
              <NumberField
                label="Start (s)"
                value={clip.start}
                min={0}
                max={180 - clip.duration}
                step={1 / e.project.fps}
                onChange={(start) => update((c) => ({ ...c, start }))}
              />
              <NumberField
                label="Duration (s)"
                value={clip.duration}
                min={1 / e.project.fps}
                max={180 - clip.start}
                step={1 / e.project.fps}
                onChange={(duration) =>
                  update((c) =>
                    trimClip(
                      c,
                      'right',
                      duration - c.duration,
                      asset?.duration || 180,
                      e.project.fps,
                    ),
                  )
                }
              />
            </div>
            {(clip.kind === 'video' || clip.kind === 'image') && (
              <label>
                Track
                <select
                  value={clip.track}
                  onChange={(event) => {
                    const track = event.target.value as 'video' | 'overlay'
                    if (!e.project.tracks.find((t) => t.id === track)?.locked)
                      update((c) => ({ ...c, track }))
                  }}
                >
                  <option value="video">V1 · Video</option>
                  <option value="overlay">V2 · Overlay</option>
                </select>
              </label>
            )}
          </div>
          {clip.kind === 'text' && (
            <div className="ve-property-section">
              <h3>Text</h3>
              <label className="ve-sr-only" htmlFor="ve-text-content">
                Text content
              </label>
              <textarea
                id="ve-text-content"
                rows={3}
                value={clip.text.content}
                maxLength={600}
                onFocus={e.begin}
                onBlur={e.end}
                onChange={(event) => text({ content: event.target.value })}
              />
              <label>
                Typeface
                <select
                  value={clip.text.font}
                  onChange={(event) =>
                    text({ font: event.target.value as TextClip['text']['font'] })
                  }
                >
                  <option value="sans">Inter</option>
                  <option value="serif">Lora</option>
                  <option value="mono">JetBrains Mono</option>
                </select>
              </label>
              <div className="ve-field-grid">
                <NumberField
                  label="Size"
                  value={clip.text.size}
                  min={20}
                  max={200}
                  onChange={(size) => text({ size })}
                />
                <label>
                  Weight
                  <select
                    value={clip.text.weight}
                    onChange={(event) => text({ weight: Number(event.target.value) })}
                  >
                    {[400, 500, 600, 700, 800, 900].map((n) => (
                      <option value={n} key={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="ve-segments" aria-label="Text alignment">
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    className={clip.text.align === align ? 've-active' : ''}
                    onClick={() => text({ align })}
                  >
                    {align}
                  </button>
                ))}
              </div>
              <div className="ve-field-grid">
                <label>
                  Color
                  <input
                    type="color"
                    value={clip.text.color}
                    onChange={(event) => text({ color: event.target.value })}
                  />
                </label>
                <label>
                  Background
                  <input
                    type="color"
                    value={clip.text.background}
                    onChange={(event) => text({ background: event.target.value })}
                  />
                </label>
              </div>
              <Slider
                editor={e}
                label="Background opacity"
                value={clip.text.backgroundOpacity}
                min={0}
                max={1}
                onChange={(backgroundOpacity) => text({ backgroundOpacity })}
              />
              <div className="ve-field-grid">
                <NumberField
                  label="Stroke"
                  value={clip.text.stroke}
                  min={0}
                  max={8}
                  onChange={(stroke) => text({ stroke })}
                />
                <label>
                  Stroke color
                  <input
                    type="color"
                    value={clip.text.strokeColor}
                    onChange={(event) => text({ strokeColor: event.target.value })}
                  />
                </label>
              </div>
              <label className="ve-checkbox">
                <input
                  type="checkbox"
                  checked={clip.text.shadow}
                  onChange={(event) => text({ shadow: event.target.checked })}
                />{' '}
                Drop shadow
              </label>
              <label>
                Entrance animation
                <select
                  value={clip.text.animation}
                  onChange={(event) =>
                    text({ animation: event.target.value as TextClip['text']['animation'] })
                  }
                >
                  {[
                    ['none', 'None'],
                    ['fade', 'Fade'],
                    ['slide-up', 'Slide up'],
                    ['slide-left', 'Slide left'],
                    ['pop', 'Pop'],
                    ['zoom', 'Zoom'],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {visual && (
            <div className="ve-property-section">
              <h3>
                Transform
                <button
                  title="Reset transform"
                  onClick={() =>
                    transform({
                      x: 50,
                      y: 50,
                      scale: 1,
                      width: 100,
                      height: 100,
                      rotation: 0,
                      opacity: 1,
                      flipX: false,
                      flipY: false,
                      fit: 'fit',
                    })
                  }
                >
                  <Icon name="replay" size={13} />
                </button>
              </h3>
              <div className="ve-field-grid">
                <NumberField
                  label="Position X (%)"
                  value={clip.transform.x}
                  min={-100}
                  max={200}
                  step={0.1}
                  onChange={(x) => transform({ x })}
                />
                <NumberField
                  label="Position Y (%)"
                  value={clip.transform.y}
                  min={-100}
                  max={200}
                  step={0.1}
                  onChange={(y) => transform({ y })}
                />
                <NumberField
                  label="Width (%)"
                  value={clip.transform.width}
                  min={10}
                  max={150}
                  onChange={(width) => transform({ width })}
                />
                <NumberField
                  label="Height (%)"
                  value={clip.transform.height}
                  min={10}
                  max={150}
                  onChange={(height) => transform({ height })}
                />
              </div>
              <Slider
                editor={e}
                label="Scale"
                value={clip.transform.scale}
                min={0.1}
                max={2}
                onChange={(scale) => transform({ scale })}
              />
              <NumberField
                label="Rotation (°)"
                value={clip.transform.rotation}
                min={-180}
                max={180}
                onChange={(rotation) => transform({ rotation })}
              />
              <Slider
                editor={e}
                label="Opacity"
                value={clip.transform.opacity}
                min={0}
                max={1}
                onChange={(opacity) => transform({ opacity })}
              />
              <div className="ve-segments">
                <button
                  className={clip.transform.fit === 'fit' ? 've-active' : ''}
                  onClick={() => transform({ fit: 'fit' })}
                >
                  Fit
                </button>
                <button
                  className={clip.transform.fit === 'fill' ? 've-active' : ''}
                  onClick={() => transform({ fit: 'fill' })}
                >
                  Fill
                </button>
              </div>
              <div className="ve-segments">
                <button
                  className={clip.transform.flipX ? 've-active' : ''}
                  onClick={() => transform({ flipX: !clip.transform.flipX })}
                >
                  Flip H
                </button>
                <button
                  className={clip.transform.flipY ? 've-active' : ''}
                  onClick={() => transform({ flipY: !clip.transform.flipY })}
                >
                  Flip V
                </button>
              </div>
            </div>
          )}
          {(clip.kind === 'video' || clip.kind === 'audio') && (
            <div className="ve-property-section">
              <h3>Audio & speed</h3>
              <label>
                Speed
                <select
                  aria-label="Speed"
                  value={clip.speed}
                  onChange={(event) => {
                    const speed = Number(event.target.value)
                    update((c) => ({
                      ...c,
                      speed,
                      duration: Math.min(180 - c.start, (c.duration * c.speed) / speed),
                    }))
                  }}
                >
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((n) => (
                    <option value={n} key={n}>
                      {n}×
                    </option>
                  ))}
                </select>
              </label>
              <Slider
                editor={e}
                label="Volume"
                value={clip.audio.volume}
                min={0}
                max={1}
                onChange={(volume) => audio({ volume })}
              />
              <label className="ve-checkbox">
                <input
                  type="checkbox"
                  checked={clip.audio.muted}
                  onChange={(event) => audio({ muted: event.target.checked })}
                />
                Mute clip
              </label>
              <div className="ve-field-grid">
                <NumberField
                  label="Fade in (s)"
                  value={clip.audio.fadeIn}
                  min={0}
                  max={Math.min(5, clip.duration / 2)}
                  step={0.1}
                  onChange={(fadeIn) => audio({ fadeIn })}
                />
                <NumberField
                  label="Fade out (s)"
                  value={clip.audio.fadeOut}
                  min={0}
                  max={Math.min(5, clip.duration / 2)}
                  step={0.1}
                  onChange={(fadeOut) => audio({ fadeOut })}
                />
              </div>
            </div>
          )}
          {(clip.kind === 'video' || clip.kind === 'image') && (
            <>
              <div className="ve-property-section">
                <h3>Adjustments</h3>
                {(
                  ['brightness', 'contrast', 'saturation', 'exposure', 'blur', 'grayscale'] as const
                ).map((key) => (
                  <Slider
                    key={key}
                    editor={e}
                    label={key[0].toUpperCase() + key.slice(1)}
                    value={clip.adjustments[key]}
                    min={key === 'exposure' ? -2 : 0}
                    max={key === 'blur' ? 12 : key === 'grayscale' ? 1 : 2}
                    step={key === 'blur' ? 0.5 : 0.01}
                    onChange={(value) =>
                      update((c) => ({ ...c, adjustments: { ...c.adjustments, [key]: value } }))
                    }
                  />
                ))}
              </div>
              <div className="ve-property-section">
                <h3>Transition</h3>
                <label>
                  Transition
                  <select
                    value={clip.transition}
                    onChange={(event) => {
                      const transition = event.target.value as Clip['transition']
                      e.edit((p) => {
                        const prior = p.clips
                          .filter(
                            (c) =>
                              c.track === clip.track && c.id !== clip.id && c.start < clip.start,
                          )
                          .sort((a, b) => b.start - a.start)[0]
                        return {
                          ...p,
                          clips: p.clips.map((c) =>
                            c.id === clip.id
                              ? {
                                  ...c,
                                  transition,
                                  ...(transition === 'dissolve' && prior
                                    ? {
                                        start: Math.max(
                                          prior.start,
                                          prior.start +
                                            prior.duration -
                                            Math.min(
                                              c.transitionDuration,
                                              prior.duration / 2,
                                              c.duration / 2,
                                            ),
                                        ),
                                      }
                                    : {}),
                                }
                              : c,
                          ),
                        }
                      })
                    }}
                  >
                    <option value="none">None</option>
                    <option value="fade">Fade in / out</option>
                    <option value="dissolve">Dissolve from previous</option>
                  </select>
                </label>
                {clip.transition !== 'none' && (
                  <NumberField
                    label="Transition (s)"
                    value={clip.transitionDuration}
                    min={0.1}
                    max={Math.min(2, clip.duration / 2)}
                    step={0.1}
                    onChange={(transitionDuration) => update((c) => ({ ...c, transitionDuration }))}
                  />
                )}
                <p className="ve-muted">
                  Dissolve overlaps the previous clip on this track. Drag clips to refine the
                  overlap.
                </p>
              </div>
            </>
          )}
        </fieldset>
      )}
    </aside>
  )
}
