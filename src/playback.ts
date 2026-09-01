/** Deux etapes a melanger, et l'avancement entre elles. */
export interface Phase {
  from: number;
  to: number;
  t: number;
}

/** Les frames d'un clip dans le tableau des etapes. */
export interface Span {
  start: number;
  durations: number[];
}

/** Duree du fondu d'une frame a la suivante : le reste du temps, l'image pose. */
const BLEND_MS = 90;
/** Le signe reste offert au regard avant de rejouer son animation. */
const REST_MS = 3000;

/** La premiere frame est la pose du clip : on l'etire jusqu'au temps de repos. */
const holdsOf = (durations: number[]) =>
  durations.map((ms, i) => (i === 0 ? Math.max(ms, REST_MS) : ms));

/**
 * Ou en est la lecture d'un clip anime. Chaque frame tient sa duree, puis
 * bascule vers la suivante sur un court fondu — un clignement reste sec.
 */
export function clipPhase(span: Span, elapsed: number): Phase {
  const { start, durations } = span;
  const holds = holdsOf(durations);
  const cycle = holds.reduce((sum, ms) => sum + ms, 0);
  if (holds.length < 2 || cycle <= 0) {
    return { from: start, to: start, t: 0 };
  }

  let left = elapsed % cycle;
  let index = 0;
  while (left >= holds[index]) {
    left -= holds[index];
    index = (index + 1) % holds.length;
  }

  const blend = Math.min(BLEND_MS, holds[index] / 2);
  const remaining = holds[index] - left;
  const next = (index + 1) % holds.length;

  return {
    from: start + index,
    to: start + next,
    t: remaining < blend ? 1 - remaining / blend : 0,
  };
}
