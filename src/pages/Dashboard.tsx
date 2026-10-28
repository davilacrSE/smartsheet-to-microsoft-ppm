import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { fmtDate, fmtMoney, daysBetween, todayISO } from '../domain/calc';
import { gateDef } from '../domain/constants';
import { db } from '../data/store';
import { dashboard } from '../services/reports';
import { Card, Empty, HealthBadge, Kpi, NdaBadge, StagePill, useMe, useStore } from '../components/ui';
import { CapacityHeatmap, GroupedColumns, HBarList, StatusStack } from '../components/charts';

/** RPT-FR-001..003: executive portfolio dashboard with drill-through to project detail. */
export function Dashboard() {
  useStore();
  const me = useMe();
  const nav = useNavigate();
  const d = dashboard(me);
  const k = d.kpis;
  const variance = k.budget ? ((k.forecast - k.budget) / k.budget) * 100 : 0;
  const open = (code: string, tab = '') => nav(`/projects/${code}${tab ? '/' + tab : ''}`);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Portfolio overview</h1>
          <p className="sub">IT projects visible to {me.name} · as of {fmtDate(todayISO())}</p>
        </div>
        {db.config.powerBiReportUrl && (
          <div className="actions">
            <a className="btn" href={db.config.powerBiReportUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open Power BI report</a>
          </div>
        )}
      </div>

      <div className="kpis">
        <Kpi label="Active projects" value={k.active} hint={`${k.intake} intake awaiting SG0`} onClick={() => nav('/projects')} />
        <Kpi label="Pending gate reviews" value={k.pendingGates} hint="Stage gates & governance boards" onClick={() => nav('/approvals')} />
        <Kpi label="Overall health Red" value={k.red} hint="Any Red or Yellow component" onClick={() => nav('/reports?r=health')} />
        <Kpi label="Forecast vs approved budget" value={`${variance >= 0 ? '+' : ''}${variance.toFixed(1)}%`} hint={`${fmtMoney(k.forecast, true)} vs ${fmtMoney(k.budget, true)} approved (funded) · pre-ACT ${fmtMoney(k.preActForecast, true)}`} onClick={() => nav('/reports?r=budget')} />
        <Kpi label="Resource gaps" value={k.gaps} hint={`${k.overTeams} team(s) over capacity in next 6 mo`} onClick={() => nav('/resources')} />
        <Kpi label="Overdue status updates" value={k.overdue} hint="Weekly cadence (DATA-FR-004)" onClick={() => nav('/reports?r=freshness')} />
      </div>

      <div className="grid g3 mb">
        <Card title="Projects by lifecycle stage">
          <HBarList data={d.byStage.map((s) => ({ label: s.stage, value: s.count }))} onSelect={(stage) => nav(`/projects?stage=${encodeURIComponent(stage)}`)} />
        </Card>
        <Card title="Overall health (in-flight projects)">
          <StatusStack data={d.health} />
          <p className="small muted mt">Overall health is Red when any Scope, Schedule, Resource or Budget component is Red or Yellow (STAT-FR-004).</p>
        </Card>
        <Card title="Budget, forecast & SAP actuals by business" meta="ACT-funded projects">
          {d.byBusiness.length ? (
            <GroupedColumns
              groups={d.byBusiness.map((b) => ({ label: b.business, values: [b.budget, b.forecast, b.actual] }))}
              series={[{ name: 'Approved budget', color: 'var(--s1)' }, { name: 'PPM forecast', color: 'var(--s2)' }, { name: 'SAP actuals', color: 'var(--s3)' }]}
            />
          ) : <Empty>No financials yet.</Empty>}
        </Card>
      </div>

      <div className="grid g2 mb">
        <Card title="Upcoming go-lives" meta="Next 90 days" flush>
          {d.upcomingGoLives.length === 0 ? <Empty>No go-lives in the next 90 days.</Empty> : (
            <table className="t">
              <thead><tr><th>Project</th><th>Go-live</th><th className="num">Days</th><th>Health</th><th>Next review</th></tr></thead>
              <tbody>
                {d.upcomingGoLives.map((s) => (
                  <tr key={s.p.id} className="click" onClick={() => open(s.p.code, 'plan')}>
                    <td><b className="num">{s.p.code}</b> {s.p.name} <NdaBadge p={s.p} /></td>
                    <td className="nowrap">{fmtDate(s.goLive)}</td>
                    <td className="num">{daysBetween(todayISO(), s.goLive)}</td>
                    <td><HealthBadge value={s.p.healthOverall} /></td>
                    <td>{s.pendingGate ? <span className="pill warn">{gateDef(s.pendingGate.gate).name} pending</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Executive RAIDD items" meta="Flagged for executive reporting or escalated" flush>
          {d.execRaidd.length === 0 ? <Empty>Nothing flagged.</Empty> : (
            <table className="t">
              <thead><tr><th>Project</th><th>Item</th><th>Severity</th><th>Ask to leadership</th></tr></thead>
              <tbody>
                {d.execRaidd.map(({ s, r }) => (
                  <tr key={r.id} className="click" onClick={() => open(s.p.code, 'raidd')}>
                    <td className="nowrap"><b className="num">{s.p.code}</b></td>
                    <td><span className="pill">{r.raiddId}</span> {r.title} {r.escalated && <span className="pill crit">Escalated</span>}</td>
                    <td>{r.severity}</td>
                    <td className="small"><span className="clamp">{r.askToLeadership || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="grid g2 mb">
        <Card title="In-flight projects" flush>
          <div className="table-wrap" style={{ maxHeight: 420 }}>
            <table className="t">
              <thead><tr><th>Project</th><th>Stage</th><th>Overall</th><th className="num">Forecast</th><th className="num">Var.</th><th>Updates</th></tr></thead>
              <tbody>
                {d.all.filter((s) => !['Draft', 'Close'].includes(s.p.stage) && ['Active', 'On Hold'].includes(s.p.status)).map((s) => (
                  <tr key={s.p.id} className="click" onClick={() => open(s.p.code)}>
                    <td><b className="num">{s.p.code}</b> {s.p.name} <NdaBadge p={s.p} /><div className="small muted">{s.p.businessArea} · PM {s.pm || '—'}</div></td>
                    <td><StagePill stage={s.p.stage} /></td>
                    <td><HealthBadge value={s.p.healthOverall} /></td>
                    <td className="num">{fmtMoney(s.forecast, true)}</td>
                    <td className="num">{s.variancePct == null ? '—' : `${s.variancePct > 0 ? '+' : ''}${s.variancePct.toFixed(1)}%`}</td>
                    <td>{s.overdueUpdates.length ? <span className="pill crit">{s.overdueUpdates.length} overdue</span> : <span className="pill good">Current</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Team capacity – next 6 months" meta="Committed + proposed demand vs. capacity" actions={<button className="btn sm" onClick={() => nav('/resources')}>Open capacity planning</button>}>
          <CapacityHeatmap months={d.capacity.months} teams={d.capacity.teams} onCell={() => nav('/resources')} />
        </Card>
      </div>
    </>
  );
}
