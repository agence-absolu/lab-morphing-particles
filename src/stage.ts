import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/** Inertie du defilement : plus c'est haut, plus la page glisse longtemps. */
const LERP = 0.09;

/**
 * Reperes start / end de ScrollTrigger, sur la course du pin. Affiches en dev,
 * et a la demande ailleurs en ajoutant ?markers a l'URL.
 */
const MARKERS =
  import.meta.env.DEV || new URLSearchParams(window.location.search).has('markers');

/** Couleurs laissees a ScrollTrigger : on ne regle que la place et la taille. */
const MARKER_STYLE = {
  fontSize: '11px',
  fontWeight: '500',
  indent: 12,
};

/**
 * Un seul Lenis pour toute la page, quel que soit le nombre de scenes : deux
 * instances se disputeraient la molette. Le ticker de GSAP le fait avancer et
 * ScrollTrigger se recale a chaque defilement.
 */
let shared: Lenis | null = null;

export function sharedScroll(): Lenis {
  if (shared) return shared;
  shared = new Lenis({ lerp: LERP, autoRaf: false });
  shared.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => shared?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return shared;
}

export interface StageOptions {
  /** la section haute, qui donne sa course au morphing */
  track: HTMLElement;
  /** l'element maintenu a l'ecran pendant cette course */
  pin: HTMLElement;
  /** appelee a chaque image, avec la progression de 0 a 1 */
  onFrame(progress: number): void;
  /** appelee quand ScrollTrigger recalcule ses bornes : la mise en page a bouge */
  onRefresh?(): void;
}

/**
 * Une section epinglee et sa progression. ScrollTrigger maintient l'element a
 * l'ecran et convertit la course en avancement ; le dessin suit le meme
 * battement que le scroll, jamais un rAF concurrent.
 */
export class Stage {
  private trigger: ScrollTrigger | null = null;
  private tick: ((time: number) => void) | null = null;
  private progress = 0;

  constructor(private readonly options: StageOptions) {}

  start(): void {
    const { track, pin, onFrame, onRefresh } = this.options;
    sharedScroll();

    this.trigger = ScrollTrigger.create({
      trigger: track,
      pin,
      start: 'top top',
      end: 'bottom bottom',
      pinSpacing: false,
      markers: MARKERS && MARKER_STYLE,
      onRefresh: () => onRefresh?.(),
      onUpdate: (self) => {
        this.progress = self.progress;
      },
    });

    this.tick = () => onFrame(this.progress);
    gsap.ticker.add(this.tick);
  }

  /** A appeler quand la mise en page change : le pin recalcule ses bornes. */
  refresh(): void {
    ScrollTrigger.refresh();
  }

  stop(): void {
    if (this.tick) gsap.ticker.remove(this.tick);
    this.trigger?.kill();
    this.tick = null;
    this.trigger = null;
  }
}
