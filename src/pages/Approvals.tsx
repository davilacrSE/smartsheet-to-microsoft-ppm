import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AccessGrant, GateReview, Rec, User } from '../domain/types';
import { ARTIFACTS, gateDef } from '../domain/constants';
import { fmtDate, fmtDateTime, todayISO } from '../domain/calc';
import { db, projectById, userName } from '../data/store';
import { canSeeProject, gateDecisionBlocker, grantApprovalBlocker, isPmo, runChecks } from '../services/rules';
import { approveGrant, confirmNomination, rejectGrant, rejectNomination } from '../services/workflow';
import { Card, Empty, NdaBadge, ask, useAction, useMe, useStore } from '../components/ui';
import { GateDecisionModal } from './project/Governance';
import { NominateModal } from './Resources';

function myGateReviews(u: User) {
  return db.gateReviews.filter((g) => {
    const p = projectById(g.projectId);
    return g.status === 'Pending' && p && canSeeProject(u, p) && !gateDecisionBlocker(u, p, g.gate, g);
  });
}
function myGrants(u: User) {
  return db.accessGrants.filter((g) => {
    const p = projectById(g.projectId);
    return ['Pending Sponsor', 'Pending Admin'].includes(g.status) && p && canSeeProject(u, p) && !grantApprovalBlocker(u, p, g);
  });
}
function myNominations(u: User) {
  const managed = new Set(db.teams.filter((t) => t.managerId === u.id).map((t) => t.id));
  return {
    toNominate: db.demands.filter((d) => ['Requested', 'Rejected'].includes(d.status) && managed.has(d.teamId) && canSeeProject(u, projectById(d.projectId)!)),
    toConfirm: db.demands.filter((d) => d.status === 'Nominated' && (projectById(d.projectId)?.pmId === u.id) && canSeeProject(u, projectById(d.projectId)!)),
  };
}
function intakesForNda(u: User) {
  return u.roles.includes('PMO_DIRECTOR') ? db.projects.filter((p) => p.stage === 'Draft' && p.readyForReview && !p.ndaActive && p.status === 'Active') : [];
}

export function inboxCount(u: User) {
  if (u.external) return 0;
  const n = myNominations(u);
  return myGateReviews(u).length + myGrants(u).length + n.toNominate.length + n.toConfirm.length;
}

