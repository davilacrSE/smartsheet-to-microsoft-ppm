import type { AccessGrant, ArtifactKey, CollectionName, GateDecision, GateKey, GateReview, Health, Project, Rec, Resource, Scenario, Stage, TransitionKey, User } from '../domain/types';
import { ARTIFACTS, COST_TEMPLATE, GATES, NDA_STAGES, PLAN_TEMPLATE, RACI_DELIVERABLES, RAIDD_PREFIX, TRANSITIONS, artifactForCollection, atOrAfter, checkLabel, gateDef } from '../domain/constants';
import { SCHEMAS } from '../domain/schemas';
import { addDays, daysBetween, emailDomain, overallHealth, todayISO } from '../domain/calc';
import { db, insert, insertMany, me, nowIso, patch, projectById, recs, remove, uploadFile, userById } from '../data/store';
import { audit, auditChanges, notify, usersWithRole } from './events';
import { BRAND } from '../brand';
import {
  canEditCollection, canEditFinance, canEditIntake, canEditRecord, canRequestGate, gateApproved, gateDecisionBlocker, grantApprovalBlocker, hasRole,
  isAdmin, isPmo, isPmoDirector, ndaList, pendingReview, projectPermissions, runChecks, validateIntake,
} from './rules';

export class WorkflowError extends Error {}
const fail = (msg: string): never => {
  throw new WorkflowError(msg);
};
const link = (p: Project, tab = '') => `/projects/${p.code}${tab ? '/' + tab : ''}`;

// ───────────────────────── Intake (§9.2) ─────────────────────────

export const INTAKE_FIELDS = [
  'name', 'mainObjective', 'desiredOutcome', 'estimatedCost', 'estimatedBenefit', 'benefitType', 'roadmapAlignment', 'plannedInitiateDate',
  'plannedExecuteDate', 'plannedGoLiveDate', 'plannedEndDate', 'businessArea', 'businessFunction', 'corporatePriority', 'program', 'pillar', 'agile',
  'itgc', 'itgcApplications', 'transformation',
] as const;

/** PPM-FR-001/004, SEC-FR-002: BRM-only intake; Draft stage + unique Project ID (Dataverse autonumber). */
export async function createIntake(data: Partial<Project>, submit: boolean): Promise<Project> {
  const u = me();
  if (!hasRole(u, 'BRM') || u.external) fail('Only Business Relationship Managers can create project intake requests.');
  const draft: Partial<Project> = { ...pick(data, INTAKE_FIELDS), brmId: u.id };
  if (submit) {
    const errs = validateIntake(draft);
    if (errs.length) fail(errs.join('\n'));
  } else if (!draft.name) fail('Project name is required to save a draft.');
  const ts = nowIso();
  const p = await insert<Project>('projects', {
    ...draft,
    estimatedCost: Number(draft.estimatedCost) || 0,
    estimatedBenefit: Number(draft.estimatedBenefit) || 0,
    projectType: 'Project',
    stage: 'Draft',
    status: 'Active',
    readyForReview: false,
    createdById: u.id,
    stageEnteredAt: ts,
    wbsElements: [],
    poNumbers: [],
    governanceDrivers: [],
    restrictedArtifacts: [],
    drbRequired: false,
    crbRequired: false,
    cabRequired: false,
    ndaActive: false,
    ndaConverted: false,
    agile: !!draft.agile,
    itgc: !!draft.itgc,
  });
  await audit({ action: 'INTAKE_CREATED', entity: 'IT Project', entityId: p.id, projectId: p.id, details: `Draft intake ${p.code} created` });
  if (submit) await markReadyForReview(p);
  return p;
}

export async function updateIntake(p: Project, changes: Partial<Project>) {
  if (!canEditIntake(me(), p)) fail('Intake can only be edited by its BRM while in Draft and not yet submitted.');
  const ch = pick(changes, INTAKE_FIELDS);
  if (!ch.name && 'name' in ch) fail('Project name is required.');
  await auditChanges({ action: 'FIELD_CHANGE', entity: 'IT Project', entityId: p.id, projectId: p.id, artifact: 'projectRecord' }, p, ch);
  await patch('projects', p.id, ch);
}

/** PPM-FR-005/006, NOT-FR-001: BRM marks Ready for Review → PMO Director and PMO Admin notified; SG0 pending. */
export async function markReadyForReview(p: Project) {
  const u = me();
  if (!(u.id === p.brmId && p.stage === 'Draft' && !p.readyForReview)) fail('Only the BRM can submit a Draft intake for review.');
  const errs = validateIntake(p);
  if (errs.length) fail(errs.join('\n'));
  await patch('projects', p.id, { readyForReview: true, readyForReviewAt: nowIso() });
  await insert('gateReviews', { projectId: p.id, gate: 'SG0', status: 'Pending', requestedById: u.id, requestedAt: nowIso(), requestNotes: 'Intake ready for PMO review', failedChecks: [] });
  await audit({ action: 'READY_FOR_REVIEW', entity: 'IT Project', entityId: p.id, projectId: p.id, details: 'Intake marked Ready for Review' });
  await notify(usersWithRole('PMO_DIRECTOR', 'PMO_ADMIN'), { projectId: p.id, type: 'intake', title: `Intake ready for review: ${p.name}`, body: `${u.name} marked ${p.code} Ready for Review.`, link: link(p, 'governance') });
}

export async function recallIntake(p: Project) {
  if (!projectPermissions(me(), p).recallIntake) fail('Only the BRM can recall a submitted intake.');
  const review = pendingReview(p.id, 'SG0');
  if (review) await patch('gateReviews', review.id, { status: 'Cancelled', comments: 'Recalled by BRM' });
  await patch('projects', p.id, { readyForReview: false });
  await audit({ action: 'INTAKE_RECALLED', entity: 'IT Project', entityId: p.id, projectId: p.id });
}

export async function addAttachment(p: Project, file: File) {
  const u = me();
  if (!(canEditIntake(u, p) || canEditRecord(u, p))) fail('You cannot add attachments to this project.');
  if (file.size > 25 * 1024 * 1024) fail('Attachments are limited to 25 MB.');
  const row = await insert('attachments', { projectId: p.id, fileName: file.name, size: file.size, uploadedById: u.id, uploadedAt: nowIso() });
  await uploadFile('attachments', row.id, 'file', file.name, await file.arrayBuffer());
  await audit({ action: 'ATTACHMENT_ADDED', entity: 'Intake Attachment', entityId: row.id, projectId: p.id, details: file.name });
}

// ───────────────────────── Project record ─────────────────────────

const RECORD_FIELDS = [
  'name', 'mainObjective', 'desiredOutcome', 'plannedExecuteDate', 'plannedGoLiveDate', 'plannedEndDate', 'estHoursBucket', 'existingApplications',
  'businessOwnerApps', 'dataMigration', 'dataMigrationDetails', 'integrationWork', 'infrastructureWork', 'cyberWork', 'insightWork',
  'connectionsToOtherSystems', 'drbRequired', 'crbRequired', 'cabRequired', 'governanceDrivers', 'serviceNowChange', 'jiraKey', 'agile', 'itgc',
  'itgcApplications', 'lessonsLearned', 'program',
] as const;
const ASSIGNMENT_FIELDS = ['sponsorId', 'pmId', 'baId', 'itDeliveryLeadId', 'technicalLeadId', 'architectId'] as const;
const FINANCE_FIELDS = ['actNumber', 'actApprovedDate', 'approvedBudget', 'pi', 'costCenter', 'multipleCostCenters', 'glCode'] as const;
const WBS_FIELDS = ['wbsElements', 'poNumbers'] as const;

