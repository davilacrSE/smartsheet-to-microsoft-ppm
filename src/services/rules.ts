import type { AccessGrant, ArtifactKey, CheckResult, CollectionName, GateKey, GateReview, Health, Project, Role, User } from '../domain/types';
import { ARTIFACTS, CHECKS, NDA_STAGES, artifactForCollection, atOrAfter } from '../domain/constants';
import { COLLECTIONS, OPEN_DEFECT_STATUSES } from '../domain/schemas';
import { addDays, daysBetween, todayISO, ym } from '../domain/calc';
import { db, recs } from '../data/store';

// ───────────────────────── Access control ─────────────────────────
// In Dataverse these rules are backed by security roles and NDA owner teams (rows the user cannot read are
// never returned); the app applies the same rules so the UI never offers an action the user cannot take.

export const hasRole = (u: User, ...roles: Role[]) => roles.some((r) => u.roles.includes(r));
export const isPmo = (u: User) => hasRole(u, 'PMO_DIRECTOR', 'PMO_ADMIN');
export const isPmoDirector = (u: User) => hasRole(u, 'PMO_DIRECTOR');
export const isAdmin = (u: User) => hasRole(u, 'SYS_ADMIN');
export const isReadOnlyViewer = (u: User) => u.roles.length > 0 && u.roles.every((r) => r === 'EXEC');
const CLOSED_STATUSES = ['Archived', 'Withdrawn', 'Rejected'];

export const ndaList = (p: Project) => db.ndaAccess.filter((a) => a.projectId === p.id);
export const onNdaList = (u: User, p: Project) => isPmoDirector(u) || ndaList(p).some((a) => a.userId === u.id);

export function activeGrantsFor(u: User, p: Project): AccessGrant[] {
  const today = todayISO();
  return db.accessGrants.filter(
    (g) => g.projectId === p.id && g.status === 'Active' && g.expiresAt >= today && (g.userId === u.id || g.email.toLowerCase() === u.email.toLowerCase()),
  );
}

/**
 * SEC-FR-012/013, RPT-FR-005/007, NDA-FR-005: NDA projects are invisible to anyone not on the access list.
 * Every list, search, dashboard, report and notification goes through this function.
 * EXT-FR-007: external users only see projects with an active, unexpired grant.
 */
export function canSeeProject(u: User, p: Project): boolean {
  if (p.ndaActive) return onNdaList(u, p);
  if (u.external) return activeGrantsFor(u, p).length > 0;
  return true;
}
export const visibleProjects = (u: User) => db.projects.filter((p) => canSeeProject(u, p));

/** ART-FR-005/006/007: artifact-level restrictions and external per-artifact scopes. */
export function canSeeArtifact(u: User, p: Project, key: ArtifactKey): boolean {
  if (!canSeeProject(u, p)) return false;
  if (p.restrictedArtifacts.includes(key) && !onNdaList(u, p) && u.id !== p.pmId) return false;
  if (u.external && !(p.ndaActive && onNdaList(u, p))) {
    return activeGrantsFor(u, p).some((g) => g.scope === 'workspace' || g.artifactKeys.includes(key));
  }
  return true;
}

export const isCoreTeam = (u: User, p: Project) => [p.brmId, p.pmId, p.baId].includes(u.id);

/** SEC-FR-005/006: BRMs, BAs and PMs update artifacts after Initiate; finance limited to PM/Finance. */
export function canEditCollection(u: User, p: Project, c: CollectionName): boolean {
  const art = artifactForCollection(c).key;
  if (!canSeeArtifact(u, p, art)) return false;
  if (p.stage === 'Draft' || p.stage === 'Archive' || CLOSED_STATUSES.includes(p.status)) return false;
  if (u.external) return activeGrantsFor(u, p).some((g) => g.permission === 'Edit' && (g.scope === 'workspace' || g.artifactKeys.includes(art)));
  if (isReadOnlyViewer(u)) return false;
  if (isPmo(u)) return true;
  if (c === 'forecastLines') return u.id === p.pmId || hasRole(u, 'FINANCE');
  if (c === 'statusUpdates') return u.id === p.pmId || u.id === p.baId;
  if (isCoreTeam(u, p)) return true;
  if (['testCases', 'uatDefects', 'hypercareDefects', 'cutoverTasks'].includes(c)) return hasRole(u, 'SME', 'ARCHITECT') || [p.technicalLeadId, p.itDeliveryLeadId].includes(u.id);
  if (c === 'requirements') return hasRole(u, 'ARCHITECT') && u.id === p.architectId;
  return false;
}

