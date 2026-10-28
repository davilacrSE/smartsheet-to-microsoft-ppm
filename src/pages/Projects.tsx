import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FilePlus2 } from 'lucide-react';
import { STAGES, STATUSES } from '../domain/constants';
import { fmtDate, fmtMoney } from '../domain/calc';
import { db } from '../data/store';
import { hasRole } from '../services/rules';
import { REPORTS, downloadText, portfolio, toCsv } from '../services/reports';
import { Empty, HealthBadge, NdaBadge, StagePill, StatusPill, useMe, useStore } from '../components/ui';

export function Projects() {
  useStore();
  const me = useMe();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const f = {
    stage: params.get('stage') || '',
    status: params.get('status') || '',
    business: params.get('business') || '',
    pillar: params.get('pillar') || '',
    health: params.get('health') || '',
    archived: params.get('archived') === '1',
  };
  const setF = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return portfolio(me, f.archived).filter((s) =>
      (!f.stage || s.p.stage === f.stage) &&
      (!f.status || s.p.status === f.status) &&
      (!f.business || s.p.businessArea === f.business) &&
      (!f.pillar || s.p.pillar === f.pillar) &&
      (!f.health || (s.p.healthOverall ?? 'Not reported') === f.health) &&
      (!n || [s.p.code, s.p.name, s.pm, s.brm, s.p.businessFunction, s.p.program].some((x) => x?.toLowerCase().includes(n))),
    );
  }, [me, q, params, db.projects.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const md = db.config.masterData;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="sub">{rows.length} project{rows.length === 1 ? '' : 's'} · IT projects only (enhancements are out of scope)</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => downloadText('ppm-projects.csv', toCsv(REPORTS[0].build(me)))}><Download size={14} /> Export CSV</button>
          {hasRole(me, 'BRM') && <button className="btn primary" onClick={() => nav('/intake/new')}><FilePlus2 size={14} /> New intake</button>}
        </div>
      </div>
      <section className="card">
        <div className="toolbar">
          <input type="search" placeholder="Search by ID, name, PM, BRM, function, program…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" style={{ width: 'auto' }} value={f.stage} onChange={(e) => setF('stage', e.target.value)} aria-label="Stage"><option value="">All stages</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
          <select className="input" style={{ width: 'auto' }} value={f.status} onChange={(e) => setF('status', e.target.value)} aria-label="Status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          <select className="input" style={{ width: 'auto' }} value={f.business} onChange={(e) => setF('business', e.target.value)} aria-label="Business"><option value="">All businesses</option>{md.businessAreas.map((s) => <option key={s}>{s}</option>)}</select>
          <select className="input" style={{ width: 'auto' }} value={f.pillar} onChange={(e) => setF('pillar', e.target.value)} aria-label="Pillar"><option value="">All pillars</option>{md.pillars.map((s) => <option key={s}>{s}</option>)}</select>
          <select className="input" style={{ width: 'auto' }} value={f.health} onChange={(e) => setF('health', e.target.value)} aria-label="Health"><option value="">Any health</option><option>Green</option><option>Red</option><option>Not reported</option></select>
          <label className="check small"><input type="checkbox" checked={f.archived} onChange={(e) => setF('archived', e.target.checked ? '1' : '')} /> Include archived</label>
        </div>
        {rows.length === 0 ? <Empty>No projects match these filters.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr><th>Project</th><th>Stage</th><th>Status</th><th>Overall</th><th>Business / Function</th><th>Pillar</th><th>PM</th><th>Go-live</th><th className="num">Budget</th><th className="num">Forecast</th><th>Updates</th></tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.p.id} className="click" onClick={() => nav(`/projects/${s.p.code}`)}>
                    <td style={{ minWidth: 260 }}>
                      <b className="num">{s.p.code}</b> {s.p.name} <NdaBadge p={s.p} />
                      <div className="row small muted" style={{ gap: 6 }}>{s.p.agile ? <span className="pill">Agile</span> : <span className="pill">Waterfall</span>}{s.p.itgc && <span className="pill blue">ITGC</span>}{s.p.program && <span>{s.p.program}</span>}</div>
                    </td>
                    <td><StagePill stage={s.p.stage} />{s.p.stage === 'Draft' && <div className="small muted">{s.p.readyForReview ? 'Ready for review' : 'Not submitted'}</div>}</td>
                    <td><StatusPill status={s.p.status} /></td>
                    <td><HealthBadge value={s.p.healthOverall} /></td>
                    <td>{s.p.businessArea}<div className="small muted">{s.p.businessFunction}</div></td>
                    <td>{s.p.pillar}</td>
                    <td className="nowrap">{s.pm || '—'}</td>
                    <td className="nowrap">{fmtDate(s.goLive)}</td>
                    <td className="num">{s.budget ? fmtMoney(s.budget, true) : '—'}</td>
                    <td className="num">{s.forecast ? fmtMoney(s.forecast, true) : '—'}</td>
                    <td>{s.freshness.status.state === 'n/a' ? <span className="muted small">n/a</span> : s.overdueUpdates.length ? <span className="pill crit" title={s.overdueUpdates.join(', ')}>{s.overdueUpdates.length} overdue</span> : <span className="pill good">Current</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
