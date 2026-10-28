import type { GateKey, Project, User } from '../domain/types';
import { ARTIFACTS, STAGES, gateDef } from '../domain/constants';
import { OPEN_DEFECT_STATUSES } from '../domain/schemas';
import { addDays, daysBetween, fmtDate, monthLabel, todayISO, ym } from '../domain/calc';
import { db, recs, userName } from '../data/store';
import { canSeeProject, freshness, isAdmin, isPmo, lastStatusDate, onNdaList, pendingReview, projectActualTotal, projectBudget, projectForecastTotal, runChecks, visibleProjects } from './rules';
import { capacityMatrix, utilization } from './rcp';

/** Next governance step per stage — drives the stage-gate readiness report. */
export const NEXT_STEP: Partial<Record<Project['stage'], string>> = {
  Draft: 'SG0',
  Initiate: 'SG1',
  Plan: 'SG2',
  'ACT Readiness': 'SG3',
  'ACT Approved / Execute Ready': 'START_EXECUTE',
  Execute: 'GNG',
  'Go-Live / Hypercare': 'CLOSE',
};

export function goLiveDate(p: Project) {
  const m = recs('tasks', p.id).find((t) => /^go-live/i.test(t.name) && t.taskType !== 'Phase');
  return p.actualGoLiveDate || m?.end || p.plannedGoLiveDate;
}

export function summarize(p: Project) {
  const budget = projectBudget(p);
  const forecast = projectForecastTotal(p.id);
  const actual = projectActualTotal(p.id);
  const raidd = recs('raidd', p.id).filter((r) => ['Open', 'In Progress'].includes(r.status));
  const demands = recs('demands', p.id);
  const fr = freshness(p);
  return {
    p,
    pm: userName(p.pmId),
    brm: userName(p.brmId),
    sponsor: userName(p.sponsorId),
    budget,
    forecast,
    actual,
    variancePct: budget ? ((forecast - budget) / budget) * 100 : null,
    lastStatus: lastStatusDate(p.id),
    freshness: fr,
    overdueUpdates: Object.entries(fr).filter(([, v]) => v.state === 'overdue').map(([k]) => k),
    openRisks: raidd.filter((r) => r.type === 'Risk').length,
    openIssues: raidd.filter((r) => r.type === 'Issue').length,
    execRaidd: raidd.filter((r) => r.execReporting || r.escalated),
    pendingGate: pendingReview(p.id),
    goLive: goLiveDate(p),
    gaps: demands.filter((d) => d.status === 'Gap').length,
    pendingNominations: demands.filter((d) => ['Requested', 'Nominated'].includes(d.status)).length,
  };
}
export type Summary = ReturnType<typeof summarize>;

export const portfolio = (u: User, includeArchived = false) => visibleProjects(u).filter((p) => includeArchived || p.stage !== 'Archive').map(summarize);

export function dashboard(u: User) {
  const all = portfolio(u);
  const active = all.filter((s) => s.p.status === 'Active' || s.p.status === 'On Hold');
  const inFlight = active.filter((s) => !['Draft', 'Close'].includes(s.p.stage));
  const today = todayISO();
  const cap = capacityMatrix(u, { from: ym(today), months: 6, includeProposed: true });
  const overTeams = cap.teams.filter((t) => cap.months.some((m) => utilization(t, m) > 1));
  // Like-for-like: budget variance only for funded (ACT-approved) projects; pre-ACT forecasts are reported separately.
  const funded = inFlight.filter((s) => s.budget > 0);
  return {
    all,
    kpis: {
      active: active.length,
      intake: active.filter((s) => s.p.stage === 'Draft' && s.p.readyForReview).length,
      pendingGates: db.gateReviews.filter((g) => g.status === 'Pending' && all.some((s) => s.p.id === g.projectId)).length,
      red: inFlight.filter((s) => s.p.healthOverall === 'Red').length,
      budget: funded.reduce((a, s) => a + s.budget, 0),
      forecast: funded.reduce((a, s) => a + s.forecast, 0),
      actual: funded.reduce((a, s) => a + s.actual, 0),
      preActForecast: inFlight.filter((s) => !s.budget).reduce((a, s) => a + s.forecast, 0),
      gaps: inFlight.reduce((a, s) => a + s.gaps, 0),
      overdue: inFlight.filter((s) => s.freshness.status.state === 'overdue').length,
      overTeams: overTeams.length,
    },
    byStage: STAGES.filter((st) => st !== 'Archive').map((st) => ({ stage: st, count: active.filter((s) => s.p.stage === st).length })),
    health: (['Green', 'Red'] as const).map((h) => ({ health: h, count: inFlight.filter((s) => s.p.healthOverall === h).length })).concat([{ health: 'Not reported' as any, count: inFlight.filter((s) => !s.p.healthOverall).length }]),
    byBusiness: db.config.masterData.businessAreas.map((b) => {
      const list = funded.filter((s) => s.p.businessArea === b);
      return { business: b, budget: list.reduce((a, s) => a + s.budget, 0), forecast: list.reduce((a, s) => a + s.forecast, 0), actual: list.reduce((a, s) => a + s.actual, 0), count: list.length };
    }).filter((x) => x.count),
    upcomingGoLives: inFlight.filter((s) => s.goLive && s.goLive >= today && s.goLive <= addDays(today, 90)).sort((a, b) => a.goLive.localeCompare(b.goLive)),
    overdue: inFlight.filter((s) => s.overdueUpdates.length),
    execRaidd: inFlight.flatMap((s) => s.execRaidd.map((r) => ({ s, r }))),
    capacity: cap,
  };
}

