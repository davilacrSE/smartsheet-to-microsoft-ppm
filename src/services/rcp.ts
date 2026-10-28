import type { Project, Scenario, User } from '../domain/types';
import { COMMITTED_STAGES, PROPOSED_STAGES } from '../domain/constants';
import { activeFraction, addMonthsISO, distributeHours, monthRange, monthlyCapacity, workdaysInMonth } from '../domain/calc';
import { db } from '../data/store';
import { canSeeProject } from './rules';

export interface TeamRow {
  id: string;
  name: string;
  pillar: string;
  managerId: string;
  capacity: Record<string, number>;
  confirmed: Record<string, number>;
  pending: Record<string, number>;
  gap: Record<string, number>;
  demand: Record<string, number>;
}

export interface CapacityOptions {
  from: string;
  months: number;
  includeProposed: boolean;
  pillar?: string;
  scenario?: Pick<Scenario, 'shifts' | 'capacityAdjust' | 'excluded' | 'includeProposed'>;
}

const shiftDate = (iso: string, months: number) => (months ? addMonthsISO(iso, months) : iso);

function inScope(p: Project, includeProposed: boolean) {
  if (!['Active', 'On Hold'].includes(p.status)) return false;
  if (COMMITTED_STAGES.includes(p.stage)) return true;
  return includeProposed && PROPOSED_STAGES.includes(p.stage) && (p.stage !== 'Draft' || p.readyForReview);
}

/**
 * RCP-FR-005/007: team capacity (weekly hours / 5 × workdays × utilization %, prorated for active window)
 * versus demand, split into confirmed / pending / gap. NDA projects the viewer cannot see are excluded.
 */
export function capacityMatrix(u: User, opts: CapacityOptions) {
  const months = monthRange(opts.from, opts.months);
  const sc = opts.scenario;
  const includeProposed = sc ? sc.includeProposed : opts.includeProposed;
  const teams: TeamRow[] = db.teams
    .filter((t) => !opts.pillar || t.pillar === opts.pillar)
    .map((t) => ({ ...t, capacity: {}, confirmed: {}, pending: {}, gap: {}, demand: {} }));
  const byId = new Map(teams.map((t) => [t.id, t]));
  for (const a of db.assignments) {
    const t = byId.get(a.teamId);
    const r = db.resources.find((x) => x.id === a.resourceId);
    if (!t || !r || !r.active) continue;
    const adj = 1 + (sc?.capacityAdjust?.[t.id] || 0) / 100;
    for (const m of months) {
      t.capacity[m] = (t.capacity[m] || 0) + monthlyCapacity(a.weeklyHours, a.utilizationPct, workdaysInMonth(m, db.config.workdaysOverride)) * activeFraction(m, r.startDate, r.endDate) * adj;
    }
  }
  const projects = db.projects.filter((p) => canSeeProject(u, p) && inScope(p, includeProposed) && !sc?.excluded?.includes(p.id));
  const ids = new Set(projects.map((p) => p.id));
  for (const d of db.demands) {
    if (!ids.has(d.projectId) || d.status === 'Cancelled') continue;
    const t = byId.get(d.teamId);
    if (!t) continue;
    const shift = sc?.shifts?.[d.projectId] || 0;
    const dist = distributeHours(Number(d.hours) || 0, shiftDate(d.startDate, shift), shiftDate(d.endDate, shift));
    const bucket = d.status === 'Confirmed' ? t.confirmed : d.status === 'Gap' ? t.gap : t.pending;
    for (const m of months) {
      if (!dist[m]) continue;
      bucket[m] = (bucket[m] || 0) + dist[m];
      t.demand[m] = (t.demand[m] || 0) + dist[m];
    }
  }
  return { months, teams, projects };
}

export const utilization = (t: TeamRow, m: string) => (t.capacity[m] ? (t.demand[m] || 0) / t.capacity[m] : t.demand[m] ? Infinity : 0);

/** RCP-FR-005: named-resource utilization from confirmed/nominated assignments. */
export function resourceUtilization(u: User, from: string, months: number) {
  const ms = monthRange(from, months);
  const visible = new Set(db.projects.filter((p) => canSeeProject(u, p)).map((p) => p.id));
  return db.resources.map((r) => {
    const cap: Record<string, number> = {};
    const load: Record<string, number> = {};
    for (const a of db.assignments.filter((x) => x.resourceId === r.id)) {
      for (const m of ms) cap[m] = (cap[m] || 0) + (r.active ? monthlyCapacity(a.weeklyHours, a.utilizationPct, workdaysInMonth(m, db.config.workdaysOverride)) * activeFraction(m, r.startDate, r.endDate) : 0);
    }
    for (const d of db.demands.filter((x) => x.nominatedResourceId === r.id && ['Confirmed', 'Nominated'].includes(x.status) && visible.has(x.projectId))) {
      const dist = distributeHours(Number(d.nominatedHours || d.hours) || 0, d.startDate, d.endDate);
      for (const m of ms) load[m] = (load[m] || 0) + (dist[m] || 0);
    }
    return { resource: r, months: ms, cap, load, teams: db.assignments.filter((a) => a.resourceId === r.id).map((a) => db.teams.find((t) => t.id === a.teamId)?.name ?? '') };
  });
}

/** RCP-FR-011/012: compare a saved scenario with the official plan (committed projects, no adjustments). */
export function compareScenario(u: User, s: Scenario, from: string, months: number) {
  const baseline = capacityMatrix(u, { from, months, includeProposed: false });
  const scenario = capacityMatrix(u, { from, months, includeProposed: s.includeProposed, scenario: s });
  return { baseline, scenario };
}
