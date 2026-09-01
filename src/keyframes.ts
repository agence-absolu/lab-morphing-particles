import type { Cell, Frames } from './types';

const EMPTY: Frames = {
  stages: 0,
  count: 0,
  x: new Float32Array(0),
  y: new Float32Array(0),
  v: new Float32Array(0),
  solo: new Float32Array(0),
  drift: new Float32Array(0),
  jitter: new Float32Array(0),
};

/** Bruit deterministe : meme particule, meme arc a chaque reconstruction. */
const noise = (i: number) => Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);

/**
 * Met a plat les etapes deja assignees : chacune donne, pour chaque particule,
 * la cellule qu'elle occupe. C'est l'assignation qui porte l'appariement.
 */
export function buildFrames(stages: Cell[][], canvasSize: number): Frames {
  const count = stages[0]?.length ?? 0;
  if (!count) return EMPTY;

  const total = stages.length * count;
  const x = new Float32Array(total);
  const y = new Float32Array(total);
  const v = new Float32Array(total);
  const solo = new Float32Array(total);

  stages.forEach((cells, stage) => {
    const base = stage * count;
    const taken = new Set<number>();
    for (let i = 0; i < count; i++) {
      const cell = cells[i];
      x[base + i] = cell.x;
      y[base + i] = cell.y;
      v[base + i] = cell.v;
      // la premiere venue tient la cellule ; les suivantes s'y superposeraient
      solo[base + i] = taken.has(cell.id) ? 0 : 1;
      taken.add(cell.id);
    }
  });

  const drift = new Float32Array(count);
  const jitter = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    drift[i] = x[i] / canvasSize;
    jitter[i] = noise(i);
  }

  return { stages: stages.length, count, x, y, v, solo, drift, jitter };
}
