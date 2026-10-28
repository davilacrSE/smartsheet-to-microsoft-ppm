/**
 * End-to-end workflow checks against the in-memory backend: `npm test`.
 * Each check maps to BRD acceptance criteria (AC-xxx).
 */
import { MockBackend } from '../src/data/mock';
import { db, initStore, me, setActingUser, recs, projectByCode, searchDirectory, userName } from '../src/data/store';
import * as wf from '../src/services/workflow';
import { canSeeArtifact, canSeeProject, visibleProjects, runChecks } from '../src/services/rules';
import { REPORTS, dashboard } from '../src/services/reports';
import { capacityMatrix, utilization } from '../src/services/rcp';
import { addDays, todayISO, ym } from '../src/domain/calc';
import type { GateReview, Project } from '../src/domain/types';
import { BRAND } from '../src/brand';

const D = BRAND.emailDomain;

let passed = 0;
let failed = 0;
const ok = (cond: unknown, label: string) => {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`);
};
async function throws(fn: () => Promise<unknown>, label: string, match?: RegExp) {
  try {
    await fn();
    ok(false, `${label} (expected an error)`);
  } catch (e: any) {
    ok(!match || match.test(e.message), `${label}${match && !match.test(e.message) ? ` — got: ${e.message}` : ''}`);
  }
}
const as = (email: string) => setActingUser(db.users.find((u) => u.email === email)!.id);
const pending = (p: Project, gate: string) => db.gateReviews.find((g) => g.projectId === p.id && g.gate === gate && g.status === 'Pending') as GateReview;

async function main() {
  await initStore(new MockBackend(false));
  console.log(`Seeded ${db.projects.length} projects, ${db.users.length} users, ${db.tasks.length} plan tasks`);

  console.log('\nIntake (AC-001..003, AC-014)');
  as(`jordan.blake@${D}`);
  await throws(() => wf.createIntake({ name: 'Not allowed' }, false), 'PM cannot create intake (SEC-FR-002)', /Business Relationship/);
  as(`priya.natarajan@${D}`);
  const base = { name: 'Supplier Portal', mainObjective: 'Self-service supplier onboarding', desiredOutcome: 'Faster onboarding', estimatedCost: 250000, estimatedBenefit: 400000, benefitType: 'Productivity', roadmapAlignment: 'On FY26 IT Roadmap', businessArea: 'Cloud Solutions', businessFunction: 'Procurement', corporatePriority: 'Ops Excellence', pillar: 'Applications' };
  await throws(() => wf.createIntake({ ...base, plannedInitiateDate: addDays(todayISO(), 90), plannedExecuteDate: addDays(todayISO(), 30), plannedGoLiveDate: addDays(todayISO(), 200) }, true), 'Initiate date must precede execution (PPM-FR-003)', /before/);
  const p = await wf.createIntake({ ...base, plannedInitiateDate: addDays(todayISO(), 7), plannedExecuteDate: addDays(todayISO(), 60), plannedGoLiveDate: addDays(todayISO(), 200) }, true);
  ok(/^ITProj-\d\d-\d{3}$/.test(p.code) && p.stage === 'Draft', `Unique Project ID + Draft stage assigned (${p.code})`);
  ok(!!pending(p, 'SG0'), 'Stage Gate 0 review pending after Ready for Review');
  const dir = db.users.find((u) => u.roles.includes('PMO_DIRECTOR'))!;
  ok(db.notifications.some((n) => n.userId === dir.id && n.projectId === p.id), 'PMO Director notified (NOT-FR-001)');
  await throws(() => wf.updateIntake(p, { name: 'Changed' }), 'BRM cannot edit after submission (SEC-FR-003)');

  console.log('\nStage gates & artifacts (AC-004..007)');
  await throws(() => wf.decideGate(p, pending(p, 'SG0'), { decision: 'Approve', comments: 'ok' }), 'BRM cannot approve own gate (SEC-FR-009/010)');
  as(`elena.vasquez@${D}`);
  await wf.decideGate(p, pending(p, 'SG0'), { decision: 'Approve', comments: 'Good business case' });
  ok(p.stage === 'Initiate' && !!p.approvalDate, 'SG0 approval → Initiate with approval date recorded');
  ok(recs('tasks', p.id).length > 40 && recs('raci', p.id).length === 17 && recs('costItems', p.id).length > 20, `Artifacts initialized in Dataverse tables (${recs('tasks', p.id).length} tasks, ${recs('raci', p.id).length} RACI rows, ${recs('costItems', p.id).length} cost lines)`);
  await wf.updateRecord(p, { pmId: db.users.find((u) => u.email === `aisha.rahman@${D}`)!.id, sponsorId: db.users.find((u) => u.email === `luis.ortega@${D}`)!.id });
  as(`aisha.rahman@${D}`);
  const review = await wf.requestGate(p, 'SG1', 'Ready for planning');
  ok(review.failedChecks.length > 0, `SG1 requested by PM with ${review.failedChecks.length} open check(s)`);
  as(`elena.vasquez@${D}`);
  await throws(() => wf.decideGate(p, review, { decision: 'Approve', comments: 'x' }), 'Approve blocked while mandatory checks fail (PPM-FR-030)', /Cannot approve/);
  await throws(() => wf.decideGate(p, review, { decision: 'Approve with Exception', comments: 'x' }), 'Exception requires justification', /justification/);
  await wf.decideGate(p, review, { decision: 'Approve with Exception', comments: 'Proceed', justification: 'Estimates finalised in Plan' });
  ok(p.stage === 'Plan' && db.exceptions.some((e) => e.projectId === p.id), 'Approve with Exception → Plan, exception recorded');

  console.log('\nArtifacts, health & audit (AC-008, AC-009, AC-013)');
  as(`aisha.rahman@${D}`);
  await wf.saveRecord(p, 'statusUpdates', null, { statusDate: todayISO(), scope: 'Green', schedule: 'Yellow', resource: 'Green', budget: 'Green', executiveSummary: 'Planning underway', accomplishments: 'Kickoff', nextSteps: 'BRD' });
  ok(p.healthOverall === 'Red', 'Overall health = Red when any component is Yellow (STAT-FR-004)');
  await wf.saveRecord(p, 'statusUpdates', null, { statusDate: addDays(todayISO(), 1), scope: 'Green', schedule: 'Green', resource: 'Green', budget: 'Green', executiveSummary: 'Green', accomplishments: 'a', nextSteps: 'b' });
  ok(p.healthOverall === 'Green', 'Overall health = Green only when all components are Green');
  const risk = await wf.saveRecord(p, 'raidd', null, { type: 'Risk', title: 'Vendor delay', assigneeId: me().id, dueDate: addDays(todayISO(), 10), status: 'Open', severity: '2-High', priority: '2-High' });
  ok(risk.raiddId === 'RI-001', `RAIDD auto ID ${risk.raiddId}`);
  await wf.saveRecord(p, 'raidd', risk.id, { escalated: true });
  ok(db.notifications.some((n) => n.type === 'escalation' && n.projectId === p.id), 'Escalated RAIDD notifies leadership (RAIDD-FR-003)');
  ok(db.auditEvents.some((a) => a.projectId === p.id && a.field === 'escalated'), 'Field change audited with before/after (AUD-FR-002)');

  console.log('\nPeople picker');
  await throws(() => wf.saveRecord(p, 'raidd', null, { type: 'Issue', title: 'No owner', dueDate: addDays(todayISO(), 5), status: 'Open', severity: '3-Medium', priority: '3-Medium' }), 'RAIDD owner is a required person', /Owner/);
  const found = await searchDirectory('sanj');
  ok(found.length === 1 && found[0].name === 'Sanjay Rao' && !db.users.some((u) => u.email === found[0].email), 'Directory search finds a person with no PPM profile');
  const sanjay = await wf.ensureProfile(found[0].email, found[0].name, found[0].guest, found[0].title);
  ok(sanjay.active && !sanjay.external && sanjay.roles.length === 0 && sanjay.title === found[0].title, 'Picking a directory person creates an internal, role-less PPM profile');
  ok((await wf.ensureProfile(found[0].email.toUpperCase(), 'Duplicate')).id === sanjay.id, 'Picking the same person again reuses the profile');
  const task = recs('tasks', p.id).find((t) => t.taskType === 'Task')!;
  ok([p.pmId, p.brmId].includes(task.assigneeId) && !!userName(task.assigneeId), 'Generated plan tasks are assigned to the PM (or BRM) as a PPM user');
  await wf.saveRecord(p, 'tasks', task.id, { assigneeId: sanjay.id });
  ok(task.assigneeId === sanjay.id && db.auditEvents.some((a) => a.entityId === task.id && a.field === 'assigneeId' && a.after === sanjay.id), 'Assignee change saved and audited');
  ok(!(await searchDirectory('sanj')).some((x) => !db.users.some((u) => u.email === x.email)), 'Profiled people are no longer offered as new directory people');

  const line = recs('forecastLines', p.id)[0];
  await wf.setForecast(p, line.id, ym(todayISO()), 12000);
  await wf.setForecast(p, line.id, ym(todayISO()), 15000);
  ok(db.auditEvents.filter((a) => a.action === 'FORECAST_CHANGE' && a.projectId === p.id).length === 2, 'Forecast changes audited (FIN-FR-006)');
  await throws(() => wf.saveRecord(p, 'forecastLines', line.id, { wbsElement: 'ZB-1' }), 'WBS blocked before ACT approval (FIN-FR-002)', /ACT/);

  console.log('\nNDA confidentiality (AC-015..017)');
  const falcon = projectByCode('ITProj-26-004')!;
  as(`victoria.hale@${D}`);
  ok(!visibleProjects(me()).some((x) => x.id === falcon.id), 'NDA project hidden from executive not on access list');
  ok(!REPORTS.some((r) => r.build(me()).rows.some((row) => row.projectCode === 'ITProj-26-004')), 'NDA project absent from every standard report (RPT-FR-005/007)');
  ok(!dashboard(me()).all.some((s) => s.p.id === falcon.id), 'NDA project absent from dashboard');
  as(`elena.vasquez@${D}`);
  ok(visibleProjects(me()).some((x) => x.id === falcon.id), 'PMO Director sees the NDA project');
  const exec = db.users.find((u) => u.email === `victoria.hale@${D}`)!;
  const before = db.notifications.filter((n) => n.userId === exec.id).length;
  await (await import('../src/services/events')).notify(db.users.map((u) => u.id), { projectId: falcon.id, type: 'test', title: 't', body: 'b' });
  ok(db.notifications.filter((n) => n.userId === exec.id).length === before, 'Notifications suppressed for users off the access list (NOT-FR-007)');
  await throws(() => wf.convertNda(falcon, 'deal closed', []), 'Conversion only after ACT approval', /ACT/);
  as(`morgan.reyes@${D}`);
  await throws(() => wf.designateNda(p, 'x', ''), 'Only PMO Director can designate NDA (SEC-FR-011)');

  console.log('\nExternal access (AC-018)');
  const ext = db.users.find((u) => u.email === 'dana.whitfield@fabrikam-consulting.example')!;
  const extVisible = db.projects.filter((x) => canSeeProject(ext, x)).map((x) => x.code).sort();
  ok(extVisible.join() === 'ITProj-26-001,ITProj-26-008', `External user sees only granted projects (${extVisible.join(', ')})`);
  const p1 = projectByCode('ITProj-26-001')!;
  ok(canSeeArtifact(ext, p1, 'uatPlan') && !canSeeArtifact(ext, p1, 'budget'), 'Artifact-level scope enforced (ART-FR-005/006)');
  as(`aisha.rahman@${D}`);
  await throws(() => wf.requestGrant(p, { email: 'x@vendor.example', name: 'X', scope: 'workspace', artifactKeys: [], permission: 'View', expiresAt: '', justification: 'j' }), 'Expiration date required (EXT-FR-004)', /expiration/i);
  const g = await wf.requestGrant(p, { email: 'lee@vendor.example', name: 'Lee Vendor', scope: 'artifact', artifactKeys: ['brd'], permission: 'View', expiresAt: addDays(todayISO(), 30), justification: 'Requirements review' });
  await throws(() => wf.approveGrant(g), 'Requester cannot self-approve', /Segregation|sponsor/i);
  as(`luis.ortega@${D}`);
  await wf.approveGrant(g);
  as(`tom.becker@${D}`);
  await wf.approveGrant(g);
  const lee = db.users.find((u) => u.email === 'lee@vendor.example')!;
  ok(g.status === 'Active' && lee?.external && canSeeProject(lee, p) && canSeeArtifact(lee, p, 'brd') && !canSeeArtifact(lee, p, 'plan'), 'Sponsor + admin approval → scoped, active external access');
  g.expiresAt = addDays(todayISO(), -1);
  await wf.runSweep();
  ok(g.status === 'Expired' && !canSeeProject(lee, p), 'Access expires automatically (EXT-FR-005)');

  console.log('\nTransitions, capacity & reporting (AC-010..012)');
  as(`elena.vasquez@${D}`);
  const iga = projectByCode('ITProj-26-010')!;
  ok(runChecks('START_EXECUTE', iga).some((c) => !c.ok), 'Execute blocked without WBS element');
  await wf.transition(iga, 'START_EXECUTE', 'WBS requested from Finance; proceed with internal labor only');
  ok(iga.stage === 'Execute', 'PMO Director exception allows Start Execution');
  const cap = capacityMatrix(me(), { from: ym(todayISO()), months: 6, includeProposed: true });
  ok(cap.teams.length === 9 && cap.teams.every((t) => Object.values(t.capacity).every((v) => v > 0)), 'Monthly team capacity calculated (RCP-FR-007)');
  ok(cap.teams.some((t) => cap.months.some((m) => utilization(t, m) > 0)), 'Demand distributed across months');
  const d = recs('demands', projectByCode('ITProj-26-002')!.id).find((x) => x.status === 'Requested')!;
  as(`marcus.webb@${D}`);
  const teamMgr = db.teams.find((t) => t.id === d.teamId)!.managerId;
  setActingUser(teamMgr);
  const resId = db.assignments.find((a) => a.teamId === d.teamId)!.resourceId;
  await wf.nominate(d, resId, Math.round(d.hours / 2), 'half now');
  as(`aisha.rahman@${D}`);
  await wf.confirmNomination(d);
  ok(d.status === 'Confirmed' && recs('demands', d.projectId).some((x) => x.parentDemandId === d.id && x.status === 'Requested'), 'Partial nomination confirmed; remainder re-requested (RCP-FR-008)');
  for (const persona of [`victoria.hale@${D}`, `tom.becker@${D}`, 'dana.whitfield@fabrikam-consulting.example', `elena.vasquez@${D}`]) {
    as(persona);
    try {
      REPORTS.filter((r) => !r.visible || r.visible(me())).forEach((r) => r.build(me()));
      dashboard(me());
      ok(true, `Dashboard + reports render for ${me().name}`);
    } catch (e: any) {
      ok(false, `Reports for ${persona}: ${e.message}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
