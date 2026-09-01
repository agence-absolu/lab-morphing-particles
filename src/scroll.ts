/** Ou en est le morphing : segment courant et avancement dedans. */
export interface Segment {
  /** index de l'etape de depart */
  index: number;
  /** avancement de 0 a 1 apres retrait des paliers */
  t: number;
}

/**
 * Repartit la progression sur les transitions. `hold` reserve un palier
 * immobile en debut et fin de segment, le temps que l'image se pose.
 */
export function segmentAt(progress: number, stages: number, hold: number): Segment {
  const segments = Math.max(1, stages - 1);
  const raw = Math.max(0, Math.min(segments - 0.0001, progress * segments));
  const index = Math.floor(raw);
  const local = raw - index;
  return { index, t: Math.max(0, Math.min(1, (local - hold) / (1 - hold * 2))) };
}

/** Etape mise en avant dans la legende. */
export function activeStage(progress: number, stages: number): number {
  return Math.min(stages - 1, Math.floor(progress * stages));
}
