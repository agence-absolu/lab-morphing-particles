type Rgb = readonly [number, number, number];

/** Du bleu pale au navy : la densite d'une cellule choisit son rang. */
const RAMP: readonly Rgb[] = [
  [201, 214, 250],
  [126, 152, 243],
  [58, 96, 232],
  [30, 63, 228],
  [16, 38, 158],
  [8, 18, 74],
];

/**
 * Rang du bleu de fond dans la rampe : la fermeture y amene les particules,
 * pour qu'elles rejoignent exactement la couleur qui prendra leur suite.
 */
export const BLUE_LEVEL = 3 / (RAMP.length - 1);

/** Paliers de quantification : autant de chaines rgb pre-calculees. */
const STEPS = 16;

const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

/** Couleur interpolee sur la rampe, pour v dans [0, 1]. */
function colorAt(v: number): string {
  const t = Math.max(0, Math.min(0.999, v)) * (RAMP.length - 1);
  const i = Math.floor(t);
  const f = t - i;
  const a = RAMP[i];
  const b = RAMP[Math.min(RAMP.length - 1, i + 1)];
  return `rgb(${mix(a[0], b[0], f)},${mix(a[1], b[1], f)},${mix(a[2], b[2], f)})`;
}

/**
 * Les chaines sont figees une fois pour toutes : le moteur ne reparse plus
 * une couleur CSS a chaque particule.
 */
export function buildRampCache(): string[] {
  return Array.from({ length: STEPS }, (_, i) => colorAt(i / (STEPS - 1)));
}

/** Rang d'une densite dans le cache. */
export function bucketOf(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return STEPS - 1;
  return (v * (STEPS - 1)) | 0;
}
