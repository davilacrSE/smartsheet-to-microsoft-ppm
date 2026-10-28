import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { AuditEvent } from '../domain/types';
import { fmtDateTime } from '../domain/calc';
import { db, projectById, userName } from '../data/store';
import { canSeeProject, isAdmin, isPmo } from '../services/rules';
import { downloadText, toCsv } from '../services/reports';
import { Card, Empty, Notice, useMe, useStore } from '../components/ui';

/** Lookup fields are stored as record ids; show people by name. */
const readable = (v?: string) => (v ? userName(v) || v : '');

export function AuditTable({ events, showProject = true }: { events: AuditEvent[]; showProject?: boolean }) {
  if (!events.length) return <Empty>No audit history.</Empty>;
  return (
    <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <table className="t">
        <thead><tr><th>When</th><th>User</th><th>Action</th>{showProject && <th>Project</th>}<th>Record</th><th>Field</th><th>Before</th><th>After</th><th>Details</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td className="nowrap small">{fmtDateTime(e.ts)}</td>
              <td className="small">{e.userEmail}</td>
              <td><span className="pill">{e.action}</span></td>
              {showProject && <td className="nowrap">{projectById(e.projectId)?.code ?? ''}</td>}
              <td className="small">{e.entity}{e.artifact ? ` · ${e.artifact}` : ''}</td>
              <td className="small">{e.field ?? ''}</td>
              <td className="small"><span className="clamp">{readable(e.before)}</span></td>
              <td className="small"><span className="clamp">{readable(e.after)}</span></td>
              <td className="small"><span className="clamp">{e.details ?? ''}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** AUD-FR-001..006: immutable audit trail (create-only table + Dataverse auditing). */
export function AuditLog() {
  useStore();
  const me = useMe();
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const events = useMemo(() => {
    const n = q.trim().toLowerCase();
    return db.auditEvents
      .filter((e) => !e.projectId || (projectById(e.projectId) && canSeeProject(me, projectById(e.projectId)!)))
      .filter((e) => !action || e.action === action)
      .filter((e) => !n || [e.userEmail, e.details, e.field, e.after, e.before, projectById(e.projectId)?.code].some((s) => s?.toLowerCase().includes(n)))
      .sort((a, b) => b.ts.localeCompare(a.ts));
  }, [q, action, db.auditEvents.length, me]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!(isPmo(me) || isAdmin(me))) return <Notice kind="warn">The global audit log is available to PMO and administrators. Project history is on each project's History tab.</Notice>;
  const actions = [...new Set(db.auditEvents.map((e) => e.action))].sort();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p className="sub">Approvals, exceptions, stage/status changes, field changes, NDA and external access events. Entries are create-only; Dataverse auditing also records every platform change.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => downloadText('ppm-audit.csv', toCsv({ columns: ['Timestamp', 'User', 'Action', 'Project', 'Entity', 'Artifact', 'Field', 'Before', 'After', 'Details'], rows: events.map((e) => ({ cells: [e.ts, e.userEmail, e.action, projectById(e.projectId)?.code, e.entity, e.artifact, e.field, e.before, e.after, e.details] })) }))}><Download size={14} /> Export evidence (CSV)</button>
        </div>
      </div>
      <Card flush>
        <div className="toolbar">
          <input type="search" placeholder="Filter by user, project, value…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" style={{ width: 'auto' }} value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action"><option value="">All actions</option>{actions.map((a) => <option key={a}>{a}</option>)}</select>
          <span className="small muted">{events.length} event(s)</span>
        </div>
        <AuditTable events={events.slice(0, 1000)} />
      </Card>
    </>
  );
}