export async function updateRecord(p: Project, changes: Partial<Project>) {
  const u = me();
  const perm = projectPermissions(u, p);
  const allowed: string[] = [];
  if (perm.editRecord) allowed.push(...RECORD_FIELDS);
  if (perm.editAssignments) allowed.push(...ASSIGNMENT_FIELDS);
  if (perm.editFinance) allowed.push(...FINANCE_FIELDS);
  if (perm.editWbsPo) allowed.push(...WBS_FIELDS);
  const blocked = Object.keys(changes).filter((k) => !allowed.includes(k));
  if (blocked.length) fail(`You are not permitted to change: ${blocked.join(', ')}`);
  if ('name' in changes && !changes.name) fail('Project name is required.');
  if (changes.plannedGoLiveDate && (changes.plannedExecuteDate ?? p.plannedExecuteDate) > changes.plannedGoLiveDate) fail('Go-live cannot be before execution.');
  await auditChanges({ action: 'FIELD_CHANGE', entity: 'IT Project', entityId: p.id, projectId: p.id, artifact: 'projectRecord' }, p, changes);
  await patch('projects', p.id, changes);
  if ('pmId' in changes && changes.pmId && changes.pmId !== p.pmId) {
    await notify([changes.pmId], { projectId: p.id, type: 'assignment', title: `You were assigned as Project Manager: ${p.name}`, body: `${u.name} assigned you to ${p.code}.`, link: link(p) });
  }
}

// ───────────────────────── Stage gates (§9.3) ─────────────────────────

export function gateContextChecks(p: Project, key: string) {
  return runChecks(key, p);
}

/** NOT-FR-002: request a gate/governance review; approvers are notified. */
export async function requestGate(p: Project, gate: GateKey, notes: string) {
  const u = me();
  if (!canRequestGate(u, p)) fail('You cannot request reviews for this project.');
  const def = gateDef(gate);
  if (!def.allowedStages.includes(p.stage)) fail(`${def.name} is not available in the ${p.stage} stage.`);
  if (gate === 'SG0') fail('Stage Gate 0 is requested by the BRM marking the intake Ready for Review.');
  if (pendingReview(p.id, gate)) fail(`A ${def.name} review is already pending.`);
  const failed = runChecks(gate, p).filter((c) => !c.ok).map((c) => c.id);
  const review = await insert<GateReview>('gateReviews', { projectId: p.id, gate, status: 'Pending', requestedById: u.id, requestedAt: nowIso(), requestNotes: notes, failedChecks: failed });
  await audit({ action: 'GATE_REQUESTED', entity: 'Gate Review', entityId: review.id, projectId: p.id, details: `${def.name} requested${failed.length ? ` with ${failed.length} open check(s)` : ''}` });
  const approvers = db.users.filter((x) => x.active && !gateDecisionBlocker(x, p, gate, review)).map((x) => x.id);
  await notify(approvers, { projectId: p.id, type: 'gate', title: `${def.name} review pending: ${p.name}`, body: `${u.name} requested a ${def.name} decision for ${p.code}.`, link: link(p, 'governance') });
  return review;
}

/**
 * PPM-FR-027..030, AUD-FR-003: record a gate decision. Plain approval is blocked while mandatory checks fail;
 * "Approve with Exception" requires a documented justification and creates an auditable exception (PPM-CN-005).
 */
export async function decideGate(p: Project, review: GateReview, input: { decision: GateDecision; comments: string; conditions?: string; justification?: string }) {
  const u = me();
  const blocker = gateDecisionBlocker(u, p, review.gate, review);
  if (blocker) fail(blocker);
  if (review.status !== 'Pending') fail('This review is no longer pending.');
  const def = gateDef(review.gate);
  if (!def.allowedStages.includes(p.stage)) fail(`Project is no longer in a stage where ${def.name} applies.`);
  if (!input.comments?.trim()) fail('Decision comments are required.');
  const failed = runChecks(review.gate, p).filter((c) => !c.ok);
  let exceptionId: string | undefined;
  if (input.decision === 'Approve' && failed.length) fail(`Cannot approve: ${failed.length} mandatory requirement(s) incomplete. Complete them or use "Approve with Exception".`);
  if (input.decision === 'Approve with Exception') {
    if (!input.justification?.trim()) fail('An exception requires a documented justification.');
    const ex = await insert('exceptions', { projectId: p.id, context: review.gate, items: failed.map((c) => c.id), justification: input.justification, approvedById: u.id, approvedAt: nowIso() });
    exceptionId = ex.id;
    await audit({ action: 'EXCEPTION_APPROVED', entity: 'Governance Exception', entityId: ex.id, projectId: p.id, details: `${def.name}: ${failed.map((c) => c.label).join('; ') || 'no open checks'} — ${input.justification}` });
  }
  await patch('gateReviews', review.id, { status: 'Decided', decision: input.decision, decidedById: u.id, decidedAt: nowIso(), comments: input.comments, conditions: input.conditions, failedChecks: failed.map((c) => c.id), exceptionId });
  await audit({ action: 'GATE_DECISION', entity: 'Gate Review', entityId: review.id, projectId: p.id, field: 'decision', after: input.decision, details: `${def.name}: ${input.decision}. ${input.comments}${input.conditions ? ` Conditions: ${input.conditions}` : ''}` });

  const approved = input.decision === 'Approve' || input.decision === 'Approve with Exception';
  if (approved && def.to) await moveStage(p, def.to, review.gate === 'SG0' ? { approvalDate: nowIso() } : {});
  if (approved && review.gate === 'SG0') await initializeArtifacts(p);
  if (input.decision === 'Rework' && review.gate === 'SG0') await patch('projects', p.id, { readyForReview: false });
  if (input.decision === 'Hold') await setStatus(p, 'On Hold', `${def.name} decision: Hold`);
  if (input.decision === 'Stop') await setStatus(p, 'Rejected', `${def.name} decision: Stop`);
  await notify([review.requestedById, p.brmId, p.pmId, p.sponsorId], { projectId: p.id, type: 'gate', title: `${def.name} ${input.decision}: ${p.name}`, body: `${u.name}: ${input.comments}`, link: link(p, 'governance') });
}

async function moveStage(p: Project, to: Stage, extra: Partial<Project> = {}) {
  const from = p.stage;
  await patch('projects', p.id, { stage: to, stageEnteredAt: nowIso(), ...extra });
  await audit({ action: 'STAGE_CHANGE', entity: 'IT Project', entityId: p.id, projectId: p.id, field: 'stage', before: from, after: to });
}

async function setStatus(p: Project, status: Project['status'], reason: string) {
  const before = p.status;
  await patch('projects', p.id, { status });
  await audit({ action: 'STATUS_CHANGE', entity: 'IT Project', entityId: p.id, projectId: p.id, field: 'status', before, after: status, details: reason });
}

/** Non-gate stage moves (Execute, Go-Live, Close) — PMO only, with the same check/exception discipline. */
export async function transition(p: Project, key: TransitionKey, justification?: string) {
  const u = me();
  if (!isPmo(u)) fail('Stage advancement is restricted to PMO roles (SEC-FR-009).');
  const t = TRANSITIONS.find((x) => x.key === key)!;
  if (p.stage !== t.from) fail(`Project must be in ${t.from}.`);
  if (p.status !== 'Active') fail('Project must be Active.');
  if (key === 'START_EXECUTE' && p.ndaActive) fail('Convert the NDA project to the regular workflow before Execute.');
  const failed = runChecks(key, p).filter((c) => !c.ok);
  if (failed.length) {
    if (!justification?.trim()) fail(`Blocked: ${failed.map((c) => c.label).join('; ')}. Record an exception justification to proceed.`);
    if (!isPmoDirector(u)) fail('Only the PMO Director can approve an exception for this transition.');
    const ex = await insert('exceptions', { projectId: p.id, context: key, items: failed.map((c) => c.id), justification, approvedById: u.id, approvedAt: nowIso() });
    await audit({ action: 'EXCEPTION_APPROVED', entity: 'Governance Exception', entityId: ex.id, projectId: p.id, details: `${t.label}: ${failed.map((c) => c.label).join('; ')} — ${justification}` });
  }
  await moveStage(p, t.to, key === 'GO_LIVE' ? { actualGoLiveDate: todayISO() } : {});
  await notify([p.brmId, p.pmId, p.sponsorId], { projectId: p.id, type: 'stage', title: `${p.name} moved to ${t.to}`, body: `${u.name} advanced ${p.code} to ${t.to}.`, link: link(p) });
}

