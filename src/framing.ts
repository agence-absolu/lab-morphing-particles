import { density, detectInk } from './ink';
import type { Crop } from './types';

/** Resolution d'analyse : la boite se mesure tres bien en petit. */
const WORK = 200;
/** Un peu d'air autour du sujet, en fraction du cote. */
const MARGIN = 0.03;

/** Taille intrinseque, qu'il s'agisse d'une image, d'un bitmap ou d'un canvas. */
export function sizeOf(img: CanvasImageSource): { w: number; h: number } {
  const source = img as Partial<Record<'naturalWidth' | 'width' | 'naturalHeight' | 'height', number>>;
  return {
    w: source.naturalWidth || source.width || 1,
    h: source.naturalHeight || source.height || 1,
  };
}

/** Boite englobante de l'encre, en pixels de l'image source. */
export function inkBounds(img: CanvasImageSource, floor: number): Crop | null {
  const { w: W, h: H } = sizeOf(img);
  const k = Math.min(WORK / W, WORK / H, 1);
  const w = Math.max(1, Math.round(W * k));
  const h = Math.max(1, Math.round(H * k));

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  const d = ctx.getImageData(0, 0, w, h).data;
  const ink = detectInk(d, w, 0, 0, w, h);

  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (density(d, (y * w + x) * 4, ink) <= floor) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;

  const scale = 1 / k;
  return {
    x: x0 * scale,
    y: y0 * scale,
    w: (x1 - x0 + 1) * scale,
    h: (y1 - y0 + 1) * scale,
  };
}

/**
 * Cadre commun a plusieurs frames. Un clip anime doit garder une echelle
 * fixe : sans cette union, l'oeil changerait de taille en clignant.
 */
export function union(boxes: (Crop | null)[]): Crop | null {
  const kept = boxes.filter((b): b is Crop => b !== null);
  if (!kept.length) return null;

  const x = Math.min(...kept.map((b) => b.x));
  const y = Math.min(...kept.map((b) => b.y));
  const right = Math.max(...kept.map((b) => b.x + b.w));
  const bottom = Math.max(...kept.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** Ajoute une marge, sans deborder de l'image. */
export function withMargin(box: Crop, img: CanvasImageSource): Crop {
  const { w: W, h: H } = sizeOf(img);
  const pad = Math.max(box.w, box.h) * MARGIN;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  return {
    x,
    y,
    w: Math.min(W - x, box.w + pad * 2),
    h: Math.min(H - y, box.h + pad * 2),
  };
}
