import type { RenderSettings } from './renderConfig.js';
import { palette as P, noise } from './renderConfig.js';
export function atmosphere(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: RenderSettings,
  now: number,
  reducedMotion: boolean,
) {
  if (settings.lighting !== 'day') {
    ctx.fillStyle = settings.lighting === 'dusk' ? '#45394b33' : '#10233477';
    ctx.fillRect(0, 0, width, height);
  }
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.25,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.65,
  );
  vignette.addColorStop(0, '#10191d00');
  vignette.addColorStop(1, '#10191d66');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  if (settings.weather === 'fog') {
    ctx.fillStyle = '#a5afb214';
    ctx.fillRect(0, 0, width, height);
  }
  if (settings.weather === 'rain') {
    ctx.strokeStyle = '#a5afb24d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 65; i++) {
      const n = noise(i, 3),
        x = n % Math.max(1, width),
        y = ((n >>> 8) + (reducedMotion ? 0 : now * 0.16)) % height;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 9);
    }
    ctx.stroke();
  }
}
export function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, wide = false) {
  ctx.fillStyle = '#10191d55';
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y) + 2, wide ? 23 : 10, wide ? 8 : 4, 0, 0, Math.PI * 2);
  ctx.fill();
}
export function damage(ctx: CanvasRenderingContext2D, x: number, y: number, remaining: number) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, remaining / 250);
  ctx.fillStyle = P.zombie;
  for (let i = 0; i < 5; i++) ctx.fillRect(x - 10 + i * 5, y - 25 - (i % 2) * 5, 2, 2);
  ctx.restore();
}