// ───────────────────────── Reports (RPT-FR-002) ─────────────────────────

type Cell = string | number | null | undefined;
export interface ReportResult {
  columns: string[];
  rows: { cells: Cell[]; projectCode?: string }[];
  note?: string;
}
export interface ReportDef {
  key: string;
  title: string;
  description: string;
  visible?: (u: User) => boolean;
  build: (u: User) => ReportResult;
}

const money = (n: number | null | undefined) => (n == null ? '' : Math.round(n));
const pct = (n: number | null) => (n == null ? '' : `${n.toFixed(1)}%`);

export const REPORTS: ReportDef[] = [
  {
    key: 'portfolio',
    title: 'Portfolio by business, function, pillar & stage',
    description: 'All visible projects with their classification, stage, status and health.',
    build: (u) => ({
      columns: ['Project ID', 'Project', 'Business', 'Function', 'Pillar', 'Program', 'Stage', 'Status', 'Overall Health', 'PM', 'BRM', 'Go-Live', 'Agile', 'ITGC'],
      rows: portfolio(u, true).map((s) => ({ projectCode: s.p.code, cells: [s.p.code, s.p.name, s.p.businessArea, s.p.businessFunction, s.p.pillar, s.p.program, s.p.stage, s.p.status, s.p.healthOverall, s.pm, s.brm, s.goLive, s.p.agile ? 'Yes' : 'No', s.p.itgc ? 'Yes' : 'No'] })),
    }),
  },
  {
    key: 'budget',
    title: 'Budget, forecast & SAP actuals',
    description: 'Approved budget vs. PPM forecast vs. SAP actuals with variance (FIN-FR-005).',
    build: (u) => ({
      columns: ['Project ID', 'Project', 'Stage', 'ACT #', 'WBS', 'Approved Budget', 'Forecast', 'SAP Actuals', 'Forecast Variance', 'Budget Health'],
      rows: portfolio(u).filter((s) => s.p.stage !== 'Draft').map((s) => ({ projectCode: s.p.code, cells: [s.p.code, s.p.name, s.p.stage, s.p.actNumber, s.p.wbsElements.join(', '), money(s.budget), money(s.forecast), money(s.actual), pct(s.variancePct), s.p.healthBudget] })),
      note: 'SAP is the system of record for actuals; forecasts are maintained in PPM.',
    }),
  },
  {
    key: 'capacity',
    title: 'Resource capacity (next 6 months)',
    description: 'Team capacity vs. confirmed + pending demand, including proposed projects.',
    build: (u) => {
      const cap = capacityMatrix(u, { from: ym(todayISO()), months: 6, includeProposed: true });
      return {
        columns: ['Team', 'Pillar', ...cap.months.map((m) => `${monthLabel(m)} util.`)],
        rows: cap.teams.map((t) => ({ cells: [t.name, t.pillar, ...cap.months.map((m) => (t.capacity[m] ? `${Math.round(utilization(t, m) * 100)}%` : '—'))] })),
      };
    },
  },
  {
    key: 'nominations',
    title: 'Resource nominations, confirmations & gaps',
    description: 'Every demand line with nomination status (RCP-FR-009).',
    build: (u) => ({
      columns: ['Project ID', 'Project', 'Role / Placeholder', 'Team', 'Hours', 'Start', 'End', 'Status', 'Named Resource', 'Escalated'],
      rows: db.demands.filter((d) => { const p = db.projects.find((x) => x.id === d.projectId); return p && canSeeProject(u, p) && p.stage !== 'Archive'; }).map((d) => {
        const p = db.projects.find((x) => x.id === d.projectId)!;
        return { projectCode: p.code, cells: [p.code, p.name, d.placeholder, db.teams.find((t) => t.id === d.teamId)?.name, d.hours, d.startDate, d.endDate, d.status, db.resources.find((r) => r.id === d.nominatedResourceId)?.name, d.escalated ? 'Yes' : ''] };
      }),
    }),
  },
  {
    key: 'raidd',
    title: 'Risks & issues',
    description: 'Open RAIDD items; executive-flagged and escalated items first (RAIDD-FR-003).',
    build: (u) => ({
      columns: ['Project ID', 'Project', 'ID', 'Type', 'Title', 'Severity', 'Owner', 'Due', 'Exec', 'Escalated', 'Ask to Leadership'],
      rows: portfolio(u).flatMap((s) => recs('raidd', s.p.id).filter((r) => ['Open', 'In Progress'].includes(r.status)).map((r) => ({ projectCode: s.p.code, sort: (r.escalated ? 0 : 1) + (r.execReporting ? 0 : 1), cells: [s.p.code, s.p.name, r.raiddId, r.type, r.title, r.severity, userName(r.assigneeId), r.dueDate, r.execReporting ? 'Yes' : '', r.escalated ? 'Yes' : '', r.askToLeadership] }))).sort((a, b) => a.sort - b.sort),
    }),
  },
  {
    key: 'golives',
    title: 'Upcoming go-lives & governance milestones',
    description: 'Go-live, Go/No-Go and CAB milestones in the next 90 days.',
    build: (u) => {
      const today = todayISO();
      return {
        columns: ['Project ID', 'Project', 'Milestone', 'Date', 'Days Out', 'Stage', 'Overall Health'],
        rows: portfolio(u).flatMap((s) => recs('tasks', s.p.id).filter((t) => ['Milestone', 'Gate'].includes(t.taskType) && /go.?live|no-go|cab/i.test(t.name) && t.status !== 'Complete' && t.end >= today && t.end <= addDays(today, 90)).map((t) => ({ projectCode: s.p.code, cells: [s.p.code, s.p.name, t.name, t.end, daysBetween(today, t.end), s.p.stage, s.p.healthOverall] }))).sort((a, b) => String(a.cells[3]).localeCompare(String(b.cells[3]))),
      };
    },
  },
  {
    key: 'freshness',
    title: 'Overdue updates & data freshness',
    description: 'Weekly (plan, RAIDD, status) and monthly (resources, forecast) cadence (DATA-FR-004).',
    build: (u) => ({
      columns: ['Project ID', 'Project', 'PM', 'Status', 'Plan', 'RAIDD', 'Resources', 'Forecast', 'Last Status'],
      rows: portfolio(u).filter((s) => s.freshness.status.state !== 'n/a').map((s) => ({ projectCode: s.p.code, cells: [s.p.code, s.p.name, s.pm, s.freshness.status.state, s.freshness.plan.state, s.freshness.raidd.state, s.freshness.resources.state, s.freshness.forecast.state, s.lastStatus] })),
    }),
  },
  {
    key: 'gates',
    title: 'Stage-gate readiness',
    description: 'Next gate per project and how many mandatory checks are complete (ART-FR-004).',
    build: (u) => ({
      columns: ['Project ID', 'Project', 'Stage', 'Next Step', 'Checks Complete', 'Open Items', 'Review Pending'],
      rows: portfolio(u).filter((s) => NEXT_STEP[s.p.stage] && s.p.status === 'Active').map((s) => {
        const key = NEXT_STEP[s.p.stage]!;
        const checks = runChecks(key, s.p);
        const label = ['SG0', 'SG1', 'SG2', 'SG3', 'GNG'].includes(key) ? gateDef(key as GateKey).name : key.replace('_', ' ').toLowerCase();
        return { projectCode: s.p.code, cells: [s.p.code, s.p.name, s.p.stage, label, `${checks.filter((c) => c.ok).length}/${checks.length}`, checks.filter((c) => !c.ok).map((c) => c.label).join('; '), s.pendingGate ? gateDef(s.pendingGate.gate).name : ''] };
      }),
    }),
  },
  {
    key: 'exceptions',
    title: 'Governance exceptions',
    description: 'Documented, approved exceptions (PPM-CN-005).',
    build: (u) => ({
      columns: ['Project ID', 'Project', 'Gate / Transition', 'Excepted Items', 'Justification', 'Approved By', 'Approved On'],
      rows: db.exceptions.map((e) => ({ e, p: db.projects.find((x) => x.id === e.projectId) })).filter((x) => x.p && canSeeProject(u, x.p)).map(({ e, p }) => ({ projectCode: p!.code, cells: [p!.code, p!.name, e.context, e.items.join(', '), e.justification, userName(e.approvedById), fmtDate(e.approvedAt)] })),
    }),
  },
  {
    key: 'health',
    title: 'Project health',
    description: 'Scope, schedule, resource and budget health with calculated overall health (STAT-FR-004).',
    build: (u) => ({
      columns: ['Project ID', 'Project', 'Stage', 'Scope', 'Schedule', 'Resource', 'Budget', 'Overall', 'As Of'],
      rows: portfolio(u).filter((s) => s.p.healthOverall).map((s) => ({ projectCode: s.p.code, cells: [s.p.code, s.p.name, s.p.stage, s.p.healthScope, s.p.healthSchedule, s.p.healthResource, s.p.healthBudget, s.p.healthOverall, s.p.healthAsOf] })),
    }),
  },
  {
    key: 'externalAccess',
    title: 'External access',
    description: 'Active and pending external access by project, artifact, user, email domain and expiry (EXT-FR-009).',
    visible: (u) => isAdmin(u) || isPmo(u),
    build: (u) => ({
      columns: ['Project ID', 'Grantee', 'Email', 'Domain', 'Scope', 'Artifacts', 'Permission', 'Status', 'Expires', 'Requested By', 'Last Recertified'],
      rows: db.accessGrants.map((g) => ({ g, p: db.projects.find((x) => x.id === g.projectId) })).filter((x) => x.p && canSeeProject(u, x.p)).map(({ g, p }) => ({ projectCode: p!.code, cells: [p!.code, g.name, g.email, g.email.split('@')[1], g.scope, g.scope === 'workspace' ? 'All' : g.artifactKeys.map((k) => ARTIFACTS.find((a) => a.key === k)?.title).join(', '), g.permission, g.status, g.expiresAt, userName(g.requestedById), fmtDate(g.lastRecertifiedAt)] })),
    }),
  },
  {
    key: 'nda',
    title: 'Confidential NDA projects',
    description: 'Restricted reporting for users on an NDA approved access list only (RPT-FR-006).',
    visible: (u) => db.projects.some((p) => p.ndaActive && onNdaList(u, p)),
    build: (u) => ({
      columns: ['Project ID', 'Codename', 'Project', 'Stage', 'Access List Size', 'Designated', 'Last Access Review'],
      rows: db.projects.filter((p) => p.ndaActive && onNdaList(u, p)).map((p) => ({ projectCode: p.code, cells: [p.code, p.ndaCodename, p.name, p.stage, db.ndaAccess.filter((a) => a.projectId === p.id).length, fmtDate(p.ndaDesignatedAt), fmtDate(p.ndaLastReviewedAt)] })),
      note: 'Only you and other approved access-list members can see this report.',
    }),
  },
];

export function toCsv(r: ReportResult) {
  const esc = (v: Cell) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [r.columns.map(esc).join(','), ...r.rows.map((row) => row.cells.map(esc).join(','))].join('\r\n');
}

export function downloadText(name: string, text: string, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const openDefects = (projectId: string) => recs('uatDefects', projectId).filter((d) => OPEN_DEFECT_STATUSES.includes(d.status)).length;