/** Everything awaiting the current user's decision (NOT-FR-002/004/009). */
export function Approvals() {
  useStore();
  const me = useMe();
  const nav = useNavigate();
  const { run } = useAction();
  const [deciding, setDeciding] = useState<GateReview | null>(null);
  const [nominating, setNominating] = useState<Rec | null>(null);
  const gates = myGateReviews(me);
  const grants = myGrants(me);
  const noms = myNominations(me);
  const nda = intakesForNda(me);
  const projectCell = (projectId: string) => {
    const p = projectById(projectId)!;
    return <><b className="num">{p.code}</b> {p.name} <NdaBadge p={p} /></>;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My approvals</h1>
          <p className="sub">Gate decisions, external access approvals and resource nominations waiting on {me.name}.</p>
        </div>
      </div>
      <div className="stack">
        <Card title="Gate & governance reviews" meta={`${gates.length} pending`} flush>
          {gates.length === 0 ? <Empty>No reviews awaiting your decision. Reviews you requested, or for projects where you are the BRM/PM, go to another approver (segregation of duties).</Empty> : (
            <table className="t">
              <thead><tr><th>Project</th><th>Review</th><th>Requested</th><th>Readiness</th><th /></tr></thead>
              <tbody>
                {gates.map((g) => {
                  const p = projectById(g.projectId)!;
                  const checks = runChecks(g.gate, p);
                  return (
                    <tr key={g.id}>
                      <td className="click" onClick={() => nav(`/projects/${p.code}/governance`)}>{projectCell(g.projectId)}</td>
                      <td>{gateDef(g.gate).name}<div className="small muted">{gateDef(g.gate).purpose}</div></td>
                      <td className="nowrap">{userName(g.requestedById)}<div className="small muted">{fmtDateTime(g.requestedAt)}</div></td>
                      <td>{checks.every((c) => c.ok) ? <span className="pill good">All {checks.length} checks met</span> : <span className="pill warn">{checks.filter((c) => !c.ok).length} of {checks.length} open</span>}</td>
                      <td className="right"><button className="btn primary sm" onClick={() => setDeciding(g)}>Decide</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="External access requests" meta={`${grants.length} pending`} flush>
          {grants.length === 0 ? <Empty>No access requests awaiting you.</Empty> : (
            <table className="t">
              <thead><tr><th>Project</th><th>Grantee</th><th>Scope</th><th>Expires</th><th>Stage</th><th /></tr></thead>
              <tbody>
                {grants.map((g: AccessGrant) => (
                  <tr key={g.id}>
                    <td>{projectCell(g.projectId)}</td>
                    <td>{g.name}<div className="small muted">{g.email}</div><div className="small">{g.justification}</div></td>
                    <td>{g.permission} · {g.scope === 'workspace' ? 'Whole workspace' : g.artifactKeys.map((k) => ARTIFACTS.find((a) => a.key === k)?.title).join(', ')}</td>
                    <td className="nowrap">{fmtDate(g.expiresAt)}</td>
                    <td><span className="pill warn">{g.status}</span></td>
                    <td className="right nowrap">
                      <button className="btn sm" onClick={async () => { const r = await ask({ title: 'Reject access request', label: 'Reason', required: true }); if (r) await run(() => rejectGrant(g, r), 'Rejected'); }}>Reject</button>{' '}
                      <button className="btn primary sm" onClick={() => run(() => approveGrant(g), g.status === 'Pending Sponsor' ? 'Approved – sent to administrator' : 'Access granted')}>Approve</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {(noms.toNominate.length > 0 || db.teams.some((t) => t.managerId === me.id)) && (
          <Card title="Resource requests for your teams" meta={`${noms.toNominate.length} awaiting nomination`} flush>
            {noms.toNominate.length === 0 ? <Empty>No open requests.</Empty> : (
              <table className="t">
                <thead><tr><th>Project</th><th>Role</th><th>Team</th><th className="num">Hours</th><th>Window</th><th /></tr></thead>
                <tbody>
                  {noms.toNominate.map((d) => (
                    <tr key={d.id}>
                      <td>{projectCell(d.projectId)}</td>
                      <td>{d.placeholder}<div className="small muted">{d.specialty}{d.status === 'Rejected' ? ` · rejected: ${d.rejectionReason}` : ''}</div></td>
                      <td>{db.teams.find((t) => t.id === d.teamId)?.name}</td>
                      <td className="num">{d.hours}</td>
                      <td className="nowrap">{fmtDate(d.startDate)} – {fmtDate(d.endDate)}</td>
                      <td className="right"><button className="btn primary sm" onClick={() => setNominating(d)}>Nominate / gap</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}

        {noms.toConfirm.length > 0 && (
          <Card title="Nominations awaiting your confirmation" meta="As Project Manager" flush>
            <table className="t">
              <thead><tr><th>Project</th><th>Role</th><th>Nominee</th><th className="num">Hours</th><th /></tr></thead>
              <tbody>
                {noms.toConfirm.map((d) => (
                  <tr key={d.id}>
                    <td>{projectCell(d.projectId)}</td>
                    <td>{d.placeholder}</td>
                    <td>{db.resources.find((r) => r.id === d.nominatedResourceId)?.name}<div className="small muted">by {userName(d.nominatedById)}</div></td>
                    <td className="num">{d.nominatedHours} / {d.hours}</td>
                    <td className="right nowrap">
                      <button className="btn sm" onClick={async () => { const r = await ask({ title: 'Reject nomination', label: 'Reason', required: true }); if (r) await run(() => rejectNomination(d, r), 'Nomination rejected'); }}>Reject</button>{' '}
                      <button className="btn primary sm" onClick={() => run(() => confirmNomination(d), 'Confirmed')}>Confirm</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {nda.length > 0 && (
          <Card title="Intakes under review" meta="PMO Director: designate confidential NDA projects before Stage Gate 0" flush>
            <table className="t">
              <thead><tr><th>Project</th><th>BRM</th><th>Submitted</th><th /></tr></thead>
              <tbody>
                {nda.map((p) => (
                  <tr key={p.id} className="click" onClick={() => nav(`/projects/${p.code}/access`)}>
                    <td>{projectCell(p.id)}</td>
                    <td>{userName(p.brmId)}</td>
                    <td>{fmtDate(p.readyForReviewAt)}</td>
                    <td className="right"><span className="small muted">Open → Access tab</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        {isPmo(me) && <p className="small muted">Today is {fmtDate(todayISO())}. Reminders for overdue status, forecasts and expiring access run from Administration → Data &amp; automation.</p>}
      </div>
      {deciding && <GateDecisionModal review={deciding} onClose={() => setDeciding(null)} />}
      {nominating && <NominateModal demand={nominating} onClose={() => setNominating(null)} />}
    </>
  );
}
