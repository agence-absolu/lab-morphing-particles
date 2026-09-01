import { Painter, type Look, type Sealing } from './painter';
import { clipPhase, type Phase, type Span } from './playback';
import { segmentAt } from './scroll';
import { sealedPath, type Cloud, type Seal } from './seal';
import { Stage } from './stage';
import type { Frames, Settings } from './types';

/** Ce que la scene vient chercher a chaque image : les donnees du morphing. */
export interface SceneSource {
  readonly frames: Frames | null;
  readonly spans: Span[];
  readonly settings: Settings;
  readonly look: Look | null;
  /** le motif etudie pour la fermeture */
  readonly seal: Seal | null;
  /** la matiere du signe final : ou zoomer, et jusqu'ou elle est pleine */
  readonly cloud: Cloud | null;
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
  /**
   * La section que le signe finit par remplir. Le canvas la rejoint pendant
   * l'attente, en plein ecran, et lui laisse la place une fois l'aplat obtenu.
   */
  flood?: HTMLElement;
  /** appelee a chaque image, pour ce que la scene ne gere pas elle-meme */
  onFrame?(progress: number): void;
}

const CANVAS_SIZE = 760;
/** Part de l'attente ou les motifs se ferment en carres pleins. */
const SEAL_SPAN = 0.35;
/**
 * Part de la fermeture au terme de laquelle la cellule est pleine. Entre le
 * motif et l'aplat, les cellules se touchent sans se recouvrir : le maillage
 * clair qui en resulte ne doit pas s'attarder sous les yeux.
 */
const CLOSED = 0.85;
/** Un peu plus que le strict necessaire, pour ne jamais voir un bord. */
const MARGIN = 1.06;
/**
 * Part de l'attente au terme de laquelle la matiere deborde de l'ecran. Le
 * reste de la course laisse l'aplat s'installer avant que la section bleue
 * n'arrive : sans cette marge, un coin de page reste blanc jusqu'au bout.
 */
