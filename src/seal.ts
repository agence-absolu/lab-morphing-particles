import type { Cell, Glyph } from './types';

/** Finesse d'analyse d'un motif : un pas de cellule tous les 1/RES. */
const RES = 96;
/** Un peu plus que le strict necessaire, pour ne jamais voir un bord. */
const MARGIN = 1.06;
/** Points echantillonnes le long du contour, repartis par longueur. */
const OUTLINE = 200;
/** Ecart tolere en simplifiant le contour, en fraction de la cellule. */
const SLACK = 0.002;
/**
 * Un motif filiforme demanderait un zoom sans fin pour remplir sa cellule :
 * au-dela, on accepte qu'il reste un peu de vide dans les coins.
 */
const MAX_ZOOM = 32;

const NS = 'http://www.w3.org/2000/svg';

export interface Point {
  x: number;
  y: number;
}

/** Un motif etudie : ou zoomer dedans, de combien, et son contour aplati. */
export interface Seal {
  /** point le plus loin de tout bord, en unites de viewBox */
  pole: Point;
  /** zoom a partir duquel le motif remplit sa cellule */
  zoom: number;
  /** contours aplatis, un par sous-chemin */
  rings: Point[][];
  /** la cellule a remplir, en unites de viewBox */
  cell: { x0: number; y0: number; x1: number; y1: number };
}

/** Le nuage final vu comme une matiere : ou zoomer, et jusqu'ou elle est pleine. */
export interface Cloud {
  /** centre de la cellule la plus profonde, en unites de canvas */
  pole: Point;
  /** demi-cote du carre plein autour du pole, en unites de canvas */
  reach: number;
}

/**
 * Distance de Chebyshev au vide, en cellules. Chebyshev et non Euclide : une
 * profondeur de d garantit que le carre de (2d-1) cellules centre sur la
 * cellule est plein, ce qui est exactement la question posee ici.
 */
function depthMap(mask: Uint8Array, cols: number, rows: number): Int32Array {
  const d = new Int32Array(cols * rows);
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= cols || y >= rows ? 0 : d[y * cols + x];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (mask[i]) d[i] = 1 + Math.min(at(x - 1, y - 1), at(x, y - 1), at(x + 1, y - 1), at(x - 1, y));
    }
  }
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = cols - 1; x >= 0; x--) {
      const i = y * cols + x;
      if (!mask[i]) continue;
      d[i] = Math.min(d[i], 1 + Math.min(at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x + 1, y)));
    }
  }
  return d;
}

/** Cellule la plus enfoncee dans la matiere, et sa profondeur. */
function deepest(mask: Uint8Array, cols: number, rows: number) {
  const d = depthMap(mask, cols, rows);
  let best = 0;
  let index = 0;
  for (let i = 0; i < d.length; i++) {
    if (d[i] > best) {
      best = d[i];
      index = i;
    }
  }
  return { col: index % cols, row: (index / cols) | 0, depth: best };
}

/**
 * Aplatit chaque sous-chemin en polyligne. La geometrie est lue sur le path
 * complet — un `m` relatif n'aurait pas de sens isole — et les sous-chemins
 * sont bornes par la longueur cumulee des prefixes.
 */
function flatten(d: string, slack: number): Point[][] {
  const node = document.createElementNS(NS, 'path');
  const parts = d.match(/[Mm][^Mm]*/g) ?? [];
  if (!parts.length) return [];

  const ends = parts.map((_, i) => {
    node.setAttribute('d', parts.slice(0, i + 1).join(''));
    return node.getTotalLength();
  });
  const total = ends[ends.length - 1];
  if (!(total > 0)) return [];

  node.setAttribute('d', d);
  return parts
    .map((_, i) => {
      const from = i ? ends[i - 1] : 0;
      const span = ends[i] - from;
      const steps = Math.max(3, Math.round((span / total) * OUTLINE));
      const ring = Array.from({ length: steps }, (_, k) => {
        const p = node.getPointAtLength(from + (span * k) / steps);
        return { x: p.x, y: p.y };
      });
      return simplify(ring, slack);
    })
    .filter((ring) => ring.length >= 3);
}

/** Le contour de la cellule, faute de mieux. */
function square(cell: Seal['cell']): Point[][] {
  return [
    [
      { x: cell.x0, y: cell.y0 },
      { x: cell.x1, y: cell.y0 },
      { x: cell.x1, y: cell.y1 },
      { x: cell.x0, y: cell.y1 },
    ],
  ];
}

/** Ecart d'un point a la droite qui joint ses voisins. */
function sag(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len ? Math.abs(dx * (a.y - p.y) - dy * (a.x - p.x)) / len : Math.hypot(p.x - a.x, p.y - a.y);
}

/**
 * Retire les points alignes. Un contour droit echantillonne en deux cents
 * points redevient ses quelques sommets : le motif est tamponne un millier de
 * fois par image, chaque segment epargne compte.
 */
function simplify(poly: Point[], slack: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const prev = out.length ? out[out.length - 1] : poly[(i + poly.length - 1) % poly.length];
    const next = poly[(i + 1) % poly.length];
    if (sag(poly[i], prev, next) > slack) out.push(poly[i]);
  }
  return out.length >= 3 ? out : poly;
}

