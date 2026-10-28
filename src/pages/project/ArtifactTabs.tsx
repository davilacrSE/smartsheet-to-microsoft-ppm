import { useState } from 'react';
import type { Project, Rec } from '../../domain/types';
import { buildTree, daysBetween, fmtDate, fmtMoney, monthLabel, monthRange, overallHealth, todayISO, ym } from '../../domain/calc';
import { OPEN_DEFECT_STATUSES } from '../../domain/schemas';
import { db, recs } from '../../data/store';
import { canSeeArtifact, projectPermissions, suggestedHealth, uncoveredRequirements } from '../../services/rules';
import { setForecast } from '../../services/workflow';
import { RecordTable } from '../../components/RecordTable';
import { Card, HealthBadge, Kpi, Notice, useAction, useMe, useStore } from '../../components/ui';
import { AuditTable } from '../AuditLog';
import { DemandActions } from '../Resources';

const isOverdue = (t: Rec) => t.end && t.end < todayISO() && !['Complete', 'Not Required'].includes(t.status) && t.taskType !== 'Phase';

export function RequirementsTab({ p }: { p: Project }) {
  useStore();
  const uncovered = uncoveredRequirements(p.id);
  const testsFor = (id: string) => db.traces.filter((t) => t.requirementId === id).length;
  const all = recs('requirements', p.id);
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Requirements" value={all.length} hint={`${all.filter((r) => r.reqType === 'Business').length} business · ${all.filter((r) => r.reqType === 'Functional').length} functional · ${all.filter((r) => r.reqType === 'Technical').length} technical`} />
        <Kpi label="Approved" value={`${all.filter((r) => r.approvalState === 'Approved').length}/${all.length}`} hint="Approval state (BRD-FR-004)" />
        <Kpi label="Without test coverage" value={uncovered.length} hint="BRD-FR-005" />
      </div>
      {uncovered.length > 0 && p.stage !== 'Initiate' && <Notice kind="warn">{uncovered.length} requirement(s) have no linked UAT/IT test case: {uncovered.slice(0, 4).map((r) => r.title).join('; ')}{uncovered.length > 4 ? '…' : ''}</Notice>}
      <RecordTable project={p} collection="requirements" title="1.0 Business Requirements (BRD)" extraColumns={[{ label: 'Tests', after: 'approvalState', render: (r) => (testsFor(r.id) ? <span className="pill good">{testsFor(r.id)}</span> : recs('requirements', p.id).some((x) => x.parentId === r.id) ? '' : <span className="pill warn">0</span>) }]} />
    </div>
  );
}

export function PlanTab({ p }: { p: Project }) {
  useStore();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const tasks = recs('tasks', p.id).filter((t) => t.taskType !== 'Phase');
  const overdue = tasks.filter(isOverdue);
  const done = tasks.filter((t) => t.status === 'Complete').length;
  const next = tasks.filter((t) => ['Milestone', 'Gate'].includes(t.taskType) && t.status !== 'Complete' && t.end).sort((a, b) => a.end.localeCompare(b.end))[0];
  const slipping = tasks.filter((t) => t.end && t.baselineEnd && t.end > t.baselineEnd && t.status !== 'Complete');
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Tasks complete" value={`${done}/${tasks.length}`} hint={`${Math.round((done / Math.max(1, tasks.length)) * 100)}%`} />
        <Kpi label="Overdue tasks" value={overdue.length} hint="Finish date passed, not complete (PLAN-FR-002)" onClick={() => setOverdueOnly(true)} />
        <Kpi label="Forecast later than baseline" value={slipping.length} hint="Schedule health input" />
        <Kpi label="Next milestone" value={next ? fmtDate(next.end) : '—'} hint={next?.name} />
      </div>
      <RecordTable
        project={p}
        collection="tasks"
        title="2.0 Project Plan"
        filter={overdueOnly ? (t) => isOverdue(t) || recs('tasks', p.id).some((c) => c.parentId === t.id && isOverdue(c)) : undefined}
        rowClass={(t) => (isOverdue(t) ? 'overdue' : '')}
        toolbar={<label className="check small"><input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Overdue only</label>}
        extraColumns={[{ label: 'Var. (d)', after: 'baselineEnd', className: 'num', render: (t) => (t.end && t.baselineEnd ? (() => { const d = daysBetween(t.baselineEnd, t.end); return d > 0 ? <span className="pill warn">+{d}</span> : d < 0 ? d : '0'; })() : '') }]}
      />
    </div>
  );
}