const FILLED = 0.9;
/** Part de la croissance au-dela de laquelle l'ecran est couvert. */
const COVERED = 0.98;

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
  /** le canvas est passe en plein ecran pour la fermeture */
  private sealed = false;
  /** l'ecran est couvert : l'aplat du canvas suffit, plus rien a peindre */
  private covered = false;
  /** la section bleue est passee : l'aplat n'a plus rien a couvrir */
  private gone = false;
  /** ou le canvas se tient au repos, en pixels d'ecran */
  private home = { scale: 1, ox: 0, oy: 0 };

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
    this.fit();
    this.stage?.refresh();
  }

  refresh(): void {
    this.stage?.refresh();
  }

  destroy(): void {
    this.unseal();
    this.stage?.stop();
    this.stage = null;
  }

  /**
   * Abscisse a donner au motif pour qu'il tombe au centre de chaque
   * emplacement. Le pin part du bord gauche de l'ecran : ces valeurs restent
   * valables qu'il soit epingle ou non.
   */
  private measure(): void {
    // le canvas doit etre chez lui, a sa taille, pour se laisser mesurer
    const sealed = this.sealed;
    if (sealed) this.unseal();

    const course = this.options.track.offsetHeight - window.innerHeight;
    const hold = this.options.hold?.offsetHeight ?? 0;
    this.spent = course > 0 ? Math.max(0.05, (course - hold) / course) : 1;

    const side = this.options.canvas.getBoundingClientRect().width;
    this.offsets = (this.options.slots ?? []).map((slot) => {
      const box = slot.getBoundingClientRect();
      return box.left + box.width / 2 - side / 2;
    });
    this.home = {
      scale: side / CANVAS_SIZE,
      ox: this.offsets[this.offsets.length - 1] ?? 0,
      oy: (window.innerHeight - side) / 2,
    };

    if (sealed) this.seal();
  }

  private paint(raw: number): void {
    const { frames, spans, settings, look } = this.source;
    if (!frames || !look || !this.painter.ready) return;

    const seal = this.close(raw);
    // plus rien a peindre : la section porte desormais la couleur elle-meme
    if (this.covered) return;

    // le morphing est acheve avant la fin de la course : l'attente ne compte pas
    const progress = Math.min(1, raw / this.spent);
    const segment = segmentAt(progress, spans.length, settings.hold);
    const phase = this.phaseAt(segment.index, segment.t, spans);
    if (!this.sealed) this.place(segment.index, segment.t);
    this.painter.paint(frames, phase, look, settings, seal);
  }

  /**
   * L'attente, une fois le morphing acheve : les motifs se ferment en carres
   * pleins pendant que la grille se dilate autour du point le plus profond du
   * signe. Rien n'est mis a l'echelle, tout est repeint — l'aplat qui finit
   * par couvrir l'ecran est net, et la section prend alors le relais.
   */
  private close(raw: number): Sealing | undefined {
    const { seal, cloud } = this.source;
    const wait = this.spent < 1 ? (raw - this.spent) / (1 - this.spent) : 0;
    if (!this.options.flood || !seal || !cloud || wait <= 0) {
      this.unseal();
      return undefined;
    }
    this.seal();

    // la fermeture part doucement, puis se referme d'un coup
    const closing = Math.min(1, wait / SEAL_SPAN);
    const shut = Math.min(1, (closing * closing) / CLOSED);
    // la croissance accompagne la fermeture des le premier instant ; son
    // profil carre la rend imperceptible au depart, franche a l'arrivee
    const grow = Math.min(1, wait / FILLED);
    const full = this.covering(cloud);
    const scale = this.home.scale * (1 + (full - 1) * grow * grow);

    // le cadrage derive du signe vers le pole, acquis bien avant la couverture
    const blend = Math.min(1, grow * 2);
    const x = lerp(this.home.ox + this.home.scale * cloud.pole.x, window.innerWidth / 2, blend);
    const y = lerp(this.home.oy + this.home.scale * cloud.pole.y, window.innerHeight / 2, blend);

    this.cover(scale >= this.home.scale * full * COVERED);
    this.dismiss(this.covered && this.passed());
    return {
      t: shut,
      path: sealedPath(seal, shut),
      view: { scale, ox: x - scale * cloud.pole.x, oy: y - scale * cloud.pole.y },
    };
  }

  /** Grossissement a partir duquel la matiere pleine deborde de l'ecran. */
  private covering(cloud: Cloud): number {
    const need = (Math.max(window.innerWidth, window.innerHeight) / 2) * MARGIN;
    return Math.max(1, need / (cloud.reach * this.home.scale));
  }

  /**
   * Passe le canvas en plein ecran, dans la section qu'il va remplir. La vue
   * repart de l'emplacement exact qu'il occupait : le changement de cadre ne
   * se voit pas.
   */
  private seal(): void {
    const { canvas, flood } = this.options;
    if (this.sealed || !flood) return;
    this.sealed = true;
    canvas.classList.add('is-sealing');
    canvas.style.transform = '';
    flood.prepend(canvas);
    this.fit();
  }

  private unseal(): void {
    if (!this.sealed) return;
    this.sealed = false;
    this.cover(false);
    this.dismiss(false);
    this.options.canvas.classList.remove('is-sealing');
    this.options.pin.append(this.options.canvas);
    this.fit();
  }

  /** Rend au canvas la resolution de la place qu'il occupe. */
  private fit(): void {
    const { canvas } = this.options;
    if (this.sealed) this.painter.attach(canvas, window.innerWidth, window.innerHeight);
    else this.painter.attach(canvas);
  }

  private cover(on: boolean): void {
    if (on === this.covered) return;
    this.covered = on;
    this.options.canvas.classList.toggle('is-flat', on);
  }

  /** L'aplat a fini son office : la section qu'il couvrait est remontee. */
  private passed(): boolean {
    const flood = this.options.flood;
    return !!flood && flood.getBoundingClientRect().bottom <= 0;
  }

  private dismiss(gone: boolean): void {
    if (gone === this.gone) return;
    this.gone = gone;
    this.options.canvas.classList.toggle('is-past', gone);
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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const ease = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
