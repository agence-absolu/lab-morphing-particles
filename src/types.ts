/** Une cellule de la grille retenue apres seuillage. */
export interface Cell {
  /** index dans la grille : row * cols + col */
  id: number;
  x: number;
  y: number;
  /** densite de 0 a 1 : pilote taille, epaisseur et couleur */
  v: number;
  /** angle autour du centre de masse, sert a l'appariement */
  a: number;
  /** distance au centre de masse, departage les angles egaux */
  r: number;
}

/** Region de l'image source a echantillonner, en pixels. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Un motif SVG compile, centre et normalise sur sa viewBox. */
export interface Glyph {
  path: Path2D;
  /** le trace aplati, pour qui doit relire sa geometrie */
  d: string;
  cx: number;
  cy: number;
  size: number;
}

/** Les keyframes de toutes les particules, a plat. */
export interface Frames {
  /** nombre d'etapes (une par image source) */
  stages: number;
  /** nombre de particules */
  count: number;
  /** positions et densites : stages * count */
  x: Float32Array;
  y: Float32Array;
  v: Float32Array;
  /** par particule : retard du stagger (0 a 1) */
  drift: Float32Array;
  /** par particule : sens et amplitude de l'arc */
  jitter: Float32Array;
}

/**
 * Comment la course s'acheve : en fermant chaque cellule sur elle-meme, ou en
 * plongeant dans le motif d'une seule.
 */
export type Ending = 'cells' | 'dive';

/** Reglages derives des valeurs par defaut et de la barre de reglages. */
export interface Settings {
  cols: number;
  /** cote d'une cellule en pixels */
  px: number;
  stagger: number;
  arc: number;
  hold: number;
  /** densite en dessous de laquelle une cellule est ignoree */
  floor: number;
  ending: Ending;
}
