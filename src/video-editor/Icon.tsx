import type { CSSProperties } from 'react';
const paths: Record<string, string> = {
  dashboard: 'M3 3h7v8H3Zm11 0h7v5h-7ZM3 15h7v6H3Zm11-3h7v9h-7Z',
  calendar: 'M4 5h16v16H4ZM4 10h16M8 3v4m8-4v4M8 14h2m4 0h2m-8 4h2',
  chart: 'M4 3v18h17M8 16v-5m5 5V7m5 9V4',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  bolt: 'm14 2-10 12h7l-1 8 10-12h-7Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  sidebar: 'M3 3h18v18H3ZM9 3v18',
  logout: 'M9 3H3v18h6m5-14 5 5-5 5m-7-5h12',
  list: 'M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1',
  search: 'M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  play: 'm8 5 11 7-11 7Z',
  pause: 'M8 5v14M16 5v14',
  import: 'M12 15V3m-4 4 4-4 4 4M4 15v5h16v-5',
  export: 'M12 16V3m-4 4 4-4 4 4M4 14v7h16v-7',
  back: 'm10 5-7 7 7 7M3 12h18',
  undo: 'M4 10h9a6 6 0 0 1 0 12M4 10l5-5m-5 5 5 5',
  redo: 'M20 10h-9a6 6 0 0 0 0 12m9-12-5-5m5 5-5 5',
  split: 'm4 4 16 16M4 20l16-16M5 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6m0 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  copy: 'M8 8h12v13H8ZM4 16H2V2h13v3',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  video: 'M3 5h18v14H3ZM3 9h18M7 5l3 4m4-4 3 4',
  audio:
    'M9 18V5l11-2v13M9 8l11-2M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0m11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  text: 'M4 5V3h16v2M12 3v18m-4 0h8',
  image: 'M3 3h18v18H3Zm0 14 6-6 4 4 3-3 5 5M16 7h.01',
  effects: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',
  templates: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
  volume: 'm3 9 5 0 5-5v16l-5-5H3Zm14-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16',
  mute: 'm3 9 5 0 5-5v16l-5-5H3Zm14 0 6 6m0-6-6 6',
  fullscreen: 'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6',
  replay: 'M4 10a8 8 0 1 1 1 8M4 3v7h7',
  previous: 'M5 4v16m14-16L8 12l11 8Z',
  next: 'M19 4v16M5 4l11 8-11 8Z',
  plus: 'M12 4v16M4 12h16',
  minus: 'M4 12h16',
  close: 'm5 5 14 14M19 5 5 19',
  save: 'M4 3h13l4 4v14H3V3Zm3 0v6h9V3M7 21v-8h10v8',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  lock: 'M6 10h12v11H6Zm3 0V6a3 3 0 0 1 6 0v4',
  magnet: 'M4 3v10a8 8 0 0 0 16 0V3h-5v10a3 3 0 0 1-6 0V3ZM4 7h5m6 0h5',
  chevron: 'm8 4 8 8-8 8',
  check: 'm4 12 5 5L20 6',
  folder: 'M3 5h7l2 3h9v13H3Z',
  help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
export function Icon({
  name,
  size = 17,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name] || paths.video} />
    </svg>
  );
}
