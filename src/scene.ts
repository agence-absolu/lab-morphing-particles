import { Painter, type Look } from './painter';
import { clipPhase, type Phase, type Span } from './playback';
import { segmentAt } from './scroll';
import { Stage } from './stage';
import type { Frames, Settings } from './types';

/** Ce que la scene vient chercher a chaque image : les donnees du morphing. */
export interface SceneSource {
  readonly frames: Frames | null;
  readonly spans: Span[];
  readonly settings: Settings;
  readonly look: Look | null;
}

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  /** la section qui donne sa course au morphing */
  track: HTMLElement;
  /** l'element maintenu a l'ecran pendant cette course */
  pin: HTMLElement;
  /**
   * Emplacements a rejoindre, un par etape : le motif glisse de l'un a
   * l'autre au rythme du morphing. Sans eux, il reste centre.
   */
  slots?: HTMLElement[];
  /**
   * Section d'attente en fin de course : elle prolonge l'epinglage sans
   * prolonger le morphing, qui doit etre acheve quand elle commence.
   */
  hold?: HTMLElement;
  /** appelee a chaque image, pour ce que la scene ne gere pas elle-meme */
  onFrame?(progress: number): void;
}

const CANVAS_SIZE = 760;

/**
 * Un canvas epingle sur sa section, qui joue le morphing au fil du scroll.
 * Plusieurs scenes partagent les memes keyframes : la pixelisation n'est
 * faite qu'une fois, quel que soit le nombre d'endroits qui l'affichent.
 */
export class Scene {
  private readonly painter = new Painter(CANVAS_SIZE);
  private stage: Stage | null = null;
  /** abscisse ou poser le motif pour chaque etape, en coordonnees d'ecran */
  private offsets: number[] = [];
  /** part de la course ou le morphing se joue ; le reste est de l'attente */
  private spent = 1;
  /** clip en pleine vue, et depuis quand */
  private rest = { clip: -1, since: 0 };

  constructor(
    private readonly options: SceneOptions,
    private readonly source: SceneSource,
  ) {}

  mount(): void {
    const { canvas, track, pin, onFrame } = this.options;
    this.painter.attach(canvas);

    this.stage = new Stage({
      track,
      pin,
      // les emplacements se mesurent une fois la mise en page posee
      onRefresh: () => this.measure(),
      onFrame: (progress) => {
        onFrame?.(progress);
        this.paint(progress);
      },
    });
    this.stage.start();
  }

  /** A appeler quand la mise en page a change. */
  resize(): void {
    this.painter.attach(this.options.canvas);
    this.stage?.refresh();
  }

  refresh(): void {
    this.stage?.refresh();
  }

  destroy(): void {
    this.stage?.stop();
    this.stage = null;
  }

  /**
   * Abscisse a donner au motif pour qu'il tombe au centre de chaque
   * emplacement. Le pin part du bord gauche de l'ecran : ces valeurs restent
   * valables qu'il soit epingle ou non.
   */
  private measure(): void {
    const course = this.options.track.offsetHeight - window.innerHeight;
    const hold = this.options.hold?.offsetHeight ?? 0;
    this.spent = course > 0 ? Math.max(0.05, (course - hold) / course) : 1;

    const half = this.options.canvas.getBoundingClientRect().width / 2;
    this.offsets = (this.options.slots ?? []).map((slot) => {
      const box = slot.getBoundingClientRect();
      return box.left + box.width / 2 - half;
    });
  }

  private paint(raw: number): void {
    const { frames, spans, settings, look } = this.source;
    if (!frames || !look || !this.painter.ready) return;

    // le morphing est acheve avant la fin de la course : l'attente ne compte pas
    const progress = Math.min(1, raw / this.spent);
    const segment = segmentAt(progress, spans.length, settings.hold);
    const phase = this.phaseAt(segment.index, segment.t, spans);
    this.place(segment.index, segment.t);
    this.painter.paint(frames, phase, look, settings);
  }

  /** Glisse le motif vers l'emplacement de la section suivante. */
  private place(index: number, t: number): void {
    if (!this.offsets.length) return;
    const from = this.offsets[index] ?? 0;
    const to = this.offsets[index + 1] ?? from;
    const x = from + (to - from) * ease(t);
    this.options.canvas.style.transform = `translateX(${x.toFixed(1)}px)`;
  }

  /**
   * En transition, on melange les images de repos des deux signes. Une fois le
   * signe en pleine vue, son clip prend le relais et joue sa propre animation.
   */
  private phaseAt(index: number, t: number, spans: Span[]): Phase {
    const resting = t <= 0 ? index : t >= 1 ? index + 1 : -1;

    if (resting < 0 || !spans[resting]) {
      this.rest.clip = -1;
      const from = spans[index]?.start ?? 0;
      return { from, to: spans[index + 1]?.start ?? from, t };
    }

    if (this.rest.clip !== resting) {
      this.rest = { clip: resting, since: performance.now() };
    }
    return clipPhase(spans[resting], performance.now() - this.rest.since);
  }
}

const ease = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
