/** Recupere un element par son id, ou null s'il n'existe pas dans la page. */
export function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** Idem, mais l'absence est une erreur : la page ne peut pas fonctionner sans. */
export function need<T extends HTMLElement>(id: string): T {
  const el = byId<T>(id);
  if (!el) throw new Error(`#${id} introuvable dans la page`);
  return el;
}

export function all<T extends HTMLElement>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}
