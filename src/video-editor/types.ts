export type MediaKind = 'video' | 'image' | 'audio'
export type TrackId = 'video' | 'overlay' | 'text' | 'audio'
export type Ratio = '9:16' | '16:9' | '1:1' | '4:5'
export type Animation = 'none' | 'fade' | 'slide-up' | 'slide-left' | 'pop' | 'zoom'
export interface MediaAsset {
  id: string
  name: string
  kind: MediaKind
  duration: number
  width: number
  height: number
  size: number
  mime: string
  thumbnail?: string
  waveform?: number[]
}
export interface Transform {
  x: number
  y: number
  scale: number
  width: number
  height: number
  rotation: number
  opacity: number
  flipX: boolean
  flipY: boolean
  fit: 'fit' | 'fill'
}
export interface Adjustments {
  brightness: number
  contrast: number
  saturation: number
  exposure: number
  blur: number
  grayscale: number
}
export interface AudioSettings {
  volume: number
  muted: boolean
  fadeIn: number
  fadeOut: number
}
export interface TextStyle {
  content: string
  font: 'sans' | 'serif' | 'mono'
  size: number
  weight: number
  align: 'left' | 'center' | 'right'
  color: string
  background: string
  backgroundOpacity: number
  stroke: number
  strokeColor: string
  shadow: boolean
  animation: Animation
}
interface BaseClip {
  id: string
  name: string
  track: TrackId
  start: number
  duration: number
  sourceIn: number
  speed: number
  transform: Transform
  adjustments: Adjustments
  audio: AudioSettings
  transition: 'none' | 'fade' | 'dissolve'
  transitionDuration: number
}
export interface VideoClip extends BaseClip {
  kind: 'video' | 'image'
  assetId: string
}
export interface AudioClip extends BaseClip {
  kind: 'audio'
  assetId: string
}
export interface TextClip extends BaseClip {
  kind: 'text'
  text: TextStyle
}
export type Clip = VideoClip | AudioClip | TextClip
export interface Track {
  id: TrackId
  name: string
  label: string
  muted: boolean
  hidden: boolean
  locked: boolean
}
export interface Project {
  version: 1
  id: string
  name: string
  ratio: Ratio
  fps: 24 | 30 | 60
  background: string
  assets: MediaAsset[]
  clips: Clip[]
  tracks: Track[]
}
export interface ExportSettings {
  resolution: 720 | 1080
  fps: 24 | 30 | 60
  quality: 'standard' | 'high'
}
export interface ExportResult {
  url: string
  token: string
  duration: number
  width: number
  height: number
}
export type Resources = Map<
  string,
  { url: string; element: HTMLVideoElement | HTMLAudioElement | HTMLImageElement }
>
