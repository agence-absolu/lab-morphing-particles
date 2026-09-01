import { decompressFrames, parseGIF } from 'gifuct-js';

/** Une image du morphing : les fixes en ont une, les GIF en ont plusieurs. */
export interface Frame {
  image: CanvasImageSource;
  /** duree d'affichage en ms (0 pour une image fixe) */
  ms: number;
}

/** Le GIF efface la zone qu'il vient de peindre avant la frame suivante. */
const RESTORE_BACKGROUND = 2;

/**
 * Charge une image fixe et rend un clip d'une seule frame.
 * `onload` et non `decode()` : ce dernier ne se resout pas tant que l'onglet
 * est en arriere-plan, ce qui retarderait indefiniment la construction.
 */
async function loadStill(url: string): Promise<Frame[]> {
  const img = await new Promise<HTMLImageElement | null>((done) => {
    const el = new Image();
    el.onload = () => done(el);
    el.onerror = () => done(null);
    el.src = url;
  });
  return img ? [{ image: img, ms: 0 }] : [];
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d')! };
}

/**
 * Decoupe un GIF anime en frames completes. Un GIF ne stocke que des retouches
 * partielles : chacune est posee sur la precedente, et la zone est effacee
 * ensuite si la frame le demande — sans quoi les images se superposeraient.
 */
async function loadAnimated(url: string): Promise<Frame[]> {
  const data = await fetch(url).then((r) => r.arrayBuffer());
  const gif = parseGIF(data);
  const parts = decompressFrames(gif, true);
  if (!parts.length) return loadStill(url);

  const full = canvasOf(gif.lsd.width, gif.lsd.height);
  const patch = canvasOf(1, 1);
  const frames: Frame[] = [];

  for (const part of parts) {
    const { left, top, width, height } = part.dims;
    patch.canvas.width = width;
    patch.canvas.height = height;
    // le patch est une copie : ImageData exige un buffer qui lui appartient
    patch.ctx.putImageData(new ImageData(new Uint8ClampedArray(part.patch), width, height), 0, 0);

    full.ctx.drawImage(patch.canvas, left, top);
    frames.push({ image: await createImageBitmap(full.canvas), ms: part.delay });

    if (part.disposalType === RESTORE_BACKGROUND) full.ctx.clearRect(left, top, width, height);
  }
  return frames;
}

export function loadClip(url: string): Promise<Frame[]> {
  return url.toLowerCase().endsWith('.gif') ? loadAnimated(url) : loadStill(url);
}
