import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Pencil, Send, Undo2 } from 'lucide-react';
import type { Project } from '../../domain/types';
import { ARTIFACTS, GOVERNANCE_DRIVERS } from '../../domain/constants';
import { fmtDate, fmtDateTime, fmtMoney } from '../../domain/calc';
import { db, downloadFile, recs, userName } from '../../data/store';
import { canEditIntake, canSeeArtifact, freshness, projectActualTotal, projectBudget, projectForecastTotal, projectPermissions, suggestedHealth } from '../../services/rules';
import { markReadyForReview, recallIntake, updateRecord } from '../../services/workflow';
import { Card, Field, HealthBadge, Modal, toast, useAction, useMe, useStore } from '../../components/ui';
import { PeoplePicker } from '../../components/PeoplePicker';
import { IntakeForm } from '../Intake';
import { TABLE_PREFIX } from '../../brand';

export function Overview({ p }: { p: Project }) {
  useStore();
  const me = useMe();
  if (p.stage === 'Draft') return <DraftOverview p={p} />;
  return (
    <div className="stack">
      <div className="grid g2">
        <ProjectRecord p={p} />
        <div className="stack">
          <HealthCard p={p} />
          <FinanceSummary p={p} />
        </div>
      </div>
      <ArtifactRegister p={p} />
      {db.attachments.some((a) => a.projectId === p.id) && <Attachments p={p} />}
      {!canSeeArtifact(me, p, 'projectRecord') && <p className="muted">Project record restricted.</p>}
    </div>
  );
}