/** Hold / resume / withdraw / closure / manual archive (PPM-FR-026, PPM-FR-031: archiving is never automatic). */
export async function statusAction(p: Project, action: 'hold' | 'resume' | 'withdraw' | 'closeComplete' | 'archive', reason: string) {
  const perm = projectPermissions(me(), p);
  if (!perm[action]) fail('You are not permitted to perform this action.');
  if (!reason.trim()) fail('A reason is required.');
  if (action === 'hold') await setStatus(p, 'On Hold', reason);
  if (action === 'resume') await setStatus(p, 'Active', reason);
  if (action === 'withdraw') {
    await setStatus(p, 'Withdrawn', reason);
    for (const r of db.gateReviews.filter((g) => g.projectId === p.id && g.status === 'Pending')) await patch('gateReviews', r.id, { status: 'Cancelled', comments: 'Project withdrawn' });
  }
  if (action === 'closeComplete') {
    await setStatus(p, 'Closed Complete', reason);
    await patch('projects', p.id, { closedDate: todayISO() });
  }
  if (action === 'archive') {
    await moveStage(p, 'Archive');
    await setStatus(p, 'Archived', reason);
  }
}

// ───────────────────────── Artifact initialization (ART-FR-001/002) ─────────────────────────

/**
 * Draft → Initiate approval creates each project's artifact rows in Dataverse (children of the IT Project):
 * stakeholder register, RACI, BRD skeleton, WBS project plan, cost estimator, budget/forecast lines and cutover outline.
 */
export async function initializeArtifacts(p: Project) {
  if (p.artifactsInitializedAt) return;
  const u = me();
  const brm = userById(p.brmId);
  const stakeholders = [
    { role: 'BRM', name: brm?.name, email: brm?.email, sourceInput: 'PPM Intake', steerCo: true },
    ...(p.sponsorId ? [{ role: 'Project Sponsor', name: userById(p.sponsorId)?.name, email: userById(p.sponsorId)?.email, sourceInput: 'Project Record', steerCo: true }] : []),
    ...(p.pmId ? [{ role: 'Project Manager', name: userById(p.pmId)?.name, email: userById(p.pmId)?.email, sourceInput: 'Project Record', steerCo: false }] : []),
    { role: 'PMO Director', name: userById(usersWithRole('PMO_DIRECTOR')[0])?.name, email: userById(usersWithRole('PMO_DIRECTOR')[0])?.email, sourceInput: 'Stakeholder Register', steerCo: true },
  ].filter((s) => s.name);
  await insertMany('stakeholders', stakeholders.map((s) => ({ projectId: p.id, company: BRAND.company, ...s })));
  await insertMany('raci', RACI_DELIVERABLES.map(([deliverable, raci], i) => ({ projectId: p.id, deliverable, order: i, ...raci })));
  const reqGroups = [['Business requirements', 'Business'], ['Functional requirements', 'Functional'], ['Technical requirements', 'Technical']];
  await insertMany('requirements', reqGroups.map(([title, reqType], i) => ({ projectId: p.id, title, reqType, priority: 'Must Have', status: 'Proposed', approvalState: 'Pending', order: i, source: 'Template' })));

  // WBS plan scheduled from the planned dates on the intake
  const start = todayISO();
  const exec = p.plannedExecuteDate > start ? p.plannedExecuteDate : addDays(start, 60);
  const golive = p.plannedGoLiveDate > exec ? p.plannedGoLiveDate : addDays(exec, 120);
  const span = Math.max(30, daysBetween(exec, golive));
  const window: Record<string, [string, string]> = {
    Initiate: [start, addDays(start, Math.max(14, daysBetween(start, exec) * 0.2))],
    Plan: [addDays(start, Math.max(14, daysBetween(start, exec) * 0.2)), addDays(exec, -1)],
  };
  const fracs: [string, number, number][] = [
    ['Execute Kickoff', 0, 0.01], ['Detailed Design', 0.01, 0.2], ['Design Review Board', 0.2, 0.25], ['Build', 0.25, 0.55], ['System Integration Testing', 0.55, 0.7],
    ['User Acceptance Test', 0.7, 0.86], ['Go / No-Go', 0.87, 0.87], ['Cutover', 0.88, 0.99], ['Go-Live', 1, 1],
  ];
  for (const [ph, a, b] of fracs) window[ph] = [addDays(exec, span * a), addDays(exec, span * b)];
  window.Hypercare = [golive, addDays(golive, 30)];
  window.Close = [addDays(golive, 30), addDays(golive, 45)];
  const phases = await insertMany('tasks', PLAN_TEMPLATE.map((ph, i) => ({ projectId: p.id, name: ph.phase, taskType: 'Phase', order: i, start: window[ph.phase][0], end: window[ph.phase][1], baselineStart: window[ph.phase][0], baselineEnd: window[ph.phase][1], status: i === 0 ? 'In Progress' : 'Not Started', pctComplete: 0 })));
  const tasks: Record<string, any>[] = [];
  PLAN_TEMPLATE.forEach((ph, i) => {
    const [a, b] = window[ph.phase];
    const len = Math.max(0, daysBetween(a, b));
    ph.tasks.forEach((t, ti) => {
      const ta = addDays(a, (len * ti) / ph.tasks.length);
      const tb = t.type ? ta : addDays(a, (len * (ti + 1)) / ph.tasks.length);
      tasks.push({ projectId: p.id, parentId: phases[i].id, name: t.name, taskType: t.type ?? 'Task', order: ti, start: ta, end: tb, baselineStart: ta, baselineEnd: tb, status: i === 0 && ti === 0 ? 'Complete' : 'Not Started', pctComplete: i === 0 && ti === 0 ? 100 : 0, assigneeId: p.pmId ?? brm?.id });
    });
  });
  await insertMany('tasks', tasks);

  // Cost estimator tree (CAPEX / OPEX → area → line)
  for (const [ri, root] of (['CAPEX', 'OPEX'] as const).entries()) {
    const rootRow = await insert('costItems', { projectId: p.id, itCategory: root === 'CAPEX' ? 'CAPITAL' : 'EXPENSE', expenseCategory: root, order: ri });
    const areas = await insertMany('costItems', COST_TEMPLATE.map((a, ai) => ({ projectId: p.id, parentId: rootRow.id, itCategory: a.area, expenseCategory: root, order: ai })));
    const leaves: Record<string, any>[] = [];
    COST_TEMPLATE.forEach((a, ai) => {
      a.items.forEach((item, ii) => leaves.push({ projectId: p.id, parentId: areas[ai].id, itCategory: item, expenseCategory: root, order: ii }));
      leaves.push({ projectId: p.id, parentId: areas[ai].id, itCategory: `${a.area} Internal Labor`, expenseCategory: root, laborRow: 'Internal Labor', unitOfMeasure: 'Labor Hour / USD', order: 90 });
      leaves.push({ projectId: p.id, parentId: areas[ai].id, itCategory: `${a.area} External Labor`, expenseCategory: root, laborRow: 'External Labor', unitOfMeasure: 'Labor Hour / USD', order: 91 });
    });
    await insertMany('costItems', leaves);
  }
  await insertMany('forecastLines', [
    { projectId: p.id, description: 'Internal labor', category: 'Expense', spendCategory: 'Internal Labor', approvedBudget: 0 },
    { projectId: p.id, description: 'External labor / implementation partner', category: 'Expense', spendCategory: 'External Labor', approvedBudget: 0 },
    { projectId: p.id, description: 'Software / licenses', category: 'Capital', spendCategory: 'Software / Licenses', approvedBudget: 0 },
  ]);
  await insertMany('cutoverTasks', [
    ['Pre-Cutover', 'Freeze configuration changes'], ['Pre-Cutover', 'Deploy release to production'], ['Cutover Execution', 'Data migration / validation'], ['Post-Cutover', 'Hypercare kickoff communication'], ['Rollback', 'Rollback plan validated'],
  ].map(([focusArea, taskName], i) => ({ projectId: p.id, taskId: `CO-${String(i + 1).padStart(3, '0')}`, focusArea, taskName, taskType: 'Technical', status: 'Not Started' })));
  await patch('projects', p.id, { artifactsInitializedAt: nowIso() });
  await audit({ action: 'ARTIFACTS_INITIALIZED', entity: 'IT Project', entityId: p.id, projectId: p.id, details: `Initialized ${ARTIFACTS.filter((a) => !a.system).length} artifacts in Dataverse for ${p.code}` });
  void u;
}

