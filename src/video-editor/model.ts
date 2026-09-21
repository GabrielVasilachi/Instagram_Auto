import type { Clip, MediaAsset, Project, TextClip, TrackId, Transform } from './types';

export const uid = () => crypto.randomUUID();
export const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
export const durationOf = (p: Project) => Math.max(0, ...p.clips.map((c) => c.start + c.duration));
export const dimensions = (ratio: Project['ratio'], resolution = 1080) => {
  const [w, h] = ratio.split(':').map(Number);
  return w >= h
    ? { width: Math.round((resolution * w) / h / 2) * 2, height: resolution }
    : { width: resolution, height: Math.round((resolution * h) / w / 2) * 2 };
};
export const timeLabel = (time: number, frames = false, fps = 30) => {
  const safe = Math.max(0, time);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(Math.floor(safe % 60)).padStart(2, '0')}${frames ? ':' + String(Math.floor((safe % 1) * fps)).padStart(2, '0') : ''}`;
};
export const defaultTransform = (): Transform => ({
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
});
export function newProject(): Project {
  return {
    version: 1,
    id: uid(),
    name: 'Untitled project',
    ratio: '9:16',
    fps: 30,
    background: '#090a0b',
    assets: [],
    clips: [],
    tracks: [
      { id: 'text', name: 'Text', label: 'T1', muted: false, hidden: false, locked: false },
      { id: 'overlay', name: 'Overlay', label: 'V2', muted: false, hidden: false, locked: false },
      { id: 'video', name: 'Video', label: 'V1', muted: false, hidden: false, locked: false },
      { id: 'audio', name: 'Audio', label: 'A1', muted: false, hidden: false, locked: false },
    ],
  };
}
const baseClip = (name: string, track: TrackId, start: number) => ({
  id: uid(),
  name,
  track,
  start,
  duration: 5,
  sourceIn: 0,
  speed: 1,
  transform: defaultTransform(),
  adjustments: { brightness: 1, contrast: 1, saturation: 1, exposure: 0, blur: 0, grayscale: 0 },
  audio: { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
  transition: 'none' as const,
  transitionDuration: 0.5,
});
export function mediaClip(asset: MediaAsset, start: number, track?: TrackId): Clip {
  return {
    ...baseClip(asset.name, track || (asset.kind === 'audio' ? 'audio' : 'video'), start),
    kind: asset.kind,
    assetId: asset.id,
    duration: asset.kind === 'image' ? 5 : Math.min(asset.duration, 180 - start),
  };
}
export function textClip(start: number, content = 'Your story starts here.'): TextClip {
  return {
    ...baseClip('Text', 'text', start),
    kind: 'text',
    text: {
      content,
      font: 'sans',
      size: 80,
      weight: 700,
      align: 'center',
      color: '#ffffff',
      background: '#000000',
      backgroundOpacity: 0,
      stroke: 0,
      strokeColor: '#000000',
      shadow: false,
      animation: 'none',
    },
  };
}
export function splitClip(project: Project, id: string, at: number): Project {
  if (project.clips.length >= 40) return project;
  const clip = project.clips.find((c) => c.id === id);
  if (
    !clip ||
    project.tracks.find((t) => t.id === clip.track)?.locked ||
    at - clip.start < 1 / project.fps ||
    clip.start + clip.duration - at < 1 / project.fps
  )
    return project;
  const left = at - clip.start;
  return {
    ...project,
    clips: project.clips.flatMap((c) =>
      c.id !== id
        ? [c]
        : [
            { ...c, duration: left, audio: { ...c.audio, fadeOut: 0 } },
            {
              ...c,
              id: uid(),
              start: at,
              duration: c.duration - left,
              sourceIn: c.sourceIn + left * c.speed,
              transition: 'none',
              audio: { ...c.audio, fadeIn: 0 },
            },
          ],
    ),
  };
}
export function trimClip(
  clip: Clip,
  edge: 'left' | 'right',
  delta: number,
  sourceDuration: number,
  fps: number,
): Clip {
  const min = 1 / fps;
  if (edge === 'left') {
    const d = clamp(
      delta,
      -Math.min(
        clip.start,
        clip.kind === 'text' || clip.kind === 'image' ? clip.start : clip.sourceIn / clip.speed,
      ),
      clip.duration - min,
    );
    return {
      ...clip,
      start: clip.start + d,
      duration: clip.duration - d,
      sourceIn: Math.max(0, clip.sourceIn + d * clip.speed),
    };
  }
  const max =
    clip.kind === 'text' || clip.kind === 'image'
      ? 180 - clip.start
      : Math.min(180 - clip.start, (sourceDuration - clip.sourceIn) / clip.speed);
  return { ...clip, duration: clamp(clip.duration + delta, min, max) };
}
export function snapTime(
  value: number,
  project: Project,
  excluded: string,
  playhead: number,
  tolerance: number,
) {
  const points = [
    0,
    playhead,
    ...project.clips
      .filter((c) => c.id !== excluded)
      .flatMap((c) => [c.start, c.start + c.duration]),
  ];
  return (
    points
      .filter((p) => Math.abs(p - value) < tolerance)
      .sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0] ?? value
  );
}
export function templateProject(kind: string): Project {
  const p = newProject();
  p.name = kind;
  if (kind === 'Blank project' || kind === 'Instagram Reel') return p;
  const c = textClip(
    0,
    kind === 'Quote Reel'
      ? 'Small steps.\nSilent progress.'
      : kind === 'Cinematic Reel'
        ? 'EVERY FRAME\nTELLS A STORY.'
        : 'Show up.\nMove forward.',
  );
  c.duration = 8;
  c.text.animation = 'fade';
  c.text.color = kind === 'Motivational Reel' ? '#d9ff3f' : '#ffffff';
  if (kind === 'Cinematic Reel') {
    p.ratio = '16:9';
    c.text.font = 'serif';
  }
  return { ...p, clips: [c] };
}
