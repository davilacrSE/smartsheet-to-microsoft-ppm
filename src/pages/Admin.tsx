import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { AppConfig, GateKey, Role, Stage, User } from '../domain/types';
import { CHECKS, GATES, ROLES, ROLE_LABELS, ROLE_SHORT, STAGES, TRANSITIONS } from '../domain/constants';
import { fmtDate, fmtDateTime } from '../domain/calc';
import { ENTITIES, SOLUTION } from '../data/model';
import { dataMode, db, projectById, remove, resetBackend, userName } from '../data/store';
import { isAdmin, isPmo, isPmoDirector, ndaList } from '../services/rules';
import { importActuals, recertifyGrant, recertifyNda, revokeGrant, runSweep, saveConfig, saveUser } from '../services/workflow';
import { audit } from '../services/events';
import { Card, Empty, Field, Modal, Notice, ask, confirmAsk, toast, useAction, useMe, useStore } from '../components/ui';
import { PersonNameInput } from '../components/PeoplePicker';
import { BRAND, TABLE_PREFIX } from '../brand';

const TABS = [
  ['users', 'Users & roles'],
  ['workflow', 'Workflow & gates'],
  ['master', 'Master data'],
  ['settings', 'Settings'],
  ['access', 'Access review'],
  ['data', 'Data & automation'],
  ['platform', 'Dataverse & integrations'],
] as const;

/** NFR-002/006: administrator tools for roles, workflow, master data, integrations and access review. */
export function Admin() {
  useStore();
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || (isAdmin(me) ? 'users' : 'workflow');
  if (!(isAdmin(me) || isPmoDirector(me))) return <Notice kind="warn">Administration is limited to System Administrators and the PMO Director.</Notice>;
  return (
    <>
      <div className="page-head"><div><h1>Administration</h1><p className="sub">Configuration is stored in Dataverse (PPM Settings) and takes effect immediately.</p></div></div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setParams({ tab: k })}>{label}</button>)}
      </div>
      {tab === 'users' && <UsersTab />}
      {tab === 'workflow' && <WorkflowTab />}
      {tab === 'master' && <MasterTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'access' && <AccessReviewTab />}
      {tab === 'data' && <DataTab />}
      {tab === 'platform' && <PlatformTab />}
    </>
  );
}