function DraftOverview({ p }: { p: Project }) {
  const me = useMe();
  const perm = projectPermissions(me, p);
  const { run, busy } = useAction();
  if (canEditIntake(me, p)) {
    return (
      <div className="stack">
        <div className="notice">This intake is in <b>Draft</b>. It can stay in Draft until you mark it Ready for Review; PMO is then notified for Stage Gate 0.</div>
        <IntakeForm project={p} />
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="notice">
        <div>
          {p.readyForReview ? <>Submitted for PMO review on {fmtDateTime(p.readyForReviewAt)}. Stage Gate 0 decision pending — see Governance.</> : <>Draft intake — not yet submitted by the BRM.</>}
          {perm.recallIntake && <button className="btn sm" style={{ marginLeft: 12 }} disabled={busy} onClick={() => run(() => recallIntake(p), 'Intake recalled to Draft')}><Undo2 size={14} /> Recall</button>}
          {me.id === p.brmId && !p.readyForReview && <button className="btn sm primary" style={{ marginLeft: 12 }} disabled={busy} onClick={() => run(() => markReadyForReview(p), 'Submitted')}><Send size={14} /> Mark Ready for Review</button>}
        </div>
      </div>
      <Card title="Intake">
        <dl className="dl">
          <dt>Main objective</dt><dd>{p.mainObjective}</dd>
          <dt>Desired outcome</dt><dd>{p.desiredOutcome}</dd>
          <dt>Estimated cost / benefit</dt><dd>{fmtMoney(p.estimatedCost)} / {fmtMoney(p.estimatedBenefit)} ({p.benefitType})</dd>
          <dt>Roadmap</dt><dd>{p.roadmapAlignment}</dd>
          <dt>Business / function</dt><dd>{p.businessArea} · {p.businessFunction}</dd>
          <dt>Corporate priority</dt><dd>{p.corporatePriority}</dd>
          <dt>Program</dt><dd>{p.program || '—'}</dd>
          <dt>Planned dates</dt><dd>Initiate {fmtDate(p.plannedInitiateDate)} · Execute {fmtDate(p.plannedExecuteDate)} · Go-live {fmtDate(p.plannedGoLiveDate)}</dd>
          <dt>Flags</dt><dd>{p.agile ? 'Agile' : 'Waterfall'}{p.itgc ? ` · ITGC (${p.itgcApplications || 'applications TBD'})` : ''}</dd>
          <dt>Created</dt><dd>{fmtDateTime(p.createdAt)} by {userName(p.createdById)}</dd>
        </dl>
      </Card>
      <Attachments p={p} />
    </div>
  );
}

function ProjectRecord({ p }: { p: Project }) {
  const me = useMe();
  const perm = projectPermissions(me, p);
  const [editing, setEditing] = useState(false);
  const canEdit = perm.editRecord || perm.editAssignments || perm.editFinance;
  return (
    <Card title="Project record" meta={`0.0a · ${TABLE_PREFIX}itproject`} actions={canEdit && <button className="btn sm" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>}>
      <dl className="dl">
        <dt>Main objective</dt><dd>{p.mainObjective}</dd>
        <dt>Desired outcome</dt><dd>{p.desiredOutcome}</dd>
        <dt>Sponsor</dt><dd>{userName(p.sponsorId) || '—'}</dd>
        <dt>BRM / PM / BA</dt><dd>{userName(p.brmId) || '—'} / {userName(p.pmId) || '—'} / {userName(p.baId) || '—'}</dd>
        <dt>IT Delivery / Tech lead</dt><dd>{userName(p.itDeliveryLeadId) || '—'} / {userName(p.technicalLeadId) || '—'}</dd>
        <dt>Business / function</dt><dd>{p.businessArea} · {p.businessFunction} · {p.corporatePriority}</dd>
        <dt>Program / roadmap</dt><dd>{p.program || '—'} · {p.roadmapAlignment}</dd>
        <dt>Dates</dt><dd>Approved to Initiate {fmtDate(p.approvalDate)} · Execute {fmtDate(p.plannedExecuteDate)} · Go-live {fmtDate(p.plannedGoLiveDate)}{p.actualGoLiveDate ? ` (actual ${fmtDate(p.actualGoLiveDate)})` : ''}</dd>
        <dt>Applications</dt><dd>{p.existingApplications || '—'}</dd>
        <dt>Data migration</dt><dd>{p.dataMigration ? `Yes – ${p.dataMigrationDetails || 'details TBD'}` : 'No'}</dd>
        <dt>Work areas</dt><dd className="small">{[p.integrationWork && `Integration: ${p.integrationWork}`, p.infrastructureWork && `Infrastructure: ${p.infrastructureWork}`, p.cyberWork && `Cyber: ${p.cyberWork}`, p.insightWork && `Insights: ${p.insightWork}`].filter(Boolean).join(' · ') || '—'}</dd>
        <dt>Governance boards</dt><dd>{[p.drbRequired && 'Design Review', p.crbRequired && 'CRB', p.cabRequired && 'CAB'].filter(Boolean).join(', ') || 'None required'}{p.governanceDrivers.length ? <div className="small muted">Drivers: {p.governanceDrivers.join(', ')}</div> : null}</dd>
        <dt>ITGC</dt><dd>{p.itgc ? `Yes – ${p.itgcApplications || ''}` : 'No'}</dd>
        <dt>ServiceNow / Jira</dt><dd>{p.serviceNowChange || '—'} / {p.jiraKey || '—'}</dd>
        <dt>Est. hours (ROM)</dt><dd>{p.estHoursBucket || '—'}</dd>
      </dl>
      {editing && <RecordModal p={p} onClose={() => setEditing(false)} />}
    </Card>
  );
}

function RecordModal({ p, onClose }: { p: Project; onClose: () => void }) {
  const me = useMe();
  const perm = projectPermissions(me, p);
  const [v, setV] = useState<Project>({ ...p });
  const { run, busy } = useAction();
  const set = (k: keyof Project, val: unknown) => setV((x) => ({ ...x, [k]: val }));
  const md = db.config.masterData;
  const save = async () => {
    const changes: Partial<Project> = {};
    (Object.keys(v) as (keyof Project)[]).forEach((k) => {
      if (JSON.stringify(v[k] ?? null) !== JSON.stringify(p[k] ?? null)) (changes as any)[k] = v[k];
    });
    if (!Object.keys(changes).length) return onClose();
    const ok = await run(() => updateRecord(p, changes), 'Project record saved');
    if (ok !== undefined) onClose();
  };
  const text = (k: keyof Project, label: string, full = false, area = false) => (
    <Field label={label} full={full}>{area ? <textarea value={(v[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} /> : <input value={(v[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} />}</Field>
  );
  return (
    <Modal size="lg" title={`Edit project record – ${p.code}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Save</button></>}>
      <div className="form-grid">
        {perm.editAssignments && (
          <>
            <div className="form-section">People</div>
            {([['sponsorId', 'Sponsor', undefined], ['pmId', 'Project Manager', ['PM']], ['baId', 'Business Analyst', ['BA']], ['itDeliveryLeadId', 'IT Delivery Lead', undefined], ['technicalLeadId', 'Technical Lead', undefined], ['architectId', 'Architect', ['ARCHITECT']]] as const).map(([k, label, roles]) => (
              <Field key={k} label={label}><PeoplePicker value={v[k] as string} roles={roles ? [...roles] : undefined} ariaLabel={label} onChange={(id) => set(k, id || undefined)} /></Field>
            ))}
          </>
        )}
        {perm.editRecord && (
          <>
            <div className="form-section">Scope & schedule</div>
            {text('name', 'Project name', true)}
            {text('mainObjective', 'Main objective', true, true)}
            {text('desiredOutcome', 'Desired outcome', true, true)}
            <Field label="Planned execution"><input type="date" value={v.plannedExecuteDate ?? ''} onChange={(e) => set('plannedExecuteDate', e.target.value)} /></Field>
            <Field label="Planned go-live"><input type="date" value={v.plannedGoLiveDate ?? ''} onChange={(e) => set('plannedGoLiveDate', e.target.value)} /></Field>
            <Field label="Program"><select value={v.program ?? ''} onChange={(e) => set('program', e.target.value)}><option value="">—</option>{md.programs.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Est. hours bucket (ROM)"><select value={v.estHoursBucket ?? ''} onChange={(e) => set('estHoursBucket', e.target.value)}><option value="">—</option>{md.hoursBuckets.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Delivery"><label className="check"><input type="checkbox" checked={v.agile} onChange={(e) => set('agile', e.target.checked)} /> Agile</label></Field>
            <Field label="ITGC"><label className="check"><input type="checkbox" checked={v.itgc} onChange={(e) => set('itgc', e.target.checked)} /> ITGC-relevant</label></Field>
            {v.itgc && text('itgcApplications', 'ITGC applications', true)}
            {text('existingApplications', 'Existing applications or platforms', true)}
            {text('businessOwnerApps', 'Business owner of impacted applications')}
            <Field label="Data migration"><label className="check"><input type="checkbox" checked={!!v.dataMigration} onChange={(e) => set('dataMigration', e.target.checked)} /> Required</label></Field>
            {v.dataMigration && text('dataMigrationDetails', 'What data needs to be migrated', true)}
            {text('integrationWork', 'Integration work')}
            {text('infrastructureWork', 'Infrastructure work')}
            {text('cyberWork', 'Cyber work')}
            {text('insightWork', 'Insight work')}
            {text('connectionsToOtherSystems', 'Connection to other systems', true)}
            {text('serviceNowChange', 'ServiceNow change #')}
            {text('jiraKey', 'Jira key')}
            <div className="form-section">Governance boards (GOV-FR-002)</div>
            <Field label="Required reviews" full>
              <div className="row" style={{ gap: 18 }}>
                <label className="check"><input type="checkbox" checked={v.drbRequired} onChange={(e) => set('drbRequired', e.target.checked)} /> Design Review</label>
                <label className="check"><input type="checkbox" checked={v.crbRequired} onChange={(e) => set('crbRequired', e.target.checked)} /> CRB</label>
                <label className="check"><input type="checkbox" checked={v.cabRequired} onChange={(e) => set('cabRequired', e.target.checked)} /> CAB</label>
              </div>
            </Field>
            <Field label="Drivers" full>
              <div className="multi">{GOVERNANCE_DRIVERS.map((d) => <label key={d}><input type="checkbox" checked={v.governanceDrivers.includes(d)} onChange={(e) => set('governanceDrivers', e.target.checked ? [...v.governanceDrivers, d] : v.governanceDrivers.filter((x) => x !== d))} />{d}</label>)}</div>
            </Field>
            {text('lessonsLearned', 'Lessons learned', true, true)}
          </>
        )}
        {perm.editFinance && (
          <>
            <div className="form-section">Finance & ACT (SEC-FR-006)</div>
            {text('actNumber', 'ACT number')}
            <Field label="ACT approval date"><input type="date" value={v.actApprovedDate ?? ''} onChange={(e) => set('actApprovedDate', e.target.value)} /></Field>
            <Field label="Approved budget"><input type="number" value={v.approvedBudget ?? ''} onChange={(e) => set('approvedBudget', e.target.value === '' ? undefined : Number(e.target.value))} /></Field>
            <Field label="PI"><input type="number" step="0.01" value={v.pi ?? ''} onChange={(e) => set('pi', e.target.value === '' ? undefined : Number(e.target.value))} /></Field>
            {text('costCenter', 'Cost center')}
            {text('glCode', 'G/L code')}
            <Field label="Cost centers"><label className="check"><input type="checkbox" checked={!!v.multipleCostCenters} onChange={(e) => set('multipleCostCenters', e.target.checked)} /> Multiple cost centers</label></Field>
          </>
        )}
        {perm.editWbsPo ? (
          <>
            <Field label="WBS elements" help="Comma separated (after ACT approval)"><input value={v.wbsElements.join(', ')} onChange={(e) => set('wbsElements', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} /></Field>
            <Field label="PO numbers" help="Comma separated"><input value={v.poNumbers.join(', ')} onChange={(e) => set('poNumbers', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} /></Field>
          </>
        ) : perm.editFinance && <div className="full small muted">WBS elements and PO numbers are captured after ACT approval (FIN-FR-002).</div>}
      </div>
    </Modal>
  );
}

function HealthCard({ p }: { p: Project }) {
  const sug = suggestedHealth(p);
  const fr = freshness(p);
  const rows: [string, keyof typeof sug, Project['healthScope']][] = [['Scope', 'scope', p.healthScope], ['Schedule', 'schedule', p.healthSchedule], ['Resource', 'resource', p.healthResource], ['Budget', 'budget', p.healthBudget]];
  return (
    <Card title="Health" meta={p.healthAsOf ? `PM-reported ${fmtDate(p.healthAsOf)}` : 'No status yet'} actions={<Link className="btn sm" to={`/projects/${p.code}/status`}>Status updates</Link>}>
      <table className="t">
        <thead><tr><th>Area</th><th>Reported</th><th>Calculated suggestion (STAT-FR-005)</th></tr></thead>
        <tbody>
          {rows.map(([label, k, v]) => (
            <tr key={k}><td>{label}</td><td><HealthBadge value={v} /></td><td><HealthBadge value={sug[k].value} /> <span className="small muted">{sug[k].why}</span></td></tr>
          ))}
          <tr><td><b>Overall</b></td><td><HealthBadge value={p.healthOverall} /></td><td className="small muted">Red if any component is Red or Yellow</td></tr>
        </tbody>
      </table>
      <div className="row small mt">
        <span className="muted">Data freshness:</span>
        {Object.entries(fr).map(([k, x]) => <span key={k} className={`pill ${x.state === 'overdue' ? 'crit' : x.state === 'due' ? 'warn' : x.state === 'fresh' ? 'good' : ''}`} title={x.last ? `Last update ${fmtDate(x.last)}` : 'No updates'}>{k}: {x.state}</span>)}
      </div>
    </Card>
  );
}

function FinanceSummary({ p }: { p: Project }) {
  const me = useMe();
  if (!canSeeArtifact(me, p, 'budget')) return null;
  const budget = projectBudget(p);
  const fc = projectForecastTotal(p.id);
  const act = projectActualTotal(p.id);
  return (
    <Card title="Financials" meta="Forecast in PPM · actuals from SAP" actions={<Link className="btn sm" to={`/projects/${p.code}/financials`}>Open</Link>}>
      <div className="grid g3">
        <div><div className="small muted">Approved budget</div><div style={{ fontSize: 20, fontWeight: 600 }}>{budget ? fmtMoney(budget) : '—'}</div><div className="small muted">{p.actNumber ? `ACT ${p.actNumber}` : 'Pre-ACT'}</div></div>
        <div><div className="small muted">Forecast</div><div style={{ fontSize: 20, fontWeight: 600 }}>{fmtMoney(fc)}</div><div className="small muted">{budget ? `${(((fc - budget) / budget) * 100).toFixed(1)}% vs budget` : `Estimate ${fmtMoney(p.estimatedCost)}`}</div></div>
        <div><div className="small muted">SAP actuals</div><div style={{ fontSize: 20, fontWeight: 600 }}>{fmtMoney(act)}</div><div className="small muted">{p.wbsElements.join(', ') || 'No WBS yet'}</div></div>
      </div>
    </Card>
  );
}

/** ART-FR-002/004: the project's artifacts, all stored as Dataverse rows under this IT Project. */
function ArtifactRegister({ p }: { p: Project }) {
  const me = useMe();
  const tabFor = (key: string) => ARTIFACTS.find((a) => a.key === key)?.tab;
  return (
    <Card title="Project artifacts" meta={`Created in Dataverse ${fmtDateTime(p.artifactsInitializedAt)} · child rows of this IT Project`} flush>
      <table className="t">
        <thead><tr><th>#</th><th>Artifact</th><th>Dataverse table</th><th>Update cadence</th><th className="num">Rows</th><th>Last updated</th><th>Access</th></tr></thead>
        <tbody>
          {ARTIFACTS.map((a) => {
            const visible = canSeeArtifact(me, p, a.key);
            const rows = a.collection ? recs(a.collection, p.id) : a.key === 'approvals' ? db.gateReviews.filter((g) => g.projectId === p.id) : [];
            const last = rows.map((r: any) => r.updatedAt).sort().pop();
            return (
              <tr key={a.key} className={visible && tabFor(a.key) ? 'click' : ''} onClick={() => visible && tabFor(a.key) && (window.location.hash = `#/projects/${p.code}/${tabFor(a.key)}`)}>
                <td className="num">{a.code}</td>
                <td>{a.title}{a.system && <span className="pill" style={{ marginLeft: 6 }}>system</span>}</td>
                <td><code className="small">{a.table ?? (a.key === 'dashboard' ? 'Portfolio dashboard / Power BI' : '—')}</code></td>
                <td>{a.cadence}</td>
                <td className="num">{visible ? (a.collection || a.key === 'approvals' ? rows.length : '—') : ''}</td>
                <td>{visible ? fmtDate(last) : ''}</td>
                <td>{visible ? (p.restrictedArtifacts.includes(a.key) ? <span className="pill warn">Restricted</span> : <span className="pill good">Visible</span>) : <span className="pill">No access</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function Attachments({ p }: { p: Project }) {
  const files = db.attachments.filter((a) => a.projectId === p.id);
  const { run } = useAction();
  const download = (id: string, name: string) =>
    run(async () => {
      const data = await downloadFile('attachments', id, 'file');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data]));
      a.download = name;
      a.click();
    });
  return (
    <Card title="Supporting uploads" meta="Intake attachments (Dataverse file column)">
      {files.length === 0 ? <span className="muted">No attachments.</span> : (
        <div className="row">{files.map((f) => <button key={f.id} className="btn sm" onClick={() => download(f.id, f.fileName).then(() => toast(`Downloaded ${f.fileName}`))}><Download size={14} /> {f.fileName} <span className="muted">({Math.ceil(f.size / 1024)} KB)</span></button>)}</div>
      )}
    </Card>
  );
}
