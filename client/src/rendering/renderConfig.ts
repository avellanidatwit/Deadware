export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const palette = {
  void: '#161d20',
  charcoal: '#202829',
  slate: '#303b3a',
  grass: '#53615d',
  foliage: '#78816b',
  concrete: '#a4a18a',
  earth: '#665c50',
  fog: '#a5afb2',
  survivor: '#75a99a',
  zombie: '#a26b67',
  loot: '#c8ad71',
  shadow: '#10191d',
};
export interface Point {
  x: number;
  y: number;
}
export interface RenderSettings {
  roofs: boolean;
  lighting: 'day' | 'dusk' | 'night';
  weather: 'clear' | 'rain' | 'fog';
  grid: boolean;
  names: boolean;
  health: boolean;
  sight: boolean;
  trails: boolean;
  coordinates: boolean;
  debug: boolean;
  follow: boolean;
}
export const defaultSettings: RenderSettings = {
  roofs: true,
  lighting: 'day',
  weather: 'clear',
  grid: false,
  names: false,
  health: false,
  sight: false,
  trails: false,
  coordinates: false,
  debug: false,
  follow: false,
};
/** Stable integer noise: decoration never flickers or changes gameplay. */
export function noise(x: number, y: number, seed = 0): number {
  let n =
    Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(seed + 1, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}