/** SEC-FR-002/003: only the BRM edits intake, and only while Draft and not yet submitted. */
export const canEditIntake = (u: User, p: Project) =>
  p.stage === 'Draft' && !p.readyForReview && p.status === 'Active' && hasRole(u, 'BRM') && (u.id === p.brmId || u.id === p.createdById);

export function canEditRecord(u: User, p: Project): boolean {
  if (u.external || isReadOnlyViewer(u)) return false;
  if (p.stage === 'Draft' || p.stage === 'Archive' || CLOSED_STATUSES.includes(p.status)) return false;
  return isPmo(u) || isCoreTeam(u, p);
}

export const canEditFinance = (u: User, p: Project) => !u.external && p.stage !== 'Draft' && p.stage !== 'Archive' && (isPmo(u) || u.id === p.pmId || hasRole(u, 'FINANCE'));

export const canRequestGate = (u: User, p: Project) => !u.external && !isReadOnlyViewer(u) && p.status === 'Active' && (isPmo(u) || isCoreTeam(u, p));

/** SEC-FR-009 + SEC-FR-010 (segregation of duties: no self-approval). */
export function gateDecisionBlocker(u: User, p: Project, gate: GateKey, review?: GateReview): string | null {
  if (u.external) return 'External users cannot approve gates';
  const roles = db.config.gateApprovers[gate] || [];
  if (!hasRole(u, ...roles)) return `Requires one of: ${roles.join(', ')}`;
  if (review && review.requestedById === u.id) return 'Segregation of duties: you requested this review';
  if (u.id === p.pmId || u.id === p.brmId) return 'Segregation of duties: the project BRM/PM cannot approve their own gate';
  return null;
}

export function grantApprovalBlocker(u: User, p: Project, g: AccessGrant): string | null {
  if (g.status === 'Pending Sponsor') {
    if (u.id !== p.sponsorId && u.id !== p.pmId) return 'Requires the project sponsor or owner (PM)';
    if (u.id === g.requestedById) return 'Segregation of duties: you requested this access';
    return null;
  }
  if (g.status === 'Pending Admin') return isAdmin(u) ? null : 'Requires a System Administrator';
  return 'Not pending approval';
}

export function projectPermissions(u: User, p: Project) {
  const collections = Object.fromEntries(COLLECTIONS.map((c) => [c, canEditCollection(u, p, c)])) as Record<CollectionName, boolean>;
  const artifacts = Object.fromEntries(ARTIFACTS.map((a) => [a.key, canSeeArtifact(u, p, a.key)])) as Record<ArtifactKey, boolean>;
  const pmoDir = isPmoDirector(u);
  return {
    editIntake: canEditIntake(u, p),
    recallIntake: p.stage === 'Draft' && p.readyForReview && u.id === p.brmId && p.status === 'Active',
    editRecord: canEditRecord(u, p),
    editFinance: canEditFinance(u, p),
    editWbsPo: canEditFinance(u, p) && atOrAfter(p.stage, 'ACT Approved / Execute Ready'),
    editAssignments: !u.external && (isPmo(u) || u.id === p.brmId) && p.stage !== 'Archive',
    requestGate: canRequestGate(u, p),
    transition: isPmo(u) && p.status === 'Active',
    hold: isPmo(u) && p.status === 'Active' && p.stage !== 'Archive',
    resume: isPmo(u) && p.status === 'On Hold',
    withdraw: (isPmo(u) || (u.id === p.brmId && p.stage === 'Draft')) && ['Active', 'On Hold'].includes(p.status) && p.stage !== 'Archive',
    closeComplete: isPmo(u) && p.stage === 'Close' && p.status === 'Active',
    archive: isPmo(u) && ['Closed Complete', 'Rejected', 'Withdrawn'].includes(p.status) && p.stage !== 'Archive',
    ndaDesignate: pmoDir && !p.ndaActive && !p.ndaConverted && NDA_STAGES.includes(p.stage) && p.status === 'Active',
    ndaManageAccess: p.ndaActive && (pmoDir || ndaList(p).some((a) => a.userId === u.id && a.designee)),
    ndaConvert: p.ndaActive && pmoDir && atOrAfter(p.stage, 'ACT Approved / Execute Ready'),
    manageRestrictions: !u.external && (pmoDir || u.id === p.pmId),
    requestExternalAccess: !u.external && !isReadOnlyViewer(u) && (isPmo(u) || isCoreTeam(u, p)) && p.stage !== 'Archive',
    viewAudit: !u.external,
    collections,
    artifacts,
  };
}
export type ProjectPermissions = ReturnType<typeof projectPermissions>;

