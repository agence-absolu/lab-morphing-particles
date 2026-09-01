import type { Cell } from './types';

/** Au-dela, on considere qu'il n'y a pas de voisine : la cellule a disparu. */
const REACH = 6;

/** Meilleure cellule sur l'anneau carre de rayon r ; sans `taken`, prises comprises. */
function ringPick(
  grid: Int32Array,
  taken: Uint8Array | null,
  cols: number,
  cx: number,
  cy: number,
  r: number,
): number {
  let best = -1;
  let bestD = Infinity;
  const test = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= cols || y >= cols) return;
    const i = grid[y * cols + x];
    if (i < 0 || taken?.[i]) return;
    const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  };
  const x0 = cx - r;
  const x1 = cx + r;
  const y0 = cy - r;
  const y1 = cy + r;
  for (let x = x0; x <= x1; x++) {
    test(x, y0);
    test(x, y1);
  }
  for (let y = y0 + 1; y < y1; y++) {
    test(x0, y);
    test(x1, y);
  }
  return best;
}

/** Repartit un nuage sur toutes les particules, en recyclant au modulo. */
export function spread(cells: Cell[], count: number): Cell[] {
  const out = new Array<Cell>(count);
  for (let i = 0; i < count; i++) out[i] = cells[i % cells.length];
  return out;
}

/**
 * Donne a chaque particule la cellule la plus proche de celle qu'elle occupait
 * — la sienne en premier. Entre deux frames d'un clip anime, seul ce qui bouge
 * vraiment bouge : une paupiere se ferme sans faire vibrer le reste de l'oeil.
 */
export function assignByProximity(prev: Cell[], next: Cell[], cols: number): Cell[] {
  const count = prev.length;
  const n = next.length;
  if (!count || !n) return prev;

  const grid = new Int32Array(cols * cols).fill(-1);
  for (let i = 0; i < n; i++) grid[next[i].id] = i;

  const taken = new Uint8Array(n);
  const out = new Array<Cell>(count);
  const orphans: number[] = [];
  let free = n;

  for (let p = 0; p < count; p++) {
    const from = prev[p];
    const cx = from.id % cols;
    const cy = (from.id / cols) | 0;

    let pick = free > 0 ? grid[from.id] : -1;
    if (pick >= 0 && taken[pick]) pick = -1;
    for (let r = 1; r <= REACH && pick < 0 && free > 0; r++) {
      pick = ringPick(grid, taken, cols, cx, cy, r);
    }
    if (pick >= 0) {
      taken[pick] = 1;
      free--;
      out[p] = next[pick];
      continue;
    }
    // plus rien de libre alentour : on double sur la plus proche, prise ou non
    let near = grid[from.id];
    for (let r = 1; near < 0 && r <= REACH; r++) near = ringPick(grid, null, cols, cx, cy, r);
    if (near >= 0) out[p] = next[near];
    else orphans.push(p);
  }

  // les rares particules sans voisine prennent ce qui reste, sinon n'importe quoi
  const spare = next.filter((_, i) => !taken[i]);
  const pool = spare.length ? spare : next;
  orphans.forEach((p, k) => {
    out[p] = pool[k % pool.length];
  });
  return out;
}
