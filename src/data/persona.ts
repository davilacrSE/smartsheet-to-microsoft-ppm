export const PERSONA_KEY = 'ppm-persona';

/** Local preview only: remember which sample persona the viewer chose. */
export function rememberPersona(id: string) {
  try {
    globalThis.localStorage?.setItem(PERSONA_KEY, id);
  } catch {
    /* ignore */
  }
}