// ───────────────────────── Gate completeness checks ─────────────────────────

export function validateIntake(p: Partial<Project>): string[] {
  const errs: string[] = [];
  const req: [keyof Project, string][] = [
    ['name', 'Project name'], ['mainObjective', 'Main objective'], ['desiredOutcome', 'Desired outcome / benefits case'], ['benefitType', 'Benefit type'],
    ['roadmapAlignment', 'IT roadmap alignment'], ['plannedInitiateDate', 'Planned initiate date'], ['plannedExecuteDate', 'Planned execution date'],
    ['plannedGoLiveDate', 'Planned go-live date'], ['brmId', 'BRM'], ['businessArea', 'Business area'], ['businessFunction', 'Business function'],
    ['corporatePriority', 'Corporate priority'], ['pillar', 'Primary IT pillar'],
  ];
  for (const [k, label] of req) if (p[k] === undefined || p[k] === null || p[k] === '') errs.push(`${label} is required`);
  if (p.estimatedCost == null || isNaN(Number(p.estimatedCost)) || Number(p.estimatedCost) < 0) errs.push('Estimated cost must be a non-negative number');
  if (p.estimatedBenefit == null || isNaN(Number(p.estimatedBenefit)) || Number(p.estimatedBenefit) < 0) errs.push('Estimated benefit must be a non-negative number');
  // PPM-FR-003
  if (p.plannedInitiateDate && p.plannedExecuteDate && !(p.plannedInitiateDate < p.plannedExecuteDate)) errs.push('Planned initiate date must be before the planned execution date');
  if (p.plannedInitiateDate && p.plannedGoLiveDate && !(p.plannedInitiateDate < p.plannedGoLiveDate)) errs.push('Planned initiate date must be before the planned go-live date');
  if (p.plannedExecuteDate && p.plannedGoLiveDate && p.plannedGoLiveDate < p.plannedExecuteDate) errs.push('Planned go-live date cannot be before the planned execution date');
  return errs;
}

export function latestDecision(projectId: string, gate: GateKey) {
  return db.gateReviews
    .filter((g) => g.projectId === projectId && g.gate === gate && g.status === 'Decided')
    .sort((a, b) => (b.decidedAt || '').localeCompare(a.decidedAt || ''))[0];
}
export const gateApproved = (projectId: string, gate: GateKey) => {
  const d = latestDecision(projectId, gate);
  return !!d && (d.decision === 'Approve' || d.decision === 'Approve with Exception');
};
export const pendingReview = (projectId: string, gate?: GateKey) => db.gateReviews.find((g) => g.projectId === projectId && g.status === 'Pending' && (!gate || g.gate === gate));

const activeReq = (r: any) => r.status !== 'Deferred' && r.priority !== "Won't Have" && r.approvalState !== 'Rejected';
const leafReqs = (projectId: string) => {
  const all = recs('requirements', projectId);
  const parents = new Set(all.map((r) => r.parentId).filter(Boolean));
  return all.filter((r) => !parents.has(r.id) && activeReq(r));
};
const forecastTotal = (projectId: string) => db.forecastEntries.filter((e) => e.projectId === projectId).reduce((s, e) => s + (Number(e.amount) || 0), 0);

