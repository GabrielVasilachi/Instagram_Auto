export type ReelScene = {
  text: string;
  role: string;
  start: number;
  hold: number;
  duration: number;
  end: number;
};
export function planReel(
  text: string,
  design?: object,
): { version: string; mood: string; duration: number; scenes: ReelScene[] };
