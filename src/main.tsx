import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { initStore, type Backend } from './data/store';
import { BrandLogo } from './components/ui';
import { applyBrand, DATAVERSE, TABLE_PREFIX } from './brand';
import { readHost } from './host';

const MODE = import.meta.env.VITE_DATA_MODE === 'dataverse' ? 'dataverse' : 'mock';

// React StrictMode runs effects twice in development; start the store once per page load.
let started: ReturnType<typeof initStore> | undefined;

async function createBackend(): Promise<Backend> {
  if (MODE === 'dataverse') {
    const { getContext } = await import('@microsoft/power-apps/app');
    try {
      readHost((await getContext()).app.queryParams ?? {});
    } catch {
      /* older hosts may not expose query parameters */
    }
    const { DataverseBackend } = await import('./data/dataverse');
    return new DataverseBackend();
  }
  readHost(Object.fromEntries(new URLSearchParams(window.location.search)));
  const { MockBackend } = await import('./data/mock');
  return new MockBackend();
}

function Boot() {
  const [state, setState] = useState<{ phase: 'loading' | 'ready' | 'noprofile' | 'error'; message?: string; email?: string }>({ phase: 'loading' });
  useEffect(() => {
    (async () => {
      try {
        const { signedIn, email } = await (started ??= createBackend().then(initStore));
        setState(signedIn ? { phase: 'ready' } : { phase: 'noprofile', email });
      } catch (e: any) {
        setState({ phase: 'error', message: e?.message || String(e) });
      }
    })();
  }, []);
  if (state.phase === 'ready') return <App />;
  return (
    <div className="splash">
      <BrandLogo size={34} />
      {state.phase === 'loading' && (
        <>
          <div className="spinner" aria-label="Loading" />
          <p>Loading portfolio from {MODE === 'dataverse' ? 'Dataverse' : 'local sample data'}…</p>
        </>
      )}
      {state.phase === 'noprofile' && (
        <div className="card card-body">
          <h2>Access not provisioned</h2>
          <p className="mt">You are signed in as <b>{state.email ?? 'an unknown user'}</b>, but no active PPM user profile exists for this account.</p>
          <p className="mt muted">Ask a PPM system administrator to add you in Administration → Users &amp; roles (table <code>{TABLE_PREFIX}ppmuser</code>).</p>
        </div>
      )}
      {state.phase === 'error' && (
        <div className="card card-body">
          <h2>Could not load the PPM data</h2>
          <p className="mt errors">{state.message}</p>
          <p className="mt muted small">Check that the {DATAVERSE.solution.uniqueName} Dataverse tables are added to the app as data sources and that your security role grants read access.</p>
        </div>
      )}
    </div>
  );
}

applyBrand();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