function run(id: string, p: Project): { ok: boolean; detail?: string } {
  switch (id) {
    case 'intakeComplete': {
      const e = validateIntake(p);
      return { ok: e.length === 0, detail: e[0] };
    }
    case 'readyForReview':
      return { ok: p.readyForReview };
    case 'pmAssigned':
      return { ok: !!p.pmId };
    case 'sponsorAssigned':
      return { ok: !!p.sponsorId };
    case 'stakeholdersDefined': {
      const n = recs('stakeholders', p.id).length;
      return { ok: n >= 3, detail: `${n} stakeholder(s)` };
    }
    case 'raciDefined': {
      const rows = recs('raci', p.id);
      const missing = rows.filter((r) => !Object.values(r).some((v) => v === 'A' || v === 'A/R')).length;
      return { ok: rows.length > 0 && missing === 0, detail: rows.length ? `${missing} deliverable(s) without an Accountable party` : 'No RACI rows' };
    }
    case 'brdHasRequirements': {
      const n = recs('requirements', p.id).length;
      return { ok: n > 0, detail: `${n} requirement(s)` };
    }
    case 'brdApproved': {
      const reqs = recs('requirements', p.id).filter(activeReq);
      const pending = reqs.filter((r) => r.approvalState !== 'Approved').length;
      return { ok: reqs.length > 0 && pending === 0, detail: reqs.length ? `${pending} of ${reqs.length} pending approval` : 'No requirements' };
    }
    case 'planHasTasks': {
      const n = recs('tasks', p.id).filter((t) => t.taskType !== 'Phase').length;
      return { ok: n >= 3, detail: `${n} task(s)` };
    }
    case 'planBaselined': {
      const t = recs('tasks', p.id).filter((x) => x.taskType !== 'Phase' && x.end && x.status !== 'Not Required');
      const missing = t.filter((x) => !x.baselineEnd).length;
      return { ok: t.length > 0 && missing === 0, detail: t.length ? `${missing} task(s) without baseline` : 'No dated tasks' };
    }
    case 'resourceDemandEntered': {
      const n = recs('demands', p.id).filter((d) => d.status !== 'Cancelled').length;
      return { ok: n > 0, detail: `${n} demand line(s)` };
    }
    case 'resourceFeasibility': {
      const d = recs('demands', p.id).filter((x) => x.status !== 'Cancelled');
      const open = d.filter((x) => x.status !== 'Confirmed');
      return { ok: d.length > 0 && open.length === 0, detail: d.length ? `${open.length} line(s) not confirmed (${open.filter((x) => x.status === 'Gap').length} gap)` : 'No demand' };
    }
    case 'costEstimateDrafted': {
      const total = recs('costItems', p.id).reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitCost) || 0) + (Number(r.arrHardware) || 0) + (Number(r.arrSupport) || 0), 0);
      return { ok: total > 0, detail: total > 0 ? `$${Math.round(total).toLocaleString()}` : 'No costs entered' };
    }
    case 'budgetForecastEntered': {
      const total = forecastTotal(p.id);
      return { ok: total > 0, detail: total > 0 ? `$${Math.round(total).toLocaleString()} forecast` : 'No forecast' };
    }
    case 'raiddStarted': {
      const n = recs('raidd', p.id).length;
      return { ok: n > 0, detail: `${n} item(s)` };
    }
    case 'statusCurrent': {
      const last = lastStatusDate(p.id);
      return { ok: !!last && last >= addDays(todayISO(), -7), detail: last ? `Last status ${last}` : 'No status updates' };
    }
    case 'actNumberRecorded':
      return { ok: !!p.actNumber && !!p.actApprovedDate, detail: p.actNumber || 'Missing' };
    case 'wbsRecorded':
      return { ok: p.wbsElements.length > 0, detail: p.wbsElements.join(', ') || 'Missing' };
    case 'ndaConverted':
      return { ok: !p.ndaActive, detail: p.ndaActive ? 'Still in the confidential NDA workflow' : undefined };
    case 'drbIfRequired':
      return { ok: !p.drbRequired || gateApproved(p.id, 'DRB'), detail: p.drbRequired ? undefined : 'Not required' };
    case 'crbIfRequired':
      return { ok: !p.crbRequired || gateApproved(p.id, 'CRB'), detail: p.crbRequired ? undefined : 'Not required' };
    case 'cabIfRequired':
      return { ok: !p.cabRequired || gateApproved(p.id, 'CAB'), detail: p.cabRequired ? undefined : 'Not required' };
    case 'gngApproved':
      return { ok: gateApproved(p.id, 'GNG') };
    case 'uatPlanCreated': {
      const n = recs('testCases', p.id).length;
      return { ok: n > 0, detail: `${n} test case(s)` };
    }
    case 'uatCoverage': {
      const reqs = leafReqs(p.id);
      const covered = new Set(db.traces.filter((t) => t.projectId === p.id).map((t) => t.requirementId));
      const missing = reqs.filter((r) => !covered.has(r.id)).length;
      return { ok: reqs.length > 0 && missing === 0, detail: `${missing} requirement(s) without test coverage` };
    }
    case 'uatExecuted': {
      const t = recs('testCases', p.id);
      const open = t.filter((x) => ['Not Run', 'Failed', 'Blocked'].includes(x.result)).length;
      return { ok: t.length > 0 && open === 0, detail: `${open} case(s) not passed` };
    }
    case 'uatDefectsResolved': {
      const n = recs('uatDefects', p.id).filter((d) => OPEN_DEFECT_STATUSES.includes(d.status) && /^P[12]/.test(d.priority)).length;
      return { ok: n === 0, detail: `${n} open P1/P2 defect(s)` };
    }
    case 'cutoverPlanReady': {
      const n = recs('cutoverTasks', p.id).length;
      return { ok: n > 0, detail: `${n} cutover task(s)` };
    }
    case 'hypercareDefectsClosed': {
      const n = recs('hypercareDefects', p.id).filter((d) => OPEN_DEFECT_STATUSES.includes(d.status)).length;
      return { ok: n === 0, detail: `${n} open defect(s)` };
    }
    default:
      return { ok: true };
  }
}

