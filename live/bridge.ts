/**
 * The presenter guide's handle on the running demo. It drives the app the way a presenter would: it picks a
 * persona (the same call as the app's persona menu), opens a screen, then points at a card or a row.
 */
import { db, getVersion, hasUser, me, resetBackend, setActingUser, subscribe } from '../src/data/store';
import { rememberPersona } from '../src/data/persona';
import { stageIndex } from '../src/domain/constants';
import type { Project } from '../src/domain/types';
import { SAMPLE_DATES, SAMPLE_INTAKE, type HelperId, type Jump, type Spot } from './script';

export { getVersion, subscribe };

const keyOf = (email: string) => email.split('@')[0].toLowerCase();

/** True once the sample data has loaded and a persona is signed in. */
export const isReady = () => db.users.length > 0 && hasUser();
export const person = (key: string) => db.users.find((u) => keyOf(u.email) === key);
export const actingKey = () => (hasUser() ? keyOf(me().email) : undefined);
export const currentRoute = () => location.hash.replace(/^#/, '') || '/';

/** The newest project created in this browser, as opposed to the sample projects. */
export function newProject(): Project | undefined {
  return db.projects
    .filter((p) => !p.demo)
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
}

export interface Target {
  route: string;
  /** Project ID in the route, if the screen belongs to a project. */
  code?: string;
  /** Why the jump opens its fallback instead of the project created during the demo. */
  fallbackReason?: string;
}

export function resolve(j: Jump): Target {
  let route = j.route;
  let fallbackReason: string | undefined;
  if (route.includes('{new}')) {
    const p = newProject();
    if (p && (!j.minStage || stageIndex(p.stage) >= stageIndex(j.minStage))) route = route.split('{new}').join(p.code);
    else {
      route = j.fallback ?? '/';
      fallbackReason = p ? `${p.name} is still in ${p.stage}` : 'No intake has been saved in this demo yet';
    }
  }
  return { route, code: /^\/projects\/([^/?]+)/.exec(route)?.[1], fallbackReason };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const appScroller = () => document.getElementById('root');
const content = () => document.querySelector<HTMLElement>('#root main.content');

async function waitFor<T>(find: () => T | null, ms: number, cancelled: () => boolean): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    if (cancelled()) return null;
    const found = find();
    if (found || Date.now() > end) return found;
    await sleep(100);
  }
}

const cardTitle = (card: Element) => card.querySelector(':scope > .card-head h3')?.textContent?.trim() ?? '';

function findSpot(spot: Spot): HTMLElement | null {
  const main = content();
  if (!main) return null;
  const cards = [...main.querySelectorAll<HTMLElement>('section.card')];
  if ('first' in spot) return cards[0] ?? null;
  if ('card' in spot) {
    for (const prefix of [spot.card].flat()) {
      const card = cards.find((c) => cardTitle(c).startsWith(prefix));
      if (card) return card;
    }
    return null;
  }
  const texts = [spot.row === '{new}' ? newProject()?.name : spot.row, spot.or].filter((t): t is string => !!t);
  const rows = [...main.querySelectorAll<HTMLElement>('tbody tr')];
  for (const text of texts) {
    const row = rows.find((r) => r.textContent?.includes(text));
    if (row) return row;
  }
  return null;
}

/** Scrolls to an element in the app and outlines it for a moment. */
export function point(el: HTMLElement) {
  const cls = el.tagName === 'TR' ? 'lv-spot-row' : 'lv-spot';
  el.classList.remove(cls);
  void el.offsetWidth; // restarts the animation when the same element is pointed at twice
  el.classList.add(cls);
  const tall = el.offsetHeight > (appScroller()?.clientHeight ?? 800) * 0.7;
  el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  window.setTimeout(() => el.classList.remove(cls), 2800);
}

let latestJump = 0;

/**
 * Acts as the jump's persona, opens its screen and points at its spot. Returns a line for the guide to show, or
 * null when a newer jump took over while this one was still looking for its spot.
 */
export async function open(j: Jump): Promise<string | null> {
  const jump = ++latestJump;
  const superseded = () => jump !== latestJump;
  if (!isReady()) return 'The sample data is still loading.';
  const who = person(j.as);
  if (!who) return `Nobody with the email ${j.as}@… is in the sample data.`;
  const target = resolve(j);
  if (me().id !== who.id) {
    rememberPersona(who.id);
    setActingUser(who.id);
  }
  if (currentRoute() !== target.route) {
    location.hash = `#${target.route}`;
    // Let the router render the new screen before looking for the spot.
    await sleep(50);
    await frame();
    await frame();
    const scroller = appScroller();
    if (scroller) scroller.scrollTop = 0;
  }
  const el = j.spot ? await waitFor(() => findSpot(j.spot!), 2000, superseded) : null;
  if (superseded()) return null;
  if (el) point(el);
  if (target.fallbackReason) {
    const p = target.code ? db.projects.find((x) => x.code === target.code) : undefined;
    const opened = p ? `${p.code}, ${p.name}, a sample project in ${p.stage}` : 'the New Intake form';
    return `${target.fallbackReason}, so this opens ${opened}.`;
  }
  return `${j.screen}, as ${who.name}.`;
}

// ───────── shortcuts that fill in the intake form ─────────

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** The editable control in the form field whose label starts with this text. */
function control(label: string): Control | null {
  const field = [...document.querySelectorAll<HTMLElement>('#root main.content .field')].find((f) =>
    f.querySelector(':scope > label')?.textContent?.trim().startsWith(label),
  );
  return field?.querySelector<Control>('input:not([type=checkbox]):not([type=file]):not(:disabled), textarea:not(:disabled), select:not(:disabled)') ?? null;
}

/** Sets a value the way typing would, so React sees the change. Lists take the matching option, else the first one. */
function setValue(el: Control, value: string): boolean {
  if (el instanceof HTMLSelectElement) {
    const option = [...el.options].find((o) => o.text === value || o.value === value) ?? [...el.options].find((o) => o.value);
    if (!option) return false;
    value = option.value;
  }
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  if (!setter) return false;
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  return true;
}

function fill(pairs: [string, string][]) {
  let filled = 0;
  for (const [label, value] of pairs) {
    const el = control(label);
    if (el && setValue(el, value)) filled++;
  }
  return filled;
}

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function runHelper(id: HelperId): string {
  const D = SAMPLE_DATES;
  const dates: [string, string][] = [
    ['Planned initiate date', day(D.initiate)],
    ['Planned execution date', day(D.execution)],
    ['Planned go-live date', day(D.goLive)],
    ['Planned end date', day(D.end)],
  ];
  const filled =
    id === 'fill-intake' ? fill([...SAMPLE_INTAKE, ...dates])
    : id === 'break-dates' ? fill([['Planned initiate date', day(D.initiate)], ['Planned execution date', day(D.initiate - 7)]])
    : fill(dates);
  if (!filled) return 'These fields are not on screen. Open the intake form first.';
  const card = control(id === 'fill-intake' ? 'Project name' : 'Planned initiate date')?.closest<HTMLElement>('section.card');
  if (card) point(card);
  if (id === 'fill-intake') return `Filled in ${filled} fields. Choose Save draft at the bottom of the form.`;
  if (id === 'break-dates') return 'The execution date is now a week before the initiate date. Choose Save & mark Ready for Review to see the check.';
  return 'The planned dates are in order again.';
}

/** Discards changes made during the demo and starts again from the original sample data. */
export async function resetSampleData() {
  await resetBackend();
  location.reload();
}