function UsersTab() {
  const me = useMe();
  const [editing, setEditing] = useState<Partial<User> | null>(null);
  const [q, setQ] = useState('');
  const { run, busy } = useAction();
  const users = db.users.filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Card title="PPM users" meta="Application roles drive workflow; Dataverse security roles enforce data access" actions={isAdmin(me) && <button className="btn primary sm" onClick={() => setEditing({ roles: [], active: true, notifyEmail: true, notifyTeams: true, external: false })}><Plus size={14} /> Add user</button>} flush>
      <div className="toolbar"><input type="search" placeholder="Filter users…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <table className="t">
        <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Type</th><th>Notifications</th><th>Status</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={isAdmin(me) ? 'click' : ''} onClick={() => isAdmin(me) && setEditing({ ...u })}>
              <td>{u.name}<div className="small muted">{u.title}</div></td>
              <td>{u.email}</td>
              <td>{u.roles.map((r) => <span key={r} className="pill" style={{ marginRight: 4 }}>{ROLE_SHORT[r]}</span>)}</td>
              <td>{u.external ? <span className="pill warn">External</span> : 'Internal'}</td>
              <td className="small">{[u.notifyEmail && 'Email', u.notifyTeams && 'Teams'].filter(Boolean).join(', ') || 'In-app only'}</td>
              <td>{u.active ? <span className="pill good">Active</span> : <span className="pill">Inactive</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <Modal title={editing.id ? `Edit ${editing.name}` : 'Add PPM user'} onClose={() => setEditing(null)} footer={
          <>
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" disabled={busy} onClick={async () => { const { id, createdAt, updatedAt, ...data } = editing as User; void createdAt; void updatedAt; const ok = await run(() => saveUser(id ?? null, data), 'Saved'); if (ok !== undefined) setEditing(null); }}>Save</button>
          </>
        }>
          <div className="form-grid">
            <Field label="Full name" required help={editing.id ? undefined : 'Search the organization directory to fill in the details.'}>
              {editing.id ? (
                <input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              ) : (
                <PersonNameInput
                  value={editing.name ?? ''}
                  ariaLabel="Full name"
                  onChange={(name) => setEditing({ ...editing, name })}
                  onUnpick={() => setEditing((x) => x && { ...x, email: '' })}
                  onPick={(person) => {
                    const existing = db.users.find((u) => u.email.toLowerCase() === person.email.toLowerCase());
                    if (existing) toast(`${existing.name} already has a PPM profile. Opening it.`);
                    setEditing(existing ? { ...existing } : { ...editing, name: person.name, email: person.email, title: person.title ?? editing.title, external: person.external, roles: person.external ? ['EXTERNAL'] : editing.roles });
                  }}
                />
              )}
            </Field>
            <Field label="Email (Entra ID UPN)" required><input value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
            <Field label="Job title"><input value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="Pillar"><select value={editing.pillar ?? ''} onChange={(e) => setEditing({ ...editing, pillar: e.target.value })}><option value="">—</option>{db.config.masterData.pillars.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Roles" full>
              <div className="multi">
                {ROLES.map((r) => (
                  <label key={r}><input type="checkbox" checked={!!editing.roles?.includes(r)} onChange={(e) => setEditing({ ...editing, roles: e.target.checked ? [...(editing.roles ?? []), r] : (editing.roles ?? []).filter((x) => x !== r) })} />{ROLE_LABELS[r]}</label>
                ))}
              </div>
            </Field>
            <Field label="Options" full>
              <div className="row" style={{ gap: 18 }}>
                <label className="check"><input type="checkbox" checked={!!editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Active</label>
                <label className="check"><input type="checkbox" checked={!!editing.external} onChange={(e) => setEditing({ ...editing, external: e.target.checked })} /> External / non-{BRAND.company}</label>
                <label className="check"><input type="checkbox" checked={!!editing.notifyEmail} onChange={(e) => setEditing({ ...editing, notifyEmail: e.target.checked })} /> Email notifications</label>
                <label className="check"><input type="checkbox" checked={!!editing.notifyTeams} onChange={(e) => setEditing({ ...editing, notifyTeams: e.target.checked })} /> Teams notifications</label>
              </div>
            </Field>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function useConfigEditor() {
  const [cfg, setCfg] = useState<AppConfig>(() => structuredClone(db.config));
  const { run, busy } = useAction();
  const save = () => run(() => saveConfig(cfg), 'Configuration saved');
  return { cfg, setCfg, save, busy };
}

function WorkflowTab() {
  const { cfg, setCfg, save, busy } = useConfigEditor();
  const approverRoles: Role[] = ['PMO_DIRECTOR', 'PMO_ADMIN', 'PILLAR_LEAD', 'ARCHITECT', 'FINANCE', 'EXEC'];
  const contexts = [...GATES.map((g) => ({ key: g.key as string, label: g.name })), ...TRANSITIONS.map((t) => ({ key: t.key as string, label: t.label }))];
  return (
    <div className="stack">
      <Card title="Gate approval authorities" meta="SEC-FR-009 – who may decide each gate (segregation of duties is always enforced)" flush>
        <table className="t">
          <thead><tr><th>Gate</th>{approverRoles.map((r) => <th key={r}>{ROLE_SHORT[r]}</th>)}</tr></thead>
          <tbody>
            {GATES.map((g) => (
              <tr key={g.key}>
                <td>{g.name}<div className="small muted">{g.authority}</div></td>
                {approverRoles.map((r) => (
                  <td key={r}><input type="checkbox" aria-label={`${g.name} ${r}`} checked={cfg.gateApprovers[g.key as GateKey].includes(r)} onChange={(e) => setCfg({ ...cfg, gateApprovers: { ...cfg.gateApprovers, [g.key]: e.target.checked ? [...cfg.gateApprovers[g.key as GateKey], r] : cfg.gateApprovers[g.key as GateKey].filter((x) => x !== r) } })} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Required artifact checklist by gate" meta="OD-006 / ART-FR-004 – missing items block advancement unless an exception is approved" flush>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Check</th>{contexts.map((c) => <th key={c.key} title={c.label}>{c.key.replace('START_EXECUTE', 'EXEC').replace('GO_LIVE', 'LIVE')}</th>)}</tr></thead>
            <tbody>
              {CHECKS.map((ch) => (
                <tr key={ch.id}>
                  <td>{ch.label}</td>
                  {contexts.map((c) => (
                    <td key={c.key}><input type="checkbox" aria-label={`${c.label} ${ch.label}`} checked={(cfg.gateChecks[c.key] || []).includes(ch.id)} onChange={(e) => setCfg({ ...cfg, gateChecks: { ...cfg.gateChecks, [c.key]: e.target.checked ? [...(cfg.gateChecks[c.key] || []), ch.id] : (cfg.gateChecks[c.key] || []).filter((x) => x !== ch.id) } })} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy} onClick={save}>Save workflow configuration</button></div>
    </div>
  );
}

function MasterTab() {
  const { cfg, setCfg, save, busy } = useConfigEditor();
  const lists: [keyof AppConfig['masterData'], string][] = [
    ['businessAreas', 'Business areas'], ['businessFunctions', 'Business functions'], ['corporatePriorities', 'Corporate priorities'], ['benefitTypes', 'Benefit types'],
    ['roadmapOptions', 'IT roadmap options'], ['pillars', 'IT pillars'], ['programs', 'Programs'], ['applications', 'Applications'], ['categories', 'Labor categories'],
    ['specialties', 'Specialties'], ['spendCategories', 'Spend categories'], ['hoursBuckets', 'Est. hours buckets (ROM)'],
  ];
  return (
    <div className="stack">
      <Notice>One value per line. Values are stored as text on Dataverse rows, so administrators can evolve lists without a solution deployment (OD-009).</Notice>
      <div className="grid g3">
        {lists.map(([k, label]) => (
          <Card key={k} title={label}>
            <textarea className="input" style={{ minHeight: 160 }} value={cfg.masterData[k].join('\n')} onChange={(e) => setCfg({ ...cfg, masterData: { ...cfg.masterData, [k]: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } })} aria-label={label} />
          </Card>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy} onClick={save}>Save master data</button></div>
    </div>
  );
}

function SettingsTab() {
  const { cfg, setCfg, save, busy } = useConfigEditor();
  const num = (k: keyof AppConfig, label: string, help?: string) => (
    <Field label={label} help={help}><input type="number" value={cfg[k] as number} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) })} /></Field>
  );
  return (
    <Card title="Thresholds & policies">
      <div className="form-grid">
        {num('budgetTolerancePct', 'Budget tolerance (%)', 'Forecast over budget beyond this is Red (default 2%).')}
        {num('scheduleYellowDays', 'Schedule Yellow threshold (days late)', 'OD-004')}
        {num('scheduleRedDays', 'Schedule Red threshold (days late)', 'OD-004')}
        {num('resourceGapRedDays', 'Resource gap Red window (days)', 'OD-005 – gaps starting within this window are Red.')}
        {num('externalAccessMaxDays', 'Maximum external access duration (days)', 'OD-011')}
        {num('expiryWarningDays', 'External access expiry warning (days)', 'NOT-FR-008')}
        {num('accessReviewIntervalDays', 'Access recertification interval (days)', 'GOV-FR-009 / EXT-FR-010')}
        <Field label="Internal email domains" help={`Comma separated. Other domains are treated as non-${BRAND.company}.`}><input value={cfg.internalDomains.join(', ')} onChange={(e) => setCfg({ ...cfg, internalDomains: e.target.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) })} /></Field>
        <Field label="Power BI report URL" help="Optional link shown on the portfolio dashboard (INT-FR-002)." full><input value={cfg.powerBiReportUrl} onChange={(e) => setCfg({ ...cfg, powerBiReportUrl: e.target.value })} placeholder="https://app.powerbi.com/…" /></Field>
        <Field label="Stages requiring weekly status" full help="STAT-FR-001 – status is optional in Initiate.">
          <div className="multi">
            {STAGES.map((s) => <label key={s}><input type="checkbox" checked={cfg.statusRequiredStages.includes(s)} onChange={(e) => setCfg({ ...cfg, statusRequiredStages: e.target.checked ? [...cfg.statusRequiredStages, s] : cfg.statusRequiredStages.filter((x: Stage) => x !== s) })} />{s}</label>)}
          </div>
        </Field>
      </div>
      <div className="row mt" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy} onClick={save}>Save settings</button></div>
    </Card>
  );
}

function AccessReviewTab() {
  const me = useMe();
  const { run } = useAction();
  const grants = db.accessGrants.filter((g) => g.status === 'Active');
  const nda = db.projects.filter((p) => p.ndaActive && ndaList(p).length && (isPmoDirector(me) || ndaList(p).some((a) => a.userId === me.id)));
  return (
    <div className="stack">
      <Card title="Active external access" meta="EXT-FR-009/010 – recertify or revoke" flush>
        {grants.length === 0 ? <Empty>No active external access.</Empty> : (
          <table className="t">
            <thead><tr><th>Project</th><th>Grantee</th><th>Scope</th><th>Expires</th><th>Last recertified</th><th /></tr></thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id}>
                  <td className="nowrap">{projectById(g.projectId)?.code}</td>
                  <td>{g.name}<div className="small muted">{g.email}</div></td>
                  <td>{g.permission} · {g.scope === 'workspace' ? 'Workspace' : g.artifactKeys.join(', ')}</td>
                  <td>{fmtDate(g.expiresAt)}</td>
                  <td>{fmtDate(g.lastRecertifiedAt)}</td>
                  <td className="right nowrap">
                    <button className="btn sm" onClick={() => run(() => recertifyGrant(g), 'Recertified')}>Recertify</button>{' '}
                    <button className="btn sm danger" onClick={async () => { const r = await ask({ title: 'Revoke access', label: 'Reason', required: true }); if (r) await run(() => revokeGrant(g, r), 'Access revoked'); }}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="NDA access lists" meta="Visible only to the PMO Director and access-list members" flush>
        {nda.length === 0 ? <Empty>No NDA projects visible to you.</Empty> : (
          <table className="t">
            <thead><tr><th>Project</th><th>Members</th><th>Last review</th><th /></tr></thead>
            <tbody>
              {nda.map((p) => (
                <tr key={p.id}>
                  <td><b className="num">{p.code}</b> {p.ndaCodename}</td>
                  <td className="small">{ndaList(p).map((a) => userName(a.userId)).join(', ')}</td>
                  <td>{fmtDate(p.ndaLastReviewedAt)}</td>
                  <td className="right"><button className="btn sm" onClick={() => run(() => recertifyNda(p), 'Access list recertified')}>Recertify list</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function DataTab() {
  const me = useMe();
  const { run, busy } = useAction();
  const [log, setLog] = useState<string[] | null>(null);
  const [csv, setCsv] = useState('wbs,period,amount,category,docref\nZB-001-01,2026-09,42000,Expense,5100099');
  const recentNotes = [...db.notifications].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 40);
  const demo = db.projects.filter((p) => p.demo);
  return (
    <div className="stack">
      <div className="grid g2">
        <Card title="Reminders & expiry sweep" meta="NOT-FR-003/005/008 · EXT-FR-005">
          <p className="muted">Sends overdue status / monthly forecast reminders, upcoming Go/No-Go / CAB / go-live alerts, resource-gap alerts, NDA access-review reminders, and expires lapsed external access. In production a scheduled Power Automate flow runs the same sweep daily.</p>
          <button className="btn primary mt" disabled={busy || !(isPmo(me) || isAdmin(me))} onClick={async () => setLog((await run(() => runSweep(), 'Sweep complete')) ?? null)}>Run now</button>
          {log && <ul className="small mt">{log.length ? log.map((l, i) => <li key={i}>{l}</li>) : <li>Nothing due.</li>}</ul>}
        </Card>
        <Card title="Import SAP financial actuals" meta="FIN-FR-004 · SAP remains the system of record">
          <textarea className="input" style={{ minHeight: 110, fontFamily: 'Consolas, monospace', fontSize: 12 }} value={csv} onChange={(e) => setCsv(e.target.value)} aria-label="Actuals CSV" />
          <div className="row mt">
            <button className="btn primary" disabled={busy} onClick={async () => { const r = await run(() => importActuals(csv)); if (r) toast(`${r.ok} row(s) imported${r.errors.length ? `; ${r.errors.length} rejected:\n${r.errors.slice(0, 5).join('\n')}` : ''}`, r.errors.length ? 'error' : 'info'); }}>Import</button>
            <span className="small muted">Columns: wbs or project, period (YYYY-MM), amount, category, docref</span>
          </div>
        </Card>
      </div>
      <Card title="Notification delivery queue" meta="NOT-FR-006 · Power Automate sends email/Teams for each row" flush>
        <table className="t">
          <thead><tr><th>Sent</th><th>Recipient</th><th>Title</th><th>Channels</th><th>Read</th></tr></thead>
          <tbody>
            {recentNotes.map((n) => (
              <tr key={n.id}><td className="nowrap small">{fmtDateTime(n.sentAt)}</td><td>{userName(n.userId)}</td><td>{n.title}</td><td>{n.channels.join(', ') || 'in-app'}</td><td>{n.read ? '✓' : ''}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Sample data">
        {dataMode() === 'mock' ? (
          <>
            <p className="muted">This preview stores sample data in your browser.</p>
            <button className="btn danger mt" onClick={async () => { if (await confirmAsk('Reset sample data', 'Discard local changes and reload the original sample data?', 'Reset', true)) { await resetBackend(); location.reload(); } }}>Reset sample data</button>
          </>
        ) : (
          <>
            <p className="muted">{demo.length} sample project(s) are flagged as sample data. Removing them deletes each project and, through the parental relationship, all of its artifact rows. Audit events are retained.</p>
            <button className="btn danger mt" disabled={!isAdmin(me) || !demo.length} onClick={async () => {
              if (!(await confirmAsk('Remove sample projects', `Permanently delete ${demo.length} sample projects and their artifacts from Dataverse?`, 'Delete sample projects', true))) return;
              await run(async () => {
                for (const p of demo) await remove('projects', p.id);
                await audit({ action: 'SAMPLE_DATA_REMOVED', entity: 'IT Project', details: `${demo.length} sample project(s) deleted` });
              });
              location.reload();
            }}>Remove sample projects</button>
          </>
        )}
      </Card>
    </div>
  );
}

function PlatformTab() {
  return (
    <div className="stack">
      <Card title={`Dataverse solution: ${SOLUTION.uniqueName}`} meta={`${ENTITIES.length} tables · data mode: ${dataMode()}`} flush>
        <table className="t">
          <thead><tr><th>Table</th><th>Logical name</th><th>Purpose</th><th className="num">Rows loaded</th></tr></thead>
          <tbody>
            {ENTITIES.map((e) => (
              <tr key={e.table}><td>{e.display}</td><td><code>{e.table}</code></td><td className="small">{e.description}</td><td className="num">{(db as any)[e.name]?.length ?? 0}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Integrations">
        <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
          <li><b>Power BI</b> (INT-FR-002): connect Power BI to the ITProject Dataverse tables; set the report link under Settings.</li>
          <li><b>Email &amp; Teams</b> (INT-FR-006): a Power Automate flow on <code>{TABLE_PREFIX}notification</code> (row added) sends to the channels listed on each row.</li>
          <li><b>SAP actuals</b> (INT-FR-005): import CSV extracts here, or schedule a dataflow into <code>{TABLE_PREFIX}financialactual</code>.</li>
          <li><b>ServiceNow / Jira</b> (INT-FR-003/004): change numbers and Jira keys are captured on the project record for traceability.</li>
          <li><b>SharePoint</b> (INT-FR-001): artifacts are native Dataverse records; enable SharePoint document management on <code>{TABLE_PREFIX}itproject</code> if file libraries are also required.</li>
        </ul>
      </Card>
    </div>
  );
}
