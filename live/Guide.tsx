/**
 * The presenter guide: the demo script beside the running app. Each step can open its screen as the right person
 * and point at what to show. People switches persona, and Setup rebrands the demo or resets its sample data.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import { BRAND } from '../src/brand';
import { initials } from '../src/components/ui';
import { actingKey, currentRoute, getVersion, isReady, open, person, resetSampleData, resolve, runHelper, subscribe } from './bridge';
import { readSavedBrand, saveBrand } from './boot';
import { CAST, NUMBERS, RUNS, type Jump, type Run, type Step } from './script';
import './guide.css';

type RunId = Run['id'];
type Tab = RunId | 'people' | 'setup';

const TABS: [Tab, string][] = [...RUNS.map((r): [Tab, string] => [r.id, r.tab]), ['people', 'People'], ['setup', 'Setup']];

interface Prefs {
  tab: Tab;
  at: Record<RunId, number>;
  collapsed: boolean;
  /** Open a step's first screen when the presenter moves to it. */
  auto: boolean;
}

const PREFS_KEY = 'ppm-live-guide';
const DEFAULT_PREFS: Prefs = { tab: 'quick', at: { quick: 0, full: 0, topics: 0 }, collapsed: false, auto: true };

function loadPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (v && typeof v === 'object') {
      const tab = TABS.some(([id]) => id === v.tab) ? v.tab : DEFAULT_PREFS.tab;
      return { ...DEFAULT_PREFS, ...v, tab, at: { ...DEFAULT_PREFS.at, ...(v.at || {}) } };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFS;
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The app's current route. In-app links change it without events, so it is also checked on a short interval. */
function useRoute() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const sync = () => setRoute(currentRoute());
    window.addEventListener('hashchange', sync);
    const id = window.setInterval(sync, 700);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.clearInterval(id);
    };
  }, []);
  return route;
}

