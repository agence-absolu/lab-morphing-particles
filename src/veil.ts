import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { GLYPHS } from './presets';

const VIEWBOX = 24;
/**
 * Ou zoomer dans le A sans jamais decouvrir sa contre-forme : le sommet, seul
 * endroit d'ou l'ecran entier tient dans la matiere. Mesure sur le trace.
 */
const PIVOT = { x: 0.5, y: 0.167 };
/** Part de la course consacree au relais particules → trace. */
const RELAY = 0.28;
/**
 * Part du canvas qu'occupe le signe en particules : le cadrage laisse 3 % de
 * marge, mais chaque cellule porte un motif qui deborde d'une demi-case.
 */
const INSET = 0.96;
/** Un peu plus que le strict necessaire, pour ne jamais voir un bord. */
const MARGIN = 1.06;
/** Part de la croissance au-dela de laquelle l'ecran est couvert. */
const COVERED = 0.94;
/** Grille de controle : l'ecran entier doit tomber dans la matiere. */
const PROBES = [-1, -0.5, 0, 0.5, 1];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface VeilOptions {
  /** le voile plein ecran, derriere le contenu */
  veil: HTMLElement;
  /** le motif en particules, auquel le trace se substitue */
  particles: HTMLElement;
  /** la section dont l'entree a l'ecran declenche le relais */
  trigger: HTMLElement;
  /** la zone qui reste bleue */
  zone: HTMLElement;
}

/**
 * Le signe passe des particules au trace, puis grossit jusqu'a devenir le fond
 * de toute la suite. Le trace prend la place exacte du motif avant de bouger :
 * un relais, pas une apparition. Une fois l'ecran couvert, il disparait et la
 * couleur prend le relais — plus rien a peindre.
 */
export class Veil {
  private readonly shape: SVGSVGElement;
  private covered = false;
  /** cote de viewBox au depart : le trace couvre alors le motif */
  private seed = VIEWBOX;
  /** grossissement a partir duquel l'ecran est entierement couvert */
  private full = 100;

  constructor(private readonly options: VeilOptions) {
    this.shape = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    // le cadre couvre l'ecran et c'est la viewBox qui zoome : le trace reste
    // vectoriel a chaque image, la ou un scale l'aurait rasterise une fois
    this.shape.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    this.shape.classList.add('veil-shape');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', GLYPHS.aDroit);
    this.shape.append(path);
    options.veil.append(this.shape);
    this.layout();
  }

  mount(): void {
    const { trigger, zone } = this.options;

    // le relais part quand le signe en particules est complet
    ScrollTrigger.create({
      trigger,
      start: 'top top',
      end: '+=180%',
      onUpdate: (self) => this.step(self.progress),
      onRefresh: () => this.layout(),
    });

    // le voile vit du relais jusqu'a la sortie de la zone bleue
    ScrollTrigger.create({
      trigger,
      start: 'top top',
      endTrigger: zone,
      end: 'bottom top',
      onToggle: (self) => this.options.veil.classList.toggle('is-live', self.isActive),
    });
  }

  private step(progress: number): void {
    this.relay(Math.min(1, progress / RELAY));
    this.bloom(Math.max(0, (progress - RELAY) / (1 - RELAY)));
  }

  /** Les particules s'effacent pendant que le trace prend leur place. */
  private relay(mix: number): void {
    this.options.particles.style.opacity = `${1 - mix}`;
    this.shape.style.opacity = `${mix}`;
  }

  /** Puis le signe grossit jusqu'a ne plus laisser voir que sa matiere. */
  private bloom(progress: number): void {
    const scale = 1 + (this.full - 1) * progress * progress;
    // le cadrage derive vers le sommet, acquis bien avant la couverture
    this.zoom(scale, Math.min(1, progress * 2));

    const covered = scale >= this.full * COVERED;
    if (covered === this.covered) return;
    this.covered = covered;
    this.options.veil.classList.toggle('is-flat', covered);
  }

  /**
   * Cote de viewBox pour lequel le trace se pose exactement sur le motif.
   * Le relais se joue pendant que le motif est epingle au centre de l'ecran :
   * sa taille suffit, sa position est connue.
   */
  private seedSide(): number {
    const screen = Math.max(window.innerWidth, window.innerHeight);
    const width = this.options.particles.getBoundingClientRect().width || screen;
    return (VIEWBOX * screen) / (width * INSET);
  }

  /** Cadre la viewBox, d'autant plus serree qu'on avance. */
  private zoom(scale: number, blend: number): void {
    const side = this.seed / scale;
    const cx = lerp(VIEWBOX / 2, PIVOT.x * VIEWBOX, blend);
    const cy = lerp(VIEWBOX / 2, PIVOT.y * VIEWBOX, blend);
    this.shape.setAttribute('viewBox', `${cx - side / 2} ${cy - side / 2} ${side} ${side}`);
  }

  /** Remesure le depart et le grossissement necessaire a la couverture. */
  private layout(): void {
    this.seed = this.seedSide();
    this.full = this.seed / this.coveringSide();
    this.zoom(1, 0);
  }

  /**
   * Plus grande fenetre de viewBox, centree sur le pivot, dont l'ecran entier
   * reste dans la matiere. Cherchee sur le trace : les bords obliques du signe
   * rendent tout calcul a la main faux.
   */
  private coveringSide(): number {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return VIEWBOX / 4;
    const path = new Path2D(GLYPHS.aDroit);
    const screen = Math.max(window.innerWidth, window.innerHeight);
    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;

    const covers = (side: number): boolean => {
      const unit = side / screen;
      return PROBES.every((sy) =>
        PROBES.every((sx) =>
          ctx.isPointInPath(
            path,
            PIVOT.x * VIEWBOX + sx * halfW * unit,
            PIVOT.y * VIEWBOX + sy * halfH * unit,
          ),
        ),
      );
    };

    let lo = 0;
    let hi = VIEWBOX;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (covers(mid)) lo = mid;
      else hi = mid;
    }
    return lo / MARGIN;
  }
}
