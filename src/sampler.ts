import { sizeOf } from './framing';
import { density, detectInk, type Ink } from './ink';
import type { Cell, Crop, Settings } from './types';

/** Sous-echantillonnage : un point tous les tiers de cellule environ. */
const stepFor = (px: number) => Math.max(1, Math.round(px / 3));

/**
 * Dessine la region utile de l'image, centree et sans deformation, puis rend
 * ses pixels avec la maniere de les lire. Sans cadre, c'est l'image entiere
 * qui est prise ; les bandes laissees autour sont exclues de la detection.
 */
function rasterize(
  img: CanvasImageSource,
  size: number,
  crop?: Crop | null,
): { data: Uint8ClampedArray; ink: Ink } {
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d')!;

  const full = sizeOf(img);
  const box = crop ?? { x: 0, y: 0, w: full.w, h: full.h };
  const k = Math.min(size / box.w, size / box.h);
  const dx = (size - box.w * k) / 2;
  const dy = (size - box.h * k) / 2;
  ctx.drawImage(img, box.x, box.y, box.w, box.h, dx, dy, box.w * k, box.h * k);

  const data = ctx.getImageData(0, 0, size, size).data;
  const ink = detectInk(
    data,
    size,
    Math.ceil(dx),
    Math.ceil(dy),
    Math.floor(dx + box.w * k),
    Math.floor(dy + box.h * k),
  );
  return { data, ink };
}

/** Densite moyenne brute d'une cellule : c'est elle que le seuil compare. */
function cellDensity(
  d: Uint8ClampedArray,
  size: number,
  ink: Ink,
  cx: number,
  cy: number,
  px: number,
  step: number,
): number {
  const x1 = Math.min(size, Math.round(cx + px));
  const y1 = Math.min(size, Math.round(cy + px));
  let sum = 0;
  let n = 0;
  for (let y = Math.round(cy); y < y1; y += step) {
    for (let x = Math.round(cx); x < x1; x += step) {
      sum += density(d, (y * size + x) * 4, ink);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Decoupe l'image en cellules et ne garde que celles qui depassent le seuil.
 * C'est la pixelisation : une image devient un nuage de points denses.
 */
export function sampleImage(
  img: CanvasImageSource,
  size: number,
  s: Settings,
  crop?: Crop | null,
): Cell[] {
  const { cols, px, floor } = s;
  const { data, ink } = rasterize(img, size, crop);
  const step = stepFor(px);
  const cells: Cell[] = [];

  for (let row = 0; row < cols; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * px;
      const cy = row * px;
      const raw = cellDensity(data, size, ink, cx, cy, px, step);
      if (raw <= floor) continue;
      // une cellule pleinement dense sature autour de 0.85 : on etale sur [0, 1]
      const v = Math.min(1, raw / 0.85);
      cells.push({ id: row * cols + col, x: cx + px / 2, y: cy + px / 2, v, a: 0, r: 0 });
    }
  }
  return cells;
}

/**
 * Ordonne les cellules par angle autour de leur centre de masse. Deux nuages
 * tries de la meme facon s'apparient naturellement : le morphing devient un
 * deplacement plutot qu'un fondu.
 */
export function sortByAngle(cells: Cell[]): Cell[] {
  if (!cells.length) return cells;

  let sx = 0;
  let sy = 0;
  for (const c of cells) {
    sx += c.x;
    sy += c.y;
  }
  const mx = sx / cells.length;
  const my = sy / cells.length;

  for (const c of cells) {
    c.a = Math.atan2(c.y - my, c.x - mx);
    c.r = Math.hypot(c.x - mx, c.y - my);
  }
  return cells.sort((p, q) => p.a - q.a || p.r - q.r);
}
