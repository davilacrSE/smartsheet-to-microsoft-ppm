import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import type { CheckResult, GateDecision, GateReview, Project } from '../../domain/types';
import { ARTIFACTS, GATES, GATE_DECISIONS, TRANSITIONS, gateDef } from '../../domain/constants';
import { fmtDateTime } from '../../domain/calc';
import { db, projectById, userName } from '../../data/store';
import { canRequestGate, gateDecisionBlocker, isPmo, isPmoDirector, latestDecision, pendingReview, runChecks } from '../../services/rules';
import { decideGate, requestGate, transition } from '../../services/workflow';
import { Card, Empty, Field, Modal, Notice, ask, useAction, useMe, useStore } from '../../components/ui';

export function CheckList({ checks, p }: { checks: CheckResult[]; p: Project }) {
  if (!checks.length) return <span className="muted small">No mandatory checks configured.</span>;
  return (
    <div className="check-list">
      {checks.map((c) => {
        const tab = ARTIFACTS.find((a) => a.key === c.artifact)?.tab;
        return (
          <div key={c.id} className="check-item">
            {c.ok ? <CheckCircle2 size={16} className="ok" /> : <XCircle size={16} className="no" />}
            <span>
              {tab && !c.ok ? <Link to={`/projects/${p.code}/${tab}`}>{c.label}</Link> : c.label}
              {c.detail && <span className="small muted"> — {c.detail}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** PPM-FR-029 decision outcomes; approval blocked while checks fail unless an exception is documented. */
export function GateDecisionModal({ review, onClose }: { review: GateReview; onClose: () => void }) {
  const me = useMe();
  const p = projectById(review.projectId)!;
  const checks = runChecks(review.gate, p);
  const failing = checks.filter((c) => !c.ok);
  const [decision, setDecision] = useState<GateDecision>(failing.length ? 'Approve with Exception' : 'Approve');
  const [comments, setComments] = useState('');
  const [conditions, setConditions] = useState('');
  const [justification, setJustification] = useState('');
  const { run, busy } = useAction();
  const blocker = gateDecisionBlocker(me, p, review.gate, review);
  const def = gateDef(review.gate);
  const submit = async () => {
    const ok = await run(() => decideGate(p, review, { decision, comments, conditions, justification }), `${def.name}: ${decision}`);
    if (ok !== undefined) onClose();
  };
  return (
    <Modal title={`${def.name} decision – ${p.code}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${decision === 'Stop' ? 'danger solid' : 'primary'}`} disabled={busy || !!blocker || !comments.trim() || (decision === 'Approve' && failing.length > 0) || (decision === 'Approve with Exception' && !justification.trim())} onClick={submit}>Record decision</button>
      </>
    }>
      <div className="stack">
        {blocker && <Notice kind="crit">{blocker}</Notice>}
        <div className="small muted">{def.purpose} Authority: {def.authority}. Requested by {userName(review.requestedById)} on {fmtDateTime(review.requestedAt)}.{review.requestNotes ? ` “${review.requestNotes}”` : ''}</div>
        <Card title="Mandatory requirements">
          <CheckList checks={checks} p={p} />
        </Card>
        <Field label="Decision" required>
          <div className="row">
            {GATE_DECISIONS.map((d) => (
              <label key={d} className="check" style={{ opacity: d === 'Approve' && failing.length ? 0.5 : 1 }}>
                <input type="radio" name="decision" checked={decision === d} disabled={d === 'Approve' && failing.length > 0} onChange={() => setDecision(d)} /> {d}
              </label>
            ))}
          </div>
        </Field>
        {decision === 'Approve with Exception' && (
          <Field label="Exception justification" required help={failing.length ? `Excepted: ${failing.map((c) => c.label).join('; ')}` : 'Recorded as an approved exception (PPM-CN-005).'}>
            <textarea value={justification} onChange={(e) => setJustification(e.target.value)} />
          </Field>
        )}
        <Field label="Decision comments" required><textarea value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
        <Field label="Conditions (optional)"><input value={conditions} onChange={(e) => setConditions(e.target.value)} /></Field>
        <p className="small muted">{decision === 'Stop' ? 'Stop sets the project status to Rejected.' : decision === 'Hold' ? 'Hold sets the project status to On Hold.' : decision === 'Rework' ? 'Rework returns the request without changing stage.' : def.to ? `Approval moves the project to ${def.to}${review.gate === 'SG0' ? ' and creates its artifacts in Dataverse' : ''}.` : 'Approval is recorded as governance evidence.'}</p>
      </div>
    </Modal>
  );
}

export function Governance({ p }: { p: Project }) {
  useStore();
  const me = useMe();
  const { run, busy } = useAction();
  const [deciding, setDeciding] = useState<GateReview | null>(null);
  const reviews = db.gateReviews.filter((g) => g.projectId === p.id).sort((a, b) => (b.decidedAt || b.requestedAt).localeCompare(a.decidedAt || a.requestedAt));
  const exceptions = db.exceptions.filter((e) => e.projectId === p.id);
  const trans = TRANSITIONS.find((t) => t.from === p.stage);

  const request = async (gate: GateReview['gate']) => {
    const notes = await ask({ title: `Request ${gateDef(gate).name}`, label: 'Notes for approvers', placeholder: 'Readiness summary, links, open items…' });
    if (notes !== null) await run(() => requestGate(p, gate, notes), 'Review requested – approvers notified');
  };
  const advance = async () => {
    if (!trans) return;
    const checks = runChecks(trans.key, p);
    let justification: string | undefined;
    if (checks.some((c) => !c.ok)) {
      const j = await ask({ title: `${trans.label} with exception`, message: `Open items: ${checks.filter((c) => !c.ok).map((c) => c.label).join('; ')}`, label: 'Exception justification (PMO Director)', required: true });
      if (!j) return;
      justification = j;
    }
    await run(() => transition(p, trans.key, justification), `Moved to ${trans.to}`);
  };

  return (
    <div className="stack">
      <Card title="Stage gates & governance reviews" meta="PPM-FR-028 · GOV-FR-001" flush>
        <table className="t">
          <thead><tr><th>Review</th><th>Purpose / authority</th><th>Status</th><th>Readiness</th><th /></tr></thead>
          <tbody>
            {GATES.map((g) => {
              const last = latestDecision(p.id, g.key);
              const pend = pendingReview(p.id, g.key);
              const notRequired = g.requiredFlag && !p[g.requiredFlag];
              const available = g.allowedStages.includes(p.stage) && p.status === 'Active';
              const checks = runChecks(g.key, p);
              return (
                <tr key={g.key}>
                  <td><b>{g.name}</b>{g.from && <div className="small muted">{g.from} → {g.to}</div>}</td>
                  <td className="small">{g.purpose}<div className="muted">{g.authority}</div></td>
                  <td>
                    {pend ? <span className="pill warn">Pending since {fmtDateTime(pend.requestedAt)}</span>
                      : last ? <span className={`pill ${last.decision?.startsWith('Approve') ? 'good' : last.decision === 'Stop' ? 'crit' : 'warn'}`}>{last.decision} · {fmtDateTime(last.decidedAt)}</span>
                        : notRequired ? <span className="pill">Not required</span>
                          : <span className="pill"><CircleDashed size={12} /> Not started</span>}
                  </td>
                  <td>{available && !last?.decision?.startsWith('Approve') ? (checks.every((c) => c.ok) ? <span className="pill good">{checks.length}/{checks.length} met</span> : <span className="pill warn">{checks.filter((c) => c.ok).length}/{checks.length} met</span>) : ''}</td>
                  <td className="right nowrap">
                    {pend && !gateDecisionBlocker(me, p, g.key, pend) && <button className="btn primary sm" onClick={() => setDeciding(pend)}>Decide</button>}
                    {!pend && available && g.key !== 'SG0' && canRequestGate(me, p) && !(last?.decision?.startsWith('Approve') && g.to) && <button className="btn sm" disabled={busy} onClick={() => request(g.key)}>Request review</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {trans && (
        <Card title={`Next stage: ${trans.to}`} meta="Stage advancement is restricted to PMO roles (SEC-FR-009)" actions={isPmo(me) && p.status === 'Active' && <button className="btn primary sm" disabled={busy} onClick={advance}>{trans.label}</button>}>
          <CheckList checks={runChecks(trans.key, p)} p={p} />
          {runChecks(trans.key, p).some((c) => !c.ok) && <p className="small muted mt">{isPmoDirector(me) ? 'You can advance with a documented exception.' : 'Only the PMO Director can approve an exception for open items.'}</p>}
        </Card>
      )}

      {(() => {
        const nextGate = GATES.find((g) => g.from === p.stage);
        if (!nextGate) return null;
        return (
          <Card title={`Readiness for ${nextGate.name}`} meta={`${nextGate.from} → ${nextGate.to} · required artifacts (ART-FR-004)`}>
            <CheckList checks={runChecks(nextGate.key, p)} p={p} />
            {nextGate.key === 'SG0' && !p.readyForReview && <p className="small muted mt">Stage Gate 0 opens when the BRM marks the intake Ready for Review.</p>}
          </Card>
        );
      })()}

      <Card title="Decision history" meta="AUD-FR-003 approver, decision, timestamp, comments, conditions" flush>
        {reviews.length === 0 ? <Empty>No reviews yet.</Empty> : (
          <table className="t">
            <thead><tr><th>Review</th><th>Requested</th><th>Decision</th><th>Approver</th><th>Comments / conditions</th></tr></thead>
            <tbody>
              {reviews.map((r) => {
                const ex = db.exceptions.find((e) => e.id === r.exceptionId);
                return (
                  <tr key={r.id}>
                    <td>{gateDef(r.gate).name}</td>
                    <td className="small nowrap">{userName(r.requestedById)}<div className="muted">{fmtDateTime(r.requestedAt)}</div></td>
                    <td>{r.status === 'Decided' ? <span className={`pill ${r.decision?.startsWith('Approve') ? 'good' : 'warn'}`}>{r.decision}</span> : <span className="pill">{r.status}</span>}</td>
                    <td className="small nowrap">{userName(r.decidedById) || '—'}<div className="muted">{fmtDateTime(r.decidedAt)}</div></td>
                    <td className="small">{r.comments}{r.conditions && <div><b>Conditions:</b> {r.conditions}</div>}{ex && <div><b>Exception:</b> {ex.justification}</div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {exceptions.length > 0 && (
        <Card title="Approved exceptions" meta="PPM-CN-005" flush>
          <table className="t">
            <thead><tr><th>Context</th><th>Excepted items</th><th>Justification</th><th>Approved</th></tr></thead>
            <tbody>
              {exceptions.map((e) => (
                <tr key={e.id}><td>{e.context}</td><td className="small">{e.items.join(', ') || '—'}</td><td>{e.justification}</td><td className="small nowrap">{userName(e.approvedById)}<div className="muted">{fmtDateTime(e.approvedAt)}</div></td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {deciding && <GateDecisionModal review={deciding} onClose={() => setDeciding(null)} />}
    </div>
  );
}
