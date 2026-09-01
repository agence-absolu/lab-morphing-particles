import { all, need } from './dom';
import { inkBounds, union, withMargin } from './framing';
import { parseGlyph } from './glyph';
import { buildFrames } from './keyframes';
import { assignByProximity, spread } from './matching';
import { loadClip, type Frame } from './media';
import type { Look } from './painter';
import { Panel } from './panel';
import type { Span } from './playback';
import { FALLBACK_GLYPH, GLYPHS } from './presets';
import { sampleImage, sortByAngle } from './sampler';
import { Scene } from './scene';
import { activeStage } from './scroll';
import { studyCloud, studySeal, type Cloud, type Seal } from './seal';
import type { Cell, Crop, Frames, Glyph, Settings } from './types';

const CANVAS_SIZE = 760;
// servies telles quelles depuis public/
const SOURCES = [
  '/uploads/blink-eye.gif',
  '/uploads/roue.png',
  '/uploads/flag.png',
  '/uploads/logo.png',
];

/** Polices chargees et styles appliques : les mesures deviennent fiables. */
const layoutReady = (): Promise<unknown> =>
  document.fonts ? document.fonts.ready : Promise.resolve();

/** Reglages fixes : les autres vivent dans le panneau. */
const ARC = 0.14;
const HOLD = 0.18;
const FLOOR = 0.1;

/**
 * Trois signes pixelises dans une meme grille, que le defilement fait passer
 * de l'un a l'autre. Cette classe ne fait qu'orchestrer : l'echantillonnage,
 * l'assemblage des keyframes et le dessin vivent dans leurs propres modules.
 */
export class Morph {
  private readonly bar = need('bar');
  private readonly legend = all('.legend [data-stage]');

  /** la mise en situation, puis le banc d'essai */
  private readonly scenes = [
    new Scene(
      {
        canvas: need<HTMLCanvasElement>('showcase-canvas'),
        track: need('showcase'),
        pin: need('showcase-pin'),
        slots: all('#showcase [data-slot]'),
        hold: need('showcase').querySelector<HTMLElement>('.hold') ?? undefined,
        flood: need('blue'),
      },
      this,
    ),
    new Scene(
      {
        canvas: need<HTMLCanvasElement>('canvas'),
        track: need('track'),
        pin: need('pin'),
        onFrame: (progress) => this.paintLegend(progress),
      },
      this,
    ),
  ];

  private readonly panel = new Panel({
    onGrid: () => this.rebuild(),
    onGlyph: () => this.refreshGlyph(),
    onLook: () => this.describe(),
  });

  /** un clip par signe : une frame pour une image fixe, plusieurs pour un GIF */
  clips: Frame[][] = [];
  /** ou vivent les frames de chaque clip dans le tableau des etapes */
  spans: Span[] = [];
  frames: Frames | null = null;
  /** le motif etudie pour la fermeture, et la matiere du signe final */
  seal: Seal | null = null;
  cloud: Cloud | null = null;
  private glyph: Glyph | null = null;
  private glyphError = '';
  private readonly onResize = () => this.scenes.forEach((scene) => scene.resize());

  // ---------------------------------------------------------------- reglages

  get settings(): Settings {
    const cols = Math.max(4, Math.round(this.panel.params.cols));
    return {
      cols,
      px: CANVAS_SIZE / cols,
      stagger: this.panel.params.stagger,
      arc: ARC,
      hold: HOLD,
      floor: FLOOR,
    };
  }

  /** Source du motif : le SVG colle s'il y en a un, sinon le preset choisi. */
  get glyphSource(): string {
    const { svg, glyph } = this.panel.params;
    return svg.trim() || GLYPHS[glyph] || GLYPHS[FALLBACK_GLYPH];
  }

  get filled(): boolean {
    return this.panel.params.filled;
  }

