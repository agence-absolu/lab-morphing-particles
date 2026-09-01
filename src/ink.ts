/**
 * Comment lire l'encre d'une image : par son canal alpha (visuel detoure) ou
 * par sa luminosite (image opaque, dont le fond blanc doit rester vide).
 */
export type Ink = 'alpha' | 'luma';

export const luma = (d: Uint8ClampedArray, i: number): number =>
  (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;

/** Densite d'un pixel, entre 0 et 1. */
export function density(d: Uint8ClampedArray, i: number, ink: Ink): number {
  const alpha = d[i + 3] / 255;
  // rien de dessine : ni encre, ni fond — c'est le cas des bandes de cadrage
  if (alpha < 0.04) return 0;
  if (ink === 'luma') return 1 - luma(d, i);
  return alpha * (1 - luma(d, i) * 0.82);
}

/**
 * Une image sans aucune transparence est forcement posee sur un fond : son
 * encre est ce qui est sombre. Sinon, c'est le detourage qui fait foi.
 * Seuls les pixels reellement couverts comptent : les bandes laissees par le
 * cadrage sont transparentes et fausseraient le verdict.
 */
export function detectInk(
  d: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Ink {
  let clear = 0;
  let seen = 0;
  for (let y = y0; y < y1; y += 8) {
    for (let x = x0; x < x1; x += 8) {
      if (d[(y * width + x) * 4 + 3] < 250) clear++;
      seen++;
    }
  }
  return clear / Math.max(1, seen) < 0.01 ? 'luma' : 'alpha';
}
