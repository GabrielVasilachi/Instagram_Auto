export const FOLLOWER_STANDARD = '2026.3';

export const followerSeries = {
  focus: { name: 'Focus Reset', promise: 'practical focus resets', template: 'ocean' },
  discipline: { name: 'Small Wins', promise: 'habits you can keep', template: 'forest' },
  resilience: { name: 'Start Again', promise: 'small steps after setbacks', template: 'midnight' },
};

export function seriesFor(pillar) {
  return followerSeries[pillar] ??
    (['purpose', 'quiet-confidence'].includes(pillar) ? followerSeries.focus :
      ['courage', 'self-respect'].includes(pillar) ? followerSeries.resilience : followerSeries.discipline);
}