export function RaiddTab({ p }: { p: Project }) {
  useStore();
  const [type, setType] = useState('');
  const items = recs('raidd', p.id);
  const open = items.filter((r) => ['Open', 'In Progress'].includes(r.status));
  return (
    <div className="stack">
      <div className="kpis">
        {['Risk', 'Action', 'Issue', 'Decision', 'Dependency', 'Assumption', 'Change Request'].map((t) => (
          <Kpi key={t} label={t === 'Change Request' ? 'Change requests' : `${t}s`} value={open.filter((r) => r.type === t).length} hint={`${items.filter((r) => r.type === t).length} total`} onClick={() => setType(type === t ? '' : t)} />
        ))}
      </div>
      <RecordTable
        project={p}
        collection="raidd"
        title="5.0 RAIDD Log"
        filter={type ? (r) => r.type === type : undefined}
        sort={(a, b) => Number(!!b.escalated) - Number(!!a.escalated) || a.status.localeCompare(b.status) || (a.dueDate || '').localeCompare(b.dueDate || '')}
        rowClass={(r) => (r.dueDate && r.dueDate < todayISO() && ['Open', 'In Progress'].includes(r.status) ? 'overdue' : '')}
        toolbar={type && <span className="pill blue">{type} <button className="btn ghost sm" onClick={() => setType('')}>clear</button></span>}
      />
    </div>
  );
}

export function StatusTab({ p }: { p: Project }) {
  useStore();
  const me = useMe();
  const sug = suggestedHealth(p);
  const required = db.config.statusRequiredStages.includes(p.stage);
  const defaults = { statusDate: todayISO(), scope: p.healthScope ?? sug.scope.value, schedule: p.healthSchedule ?? sug.schedule.value, resource: p.healthResource ?? sug.resource.value, budget: p.healthBudget ?? sug.budget.value };
  return (
    <div className="stack">
      <Card title="Current health" meta={required ? 'Weekly status required in this stage' : p.stage === 'Initiate' ? 'Status optional in Initiate (STAT-FR-001)' : 'Status not required in this stage'}>
        <div className="grid g4">
          {(['scope', 'schedule', 'resource', 'budget'] as const).map((k) => (
            <div key={k}>
              <div className="small muted" style={{ textTransform: 'capitalize' }}>{k}</div>
              <HealthBadge value={p[`health${k[0].toUpperCase()}${k.slice(1)}` as 'healthScope']} />
              <div className="small muted mt">Suggested: <HealthBadge value={sug[k].value} /><br />{sug[k].why}</div>
            </div>
          ))}
        </div>
        <hr className="sep" />
        <div className="row"><b>Overall:</b> <HealthBadge value={p.healthOverall} /> <span className="small muted">Calculated — Red if any component is Red or Yellow; Green only when all four are Green. New entries pre-fill with the last reported values; PM-entered values always win over suggestions.</span></div>
      </Card>
      {projectPermissions(me, p).collections.statusUpdates || canSeeArtifact(me, p, 'status') ? (
        <RecordTable project={p} collection="statusUpdates" title="9.0 Weekly Status Tracker" sort={(a, b) => b.statusDate.localeCompare(a.statusDate)} defaults={defaults} addLabel="New status update" />
      ) : null}
      <p className="small muted">Preview: overall for the pre-filled values would be <HealthBadge value={overallHealth(defaults)} />.</p>
    </div>
  );
}

export function FinancialsTab({ p }: { p: Project }) {
  useStore();
  const me = useMe();
  const canSeeBudget = canSeeArtifact(me, p, 'budget');
  return (
    <div className="stack">
      {canSeeBudget && <ForecastGrid p={p} />}
      {canSeeBudget && <RecordTable project={p} collection="forecastLines" title="3.5 Budget & Forecast lines" />}
      {canSeeArtifact(me, p, 'costEstimator') && <CostEstimator p={p} />}
    </div>
  );
}

