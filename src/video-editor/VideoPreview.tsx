import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { dimensions, durationOf, timeLabel, clamp } from './model';
import { drawFrame } from './render';
import type { Editor } from './useEditor';
import type { Resources, Ratio } from './types';
import { Icon } from './Icon';

export function VideoPreview({
  editor: e,
  media,
  mediaRevision,
}: {
  editor: Editor;
  media: MutableRefObject<Resources>;
  mediaRevision: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null),
    sources = useRef<Resources>(new Map()),
    dirty = useRef(true);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [muted, setMuted] = useState(false),
    [volume, setVolume] = useState(0.8),
    [zoom, setZoom] = useState(1);
  const state = useRef({
    project: e.project,
    playing: e.playing,
    selected: e.selected,
    muted,
    volume,
  });
  state.current = { project: e.project, playing: e.playing, selected: e.selected, muted, volume };
  useEffect(() => {
    for (const [id, source] of sources.current)
      if (!e.project.clips.some((c) => c.id === id)) {
        if (source.element instanceof HTMLMediaElement) {
          source.element.pause();
          source.element.removeAttribute('src');
          source.element.load();
        }
        sources.current.delete(id);
      }
    for (const clip of e.project.clips) {
      if (clip.kind === 'text') continue;
      const resource = media.current.get(clip.assetId);
      if (!resource) continue;
      const existing = sources.current.get(clip.id);
      if (existing?.url === resource.url) continue;
      if (existing?.element instanceof HTMLMediaElement) {
        existing.element.pause();
        existing.element.removeAttribute('src');
        existing.element.load();
      }
      const element = clip.kind === 'image' ? resource.element : document.createElement(clip.kind);
      if (element instanceof HTMLMediaElement) {
        element.addEventListener('loadeddata', () => {
          dirty.current = true;
        });
        element.addEventListener('seeked', () => {
          dirty.current = true;
        });
        element.preload = 'auto';
        element.src = resource.url;
        if (element instanceof HTMLVideoElement) element.playsInline = true;
      }
      sources.current.set(clip.id, { url: resource.url, element });
    }
    dirty.current = true;
  }, [e.project.clips, media, mediaRevision]);
  useEffect(() => {
    let frame = 0,
      lastTime = -1,
      lastProject = state.current.project,
      lastSelected = state.current.selected;
    const draw = () => {
      const s = state.current,
        t = e.clock.current;
      for (const clip of s.project.clips) {
        const element = sources.current.get(clip.id)?.element;
        if (!(element instanceof HTMLMediaElement)) continue;
        const track = s.project.tracks.find((tr) => tr.id === clip.track)!,
          active = t >= clip.start && t < clip.start + clip.duration && !track.hidden;
        if (!active) {
          if (!element.paused) element.pause();
          continue;
        }
        const target = clip.sourceIn + (t - clip.start) * clip.speed,
          drift = Math.abs(element.currentTime - target);
        if (element.readyState >= 1 && !element.seeking && drift > (s.playing ? 0.18 : 0.012))
          element.currentTime = Math.min(target, Math.max(0, element.duration - 0.001));
        element.playbackRate = clip.speed;
        const local = t - clip.start,
          gain =
            clamp(
              clip.audio.fadeIn ? local / Math.min(clip.audio.fadeIn, clip.duration / 2) : 1,
              0,
              1,
            ) *
            clamp(
              clip.audio.fadeOut
                ? (clip.duration - local) / Math.min(clip.audio.fadeOut, clip.duration / 2)
                : 1,
              0,
              1,
            );
        element.volume = clamp(clip.audio.volume * s.volume * gain, 0, 1);
        element.muted = s.muted || clip.audio.muted || track.muted;
        if (s.playing && element.paused) void element.play().catch(() => {});
        else if (!s.playing && !element.paused) element.pause();
      }
      const ctx = canvas.current?.getContext('2d');
      if (
        ctx &&
        (s.playing ||
          dirty.current ||
          t !== lastTime ||
          s.project !== lastProject ||
          s.selected !== lastSelected)
      ) {
        drawFrame(ctx, s.project, sources.current, t, s.selected);
        dirty.current = false;
        lastTime = t;
        lastProject = s.project;
        lastSelected = s.selected;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      for (const source of sources.current.values())
        if (source.element instanceof HTMLMediaElement) source.element.pause();
    };
  }, [e.clock]);
  const size = dimensions(e.project.ratio, 540),
    duration = durationOf(e.project),
    fittedWidth = Math.max(
      1,
      Math.min(stageSize.width, (stageSize.height * size.width) / size.height),
    );
  return (
    <section className="ve-preview" aria-label="Video preview">
      <div className="ve-panel-heading">
        <span>
          Player <small>LIVE PREVIEW</small>
        </span>
        <div className="ve-inline">
          <select
            aria-label="Canvas aspect ratio"
            value={e.project.ratio}
            onChange={(event) => e.edit((p) => ({ ...p, ratio: event.target.value as Ratio }))}
          >
            {(['9:16', '16:9', '1:1', '4:5'] as const).map((r) => (
              <option key={r} value={r}>
                {r}
                {r === '9:16' ? ' · Reel' : ''}
              </option>
            ))}
          </select>
          <select
            aria-label="Preview zoom"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            <option value={1}>Fit</option>
            <option value={0.5}>50%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
          </select>
        </div>
      </div>
      <div className="ve-stage" ref={stage}>
        <div
          className="ve-canvas-wrap"
          style={{
            aspectRatio: `${size.width}/${size.height}`,
            width: fittedWidth,
            height: (fittedWidth * size.height) / size.width,
            transform: `scale(${zoom})`,
          }}
        >
          <canvas
            ref={canvas}
            width={size.width}
            height={size.height}
            aria-label="Project canvas"
            onPointerDown={(event) => {
              const clip = e.project.clips.find((c) => c.id === e.selected);
              if (
                !clip ||
                clip.kind === 'audio' ||
                e.project.tracks.find((t) => t.id === clip.track)?.locked ||
                e.time < clip.start ||
                e.time >= clip.start + clip.duration
              )
                return;
              event.currentTarget.setPointerCapture(event.pointerId);
              e.setPlaying(false);
              e.begin();
              const rect = event.currentTarget.getBoundingClientRect(),
                x = event.clientX,
                y = event.clientY,
                tr = { ...clip.transform };
              const move = (ev: PointerEvent) =>
                e.updateClip(clip.id, (c) => ({
                  ...c,
                  transform: {
                    ...c.transform,
                    x: clamp(tr.x + ((ev.clientX - x) / rect.width) * 100, -100, 200),
                    y: clamp(tr.y + ((ev.clientY - y) / rect.height) * 100, -100, 200),
                  },
                }));
              const end = () => {
                e.end();
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', end);
                window.removeEventListener('pointercancel', end);
              };
              window.addEventListener('pointermove', move);
              window.addEventListener('pointerup', end, { once: true });
              window.addEventListener('pointercancel', end, { once: true });
            }}
          />
          {!e.project.clips.length && (
            <div className="ve-canvas-empty">
              <Icon name="video" size={34} />
              <strong>
                Make something
                <br />
                worth watching.
              </strong>
              <span>Import media to begin your story</span>
            </div>
          )}
        </div>
        <span className="ve-canvas-note">
          {dimensions(e.project.ratio).width} × {dimensions(e.project.ratio).height} <b>·</b>{' '}
          {e.project.fps} FPS
        </span>
      </div>
      <div className="ve-playback">
        <div className="ve-time">
          <strong>{timeLabel(e.time, true, e.project.fps)}</strong>
          <span>/ {timeLabel(duration, true, e.project.fps)}</span>
        </div>
        <div className="ve-transport">
          <button
            title="Replay"
            aria-label="Replay"
            onClick={() => {
              e.seek(0);
              e.setPlaying(true);
            }}
            disabled={!duration}
          >
            <Icon name="replay" />
          </button>
          <button
            title="Previous frame · ←"
            aria-label="Previous frame"
            onClick={() => {
              e.setPlaying(false);
              e.seek(e.time - 1 / e.project.fps);
            }}
          >
            <Icon name="previous" />
          </button>
          <button
            className="ve-play"
            title="Play / Pause · Space"
            aria-label={e.playing ? 'Pause' : 'Play'}
            onClick={e.togglePlay}
            disabled={!duration}
          >
            <Icon name={e.playing ? 'pause' : 'play'} size={19} />
          </button>
          <button
            title="Next frame · →"
            aria-label="Next frame"
            onClick={() => {
              e.setPlaying(false);
              e.seek(e.time + 1 / e.project.fps);
            }}
          >
            <Icon name="next" />
          </button>
        </div>
        <div className="ve-inline">
          <button
            title="Mute preview"
            aria-label="Mute preview"
            onClick={() => setMuted((v) => !v)}
          >
            <Icon name={muted ? 'mute' : 'volume'} />
          </button>
          <input
            className="ve-monitor-volume"
            aria-label="Preview volume"
            type="range"
            min="0"
            max="1"
            step=".01"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
          <button
            title="Fullscreen"
            aria-label="Fullscreen"
            onClick={() => {
              const promise = document.fullscreenElement
                ? document.exitFullscreen()
                : stage.current?.requestFullscreen();
              void promise?.catch(() => e.setError('Fullscreen is unavailable in this browser.'));
            }}
          >
            <Icon name="fullscreen" />
          </button>
        </div>
      </div>
      <input
        className="ve-seek"
        aria-label="Seek preview"
        type="range"
        min={0}
        max={duration || 1}
        step={1 / e.project.fps}
        value={e.time}
        onChange={(event) => e.seek(Number(event.target.value))}
      />
    </section>
  );
}
