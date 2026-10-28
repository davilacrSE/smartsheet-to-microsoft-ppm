import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { REPORTS, downloadText, toCsv } from '../services/reports';
import { Card, Empty, HealthBadge, useMe, useStore } from '../components/ui';

/** RPT-FR-002/004/005/006: standard reports with CSV export (Power BI can consume the same Dataverse tables). */
export function Reports() {
  useStore();
  const me = useMe();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const available = REPORTS.filter((r) => !r.visible || r.visible(me));
  const current = available.find((r) => r.key === params.get('r')) ?? available[0];
  const result = current.build(me);
  const healthCols = new Set(['Overall Health', 'Overall', 'Scope', 'Schedule', 'Resource', 'Budget', 'Budget Health']);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="sub">Every report excludes confidential NDA projects unless you are on their approved access list.</p>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '280px 1fr' }}>
        <Card title="Report library" flush>
          {available.map((r) => (
            <div key={r.key} className="note" style={{ gridTemplateColumns: '1fr', background: r.key === current.key ? 'var(--blue-wash)' : undefined }} onClick={() => setParams({ r: r.key })}>
              <div>
                <b>{r.title}</b>
                <div className="small muted">{r.description}</div>
              </div>
            </div>
          ))}
        </Card>
        <Card title={current.title} meta={`${result.rows.length} row(s)`} actions={<button className="btn sm" onClick={() => downloadText(`ppm-${current.key}.csv`, toCsv(result))}><Download size={14} /> Export CSV</button>} flush>
          {result.note && <div className="toolbar small muted">{result.note}</div>}
          {result.rows.length === 0 ? <Empty>No data for this report.</Empty> : (
            <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              <table className="t">
                <thead><tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className={row.projectCode ? 'click' : ''} onClick={() => row.projectCode && nav(`/projects/${row.projectCode}`)}>
                      {row.cells.map((c, j) => {
                        const col = result.columns[j];
                        if (healthCols.has(col) && ['Green', 'Yellow', 'Red'].includes(String(c))) return <td key={j}><HealthBadge value={String(c)} /></td>;
                        if (['overdue', 'due', 'fresh'].includes(String(c))) return <td key={j}><span className={`pill ${c === 'overdue' ? 'crit' : c === 'due' ? 'warn' : 'good'}`}>{c}</span></td>;
                        return <td key={j} className={typeof c === 'number' ? 'num' : ''}>{typeof c === 'number' && c > 999 ? c.toLocaleString() : c ?? ''}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