export const checkOk = (id: string, p: Project) => run(id, p).ok;

export function runChecks(context: string, p: Project): CheckResult[] {
  return (db.config.gateChecks[context] || []).map((id) => {
    const def = CHECKS.find((c) => c.id === id);
    return { id, label: def?.label ?? id, artifact: def?.artifact, ...run(id, p) };
  });
}

/** BRD-FR-005: requirements with no linked test coverage. */
export function uncoveredRequirements(projectId: string) {
  const covered = new Set(db.traces.filter((t) => t.projectId === projectId).map((t) => t.requirementId));
  return leafReqs(projectId).filter((r) => !covered.has(r.id));
}

// ───────────────────────── Health & freshness ─────────────────────────

export const lastStatusDate = (projectId: string) => recs('statusUpdates', projectId).map((s) => s.statusDate as string).sort().pop();
export const projectForecastTotal = forecastTotal;
export const projectActualTotal = (projectId: string) => db.actuals.filter((a) => a.projectId === projectId).reduce((s, a) => s + a.amount, 0);
export const projectBudget = (p: Project) => p.approvedBudget || recs('forecastLines', p.id).reduce((s, l) => s + (Number(l.approvedBudget) || 0), 0) || 0;

/** STAT-FR-005: optional calculated component health, shown beside (never overwriting) the PM's values. */
export function suggestedHealth(p: Project): Record<'scope' | 'schedule' | 'resource' | 'budget', { value: Health; why: string }> {
  const cfg = db.config;
  const raidd = recs('raidd', p.id).filter((r) => ['Open', 'In Progress'].includes(r.status));
  const scopeOpen = raidd.filter((r) => ['Change Request', 'Decision'].includes(r.type));
  const scopeBlocking = scopeOpen.filter((r) => r.escalated && r.dueDate < todayISO());
  const scope: { value: Health; why: string } = scopeBlocking.length
    ? { value: 'Red', why: `${scopeBlocking.length} escalated scope decision(s) overdue` }
    : scopeOpen.length
      ? { value: 'Yellow', why: `${scopeOpen.length} pending change request/decision(s)` }
      : { value: 'Green', why: 'No pending scope changes' };

  const keyTasks = recs('tasks', p.id).filter((t) => ['Milestone', 'Gate'].includes(t.taskType) && t.status !== 'Complete' && t.status !== 'Not Required' && t.end && t.baselineEnd);
  const worst = Math.max(0, ...keyTasks.map((t) => daysBetween(t.baselineEnd, t.end)));
  const goLiveLate = p.plannedGoLiveDate && keyTasks.some((t) => /go-live/i.test(t.name) && t.end > t.baselineEnd);
  const schedule: { value: Health; why: string } =
    worst > cfg.scheduleRedDays || goLiveLate
      ? { value: 'Red', why: goLiveLate ? 'Go-live forecast past baseline' : `Key milestone ${worst} days late` }
      : worst > cfg.scheduleYellowDays
        ? { value: 'Yellow', why: `Key milestone forecast ${worst} days late (recoverable)` }
        : { value: 'Green', why: 'Key milestones on track' };

  const demand = recs('demands', p.id).filter((d) => d.status !== 'Cancelled');
  const gaps = demand.filter((d) => d.status === 'Gap');
  const criticalGap = gaps.some((d) => d.startDate && daysBetween(todayISO(), d.startDate) <= cfg.resourceGapRedDays);
  const pending = demand.filter((d) => ['Requested', 'Nominated', 'Rejected'].includes(d.status));
  const resource: { value: Health; why: string } = criticalGap
    ? { value: 'Red', why: 'Resource gap affects work starting within 30 days' }
    : gaps.length || pending.length
      ? { value: 'Yellow', why: `${pending.length} nomination(s) pending, ${gaps.length} gap(s)` }
      : { value: 'Green', why: demand.length ? 'All required resources confirmed' : 'No resource demand entered' };

  const budget = projectBudget(p);
  const fc = forecastTotal(p.id);
  const over = budget ? ((fc - budget) / budget) * 100 : 0;
  const budgetH: { value: Health; why: string } =
    atOrAfter(p.stage, 'ACT Approved / Execute Ready') && !budget
      ? { value: 'Red', why: 'Funding unresolved (no approved budget)' }
      : !budget
        ? { value: 'Green', why: 'Pre-ACT: no approved budget yet' }
        : over > cfg.budgetTolerancePct
          ? { value: 'Red', why: `Forecast ${over.toFixed(1)}% over approved budget` }
          : over > 0
            ? { value: 'Yellow', why: `Forecast ${over.toFixed(1)}% over budget (within ${cfg.budgetTolerancePct}% tolerance)` }
            : { value: 'Green', why: 'Forecast within approved budget' };
  return { scope, schedule, resource, budget: budgetH };
}

