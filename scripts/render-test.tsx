/**
 * Server-renders every page/tab for every persona against the sample data to catch runtime render errors.
 *   npx tsx scripts/render-test.tsx
 */
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] };
const _err = console.error; console.error = (...a: any[]) => { if (!String(a[0]).includes('useLayoutEffect')) _err(...a); };
(globalThis as any).window = { matchMedia: () => ({ matches: false }), innerWidth: 1280, addEventListener() {}, removeEventListener() {}, location: { hash: '' } };

import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MockBackend } from '../src/data/mock';
import { db, initStore, setActingUser } from '../src/data/store';
import { Layout } from '../src/components/Layout';
import { Dashboard } from '../src/pages/Dashboard';
import { Projects } from '../src/pages/Projects';
import { Intake } from '../src/pages/Intake';
import { Workspace } from '../src/pages/project/Workspace';
import { Approvals } from '../src/pages/Approvals';
import { Resources } from '../src/pages/Resources';
import { Reports } from '../src/pages/Reports';
import { AuditLog } from '../src/pages/AuditLog';
import { Admin } from '../src/pages/Admin';
import { REPORTS } from '../src/services/reports';

function render(path: string) {
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:code/:tab?" element={<Workspace />} />
          <Route path="/intake/new" element={<Intake />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </Layout>
    </MemoryRouter>,
  );
}

async function main() {
  await initStore(new MockBackend(false));
  const tabs = ['overview', 'governance', 'requirements', 'plan', 'raidd', 'status', 'financials', 'resources', 'testing', 'cutover', 'people', 'access', 'history'];
  const paths = [
    '/', '/projects', '/projects?archived=1', '/intake/new', '/approvals', '/audit',
    ...['capacity', 'nominations', 'people', 'scenarios', 'teams'].map((t) => `/resources?tab=${t}`),
    ...REPORTS.map((r) => `/reports?r=${r.key}`),
    ...['users', 'workflow', 'master', 'settings', 'access', 'data', 'platform'].map((t) => `/admin?tab=${t}`),
    ...db.projects.flatMap((p) => tabs.map((t) => `/projects/${p.code}/${t}`)),
  ];
  let ok = 0;
  const failures: string[] = [];
  for (const u of db.users) {
    setActingUser(u.id);
    for (const path of paths) {
      try {
        const html = render(path);
        if (!html.length) throw new Error('empty render');
        ok++;
      } catch (e: any) {
        failures.push(`${u.name} ${path}: ${e.message}`);
      }
    }
  }
  // NDA leak check on rendered HTML: personas off the access list must never see the real name or codename.
  const falcon = db.projects.find((p) => p.ndaActive)!;
  const leaks: string[] = [];
  for (const u of db.users.filter((x) => !db.ndaAccess.some((a) => a.projectId === falcon.id && a.userId === x.id) && !x.roles.includes('PMO_DIRECTOR'))) {
    setActingUser(u.id);
    for (const path of ['/', '/projects', '/approvals', '/resources?tab=nominations', '/resources?tab=capacity', ...REPORTS.map((r) => `/reports?r=${r.key}`), `/projects/${falcon.code}`]) {
      const html = render(path);
      if (html.includes(falcon.name) || (falcon.ndaCodename && html.includes(falcon.ndaCodename))) leaks.push(`${u.name} ${path}`);
    }
  }
  console.log(`${ok} renders OK across ${db.users.length} personas × ${paths.length} pages`);
  console.log(failures.length ? `FAILURES (${failures.length}):\n${[...new Set(failures)].slice(0, 30).join('\n')}` : 'No render failures');
  console.log(leaks.length ? `NDA LEAKS:\n${leaks.join('\n')}` : 'No NDA leaks in rendered HTML for users off the access list');
  process.exit(failures.length || leaks.length ? 1 : 0);
}
main();
void React;
