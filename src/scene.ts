import { motifScale, Painter, type Look, type Sealing } from './painter';
import { clipPhase, type Phase, type Span } from './playback';
import { segmentAt } from './scroll';
import { sealedPath, type Cloud, type Focus, type Seal } from './seal';
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

/** Ou en est la fin de course, pour qui veut l'afficher. */
export interface Closing {
  /** avancement de la fin, de 0 a 1 */
  wait: number;
  /** grossissement depuis le repos */
  zoom: number;
  covered: boolean;
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
  /** appelee a chaque image, avec l'avancement de la fin de course */
  onClose?(state: Closing): void;
}

const CANVAS_SIZE = 760;
/**
 * A quel point de sa formation le dernier signe voit la fin s'amorcer : le
 * zoom part avant qu'il ne soit tout a fait pose.
 */
const EARLY = 0.9;
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
 * La matiere d'un seul motif n'a pas la reserve d'un signe entier : autour de
 * son pole, elle s'arrete net. Une plongee vise donc bien au-dela du strict
 * necessaire — en echelle geometrique, le dernier dixieme de course vaut la
 * moitie du chemin, et sans cette avance un bord resterait blanc jusqu'au bout.
 */
const DIVE_MARGIN = 2.5;
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
  /** a quelle echelle et a quelle hauteur le canvas se tient au repos */
  private home = { scale: 1, oy: 0 };

  constructor(
    private readonly options: SceneOptions,
    private readonly source: SceneSource,
  ) {}

  mount(): void {
    const { canvas, track, pin, onFrame } = this.options;
    // une section masquee n'a pas de course : il n'y a rien a y jouer
    if (!track.offsetHeight) return;
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
    this.home = { scale: side / CANVAS_SIZE, oy: (window.innerHeight - side) / 2 };

    if (sealed) this.seal();
  }

  private paint(raw: number): void {
    const { frames, spans, settings, look } = this.source;
    if (!frames || !look || !this.painter.ready) return;

    // le morphing est acheve avant la fin de la course : l'attente ne compte pas
    const progress = Math.min(1, raw / this.spent);
    const segment = segmentAt(progress, spans.length, settings.hold);
    const drift = this.slotAt(segment.index, segment.t);

    const seal = this.close(raw, look, drift);
    // plus rien a peindre : la section porte desormais la couleur elle-meme
    if (this.covered) return;

    const phase = this.phaseAt(segment.index, segment.t, spans);
    if (!this.sealed) this.place(drift);
    this.painter.paint(frames, phase, look, settings, seal);
  }

  /**
   * L'attente, une fois le morphing acheve : les motifs se ferment en carres
   * pleins pendant que la grille se dilate autour du point le plus profond du
   * signe. Rien n'est mis a l'echelle, tout est repeint — l'aplat qui finit
   * par couvrir l'ecran est net, et la section prend alors le relais.
   */
  private close(raw: number, look: Look, drift: number): Sealing | undefined {
    const { seal, cloud, settings, spans } = this.source;
    const start = this.opening(spans.length, settings.hold);
    const wait = start < 1 ? (raw - start) / (1 - start) : 0;
    if (!this.options.flood || !seal || !cloud || wait <= 0) {
      this.unseal();
      this.options.onClose?.({ wait: 0, zoom: 1, covered: false });
      return undefined;
    }
    this.seal();

    // deux facons d'en finir : fermer chaque cellule, ou entrer dans une seule
    const dive = settings.ending === 'dive' ? this.plunge(seal, cloud, look) : null;
    const focus = dive ?? cloud;

    // la fermeture part doucement, puis se referme d'un coup
    const closing = Math.min(1, wait / SEAL_SPAN);
    const shut = dive ? 0 : Math.min(1, (closing * closing) / CLOSED);
    // la croissance accompagne la fin des le premier instant ; entrer dans un
    // motif demande plusieurs centaines de fois, ce qui ne se percoit qu'en
    // echelle geometrique, la ou une dizaine doit partir sans bruit
    const grow = Math.min(1, wait / FILLED);
    const full = this.covering(focus) * (dive ? DIVE_MARGIN : 1);
    const scale = this.home.scale * (dive ? full ** grow : 1 + (full - 1) * grow * grow);

    // le cadrage derive du signe vers le pole, acquis bien avant la couverture
    const blend = Math.min(1, grow * 2);
    const x = lerp(drift + this.home.scale * focus.pole.x, window.innerWidth / 2, blend);
    const y = lerp(this.home.oy + this.home.scale * focus.pole.y, window.innerHeight / 2, blend);

    this.cover(scale >= this.home.scale * full * COVERED);
    this.dismiss(this.covered && this.relayed());
    this.options.onClose?.({ wait, zoom: scale / this.home.scale, covered: this.covered });
    return {
      t: shut,
      tint: dive ? grow : shut,
      path: dive ? look.glyph.path : sealedPath(seal, shut),
      view: { scale, ox: x - scale * focus.pole.x, oy: y - scale * focus.pole.y },
    };
  }

  /**
   * Ou la fin s'amorce, sur la course entiere. Dans un segment, la
   * transformation ne se joue qu'entre les deux paliers : c'est de sa part
   * accomplie que EARLY parle, non de la course qu'elle occupe.
   */
  private opening(spans: number, hold: number): number {
    const segments = Math.max(1, spans - 1);
    const local = hold + EARLY * (1 - hold * 2);
    return this.spent * ((segments - 1 + local) / segments);
  }

  /**
   * Le foyer d'une plongee : le pole du motif que porte la cellule la plus
   * profonde du signe. Rien ne s'y ferme — la vue entre dans une particule
   * jusqu'a ce que sa seule matiere soit tout l'ecran.
   */
  private plunge(seal: Seal, cloud: Cloud, look: Look): Focus | null {
    const scale = (this.source.settings.px * motifScale(cloud.v)) / look.glyph.size;
    const reach = seal.reach * scale;
    if (!(reach > 0)) return null;
    return {
      pole: {
        x: cloud.pole.x + (seal.pole.x - look.glyph.cx) * scale,
        y: cloud.pole.y + (seal.pole.y - look.glyph.cy) * scale,
      },
      reach,
    };
  }

  /** Grossissement a partir duquel la matiere pleine deborde de l'ecran. */
  private covering(focus: Focus): number {
    const need = (Math.max(window.innerWidth, window.innerHeight) / 2) * MARGIN;
    return Math.max(1, need / (focus.reach * this.home.scale));
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

  /** L'ecran est couvert : le canvas et la section portent le meme aplat. */
  private cover(on: boolean): void {
    if (on === this.covered) return;
    this.covered = on;
    this.options.canvas.classList.toggle('is-flat', on);
    this.options.flood?.classList.toggle('is-flat', on);
  }

  /**
   * La section a depasse le haut de l'ecran : son fond couvre desormais tout ce
   * qui n'est pas ce qui la suit, et le canvas doit s'effacer — sans quoi il
   * resterait en travers du pied de page.
   */
  private relayed(): boolean {
    const box = this.options.flood?.getBoundingClientRect();
    return !!box && box.top <= 0;
  }

  private dismiss(gone: boolean): void {
    if (gone === this.gone) return;
    this.gone = gone;
    this.options.canvas.classList.toggle('is-past', gone);
  }

  /** Abscisse du motif : il glisse d'un emplacement au suivant. */
  private slotAt(index: number, t: number): number {
    if (!this.offsets.length) return 0;
    const from = this.offsets[index] ?? 0;
    const to = this.offsets[index + 1] ?? from;
    return from + (to - from) * ease(t);
  }

  private place(x: number): void {
    if (!this.offsets.length) return;
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