function ForecastGrid({ p }: { p: Project }) {
  const me = useMe();
  const canEdit = projectPermissions(me, p).collections.forecastLines;
  const lines = recs('forecastLines', p.id);
  const entries = db.forecastEntries.filter((e) => e.projectId === p.id);
  const actuals = db.actuals.filter((a) => a.projectId === p.id);
  const periods = [...entries.map((e) => e.period), ...actuals.map((a) => a.period), ym(todayISO())].sort();
  const years = [...new Set(periods.map((x) => x.slice(0, 4)))];
  const [year, setYear] = useState(ym(todayISO()).slice(0, 4));
  const months = monthRange(`${year}-01`, 12);
  const { run } = useAction();
  const amount = (lineId: string, m: string) => entries.find((e) => e.lineId === lineId && e.period === m)?.amount;
  const monthTotal = (m: string) => entries.filter((e) => e.period === m).reduce((s, e) => s + e.amount, 0);
  const actualFor = (m: string) => actuals.filter((a) => a.period === m).reduce((s, a) => s + a.amount, 0);
  const budget = lines.reduce((s, l) => s + (Number(l.approvedBudget) || 0), 0) || p.approvedBudget || 0;
  const totalFc = entries.reduce((s, e) => s + e.amount, 0);
  const totalAct = actuals.reduce((s, a) => s + a.amount, 0);
  return (
    <Card title="Monthly forecast" meta="FIN-FR-001 · every change is audited (FIN-FR-006) · SAP actuals are read-only" actions={<select className="input" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">{(years.includes(year) ? years : [...years, year]).sort().map((y) => <option key={y}>{y}</option>)}</select>} flush>
      <div className="row" style={{ padding: '12px 16px', gap: 24 }}>
        <span>Approved budget <b>{fmtMoney(budget)}</b></span>
        <span>Total forecast <b>{fmtMoney(totalFc)}</b> {budget ? <span className={`pill ${totalFc > budget * (1 + db.config.budgetTolerancePct / 100) ? 'crit' : totalFc > budget ? 'warn' : 'good'}`}>{(((totalFc - budget) / budget) * 100).toFixed(1)}%</span> : null}</span>
        <span>SAP actuals to date <b>{fmtMoney(totalAct)}</b></span>
        {!canEdit && <span className="pill">Read-only</span>}
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Line</th><th>Type</th>{months.map((m) => <th key={m} className="num">{monthLabel(m)}</th>)}<th className="num">{year} total</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="nowrap">{l.description}<div className="small muted">{l.spendCategory}</div></td>
                <td>{l.category}</td>
                {months.map((m) => (
                  <td key={m} className="num">
                    {canEdit ? (
                      <input className="cell num" style={{ width: 84 }} defaultValue={amount(l.id, m) ?? ''} key={`${l.id}-${m}-${amount(l.id, m)}`} aria-label={`${l.description} ${monthLabel(m)}`} onBlur={(e) => { const val = e.target.value === '' ? null : Number(e.target.value); if ((val ?? 0) !== (amount(l.id, m) ?? 0)) void run(() => setForecast(p, l.id, m, val)); }} />
                    ) : amount(l.id, m) ? fmtMoney(amount(l.id, m)!, true) : ''}
                  </td>
                ))}
                <td className="num"><b>{fmtMoney(months.reduce((s, m) => s + (amount(l.id, m) ?? 0), 0), true)}</b></td>
              </tr>
            ))}
            <tr className="phase"><td>Forecast total</td><td />{months.map((m) => <td key={m} className="num">{monthTotal(m) ? fmtMoney(monthTotal(m), true) : ''}</td>)}<td className="num">{fmtMoney(months.reduce((s, m) => s + monthTotal(m), 0), true)}</td></tr>
            <tr><td>SAP actuals</td><td className="small muted">system of record</td>{months.map((m) => <td key={m} className="num">{actualFor(m) ? fmtMoney(actualFor(m), true) : ''}</td>)}<td className="num">{fmtMoney(months.reduce((s, m) => s + actualFor(m), 0), true)}</td></tr>
            <tr><td>Variance (actual − forecast)</td><td />{months.map((m) => { const v = actualFor(m) ? actualFor(m) - monthTotal(m) : 0; return <td key={m} className="num">{actualFor(m) ? <span className={v > 0 ? 'pill warn' : ''}>{fmtMoney(v, true)}</span> : ''}</td>; })}<td /></tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CostEstimator({ p }: { p: Project }) {
  const items = recs('costItems', p.id);
  const totals = new Map<string, number>();
  const calc = (id: string): number => {
    if (totals.has(id)) return totals.get(id)!;
    const r = items.find((x) => x.id === id)!;
    const own = (Number(r.qty) || 0) * (Number(r.unitCost) || 0) + (Number(r.arrHardware) || 0) + (Number(r.arrSupport) || 0);
    const t = items.filter((x) => x.parentId === id).reduce((s, c) => s + calc(c.id), own);
    totals.set(id, t);
    return t;
  };
  const grand = buildTree(items).filter((t) => t.depth === 0).reduce((s, t) => s + calc(t.rec.id), 0);
  return (
    <RecordTable
      project={p}
      collection="costItems"
      title={<>4.0 Cost Estimator <span className="muted small" style={{ fontWeight: 400 }}>· total {fmtMoney(grand)}</span></>}
      extraColumns={[{ label: 'Grand total', className: 'num', render: (r) => { const t = calc(r.id); return t ? <b>{fmtMoney(t)}</b> : ''; } }]}
    />
  );
}

