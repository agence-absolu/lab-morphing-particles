import type { Glyph } from './types';

type ViewBox = [number, number, number, number];

const DEFAULT_BOX: ViewBox = [0, 0, 24, 24];
const SHAPES = 'path,circle,ellipse,rect,line,polyline,polygon';

const num = (el: Element, name: string): number =>
  parseFloat(el.getAttribute(name) ?? '0') || 0;

/** Un arc elliptique ferme, ecrit en deux demi-tours. */
const ellipse = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;

/** Traduit une primitive SVG en commandes de path. */
function shapeToPath(el: Element): string {
  switch (el.tagName.toLowerCase()) {
    case 'path':
      return el.getAttribute('d') ?? '';
    case 'circle':
      return num(el, 'r') > 0
        ? ellipse(num(el, 'cx'), num(el, 'cy'), num(el, 'r'), num(el, 'r'))
        : '';
    case 'ellipse':
      return num(el, 'rx') > 0 && num(el, 'ry') > 0
        ? ellipse(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry'))
        : '';
    case 'rect': {
      const w = num(el, 'width');
      const h = num(el, 'height');
      return w > 0 && h > 0 ? `M${num(el, 'x')} ${num(el, 'y')}h${w}v${h}h${-w}Z` : '';
    }
    case 'line':
      return `M${num(el, 'x1')} ${num(el, 'y1')}L${num(el, 'x2')} ${num(el, 'y2')}`;
    default: {
      const points = (el.getAttribute('points') ?? '').trim();
      if (!points) return '';
      return `M${points}${el.tagName.toLowerCase() === 'polygon' ? 'Z' : ''}`;
    }
  }
}

function readViewBox(svg: Element | null): ViewBox {
  const box = svg?.getAttribute('viewBox');
  if (!box) return DEFAULT_BOX;
  const n = box.trim().split(/[\s,]+/).map(Number);
  const usable = n.length === 4 && n.every(isFinite) && n[2] > 0 && n[3] > 0;
  return usable ? (n as ViewBox) : DEFAULT_BOX;
}

/** Aplatit un document SVG en une seule chaine de path. */
function documentToPath(doc: Document): string {
  return Array.from(doc.querySelectorAll(SHAPES)).map(shapeToPath).filter(Boolean).join(' ');
}

function parseSvg(raw: string): { d: string; box: ViewBox } | null {
  const wrapped = raw.includes('<svg')
    ? raw
    : `<svg xmlns="http://www.w3.org/2000/svg">${raw}</svg>`;
  const doc = new DOMParser().parseFromString(wrapped, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return null;
  return { d: documentToPath(doc), box: readViewBox(doc.querySelector('svg')) };
}

/**
 * Compile un `<svg>` colle ou un simple attribut `d` en motif dessinable.
 * Le resultat est centre sur sa viewBox et normalise a une taille unitaire,
 * pour qu'un motif quelconque tienne dans une cellule.
 */
export function parseGlyph(source: string): Glyph | null {
  const raw = source.trim();
  if (!raw) return null;

  const parsed = raw.includes('<') ? parseSvg(raw) : { d: raw, box: DEFAULT_BOX };
  if (!parsed || !parsed.d.trim()) return null;

  try {
    const [bx, by, bw, bh] = parsed.box;
    return {
      path: new Path2D(parsed.d),
      d: parsed.d,
      cx: bx + bw / 2,
      cy: by + bh / 2,
      size: Math.max(bw, bh),
    };
  } catch {
    return null;
  }
}
