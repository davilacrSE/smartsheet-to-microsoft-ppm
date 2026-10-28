import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import type { Rec, Resource, Scenario } from '../domain/types';
import { fmtDate, monthLabel, todayISO, ym } from '../domain/calc';
import { db, projectById, userName } from '../data/store';
import { canSeeProject, hasRole, isAdmin, isPmo } from '../services/rules';
import { capacityMatrix, compareScenario, resourceUtilization, type TeamRow } from '../services/rcp';
import { cancelDemand, confirmNomination, deleteScenario, escalateDemand, markGap, nominate, rejectNomination, saveResource, saveScenario, saveTeam } from '../services/workflow';
import { Card, Empty, Field, Modal, NdaBadge, ask, confirmAsk, useAction, useMe, useStore } from '../components/ui';
import { PeoplePicker } from '../components/PeoplePicker';
import { CapacityHeatmap } from '../components/charts';

const TABS = [
  ['capacity', 'Capacity'],
  ['nominations', 'Demand & nominations'],
  ['people', 'People'],
  ['scenarios', 'Scenarios'],
  ['teams', 'Teams'],
] as const;

/** §10 Resource Capacity Planning module (RCP-FR-001). */
export function Resources() {
  useStore();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'capacity';
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Resource capacity planning</h1>
          <p className="sub">Demand vs. capacity by team and named resource; nominations, gaps and what-if scenarios.</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setParams({ tab: k })}>{label}</button>
        ))}
      </div>
      {tab === 'capacity' && <CapacityTab />}
      {tab === 'nominations' && <NominationsTab />}
      {tab === 'people' && <PeopleTab />}
      {tab === 'scenarios' && <ScenariosTab />}
      {tab === 'teams' && <TeamsTab />}
    </>
  );
}