export type Freshness = 'fresh' | 'due' | 'overdue' | 'n/a';

/** DATA-FR-001/002/004: weekly (plan, RAIDD, status) and monthly (resources, forecast) update cadence. */
export function freshness(p: Project): Record<'plan' | 'raidd' | 'status' | 'resources' | 'forecast', { state: Freshness; last?: string }> {
  const required = db.config.statusRequiredStages.includes(p.stage) && p.status === 'Active';
  const lastOf = (c: CollectionName) => recs(c, p.id).map((r) => r.updatedAt).sort().pop();
  const weekly = (last?: string): Freshness => (!required ? 'n/a' : !last ? 'overdue' : last.slice(0, 10) >= addDays(todayISO(), -7) ? 'fresh' : last.slice(0, 10) >= addDays(todayISO(), -10) ? 'due' : 'overdue');
  const monthly = (last?: string): Freshness => (!required ? 'n/a' : !last ? 'overdue' : ym(last) >= ym(todayISO()) ? 'fresh' : last.slice(0, 10) >= addDays(todayISO(), -35) ? 'due' : 'overdue');
  const status = lastStatusDate(p.id);
  const fcLast = db.forecastEntries.filter((e) => e.projectId === p.id).map((e) => e.updatedAt || '').sort().pop();
  return {
    plan: { state: weekly(lastOf('tasks')), last: lastOf('tasks') },
    raidd: { state: weekly(lastOf('raidd')), last: lastOf('raidd') },
    status: { state: weekly(status), last: status },
    resources: { state: monthly(lastOf('demands')), last: lastOf('demands') },
    forecast: { state: monthly(fcLast), last: fcLast },
  };
}

export const statusOverdue = (p: Project) => freshness(p).status.state === 'overdue';
