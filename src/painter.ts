import type { Phase } from './playback';
import { BLUE_LEVEL, bucketOf, buildRampCache } from './ramp';
import type { Frames, Glyph, Settings } from './types';

export interface Look {
  glyph: Glyph;
  filled: boolean;
}

/** Ou poser la grille dans le canvas, en pixels CSS : origine et echelle. */
export interface View {
  scale: number;
  ox: number;
  oy: number;
}

/** La fermeture en cours : le motif scelle, son avancement, et le cadrage. */
export interface Sealing {
  /** de 0 (le motif) a 1 (la cellule pleine) */
  t: number;
  path: Path2D;
  view: View;
}

const MAX_DPR = 2;
/** Sans fermeture, la grille se dessine telle quelle dans le canvas. */
const PLAIN: View = { scale: 1, ox: 0, oy: 0 };
/** Part de la fermeture ou un contour cede la place au remplissage. */
const FILL_FADE = 0.3;
/**
 * Debord des carres fermes, en pixels d'ecran. Une fraction de cellule serait
 * sous-pixel tant que la grille est petite : l'antialiasing laisserait alors
 * une couture claire entre deux voisines, et l'aplat se verrait quadrille.
 */
const BLEED = 1.5;

/** Dessine une frame du morphing sur le canvas. */
export class Painter {
  private ctx: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private readonly ramp = buildRampCache();

  constructor(private readonly size: number) {}

  /**
   * Ajuste la resolution du canvas a l'ecran. Sans dimensions, le canvas tient
   * la grille entiere ; la fermeture lui en donne d'autres, pour couvrir
   * l'ecran sans jamais mettre a l'echelle ce qui a deja ete peint.
   */
  attach(canvas: HTMLCanvasElement | null, width = this.size, height = this.size): void {
    if (!canvas) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.w = width;
    this.h = height;
    canvas.width = Math.round(width * this.dpr);
    canvas.height = Math.round(height * this.dpr);
    this.ctx = canvas.getContext('2d');
    this.reset();
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  private reset(): void {
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /**
   * Une passe complete entre deux etapes quelconques : deux signes qui se
   * transforment, ou deux frames d'un clip anime. Le style n'est reassigne
   * que lorsque la densite change de palier, et chaque particule ne coute
   * qu'une seule matrice.
   *
   * En fermeture, tout ce qui distinguait les particules s'efface : chacune
   * rejoint la taille de sa cellule, l'opacite pleine et le bleu du fond,
   * pendant que le motif deborde de sa case. La grille devient un aplat.
   */
  paint(f: Frames, phase: Phase, look: Look, s: Settings, seal?: Sealing): void {
    const ctx = this.ctx;
    if (!ctx || !f.count) return;

    this.reset();
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const view = seal?.view ?? PLAIN;
    const shut = seal?.t ?? 0;
    const path = seal ? seal.path : look.glyph.path;
    // un contour ne peut pas fermer une cellule : il passe au plein des le depart
    const fill = look.filled ? 1 : Math.min(1, shut / FILL_FADE);
    // cote d'une cellule pleine, dans l'echelle du motif, et ce qu'il faut y
    // ajouter pour que deux voisines se recouvrent franchement
    const unit = (s.px * view.scale) / look.glyph.size;
    const bleed = (BLEED * shut) / look.glyph.size;
    const margin = s.px * view.scale;

    const from = phase.from * f.count;
    const to = phase.to * f.count;
    const held = phase.t;
    let bucket = -1;

    for (let i = 0; i < f.count; i++) {
      const t = travel(held, s.stagger, f.drift[i]);
      const e = easeInOut(t);
      const bow = Math.sin(Math.PI * t);
      const v = lerp(f.v[from + i], f.v[to + i], e);

      const ax = f.x[from + i];
      const ay = f.y[from + i];
      const vx = f.x[to + i] - ax;
      const vy = f.y[to + i] - ay;
      const len = Math.hypot(vx, vy) || 1;
      const off = arcOffset(bow, s.arc, len, f.jitter[i]);
      const x = view.ox + view.scale * (ax + vx * e - (vy / len) * off);
      const y = view.oy + view.scale * (ay + vy * e + (vx / len) * off);
      // en fin de croissance, l'essentiel de la grille est hors de l'ecran
      if (x < -margin || y < -margin || x > this.w + margin || y > this.h + margin) continue;

      const next = bucketOf(lerp(v, BLUE_LEVEL, shut));
      if (next !== bucket) {
        bucket = next;
        if (fill > 0) ctx.fillStyle = this.ramp[next];
        if (fill < 1) ctx.strokeStyle = this.ramp[next];
      }

      this.stamp(
        ctx,
        path,
        look.glyph,
        x,
        y,
        unit * lerp((0.5 + 0.62 * v) * (1 - 0.22 * bow), 1, shut) + bleed,
        Math.max(1, s.px * (0.1 + 0.2 * v)) * view.scale,
        lerp((0.3 + 0.7 * v) * (1 - 0.35 * bow), 1, shut),
        fill,
      );
    }

    this.reset();
    ctx.globalAlpha = 1;
  }

  /** Pose le motif a l'echelle voulue : une matrice, un trace. */
  private stamp(
    ctx: CanvasRenderingContext2D,
    path: Path2D,
    glyph: Glyph,
    x: number,
    y: number,
    scale: number,
    lineWidth: number,
    alpha: number,
    fill: number,
  ): void {
    const m = this.dpr * scale;
    ctx.setTransform(m, 0, 0, m, this.dpr * x - m * glyph.cx, this.dpr * y - m * glyph.cy);
    if (fill > 0) {
      ctx.globalAlpha = alpha * fill;
      ctx.fill(path);
    }
    if (fill < 1) {
      ctx.globalAlpha = alpha * (1 - fill);
      ctx.lineWidth = lineWidth / scale;
      ctx.stroke(path);
    }
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Depart et arrivee freines, milieu rapide. */
const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Avancement d'une particule : les plus a droite partent en dernier. */
const travel = (held: number, stagger: number, drift: number) =>
  Math.max(0, Math.min(1, (held - stagger * drift) / (1 - stagger)));

/** Ecart perpendiculaire a la trajectoire, nul au depart et a l'arrivee. */
const arcOffset = (bow: number, arc: number, len: number, jitter: number) =>
  bow * arc * len * (0.3 + jitter * 0.7) * (jitter > 0.5 ? 1 : -1);
