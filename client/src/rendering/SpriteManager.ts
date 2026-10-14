import type { TileType } from '../../../shared/src/types/world.js';
import { noise, palette as P } from './renderConfig.js';

export type AssetCategory =
  | 'terrain'
  | 'roads'
  | 'buildings'
  | 'walls'
  | 'vegetation'
  | 'survivors'
  | 'zombies'
  | 'containers'
  | 'vehicles'
  | 'furniture'
  | 'loot'
  | 'effects';
export interface Sprite {
  image: CanvasImageSource;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}
type Painter = (ctx: CanvasRenderingContext2D) => void;
export function polygon(ctx: CanvasRenderingContext2D, points: number[][], color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}
export function diamond(ctx: CanvasRenderingContext2D, x = 0, y = 0) {
  ctx.beginPath();
  ctx.moveTo(x, y - 16);
  ctx.lineTo(x + 32, y);
  ctx.lineTo(x, y + 16);
  ctx.lineTo(x - 32, y);
  ctx.closePath();
}
/** Hand-authored pixel recipes, cached once. register() can replace any recipe with an atlas crop or image. */
export class SpriteManager {
  private cache = new Map<string, Sprite>();
  register(category: AssetCategory, name: string, sprite: Sprite) {
    this.cache.set(`${category}/${name}`, sprite);
  }
  private make(
    category: AssetCategory,
    name: string,
    width: number,
    height: number,
    anchorX: number,
    anchorY: number,
    paint: Painter,
  ): Sprite {
    const key = `${category}/${name}`,
      existing = this.cache.get(key);
    if (existing) return existing;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    paint(ctx);
    const sprite = { image: canvas, width, height, anchorX, anchorY };
    this.cache.set(key, sprite);
    return sprite;
  }
  get size() {
    return this.cache.size;
  }
  terrain(type: TileType, variant: number): Sprite {
    return this.make(
      type === 'road' ? 'roads' : 'terrain',
      `${type}-${variant}`,
      64,
      32,
      32,
      16,
      (ctx) => {
        const base =
          type === 'empty'
            ? ['#4c5b51', '#505f54', '#536057', '#4a594e'][variant % 4]
            : type === 'road'
              ? ['#444c4a', '#474e4c', '#424b49', '#4b514e'][variant % 4]
              : '#7d7c6c';
        diamond(ctx, 32, 16);
        ctx.fillStyle = base;
        ctx.fill();
        ctx.save();
        ctx.clip();
        for (let i = 0; i < 28; i++) {
          const n = noise(i, variant, type === 'empty' ? 5 : 9),
            x = n % 64,
            y = (n >>> 8) % 32;
          ctx.fillStyle =
            type === 'empty'
              ? i % 3
                ? P.foliage
                : P.earth
              : type === 'road'
                ? i % 3
                  ? '#59615a'
                  : '#313c39'
                : i % 3
                  ? '#979480'
                  : '#686d61';
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x, y, type === 'road' ? 2 : 3, 1);
          if (type === 'empty' && i % 4 === 0) ctx.fillRect(x + 1, y - 2, 1, 3);
        }
        ctx.globalAlpha = 1;
        if (type === 'empty' && variant >= 4) {
          polygon(
            ctx,
            [
              [10, 15],
              [25, 9],
              [37, 13],
              [29, 22],
              [18, 22],
            ],
            '#665c5033',
          );
        }
        if (type === 'road') {
          ctx.strokeStyle = '#303a37';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(14 + variant * 3, 9);
          ctx.lineTo(25, 13);
          ctx.lineTo(22, 18);
          ctx.lineTo(37, 24);
          ctx.stroke();
        }
        if (type !== 'empty' && type !== 'road') {
          ctx.strokeStyle = '#686d6133';
          ctx.beginPath();
          ctx.moveTo(0, 16);
          ctx.lineTo(32, 32);
          ctx.lineTo(64, 16);
          ctx.stroke();
          ctx.fillStyle = '#b0a38633';
          ctx.fillRect(23, 13, 10, 1);
        }
        ctx.restore();
      },
    );
  }
  actor(
    zombie: boolean,
    facing: number,
    frame: number,
    variant: number,
    dead = false,
    pose: 'idle' | 'attack' | 'dying' = 'idle',
  ): Sprite {
    return this.make(
      zombie ? 'zombies' : 'survivors',
      `${facing}-${frame}-${variant}-${dead}-${pose}`,
      32,
      48,
      16,
      43,
      (ctx) => {
        const ink = '#26332f',
          skin = zombie ? '#969b79' : '#b6a48a';
        const shirt = zombie
          ? ['#7d6c61', '#737966', '#826863', '#807e6c', '#686c69', '#8b806b'][variant % 6]
          : ['#6f9489', '#72818a', '#8d876b', '#7e777e', '#8d7764', '#608278'][variant % 6];
        if (dead) {
          polygon(
            ctx,
            [
              [4, 40],
              [13, 34],
              [27, 39],
              [18, 44],
            ],
            shirt,
          );
          ctx.fillStyle = skin;
          ctx.fillRect(25, 36, 5, 4);
          return;
        }
        if (pose === 'dying' && !dead) ctx.translate(frame * 2, frame * 3);
        const step = pose === 'idle' ? (frame === 1 ? 2 : frame === 3 ? -2 : 0) : 0,
          lean = zombie ? 2 : 0,
          back = facing === 0 || facing === 3;
        ctx.fillStyle = ink;
        ctx.fillRect(10 + step, 34, 4, 9 - step);
        ctx.fillRect(19 - step, 34, 4, 9 + step);
        ctx.fillStyle = '#343e3a';
        ctx.fillRect(8 + step, 41 - step, 7, 3);
        ctx.fillRect(19 - step, 41 + step, 7, 3);
        // Asymmetric ragged shoulders and extended arms distinguish zombies without color.
        polygon(
          ctx,
          zombie
            ? [
                [10, 21],
                [22, 23],
                [24, 36],
                [9, 35],
              ]
            : [
                [10, 22],
                [22, 22],
                [24, 35],
                [9, 35],
              ],
          shirt,
        );
        ctx.fillStyle = zombie ? '#665d51' : '#49635e';
        ctx.fillRect(10, 31, 13, 3);
        ctx.fillStyle = skin;
        if (zombie) {
          ctx.fillRect(facing === 1 ? 21 : 4, 25, 9, 3);
          ctx.fillRect(facing === 1 ? 25 : 3, 28, 4, 4);
        } else {
          ctx.fillRect(7, 25 + step, 3, 9);
          ctx.fillRect(23, 25 - step, 3, 9);
        }
        ctx.fillRect(11 + lean, 11, 11, 11);
        ctx.fillRect(13 + lean, 21, 6, 3);
        ctx.fillStyle = zombie ? '#535b4e' : '#544f45';
        ctx.fillRect(11 + lean, 10, 11, 4);
        ctx.fillRect(back ? 19 : 11, 13, 3, 7);
        if (!back) {
          ctx.fillStyle = ink;
          ctx.fillRect(facing === 1 ? 20 : 14, 16, 2, 2);
        }
        if (pose === 'attack') {
          ctx.fillStyle = shirt;
          ctx.fillRect(facing === 1 ? 22 : 1, 20 + frame, 10, 4);
          ctx.fillStyle = skin;
          ctx.fillRect(facing === 1 ? 29 : 0, 21 + frame, 3, 3);
        }
        if (!zombie && variant >= 3) {
          ctx.fillStyle = variant === 3 ? '#5a6156' : '#8c8976';
          ctx.fillRect(9, 10, 15, 3);
          if (variant === 5) ctx.fillRect(11, 8, 11, 3);
        }
        if (zombie && variant >= 3) {
          ctx.fillStyle = '#4d5c50';
          ctx.fillRect(17, 25, 3, 7);
        }
        if (!zombie) {
          ctx.fillStyle = '#394d49';
          ctx.fillRect(back ? 12 : 9, 25, 5, 8);
          ctx.fillStyle = P.survivor;
          ctx.fillRect(21, 22, 3, 3);
        } else {
          ctx.fillStyle = '#b0ac88';
          ctx.fillRect(13, 31, 2, 3);
          ctx.fillRect(21, 35, 2, 4);
        }
      },
    );
  }
  object(name: string, variant = 0): Sprite {
    return this.make(
      ['Car', 'Car body'].includes(name)
        ? 'vehicles'
        : ['Cabinet', 'Desk', 'Dresser', 'Bookshelf'].includes(name)
          ? 'containers'
          : 'furniture',
      `${name}-${variant}`,
      64,
      72,
      32,
      57,
      (ctx) => {
        const box = (top: string, left: string, right: string, h: number, w = 21, d = 11) => {
          polygon(
            ctx,
            [
              [32 - w, 57 - d],
              [32, 57 - 2 * d],
              [32 + w, 57 - d],
              [32, 57],
            ],
            top,
          );
          polygon(
            ctx,
            [
              [32 - w, 57 - d],
              [32, 57],
              [32, 57 + h],
              [32 - w, 57 - d + h],
            ],
            left,
          );
          polygon(
            ctx,
            [
              [32, 57],
              [32 + w, 57 - d],
              [32 + w, 57 - d + h],
              [32, 57 + h],
            ],
            right,
          );
        };
        ctx.translate(0, -12);
        if (name === 'Car' || name === 'Car body') {
          box('#707975', '#384541', '#515d55', 9, 28, 13);
          ctx.translate(0, -10);
          box('#89918a', '#536864', '#5c726c', 9, 18, 9);
          ctx.fillStyle = '#273f40';
          ctx.fillRect(19, 29, 12, 6);
          ctx.fillRect(34, 31, 10, 6);
          ctx.fillStyle = '#b29d69';
          ctx.fillRect(9, 47, 4, 3);
          ctx.fillStyle = '#29312f';
          ctx.fillRect(15, 58, 7, 6);
          ctx.fillRect(45, 49, 6, 6);
          return;
        }
        if (name === 'Bed' || name === 'Sofa') {
          box('#858476', '#4e5c54', '#666d5e', 6, 25, 12);
          ctx.fillStyle =
            name === 'Bed'
              ? ['#b1ad94', '#9b9f8b', '#ac9680'][variant % 3]
              : ['#778779', '#7d7376', '#86846d'][variant % 3];
          ctx.fillRect(18, 29, 21, 9);
          ctx.fillStyle = '#575c50';
          ctx.fillRect(14, 37, 3, 13);
          ctx.fillRect(44, 37, 3, 13);
          return;
        }
        if (name === 'Table' || name === 'Desk') {
          ctx.fillStyle = '#4c4439';
          ctx.fillRect(12, 49, 3, 16);
          ctx.fillRect(47, 42, 3, 16);
          ctx.fillRect(30, 56, 3, 12);
          ctx.translate(0, -6);
          box('#9b8c6e', '#655e4f', '#7a6f58', 3, 25, 12);
          ctx.fillStyle = '#c0b79b';
          ctx.fillRect(23, 36, 10, 3);
          return;
        }
        if (name === 'Chair') {
          ctx.fillStyle = '#4c5145';
          ctx.fillRect(23, 40, 3, 23);
          ctx.fillRect(37, 36, 3, 23);
          ctx.fillStyle = '#88846a';
          ctx.fillRect(23, 31, 17, 13);
          ctx.fillRect(19, 48, 18, 5);
          return;
        }
        if (name === 'Bush') {
          polygon(
            ctx,
            [
              [12, 53],
              [17, 43],
              [25, 40],
              [30, 31],
              [39, 39],
              [46, 40],
              [53, 52],
              [35, 59],
            ],
            '#394e40',
          );
          ctx.fillStyle = '#6d7b59';
          for (let i = 0; i < 12; i++)
            ctx.fillRect(
              19 + (noise(i, variant) % 27),
              40 + ((noise(i, variant) >>> 5) % 13),
              4,
              2,
            );
          return;
        }
        ctx.translate(0, -14);
        box(['#8a816b', '#7b8877', '#918173'][variant % 3], '#555b4e', '#706b56', 24, 18, 9);
        ctx.strokeStyle = '#3e4b43';
        ctx.strokeRect(17, 51, 12, 5);
        ctx.strokeRect(17, 59, 12, 5);
        ctx.fillStyle = P.loot;
        ctx.fillRect(23, 53, 3, 1);
        ctx.fillRect(23, 61, 3, 1);
        if (name === 'Bookshelf') {
          ctx.fillStyle = '#bbb090';
          ctx.fillRect(17, 46, 3, 8);
          ctx.fillStyle = '#657d71';
          ctx.fillRect(21, 46, 3, 8);
          ctx.fillStyle = '#986c57';
          ctx.fillRect(25, 46, 3, 8);
        }
      },
    );
  }
  vehicle(horizontal: boolean): Sprite {
    return this.make(
      'vehicles',
      horizontal ? 'car-horizontal' : 'car-vertical',
      128,
      96,
      64,
      76,
      (ctx) => {
        const project = (x: number, y: number, h: number) => [
          64 + (x - y) * 32,
          76 + (x + y) * 16 - h,
        ];
        const corners = horizontal
          ? [
              [-0.9, -0.38],
              [0.9, -0.38],
              [0.9, 0.38],
              [-0.9, 0.38],
            ]
          : [
              [-0.38, -0.9],
              [0.38, -0.9],
              [0.38, 0.9],
              [-0.38, 0.9],
            ];
        const base = corners.map(([x, y]) => project(x, y, 5)),
          top = corners.map(([x, y]) => project(x, y, 17));
        polygon(ctx, [base[1], base[2], top[2], top[1]], '#465a55');
        polygon(ctx, [base[2], base[3], top[3], top[2]], '#394a45');
        polygon(ctx, top, '#7c877a');
        const cabin = corners.map(([x, y]) => project(x * 0.55, y * 0.55, 27));
        polygon(ctx, cabin, '#9a9b87');
        polygon(ctx, [top[1], top[2], cabin[2], cabin[1]], '#385358');
        polygon(ctx, [top[2], top[3], cabin[3], cabin[2]], '#506a68');
        ctx.fillStyle = '#25332f';
        for (const i of [1, 2, 3]) {
          const [x, y] = base[i];
          ctx.fillRect(Math.round(x) - 4, Math.round(y) - 1, 8, 7);
        }
        ctx.fillStyle = '#c8ad71';
        const [x, y] = top[2];
        ctx.fillRect(Math.round(x) - 3, Math.round(y), 5, 2);
        ctx.fillStyle = '#665c50';
        ctx.fillRect(59, 58, 6, 2);
        ctx.fillRect(66, 61, 3, 2);
      },
    );
  }
  loot(type: string): Sprite {
    return this.make('loot', type, 20, 16, 10, 10, (ctx) => {
      ctx.fillStyle = P.shadow;
      ctx.fillRect(3, 9, 14, 4);
      ctx.fillStyle = P.loot;
      if (type === 'water') {
        ctx.fillStyle = '#8ba6a1';
        ctx.fillRect(8, 3, 5, 8);
        ctx.fillStyle = '#d0cdb3';
        ctx.fillRect(9, 1, 3, 2);
      } else if (type === 'bandage') {
        ctx.fillStyle = '#d6cbb1';
        ctx.fillRect(4, 5, 12, 7);
        ctx.fillStyle = '#9c6458';
        ctx.fillRect(8, 7, 4, 3);
      } else if (type === 'weapon' || type === 'gun') {
        ctx.fillStyle = '#a2a18b';
        ctx.fillRect(4, 6, 12, 3);
        ctx.fillStyle = '#756246';
        ctx.fillRect(5, 9, 4, 4);
      } else {
        ctx.fillRect(5, 4, 10, 8);
        ctx.fillStyle = '#87724c';
        ctx.fillRect(5, 6, 10, 2);
      }
    });
  }
}
export function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number) {
  ctx.drawImage(
    sprite.image,
    Math.round(x - sprite.anchorX),
    Math.round(y - sprite.anchorY),
    sprite.width,
    sprite.height,
  );
}
