/** Motifs predefinis : paths SVG dans une viewBox 0 0 24 24. */
export const GLYPHS: Record<string, string> = {
  aDroit:
    'M16.42 19.72H7.51l-1.43 4.22H0L8.63.07h6.73l8.63 23.86h-6.15l-1.43-4.22Zm-1.5-4.49-2.96-8.74-2.92 8.74z',
  aIncline:
    'M19.72 7.58v8.91l4.22 1.43V24L.07 15.37V8.64L23.93 0v6.15l-4.22 1.43Zm-4.49 1.5-8.74 2.96 8.74 2.92z',
  chevron: 'M22.08 0 L1.92 12 L22.08 24',
  fleche: 'M3 12 H20 M13.5 5.5 L20 12 L13.5 18.5',
  triangle: 'M12 2.5 L21.5 20.5 L2.5 20.5 Z',
  cercle: 'M3 12 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 Z',
  carre: 'M3.5 3.5 H20.5 V20.5 H3.5 Z',
  losange: 'M12 2.5 L21.5 12 L12 21.5 L2.5 12 Z',
  croix: 'M4.5 4.5 L19.5 19.5 M19.5 4.5 L4.5 19.5',
  plus: 'M12 3 V21 M3 12 H21',
  ligne: 'M2 12 H22',
  point: 'M6 12 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 Z',
};

/** Formes fermees : un contour serait illisible a 10 px, on les remplit. */
const SOLID = new Set(['aDroit', 'aIncline']);

export const DEFAULT_GLYPH = 'aIncline';
export const FALLBACK_GLYPH = 'chevron';

export function isSolid(name: string): boolean {
  return SOLID.has(name);
}

/** Nom du preset correspondant a une source, s'il y en a un. */
export function presetName(source: string): string {
  return Object.keys(GLYPHS).find((key) => GLYPHS[key] === source) ?? '';
}