  /** Ce que les scenes dessinent : le motif compile et son mode de trace. */
  get look(): Look | null {
    return this.glyph ? { glyph: this.glyph, filled: this.filled } : null;
  }

  // ------------------------------------------------------------ cycle de vie

  mount(): void {
    this.refreshGlyph();
    this.describe();
    window.addEventListener('resize', this.onResize);

    // les scenes epinglent des elements dont la taille depend de la mise en
    // page : on attend qu'elle soit posee, polices comprises
    void layoutReady().then(() => {
      this.scenes.forEach((scene) => scene.mount());
    });

    void this.loadClips().then(() => {
      this.rebuild();
      this.scenes.forEach((scene) => scene.refresh());
    });
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.panel.dispose();
    this.scenes.forEach((scene) => scene.destroy());
  }

  // -------------------------------------------------------------- traitement

  private loadClips(): Promise<void> {
    return Promise.all(SOURCES.map(loadClip)).then((clips) => {
      this.clips = clips.filter((frames) => frames.length > 0);
    });
  }

  /** Re-echantillonne toutes les frames puis reassemble les keyframes. */
  private rebuild(): void {
    if (!this.clips.length) return;
    const settings = this.settings;

    // 1. cadrer chaque clip, puis pixeliser ses frames, ordonnees par angle
    const clouds = this.clips.map((frames) => {
      const crop = this.frameClip(frames, settings.floor);
      return frames.map((frame) =>
        sortByAngle(sampleImage(frame.image, CANVAS_SIZE, settings, crop)),
      );
    });
    const count = clouds.flat().reduce((max, cells) => Math.max(max, cells.length), 0);
    if (!count) return;

    // 2. assigner les particules : angle d'un signe a l'autre, proximite au sein d'un clip
    const stages: Cell[][] = [];
    this.spans = clouds.map((frames, clip) => {
      const start = stages.length;
      frames.forEach((cells, i) => {
        const previous = stages[stages.length - 1];
        stages.push(
          i === 0 ? spread(cells, count) : assignByProximity(previous, cells, settings.cols),
        );
      });
      return { start, durations: this.clips[clip].map((f) => f.ms) };
    });

    this.frames = buildFrames(stages, CANVAS_SIZE);
    // la fermeture part du dernier signe pose : c'est sa matiere qui grossit
    const last = clouds[clouds.length - 1]?.[0];
    this.cloud = last ? studyCloud(last, settings.cols, settings.px) : null;
    this.describe();
  }

  /**
   * Cadre un clip au plus pres de son sujet. La boite couvre toutes ses frames :
   * un clip anime garde ainsi une echelle fixe d'une frame a l'autre.
   */
  private frameClip(frames: Frame[], floor: number): Crop | null {
    const box = union(frames.map((frame) => inkBounds(frame.image, floor)));
    return box ? withMargin(box, frames[0].image) : null;
  }

  private refreshGlyph(): void {
    const parsed = parseGlyph(this.glyphSource);
    this.glyphError = parsed ? '' : 'SVG illisible → chevron';
    this.glyph = parsed ?? parseGlyph(GLYPHS[FALLBACK_GLYPH]);
    this.seal = this.glyph ? studySeal(this.glyph) : null;
    this.describe();
  }

  /** Renvoie au panneau ce que le morphing a produit. */
  private describe(): void {
    const { cols, px } = this.settings;
    const points = this.frames?.count ?? 0;
    this.panel.show(
      `${cols}×${cols} · ${px.toFixed(2)} px${points ? ` · ${points} pts` : ''}`,
      this.glyphError || `viewBox ${this.glyph?.size ?? 0}`,
    );
  }

  // ------------------------------------------------------------------ boucle

  private paintLegend(progress: number): void {
    this.bar.style.width = `${(progress * 100).toFixed(1)}%`;
    const active = activeStage(progress, this.legend.length);
    this.legend.forEach((el, i) => el.toggleAttribute('data-active', i === active));
  }

}