function useTimer() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [banked, setBanked] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => tick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  const ms = banked + (startedAt === null ? 0 : Date.now() - startedAt);
  return {
    seconds: Math.floor(ms / 1000),
    running: startedAt !== null,
    toggle: () => {
      if (startedAt === null) setStartedAt(Date.now());
      else {
        setBanked(ms);
        setStartedAt(null);
      }
    },
    reset: () => setBanked(0),
  };
}

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function Guide() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const ready = isReady();
  const route = useRoute();
  const timer = useTimer();
  const [prefs, setPrefsState] = useState(loadPrefs);
  const [status, setStatus] = useState('');
  const body = useRef<HTMLDivElement>(null);

  const setPrefs = (change: (p: Prefs) => Prefs) =>
    setPrefsState((p) => {
      const next = change(p);
      savePrefs(next);
      return next;
    });

  const run = RUNS.find((r) => r.id === prefs.tab);
  const index = run ? Math.max(0, Math.min(prefs.at[run.id] ?? 0, run.steps.length - 1)) : 0;
  const step = run?.steps[index];

  useEffect(() => {
    document.getElementById('lv-layout')?.classList.toggle('is-collapsed', prefs.collapsed);
  }, [prefs.collapsed]);

  // The app's sidebar is as tall as its column, which is shorter than the window when the guide sits below it.
  useEffect(() => {
    const app = document.querySelector<HTMLElement>('.lv-app');
    if (!app || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => app.style.setProperty('--lv-app-h', `${app.clientHeight}px`));
    observer.observe(app);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    body.current?.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [prefs.tab, index]);

  const openJump = async (j: Jump) => {
    const message = await open(j);
    if (message !== null) setStatus(message);
  };

  const goTo = (i: number) => {
    if (!run) return;
    const n = Math.max(0, Math.min(run.steps.length - 1, i));
    if (n === index) return;
    setPrefs((p) => ({ ...p, at: { ...p.at, [run.id]: n } }));
    setStatus('');
    const next = run.steps[n];
    if (prefs.auto && ready && !next.stay && next.jumps?.[0]) void openJump(next.jumps[0]);
  };

  const selectTab = (tab: Tab) => {
    setPrefs((p) => ({ ...p, tab }));
    setStatus('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!run || e.altKey || e.ctrlKey || e.metaKey || target.closest('input, textarea, select, [role="tablist"]')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      goTo(index - 1);
    }
  };

  const onTabsKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const at = TABS.findIndex(([id]) => id === prefs.tab);
    const [next] = TABS[(at + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    selectTab(next);
    document.getElementById(`lv-tab-${next}`)?.focus();
  };

  if (prefs.collapsed) {
    return (
      <div className="lv is-collapsed" onKeyDown={onKeyDown}>
        <div className="lv-compact">
          <button type="button" className="lv-icon" onClick={() => setPrefs((p) => ({ ...p, collapsed: false }))} aria-label="Show the demo guide" title="Show the demo guide">
            <PanelRightOpen size={18} />
          </button>
          {run && step && (
            <>
              <p className="lv-compact-title">
                <span className="lv-compact-n">{index + 1}/{run.steps.length}</span>
                <span className="lv-compact-step">{step.title}</span>
              </p>
              <button type="button" className="lv-icon" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous step" title="Previous step">
                <ChevronLeft size={18} />
              </button>
              <button type="button" className="lv-icon" onClick={() => goTo(index + 1)} disabled={index === run.steps.length - 1} aria-label="Next step" title="Next step">
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="lv" onKeyDown={onKeyDown}>
      <header className="lv-head">
        <div className="lv-head-row">
          <div className="lv-head-name">
            <p className="lv-eyebrow"><span className="lv-tally" aria-hidden="true" />Live demo</p>
            <h2 className="lv-app-name">{BRAND.appName}</h2>
          </div>
          <div className={`lv-timer ${run?.minutes && timer.seconds >= run.minutes * 60 ? 'is-over' : ''}`}>
            <button type="button" className="lv-icon on-band" onClick={timer.toggle} aria-label={timer.running ? 'Pause the timer' : 'Start the timer'} title={timer.running ? 'Pause the timer' : 'Start the timer'}>
              {timer.running ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <span className="lv-time">
              {clock(timer.seconds)}
              {run?.minutes ? <span className="lv-time-of"> / {run.minutes}:00</span> : null}
            </span>
            {!timer.running && timer.seconds > 0 && (
              <button type="button" className="lv-icon on-band" onClick={timer.reset} aria-label="Reset the timer" title="Reset the timer">
                <RotateCcw size={14} />
              </button>
            )}
          </div>
          <button type="button" className="lv-icon on-band" onClick={() => setPrefs((p) => ({ ...p, collapsed: true }))} aria-label="Hide the demo guide" title="Hide the demo guide">
            <PanelRightClose size={18} />
          </button>
        </div>
        <div className="lv-tabs" role="tablist" aria-label="Demo guide" onKeyDown={onTabsKeyDown}>
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`lv-tab-${id}`}
              aria-selected={prefs.tab === id}
              aria-controls="lv-panel"
              tabIndex={prefs.tab === id ? 0 : -1}
              className={prefs.tab === id ? 'is-on' : ''}
              onClick={() => selectTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="lv-body" id="lv-panel" role="tabpanel" aria-labelledby={`lv-tab-${prefs.tab}`} ref={body}>
        {run && step ? (
          <>
            <Cue run={run} step={step} index={index} ready={ready} route={route} status={status} onJump={openJump} onHelper={(id) => setStatus(runHelper(id))} />
            <Outline run={run} index={index} onSelect={goTo} />
          </>
        ) : prefs.tab === 'people' ? (
          <People ready={ready} status={status} onJump={openJump} />
        ) : (
          <Setup auto={prefs.auto} onAuto={(auto) => setPrefs((p) => ({ ...p, auto }))} />
        )}
      </div>

      {run && (
        <footer className="lv-foot">
          <button type="button" className="lv-btn" onClick={() => goTo(index - 1)} disabled={index === 0}>
            <ChevronLeft size={16} /> Back
          </button>
          <span className="lv-count">
            {index + 1} <span>of</span> {run.steps.length}
          </span>
          <button type="button" className="lv-btn is-primary" onClick={() => goTo(index + 1)} disabled={index === run.steps.length - 1}>
            Next <ChevronRight size={16} />
          </button>
        </footer>
      )}
    </div>
  );
}

function Cue({ run, step, index, ready, route, status, onJump, onHelper }: {
  run: Run;
  step: Step;
  index: number;
  ready: boolean;
  route: string;
  status: string;
  onJump: (j: Jump) => void;
  onHelper: (id: NonNullable<Step['helpers']>[number]['id']) => void;
}) {
  const phases = [...new Set(run.steps.map((s) => s.phase).filter(Boolean))];
  const acting = actingKey();
  return (
    <section className="lv-cue" aria-labelledby="lv-step-title">
      <p className="lv-meta">
        <span>{step.phase ? `Phase ${phases.indexOf(step.phase) + 1} · ${step.phase}` : run.title}</span>
        <span>{run.numbered ? `Step ${index + 1} of ${run.steps.length}` : `${index + 1} of ${run.steps.length}`}</span>
      </p>
      <h3 className="lv-title" id="lv-step-title">{step.title}</h3>
      {step.say && <p className="lv-say">{step.say}</p>}

      {step.jumps && (
        <div className="lv-jumps">
          {step.jumps.map((j, k) => {
            const who = person(j.as);
            const target = resolve(j);
            const onScreen = ready && acting === j.as && route === target.route;
            return (
              <button key={`${j.as}${j.route}`} type="button" className={`lv-jump ${k === 0 ? 'is-primary' : ''} ${onScreen ? 'is-on' : ''}`} disabled={!ready} onClick={() => onJump(j)}>
                <span className={`avatar ${who?.external ? 'ext' : ''}`} aria-hidden="true">{initials(who?.name ?? j.as.replace('.', ' '))}</span>
                <span className="lv-jump-text">
                  <span className="lv-jump-screen">{j.screen}</span>
                  <span className="lv-jump-who">
                    {who?.name ?? j.as}
                    {target.code && <> · <code>{target.code}</code></>}
                  </span>
                </span>
                <span className="lv-jump-state">
                  {onScreen ? (
                    <>
                      <span className="lv-dot" aria-hidden="true" />
                      <span className="lv-jump-state-text">On screen</span>
                    </>
                  ) : (
                    <ArrowRight size={17} aria-hidden="true" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {(step.before || step.now || step.points || step.show) && (
        <dl className="lv-script">
          {step.before && (
            <div className="is-before">
              <dt>In Smartsheet</dt>
              <dd>{step.before}</dd>
            </div>
          )}
          {step.now && (
            <div>
              <dt>Now</dt>
              <dd>{step.now}</dd>
            </div>
          )}
          {step.points && (
            <div>
              <dt>Points</dt>
              <dd>
                <ul>{step.points.map((p) => <li key={p}>{p}</li>)}</ul>
              </dd>
            </div>
          )}
          {step.show && (
            <div>
              <dt>Show</dt>
              <dd>{step.show}</dd>
            </div>
          )}
        </dl>
      )}

      {step.helpers && (
        <div className="lv-helpers">
          <p className="lv-label">Shortcuts</p>
          {step.helpers.map((h) => (
            <button key={h.id} type="button" className="lv-btn sm" disabled={!ready} onClick={() => onHelper(h.id)}>
              <Sparkles size={14} /> {h.label}
            </button>
          ))}
        </div>
      )}

      {step.numbers && <Numbers />}

      <p className="lv-status" role="status">{ready ? status : 'Loading the sample data…'}</p>
    </section>
  );
}

function Outline({ run, index, onSelect }: { run: Run; index: number; onSelect: (i: number) => void }) {
  const phases = [...new Set(run.steps.map((s) => s.phase).filter(Boolean))];
  return (
    <nav className="lv-outline" aria-label={`${run.title}, every step`}>
      <p className="lv-label">{run.numbered ? 'Run of show' : 'All topics'}</p>
      <p className="lv-intro">{run.intro}</p>
      <ol>
        {run.steps.map((s, i) => {
          const heading = s.phase && s.phase !== run.steps[i - 1]?.phase ? s.phase : undefined;
          const who = s.jumps?.[0] ? person(s.jumps[0].as) : undefined;
          return (
            <li key={s.id}>
              {heading && <p className="lv-phase">Phase {phases.indexOf(heading) + 1} · {heading}</p>}
              <button type="button" className={i === index ? 'is-on' : ''} aria-current={i === index ? 'step' : undefined} onClick={() => onSelect(i)}>
                {run.numbered && <span className="lv-o-n">{String(i + 1).padStart(2, '0')}</span>}
                <span className="lv-o-title">{s.title}</span>
                {who && <span className={`avatar sm ${who.external ? 'ext' : ''}`} title={who.name}>{initials(who.name)}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Numbers() {
  return (
    <table className="lv-numbers">
      <tbody>
        {NUMBERS.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function People({ ready, status, onJump }: { ready: boolean; status: string; onJump: (j: Jump) => void }) {
  const acting = actingKey();
  return (
    <section className="lv-people" aria-label="Sample people">
      <p className="lv-intro">Each role sees a different app. BRMs see New Intake, executives are read-only, and external people see only what they were granted. You can also switch from the persona menu at the top right of the app.</p>
      <ul>
        {CAST.map((c) => {
          const u = person(c.key);
          const on = acting === c.key;
          return (
            <li key={c.key} className={on ? 'is-on' : ''}>
              <span className={`avatar ${u?.external ? 'ext' : ''}`} aria-hidden="true">{initials(u?.name ?? c.key.replace('.', ' '))}</span>
              <span className="lv-person">
                <b>{u?.name ?? c.key}</b>
                <span>{c.role}</span>
                <span className="lv-person-show">Shows {c.show.charAt(0).toLowerCase() + c.show.slice(1)}</span>
              </span>
              <button type="button" className="lv-btn sm" disabled={!ready || on} onClick={() => onJump({ as: c.key, route: '/', screen: 'Home' })}>
                {on ? 'Viewing' : 'Switch'}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="lv-status" role="status">{ready ? status : 'Loading the sample data…'}</p>
    </section>
  );
}

/** Contrast of white text on a color, as a ratio. */
function contrastWithWhite(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

function Setup({ auto, onAuto }: { auto: boolean; onAuto: (auto: boolean) => void }) {
  const saved = readSavedBrand();
  const [brand, setBrand] = useState({ company: BRAND.company, tagline: BRAND.tagline, primary: BRAND.primary.toLowerCase(), ink: BRAND.ink.toLowerCase() });
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const set = (k: keyof typeof brand, v: string) => setBrand((b) => ({ ...b, [k]: v }));
  const primaryContrast = contrastWithWhite(brand.primary);
  const inkContrast = contrastWithWhite(brand.ink);

  const apply = () => {
    const company = brand.company.trim();
    if (!company) return setNote('Enter a company name.');
    if (saveBrand({ company, tagline: brand.tagline.trim(), primary: brand.primary, ink: brand.ink })) location.reload();
    else setNote('This browser blocks storage for this page, so the brand cannot be saved.');
  };

  return (
    <div className="lv-setup">
      <section className="lv-panel" aria-labelledby="lv-brand-h">
        <h3 className="lv-h" id="lv-brand-h">Rebrand for the audience</h3>
        <p className="lv-help">Show the prospect their own name and colors. The page reloads, and each company name gets its own sample data in this browser.</p>
        <div className="lv-form">
          <label className="lv-field" htmlFor="lv-company">
            <span>Company</span>
            <input id="lv-company" value={brand.company} maxLength={40} autoComplete="organization" onChange={(e) => set('company', e.target.value)} />
          </label>
          <label className="lv-field" htmlFor="lv-tagline">
            <span>Tagline</span>
            <input id="lv-tagline" value={brand.tagline} maxLength={60} onChange={(e) => set('tagline', e.target.value)} />
          </label>
          <div className="lv-colors">
            <label className="lv-field" htmlFor="lv-primary">
              <span>Primary</span>
              <span className="lv-color">
                <input type="color" id="lv-primary" value={brand.primary} onChange={(e) => set('primary', e.target.value)} />
                <code>{brand.primary.toUpperCase()}</code>
              </span>
            </label>
            <label className="lv-field" htmlFor="lv-ink">
              <span>Ink</span>
              <span className="lv-color">
                <input type="color" id="lv-ink" value={brand.ink} onChange={(e) => set('ink', e.target.value)} />
                <code>{brand.ink.toUpperCase()}</code>
              </span>
            </label>
          </div>
        </div>
        <div className="lv-preview" style={{ ['--pv-primary' as string]: brand.primary, ['--pv-ink' as string]: brand.ink }} aria-hidden="true">
          <span className="lv-pv-side">
            <b>{brand.company.trim() || 'Company'}</b>
            <span>{brand.tagline}</span>
          </span>
          <span className="lv-pv-main">
            <span className="lv-pv-btn">Approve</span>
            <span className="lv-pv-link">ITProj-26-001</span>
          </span>
        </div>
        {primaryContrast < 4.5 && <p className="lv-warn">White button text on this primary color is {primaryContrast.toFixed(1)}:1. Buttons need 4.5:1, so pick a darker primary.</p>}
        {inkContrast < 4.5 && <p className="lv-warn">White sidebar text on this ink color is {inkContrast.toFixed(1)}:1. It needs 4.5:1, so pick a darker ink.</p>}
        <div className="lv-row">
          <button type="button" className="lv-btn is-primary" onClick={apply}>Apply and reload</button>
          {saved && (
            <button type="button" className="lv-btn" onClick={() => saveBrand(null) && location.reload()}>Restore the default brand</button>
          )}
        </div>
        {note && <p className="lv-warn" role="alert">{note}</p>}
      </section>

      <section className="lv-panel" aria-labelledby="lv-present-h">
        <h3 className="lv-h" id="lv-present-h">Presenting</h3>
        <label className="lv-check" htmlFor="lv-auto">
          <input type="checkbox" id="lv-auto" checked={auto} onChange={(e) => onAuto(e.target.checked)} />
          <span>Open each step's screen when I move to it</span>
        </label>
        <p className="lv-help">While the guide has focus, the arrow keys and Page Up and Page Down move between steps. Most presentation clickers send those keys. Hide the guide with the button at its top right to show the app on its own.</p>
      </section>

      <section className="lv-panel" aria-labelledby="lv-data-h">
        <h3 className="lv-h" id="lv-data-h">Sample data</h3>
        <p className="lv-help">Changes made during a demo stay in this browser. Reset between sessions.</p>
        {confirming ? (
          <div className="lv-confirm">
            <p>Discard the changes made in this browser and reload the original sample data?</p>
            <div className="lv-row">
              <button type="button" className="lv-btn danger" onClick={() => void resetSampleData()}>Reset and reload</button>
              <button type="button" className="lv-btn" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="lv-row">
            <button type="button" className="lv-btn" onClick={() => setConfirming(true)}>
              <RotateCcw size={14} /> Reset sample data
            </button>
          </div>
        )}
      </section>

      <section className="lv-panel" aria-labelledby="lv-about-h">
        <h3 className="lv-h" id="lv-about-h">About this page</h3>
        <p className="lv-help">This is the demo build of {BRAND.appName}: the full app, with sample data stored in this browser. Nothing is sent to a server. The deployed app reads and writes Microsoft Dataverse, and runs in Power Apps and Microsoft Teams.</p>
        <p className="lv-help">Exports and attachments save as files. When this page runs inside another app, that app may ask before it saves one.</p>
      </section>
    </div>
  );
}

export function mountGuide() {
  const el = document.getElementById('lv-guide');
  if (el) createRoot(el).render(<Guide />);
}