/** Masque du motif sur une grille reguliere, dans la fenetre de sa cellule. */
function rasterize(glyph: Glyph, cell: Seal['cell']): Uint8Array {
  const ctx = document.createElement('canvas').getContext('2d');
  const mask = new Uint8Array(RES * RES);
  if (!ctx) return mask;

  const step = (cell.x1 - cell.x0) / RES;
  for (let row = 0; row < RES; row++) {
    const y = cell.y0 + (row + 0.5) * step;
    for (let col = 0; col < RES; col++) {
      const x = cell.x0 + (col + 0.5) * step;
      if (ctx.isPointInPath(glyph.path, x, y)) mask[row * RES + col] = 1;
    }
  }
  return mask;
}

/**
 * Etudie un motif pour la fermeture : le point ou zoomer sans jamais decouvrir
 * de vide, et le grossissement a partir duquel il remplit toute sa cellule.
 */
export function studySeal(glyph: Glyph): Seal {
  const half = glyph.size / 2;
  const cell = {
    x0: glyph.cx - half,
    y0: glyph.cy - half,
    x1: glyph.cx + half,
    y1: glyph.cy + half,
  };
  // un motif sans matiere — un trait, un point — n'a pas de forme a faire
  // grossir : sa cellule se remplit d'elle-meme, sans quoi le fond n'arriverait
  // jamais
  const plain: Seal = {
    pole: { x: glyph.cx, y: glyph.cy },
    zoom: 1,
    rings: square(cell),
    cell,
  };
  const rings = flatten(glyph.d, glyph.size * SLACK);
  if (!rings.length) return plain;

  const step = glyph.size / RES;
  const depth = depthMap(rasterize(glyph, cell), RES, RES);
  let best: { pole: Point; zoom: number } | null = null;

  // le pole est celui qui demande le moins de grossissement : profond dans la
  // matiere, mais aussi proche que possible du coin de cellule le plus lointain
  for (let i = 0; i < depth.length; i++) {
    if (!depth[i]) continue;
    const pole = {
      x: cell.x0 + ((i % RES) + 0.5) * step,
      y: cell.y0 + (((i / RES) | 0) + 0.5) * step,
    };
    const far = Math.max(
      pole.x - cell.x0,
      cell.x1 - pole.x,
      pole.y - cell.y0,
      cell.y1 - pole.y,
    );
    const zoom = (far / ((depth[i] - 0.5) * step)) * MARGIN;
    if (!best || zoom < best.zoom) best = { pole, zoom };
  }
  if (!best) return plain;

  return { pole: best.pole, zoom: Math.min(MAX_ZOOM, best.zoom), rings, cell };
}

/** Meme lecture, mais sur le nuage de cellules : la matiere reellement peinte. */
export function studyCloud(cells: Cell[], cols: number, px: number): Cloud | null {
  if (!cells.length) return null;
  const mask = new Uint8Array(cols * cols);
  for (const cell of cells) mask[cell.id] = 1;

  const { col, row, depth } = deepest(mask, cols, cols);
  if (!depth) return null;
  return {
    pole: { x: (col + 0.5) * px, y: (row + 0.5) * px },
    reach: (depth - 0.5) * px,
  };
}

/** Coupe un polygone par un demi-plan aligne sur l'axe (Sutherland-Hodgman). */
function cut(poly: Point[], axis: 'x' | 'y', bound: number, keepAbove: boolean): Point[] {
  const inside = (p: Point) => (keepAbove ? p[axis] >= bound : p[axis] <= bound);
  const out: Point[] = [];

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const inA = inside(a);
    const inB = inside(b);
    if (inA) out.push(a);
    if (inA === inB) continue;
    const other = axis === 'x' ? 'y' : 'x';
    const t = (bound - a[axis]) / (b[axis] - a[axis]);
    const point = { x: 0, y: 0 };
    point[axis] = bound;
    point[other] = a[other] + (b[other] - a[other]) * t;
    out.push(point);
  }
  return out;
}

/**
 * Le motif a un instant de la fermeture : grossi autour de son pole, puis
 * coupe aux bords de sa cellule. Au terme, le contour deborde de toutes parts
 * et il ne reste que le carre — la cellule est pleine, ses voisines aussi.
 */
export function sealedPath(seal: Seal, t: number): Path2D {
  const { pole, cell } = seal;
  const zoom = 1 + (seal.zoom - 1) * t;
  const path = new Path2D();

  for (const ring of seal.rings) {
    let poly = ring.map((p) => ({
      x: pole.x + (p.x - pole.x) * zoom,
      y: pole.y + (p.y - pole.y) * zoom,
    }));
    poly = cut(poly, 'x', cell.x0, true);
    poly = cut(poly, 'x', cell.x1, false);
    poly = cut(poly, 'y', cell.y0, true);
    poly = cut(poly, 'y', cell.y1, false);
    if (poly.length < 3) continue;

    path.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) path.lineTo(poly[i].x, poly[i].y);
    path.closePath();
  }
  return path;
}
