/**
 * Runs before the app's own modules.
 *
 * Rebranding: the demo build reads display overrides (company, tagline, colors) from the page URL when it starts.
 * A hosted page often cannot carry a query string, so the guide saves the overrides in this browser instead, and
 * this module puts them on the URL just while src/brand.ts reads it. restore.ts then puts the URL back.
 *
 * Theme: when the page that hosts this one sets an explicit light or dark theme, the app starts in it.
 */
export const BRAND_KEY = 'ppm-live-brand';

export interface SavedBrand {
  company?: string;
  tagline?: string;
  primary?: string;
  ink?: string;
}

export function readSavedBrand(): SavedBrand | null {
  try {
    const value = JSON.parse(localStorage.getItem(BRAND_KEY) || 'null');
    return value && typeof value === 'object' ? (value as SavedBrand) : null;
  } catch {
    return null;
  }
}

/** Saves the overrides for the next start, or clears them with null. False when the browser blocks storage. */
export function saveBrand(brand: SavedBrand | null): boolean {
  try {
    if (brand) localStorage.setItem(BRAND_KEY, JSON.stringify(brand));
    else localStorage.removeItem(BRAND_KEY);
    return true;
  } catch {
    return false;
  }
}

let originalUrl: string | null = null;

const saved = readSavedBrand();
if (saved) {
  try {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(saved)) if (typeof value === 'string' && value) url.searchParams.set(key, value);
    const href = location.href;
    history.replaceState(history.state, '', url);
    originalUrl = href;
  } catch {
    /* this page's URL cannot change, so the app starts with its default brand */
  }
}

/** Puts the page URL back as it was. */
export function restoreUrl() {
  if (originalUrl === null) return;
  try {
    history.replaceState(history.state, '', originalUrl);
  } catch {
    /* ignore */
  }
  originalUrl = null;
}

const hostTheme = document.documentElement.getAttribute('data-theme');
if (hostTheme === 'light' || hostTheme === 'dark') {
  try {
    localStorage.setItem('ppm-theme', hostTheme);
  } catch {
    /* ignore */
  }
}