export function ResourcesTab({ p }: { p: Project }) {
  useStore();
  const d = recs('demands', p.id).filter((x) => x.status !== 'Cancelled');
  const hrs = (s: string[]) => d.filter((x) => s.includes(x.status)).reduce((a, x) => a + Number(x.hours || 0), 0);
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Demand (hours)" value={hrs(['Requested', 'Nominated', 'Confirmed', 'Rejected', 'Gap']).toLocaleString()} hint={`${d.length} line(s)`} />
        <Kpi label="Confirmed" value={hrs(['Confirmed']).toLocaleString()} hint="Named resources confirmed by PM" />
        <Kpi label="Awaiting nomination / confirmation" value={hrs(['Requested', 'Nominated', 'Rejected']).toLocaleString()} />
        <Kpi label="Capacity gap" value={hrs(['Gap']).toLocaleString()} hint="Escalate unresolved gaps" />
      </div>
      <RecordTable
        project={p}
        collection="demands"
        title="3.0 Resource Estimator & nominations"
        addLabel="Add resource demand"
        defaults={{ startDate: p.plannedExecuteDate, endDate: p.plannedGoLiveDate, category: p.pillar === 'Insights & Analytics' ? 'Insights' : p.pillar, resourceType: 'Internal', expenseCategory: 'Expense' }}
        extraColumns={[
          { label: 'Named resource', after: 'status', render: (r) => db.resources.find((x) => x.id === r.nominatedResourceId)?.name ?? (r.status === 'Gap' ? <span className="pill crit">Gap</span> : <span className="muted small">placeholder</span>) },
          { label: 'Cost', className: 'num', after: 'hours', render: (r) => fmtMoney((Number(r.hours) || 0) * (Number(r.rate) || 0), true) },
        ]}
        rowActions={(r) => <DemandActions d={r} />}
      />
    </div>
  );
}

export function TestingTab({ p }: { p: Project }) {
  useStore();
  const tcs = recs('testCases', p.id);
  const defects = recs('uatDefects', p.id);
  const count = (r: string) => tcs.filter((t) => t.result === r).length;
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Test cases" value={tcs.length} hint={`${tcs.filter((t) => t.importance === 'Critical').length} critical for Go/No-Go`} />
        <Kpi label="Passed" value={count('Passed')} />
        <Kpi label="Failed / blocked" value={count('Failed') + count('Blocked')} />
        <Kpi label="Not run" value={count('Not Run')} />
        <Kpi label="Open defects" value={defects.filter((d) => OPEN_DEFECT_STATUSES.includes(d.status)).length} hint={`${defects.filter((d) => OPEN_DEFECT_STATUSES.includes(d.status) && /^P[12]/.test(d.priority)).length} P1/P2`} />
      </div>
      <RecordTable project={p} collection="testCases" title="6.0 UAT Test Plan" sort={(a, b) => String(a.ref).localeCompare(String(b.ref))} />
      <RecordTable project={p} collection="uatDefects" title="6.0b UAT Defect Tracker" sort={(a, b) => String(b.defectNo).localeCompare(String(a.defectNo))} rowClass={(d) => (OPEN_DEFECT_STATUSES.includes(d.status) && /^P[12]/.test(d.priority) ? 'overdue' : '')} />
    </div>
  );
}

export function CutoverTab({ p }: { p: Project }) {
  useStore();
  const me = useMe();
  return (
    <div className="stack">
      {canSeeArtifact(me, p, 'cutover') && <RecordTable project={p} collection="cutoverTasks" title="7.0 Cutover Plan" sort={(a, b) => ['Pre-Cutover', 'Cutover Execution', 'Post-Cutover', 'Rollback'].indexOf(a.focusArea) - ['Pre-Cutover', 'Cutover Execution', 'Post-Cutover', 'Rollback'].indexOf(b.focusArea) || String(a.taskId).localeCompare(String(b.taskId))} />}
      {canSeeArtifact(me, p, 'hypercare') && <RecordTable project={p} collection="hypercareDefects" title="8.0 Hypercare Defect Tracker" sort={(a, b) => String(b.defectNo).localeCompare(String(a.defectNo))} />}
    </div>
  );
}

export function PeopleTab({ p }: { p: Project }) {
  useStore();
  const me = useMe();
  return (
    <div className="stack">
      {canSeeArtifact(me, p, 'stakeholders') && <RecordTable project={p} collection="stakeholders" title="0.0 Stakeholder Register" />}
      {canSeeArtifact(me, p, 'raci') && <RecordTable project={p} collection="raci" title="0.0b Project RACI" addLabel="Add deliverable" />}
    </div>
  );
}

export function HistoryTab({ p }: { p: Project }) {
  useStore();
  const events = db.auditEvents.filter((e) => e.projectId === p.id).sort((a, b) => b.ts.localeCompare(a.ts));
  return (
    <Card title="Project history" meta="Field changes, approvals, exceptions, health, forecasts, nominations and access events (AUD-FR-001)" flush>
      <AuditTable events={events} showProject={false} />
    </Card>
  );
}
