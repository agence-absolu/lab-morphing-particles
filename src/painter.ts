import type { Phase } from './playback';
import { bucketOf, buildRampCache } from './ramp';
import type { Frames, Glyph, Settings } from './types';

export interface Look {
  glyph: Glyph;
  filled: boolean;
}

const MAX_DPR = 2;

/** Dessine une frame du morphing sur le canvas. */
export class Painter {
  private ctx: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private readonly ramp = buildRampCache();

  constructor(private readonly size: number) {}

  /** Ajuste la resolution du canvas a l'ecran. */
  attach(canvas: HTMLCanvasElement | null): void {
    if (!canvas) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = this.size * this.dpr;
    canvas.height = this.size * this.dpr;
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
   */
  paint(f: Frames, phase: Phase, look: Look, s: Settings): void {
    const ctx = this.ctx;
    if (!ctx || !f.count) return;

    this.reset();
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const from = phase.from * f.count;
    const to = phase.to * f.count;
    const held = phase.t;
    let bucket = -1;

    for (let i = 0; i < f.count; i++) {
      const t = travel(held, s.stagger, f.drift[i]);
      const e = easeInOut(t);
      const bow = Math.sin(Math.PI * t);
      const v = lerp(f.v[from + i], f.v[to + i], e);

      const next = bucketOf(v);
      if (next !== bucket) {
        bucket = next;
        if (look.filled) ctx.fillStyle = this.ramp[next];
        else ctx.strokeStyle = this.ramp[next];
      }
      ctx.globalAlpha = (0.3 + 0.7 * v) * (1 - 0.35 * bow);

      const ax = f.x[from + i];
      const ay = f.y[from + i];
      const vx = f.x[to + i] - ax;
      const vy = f.y[to + i] - ay;
      const len = Math.hypot(vx, vy) || 1;
      const off = arcOffset(bow, s.arc, len, f.jitter[i]);

      this.stamp(
        ctx,
        look,
        ax + vx * e - (vy / len) * off,
        ay + vy * e + (vx / len) * off,
        (s.px * (0.5 + 0.62 * v) * (1 - 0.22 * bow)) / look.glyph.size,
        Math.max(1, s.px * (0.1 + 0.2 * v)),
      );
    }

    this.reset();
    ctx.globalAlpha = 1;
  }

  /** Pose le motif a l'echelle voulue : une matrice, un trace. */
  private stamp(
    ctx: CanvasRenderingContext2D,
    look: Look,
    x: number,
    y: number,
    scale: number,
    lineWidth: number,
  ): void {
    const { glyph } = look;
    const m = this.dpr * scale;
    ctx.setTransform(
      m,
      0,
      0,
      m,
      this.dpr * (x - scale * glyph.cx),
      this.dpr * (y - scale * glyph.cy),
    );
    if (look.filled) {
      ctx.fill(glyph.path);
      return;
    }
    ctx.lineWidth = lineWidth / scale;
    ctx.stroke(glyph.path);
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