function CapacityTab() {
  const me = useMe();
  const nav = useNavigate();
  const [from, setFrom] = useState(ym(todayISO()));
  const [months, setMonths] = useState(12);
  const [includeProposed, setIncludeProposed] = useState(true);
  const [pillar, setPillar] = useState('');
  const [cell, setCell] = useState<{ team: TeamRow; month: string } | null>(null);
  const cap = capacityMatrix(me, { from, months, includeProposed, pillar: pillar || undefined });
  const over = cap.teams.flatMap((t) => cap.months.filter((m) => (t.demand[m] || 0) > (t.capacity[m] || 0)).map((m) => `${t.name} (${monthLabel(m)})`));
  const lines = cell
    ? db.demands.filter((d) => d.teamId === cell.team.id && cap.projects.some((p) => p.id === d.projectId) && d.status !== 'Cancelled' && d.startDate.slice(0, 7) <= cell.month && d.endDate.slice(0, 7) >= cell.month)
    : [];
  return (
    <div className="stack">
      <div className="row">
        <Field label="From"><input type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Horizon"><select value={months} onChange={(e) => setMonths(Number(e.target.value))}><option value={6}>6 months</option><option value={12}>12 months</option><option value={18}>18 months</option></select></Field>
        <Field label="Pillar"><select value={pillar} onChange={(e) => setPillar(e.target.value)}><option value="">All pillars</option>{db.config.masterData.pillars.map((p) => <option key={p}>{p}</option>)}</select></Field>
        <label className="check" style={{ marginTop: 18 }}><input type="checkbox" checked={includeProposed} onChange={(e) => setIncludeProposed(e.target.checked)} /> Include proposed projects (Draft → ACT Readiness)</label>
      </div>
      <Card title="Team utilization" meta={includeProposed ? 'Approved + proposed demand' : 'Approved (ACT) demand only'}>
        <CapacityHeatmap months={cap.months} teams={cap.teams} onCell={(team, month) => setCell({ team, month })} />
        <p className="small muted mt">Monthly capacity = weekly hours ÷ 5 × workdays × project utilization %, prorated for each resource's active dates (RCP-FR-007). Select a cell to see the demand behind it.</p>
      </Card>
      {over.length > 0 && <div className="notice warn"><span>Over capacity: {over.slice(0, 8).join(', ')}{over.length > 8 ? ` and ${over.length - 8} more` : ''}. Use Scenarios to test start shifts or added capacity.</span></div>}
      {cell && (
        <Card title={`${cell.team.name} · ${monthLabel(cell.month)}`} meta={`Capacity ${Math.round(cell.team.capacity[cell.month] || 0)} h · demand ${Math.round(cell.team.demand[cell.month] || 0)} h`} actions={<button className="btn sm" onClick={() => setCell(null)}>Close</button>} flush>
          <table className="t">
            <thead><tr><th>Project</th><th>Role</th><th className="num">Hours (total)</th><th>Window</th><th>Status</th><th>Named resource</th></tr></thead>
            <tbody>
              {lines.map((d) => {
                const p = projectById(d.projectId)!;
                return (
                  <tr key={d.id} className="click" onClick={() => nav(`/projects/${p.code}/resources`)}>
                    <td><b className="num">{p.code}</b> {p.name} <NdaBadge p={p} /></td>
                    <td>{d.placeholder}</td>
                    <td className="num">{d.hours}</td>
                    <td className="nowrap">{fmtDate(d.startDate)} – {fmtDate(d.endDate)}</td>
                    <td><DemandStatus d={d} /></td>
                    <td>{db.resources.find((r) => r.id === d.nominatedResourceId)?.name ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export function DemandStatus({ d }: { d: Rec }) {
  const tone: Record<string, string> = { Requested: 'blue', Nominated: 'warn', Confirmed: 'good', Rejected: 'crit', Gap: 'crit', Cancelled: '' };
  return <span className={`pill ${tone[d.status] ?? ''}`}>{d.status}{d.escalated ? ' · escalated' : ''}</span>;
}

export function DemandActions({ d }: { d: Rec }) {
  const me = useMe();
  const { run } = useAction();
  const [nom, setNom] = useState(false);
  const p = projectById(d.projectId)!;
  const isRtm = db.teams.find((t) => t.id === d.teamId)?.managerId === me.id || isPmo(me);
  const isPm = me.id === p.pmId || isPmo(me);
  return (
    <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
      {isRtm && ['Requested', 'Rejected', 'Gap'].includes(d.status) && <button className="btn sm" onClick={() => setNom(true)}>Nominate</button>}
      {isPm && d.status === 'Nominated' && (
        <>
          <button className="btn primary sm" onClick={() => run(() => confirmNomination(d), 'Confirmed')}>Confirm</button>
          <button className="btn sm" onClick={async () => { const r = await ask({ title: 'Reject nomination', label: 'Reason', required: true }); if (r) await run(() => rejectNomination(d, r)); }}>Reject</button>
        </>
      )}
      {d.status === 'Gap' && !d.escalated && (isPm || isRtm) && <button className="btn sm danger" onClick={() => run(() => escalateDemand(d), 'Escalated to PMO and pillar leads')}>Escalate</button>}
      {isPm && !['Cancelled', 'Confirmed'].includes(d.status) && <button className="btn sm ghost" onClick={async () => (await confirmAsk('Cancel demand', `Cancel "${d.placeholder}"?`, 'Cancel demand', true)) && run(() => cancelDemand(d))}>Cancel</button>}
      {nom && <NominateModal demand={d} onClose={() => setNom(false)} />}
    </span>
  );
}

export function NominateModal({ demand: d, onClose }: { demand: Rec; onClose: () => void }) {
  const { run, busy } = useAction();
  const me = useMe();
  const team = db.teams.find((t) => t.id === d.teamId);
  const candidates = db.resources.filter((r) => r.active && db.assignments.some((a) => a.resourceId === r.id && a.teamId === d.teamId));
  const util = useMemo(() => resourceUtilization(me, (d.startDate || todayISO()).slice(0, 7), 3), [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [resourceId, setResourceId] = useState(candidates[0]?.id ?? '');
  const [hours, setHours] = useState<number>(Number(d.hours));
  const [note, setNote] = useState('');
  return (
    <Modal title={`Nominate – ${d.placeholder}`} onClose={onClose} footer={
      <>
        <button className="btn danger" disabled={busy} onClick={async () => { const ok = await run(() => markGap(d, note || 'No available capacity'), 'Capacity gap recorded'); if (ok !== undefined) onClose(); }}>Declare capacity gap</button>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !resourceId || !(hours > 0)} onClick={async () => { const ok = await run(() => nominate(d, resourceId, hours, note), 'Nominated – PM notified'); if (ok !== undefined) onClose(); }}>Nominate</button>
      </>
    }>
      <div className="stack">
        <p className="muted">{team?.name} · {d.hours} hrs · {fmtDate(d.startDate)} – {fmtDate(d.endDate)}</p>
        <table className="t">
          <thead><tr><th /><th>Resource</th><th>Type</th>{util[0]?.months.map((m) => <th key={m} className="num">{monthLabel(m)} load</th>)}</tr></thead>
          <tbody>
            {candidates.map((r) => {
              const u = util.find((x) => x.resource.id === r.id)!;
              return (
                <tr key={r.id} className="click" onClick={() => setResourceId(r.id)}>
                  <td><input type="radio" checked={resourceId === r.id} onChange={() => setResourceId(r.id)} aria-label={r.name} /></td>
                  <td>{r.name}<div className="small muted">{r.specialty}</div></td>
                  <td>{r.resourceType}</td>
                  {u.months.map((m) => <td key={m} className="num">{u.cap[m] ? `${Math.round(((u.load[m] || 0) / u.cap[m]) * 100)}%` : '—'}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
        {candidates.length === 0 && <div className="notice warn">No active resources are assigned to this team.</div>}
        <div className="form-grid">
          <Field label="Hours to fulfil" help="Fewer than requested = partial fulfillment; the remainder is re-requested on confirmation."><input type="number" min={1} max={d.hours} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></Field>
          <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function NominationsTab() {
  const me = useMe();
  const nav = useNavigate();
  const [status, setStatus] = useState('open');
  const [team, setTeam] = useState('');
  const lines = db.demands
    .filter((d) => {
      const p = projectById(d.projectId);
      return p && canSeeProject(me, p) && p.stage !== 'Archive' && (!team || d.teamId === team) && (status === 'all' || (status === 'open' ? ['Requested', 'Nominated', 'Rejected', 'Gap'].includes(d.status) : d.status === status));
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    <Card title="Resource demand" meta={`${lines.length} line(s)`} flush>
      <div className="toolbar">
        <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="open">Open (requested, nominated, rejected, gap)</option>
          <option value="all">All</option>
          {['Requested', 'Nominated', 'Confirmed', 'Rejected', 'Gap', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team"><option value="">All teams</option>{db.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </div>
      {lines.length === 0 ? <Empty>No demand lines.</Empty> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Project</th><th>Role / placeholder</th><th>Team</th><th>Type</th><th className="num">Hours</th><th>Window</th><th>Status</th><th>Named resource</th><th /></tr></thead>
            <tbody>
              {lines.map((d) => {
                const p = projectById(d.projectId)!;
                return (
                  <tr key={d.id}>
                    <td className="click" onClick={() => nav(`/projects/${p.code}/resources`)}><b className="num">{p.code}</b> {p.name} <NdaBadge p={p} /></td>
                    <td>{d.placeholder}<div className="small muted">{d.specialty}</div></td>
                    <td>{db.teams.find((t) => t.id === d.teamId)?.name}</td>
                    <td>{d.resourceType}</td>
                    <td className="num">{d.hours}</td>
                    <td className="nowrap">{fmtDate(d.startDate)} – {fmtDate(d.endDate)}</td>
                    <td><DemandStatus d={d} /></td>
                    <td>{db.resources.find((r) => r.id === d.nominatedResourceId)?.name ?? '—'}</td>
                    <td className="right"><DemandActions d={d} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function PeopleTab() {
  const me = useMe();
  const [editing, setEditing] = useState<Resource | 'new' | null>(null);
  const util = resourceUtilization(me, ym(todayISO()), 6);
  const canEdit = isAdmin(me) || isPmo(me) || hasRole(me, 'RTM');
  return (
    <Card title="Named resources" meta="Capacity across teams vs. nominated/confirmed project load" actions={canEdit && <button className="btn primary sm" onClick={() => setEditing('new')}><Plus size={14} /> Add resource</button>} flush>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Resource</th><th>Type</th><th>Teams</th><th>Status</th>{util[0]?.months.map((m) => <th key={m} className="num">{monthLabel(m)}</th>)}</tr></thead>
          <tbody>
            {util.map((u) => (
              <tr key={u.resource.id} className={canEdit ? 'click' : ''} onClick={() => canEdit && setEditing(u.resource)}>
                <td>{u.resource.name}<div className="small muted">{u.resource.specialty}{u.resource.organization ? ` · ${u.resource.organization}` : ''}</div></td>
                <td>{u.resource.resourceType}</td>
                <td className="small">{u.teams.join(', ')}</td>
                <td>{u.resource.active ? <span className="pill good">Active</span> : <span className="pill">Inactive</span>}</td>
                {u.months.map((m) => {
                  const pct = u.cap[m] ? Math.round(((u.load[m] || 0) / u.cap[m]) * 100) : null;
                  return <td key={m} className="num" title={`${Math.round(u.load[m] || 0)} h of ${Math.round(u.cap[m] || 0)} h`}>{pct === null ? '—' : <span className={pct > 100 ? 'pill crit' : ''}>{pct}%</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <ResourceModal resource={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function ResourceModal({ resource, onClose }: { resource?: Resource; onClose: () => void }) {
  const { run, busy } = useAction();
  const [v, setV] = useState<Partial<Resource>>(resource ?? { resourceType: 'Internal', active: true, specialty: db.config.masterData.specialties[0] });
  const [assigns, setAssigns] = useState(db.assignments.filter((a) => a.resourceId === resource?.id).map((a) => ({ teamId: a.teamId, weeklyHours: a.weeklyHours, utilizationPct: a.utilizationPct })));
  const set = (k: keyof Resource, val: unknown) => setV((x) => ({ ...x, [k]: val }));
  return (
    <Modal title={resource ? `Edit ${resource.name}` : 'Add resource'} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={async () => { const ok = await run(() => saveResource(resource?.id ?? null, v, assigns), 'Saved'); if (ok !== undefined) onClose(); }}>Save</button>
      </>
    }>
      <div className="form-grid">
        <Field label="Name" required><input value={v.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Email"><input value={v.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Resource type" required><select value={v.resourceType} onChange={(e) => set('resourceType', e.target.value)}><option>Internal</option><option>External</option><option>Staff Augmentation</option></select></Field>
        <Field label="Specialty"><select value={v.specialty} onChange={(e) => set('specialty', e.target.value)}>{db.config.masterData.specialties.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Organization (if external)"><input value={v.organization ?? ''} onChange={(e) => set('organization', e.target.value)} /></Field>
        <Field label="Status"><label className="check"><input type="checkbox" checked={!!v.active} onChange={(e) => set('active', e.target.checked)} /> Active</label></Field>
        <Field label="Work start date"><input type="date" value={v.startDate ?? ''} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Work end date"><input type="date" value={v.endDate ?? ''} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <div className="form-section">Team duties (RCP-FR-006)</div>
        <div className="full stack">
          {assigns.map((a, i) => (
            <div key={i} className="row">
              <select className="input" style={{ flex: 2 }} value={a.teamId} onChange={(e) => setAssigns(assigns.map((x, j) => (j === i ? { ...x, teamId: e.target.value } : x)))} aria-label="Team">{db.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <input className="input" style={{ width: 110 }} type="number" value={a.weeklyHours} onChange={(e) => setAssigns(assigns.map((x, j) => (j === i ? { ...x, weeklyHours: Number(e.target.value) } : x)))} aria-label="Weekly hours" title="Weekly work hours" />
              <span className="small muted">h/wk at</span>
              <input className="input" style={{ width: 90 }} type="number" value={a.utilizationPct} onChange={(e) => setAssigns(assigns.map((x, j) => (j === i ? { ...x, utilizationPct: Number(e.target.value) } : x)))} aria-label="Utilization percent" />
              <span className="small muted">% on projects</span>
              <button className="icon-btn" onClick={() => setAssigns(assigns.filter((_, j) => j !== i))} aria-label="Remove team"><Trash2 size={14} /></button>
            </div>
          ))}
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAssigns([...assigns, { teamId: db.teams[0].id, weeklyHours: 40, utilizationPct: 80 }])}><Plus size={14} /> Add team</button>
        </div>
      </div>
    </Modal>
  );
}

function ScenariosTab() {
  const me = useMe();
  const { run } = useAction();
  const [selected, setSelected] = useState<string>(db.scenarios[0]?.id ?? '');
  const [editing, setEditing] = useState<Scenario | 'new' | null>(null);
  const s = db.scenarios.find((x) => x.id === selected);
  const from = ym(todayISO());
  const cmp = s ? compareScenario(me, s, from, 12) : null;
  return (
    <div className="grid" style={{ gridTemplateColumns: '300px 1fr' }}>
      <Card title="Saved scenarios" actions={<button className="btn primary sm" onClick={() => setEditing('new')}><Plus size={14} /> New</button>} flush>
        {db.scenarios.length === 0 ? <Empty>No scenarios yet.</Empty> : db.scenarios.map((x) => (
          <div key={x.id} className="note" style={{ gridTemplateColumns: '1fr', background: x.id === selected ? 'var(--blue-wash)' : undefined }} onClick={() => setSelected(x.id)}>
            <div>
              <b>{x.name}</b>
              <div className="small muted">{x.description}</div>
              <div className="small muted">{userName(x.createdById)} · {x.includeProposed ? 'incl. proposed' : 'approved only'}</div>
            </div>
          </div>
        ))}
      </Card>
      {s && cmp ? (
        <Card title={s.name} meta="Compared with the official plan (approved projects, current dates and capacity)" actions={
          <>
            <button className="btn sm" onClick={() => setEditing(s)}>Edit</button>
            <button className="btn sm danger" onClick={async () => (await confirmAsk('Discard scenario', `Discard "${s.name}"? The official plan is not affected.`, 'Discard', true)) && run(() => deleteScenario(s.id), 'Scenario discarded')}>Discard</button>
          </>
        }>
          <div className="row small mb">
            {Object.entries(s.shifts).map(([pid, m]) => <span key={pid} className="pill blue">{projectById(pid)?.code ?? 'hidden project'} start {m > 0 ? '+' : ''}{m} mo</span>)}
            {Object.entries(s.capacityAdjust).map(([tid, pct]) => <span key={tid} className="pill good">{db.teams.find((t) => t.id === tid)?.name} capacity {pct > 0 ? '+' : ''}{pct}%</span>)}
            {s.excluded.map((pid) => <span key={pid} className="pill">{projectById(pid)?.code} excluded</span>)}
          </div>
          <CapacityHeatmap months={cmp.scenario.months} teams={cmp.scenario.teams} compare={cmp.baseline.teams} />
          <p className="small muted mt">▲/▼ show the change in utilization points versus the official plan. Scenarios never modify project dates or capacity (RCP-FR-012).</p>
        </Card>
      ) : <Card title="Scenario"><Empty>Select or create a scenario.</Empty></Card>}
      {editing && <ScenarioModal scenario={editing === 'new' ? undefined : editing} onClose={(id) => { setEditing(null); if (id) setSelected(id); }} />}
    </div>
  );
}

function ScenarioModal({ scenario, onClose }: { scenario?: Scenario; onClose: (id?: string) => void }) {
  const me = useMe();
  const { run, busy } = useAction();
  const [v, setV] = useState<Omit<Scenario, 'id' | 'createdById' | 'createdAt' | 'updatedAt'>>(scenario ? { name: scenario.name, description: scenario.description, includeProposed: scenario.includeProposed, shifts: { ...scenario.shifts }, capacityAdjust: { ...scenario.capacityAdjust }, excluded: [...scenario.excluded] } : { name: '', description: '', includeProposed: true, shifts: {}, capacityAdjust: {}, excluded: [] });
  const projects = db.projects.filter((p) => canSeeProject(me, p) && !['Archive', 'Close'].includes(p.stage) && db.demands.some((d) => d.projectId === p.id));
  return (
    <Modal size="lg" title={scenario ? 'Edit scenario' : 'New capacity scenario'} onClose={() => onClose()} footer={
      <>
        <button className="btn" onClick={() => onClose()}>Cancel</button>
        <button className="btn primary" disabled={busy || !v.name.trim()} onClick={async () => { await run(() => saveScenario(scenario?.id ?? null, v), 'Scenario saved'); onClose(scenario?.id ?? db.scenarios[db.scenarios.length - 1]?.id); }}>Save scenario</button>
      </>
    }>
      <div className="form-grid">
        <Field label="Name" required><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Scope"><label className="check" style={{ paddingTop: 8 }}><input type="checkbox" checked={v.includeProposed} onChange={(e) => setV({ ...v, includeProposed: e.target.checked })} /> Approved + proposed projects</label></Field>
        <Field label="Description" full><input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        <div className="form-section">Project start shifts / exclusions</div>
        <div className="full table-wrap" style={{ maxHeight: 260 }}>
          <table className="t">
            <thead><tr><th>Project</th><th>Stage</th><th>Shift (months)</th><th>Exclude</th></tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td><b className="num">{p.code}</b> {p.name}</td>
                  <td>{p.stage}</td>
                  <td><input className="cell" type="number" min={-12} max={24} value={v.shifts[p.id] ?? 0} onChange={(e) => setV({ ...v, shifts: { ...v.shifts, [p.id]: Number(e.target.value) } })} aria-label={`Shift ${p.code}`} /></td>
                  <td><input type="checkbox" checked={v.excluded.includes(p.id)} onChange={(e) => setV({ ...v, excluded: e.target.checked ? [...v.excluded, p.id] : v.excluded.filter((x) => x !== p.id) })} aria-label={`Exclude ${p.code}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="form-section">Capacity changes (% per team)</div>
        <div className="full grid g3">
          {db.teams.map((t) => (
            <Field key={t.id} label={t.name}><input type="number" value={v.capacityAdjust[t.id] ?? 0} onChange={(e) => setV({ ...v, capacityAdjust: { ...v.capacityAdjust, [t.id]: Number(e.target.value) } })} /></Field>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function TeamsTab() {
  const me = useMe();
  const [editing, setEditing] = useState<{ id?: string; name: string; pillar: string; managerId: string } | null>(null);
  const { run } = useAction();
  const canEdit = isAdmin(me) || isPmo(me);
  return (
    <Card title="Resource teams" actions={canEdit && <button className="btn primary sm" onClick={() => setEditing({ name: '', pillar: db.config.masterData.pillars[0], managerId: '' })}><Plus size={14} /> Add team</button>} flush>
      <table className="t">
        <thead><tr><th>Team</th><th>Pillar</th><th>Resource Team Manager</th><th className="num">Resources</th></tr></thead>
        <tbody>
          {db.teams.map((t) => (
            <tr key={t.id} className={canEdit ? 'click' : ''} onClick={() => canEdit && setEditing({ ...t })}>
              <td>{t.name}</td>
              <td>{t.pillar}</td>
              <td>{userName(t.managerId)}</td>
              <td className="num">{db.assignments.filter((a) => a.teamId === t.id).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <Modal title={editing.id ? 'Edit team' : 'Add team'} onClose={() => setEditing(null)} footer={
          <>
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" onClick={async () => { const ok = await run(() => saveTeam(editing.id ?? null, editing), 'Saved'); if (ok !== undefined) setEditing(null); }}>Save</button>
          </>
        }>
          <div className="form-grid">
            <Field label="Team name" required full><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Pillar"><select value={editing.pillar} onChange={(e) => setEditing({ ...editing, pillar: e.target.value })}>{db.config.masterData.pillars.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Resource Team Manager" required><PeoplePicker value={editing.managerId} roles={['RTM']} allowEmpty={false} ariaLabel="Resource Team Manager" onChange={(id) => setEditing({ ...editing, managerId: id })} /></Field>
          </div>
        </Modal>
      )}
    </Card>
  );
}