// ───────────────────────── Artifact rows (generic) ─────────────────────────

function nextNumber(rows: Rec[], field: string, prefix: string) {
  const max = Math.max(0, ...rows.map((r) => (String(r[field] || '').startsWith(prefix + '-') ? Number(String(r[field]).split('-').pop()) || 0 : 0)));
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/** Validates against the artifact schema, applies artifact-specific rules and audits every field change. */
export async function saveRecord(p: Project, c: CollectionName, id: string | null, data: Record<string, any>): Promise<Rec> {
  const u = me();
  if (!canEditCollection(u, p, c)) fail(`You do not have edit access to the ${artifactForCollection(c).title}.`);
  const schema = SCHEMAS[c];
  const live = id ? db[c].find((r) => r.id === id) : undefined;
  if (id && !live) fail('Row not found.');
  const existing = live ? { ...live } : undefined; // snapshot: the store updates rows in place
  const clean: Record<string, any> = {};
  for (const f of schema.fields) {
    if (!(f.key in data) || f.readOnly) continue;
    let v = data[f.key];
    if (['number', 'currency', 'percent'].includes(f.type)) v = v === '' || v == null ? null : Number(v);
    if (f.type === 'checkbox') v = !!v;
    clean[f.key] = v;
  }
  for (const k of ['parentId', 'order']) if (k in data) clean[k] = data[k];
  const merged = { ...existing, ...clean };
  const missing = schema.fields.filter((f) => f.required && !f.readOnly && (merged[f.key] === undefined || merged[f.key] === null || merged[f.key] === ''));
  if (missing.length) fail(`Required: ${missing.map((f) => f.label).join(', ')}`);
  const requirementIds: string[] | undefined = c === 'testCases' && 'requirementIds' in data ? data.requirementIds : undefined;
  delete clean.requirementIds;

  // Artifact-specific rules
  if (c === 'statusUpdates') clean.overall = overallHealth(merged as { scope?: Health; schedule?: Health; resource?: Health; budget?: Health }); // STAT-FR-004
  if (c === 'raidd' && !existing) clean.raiddId = nextNumber(recs('raidd', p.id), 'raiddId', RAIDD_PREFIX[merged.type] || 'RA');
  if (c === 'raidd' && merged.status === 'Closed' && existing?.status !== 'Closed') clean.closedAt = nowIso();
  if (c === 'testCases' && !existing) clean.ref = nextNumber(recs('testCases', p.id), 'ref', 'TC');
  if (c === 'uatDefects' && !existing) clean.defectNo = nextNumber(recs('uatDefects', p.id), 'defectNo', 'UAT');
  if (c === 'hypercareDefects' && !existing) clean.defectNo = nextNumber(recs('hypercareDefects', p.id), 'defectNo', 'HC');
  if (c === 'cutoverTasks' && !existing) clean.taskId = nextNumber(recs('cutoverTasks', p.id), 'taskId', 'CO');
  if (c === 'demands' && !existing) clean.status = 'Requested';
  if (c === 'forecastLines' && !atOrAfter(p.stage, 'ACT Approved / Execute Ready')) {
    if ((clean.wbsElement && clean.wbsElement !== existing?.wbsElement) || (clean.poNumber && clean.poNumber !== existing?.poNumber)) fail('WBS element and PO number are captured after ACT approval (FIN-FR-002).');
  }
  if (c === 'tasks' && merged.start && merged.end && merged.end < merged.start) fail('Finish date cannot be before start date.');
  if (c === 'demands' && merged.startDate && merged.endDate && merged.endDate < merged.startDate) fail('End date cannot be before start date.');

  let row: Rec;
  const art = artifactForCollection(c).key;
  if (existing) {
    await auditChanges({ action: 'FIELD_CHANGE', entity: schema.singular, entityId: existing.id, projectId: p.id, artifact: art }, existing, clean);
    row = await patch<Rec>(c, existing.id, clean);
  } else {
    if (schema.hierarchical && clean.order === undefined) clean.order = recs(c, p.id).filter((r) => (r.parentId || '') === (clean.parentId || '')).length;
    row = await insert<Rec>(c, { projectId: p.id, ...clean });
    await audit({ action: 'ROW_CREATED', entity: schema.singular, entityId: row.id, projectId: p.id, artifact: art, details: String(row[schema.fields[0].key] ?? '') });
  }
  if (requirementIds) await syncTraces(p, row.id, requirementIds);

  // Side effects
  if (c === 'statusUpdates') await applyStatusHealth(p, row);
  if (c === 'raidd' && row.escalated && !existing?.escalated) {
    await notify([...usersWithRole('PMO_DIRECTOR'), p.sponsorId], { projectId: p.id, type: 'escalation', title: `RAIDD escalated: ${row.title}`, body: `${u.name} escalated ${row.raiddId} on ${p.code}${row.askToLeadership ? ` — ask: ${row.askToLeadership}` : ''}.`, link: link(p, 'raidd') });
  }
  if (c === 'demands' && !existing) {
    const team = db.teams.find((t) => t.id === row.teamId);
    await notify([team?.managerId], { projectId: p.id, type: 'nomination', title: `Resource request: ${p.name}`, body: `${row.hours} hrs of ${row.specialty} requested for ${team?.name}.`, link: '/resources?tab=nominations' });
  }
  return row;
}

async function applyStatusHealth(p: Project, s: Rec) {
  const latest = recs('statusUpdates', p.id).sort((a, b) => b.statusDate.localeCompare(a.statusDate))[0];
  if (latest?.id !== s.id) return;
  const next = { healthScope: s.scope, healthSchedule: s.schedule, healthResource: s.resource, healthBudget: s.budget, healthOverall: s.overall, healthAsOf: s.statusDate };
  await auditChanges({ action: 'HEALTH_CHANGE', entity: 'IT Project', entityId: p.id, projectId: p.id, artifact: 'status' }, p, next);
  await patch('projects', p.id, next);
}

async function syncTraces(p: Project, testCaseId: string, requirementIds: string[]) {
  const current = db.traces.filter((t) => t.testCaseId === testCaseId);
  for (const t of current.filter((t) => !requirementIds.includes(t.requirementId))) await remove('traces', t.id);
  const have = new Set(current.map((t) => t.requirementId));
  await insertMany('traces', requirementIds.filter((r) => !have.has(r)).map((requirementId) => ({ projectId: p.id, testCaseId, requirementId })));
}

export async function deleteRecord(p: Project, c: CollectionName, rec: Rec) {
  if (!canEditCollection(me(), p, c)) fail('You do not have edit access to this artifact.');
  const schema = SCHEMAS[c];
  const descendants = (id: string): Rec[] => recs(c, p.id).filter((r) => r.parentId === id).flatMap((r) => [...descendants(r.id), r]);
  for (const r of [...descendants(rec.id), rec]) {
    if (c === 'testCases' || c === 'requirements') for (const t of db.traces.filter((t) => t.testCaseId === r.id || t.requirementId === r.id)) await remove('traces', t.id);
    if (c === 'forecastLines') for (const e of db.forecastEntries.filter((e) => e.lineId === r.id)) await remove('forecastEntries', e.id);
    await remove(c, r.id);
  }
  await audit({ action: 'ROW_DELETED', entity: schema.singular, entityId: rec.id, projectId: p.id, artifact: artifactForCollection(c).key, before: rec[schema.fields[0].key] });
}

export async function moveRecord(p: Project, c: CollectionName, rec: Rec, dir: 'up' | 'down' | 'indent' | 'outdent') {
  if (!canEditCollection(me(), p, c)) fail('You do not have edit access to this artifact.');
  const siblings = (parentId?: string) => recs(c, p.id).filter((r) => (r.parentId || '') === (parentId || '')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const sibs = siblings(rec.parentId);
  const i = sibs.findIndex((r) => r.id === rec.id);
  if (dir === 'up' || dir === 'down') {
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= sibs.length) return;
    const other = sibs[j];
    await patch(c, rec.id, { order: other.order ?? j });
    await patch(c, other.id, { order: rec.order ?? i });
  } else if (dir === 'indent') {
    if (i <= 0) return;
    const newParent = sibs[i - 1];
    await patch(c, rec.id, { parentId: newParent.id, order: siblings(newParent.id).length });
  } else {
    if (!rec.parentId) return;
    const parent = recs(c, p.id).find((r) => r.id === rec.parentId);
    await patch(c, rec.id, { parentId: parent?.parentId ?? null, order: (parent?.order ?? 0) + 0.5 });
  }
}

// ───────────────────────── Budget & forecast (§9.8) ─────────────────────────

/** FIN-FR-001/006: monthly forecast values with audit history of every change. */
export async function setForecast(p: Project, lineId: string, period: string, amount: number | null) {
  if (!canEditCollection(me(), p, 'forecastLines')) fail('Only the Project Manager or Finance can update the forecast.');
  const existing = db.forecastEntries.find((e) => e.lineId === lineId && e.period === period);
  const value = amount == null || isNaN(amount) ? 0 : amount;
  if (existing) {
    if (existing.amount === value) return;
    await audit({ action: 'FORECAST_CHANGE', entity: 'Forecast Entry', entityId: existing.id, projectId: p.id, artifact: 'budget', field: period, before: existing.amount, after: value });
    await patch('forecastEntries', existing.id, { amount: value });
  } else if (value) {
    const e = await insert('forecastEntries', { projectId: p.id, lineId, period, amount: value });
    await audit({ action: 'FORECAST_CHANGE', entity: 'Forecast Entry', entityId: e.id, projectId: p.id, artifact: 'budget', field: period, before: 0, after: value });
  }
}

/** FIN-FR-004: import SAP actuals (CSV) — SAP remains the system of record; rows are read-only in PPM. */
export async function importActuals(csv: string) {
  const u = me();
  if (!(hasRole(u, 'FINANCE') || isAdmin(u) || isPmo(u))) fail('Only Finance, PMO or administrators can import SAP actuals.');
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift()!.toLowerCase().split(',').map((h) => h.trim());
  const col = (n: string) => header.indexOf(n);
  if (col('period') < 0 || col('amount') < 0 || (col('wbs') < 0 && col('project') < 0)) fail('CSV needs columns: wbs or project, period (YYYY-MM), amount, category, docref');
  let ok = 0;
  const errors: string[] = [];
  const rows: Record<string, any>[] = [];
  lines.forEach((line, i) => {
    const v = line.split(',').map((x) => x.trim());
    const wbs = v[col('wbs')] || '';
    const p = db.projects.find((x) => (wbs && x.wbsElements.includes(wbs)) || (col('project') >= 0 && x.code === v[col('project')]));
    if (!p) return errors.push(`Line ${i + 2}: no project for ${wbs || v[col('project')]}`);
    if (!/^\d{4}-\d{2}$/.test(v[col('period')])) return errors.push(`Line ${i + 2}: period must be YYYY-MM`);
    rows.push({ projectId: p.id, wbsElement: wbs || p.wbsElements[0] || '', period: v[col('period')], amount: Number(v[col('amount')]) || 0, category: (v[col('category')] || 'Expense') as 'Capital' | 'Expense', docRef: v[col('docref')] || '', importedAt: nowIso() });
    ok++;
  });
  await insertMany('actuals', rows);
  await audit({ action: 'SAP_ACTUALS_IMPORT', entity: 'Financial Actual', details: `${ok} row(s) imported, ${errors.length} rejected` });
  return { ok, errors };
}

// ───────────────────────── Resource nominations (§10) ─────────────────────────

const demandProject = (d: Rec) => projectById(d.projectId) ?? fail('Project not found');
const isTeamManager = (u: User, d: Rec) => db.teams.find((t) => t.id === d.teamId)?.managerId === u.id;

/** RCP-FR-008/009, NOT-FR-004: RTM nominates a named resource (full or partial hours). */
export async function nominate(d: Rec, resourceId: string, hours: number, note: string) {
  const u = me();
  if (!(isTeamManager(u, d) || isPmo(u))) fail("Only the team's Resource Team Manager can nominate.");
  if (!['Requested', 'Rejected', 'Gap'].includes(d.status)) fail(`Cannot nominate a ${d.status} line.`);
  if (!(hours > 0)) fail('Nominated hours must be greater than zero.');
  const p = demandProject(d);
  await patch('demands', d.id, { status: 'Nominated', nominatedResourceId: resourceId, nominatedHours: Math.min(hours, d.hours), nominatedById: u.id, nominatedAt: nowIso(), notes: note || d.notes });
  await audit({ action: 'NOMINATION', entity: 'Resource Demand', entityId: d.id, projectId: p.id, artifact: 'resourceEstimator', after: db.resources.find((r) => r.id === resourceId)?.name, details: `${hours} of ${d.hours} hrs` });
  await notify([p.pmId], { projectId: p.id, type: 'nomination', title: `Nomination ready for confirmation: ${p.name}`, body: `${u.name} nominated ${db.resources.find((r) => r.id === resourceId)?.name} (${hours} hrs) for ${d.placeholder}.`, link: link(p, 'resources') });
}

export async function markGap(d: Rec, note: string) {
  const u = me();
  if (!(isTeamManager(u, d) || isPmo(u))) fail("Only the team's Resource Team Manager can declare a capacity gap.");
  const p = demandProject(d);
  await patch('demands', d.id, { status: 'Gap', notes: note || d.notes });
  await audit({ action: 'CAPACITY_GAP', entity: 'Resource Demand', entityId: d.id, projectId: p.id, artifact: 'resourceEstimator', details: note });
  await notify([p.pmId], { projectId: p.id, type: 'nomination', title: `Capacity gap: ${d.placeholder}`, body: `${u.name} could not staff ${d.hours} hrs. ${note}`, link: link(p, 'resources') });
}

/** PM confirms; partial nominations split the line so the remainder stays open (partial fulfillment). */
export async function confirmNomination(d: Rec) {
  const u = me();
  const p = demandProject(d);
  if (!(u.id === p.pmId || isPmo(u))) fail('Only the Project Manager can confirm nominations.');
  if (d.status !== 'Nominated') fail('Line is not awaiting confirmation.');
  const remainder = Number(d.hours) - Number(d.nominatedHours || d.hours);
  await patch('demands', d.id, { status: 'Confirmed', hours: d.nominatedHours || d.hours, decidedById: u.id, decidedAt: nowIso() });
  if (remainder > 0) {
    await insert('demands', { ...pick(d, ['projectId', 'category', 'specialty', 'teamId', 'resourceType', 'expenseCategory', 'organization', 'application', 'startDate', 'endDate', 'rate']), placeholder: `${d.placeholder} (remaining)`, hours: remainder, status: 'Requested', parentDemandId: d.id });
  }
  await audit({ action: 'NOMINATION_CONFIRMED', entity: 'Resource Demand', entityId: d.id, projectId: p.id, artifact: 'resourceEstimator', details: remainder > 0 ? `Partially fulfilled; ${remainder} hrs re-requested` : 'Fully confirmed' });
  const team = db.teams.find((t) => t.id === d.teamId);
  await notify([team?.managerId], { projectId: p.id, type: 'nomination', title: `Nomination confirmed: ${p.name}`, body: `${u.name} confirmed ${d.placeholder}.`, link: '/resources?tab=nominations' });
}

export async function rejectNomination(d: Rec, reason: string) {
  const u = me();
  const p = demandProject(d);
  if (!(u.id === p.pmId || isPmo(u))) fail('Only the Project Manager can reject nominations.');
  if (!reason.trim()) fail('A reason is required.');
  await patch('demands', d.id, { status: 'Rejected', rejectionReason: reason, decidedById: u.id, decidedAt: nowIso() });
  await audit({ action: 'NOMINATION_REJECTED', entity: 'Resource Demand', entityId: d.id, projectId: p.id, artifact: 'resourceEstimator', details: reason });
  const team = db.teams.find((t) => t.id === d.teamId);
  await notify([team?.managerId], { projectId: p.id, type: 'nomination', title: `Nomination rejected: ${p.name}`, body: `${u.name}: ${reason}`, link: '/resources?tab=nominations' });
}

/** NOT-FR-005: unresolved gaps escalate to PMO and pillar leadership. */
export async function escalateDemand(d: Rec) {
  const p = demandProject(d);
  const u = me();
  if (!(u.id === p.pmId || isPmo(u) || isTeamManager(u, d))) fail('Not permitted.');
  await patch('demands', d.id, { escalated: true });
  await audit({ action: 'GAP_ESCALATED', entity: 'Resource Demand', entityId: d.id, projectId: p.id, artifact: 'resourceEstimator' });
  await notify([...usersWithRole('PMO_DIRECTOR', 'PILLAR_LEAD')], { projectId: p.id, type: 'escalation', title: `Resource gap escalated: ${p.name}`, body: `${d.placeholder} – ${d.hours} hrs unstaffed (${db.teams.find((t) => t.id === d.teamId)?.name}).`, link: link(p, 'resources') });
}

export async function cancelDemand(d: Rec) {
  const p = demandProject(d);
  if (!canEditCollection(me(), p, 'demands')) fail('Not permitted.');
  await patch('demands', d.id, { status: 'Cancelled' });
  await audit({ action: 'DEMAND_CANCELLED', entity: 'Resource Demand', entityId: d.id, projectId: p.id, artifact: 'resourceEstimator' });
}

// ───────────────────────── Capacity master data & scenarios (§10) ─────────────────────────

const canMaintainCapacity = (u: User, teamIds: string[]) =>
  isAdmin(u) || isPmo(u) || (hasRole(u, 'RTM') && teamIds.every((t) => db.teams.find((x) => x.id === t)?.managerId === u.id));

/** RCP-FR-005/006, SEC-FR-007: Resource Team Managers maintain named-resource capacity for their teams. */
export async function saveResource(id: string | null, data: Partial<Resource>, assignments: { teamId: string; weeklyHours: number; utilizationPct: number }[]) {
  const u = me();
  const existing = id ? db.assignments.filter((a) => a.resourceId === id).map((a) => a.teamId) : [];
  if (!canMaintainCapacity(u, [...existing, ...assignments.map((a) => a.teamId)])) fail('Only the Resource Team Manager of every affected team (or PMO/admin) can maintain this resource.');
  if (!data.name?.trim()) fail('Name is required.');
  if (assignments.some((a) => !(a.weeklyHours > 0 && a.weeklyHours <= 60) || a.utilizationPct < 0 || a.utilizationPct > 100)) fail('Weekly hours must be 1–60 and utilization 0–100%.');
  let resId = id;
  if (id) {
    const before = db.resources.find((r) => r.id === id)!;
    await auditChanges({ action: 'CAPACITY_CHANGE', entity: 'Resource', entityId: id }, before, data);
    await patch('resources', id, data);
  } else {
    const r = await insert<Resource>('resources', { active: true, resourceType: 'Internal', ...data });
    resId = r.id;
    await audit({ action: 'RESOURCE_CREATED', entity: 'Resource', entityId: r.id, after: data.name });
  }
  for (const a of db.assignments.filter((x) => x.resourceId === resId)) {
    const next = assignments.find((n) => n.teamId === a.teamId);
    if (!next) await remove('assignments', a.id);
    else if (next.weeklyHours !== a.weeklyHours || next.utilizationPct !== a.utilizationPct) {
      await audit({ action: 'CAPACITY_CHANGE', entity: 'Team Assignment', entityId: a.id, field: 'weeklyHours/utilization', before: `${a.weeklyHours}h @ ${a.utilizationPct}%`, after: `${next.weeklyHours}h @ ${next.utilizationPct}%` });
      await patch('assignments', a.id, next);
    }
  }
  const have = new Set(db.assignments.filter((x) => x.resourceId === resId).map((a) => a.teamId));
  await insertMany('assignments', assignments.filter((a) => !have.has(a.teamId)).map((a) => ({ ...a, resourceId: resId })));
}

export async function saveTeam(id: string | null, data: { name: string; pillar: string; managerId: string }) {
  if (!(isAdmin(me()) || isPmo(me()))) fail('Only PMO or administrators maintain teams.');
  if (!data.name.trim() || !data.managerId) fail('Team name and Resource Team Manager are required.');
  if (id) await patch('teams', id, data);
  else await insert('teams', data);
  await audit({ action: 'TEAM_SAVED', entity: 'Resource Team', entityId: id ?? undefined, after: data.name });
}

/** RCP-FR-012: save / name / compare / discard scenarios without touching the official plan. */
export async function saveScenario(id: string | null, data: Omit<Scenario, 'id' | 'createdById' | 'createdAt' | 'updatedAt'>) {
  const u = me();
  if (u.external || !(isPmo(u) || hasRole(u, 'RTM', 'PILLAR_LEAD', 'PM', 'EXEC') || isAdmin(u))) fail('Not permitted to create scenarios.');
  if (!data.name.trim()) fail('Scenario name is required.');
  if (id) await patch('scenarios', id, data);
  else await insert('scenarios', { ...data, createdById: u.id });
}

export async function deleteScenario(id: string) {
  const s = db.scenarios.find((x) => x.id === id);
  if (!s) return;
  if (s.createdById !== me().id && !isPmo(me())) fail('Only the scenario owner or PMO can discard it.');
  await remove('scenarios', id);
}

// ───────────────────────── Confidential NDA workflow (§17) ─────────────────────────

/** NDA-FR-001/002/008: PMO Director designates a BRM-submitted project as NDA, with documented rationale. */
export async function designateNda(p: Project, rationale: string, codename: string) {
  const u = me();
  if (!projectPermissions(u, p).ndaDesignate) fail('Only the PMO Director can designate an NDA project (before ACT approval).');
  if (!rationale.trim()) fail('A documented business rationale is required.');
  await patch('projects', p.id, { ndaActive: true, ndaCodename: codename || undefined, ndaRationale: rationale, ndaDesignatedById: u.id, ndaDesignatedAt: nowIso(), ndaLastReviewedAt: nowIso() });
  const initial = [...new Set([u.id, p.brmId, p.pmId, p.sponsorId].filter(Boolean) as string[])];
  await insertMany('ndaAccess', initial.map((userId) => ({ projectId: p.id, userId, designee: userId === u.id, addedById: u.id, addedAt: nowIso() })));
  await audit({ action: 'NDA_DESIGNATED', entity: 'IT Project', entityId: p.id, projectId: p.id, details: `Codename: ${codename || '—'}. Rationale: ${rationale}` });
}

/** NDA-FR-006/007: maintain the approved access list (internal, external and non-employee emails). */
export async function addNdaMember(p: Project, userId: string, designee: boolean) {
  const u = me();
  if (!projectPermissions(u, p).ndaManageAccess) fail('Only the PMO Director or an authorized designee can change the NDA access list.');
  if (ndaList(p).some((a) => a.userId === userId)) fail('Already on the access list.');
  await insert('ndaAccess', { projectId: p.id, userId, designee, addedById: u.id, addedAt: nowIso() });
  await audit({ action: 'NDA_ACCESS_ADDED', entity: 'NDA Access Entry', projectId: p.id, after: userById(userId)?.email, details: designee ? 'as designee' : undefined });
  await notify([userId], { projectId: p.id, type: 'access', title: `You were granted access to a confidential project`, body: `${u.name} added you to the approved access list for ${p.ndaCodename || p.code}.`, link: link(p) });
}

export async function removeNdaMember(p: Project, entryId: string) {
  const u = me();
  if (!projectPermissions(u, p).ndaManageAccess) fail('Not permitted.');
  const e = db.ndaAccess.find((x) => x.id === entryId);
  if (!e) return;
  if (isPmoDirector(userById(e.userId)!) && e.userId === u.id) fail('The PMO Director cannot remove themselves.');
  await remove('ndaAccess', e.id);
  await audit({ action: 'NDA_ACCESS_REMOVED', entity: 'NDA Access Entry', projectId: p.id, before: userById(e.userId)?.email });
}

/** GOV-FR-009 / EXT-FR-010: periodic access recertification. */
export async function recertifyNda(p: Project) {
  const u = me();
  if (!projectPermissions(u, p).ndaManageAccess) fail('Not permitted.');
  for (const e of ndaList(p)) await patch('ndaAccess', e.id, { lastRecertifiedAt: nowIso() });
  await patch('projects', p.id, { ndaLastReviewedAt: nowIso() });
  await audit({ action: 'NDA_ACCESS_RECERTIFIED', entity: 'IT Project', entityId: p.id, projectId: p.id, details: `${ndaList(p).length} member(s) recertified` });
}

/** NDA-FR-009/010/011: PMO Director converts after ACT approval; history preserved; selected artifacts may stay restricted. */
export async function convertNda(p: Project, rationale: string, keepRestricted: ArtifactKey[]) {
  const u = me();
  if (!projectPermissions(u, p).ndaConvert) fail('Only the PMO Director can convert an NDA project, and only after ACT approval.');
  if (!rationale.trim()) fail('A documented rationale is required for conversion.');
  await patch('projects', p.id, { ndaActive: false, ndaConverted: true, ndaConvertedById: u.id, ndaConvertedAt: nowIso(), ndaConversionRationale: rationale, restrictedArtifacts: keepRestricted });
  await audit({ action: 'NDA_CONVERTED', entity: 'IT Project', entityId: p.id, projectId: p.id, details: `${rationale}${keepRestricted.length ? ` | still restricted: ${keepRestricted.join(', ')}` : ''}` });
  await notify([p.brmId, p.pmId, p.sponsorId, ...usersWithRole('PMO_ADMIN')], { projectId: p.id, type: 'stage', title: `${p.name} converted to the regular workflow`, body: `${p.code} is now visible in standard portfolio views.`, link: link(p) });
}

export async function setRestrictedArtifacts(p: Project, keys: ArtifactKey[]) {
  if (!projectPermissions(me(), p).manageRestrictions) fail('Only the PMO Director or project owner can restrict artifacts.');
  await audit({ action: 'ARTIFACT_RESTRICTION', entity: 'IT Project', entityId: p.id, projectId: p.id, field: 'restrictedArtifacts', before: p.restrictedArtifacts, after: keys });
  await patch('projects', p.id, { restrictedArtifacts: keys });
}

// ───────────────────────── External access (§17.4) ─────────────────────────

export async function ensureProfile(email: string, name: string, external = true, title?: string): Promise<User> {
  const found = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (found) return found;
  const u = await insert<User>('users', { name, email: email.toLowerCase(), roles: external ? ['EXTERNAL'] : [], external, active: true, notifyEmail: true, notifyTeams: !external, title: title || (external ? 'External collaborator' : '') });
  await audit({ action: 'PROFILE_CREATED', entity: 'PPM User', entityId: u.id, after: email });
  return u;
}

/** EXT-FR-001..004, SEC-FR-015/016: request scoped, time-bound access; sponsor/owner then admin approve. */
export async function requestGrant(p: Project, input: { email: string; name: string; scope: 'workspace' | 'artifact'; artifactKeys: ArtifactKey[]; permission: 'View' | 'Edit'; expiresAt: string; justification: string }) {
  const u = me();
  if (!projectPermissions(u, p).requestExternalAccess) fail('You cannot request external access for this project.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) fail('A valid email address is required.');
  if (!input.name.trim()) fail('Grantee name is required.');
  if (!input.expiresAt) fail('An expiration date is required (EXT-FR-004).');
  const days = daysBetween(todayISO(), input.expiresAt);
  if (days < 1) fail('Expiration must be in the future.');
  if (days > db.config.externalAccessMaxDays) fail(`Maximum access duration is ${db.config.externalAccessMaxDays} days.`);
  if (input.scope === 'artifact' && !input.artifactKeys.length) fail('Select at least one artifact.');
  if (!input.justification.trim()) fail('Justification is required.');
  const g = await insert<AccessGrant>('accessGrants', { projectId: p.id, ...input, email: input.email.toLowerCase(), artifactKeys: input.scope === 'workspace' ? [] : input.artifactKeys, status: 'Pending Sponsor', requestedById: u.id, requestedAt: nowIso() });
  await audit({ action: 'ACCESS_REQUESTED', entity: 'External Access Grant', entityId: g.id, projectId: p.id, after: `${input.email} ${input.permission} ${input.scope}`, details: `${internalDomain(input.email) ? 'Internal' : `Non-${BRAND.company}`} email; expires ${input.expiresAt}` });
  await notify([p.sponsorId, p.pmId].filter((x) => x !== u.id), { projectId: p.id, type: 'access', title: `External access request awaiting your approval`, body: `${u.name} requested ${input.permission} access for ${input.email} on ${p.code}.`, link: '/approvals' });
  return g;
}

export const internalDomain = (email: string) => db.config.internalDomains.includes(emailDomain(email));

export async function approveGrant(g: AccessGrant) {
  const u = me();
  const p = projectById(g.projectId) ?? fail('Project not found');
  const blocker = grantApprovalBlocker(u, p, g);
  if (blocker) fail(blocker);
  if (g.status === 'Pending Sponsor') {
    await patch('accessGrants', g.id, { status: 'Pending Admin', sponsorApprovedById: u.id, sponsorApprovedAt: nowIso() });
    await audit({ action: 'ACCESS_SPONSOR_APPROVED', entity: 'External Access Grant', entityId: g.id, projectId: p.id, after: g.email });
    await notify(usersWithRole('SYS_ADMIN'), { projectId: p.id, type: 'access', title: 'External access awaiting administrator approval', body: `${g.email} – ${g.permission} on ${p.code}, expires ${g.expiresAt}.`, link: '/approvals' });
  } else {
    const profile = await ensureProfile(g.email, g.name, !internalDomain(g.email));
    await patch('accessGrants', g.id, { status: 'Active', adminApprovedById: u.id, adminApprovedAt: nowIso(), userId: profile.id });
    await audit({ action: 'ACCESS_GRANTED', entity: 'External Access Grant', entityId: g.id, projectId: p.id, after: `${g.email} ${g.permission} ${g.scope === 'workspace' ? 'workspace' : g.artifactKeys.join(', ')} until ${g.expiresAt}` });
    await notify([g.requestedById, profile.id], { projectId: p.id, type: 'access', title: `External access granted: ${p.name}`, body: `${g.email} has ${g.permission} access until ${g.expiresAt}.`, link: link(p) });
  }
}

export async function rejectGrant(g: AccessGrant, reason: string) {
  const u = me();
  const p = projectById(g.projectId) ?? fail('Project not found');
  if (grantApprovalBlocker(u, p, g)) fail('Not permitted.');
  await patch('accessGrants', g.id, { status: 'Rejected', closedById: u.id, closedAt: nowIso(), closeReason: reason });
  await audit({ action: 'ACCESS_REJECTED', entity: 'External Access Grant', entityId: g.id, projectId: p.id, after: g.email, details: reason });
  await notify([g.requestedById], { projectId: p.id, type: 'access', title: 'External access request rejected', body: `${g.email}: ${reason}`, link: link(p, 'access') });
}

/** EXT-FR-006: early revocation by owner or administrator. */
export async function revokeGrant(g: AccessGrant, reason: string) {
  const u = me();
  const p = projectById(g.projectId) ?? fail('Project not found');
  if (!(isAdmin(u) || isPmo(u) || u.id === p.pmId || u.id === p.sponsorId)) fail('Only the project owner, sponsor, PMO or an administrator can revoke access.');
  await patch('accessGrants', g.id, { status: 'Revoked', closedById: u.id, closedAt: nowIso(), closeReason: reason });
  await audit({ action: 'ACCESS_REVOKED', entity: 'External Access Grant', entityId: g.id, projectId: p.id, before: 'Active', after: 'Revoked', details: `${g.email}: ${reason}` });
}

/** EXT-FR-006: renewal goes back through the same approval chain. */
export async function renewGrant(g: AccessGrant, expiresAt: string, justification: string) {
  const p = projectById(g.projectId) ?? fail('Project not found');
  const n = await requestGrant(p, { email: g.email, name: g.name, scope: g.scope, artifactKeys: g.artifactKeys, permission: g.permission, expiresAt, justification });
  await patch('accessGrants', n.id, { renewalOfId: g.id });
}

export async function recertifyGrant(g: AccessGrant) {
  const u = me();
  if (!(isAdmin(u) || isPmo(u))) fail('Not permitted.');
  await patch('accessGrants', g.id, { lastRecertifiedAt: nowIso() });
  await audit({ action: 'ACCESS_RECERTIFIED', entity: 'External Access Grant', entityId: g.id, projectId: g.projectId, after: g.email });
}

// ───────────────────────── Reminders & expiry (NOT-FR-003/005/008, EXT-FR-005) ─────────────────────────

/**
 * Runs the scheduled checks. In production a scheduled Power Automate flow performs the same sweep server-side;
 * PMO and administrators can also run it on demand from Admin.
 */
export async function runSweep(): Promise<string[]> {
  const u = me();
  if (!(isPmo(u) || isAdmin(u))) fail('Only PMO or administrators can run reminders.');
  const log: string[] = [];
  const today = todayISO();
  const recent = (userId: string | undefined, projectId: string, type: string) =>
    db.notifications.some((n) => n.userId === userId && n.projectId === projectId && n.type === type && n.sentAt.slice(0, 10) === today);

  for (const g of db.accessGrants.filter((x) => x.status === 'Active')) {
    const p = projectById(g.projectId);
    if (g.expiresAt < today) {
      await patch('accessGrants', g.id, { status: 'Expired', closedAt: nowIso(), closeReason: 'Expired automatically' });
      await audit({ action: 'ACCESS_EXPIRED', entity: 'External Access Grant', entityId: g.id, projectId: g.projectId, after: g.email });
      if (p) await notify([p.pmId, p.sponsorId, g.requestedById], { projectId: p.id, type: 'access', title: `External access expired: ${g.email}`, body: `Access to ${p.code} was removed automatically.`, link: link(p, 'access') });
      log.push(`Expired access for ${g.email}`);
    } else if (!g.expiryWarned && daysBetween(today, g.expiresAt) <= db.config.expiryWarningDays && p) {
      await patch('accessGrants', g.id, { expiryWarned: true });
      await notify([p.pmId, p.sponsorId, g.userId], { projectId: p.id, type: 'access', title: `External access expires ${g.expiresAt}: ${g.email}`, body: `Renew through the approval workflow if access is still required.`, link: link(p, 'access') });
      log.push(`Expiry warning for ${g.email}`);
    }
  }
  for (const p of db.projects.filter((x) => x.status === 'Active')) {
    const required = db.config.statusRequiredStages.includes(p.stage);
    const last = recs('statusUpdates', p.id).map((s) => s.statusDate).sort().pop();
    if (required && (!last || last < addDays(today, -7)) && !recent(p.pmId, p.id, 'reminder')) {
      await notify([p.pmId], { projectId: p.id, type: 'reminder', title: `Weekly status overdue: ${p.name}`, body: `Last status: ${last ?? 'never'}.`, link: link(p, 'status') });
      log.push(`Status reminder → ${userById(p.pmId)?.name} (${p.code})`);
    }
    const fcLast = db.forecastEntries.filter((e) => e.projectId === p.id).map((e) => e.updatedAt || '').sort().pop();
    if (required && (!fcLast || fcLast.slice(0, 7) < today.slice(0, 7)) && !recent(p.pmId, p.id, 'forecast')) {
      await notify([p.pmId], { projectId: p.id, type: 'forecast', title: `Monthly forecast update due: ${p.name}`, body: 'Update the budget forecast for this month (FIN-FR-005).', link: link(p, 'financials') });
      log.push(`Forecast reminder → ${userById(p.pmId)?.name} (${p.code})`);
    }
    const milestones = recs('tasks', p.id).filter((t) => ['Gate', 'Milestone'].includes(t.taskType) && /go.?live|go \/ no-go|cab/i.test(t.name) && t.status !== 'Complete' && t.end >= today && t.end <= addDays(today, 14));
    if (milestones.length && !recent(usersWithRole('PMO_DIRECTOR')[0], p.id, 'milestone')) {
      await notify([...usersWithRole('PMO_DIRECTOR', 'PILLAR_LEAD')], { projectId: p.id, type: 'milestone', title: `Upcoming: ${milestones[0].name} – ${p.name}`, body: `${milestones.map((m) => `${m.name} (${m.end})`).join(', ')}`, link: link(p, 'plan') });
      log.push(`Milestone alert for ${p.code}`);
    }
    const gaps = recs('demands', p.id).filter((d) => d.status === 'Gap');
    if (gaps.length && !recent(usersWithRole('PMO_DIRECTOR')[0], p.id, 'gap')) {
      await notify([...usersWithRole('PMO_DIRECTOR', 'PILLAR_LEAD')], { projectId: p.id, type: 'gap', title: `Unresolved resource gap(s): ${p.name}`, body: `${gaps.length} demand line(s) unstaffed.`, link: link(p, 'resources') });
      log.push(`Gap alert for ${p.code}`);
    }
    if (p.ndaActive && (!p.ndaLastReviewedAt || p.ndaLastReviewedAt < addDays(today, -db.config.accessReviewIntervalDays)) && !recent(usersWithRole('PMO_DIRECTOR')[0], p.id, 'review')) {
      await notify(usersWithRole('PMO_DIRECTOR'), { projectId: p.id, type: 'review', title: `NDA access review due: ${p.ndaCodename || p.code}`, body: 'Recertify the approved access list (GOV-FR-009).', link: link(p, 'access') });
      log.push(`NDA access review due for ${p.code}`);
    }
  }
  await audit({ action: 'REMINDER_SWEEP', entity: 'System', details: `${log.length} action(s)` });
  return log;
}

// ───────────────────────── Admin ─────────────────────────

export async function saveConfig(next: typeof db.config) {
  if (!isAdmin(me()) && !isPmoDirector(me())) fail('Only administrators or the PMO Director can change configuration.');
  const row = db.settings[0];
  await audit({ action: 'CONFIG_CHANGE', entity: 'PPM Setting', details: 'Configuration updated' });
  if (row) await patch('settings', row.id, { configJson: next });
  else await insert('settings', { name: 'Default', configJson: next });
}

export async function saveUser(id: string | null, data: Partial<User>) {
  if (!isAdmin(me())) fail('Only administrators manage users and roles.');
  if (!data.name || !data.email) fail('Name and email are required.');
  if (id) {
    const before = db.users.find((u) => u.id === id)!;
    await auditChanges({ action: 'USER_CHANGE', entity: 'PPM User', entityId: id }, before, data);
    await patch('users', id, data);
  } else {
    if (db.users.some((u) => u.email.toLowerCase() === data.email!.toLowerCase())) fail(`A PPM profile already exists for ${data.email}.`);
    const u = await insert('users', { active: true, external: false, notifyEmail: true, notifyTeams: true, roles: [], ...data, email: data.email!.toLowerCase() });
    await audit({ action: 'PROFILE_CREATED', entity: 'PPM User', entityId: u.id, after: data.email });
  }
}

export async function markNotificationsRead(ids: string[]) {
  for (const id of ids) await patch('notifications', id, { read: true });
}

function pick<T extends object>(obj: T, keys: readonly string[]): Partial<T> {
  const out: any = {};
  for (const k of keys) if (k in obj) out[k] = (obj as any)[k];
  return out;
}

export { GATES, NDA_STAGES, checkLabel, gateApproved, canEditFinance };
