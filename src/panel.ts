import GUI from 'lil-gui';

import { DEFAULT_GLYPH, GLYPHS, isSolid } from './presets';
import type { Ending } from './types';

/** Les valeurs que le panneau expose et modifie en place. */
export interface Params {
  cols: number;
  stagger: number;
  /** nom d'un preset ; ignore si `svg` est renseigne */
  glyph: string;
  /** SVG ou path colle a la main, prioritaire sur le preset */
  svg: string;
  filled: boolean;
  /** comment la course s'acheve */
  ending: Ending;
  /** lectures seules, alimentees par le morphing */
  pace: string;
  grid: string;
  motif: string;
}

export interface PanelListener {
  /** la grille doit etre re-echantillonnee */
  onGrid(): void;
  /** le motif doit etre recompile */
  onGlyph(): void;
  /** seul le rendu change */
  onLook(): void;
}

/**
 * Le panneau de reglages. lil-gui tient les champs et leur synchronisation ;
 * on ne decrit ici que les bornes, les libelles et ce que chaque reglage
 * declenche.
 */
export class Panel {
  readonly params: Params = {
    cols: 60,
    stagger: 0,
    glyph: DEFAULT_GLYPH,
    svg: '',
    filled: isSolid(DEFAULT_GLYPH),
    ending: 'dive',
    pace: '',
    grid: '',
    motif: '',
  };

  private readonly gui = new GUI({ title: 'Morphing_' }).close();
  private readonly fill;

  constructor(listener: PanelListener) {
    const { params } = this;

    const grid = this.gui.addFolder('Grille');
    grid.add(params, 'cols', 24, 100, 2).name('Colonnes').onChange(listener.onGrid);
    grid.add(params, 'grid').name('').disable().listen();

    const motion = this.gui.addFolder('Morphing');
    motion.add(params, 'stagger', 0, 0.8, 0.02).name('Stagger').onChange(listener.onLook);

    const ending = this.gui.addFolder('Fin');
    ending
      .add(params, 'ending', { 'Fermer les cellules': 'cells', 'Plonger dans un motif': 'dive' })
      .name('Course finale')
      .onChange(listener.onLook);
    ending.add(params, 'pace').name('').disable().listen();

    const glyph = this.gui.addFolder('Motif');
    glyph
      .add(params, 'glyph', Object.keys(GLYPHS))
      .name('Preset')
      .onChange((name: string) => {
        // un lettrage se remplit d'office : son contour serait illisible
        params.svg = '';
        params.filled = isSolid(name);
        this.refresh();
        listener.onGlyph();
      });
    glyph.add(params, 'svg').name('SVG collé').onChange(listener.onGlyph);
    this.fill = glyph.add(params, 'filled').name('Plein').onChange(listener.onLook);
    glyph.add(params, 'motif').name('').disable().listen();
  }

  /** Ce que le morphing renvoie au panneau, une fois la grille reconstruite. */
  show(grid: string, motif: string): void {
    this.params.grid = grid;
    this.params.motif = motif;
  }

  /** Ou en est la fin de course, image par image. */
  pace(text: string): void {
    this.params.pace = text;
  }

  /** A appeler quand le code change une valeur que l'utilisateur voit. */
  refresh(): void {
    this.fill.updateDisplay();
  }

  dispose(): void {
    this.gui.destroy();
  }
}
