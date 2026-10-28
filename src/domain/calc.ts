import type { Health, Rec } from './types';

/**
 * STAT-FR-004 / AC-009: Overall Health is Red if ANY component is Red or Yellow;
 * Green only when all components are Green.
 */
export function overallHealth(parts: { scope?: Health; schedule?: Health; resource?: Health; budget?: Health }): Health {
  const vals = [parts.scope, parts.schedule, parts.resource, parts.budget];
  return vals.every((v) => v === 'Green') ? 'Green' : 'Red';
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonthsISO(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);
}

export const ym = (iso: string) => iso.slice(0, 7);

export function monthRange(fromYm: string, count: number): string[] {
  const [y, m] = fromYm.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function monthLabel(ymStr: string): string {
  const [y, m] = ymStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) + ' ' + String(y).slice(2);
}

/** Mon–Fri count in a month, unless overridden by admin config (e.g. to account for holidays). */
export function workdaysInMonth(ymStr: string, overrides: Record<string, number> = {}): number {
  if (overrides[ymStr] != null) return overrides[ymStr];
  const [y, m] = ymStr.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= days; d++) {
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

function workdaysBetween(startIso: string, endIso: string): number {
  let n = 0;
  const d = new Date(startIso + 'T00:00:00Z');
  const end = new Date(endIso + 'T00:00:00Z');
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/**
 * RCP-FR-007: monthly capacity = (weekly hours / 5) × applicable workdays × utilization %.
 */
export function monthlyCapacity(weeklyHours: number, utilizationPct: number, workdays: number): number {
  return (weeklyHours / 5) * workdays * (utilizationPct / 100);
}

/** Spread demand hours across months proportionally to workdays in the [start, end] window. */
export function distributeHours(hours: number, start: string, end: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!start || !end || end < start || !hours) return out;
  const total = workdaysBetween(start, end) || 1;
  let cursor = start;
  while (cursor <= end) {
    const m = ym(cursor);
    const [y, mm] = m.split('-').map(Number);
    const monthEnd = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
    const segEnd = monthEnd < end ? monthEnd : end;
    const wd = workdaysBetween(cursor, segEnd);
    out[m] = (out[m] || 0) + (hours * wd) / total;
    cursor = addDays(monthEnd, 1);
  }
  return out;
}

/** Fraction of a month (by workdays) during which a resource is active. */
export function activeFraction(ymStr: string, startDate?: string, endDate?: string): number {
  const [y, m] = ymStr.split('-').map(Number);
  const first = `${ymStr}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const s = startDate && startDate > first ? startDate : first;
  const e = endDate && endDate < last ? endDate : last;
  if (e < s) return 0;
  const total = workdaysBetween(first, last) || 1;
  return workdaysBetween(s, e) / total;
}

export interface TreeRow<T> {
  rec: T;
  depth: number;
  wbs: string;
  hasChildren: boolean;
}

/** BRD-FR-001 / PLAN-FR-001: hierarchical ordering with auto-numbered IDs preserving hierarchy. */
export function buildTree<T extends Rec>(rows: T[]): TreeRow<T>[] {
  const byParent = new Map<string, T[]>();
  const ids = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    const p = r.parentId && ids.has(r.parentId) ? r.parentId : '';
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(r);
  }
  for (const list of byParent.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
  const out: TreeRow<T>[] = [];
  const walk = (pid: string, prefix: string, depth: number) => {
    (byParent.get(pid) || []).forEach((r, i) => {
      const wbs = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      out.push({ rec: r, depth, wbs, hasChildren: (byParent.get(r.id) || []).length > 0 });
      walk(r.id, wbs, depth + 1);
    });
  };
  walk('', '', 0);
  return out;
}

export function fmtMoney(n: number | undefined | null, compact = false): string {
  if (n == null || isNaN(n)) return '—';
  if (compact) {
    const a = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
    if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
    return `${sign}$${Math.round(a)}`;
  }
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function fmtNum(n: number | undefined | null, digits = 0): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: iso.length === 10 ? 'UTC' : undefined });
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function emailDomain(email: string): string {
  return (email.split('@')[1] || '').toLowerCase();
}

export function slugSafe(name: string, max = 60): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .replace(/[. ]+$/, '');
}
